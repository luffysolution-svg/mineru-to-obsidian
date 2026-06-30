import { App, Modal, Setting } from "obsidian";
import {
	BAIDU_CONSOLE_URL,
	BAIDU_DOCS_URL,
	DOC2X_CONSOLE_URL,
	DOC2X_DOCS_URL,
	DOCLING_REPO_URL,
	MARKITDOWN_REPO_URL,
	MINERU_DOCS_URL,
	MINERU_TOKEN_URL,
	TEXTIN_CONSOLE_URL,
	TEXTIN_DOCS_URL,
} from "../settings";

/**
 * Setup & configuration guide modal.
 * Shows a concise and a detailed view, plus official links.
 */
export class SetupGuideModal extends Modal {
	private detailed = false;

	constructor(app: App) {
		super(app);
	}

	onOpen(): void {
		this.render();
	}

	private render(): void {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.createEl("h2", { text: "安装与配置引导 / Setup guide" });

		// Toggle concise / detailed.
		new Setting(contentEl)
			.setName("显示详细说明 / Detailed view")
			.addToggle((t) =>
				t.setValue(this.detailed).onChange((v) => {
					this.detailed = v;
					this.render();
				})
			);

		this.detailed ? this.renderDetailed(contentEl) : this.renderConcise(contentEl);

		// Official links.
		contentEl.createEl("h3", { text: "官方链接 / Official links" });
		const links = contentEl.createEl("ul");
		this.linkItem(links, "MinerU 获取 Token / Get token", MINERU_TOKEN_URL);
		this.linkItem(links, "MinerU API 文档 / API docs", MINERU_DOCS_URL);
		this.linkItem(links, "markitdown 仓库 / repo", MARKITDOWN_REPO_URL);
		this.linkItem(links, "百度 OCR 控制台 / Baidu console", BAIDU_CONSOLE_URL);
		this.linkItem(links, "百度文档解析文档 / Baidu doc parsing", BAIDU_DOCS_URL);
		this.linkItem(links, "docling 项目 / repo", DOCLING_REPO_URL);
		this.linkItem(links, "TextIn 控制台 / console", TEXTIN_CONSOLE_URL);
		this.linkItem(links, "TextIn 文档 / docs", TEXTIN_DOCS_URL);
		this.linkItem(links, "Doc2X 控制台 / console", DOC2X_CONSOLE_URL);
		this.linkItem(links, "Doc2X 文档 / docs", DOC2X_DOCS_URL);
	}

	private renderConcise(el: HTMLElement): void {
		el.createEl("h3", { text: "简约配置 / Quick setup" });
		const ol = el.createEl("ol");
		ol.createEl("li", {
			text: "MinerU 免费模式：无需任何配置，直接右键文件选择「解析文档」。",
		});
		ol.createEl("li", {
			text: "MinerU 图片附件：在设置中填入 API Token（见下方链接）。",
		});
		ol.createEl("li", {
			text: "markitdown：先 pip install 'markitdown[all]'，再在设置里切换后端。",
		});
		ol.createEl("li", {
			text: "视觉 LLM OCR（识别图片文字）：在设置中填 API 地址 / Key / 视觉模型，点「测试识图」通过后即可右键图片解析。支持 OpenAI 兼容中转站。",
		});
		ol.createEl("li", {
			text: "百度 OCR（文档解析）：在百度智能云创建应用、开通「文字识别」服务，填入 API Key 与 Secret Key，点「测试」通过后即可右键解析。支持 PDF / 图片 / Office，输出含表格公式的 Markdown。",
		});
		ol.createEl("li", {
			text: "docling：先 pip install docling，再在设置里切换后端。本地 CLI，输出 Markdown（无图片附件），仅桌面端。",
		});
		ol.createEl("li", {
			text: "TextIn 合合（文档解析）：在 TextIn 控制台获取 App ID 与 Secret Code 填入设置，点「测试」通过后即可右键解析。支持 PDF / 图片 / Office，输出含表格公式的 Markdown。",
		});
		ol.createEl("li", {
			text: "Doc2X（文档解析）：在 Doc2X 控制台获取 API Key（sk-...）填入设置，点「测试」通过后即可右键解析。擅长 PDF 公式 / 表格 / 版面。",
		});
	}

	private renderDetailed(el: HTMLElement): void {
		el.createEl("h3", { text: "详细配置 / Detailed setup" });

		el.createEl("h4", { text: "MinerU（云端 / cloud）" });
		const m = el.createEl("ul");
		m.createEl("li", {
			text: "免费模式（Agent API）：无需 Token，限 10MB / 20 页，仅输出 Markdown（无图片附件）。",
		});
		m.createEl("li", {
			text: "Precision API：在官网获取 Token 并填入设置，支持 200MB / 200 页，输出 Markdown + 图片附件。",
		});
		m.createEl("li", {
			text: "可调选项：语言、OCR、公式识别、表格识别。",
		});

		el.createEl("h4", { text: "markitdown（本地 / local）" });
		const k = el.createEl("ul");
		const liInstall = k.createEl("li");
		liInstall.append("安装：");
		liInstall.createEl("code", { text: "pip install 'markitdown[all]'" });
		k.createEl("li", {
			text: "需要本地已安装 Python；命令默认 markitdown，可在设置中改为完整路径。",
		});
		k.createEl("li", { text: "仅桌面端可用；不提取图片附件。" });

		el.createEl("h4", { text: "视觉 LLM OCR（识图 / vision）" });
		const v = el.createEl("ul");
		v.createEl("li", {
			text: "用 OpenAI 兼容接口的视觉模型识别图片中的文字并转为 Markdown，仅支持图片（png/jpg/jpeg/webp/gif/bmp）。",
		});
		v.createEl("li", {
			text: "配置：API 地址（如 https://api.openai.com/v1 或中转站地址）、API Key、模型（须支持图片输入，如 gpt-4o / gpt-4o-mini / qwen-vl-max）。",
		});
		v.createEl("li", {
			text: "兼容第三方 OpenAI 兼容服务（new-api / one-api 等中转站）。配置后用「测试识图」按钮或「测试视觉 OCR」命令验证。",
		});
		v.createEl("li", {
			text: "用 DeepSeek-OCR：DeepSeek 无官方托管 API，可经第三方（如硅基流动）调用——地址填 https://api.siliconflow.cn/v1，模型填 deepseek-ai/DeepSeek-OCR。",
		});

		el.createEl("h4", { text: "百度 OCR（文档解析 / Baidu）" });
		const b = el.createEl("ul");
		b.createEl("li", {
			text: "百度智能云「文档解析」接口，支持 PDF / 图片 / Office，直接输出 Markdown（含表格、公式、版面）。",
		});
		b.createEl("li", {
			text: "配置：在百度智能云控制台创建应用、开通「文字识别」服务，获取 API Key 与 Secret Key 填入设置。需实名认证以领取免费额度。",
		});
		b.createEl("li", {
			text: "免费额度与计费以百度控制台为准。配置后用「测试」按钮或「测试百度 OCR」命令验证。",
		});

		el.createEl("h4", { text: "docling（本地 / local）" });
		const d = el.createEl("ul");
		const liDocling = d.createEl("li");
		liDocling.append("安装：");
		liDocling.createEl("code", { text: "pip install docling" });
		d.createEl("li", {
			text: "需要本地已安装 Python；命令默认 docling，可在设置中改为完整路径。",
		});
		d.createEl("li", { text: "仅桌面端可用；输出 Markdown，不提取图片附件。" });

		el.createEl("h4", { text: "TextIn 合合（文档解析 / TextIn）" });
		const t = el.createEl("ul");
		t.createEl("li", {
			text: "合合 TextIn xParse「文档解析」接口，支持 PDF / 图片 / Office，直接输出 Markdown（含表格、公式、版面）。",
		});
		t.createEl("li", {
			text: "配置：在 TextIn 控制台获取 App ID（x-ti-app-id）与 Secret Code（x-ti-secret-code）填入设置。",
		});
		t.createEl("li", {
			text: "配置后用「测试」按钮或「测试 TextIn」命令验证。",
		});

		el.createEl("h4", { text: "Doc2X（文档解析 / Doc2X）" });
		const dx = el.createEl("ul");
		dx.createEl("li", {
			text: "Doc2X 文档解析接口，擅长 PDF（公式 / 表格 / 版面），直接输出 Markdown。",
		});
		dx.createEl("li", {
			text: "配置：在 Doc2X 控制台获取 API Key（形如 sk-...）填入设置。",
		});
		dx.createEl("li", {
			text: "异步解析：上传后轮询直到完成。配置后用「测试」按钮或「测试 Doc2X」命令验证。",
		});

		el.createEl("h4", { text: "保存位置 / Save location" });
		const s = el.createEl("ul");
		s.createEl("li", {
			text: "Markdown 文件夹与附件文件夹均支持变量：{filename} {date} {noteName}。",
		});
		s.createEl("li", {
			text: "附件重命名支持：保留原名 / note-index / date-index / 自定义模板（{noteName} {index} {date} {ext}）。",
		});
	}

	private linkItem(ul: HTMLElement, label: string, url: string): void {
		const li = ul.createEl("li");
		li.createEl("a", { text: label, href: url });
	}

	onClose(): void {
		this.contentEl.empty();
	}
}
