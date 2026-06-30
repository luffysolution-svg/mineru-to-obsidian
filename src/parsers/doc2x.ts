import { TFile, requestUrl } from "obsidian";
import type { Parser, ParseResult } from "./types";
import type { PluginSettings } from "../settings";

/**
 * Doc2X backend. Asynchronous multi-step API:
 * preupload (get signed URL) -> PUT file -> poll status until success.
 *
 * The status response already carries per-page Markdown (`result.pages[].md`),
 * so we join the pages in order — no separate export/convert step is needed.
 * PDF-focused (also accepts images). Auth uses a Bearer `sk-` key.
 *
 * Docs: https://doc2x.noedgeai.com/help/en/api/doc2x-api-v2-pdf-interface.html
 */
const BASE = "https://v2.doc2x.noedgeai.com";
const POLL_INTERVAL_MS = 3000;
const POLL_TIMEOUT_MS = 5 * 60 * 1000;

interface PreuploadData {
	uid: string;
	url: string;
}
interface StatusPage {
	page_idx: number;
	md?: string;
}
interface StatusData {
	status: string;
	progress?: number;
	detail?: string;
	result?: { pages?: StatusPage[] };
}

/** Sleep helper. */
function sleep(ms: number): Promise<void> {
	return new Promise((r) => setTimeout(r, ms));
}

/** Authorization header from the configured key. */
function authHeader(settings: PluginSettings): Record<string, string> {
	const key = settings.doc2xApiKey.trim();
	if (!key) {
		throw new Error("未配置 Doc2X API Key / missing Doc2X key");
	}
	return { Authorization: `Bearer ${key}` };
}

/**
 * Unwrap a Doc2X envelope `{code, data, msg}`. `code` is the string "success"
 * on success; anything else is a business error.
 */
function unwrap<T>(json: Record<string, unknown>): T {
	if (json.code !== "success") {
		const msg = json.msg || json.code || "unknown error";
		throw new Error(`Doc2X ${json.code ?? "?"}: ${msg}`);
	}
	return json.data as T;
}

export class Doc2xParser implements Parser {
	id = "doc2x" as const;
	label = "Doc2X";

	async parse(file: TFile, settings: PluginSettings): Promise<ParseResult> {
		const headers = authHeader(settings);
		const bytes = await file.vault.readBinary(file);

		// 1. Pre-upload: get a task uid and a signed upload URL.
		const preRes = await requestUrl({
			url: `${BASE}/api/v2/parse/preupload`,
			method: "POST",
			throw: false,
			headers,
		});
		const pre = unwrap<PreuploadData>(preRes.json ?? {});

		// 2. PUT the raw file bytes to the signed URL.
		const put = await requestUrl({
			url: pre.url,
			method: "PUT",
			body: bytes,
			throw: false,
		});
		if (put.status < 200 || put.status >= 300) {
			throw new Error(`文件上传失败 / upload failed (HTTP ${put.status})`);
		}

		// 3. Poll until success, then join per-page markdown.
		const markdown = await pollStatus(pre.uid, headers);
		if (!markdown.trim()) {
			throw new Error("Doc2X 返回空内容 / returned empty markdown");
		}
		return { markdown, images: [] };
	}
}

/** Poll the status endpoint until success; return joined per-page markdown. */
async function pollStatus(
	uid: string,
	headers: Record<string, string>
): Promise<string> {
	const deadline = Date.now() + POLL_TIMEOUT_MS;
	while (Date.now() < deadline) {
		const res = await requestUrl({
			url: `${BASE}/api/v2/parse/status?uid=${encodeURIComponent(uid)}`,
			method: "GET",
			throw: false,
			headers,
		});
		const data = unwrap<StatusData>(res.json ?? {});
		if (data.status === "success") {
			const pages = data.result?.pages ?? [];
			return pages
				.slice()
				.sort((a, b) => a.page_idx - b.page_idx)
				.map((p) => p.md ?? "")
				.join("\n\n");
		}
		if (data.status === "failed") {
			throw new Error("Doc2X 解析失败 / failed: " + (data.detail || ""));
		}
		await sleep(POLL_INTERVAL_MS);
	}
	throw new Error("Doc2X 解析超时 / timed out");
}

/**
 * Verify the configured key works end-to-end: draw a known number onto a
 * canvas, run the full preupload/PUT/poll flow, and check the markdown
 * contains it. Proves connectivity + auth + parsing.
 */
export async function testDoc2x(
	settings: PluginSettings
): Promise<{ ok: boolean; detail: string }> {
	// Doc2X is PDF-only (it rejects bare images), so the self-test sends a
	// minimal one-page PDF containing the known number rather than a PNG.
	const code = "7392";
	const bytes = makeTestPdf(code);

	try {
		const headers = authHeader(settings);
		const preRes = await requestUrl({
			url: `${BASE}/api/v2/parse/preupload`,
			method: "POST",
			throw: false,
			headers,
		});
		const pre = unwrap<PreuploadData>(preRes.json ?? {});
		const put = await requestUrl({
			url: pre.url,
			method: "PUT",
			body: bytes,
			throw: false,
		});
		if (put.status < 200 || put.status >= 300) {
			return { ok: false, detail: `上传失败 / upload failed (HTTP ${put.status})` };
		}
		const md = await pollStatus(pre.uid, headers);
		const ok = md.includes(code);
		return {
			ok,
			detail: ok
				? `Doc2X 测试通过 / Doc2X OK：正确读出测试图中的 ${code}。`
				: `连接与鉴权成功，解析已完成，但未读出测试数字 ${code}（返回："${md
						.trim()
						.slice(0, 60)}"）。鉴权与接口正常，可正常使用。`,
		};
	} catch (e) {
		return { ok: false, detail: e instanceof Error ? e.message : String(e) };
	}
}

/**
 * Build a minimal single-page PDF containing the given text. Used by the
 * self-test because Doc2X only accepts PDFs, not bare images.
 */
function makeTestPdf(text: string): ArrayBuffer {
	const stream = `BT /F1 48 Tf 100 700 Td (${text}) Tj ET`;
	const objs = [
		"<< /Type /Catalog /Pages 2 0 R >>",
		"<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
		"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] " +
			"/Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>",
		`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
		"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
	];

	let pdf = "%PDF-1.4\n";
	const offsets: number[] = [];
	objs.forEach((o, i) => {
		offsets.push(pdf.length);
		pdf += `${i + 1} 0 obj\n${o}\nendobj\n`;
	});
	const xrefPos = pdf.length;
	pdf += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`;
	for (const off of offsets) {
		pdf += `${off.toString().padStart(10, "0")} 00000 n \n`;
	}
	pdf += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\n`;
	pdf += `startxref\n${xrefPos}\n%%EOF`;

	const bytes = new Uint8Array(pdf.length);
	for (let i = 0; i < pdf.length; i++) bytes[i] = pdf.charCodeAt(i);
	return bytes.buffer;
}
