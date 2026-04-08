# Slidev Themes Generator

**[正體中文](./README.zh-TW.md)**

Automatically convert PowerPoint (.pptx) presentations into [Slidev](https://sli.dev) themes.  
Extracts design tokens (colors, fonts, layouts, backgrounds) + analyzes the cover slide to generate matching visual decorations, producing beautiful Slidev themes.

<p align="center">
  <a href="https://otoitsuki.github.io/slidev-themes-generator/demo/">
    <img src="docs/demo/preview/1.png" width="70%" alt="Demo — Click to view interactive slides" />
  </a>
</p>
<p align="center">
  <a href="https://otoitsuki.github.io/slidev-themes-generator/demo/"><b>View Interactive Demo</b></a> — Generated from this project
</p>

## Features

- **Zero-config conversion** — Point at a `.pptx` file, get a working Slidev theme
- **10 layout components** — cover, intro, default, center, section, statement, two-cols, image-right, image-left, end
- **Auto visual style conversion** — Extracts PPTX color scheme + renders cover slide via LibreOffice to analyze layout direction, content gravity, decorative bars, and dominant colors
- **Diagram styling** — Flowcharts, sequence diagrams, pie charts, and other diagrams inherit the same visual style
- **Theme Showcase** — Built-in static site generator to preview all converted themes on a single page
- **Agent First** — Provides Agent Skills for direct AI-assisted operation

## Quick Start

### Prerequisites

- [Bun](https://bun.sh) (converter runtime)
- [pnpm](https://pnpm.io) (package manager)
- [LibreOffice](https://www.libreoffice.org/) + `pdftoppm` (cover visual analysis and slide export)

### Install & Convert

```bash
# Clone the repo
git clone https://github.com/otoitsuki/slidev-themes-generator.git
cd slidev-themes-generator

# Install dependencies
pnpm install

# Place PowerPoint files in the pptx/ folder

# Convert to Slidev theme
pnpm pptx2slidev pptx/MyTemplate.pptx

# Preview the generated theme
cd packages/themes/slidev-theme-MyTemplate
npx slidev example.md
```

## Agent-First Workflow

Designed to work with [Claude Code](https://claude.ai/code). Use Skills directly to operate and manage.

| Skill             | Description                                          |
| ----------------- | ---------------------------------------------------- |
| `/pptx2slidev`    | Auto-scan `pptx/` and convert new PPTX files         |
| `/theme-preview`  | Start Slidev dev servers for generated themes         |
| `/theme-showcase` | Build and serve the theme showcase gallery            |

## CLI Usage

```
pptx2slidev <input.pptx> [options]

Options:
  --name <name>          Theme name (default: derived from filename)
  --output <dir>         Output directory (default: ./packages/themes)
  --color-schema <mode>  Color scheme: light | dark | both (default: both)
```

### Examples

```bash
# Basic conversion
pnpm pptx2slidev pptx/Nice.pptx

# Custom name and output
pnpm pptx2slidev pptx/Nice.pptx --name elegant --output ./my-themes

# Light mode only
pnpm pptx2slidev pptx/Nice.pptx --color-schema light
```

## Project Structure

```
slidev-themes-generator/
├── packages/
│   ├── converter/              # CLI tool and conversion logic
│   │   └── src/
│   │       ├── cli.ts          # Entry point: orchestrates 4 phases
│   │       ├── extract.ts      # Phase 1: PPTX extraction
│   │       ├── cover-analyzer.ts # Phase 2: Cover visual analysis
│   │       ├── theme-parser.ts # Phase 3: Parsing + style detection
│   │       ├── slidev-generator.ts # Phase 4: File generation
│   │       ├── color-utils.ts  # Color math + WCAG validation
│   │       ├── slide-export.ts # Slide rendering + export
│   │       └── types.ts        # TypeScript type definitions
│   ├── themes/                 # Generated Slidev themes
│   └── showcase/               # Theme showcase builder
├── pptx/                       # Source PPTX files
├── docs/demo/                  # Demo slide screenshots
└── .claude/                    # Claude Code AI assistant config
    ├── CLAUDE.md               # Project context
    └── skills/                 # Agent-first workflow skills
        ├── pptx2slidev.md      # /pptx2slidev — auto-scan and convert PPTX
        ├── theme-preview.md    # /theme-preview — start dev servers
        └── theme-showcase.md   # /theme-showcase — build and serve gallery
```

## License

[MIT](./LICENSE)
