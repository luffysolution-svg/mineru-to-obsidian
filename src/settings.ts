import { App, PluginSettingTab, Setting, Notice } from "obsidian";
import type MinerUPlugin from "./main";
import type { ParserId } from "./parsers/types";
import { SetupGuideModal } from "./commands/setupGuide";
import { runDiagnostics } from "./commands/diagnostics";
import { testVision, fetchModels } from "./parsers/visionOcr";
import { testBaidu } from "./parsers/baiduOcr";

/** MinerU token management page — where users obtain an API token. */
export const MINERU_TOKEN_URL = "https://mineru.net/apiManage/token";
export const MINERU_DOCS_URL = "https://mineru.net/apiManage/docs";
export const MARKITDOWN_REPO_URL = "https://github.com/microsoft/markitdown";
/** Baidu AI Cloud OCR console — where users create an app and get AK/SK. */
export const BAIDU_CONSOLE_URL =
	"https://console.bce.baidu.com/ai/#/ai/ocr/overview/index";
export const BAIDU_DOCS_URL = "https://cloud.baidu.com/doc/OCR/s/Klxag8wiy";

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

	/** Vision-LLM OCR: OpenAI-compatible base URL (e.g. https://api.openai.com/v1). */
	visionBaseUrl: string;
	/** Vision-LLM OCR: API key. */
	visionApiKey: string;
	/** Vision-LLM OCR: model name (must support image input, e.g. gpt-4o). */
	visionModel: string;
	/** Vision-LLM OCR: cached model IDs fetched from /models (for the dropdown). */
	visionModels: string[];
	/** Vision-LLM OCR: prompt sent alongside the image. */
	visionPrompt: string;

	/** Baidu OCR (文档解析): API Key. */
	baiduApiKey: string;
	/** Baidu OCR (文档解析): Secret Key. */
	baiduSecretKey: string;
	/** Baidu OCR: recognize formulas in the document. */
	baiduRecognizeFormula: boolean;

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
	visionBaseUrl: "https://api.openai.com/v1",
	visionApiKey: "",
	visionModel: "gpt-4o-mini",
	visionModels: [],
	visionPrompt:
		"请将这张图片的内容完整转写为 Markdown，保留标题、列表、表格与公式结构，只输出 Markdown 正文，不要添加任何解释或代码块包裹。",
	baiduApiKey: "",
	baiduSecretKey: "",
	baiduRecognizeFormula: true,
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
					.addOption("vision", "视觉 LLM OCR (识图 / vision)")
					.addOption("baidu", "百度 OCR (文档解析 / Baidu)")
					.setValue(this.plugin.settings.parser)
					.onChange(async (v) => {
						this.plugin.settings.parser = v as ParserId;
						await this.plugin.saveSettings();
						this.display();
					})
			);

		if (this.plugin.settings.parser === "mineru") {
			this.displayMinerUSettings(containerEl);
		} else if (this.plugin.settings.parser === "markitdown") {
			this.displayMarkitdownSettings(containerEl);
		} else if (this.plugin.settings.parser === "baidu") {
			this.displayBaiduSettings(containerEl);
		} else {
			this.displayVisionSettings(containerEl);
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

	private displayVisionSettings(containerEl: HTMLElement): void {
		new Setting(containerEl).setName("视觉 LLM OCR").setHeading();

		const desc = document.createDocumentFragment();
		desc.append(
			"使用 OpenAI 兼容接口（OpenAI、new-api / one-api 中转站等）的视觉模型识别图片内容并转为 Markdown。",
			createEl("br"),
			"仅支持图片文件（png/jpg/jpeg/webp/gif/bmp）。模型必须支持图片输入。"
		);
		new Setting(containerEl).setDesc(desc);

		new Setting(containerEl)
			.setName("API 地址 / Base URL")
			.setDesc("OpenAI 兼容地址，通常以 /v1 结尾。例如 https://api.openai.com/v1 或中转站地址。")
			.addText((text) =>
				text
					.setPlaceholder("https://api.openai.com/v1")
					.setValue(this.plugin.settings.visionBaseUrl)
					.onChange(async (v) => {
						this.plugin.settings.visionBaseUrl = v.trim();
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("API Key")
			.setDesc("用于鉴权的密钥（中转站的 key 同样填这里）。")
			.addText((text) => {
				text.inputEl.type = "password";
				text
					.setPlaceholder("sk-...")
					.setValue(this.plugin.settings.visionApiKey)
					.onChange(async (v) => {
						this.plugin.settings.visionApiKey = v.trim();
						await this.plugin.saveSettings();
					});
			});

		// Model: free-text entry, plus a "fetch list" button that turns the
		// field into a dropdown once models are retrieved from /models.
		const models = this.plugin.settings.visionModels;
		const modelSetting = new Setting(containerEl)
			.setName("模型 / Model")
			.setDesc("需支持图片输入，如 gpt-4o、gpt-4o-mini、qwen-vl-max。可点右侧按钮通过 Key 拉取模型列表。");

		if (models.length > 0) {
			modelSetting.addDropdown((dd) => {
				for (const m of models) dd.addOption(m, m);
				// Ensure the current value is selectable even if not in the list.
				if (!models.includes(this.plugin.settings.visionModel)) {
					dd.addOption(
						this.plugin.settings.visionModel,
						this.plugin.settings.visionModel + "（自定义 / custom）"
					);
				}
				dd.setValue(this.plugin.settings.visionModel).onChange(async (v) => {
					this.plugin.settings.visionModel = v;
					await this.plugin.saveSettings();
				});
			});
		} else {
			modelSetting.addText((text) =>
				text
					.setPlaceholder("gpt-4o-mini")
					.setValue(this.plugin.settings.visionModel)
					.onChange(async (v) => {
						this.plugin.settings.visionModel = v.trim();
						await this.plugin.saveSettings();
					})
			);
		}

		modelSetting.addButton((btn) =>
			btn
				.setButtonText("获取模型 / Fetch")
				.setTooltip("通过 API Key 拉取可用模型列表 / fetch model list")
				.onClick(async () => {
					btn.setDisabled(true);
					btn.setButtonText("获取中... / Fetching");
					try {
						const list = await fetchModels(
							this.plugin.settings.visionBaseUrl,
							this.plugin.settings.visionApiKey
						);
						this.plugin.settings.visionModels = list;
						await this.plugin.saveSettings();
						new Notice(`获取到 ${list.length} 个模型 / ${list.length} models`);
						this.display();
					} catch (e) {
						new Notice(
							"获取失败 / failed: " +
								(e instanceof Error ? e.message : String(e)),
							8000
						);
						btn.setDisabled(false);
						btn.setButtonText("获取模型 / Fetch");
					}
				})
		);

		new Setting(containerEl)
			.setName("提示词 / Prompt")
			.setDesc("发送给模型的指令，决定输出风格。")
			.addTextArea((ta) => {
				ta.inputEl.rows = 3;
				ta.inputEl.style.width = "100%";
				ta
					.setValue(this.plugin.settings.visionPrompt)
					.onChange(async (v) => {
						this.plugin.settings.visionPrompt = v;
						await this.plugin.saveSettings();
					});
			});

		// Test button + result line.
		const resultEl = createEl("div", {
			cls: "setting-item-description",
			text: "",
		});
		new Setting(containerEl)
			.setName("测试识图 / Test vision")
			.setDesc("发送一张含已知数字的测试图，验证连接、鉴权与识图能力。")
			.addButton((btn) =>
				btn
					.setButtonText("测试 / Test")
					.setCta()
					.onClick(async () => {
						btn.setDisabled(true);
						btn.setButtonText("测试中 / Testing...");
						resultEl.setText("");
						const r = await testVision(this.plugin.settings);
						resultEl.setText((r.ok ? "✓ " : "✗ ") + r.detail);
						resultEl.style.color = r.ok
							? "var(--text-success)"
							: "var(--text-error)";
						btn.setDisabled(false);
						btn.setButtonText("测试 / Test");
					})
			);
		containerEl.appendChild(resultEl);
	}

	private displayBaiduSettings(containerEl: HTMLElement): void {
		new Setting(containerEl).setName("百度 OCR（文档解析）").setHeading();

		const desc = document.createDocumentFragment();
		desc.append(
			"使用百度智能云「文档解析」接口，支持 PDF / 图片 / Office，直接输出 Markdown（含表格、公式、版面）。",
			createEl("br"),
			"需在百度智能云创建应用并开通「文字识别」服务，获取 API Key 与 Secret Key。需实名认证以领取免费额度。"
		);
		new Setting(containerEl).setDesc(desc);

		new Setting(containerEl)
			.setName("API Key")
			.setDesc("应用的 API Key（client_id）。")
			.addText((text) => {
				text.inputEl.type = "password";
				text
					.setPlaceholder("API Key ...")
					.setValue(this.plugin.settings.baiduApiKey)
					.onChange(async (v) => {
						this.plugin.settings.baiduApiKey = v.trim();
						await this.plugin.saveSettings();
					});
			})
			.addExtraButton((btn) =>
				btn
					.setIcon("external-link")
					.setTooltip("获取 AK/SK / Get keys: " + BAIDU_CONSOLE_URL)
					.onClick(() => window.open(BAIDU_CONSOLE_URL))
			);

		new Setting(containerEl)
			.setName("Secret Key")
			.setDesc("应用的 Secret Key（client_secret）。")
			.addText((text) => {
				text.inputEl.type = "password";
				text
					.setPlaceholder("Secret Key ...")
					.setValue(this.plugin.settings.baiduSecretKey)
					.onChange(async (v) => {
						this.plugin.settings.baiduSecretKey = v.trim();
						await this.plugin.saveSettings();
					});
			});

		new Setting(containerEl)
			.setName("公式识别 / Formula recognition")
			.addToggle((t) =>
				t
					.setValue(this.plugin.settings.baiduRecognizeFormula)
					.onChange(async (v) => {
						this.plugin.settings.baiduRecognizeFormula = v;
						await this.plugin.saveSettings();
					})
			);

		// Test button + result line.
		const resultEl = createEl("div", {
			cls: "setting-item-description",
			text: "",
		});
		new Setting(containerEl)
			.setName("测试连接 / Test")
			.setDesc("发送一张测试图，验证鉴权、接口权限与解析流程。")
			.addButton((btn) =>
				btn
					.setButtonText("测试 / Test")
					.setCta()
					.onClick(async () => {
						btn.setDisabled(true);
						btn.setButtonText("测试中 / Testing...");
						resultEl.setText("");
						const r = await testBaidu(this.plugin.settings);
						resultEl.setText((r.ok ? "✓ " : "✗ ") + r.detail);
						resultEl.style.color = r.ok
							? "var(--text-success)"
							: "var(--text-error)";
						btn.setDisabled(false);
						btn.setButtonText("测试 / Test");
					})
			);
		containerEl.appendChild(resultEl);
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

		new Setting(containerEl)
			.setName("百度 OCR 官方 / Baidu OCR")
			.addButton((btn) =>
				btn.setButtonText("文档解析文档").onClick(() => window.open(BAIDU_DOCS_URL))
			)
			.addButton((btn) =>
				btn.setButtonText("控制台 / Console").onClick(() => window.open(BAIDU_CONSOLE_URL))
			);
	}
}
