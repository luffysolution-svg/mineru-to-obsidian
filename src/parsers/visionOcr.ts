import { TFile, requestUrl, arrayBufferToBase64 } from "obsidian";
import type { Parser, ParseResult } from "./types";
import type { PluginSettings } from "../settings";

/**
 * Vision-LLM OCR backend. Sends an image to an OpenAI-compatible
 * `/chat/completions` endpoint (works with OpenAI, new-api / one-api relays,
 * and any compatible gateway) and turns the model's reply into markdown.
 *
 * Images only. markitdown's own CLI cannot drive an LLM, so this is a separate
 * backend implemented directly against the chat API — no Python involved.
 */
export const VISION_IMAGE_MIME: Record<string, string> = {
	png: "image/png",
	jpg: "image/jpeg",
	jpeg: "image/jpeg",
	webp: "image/webp",
	gif: "image/gif",
	bmp: "image/bmp",
};

export class VisionOcrParser implements Parser {
	id = "vision" as const;
	label = "视觉 LLM OCR";

	async parse(file: TFile, settings: PluginSettings): Promise<ParseResult> {
		const ext = file.extension.toLowerCase();
		const mime = VISION_IMAGE_MIME[ext];
		if (!mime) {
			throw new Error(
				"视觉 OCR 仅支持图片文件（png/jpg/jpeg/webp/gif/bmp）。" +
					"其他文档请改用 MinerU 或 markitdown 后端。" +
					" / Vision OCR only supports image files; use MinerU or markitdown for documents."
			);
		}

		const bytes = await file.vault.readBinary(file);
		const dataUri = `data:${mime};base64,${arrayBufferToBase64(bytes)}`;
		const markdown = await visionChatCompletion(
			settings,
			dataUri,
			settings.visionPrompt
		);
		if (!markdown.trim()) {
			throw new Error("视觉模型返回空内容 / model returned empty output");
		}
		return { markdown, images: [] };
	}
}

/** Build the chat/completions endpoint from a base URL (e.g. ".../v1"). */
function endpointOf(base: string): string {
	const b = base.trim().replace(/\/+$/, "");
	if (!b) {
		throw new Error(
			"未配置 API 地址 / base URL（例如 https://api.openai.com/v1）"
		);
	}
	return b.endsWith("/chat/completions") ? b : b + "/chat/completions";
}

/** Fetch the available model IDs from an OpenAI-compatible `/models` endpoint. */
export async function fetchModels(
	baseUrl: string,
	apiKey: string
): Promise<string[]> {
	const b = baseUrl.trim().replace(/\/+$/, "");
	if (!b) throw new Error("未配置 API 地址 / no base URL");
	const key = apiKey.trim();
	if (!key) throw new Error("未配置 API Key / no API key");

	const res = await requestUrl({
		url: b + "/models",
		method: "GET",
		throw: false,
		headers: { Authorization: `Bearer ${key}` },
	});
	if (res.status < 200 || res.status >= 300) {
		const json = res.json as { error?: { message?: string } } | undefined;
		const detail = json?.error?.message || `HTTP ${res.status}`;
		throw new Error(`获取模型列表失败 / fetch models failed: ${detail}`);
	}
	const data = (res.json as { data?: unknown } | undefined)?.data;
	if (!Array.isArray(data)) {
		throw new Error("响应中无 data 数组 / no model list in response");
	}
	return data
		.map((m: { id?: string }) => m?.id)
		.filter((id): id is string => typeof id === "string" && id.length > 0)
		.sort();
}

/**
 * Call an OpenAI-compatible chat/completions endpoint with one image and a
 * text prompt; return the assistant message content.
 */
export async function visionChatCompletion(
	settings: PluginSettings,
	dataUri: string,
	textPrompt: string
): Promise<string> {
	const url = endpointOf(settings.visionBaseUrl);
	const key = settings.visionApiKey.trim();
	const model = settings.visionModel.trim();
	if (!key) throw new Error("未配置 API Key / no API key");
	if (!model) throw new Error("未配置模型名称 / no model name");

	const res = await requestUrl({
		url,
		method: "POST",
		throw: false,
		headers: {
			Authorization: `Bearer ${key}`,
			"Content-Type": "application/json",
		},
		body: JSON.stringify({
			model,
			temperature: 0,
			max_tokens: 4096,
			messages: [
				{
					role: "user",
					content: [
						{ type: "text", text: textPrompt },
						{ type: "image_url", image_url: { url: dataUri } },
					],
				},
			],
		}),
	});

	if (res.status < 200 || res.status >= 300) {
		const json = res.json as { error?: { message?: string } } | undefined;
		const detail =
			json?.error?.message ||
			(res.text ? res.text.slice(0, 200) : "") ||
			`HTTP ${res.status}`;
		throw new Error(`请求失败 / request failed (HTTP ${res.status}): ${detail}`);
	}

	const content = (
		res.json as
			| { choices?: Array<{ message?: { content?: string } }> }
			| undefined
	)?.choices?.[0]?.message?.content;
	if (typeof content !== "string") {
		throw new Error(
			"响应格式异常：未找到 choices[0].message.content / unexpected response shape"
		);
	}
	return content;
}

/**
 * Verify the configured endpoint truly has vision capability: draw a known
 * number onto a canvas, send it, and check the model reads it back. This proves
 * connectivity, auth, AND that the model accepts image input.
 */
export async function testVision(
	settings: PluginSettings
): Promise<{ ok: boolean; detail: string }> {
	const code = "7392";
	let dataUri: string;
	try {
		dataUri = makeTestImage(code);
	} catch (e) {
		return {
			ok: false,
			detail:
				"无法生成测试图片（canvas 不可用）/ cannot create test image: " +
				(e instanceof Error ? e.message : String(e)),
		};
	}

	try {
		const content = await visionChatCompletion(
			settings,
			dataUri,
			"Read the digits in this image. Output only the digits, nothing else."
		);
		const digits = content.replace(/\D/g, "");
		if (digits.includes(code)) {
			return {
				ok: true,
				detail: `识图测试通过 / vision OK：模型 "${settings.visionModel.trim()}" 正确读出了测试图中的 ${code}（返回："${content.trim()}"）。`,
			};
		}
		return {
			ok: false,
			detail: `连接与鉴权成功，但识图结果不符：期望含 "${code}"，实际返回 "${content.trim()}"。该模型可能不支持图片输入，请更换为视觉模型（如 gpt-4o / gpt-4o-mini / qwen-vl 等）。`,
		};
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
