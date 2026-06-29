import { App, PluginSettingTab, Setting, Notice } from "obsidian";
import type MinerUPlugin from "./main";
import type { ParserId } from "./parsers/types";
import { SetupGuideModal } from "./commands/setupGuide";
import { runDiagnostics } from "./commands/diagnostics";

/** MinerU token management page — where users obtain an API token. */
export const MINERU_TOKEN_URL = "https://mineru.net/apiManage/token";
export const MINERU_DOCS_URL = "https://mineru.net/apiManage/docs";
export const MARKITDOWN_REPO_URL = "https://github.com/microsoft/markitdown";

export type RenameMode = "keep" | "note-index" | "date-index" | "custom";

export interface PluginSettings {
	/** Which backend to use. */
	parser: ParserId;

	/** MinerU API token. Empty -> free (Agent) mode. */
	minerUToken: string;
	/** When token is empty, fall back to the free Agent API. */
	useFreeWhenNoToken: boolean;
	/** OCR / formula / table options for MinerU. */
	minerUEnableOcr: boolean;
	minerUEnableFormula: boolean;
	minerUEnableTable: boolean;
	/** Document language hint (MinerU `language` field). */
	minerULanguage: string;

	/** markitdown CLI command (default "markitdown"). */
	markitdownCommand: string;

	/** Folder for the generated markdown note. Supports {filename} {date}. */
	markdownSavePath: string;
	/** Folder for extracted image attachments. Supports {filename} {date} {noteName}. */
	attachmentSavePath: string;

	/** How to rename extracted attachments. */
	attachmentRename: RenameMode;
	/** Template used when attachmentRename === "custom". Supports {noteName} {index} {date} {ext}. */
	attachmentRenameTemplate: string;
}

export const DEFAULT_SETTINGS: PluginSettings = {
	parser: "mineru",
	minerUToken: "",
	useFreeWhenNoToken: true,
	minerUEnableOcr: false,
	minerUEnableFormula: true,
	minerUEnableTable: true,
	minerULanguage: "ch",
	markitdownCommand: "markitdown",
	markdownSavePath: "MinerU/{filename}",
	attachmentSavePath: "MinerU/{filename}/images",
	attachmentRename: "note-index",
	attachmentRenameTemplate: "{noteName}-{index}.{ext}",
};

export class MinerUSettingTab extends PluginSettingTab {
	plugin: MinerUPlugin;

	constructor(app: App, plugin: MinerUPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		// --- Backend selection ---
		new Setting(containerEl)
			.setName("解析后端 / Parser backend")
			.setDesc("选择文档解析方式。MinerU 走云端 API；markitdown 调用本地 Python CLI。")
			.addDropdown((dd) =>
				dd
					.addOption("mineru", "MinerU (云端 / cloud)")
					.addOption("markitdown", "markitdown (本地 CLI / local)")
					.setValue(this.plugin.settings.parser)
					.onChange(async (v) => {
						this.plugin.settings.parser = v as ParserId;
						await this.plugin.saveSettings();
						this.display();
					})
			);

		if (this.plugin.settings.parser === "mineru") {
			this.displayMinerUSettings(containerEl);
		} else {
			this.displayMarkitdownSettings(containerEl);
		}

		this.displaySaveSettings(containerEl);
		this.displayHelpSettings(containerEl);
	}

	private displayMinerUSettings(containerEl: HTMLElement): void {
		new Setting(containerEl).setName("MinerU").setHeading();

		new Setting(containerEl)
			.setName("API Token")
			.setDesc(
				"可选。填写后使用 Precision API（支持图片附件提取）。留空则使用免费模式（仅 Markdown，无图片，限 10MB/20 页）。"
			)
			.addText((text) => {
				text.inputEl.type = "password";
				text
					.setPlaceholder("Bearer token ...")
					.setValue(this.plugin.settings.minerUToken)
					.onChange(async (v) => {
						this.plugin.settings.minerUToken = v.trim();
						await this.plugin.saveSettings();
					});
			})
			.addExtraButton((btn) =>
				btn
					.setIcon("external-link")
					.setTooltip("获取 Token / Get token: " + MINERU_TOKEN_URL)
					.onClick(() => window.open(MINERU_TOKEN_URL))
			);

		new Setting(containerEl)
			.setName("无 Token 时使用免费模式 / Use free mode when no token")
			.setDesc("未填写 Token 时自动回退到免费的 Agent API。关闭则未配置 Token 时直接报错。")
			.addToggle((t) =>
				t
					.setValue(this.plugin.settings.useFreeWhenNoToken)
					.onChange(async (v) => {
						this.plugin.settings.useFreeWhenNoToken = v;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("文档语言 / Document language")
			.setDesc("MinerU language 字段，如 ch（中文）、en（英文）。")
			.addText((text) =>
				text
					.setValue(this.plugin.settings.minerULanguage)
					.onChange(async (v) => {
						this.plugin.settings.minerULanguage = v.trim() || "ch";
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("启用 OCR / Enable OCR")
			.addToggle((t) =>
				t.setValue(this.plugin.settings.minerUEnableOcr).onChange(async (v) => {
					this.plugin.settings.minerUEnableOcr = v;
					await this.plugin.saveSettings();
				})
			);

		new Setting(containerEl)
			.setName("公式识别 / Formula recognition")
			.addToggle((t) =>
				t
					.setValue(this.plugin.settings.minerUEnableFormula)
					.onChange(async (v) => {
						this.plugin.settings.minerUEnableFormula = v;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("表格识别 / Table recognition")
			.addToggle((t) =>
				t
					.setValue(this.plugin.settings.minerUEnableTable)
					.onChange(async (v) => {
						this.plugin.settings.minerUEnableTable = v;
						await this.plugin.saveSettings();
					})
			);
	}

	private displayMarkitdownSettings(containerEl: HTMLElement): void {
		new Setting(containerEl).setName("markitdown").setHeading();

		const desc = document.createDocumentFragment();
		desc.append(
			"本地命令，需先安装：",
			createEl("code", { text: "pip install 'markitdown[all]'" }),
			"。markitdown 不提取图片附件。仅桌面端可用。"
		);
		new Setting(containerEl)
			.setName("markitdown 命令 / command")
			.setDesc(desc)
			.addText((text) =>
				text
					.setPlaceholder("markitdown")
					.setValue(this.plugin.settings.markitdownCommand)
					.onChange(async (v) => {
						this.plugin.settings.markitdownCommand = v.trim() || "markitdown";
						await this.plugin.saveSettings();
					})
			);
	}

	private displaySaveSettings(containerEl: HTMLElement): void {
		new Setting(containerEl).setName("保存位置 / Save location").setHeading();

		new Setting(containerEl)
			.setName("Markdown 保存文件夹 / Markdown folder")
			.setDesc("支持变量 {filename}（原文件名，不含扩展名）、{date}（YYYY-MM-DD）。")
			.addText((text) =>
				text
					.setPlaceholder("MinerU/{filename}")
					.setValue(this.plugin.settings.markdownSavePath)
					.onChange(async (v) => {
						this.plugin.settings.markdownSavePath = v.trim();
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("附件保存文件夹 / Attachment folder")
			.setDesc("图片附件保存位置。支持 {filename} {date} {noteName}。")
			.addText((text) =>
				text
					.setPlaceholder("MinerU/{filename}/images")
					.setValue(this.plugin.settings.attachmentSavePath)
					.onChange(async (v) => {
						this.plugin.settings.attachmentSavePath = v.trim();
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("附件重命名 / Attachment rename")
			.setDesc("提取的图片如何命名。")
			.addDropdown((dd) =>
				dd
					.addOption("keep", "保留原名 / Keep original")
					.addOption("note-index", "{noteName}-{序号} / note-index")
					.addOption("date-index", "{date}-{序号} / date-index")
					.addOption("custom", "自定义模板 / Custom template")
					.setValue(this.plugin.settings.attachmentRename)
					.onChange(async (v) => {
						this.plugin.settings.attachmentRename = v as RenameMode;
						await this.plugin.saveSettings();
						this.display();
					})
			);

		if (this.plugin.settings.attachmentRename === "custom") {
			new Setting(containerEl)
				.setName("重命名模板 / Rename template")
				.setDesc("支持 {noteName} {index} {date} {ext}。")
				.addText((text) =>
					text
						.setPlaceholder("{noteName}-{index}.{ext}")
						.setValue(this.plugin.settings.attachmentRenameTemplate)
						.onChange(async (v) => {
							this.plugin.settings.attachmentRenameTemplate =
								v.trim() || "{noteName}-{index}.{ext}";
							await this.plugin.saveSettings();
						})
				);
		}
	}

	private displayHelpSettings(containerEl: HTMLElement): void {
		new Setting(containerEl).setName("帮助 / Help").setHeading();

		new Setting(containerEl)
			.setName("检测配置 / Check configuration")
			.setDesc("校验 Token、免费模式、markitdown CLI 与保存路径。")
			.addButton((btn) =>
				btn.setButtonText("检测 / Check").onClick(async () => {
					await runDiagnostics(this.plugin);
				})
			);

		new Setting(containerEl)
			.setName("安装与配置引导 / Setup guide")
			.setDesc("查看简约 / 详细配置说明与官网链接。")
			.addButton((btn) =>
				btn
					.setButtonText("打开引导 / Open guide")
					.onClick(() => new SetupGuideModal(this.app).open())
			);

		new Setting(containerEl)
			.setName("MinerU 官方文档 / Official docs")
			.addButton((btn) =>
				btn.setButtonText("API 文档").onClick(() => window.open(MINERU_DOCS_URL))
			)
			.addButton((btn) =>
				btn.setButtonText("获取 Token").onClick(() => window.open(MINERU_TOKEN_URL))
			);
	}
}
