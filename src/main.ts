import { Notice, Plugin, TAbstractFile, TFile } from "obsidian";
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
import { DoclingParser } from "./parsers/docling";
import { TextinParser } from "./parsers/textin";
import { Doc2xParser } from "./parsers/doc2x";
import { notifyError, notifySuccess, saveParseResult } from "./core/saver";
import { parseBatch } from "./core/batch";
import { runDiagnostics } from "./commands/diagnostics";
import { SetupGuideModal } from "./commands/setupGuide";
import { ApiConfigModal } from "./ui/apiConfigModal";
import { testVision } from "./parsers/visionOcr";
import { testBaidu } from "./parsers/baiduOcr";
import { testTextin } from "./parsers/textin";
import { testDoc2x } from "./parsers/doc2x";

export default class MinerUPlugin extends Plugin {
	settings!: PluginSettings;

	private parsers: Record<ParserId, Parser> = {
		mineru: new MinerUParser(),
		markitdown: new MarkitdownParser(),
		vision: new VisionOcrParser(),
		baidu: new BaiduOcrParser(),
		docling: new DoclingParser(),
		textin: new TextinParser(),
		doc2x: new Doc2xParser(),
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

		// Right-click on a multi-selection in the explorer -> batch parse.
		this.registerEvent(
			this.app.workspace.on("files-menu", (menu, files) => {
				const supported = this.collectSupported(files);
				if (supported.length === 0) return;
				menu.addItem((item) =>
					item
						.setTitle(
							`批量解析 ${supported.length} 个文档 / Parse ${supported.length} documents`
						)
						.setIcon("file-scan")
						.onClick(() => this.parseBatchAndSave(supported))
				);
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
		this.addCommand({
			id: "test-textin",
			name: "测试 TextIn 合合 / Test TextIn",
			callback: async () => {
				const notice = new Notice("测试 TextIn 中 / Testing TextIn...", 0);
				const r = await testTextin(this.settings);
				notice.hide();
				new Notice((r.ok ? "✓ " : "❌ ") + r.detail, r.ok ? 6000 : 10000);
			},
		});
		this.addCommand({
			id: "test-doc2x",
			name: "测试 Doc2X / Test Doc2X",
			callback: async () => {
				const notice = new Notice("测试 Doc2X 中 / Testing Doc2X...", 0);
				const r = await testDoc2x(this.settings);
				notice.hide();
				new Notice((r.ok ? "✓ " : "❌ ") + r.detail, r.ok ? 6000 : 10000);
			},
		});

		this.addSettingTab(new MinerUSettingTab(this.app, this));
	}

	private isSupported(file: TFile): boolean {
		return SUPPORTED_EXTENSIONS.includes(file.extension.toLowerCase());
	}

	/** Filter a mixed selection down to supported files. */
	private collectSupported(files: TAbstractFile[]): TFile[] {
		return files.filter(
			(f): f is TFile => f instanceof TFile && this.isSupported(f)
		);
	}

	/** Parse and save many files with backend-aware concurrency. */
	async parseBatchAndSave(files: TFile[]): Promise<void> {
		const parser = this.parsers[this.settings.parser];
		await parseBatch(this.app, parser, files, this.settings);
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
