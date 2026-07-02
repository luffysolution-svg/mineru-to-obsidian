import { TFile, requestUrl } from "obsidian";
import type { Parser, ParseResult } from "./types";
import type { PluginSettings } from "../settings";

/**
 * TextIn (合合) xParse "文档解析" backend. Single synchronous HTTP call:
 * POST the raw file bytes and get back Markdown directly.
 *
 * Supports PDF / images / Office and returns real Markdown (tables, formulas,
 * layout). Auth uses an app id + secret code from the TextIn console.
 *
 * Docs: https://docs.textin.com/xparse/parse-quickstart
 */
const PARSE_URL = "https://api.textin.com/ai/service/v1/pdf_to_markdown";

/** Build the request URL with query options (no image return; v1 has no images). */
function parseUrl(): string {
	return `${PARSE_URL}?get_image=none&markdown_details=0&table_flavor=md`;
}

/** Auth + content headers for a binary upload. */
function headers(settings: PluginSettings): Record<string, string> {
	const appId = settings.textinAppId.trim();
	const secret = settings.textinSecretCode.trim();
	if (!appId || !secret) {
		throw new Error(
			"未配置 TextIn App ID / Secret Code / missing TextIn credentials"
		);
	}
	return {
		"x-ti-app-id": appId,
		"x-ti-secret-code": secret,
		"Content-Type": "application/octet-stream",
	};
}

/** Throw if the TextIn response carries a non-200 business code. */
function checkCode(json: Record<string, unknown>): void {
	const code = json.code;
	if (code !== undefined && code !== 200) {
		const msg = json.message || "unknown error";
		throw new Error(`TextIn ${code}: ${msg}`);
	}
}

export class TextinParser implements Parser {
	id = "textin" as const;
	label = "TextIn 合合（文档解析）";

	async parse(file: TFile, settings: PluginSettings): Promise<ParseResult> {
		const bytes = await file.vault.readBinary(file);
		const res = await requestUrl({
			url: parseUrl(),
			method: "POST",
			throw: false,
			headers: headers(settings),
			body: bytes,
		});
		const json = (res.json ?? {}) as Record<string, unknown>;
		checkCode(json);
		const markdown = (json.result as { markdown?: string } | undefined)?.markdown;
		if (typeof markdown !== "string" || !markdown.trim()) {
			throw new Error("TextIn 返回空内容 / returned empty markdown");
		}
		return { markdown, images: [] };
	}
}

/**
 * Verify the configured credentials work end-to-end: draw a known number onto a
 * canvas and run it through the parse call, checking the markdown contains it.
 * Proves connectivity + auth + parsing.
 */
export async function testTextin(
	settings: PluginSettings
): Promise<{ ok: boolean; detail: string }> {
	const code = "7392";
	let bytes: ArrayBuffer;
	try {
		bytes = makeTestImage(code);
	} catch (e) {
		return {
			ok: false,
			detail:
				"无法生成测试图片（canvas 不可用）/ cannot create test image: " +
				(e instanceof Error ? e.message : String(e)),
		};
	}

	try {
		const res = await requestUrl({
			url: parseUrl(),
			method: "POST",
			throw: false,
			headers: headers(settings),
			body: bytes,
		});
		const json = (res.json ?? {}) as Record<string, unknown>;
		checkCode(json);
		const md =
			(json.result as { markdown?: string } | undefined)?.markdown ?? "";
		const ok = md.includes(code);
		return {
			ok,
			detail: ok
				? `TextIn 测试通过 / TextIn OK：正确读出测试图中的 ${code}。`
				: `连接与鉴权成功，但未读出测试数字 ${code}（返回："${md
						.trim()
						.slice(0, 60)}"）。鉴权与接口正常，可正常使用。`,
		};
	} catch (e) {
		return { ok: false, detail: e instanceof Error ? e.message : String(e) };
	}
}

/** Draw the given text onto a small canvas and return PNG bytes. */
function makeTestImage(text: string): ArrayBuffer {
	const canvas = activeDocument.createElement("canvas");
	canvas.width = 240;
	canvas.height = 90;
	const ctx = canvas.getContext("2d");
	if (!ctx) throw new Error("no 2d context");
	ctx.fillStyle = "#ffffff";
	ctx.fillRect(0, 0, canvas.width, canvas.height);
	ctx.fillStyle = "#000000";
	ctx.font = "bold 56px sans-serif";
	ctx.textBaseline = "middle";
	ctx.fillText(text, 30, canvas.height / 2);
	const dataUrl = canvas.toDataURL("image/png");
	return base64ToArrayBuffer(dataUrl.slice(dataUrl.indexOf(",") + 1));
}

/** Decode a base64 string into an ArrayBuffer. */
function base64ToArrayBuffer(base64: string): ArrayBuffer {
	const binary = atob(base64);
	const bytes = new Uint8Array(binary.length);
	for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
	return bytes.buffer;
}
