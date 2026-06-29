import { FileSystemAdapter, TFile } from "obsidian";
import { execFile } from "child_process";
import type { Parser, ParseResult } from "./types";
import type { PluginSettings } from "../settings";

/**
 * markitdown backend. Shells out to the local `markitdown` CLI.
 * Desktop-only; requires `pip install 'markitdown[all]'`.
 * Does not extract image attachments.
 */
export class MarkitdownParser implements Parser {
	id = "markitdown" as const;
	label = "markitdown";

	async parse(file: TFile, settings: PluginSettings): Promise<ParseResult> {
		const adapter = file.vault.adapter;
		if (!(adapter instanceof FileSystemAdapter)) {
			throw new Error(
				"markitdown 仅支持桌面端 / desktop only (no filesystem access)"
			);
		}
		const fullPath = adapter.getFullPath(file.path);
		const command = settings.markitdownCommand.trim() || "markitdown";

		const markdown = await runMarkitdown(command, fullPath);
		if (!markdown.trim()) {
			throw new Error("markitdown 返回空内容 / returned empty output");
		}
		assertNotCidGarbage(markdown);
		return { markdown, images: [] };
	}
}

/**
 * Detect the `(cid:NN)` garbage that markitdown/pdfminer produces for PDFs with
 * custom-encoded embedded fonts lacking a ToUnicode map. Throw a helpful error
 * pointing the user to the MinerU backend instead of silently saving garbage.
 */
function assertNotCidGarbage(markdown: string): void {
	const cidMatches = markdown.match(/\(cid:\d+\)/g);
	if (!cidMatches) return;
	// If CID tokens dominate the output, the text is unreadable.
	const cidChars = cidMatches.join("").length;
	const ratio = cidChars / markdown.length;
	if (cidMatches.length > 20 && ratio > 0.2) {
		throw new Error(
			"此 PDF 的字体无法被 markitdown 正确解码（结果为 (cid:NN) 乱码）。" +
				"请改用 MinerU 后端（设置 → 解析后端 → MinerU）。" +
				" / This PDF's fonts can't be decoded by markitdown; switch to the MinerU backend."
		);
	}
}

/** Run `markitdown <file>` and capture stdout as markdown. */
function runMarkitdown(command: string, filePath: string): Promise<string> {
	return new Promise((resolve, reject) => {
		// Pass the file as a single arg (no shell) to avoid injection.
		execFile(
			command,
			[filePath],
			{ maxBuffer: 64 * 1024 * 1024, windowsHide: true },
			(err, stdout, stderr) => {
				if (err) {
					const hint =
						(err as NodeJS.ErrnoException).code === "ENOENT"
							? `找不到命令 "${command}"。请先安装：pip install 'markitdown[all]'`
							: stderr || err.message;
					reject(new Error(hint));
					return;
				}
				resolve(stdout);
			}
		);
	});
}

/** Check whether the markitdown CLI is available. Returns version text or null. */
export function checkMarkitdown(command: string): Promise<string | null> {
	return new Promise((resolve) => {
		execFile(
			command.trim() || "markitdown",
			["--version"],
			{ windowsHide: true, timeout: 10000 },
			(err, stdout) => {
				resolve(err ? null : stdout.trim() || "ok");
			}
		);
	});
}
