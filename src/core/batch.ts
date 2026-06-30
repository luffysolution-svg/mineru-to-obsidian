import { App, Notice, TFile } from "obsidian";
import type { Parser, ParserId } from "../parsers/types";
import type { PluginSettings } from "../settings";
import { saveParseResult } from "./saver";

/**
 * Max number of files parsed concurrently, per backend. Tuned to each
 * service's documented rate / concurrency limits so a batch never trips them:
 *   - doc2x:   has an explicit `parse_concurrency_limit`; keep it serial.
 *   - docling: heavy local CLI (loads large models); serial avoids thrashing.
 *   - mineru:  cloud API with free-mode rate limits; modest parallelism.
 *   - others:  cloud APIs / local CLIs that tolerate a couple in flight.
 */
export const BACKEND_CONCURRENCY: Record<ParserId, number> = {
	mineru: 2,
	markitdown: 2,
	docling: 1,
	vision: 2,
	baidu: 2,
	textin: 3,
	doc2x: 1,
};

interface FileOutcome {
	file: TFile;
	ok: boolean;
	notePath?: string;
	error?: string;
}

/**
 * Parse and save many files with a bounded worker pool sized to the backend's
 * rate limit. Shows a live progress Notice and a final summary; per-file
 * failures are collected rather than aborting the whole batch.
 */
export async function parseBatch(
	app: App,
	parser: Parser,
	files: TFile[],
	settings: PluginSettings
): Promise<void> {
	const total = files.length;
	const limit = Math.max(1, BACKEND_CONCURRENCY[parser.id] ?? 1);

	let done = 0;
	const results: FileOutcome[] = [];
	const progress = new Notice("", 0);
	const render = (current?: string) => {
		progress.setMessage(
			`批量解析 / Batch (${parser.label}): ${done}/${total}` +
				(current ? `\n当前 / now: ${current}` : "")
		);
	};
	render();

	// Shared work queue: each worker pulls the next index until exhausted.
	let next = 0;
	const worker = async (): Promise<void> => {
		while (next < total) {
			const i = next++;
			const file = files[i];
			render(file.name);
			try {
				const result = await parser.parse(file, settings);
				const outcome = await saveParseResult(app, file, result, settings);
				results.push({ file, ok: true, notePath: outcome.notePath });
			} catch (err) {
				results.push({
					file,
					ok: false,
					error: err instanceof Error ? err.message : String(err),
				});
			} finally {
				done++;
				render(file.name);
			}
		}
	};

	const workers = Array.from({ length: Math.min(limit, total) }, () => worker());
	await Promise.all(workers);
	progress.hide();

	reportBatch(results);
}

/** Show a summary Notice and log any failures to the console. */
function reportBatch(results: FileOutcome[]): void {
	const ok = results.filter((r) => r.ok);
	const failed = results.filter((r) => !r.ok);

	let msg = `✓ 批量完成 / Batch done: 成功 ${ok.length} / 失败 ${failed.length}`;
	if (failed.length > 0) {
		const names = failed.map((r) => r.file.name).slice(0, 5);
		msg += `\n失败 / failed: ${names.join("、")}`;
		if (failed.length > names.length) msg += ` 等 / etc.`;
		console.error(
			"[MinerU to Obsidian] batch failures:",
			failed.map((r) => `${r.file.path}: ${r.error}`)
		);
	}
	new Notice(msg, failed.length > 0 ? 12000 : 6000);
}
