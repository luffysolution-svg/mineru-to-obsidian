import { App, Modal, Setting } from "obsidian";
import {
	MARKITDOWN_REPO_URL,
	MINERU_DOCS_URL,
	MINERU_TOKEN_URL,
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
