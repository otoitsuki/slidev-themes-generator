# Slidev Themes Generator

**[English](./README.md)**

將 PowerPoint (.pptx) 簡報自動轉換為 [Slidev](https://sli.dev) 主題。  
從簡報中萃取設計 token（色彩、字型、版面、背景）＋ 分析簡報封面產出視覺裝飾元素，轉為好看的 Slidev theme。

<p align="center">
  <a href="https://otoitsuki.github.io/slidev-themes-generator/demo/">
    <img src="docs/demo/preview/1.png" width="70%" alt="Demo — 點擊查看互動簡報" />
  </a>
</p>
<p align="center">
  <a href="https://otoitsuki.github.io/slidev-themes-generator/demo/"><b> Demo</b></a> — 簡報 Theme 自產自銷
</p>

## 功能特色

- **零設定轉換** — 指定一個 `.pptx` 檔案，就能得到可用的 Slidev 主題
- **支援 10 種版面** — cover、intro、default、center、section、statement、two-cols、image-right、image-left、end
- **自動轉換視覺風格** — 抽取 PPTX 配色數值 ＋ 透過 LibreOffice 轉檔封面投影片，分析版面方向、內容重心、裝飾條紋、主色等來製作簡報視覺風格
- **支援圖表樣式** — 讓流程圖、時序圖、圓餅圖等圖表也具備相同視覺風格
- **Theme Showcase** — 內建靜態網站產生器，一頁呈現所有轉換完成的主題
- **Agent First** — 提供 Agent Skill ，丟給 Agent 便能直接使用

## 快速開始

### 前置需求

- [Bun](https://bun.sh)（轉換器的執行環境）
- [pnpm](https://pnpm.io)（套件管理工具）
- [LibreOffice](https://www.libreoffice.org/) + `pdftoppm`（封面視覺分析與投影片匯出）

### 安裝與轉換

```bash
# 複製專案
git clone https://github.com/otoitsuki/slidev-themes-generator.git
cd slidev-themes-generator

# 安裝依賴
pnpm install

# 將要轉換的 PowerPoint 放入 pptx資料夾

# 轉換為 Slidev 主題
pnpm pptx2slidev pptx/MyTemplate.pptx

# 預覽產出的主題
cd packages/themes/slidev-theme-MyTemplate
npx slidev example.md
```

## Agent-First 工作流

本專案設計為搭配 [Claude Code](https://claude.ai/code) 。可直接使用 Skill 操作管理。


| Skill             | 說明                         |
| ----------------- | -------------------------- |
| `/pptx2slidev`    | 自動掃描 `pptx/` 並轉換新的 PPTX 檔案 |
| `/theme-preview`  | 為已產生的主題啟動 Slidev 開發伺服器     |
| `/theme-showcase` | 建置並啟動主題展示頁                 |


## CLI 用法

```
pptx2slidev <input.pptx> [options]

Options:
  --name <name>          主題名稱（預設：從檔名推導）
  --output <dir>         輸出目錄（預設：./packages/themes）
  --color-schema <mode>  色彩模式：light | dark | both（預設：both）
```

### 範例

```bash
# 基本轉換
pnpm pptx2slidev pptx/Nice.pptx

# 自訂名稱與輸出路徑
pnpm pptx2slidev pptx/Nice.pptx --name elegant --output ./my-themes

# 僅 light 模式
pnpm pptx2slidev pptx/Nice.pptx --color-schema light
```

## 專案結構

```
slidev-themes-generator/
├── packages/
│   ├── converter/              # CLI 工具與轉換邏輯
│   │   └── src/
│   │       ├── cli.ts          # 入口：串接四個階段
│   │       ├── extract.ts      # Phase 1：PPTX 解壓
│   │       ├── cover-analyzer.ts # Phase 2：封面視覺分析
│   │       ├── theme-parser.ts # Phase 3：解析與風格偵測
│   │       ├── slidev-generator.ts # Phase 4：檔案產生
│   │       ├── color-utils.ts  # 色彩運算與 WCAG 驗證
│   │       ├── slide-export.ts # 投影片渲染與匯出
│   │       └── types.ts        # TypeScript 型別定義
│   ├── themes/                 # 產出的 Slidev 主題
│   └── showcase/               # 主題展示頁建置工具
├── pptx/            # 原始 PPTX 範本
├── docs/demo/                  # Demo 投影片截圖
└── .claude/                    # Claude Code AI 助手設定
    ├── CLAUDE.md               # 專案上下文
    └── skills/                 # Agent-first 工作流技能
        ├── pptx2slidev.md      # /pptx2slidev — 自動掃描轉換 PPTX
        ├── theme-preview.md    # /theme-preview — 啟動開發伺服器
        └── theme-showcase.md   # /theme-showcase — 建置展示頁
```

## 授權條款

[MIT](./LICENSE)