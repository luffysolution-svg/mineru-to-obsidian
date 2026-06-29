import { App, normalizePath, TFolder } from "obsidian";

/** Today's date as YYYY-MM-DD. */
export function todayStamp(): string {
	const d = new Date();
	const mm = String(d.getMonth() + 1).padStart(2, "0");
	const dd = String(d.getDate()).padStart(2, "0");
	return `${d.getFullYear()}-${mm}-${dd}`;
}

/** Replace {filename} {date} {noteName} tokens in a folder template. */
export function resolveTemplate(
	template: string,
	tokens: { filename?: string; noteName?: string; date?: string }
): string {
	return template
		.replace(/\{filename\}/g, tokens.filename ?? "")
		.replace(/\{noteName\}/g, tokens.noteName ?? tokens.filename ?? "")
		.replace(/\{date\}/g, tokens.date ?? todayStamp());
}

/** Ensure a folder (and parents) exist. Safe to call repeatedly. */
export async function ensureFolder(app: App, folderPath: string): Promise<void> {
	const path = normalizePath(folderPath);
	if (path === "" || path === "/" || path === ".") return;

	const existing = app.vault.getAbstractFileByPath(path);
	if (existing instanceof TFolder) return;

	try {
		await app.vault.createFolder(path);
	} catch (e) {
		// Race / already-exists: ignore; rethrow anything else.
		const msg = e instanceof Error ? e.message : String(e);
		if (!/exist/i.test(msg)) throw e;
	}
}

/** Strip an extension from a file name. */
export function stripExt(name: string): string {
	const i = name.lastIndexOf(".");
	return i > 0 ? name.slice(0, i) : name;
}

/** Get the lowercase extension (no dot) from a path/name. */
export function extOf(name: string): string {
	const i = name.lastIndexOf(".");
	return i >= 0 ? name.slice(i + 1).toLowerCase() : "";
}

/**
 * Find a vault path for `folder/baseName` that doesn't collide,
 * appending " 1", " 2", ... before the extension if needed.
 */
export function uniquePath(app: App, folder: string, fileName: string): string {
	const base = stripExt(fileName);
	const ext = extOf(fileName);
	const suffix = ext ? "." + ext : "";
	const join = (n: string) =>
		normalizePath((folder ? folder + "/" : "") + n + suffix);

	let candidate = join(base);
	let i = 1;
	while (app.vault.getAbstractFileByPath(candidate)) {
		candidate = join(`${base} ${i}`);
		i++;
	}
	return candidate;
}

/** Sanitize a string so it is safe as a single path segment. */
export function sanitizeSegment(name: string): string {
	return name.replace(/[\\/:*?"<>|]/g, "_").trim();
}
