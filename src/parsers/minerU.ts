import { requestUrl, TFile } from "obsidian";
import { unzipSync } from "fflate";
import type { Parser, ParseResult, ParsedImage } from "./types";
import type { PluginSettings } from "../settings";

const BASE = "https://mineru.net";
const POLL_INTERVAL_MS = 3000;
const POLL_TIMEOUT_MS = 5 * 60 * 1000;

interface Envelope<T> {
	code: number;
	msg: string;
	trace_id?: string;
	data: T;
}

/** Sleep helper. */
function sleep(ms: number): Promise<void> {
	return new Promise((r) => setTimeout(r, ms));
}

/** Throw if the MinerU envelope reports an error. */
function unwrap<T>(env: Envelope<T>): T {
	if (env.code !== 0) {
		throw new Error(`MinerU ${env.code}: ${env.msg || "unknown error"}`);
	}
	return env.data;
}

export class MinerUParser implements Parser {
	id = "mineru" as const;
	label = "MinerU";

	async parse(file: TFile, settings: PluginSettings): Promise<ParseResult> {
		const data = await file.vault.readBinary(file);
		const token = settings.minerUToken.trim();

		if (token) {
			return this.parsePrecision(file, data, token, settings);
		}
		if (settings.useFreeWhenNoToken) {
			return this.parseFree(file, data, settings);
		}
		throw new Error(
			"未配置 MinerU Token，且已关闭免费模式。请在设置中填写 Token 或开启免费模式。"
		);
	}

	/** Precision API (token): batch upload -> poll -> download zip -> unzip. */
	private async parsePrecision(
		file: TFile,
		bytes: ArrayBuffer,
		token: string,
		settings: PluginSettings
	): Promise<ParseResult> {
		const authHeaders = {
			Authorization: `Bearer ${token}`,
			"Content-Type": "application/json",
		};

		// 1. Request an upload URL.
		const applyRes = await requestUrl({
			url: `${BASE}/api/v4/file-urls/batch`,
			method: "POST",
			headers: authHeaders,
			throw: false,
			body: JSON.stringify({
				enable_formula: settings.minerUEnableFormula,
				enable_table: settings.minerUEnableTable,
				language: settings.minerULanguage,
				files: [
					{
						name: file.name,
						is_ocr: settings.minerUEnableOcr,
					},
				],
			}),
		});
		const apply = unwrap<{ batch_id: string; file_urls: string[] }>(
			applyRes.json
		);
		if (!apply.file_urls?.length) {
			throw new Error("MinerU 未返回上传链接 / no upload URL returned");
		}

		// 2. PUT the file to the signed URL (no Content-Type header, per docs).
		const put = await requestUrl({
			url: apply.file_urls[0],
			method: "PUT",
			body: bytes,
			throw: false,
		});
		if (put.status < 200 || put.status >= 300) {
			throw new Error(`文件上传失败 / upload failed (HTTP ${put.status})`);
		}

		// 3. Poll batch results until the file is done.
		const zipUrl = await this.pollBatch(apply.batch_id, file.name, authHeaders);

		// 4. Download and unzip.
		return this.downloadAndUnzip(zipUrl);
	}

	private async pollBatch(
		batchId: string,
		fileName: string,
		headers: Record<string, string>
	): Promise<string> {
		const deadline = Date.now() + POLL_TIMEOUT_MS;
		while (Date.now() < deadline) {
			const res = await requestUrl({
				url: `${BASE}/api/v4/extract-results/batch/${batchId}`,
				method: "GET",
				headers,
				throw: false,
			});
			const data = unwrap<{
				extract_result: Array<{
					file_name: string;
					state: string;
					full_zip_url?: string;
					err_msg?: string;
				}>;
			}>(res.json);

			const entry =
				data.extract_result.find((r) => r.file_name === fileName) ??
				data.extract_result[0];
			if (entry) {
				if (entry.state === "done" && entry.full_zip_url) {
					return entry.full_zip_url;
				}
				if (entry.state === "failed") {
					throw new Error("MinerU 解析失败 / failed: " + (entry.err_msg || ""));
				}
			}
			await sleep(POLL_INTERVAL_MS);
		}
		throw new Error("MinerU 解析超时 / timed out");
	}

	/** Free Agent API (no token): file upload -> poll -> markdown URL. */
	private async parseFree(
		file: TFile,
		bytes: ArrayBuffer,
		settings: PluginSettings
	): Promise<ParseResult> {
		const headers = { "Content-Type": "application/json" };

		// 1. Request signed upload.
		const applyRes = await requestUrl({
			url: `${BASE}/api/v1/agent/parse/file`,
			method: "POST",
			headers,
			throw: false,
			body: JSON.stringify({
				file_name: file.name,
				language: settings.minerULanguage,
				is_ocr: settings.minerUEnableOcr,
				enable_formula: settings.minerUEnableFormula,
				enable_table: settings.minerUEnableTable,
			}),
		});
		const apply = unwrap<{ task_id: string; file_url: string }>(applyRes.json);

		// 2. Upload.
		const put = await requestUrl({
			url: apply.file_url,
			method: "PUT",
			body: bytes,
			throw: false,
		});
		if (put.status < 200 || put.status >= 300) {
			throw new Error(`文件上传失败 / upload failed (HTTP ${put.status})`);
		}

		// 3. Poll until done, then fetch markdown.
		const mdUrl = await this.pollAgent(apply.task_id, headers);
		const mdRes = await requestUrl({ url: mdUrl, method: "GET", throw: false });
		return { markdown: mdRes.text, images: [] };
	}

	private async pollAgent(
		taskId: string,
		headers: Record<string, string>
	): Promise<string> {
		const deadline = Date.now() + POLL_TIMEOUT_MS;
		while (Date.now() < deadline) {
			const res = await requestUrl({
				url: `${BASE}/api/v1/agent/parse/${taskId}`,
				method: "GET",
				headers,
				throw: false,
			});
			const data = unwrap<{
				state: string;
				markdown_url?: string;
				err_msg?: string;
			}>(res.json);

			if (data.state === "done" && data.markdown_url) {
				return data.markdown_url;
			}
			if (data.state === "failed") {
				throw new Error("MinerU 解析失败 / failed: " + (data.err_msg || ""));
			}
			await sleep(POLL_INTERVAL_MS);
		}
		throw new Error("MinerU 解析超时 / timed out");
	}

	/** Download a result zip and extract full.md + images/. */
	private async downloadAndUnzip(zipUrl: string): Promise<ParseResult> {
		const res = await requestUrl({ url: zipUrl, method: "GET", throw: false });
		const files = unzipSync(new Uint8Array(res.arrayBuffer));

		// Locate the markdown file (full.md, or first *.md).
		let mdName = Object.keys(files).find((n) => /(^|\/)full\.md$/.test(n));
		if (!mdName) {
			mdName = Object.keys(files).find((n) => n.toLowerCase().endsWith(".md"));
		}
		if (!mdName) {
			throw new Error("结果压缩包中无 Markdown / no markdown in result zip");
		}
		const markdown = new TextDecoder().decode(files[mdName]);

		// Collect images (any file under images/ or with an image extension).
		const images: ParsedImage[] = [];
		const mdDir = mdName.includes("/")
			? mdName.slice(0, mdName.lastIndexOf("/") + 1)
			: "";
		for (const [name, content] of Object.entries(files)) {
			if (name === mdName) continue;
			if (!/\.(png|jpe?g|gif|webp|bmp|jp2)$/i.test(name)) continue;
			// Reference as it likely appears in markdown: path relative to the md file.
			const ref = mdDir && name.startsWith(mdDir) ? name.slice(mdDir.length) : name;
			images.push({
				originalRef: ref,
				data: content.buffer.slice(
					content.byteOffset,
					content.byteOffset + content.byteLength
				) as ArrayBuffer,
			});
		}

		return { markdown, images };
	}
}
