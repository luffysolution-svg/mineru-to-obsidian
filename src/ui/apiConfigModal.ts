import { Modal, Setting, Notice } from "obsidian";
import type MinerUPlugin from "../main";
import { MINERU_TOKEN_URL } from "../settings";

/**
 * Quick MinerU API config window: enter/clear the token and jump to the
 * official token page. A lightweight alternative to the full settings tab.
 */
export class ApiConfigModal extends Modal {
	private value: string;

	constructor(private plugin: MinerUPlugin) {
		super(plugin.app);
		this.value = plugin.settings.minerUToken;
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.createEl("h2", { text: "MinerU API 配置 / API config" });

		contentEl.createEl("p", {
			text: "填写 Token 以启用 Precision API（支持图片附件）。留空使用免费模式。",
		});

		new Setting(contentEl)
			.setName("API Token")
			.addText((text) => {
				text.inputEl.type = "password";
				text.inputEl.classList.add("mineru-token-input");
				text
					.setPlaceholder("Bearer token ...")
					.setValue(this.value)
					.onChange((v) => (this.value = v.trim()));
			})
			.addExtraButton((btn) =>
				btn
					.setIcon("external-link")
					.setTooltip("获取 Token / Get token")
					.onClick(() => window.open(MINERU_TOKEN_URL))
			);

		new Setting(contentEl)
			.addButton((btn) =>
				btn
					.setButtonText("保存 / Save")
					.setCta()
					.onClick(async () => {
						this.plugin.settings.minerUToken = this.value;
						await this.plugin.saveSettings();
						new Notice("已保存 / Saved");
						this.close();
					})
			)
			.addButton((btn) =>
				btn.setButtonText("打开获取页 / Open token page").onClick(() =>
					window.open(MINERU_TOKEN_URL)
				)
			);
	}

	onClose(): void {
		this.contentEl.empty();
	}
}
