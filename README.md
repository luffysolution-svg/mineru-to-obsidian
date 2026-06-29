# MinerU to Obsidian

> 右键解析文档为 Markdown，正文与图片附件分别保存到自定义位置。
> Right-click any document to parse it into Markdown with **MinerU** or **markitdown**, saving the note and image attachments to custom folders.

---

## 功能 / Features

- 在文件浏览器中右键文档，选择 **解析文档 / Parse document**。
- 两个解析后端：
  - **MinerU**（云端）— 免费模式（无需 Token）或 Precision API（带 Token，支持提取图片附件）。
  - **markitdown**（本地）— 调用本地 Python CLI，仅桌面端，不提取图片。
- 自定义 Markdown 与附件保存路径，支持变量 `{filename}` `{date}` `{noteName}`。
- 附件重命名：保留原名 / `{noteName}-{序号}` / `{date}-{序号}` / 自定义模板。
- 成功 / 失败 Notice 提示。
- 命令：**检测配置**、**安装与配置引导**、**配置 MinerU API**。

支持的文件类型 / Supported: `pdf, doc, docx, ppt, pptx, xls, xlsx, png, jpg, jpeg, jp2, webp, gif, bmp, html`。

---

## 安装 / Installation

### 方式一：BRAT（推荐 / recommended）

通过 [BRAT](https://github.com/TfTHacker/obsidian42-brat) 安装可自动获取更新：

1. 在 Obsidian 中安装并启用 **BRAT** 社区插件。
2. 命令面板运行 **"BRAT: Add a beta plugin for testing"**。
3. 填入仓库地址：`luffysolution-svg/mineru-to-obsidian`
4. BRAT 会自动下载最新 Release 并启用插件。

### 方式二：手动 / manual

1. 从 [Releases](https://github.com/luffysolution-svg/mineru-to-obsidian/releases) 下载 `manifest.json` 与 `main.js`。
2. 放入你的库目录 `<vault>/.obsidian/plugins/mineru-to-obsidian/`。
3. 在 Obsidian 的「设置 → 第三方插件」中启用。

### 方式三：从源码构建 / from source

```bash
git clone https://github.com/luffysolution-svg/mineru-to-obsidian.git
cd mineru-to-obsidian
npm install && npm run build
```

将生成的 `main.js` 与 `manifest.json` 复制到插件目录即可。

> 本插件为 **桌面端专用**（`isDesktopOnly: true`），因 markitdown 后端需要本地进程，且结果解压依赖打包库。

---

## 配置 / Configuration

### MinerU

| 模式 | 是否需要 Token | 限制 | 图片附件 |
|------|----------------|------|----------|
| 免费 (Agent API) | 否 | ≤ 10MB / ≤ 20 页 | ✗ |
| Precision API | 是 | ≤ 200MB / ≤ 200 页 | ✓ |

- 获取 Token：<https://mineru.net/apiManage/token>
- API 文档：<https://mineru.net/apiManage/docs>
- 在插件设置中填入 Token 即自动启用 Precision API；留空则使用免费模式（可在设置中关闭免费回退）。

### markitdown

```bash
pip install 'markitdown[all]'
```

- 默认命令为 `markitdown`，可在设置中改为完整路径。
- 需要本地已安装 Python；不提取图片附件。
- 仓库：<https://github.com/microsoft/markitdown>

### 保存路径 / Save paths

- **Markdown 文件夹** 与 **附件文件夹** 均支持变量 `{filename}`（原文件名）、`{date}`（YYYY-MM-DD）、`{noteName}`。
- 例：`MinerU/{filename}` 与 `MinerU/{filename}/images`。

---

## 命令 / Commands

- **检测配置 / Check configuration** — 校验 Token、免费模式、markitdown CLI 与保存路径。
- **安装与配置引导 / Setup & configuration guide** — 简约 / 详细说明与官网链接。
- **配置 MinerU API / Configure MinerU API** — 快速填写 Token。

---

## 常见问题 / Troubleshooting

**markitdown 解析 PDF 出现满屏 `(cid:NN)`？**
该 PDF 使用了自定义编码且无 ToUnicode 映射的嵌入字体，markitdown（基于 pdfminer，无 OCR）无法解码。插件会检测到此情况并报错提示。**请改用 MinerU 后端**（设置 → 解析后端 → MinerU），它具备 OCR 与版面分析能力。

**后端如何选择？**
- **MinerU**：扫描件、复杂版面、需要图片/公式/表格、CID 编码 PDF → 首选。
- **markitdown**：Office 文档（docx/pptx/xlsx）、文本规整的 PDF、离线快速转换。

**插件不显示？** 安装/更新后需在 Obsidian 中重载（`Ctrl+P` → "Reload app without saving"），并确认未开启「受限模式」。

---

## 开发 / Development

```bash
npm install
npm run dev     # watch 模式
npm run build   # 生产构建（含类型检查）
```

## License

MIT
