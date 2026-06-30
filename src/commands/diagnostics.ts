import { App, Modal, Notice, requestUrl } from "obsidian";
import type MinerUPlugin from "../main";
import { checkMarkitdown } from "../parsers/markitdown";
import { checkDocling } from "../parsers/docling";

interface CheckLine {
	ok: boolean | "warn";
	label: string;
}

/** Run configuration diagnostics and show the results in a modal. */
export async function runDiagnostics(plugin: MinerUPlugin): Promise<void> {
	new Notice("检测中 / Checking...");
	const s = plugin.settings;
	const lines: CheckLine[] = [];

	// Active backend.
	lines.push({ ok: true, label: `当前后端 / Backend: ${s.parser}` });

	// MinerU token.
	if (s.minerUToken.trim()) {
		const tokenOk = await probeMinerUToken(s.minerUToken.trim());
		lines.push({
			ok: tokenOk,
			label: tokenOk
				? "MinerU Token：有效 / valid"
				: "MinerU Token：无效或网络异常 / invalid or network error",
		});
	} else if (s.useFreeWhenNoToken) {
		lines.push({
			ok: "warn",
			label: "MinerU：未配置 Token，将使用免费模式（无图片附件）/ free mode, no images",
		});
	} else {
		lines.push({
			ok: false,
			label: "MinerU：未配置 Token 且免费模式关闭，无法解析 / not usable",
		});
	}

	// markitdown CLI.
	const mdVersion = await checkMarkitdown(s.markitdownCommand);
	lines.push({
		ok: mdVersion ? true : s.parser === "markitdown" ? false : "warn",
		label: mdVersion
			? `markitdown：可用 / available (${mdVersion})`
			: "markitdown：未检测到 / not found（pip install 'markitdown[all]'）",
	});

	// docling CLI.
	const doclingVersion = await checkDocling(s.doclingCommand);
	lines.push({
		ok: doclingVersion ? true : s.parser === "docling" ? false : "warn",
		label: doclingVersion
			? `docling：可用 / available (${doclingVersion})`
			: "docling：未检测到 / not found（pip install docling）",
	});

	// Vision LLM OCR.
	if (s.visionApiKey.trim() && s.visionBaseUrl.trim() && s.visionModel.trim()) {
		lines.push({
			ok: s.parser === "vision" ? "warn" : true,
			label: `视觉 OCR：已配置 / configured（${s.visionModel.trim()}，用"测试视觉 OCR"命令验证识图）`,
		});
	} else {
		lines.push({
			ok: s.parser === "vision" ? false : "warn",
			label: "视觉 OCR：未配置完整（需 API 地址 / Key / 模型）/ not fully configured",
		});
	}

	// Baidu OCR.
	if (s.baiduApiKey.trim() && s.baiduSecretKey.trim()) {
		lines.push({
			ok: s.parser === "baidu" ? "warn" : true,
			label: '百度 OCR：已配置 AK/SK / configured（用"测试百度 OCR"命令验证）',
		});
	} else {
		lines.push({
			ok: s.parser === "baidu" ? false : "warn",
			label: "百度 OCR：未配置（需 API Key 与 Secret Key）/ not configured",
		});
	}

	// TextIn (合合).
	if (s.textinAppId.trim() && s.textinSecretCode.trim()) {
		lines.push({
			ok: s.parser === "textin" ? "warn" : true,
			label: 'TextIn 合合：已配置 / configured（用"测试 TextIn"命令验证）',
		});
	} else {
		lines.push({
			ok: s.parser === "textin" ? false : "warn",
			label: "TextIn 合合：未配置（需 App ID 与 Secret Code）/ not configured",
		});
	}

	// Doc2X.
	if (s.doc2xApiKey.trim()) {
		lines.push({
			ok: s.parser === "doc2x" ? "warn" : true,
			label: 'Doc2X：已配置 API Key / configured（用"测试 Doc2X"命令验证）',
		});
	} else {
		lines.push({
			ok: s.parser === "doc2x" ? false : "warn",
			label: "Doc2X：未配置（需 API Key）/ not configured",
		});
	}

	// Save paths.
	lines.push({
		ok: s.markdownSavePath ? true : false,
		label: `Markdown 路径 / path: ${s.markdownSavePath || "(空 / empty)"}`,
	});
	lines.push({
		ok: s.attachmentSavePath ? true : "warn",
		label: `附件路径 / path: ${s.attachmentSavePath || "(空 / empty)"}`,
	});

	new DiagnosticsModal(plugin.app, lines).open();
}

/** Lightweight token probe: call a token-required endpoint and inspect the code. */
async function probeMinerUToken(token: string): Promise<boolean> {
	try {
		const res = await requestUrl({
			url: "https://mineru.net/api/v4/file-urls/batch",
			method: "POST",
			throw: false,
			headers: {
				Authorization: `Bearer ${token}`,
				"Content-Type": "application/json",
			},
			body: JSON.stringify({ files: [{ name: "__probe__.pdf" }] }),
		});
		const code = res.json?.code;
		// Auth errors are A0202 / A0211. A 0 (or any non-auth code) means the token was accepted.
		return code !== "A0202" && code !== "A0211" && res.status !== 401;
	} catch {
		return false;
	}
}

class DiagnosticsModal extends Modal {
	constructor(app: App, private lines: CheckLine[]) {
		super(app);
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.createEl("h2", { text: "配置检测结果 / Diagnostics" });
		const ul = contentEl.createEl("ul");
		for (const line of this.lines) {
			const icon = line.ok === true ? "✓" : line.ok === "warn" ? "⚠" : "✗";
			ul.createEl("li", { text: `${icon} ${line.label}` });
		}
	}

	onClose(): void {
		this.contentEl.empty();
	}
}
