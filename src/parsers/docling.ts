import { FileSystemAdapter, TFile } from "obsidian";
import { execFile } from "child_process";
import { promises as fs } from "fs";
import * as os from "os";
import * as path from "path";
import type { Parser, ParseResult } from "./types";
import type { PluginSettings } from "../settings";

/**
 * docling backend. Shells out to the local `docling` CLI.
 * Desktop-only; requires `pip install docling`.
 *
 * Unlike markitdown, docling writes its output to a directory (`--output <dir>`)
 * as `<basename>.md` rather than to stdout, so we run it against a temp dir and
 * read the generated file back. Does not extract image attachments.
 */
export class DoclingParser implements Parser {
	id = "docling" as const;
	label = "docling";

	async parse(file: TFile, settings: PluginSettings): Promise<ParseResult> {
		const adapter = file.vault.adapter;
		if (!(adapter instanceof FileSystemAdapter)) {
			throw new Error(
				"docling 仅支持桌面端 / desktop only (no filesystem access)"
			);
		}
		const fullPath = adapter.getFullPath(file.path);
		const command = settings.doclingCommand.trim() || "docling";

		const markdown = await runDocling(command, fullPath);
		if (!markdown.trim()) {
			throw new Error("docling 返回空内容 / returned empty output");
		}
		return { markdown, images: [] };
	}
}

/**
 * Run `docling <file> --to md --output <tempDir>`, then read the produced
 * `<basename>.md` from the temp dir. Cleans up the temp dir afterwards.
 */
async function runDocling(command: string, filePath: string): Promise<string> {
	const outDir = await fs.mkdtemp(path.join(os.tmpdir(), "docling-"));
	try {
		await execFileAsync(command, [filePath, "--to", "md", "--output", outDir]);
		// docling writes <basename>.md into the output directory.
		const entries = await fs.readdir(outDir);
		const mdName =
			entries.find(
				(n) =>
					n.toLowerCase() ===
					path.basename(filePath, path.extname(filePath)).toLowerCase() + ".md"
			) ?? entries.find((n) => n.toLowerCase().endsWith(".md"));
		if (!mdName) {
			throw new Error("docling 未生成 Markdown 文件 / no markdown produced");
		}
		return await fs.readFile(path.join(outDir, mdName), "utf-8");
	} finally {
		await fs.rm(outDir, { recursive: true, force: true }).catch(() => {});
	}
}

/** Promise wrapper around execFile with a generous buffer and UTF-8 env. */
function execFileAsync(command: string, args: string[]): Promise<void> {
	return new Promise((resolve, reject) => {
		execFile(
			command,
			args,
			{
				maxBuffer: 64 * 1024 * 1024,
				windowsHide: true,
				// Force Python to emit UTF-8 (docling is a Python tool); avoids the
				// GBK/cp936 mojibake markitdown hit on Chinese Windows consoles.
				env: { ...process.env, PYTHONUTF8: "1", PYTHONIOENCODING: "utf-8" },
			},
			(err, _stdout, stderr) => {
				if (err) {
					const hint =
						(err as NodeJS.ErrnoException).code === "ENOENT"
							? `找不到命令 "${command}"。请先安装：pip install docling`
							: stderr || err.message;
					reject(new Error(hint));
					return;
				}
				resolve();
			}
		);
	});
}

/** Check whether the docling CLI is available. Returns version text or null. */
export function checkDocling(command: string): Promise<string | null> {
	return new Promise((resolve) => {
		execFile(
			command.trim() || "docling",
			["--version"],
			{ windowsHide: true, timeout: 10000 },
			(err, stdout) => {
				resolve(err ? null : stdout.trim() || "ok");
			}
		);
	});
}
