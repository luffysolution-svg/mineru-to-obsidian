# MinerU to Obsidian

> 右键解析文档为 Markdown，正文与图片附件分别保存到自定义位置。
> Right-click any document to parse it into Markdown with **MinerU** or **markitdown**, saving the note and image attachments to custom folders.

---

## 功能 / Features

- 在文件浏览器中右键文档，选择 **解析文档 / Parse document**。
- 四个解析后端：
  - **MinerU**（云端）— 免费模式（无需 Token）或 Precision API（带 Token，支持提取图片附件）。
  - **markitdown**（本地）— 调用本地 Python CLI，仅桌面端，不提取图片。
  - **视觉 LLM OCR**（识图）— 用 OpenAI 兼容接口的视觉模型识别**图片**中的文字并转为 Markdown，兼容第三方中转站（new-api / one-api 等）。
  - **百度 OCR**（文档解析）— 百度智能云文档解析接口，支持 **PDF / 图片 / Office**，直接输出含表格、公式、版面的 Markdown。
- 自定义 Markdown 与附件保存路径，支持变量 `{filename}` `{date}` `{noteName}`。
- 附件重命名：保留原名 / `{noteName}-{序号}` / `{date}-{序号}` / 自定义模板。
- 成功 / 失败 Notice 提示。
- 命令：**检测配置**、**安装与配置引导**、**配置 MinerU API**、**测试视觉 OCR**、**测试百度 OCR**。

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

### 视觉 LLM OCR / Vision OCR

用 OpenAI 兼容接口的视觉模型识别**图片**中的文字并转为 Markdown。markitdown 的 CLI 无法驱动 LLM，因此这是插件内独立实现的后端（直接调用 `/chat/completions`），天然兼容各类 OpenAI 兼容服务与中转站。

| 配置项 | 说明 |
|--------|------|
| API 地址 / Base URL | 如 `https://api.openai.com/v1` 或中转站地址 |
| API Key | 鉴权密钥（中转站 key 同样填这里） |
| 模型 / Model | 须支持图片输入，如 `gpt-4o`、`gpt-4o-mini`、`qwen-vl-max` |
| 提示词 / Prompt | 发送给模型的指令，决定输出风格 |

- **获取模型 / Fetch**：通过 API Key 调用 `/models` 拉取可用模型列表，拉取后模型项变为下拉选择。
- **测试识图 / Test**：发送一张含已知数字的测试图，验证连接、鉴权与**识图能力**（连得上但模型不支持图片会明确提示）。也可用命令 **测试视觉 OCR**。
- 仅支持图片：`png / jpg / jpeg / webp / gif / bmp`。其他文档请用 MinerU 或 markitdown。

> **用 DeepSeek-OCR？** DeepSeek-OCR 是开源自托管模型，无官方托管 API。可经第三方（如硅基流动 SiliconFlow）以 OpenAI 兼容接口调用：地址填 `https://api.siliconflow.cn/v1`，模型填 `deepseek-ai/DeepSeek-OCR`，其余同上。

### 百度 OCR（文档解析）/ Baidu OCR

百度智能云「文档解析」接口，支持 **PDF / 图片 / Office**，直接输出含表格、公式、版面的 Markdown。鉴权用 API Key + Secret Key 换取 `access_token`（插件自动处理）。

| 配置项 | 说明 |
|--------|------|
| API Key | 应用的 API Key（client_id） |
| Secret Key | 应用的 Secret Key（client_secret） |
| 公式识别 / Formula | 是否识别文档中的公式 |

- 控制台（创建应用、获取 AK/SK）：<https://console.bce.baidu.com/ai/#/ai/ocr/overview/index>
- 文档解析文档：<https://cloud.baidu.com/doc/OCR/s/Klxag8wiy>
- 需在控制台**开通「文字识别」服务**并完成**实名认证**才能领取免费额度并调用。免费额度与计费以百度控制台为准。
- **测试 / Test**：发送一张含已知数字的测试图，验证鉴权、接口权限与解析流程。也可用命令 **测试百度 OCR**。

### 保存路径 / Save paths

- **Markdown 文件夹** 与 **附件文件夹** 均支持变量 `{filename}`（原文件名）、`{date}`（YYYY-MM-DD）、`{noteName}`。
- 例：`MinerU/{filename}` 与 `MinerU/{filename}/images`。

---

## 命令 / Commands

- **检测配置 / Check configuration** — 校验 Token、免费模式、markitdown CLI 与保存路径。
- **安装与配置引导 / Setup & configuration guide** — 简约 / 详细说明与官网链接。
- **配置 MinerU API / Configure MinerU API** — 快速填写 Token。
- **测试视觉 OCR / Test vision OCR** — 验证视觉模型的连接、鉴权与识图能力。
- **测试百度 OCR / Test Baidu OCR** — 验证百度 AK/SK 的鉴权、接口权限与解析流程。

---

## 常见问题 / Troubleshooting

**markitdown 解析 PDF 出现满屏 `(cid:NN)`？**
该 PDF 使用了自定义编码且无 ToUnicode 映射的嵌入字体，markitdown（基于 pdfminer，无 OCR）无法解码。插件会检测到此情况并报错提示。**请改用 MinerU 后端**（设置 → 解析后端 → MinerU），它具备 OCR 与版面分析能力。

**markitdown 中文显示为 `���`（乱码）？** 已在 v0.1.2 修复：插件强制 Python 以 UTF-8 输出（`PYTHONUTF8`），解决中文 Windows 下控制台编码导致的乱码。请更新到最新版本。

**后端如何选择？**
- **MinerU**：扫描件、复杂版面、需要图片/公式/表格、CID 编码 PDF → 首选。
- **markitdown**：Office 文档（docx/pptx/xlsx）、文本规整的 PDF、离线快速转换。
- **视觉 LLM OCR**：单张图片/截图的文字识别，或想用自己的（中转）大模型转写图片时。
- **百度 OCR**：国内网络、需要稳定的 PDF / Office → Markdown，且想用百度免费额度时。

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
