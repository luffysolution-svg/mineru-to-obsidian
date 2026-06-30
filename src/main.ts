import { Notice, Plugin, TFile } from "obsidian";
import {
	DEFAULT_SETTINGS,
	MinerUSettingTab,
	PluginSettings,
} from "./settings";
import { Parser, ParserId, SUPPORTED_EXTENSIONS } from "./parsers/types";
import { MinerUParser } from "./parsers/minerU";
import { MarkitdownParser } from "./parsers/markitdown";
import { VisionOcrParser } from "./parsers/visionOcr";
import { BaiduOcrParser } from "./parsers/baiduOcr";
import { notifyError, notifySuccess, saveParseResult } from "./core/saver";
import { runDiagnostics } from "./commands/diagnostics";
import { SetupGuideModal } from "./commands/setupGuide";
import { ApiConfigModal } from "./ui/apiConfigModal";
import { testVision } from "./parsers/visionOcr";
import { testBaidu } from "./parsers/baiduOcr";

export default class MinerUPlugin extends Plugin {
	settings!: PluginSettings;

	private parsers: Record<ParserId, Parser> = {
		mineru: new MinerUParser(),
		markitdown: new MarkitdownParser(),
		vision: new VisionOcrParser(),
		baidu: new BaiduOcrParser(),
	};

	async onload(): Promise<void> {
		await this.loadSettings();

		// Right-click on a supported file in the explorer.
		this.registerEvent(
			this.app.workspace.on("file-menu", (menu, file) => {
				if (file instanceof TFile && this.isSupported(file)) {
					menu.addItem((item) =>
						item
							.setTitle("解析文档 / Parse document")
							.setIcon("file-scan")
							.onClick(() => this.parseAndSave(file))
					);
				}
			})
		);

		// Commands.
		this.addCommand({
			id: "check-configuration",
			name: "检测配置 / Check configuration",
			callback: () => runDiagnostics(this),
		});
		this.addCommand({
			id: "setup-guide",
			name: "安装与配置引导 / Setup & configuration guide",
			callback: () => new SetupGuideModal(this.app).open(),
		});
		this.addCommand({
			id: "configure-api",
			name: "配置 MinerU API / Configure MinerU API",
			callback: () => new ApiConfigModal(this).open(),
		});
		this.addCommand({
			id: "test-vision-ocr",
			name: "测试视觉 OCR / Test vision OCR",
			callback: async () => {
				const notice = new Notice("测试识图中 / Testing vision...", 0);
				const r = await testVision(this.settings);
				notice.hide();
				new Notice((r.ok ? "✓ " : "❌ ") + r.detail, r.ok ? 6000 : 10000);
			},
		});
		this.addCommand({
			id: "test-baidu-ocr",
			name: "测试百度 OCR / Test Baidu OCR",
			callback: async () => {
				const notice = new Notice("测试百度 OCR 中 / Testing Baidu...", 0);
				const r = await testBaidu(this.settings);
				notice.hide();
				new Notice((r.ok ? "✓ " : "❌ ") + r.detail, r.ok ? 6000 : 10000);
			},
		});

		this.addSettingTab(new MinerUSettingTab(this.app, this));
	}

	private isSupported(file: TFile): boolean {
		return SUPPORTED_EXTENSIONS.includes(file.extension.toLowerCase());
	}

	/** Parse a file with the selected backend and save the result. */
	async parseAndSave(file: TFile): Promise<void> {
		const parser = this.parsers[this.settings.parser];
		const notice = new Notice(
			`解析中 / Parsing (${parser.label}): ${file.name} ...`,
			0
		);
		try {
			const result = await parser.parse(file, this.settings);
			const outcome = await saveParseResult(
				this.app,
				file,
				result,
				this.settings
			);
			notice.hide();
			notifySuccess(outcome);
		} catch (err) {
			notice.hide();
			notifyError(err);
		}
	}

	async loadSettings(): Promise<void> {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
	}
}
