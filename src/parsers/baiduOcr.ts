import { TFile, requestUrl, arrayBufferToBase64 } from "obsidian";
import type { Parser, ParseResult } from "./types";
import type { PluginSettings } from "../settings";

/**
 * Baidu OCR "文档解析" (document parsing) backend. Asynchronous two-call API:
 * submit a task, poll until done, then download the markdown result.
 *
 * Supports PDF / images / Office documents and returns real Markdown
 * (tables, formulas, layout). Auth uses an OAuth access_token derived from
 * an API Key + Secret Key (token is valid ~30 days; we fetch it per parse).
 *
 * Docs: https://cloud.baidu.com/doc/OCR/s/Klxag8wiy
 */
const OAUTH_URL = "https://aip.baidubce.com/oauth/2.0/token";
const SUBMIT_URL =
	"https://aip.baidubce.com/rest/2.0/brain/online/v2/parser/task";
const QUERY_URL =
	"https://aip.baidubce.com/rest/2.0/brain/online/v2/parser/task/query";
const POLL_INTERVAL_MS = 3000;
const POLL_TIMEOUT_MS = 5 * 60 * 1000;

/** Sleep helper. */
function sleep(ms: number): Promise<void> {
	return new Promise((r) => window.setTimeout(r, ms));
}

/** Exchange API Key + Secret Key for an access_token. */
async function getAccessToken(
	apiKey: string,
	secretKey: string
): Promise<string> {
	const ak = apiKey.trim();
	const sk = secretKey.trim();
	if (!ak || !sk) {
		throw new Error("未配置百度 API Key / Secret Key / missing Baidu keys");
	}
	const url =
		`${OAUTH_URL}?grant_type=client_credentials` +
		`&client_id=${encodeURIComponent(ak)}` +
		`&client_secret=${encodeURIComponent(sk)}`;
	const res = await requestUrl({ url, method: "POST", throw: false });
	const json = res.json as
		| { access_token?: string; error_description?: string; error?: string }
		| undefined;
	const token = json?.access_token;
	if (typeof token !== "string" || !token) {
		const detail =
			json?.error_description || json?.error || `HTTP ${res.status}`;
		throw new Error(`获取百度 access_token 失败 / token failed: ${detail}`);
	}
	return token;
}

/** POST a form-urlencoded body and return the parsed JSON. */
async function postForm(
	url: string,
	params: Record<string, string>
): Promise<Record<string, unknown>> {
	const body = new URLSearchParams(params).toString();
	const res = await requestUrl({
		url,
		method: "POST",
		throw: false,
		headers: { "Content-Type": "application/x-www-form-urlencoded" },
		body,
	});
	return (res.json ?? {}) as Record<string, unknown>;
}

/** Throw if the Baidu response carries a non-zero error_code. */
function checkError(json: Record<string, unknown>): void {
	const code = json.error_code;
	if (code !== undefined && code !== 0) {
		const msg = json.error_msg || "unknown error";
		throw new Error(`百度 OCR ${code}: ${msg}`);
	}
}

export class BaiduOcrParser implements Parser {
	id = "baidu" as const;
	label = "百度 OCR（文档解析）";

	async parse(file: TFile, settings: PluginSettings): Promise<ParseResult> {
		const token = await getAccessToken(
			settings.baiduApiKey,
			settings.baiduSecretKey
		);

		const bytes = await file.vault.readBinary(file);
		const fileData = arrayBufferToBase64(bytes);

		// 1. Submit the parse task.
		const submit = await postForm(`${SUBMIT_URL}?access_token=${token}`, {
			file_data: fileData,
			file_name: file.name,
			recognize_formula: settings.baiduRecognizeFormula ? "1" : "0",
		});
		checkError(submit);
		const taskId = (submit.result as { task_id?: string } | undefined)?.task_id;
		if (!taskId) {
			throw new Error("百度未返回 task_id / no task_id returned");
		}

		// 2. Poll until success, then download the markdown.
		const mdUrl = await this.pollTask(taskId, token);
		const mdRes = await requestUrl({ url: mdUrl, method: "GET", throw: false });
		return { markdown: mdRes.text, images: [] };
	}

	private async pollTask(taskId: string, token: string): Promise<string> {
		const deadline = Date.now() + POLL_TIMEOUT_MS;
		while (Date.now() < deadline) {
			const query = await postForm(`${QUERY_URL}?access_token=${token}`, {
				task_id: taskId,
			});
			checkError(query);
			const result = query.result as
				| { status?: string; markdown_url?: string; task_error?: unknown }
				| undefined;
			const status = result?.status;
			if (status === "success" && result?.markdown_url) {
				return result.markdown_url;
			}
			if (status === "failed") {
				const err =
					(result?.task_error as { error_msg?: string } | undefined)
						?.error_msg ?? "";
				throw new Error("百度解析失败 / failed: " + err);
			}
			await sleep(POLL_INTERVAL_MS);
		}
		throw new Error("百度解析超时 / timed out");
	}
}

/**
 * Verify the configured keys work end-to-end: draw a known number onto a
 * canvas, run it through the full submit/poll/download flow, and check the
 * markdown contains the number. Proves auth + service permission + parsing.
 */
export async function testBaidu(
	settings: PluginSettings
): Promise<{ ok: boolean; detail: string }> {
	const code = "7392";
	let dataUrl: string;
	try {
		dataUrl = makeTestImage(code);
	} catch (e) {
		return {
			ok: false,
			detail:
				"无法生成测试图片（canvas 不可用）/ cannot create test image: " +
				(e instanceof Error ? e.message : String(e)),
		};
	}

	try {
		const token = await getAccessToken(
			settings.baiduApiKey,
			settings.baiduSecretKey
		);
		const base64 = dataUrl.slice(dataUrl.indexOf(",") + 1);
		const submit = await postForm(`${SUBMIT_URL}?access_token=${token}`, {
			file_data: base64,
			file_name: "test.png",
			recognize_formula: "0",
		});
		checkError(submit);
		const taskId = (submit.result as { task_id?: string } | undefined)?.task_id;
		if (!taskId) {
			return { ok: false, detail: "提交成功但未返回 task_id / no task_id" };
		}

		const deadline = Date.now() + 60000;
		while (Date.now() < deadline) {
			const query = await postForm(`${QUERY_URL}?access_token=${token}`, {
				task_id: taskId,
			});
			checkError(query);
			const result = query.result as
				| { status?: string; markdown_url?: string }
				| undefined;
			if (result?.status === "success" && result.markdown_url) {
				const md = await requestUrl({
					url: result.markdown_url,
					method: "GET",
					throw: false,
				});
				const ok = md.text.includes(code);
				return {
					ok,
					detail: ok
						? `百度文档解析测试通过 / Baidu OK：正确读出测试图中的 ${code}。`
						: `连接与鉴权成功，解析已完成，但未读出测试数字 ${code}（返回："${md.text
								.trim()
								.slice(0, 60)}"）。鉴权与接口权限正常，可正常使用。`,
				};
			}
			if (result?.status === "failed") {
				return { ok: false, detail: "解析失败 / parse failed" };
			}
			await sleep(POLL_INTERVAL_MS);
		}
		return { ok: false, detail: "解析超时 / timed out" };
	} catch (e) {
		return { ok: false, detail: e instanceof Error ? e.message : String(e) };
	}
}

/** Draw the given text onto a small canvas and return a PNG data URI. */
function makeTestImage(text: string): string {
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
	return canvas.toDataURL("image/png");
}
