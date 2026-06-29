import { App, Notice, TFile } from "obsidian";
import type { PluginSettings } from "../settings";
import type { ParseResult } from "../parsers/types";
import {
	ensureFolder,
	extOf,
	resolveTemplate,
	sanitizeSegment,
	stripExt,
	todayStamp,
	uniquePath,
} from "./paths";

export interface SaveOutcome {
	notePath: string;
	imageCount: number;
}

/**
 * Save a parse result into the vault: write images to the attachment folder
 * (renamed per settings), rewrite image links in the markdown, then write the note.
 */
export async function saveParseResult(
	app: App,
	source: TFile,
	result: ParseResult,
	settings: PluginSettings
): Promise<SaveOutcome> {
	const baseName = source.basename; // file name without extension
	const date = todayStamp();

	const mdFolder = resolveTemplate(settings.markdownSavePath, {
		filename: baseName,
		date,
	});
	const attachFolder = resolveTemplate(settings.attachmentSavePath, {
		filename: baseName,
		noteName: baseName,
		date,
	});

	const notePath = uniquePath(app, mdFolder, baseName + ".md");
	const noteName = stripExt(notePath.split("/").pop() as string);

	let markdown = result.markdown;

	// --- Save images and rewrite links ---
	if (result.images.length > 0) {
		await ensureFolder(app, attachFolder);

		// Write each image to a unique path, collecting old ref -> new file name.
		const linkMap = new Map<string, string>();
		for (let i = 0; i < result.images.length; i++) {
			const img = result.images[i];
			const desiredName = buildAttachmentName(settings, {
				noteName,
				index: i + 1,
				date,
				originalRef: img.originalRef,
			});
			const targetPath = uniquePath(app, attachFolder, desiredName);
			await app.vault.createBinary(targetPath, img.data);
			// Map to the final file name; we rewrite links as Obsidian wikilinks,
			// which resolve by name regardless of note/attachment folder layout.
			linkMap.set(img.originalRef, targetPath.split("/").pop() as string);
		}

		markdown = rewriteImageLinks(markdown, linkMap);
	}

	// --- Write the markdown note ---
	await ensureFolder(app, mdFolder);
	const note = await app.vault.create(notePath, markdown);

	return { notePath: note.path, imageCount: result.images.length };
}

/** Build the attachment file name according to the rename setting. */
function buildAttachmentName(
	settings: PluginSettings,
	ctx: { noteName: string; index: number; date: string; originalRef: string }
): string {
	const originalBase = ctx.originalRef.split("/").pop() ?? ctx.originalRef;
	const ext = extOf(originalBase) || "png";

	switch (settings.attachmentRename) {
		case "keep":
			return sanitizeSegment(originalBase);
		case "date-index":
			return `${ctx.date}-${ctx.index}.${ext}`;
		case "custom":
			return sanitizeSegment(
				settings.attachmentRenameTemplate
					.replace(/\{noteName\}/g, ctx.noteName)
					.replace(/\{index\}/g, String(ctx.index))
					.replace(/\{date\}/g, ctx.date)
					.replace(/\{ext\}/g, ext)
			);
		case "note-index":
		default:
			return `${sanitizeSegment(ctx.noteName)}-${ctx.index}.${ext}`;
	}
}

/**
 * Replace image references in markdown. MinerU emits `![alt](images/x.jpg)`.
 * We rewrite the whole image expression to an Obsidian wikilink `![[fileName]]`,
 * which resolves by file name regardless of the note/attachment folder layout.
 * `linkMap` maps the original ref (e.g. "images/x.jpg") to the new file name.
 */
function rewriteImageLinks(
	markdown: string,
	linkMap: Map<string, string>
): string {
	let out = markdown;
	for (const [oldRef, newName] of linkMap) {
		// Match a markdown image whose target is exactly oldRef: ![any](oldRef)
		const pattern = new RegExp(
			"!\\[[^\\]]*\\]\\(\\s*" + escapeRegExp(oldRef) + "\\s*\\)",
			"g"
		);
		out = out.replace(pattern, `![[${newName}]]`);
	}
	return out;
}

/** Escape a string for safe use inside a RegExp. */
function escapeRegExp(s: string): string {
	return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Convenience: report success/failure via Notice. */
export function notifySuccess(outcome: SaveOutcome): void {
	new Notice(
		`✓ 解析完成 / Done: ${outcome.notePath}` +
			(outcome.imageCount
				? `（${outcome.imageCount} 张图片 / images）`
				: ""),
		6000
	);
}

export function notifyError(err: unknown): void {
	const msg = err instanceof Error ? err.message : String(err);
	console.error("[MinerU to Obsidian] parse failed:", err);
	new Notice("❌ 解析失败 / Failed: " + msg, 8000);
}
