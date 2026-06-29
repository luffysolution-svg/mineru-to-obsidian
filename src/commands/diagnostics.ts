import { App, Modal, Notice, requestUrl } from "obsidian";
import type MinerUPlugin from "../main";
import { checkMarkitdown } from "../parsers/markitdown";

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
