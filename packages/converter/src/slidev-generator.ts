/**
 * Generate a complete Slidev theme package from parsed PPTX theme data.
 */

import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import type { PptxThemeData, GeneratorOptions, PptxLayoutInfo } from './types'
import { hexToRgb, rgbToHsl, hslToRgb, rgbToHex, invertForDarkMode, lighten, darken, contrastRatio, ensureContrast, isDarkBackground } from './color-utils'

export async function generateSlidevTheme(
  themeData: PptxThemeData,
  options: GeneratorOptions
): Promise<string> {
  const themeDir = join(options.outputDir, `slidev-theme-${options.name}`)

  // Create directory structure
  await mkdir(join(themeDir, 'layouts'), { recursive: true })
  await mkdir(join(themeDir, 'styles'), { recursive: true })
  await mkdir(join(themeDir, 'setup'), { recursive: true })
  await mkdir(join(themeDir, 'assets'), { recursive: true })

  // Generate all files
  await Promise.all([
    writePackageJson(themeDir, themeData, options),
    writeStylesIndex(themeDir, themeData, options),
    writeMermaidSetup(themeDir, themeData),
    writeLayouts(themeDir, themeData),
    writeExampleSlides(themeDir, themeData, options),
    extractMediaAssets(themeDir, themeData),
  ])

  return themeDir
}

async function writePackageJson(
  themeDir: string,
  themeData: PptxThemeData,
  options: GeneratorOptions
): Promise<void> {
  const pkg = {
    name: `slidev-theme-${options.name}`,
    version: '0.1.0',
    description: `Slidev theme converted from "${themeData.name}" PowerPoint template`,
    keywords: ['slidev-theme', 'slidev'],
    engines: {
      slidev: '>=0.48.0',
    },
    slidev: {
      colorSchema: options.colorSchema,
      defaults: {
        fonts: {
          sans: themeData.fonts.minorFont,
          serif: themeData.fonts.majorFont,
          mono: 'Fira Code',
          weights: '400,600,700',
        },
      },
    },
  }

  await Bun.write(join(themeDir, 'package.json'), JSON.stringify(pkg, null, 2) + '\n')
}

async function writeStylesIndex(
  themeDir: string,
  themeData: PptxThemeData,
  options: GeneratorOptions
): Promise<void> {
  const { colors } = themeData
  const bg = colors.lt1
  const darkBg = isDarkBackground(bg)

  // Contrast-validate all text colors against background
  const textOnBg = ensureContrast(colors.dk1, bg, 4.5)
  const textSecOnBg = ensureContrast(colors.dk2, bg, 4.5)
  const primaryOnBg = ensureContrast(colors.accent1, bg, 3)
  const secondaryOnBg = ensureContrast(colors.accent2, bg, 3)
  const linkOnBg = ensureContrast(colors.hlink, bg, 4.5)
  const linkVisitedOnBg = ensureContrast(colors.folHlink, bg, 4.5)

  // Log contrast fixes
  if (textOnBg !== colors.dk1) console.log(`  [contrast] text: ${colors.dk1} → ${textOnBg} (on ${bg})`)
  if (linkOnBg !== colors.hlink) console.log(`  [contrast] link: ${colors.hlink} → ${linkOnBg} (on ${bg})`)
  if (linkVisitedOnBg !== colors.folHlink) console.log(`  [contrast] link-visited: ${colors.folHlink} → ${linkVisitedOnBg} (on ${bg})`)

  // Generate surface colors for visual depth
  const surfaceElevated = darkBg ? lighten(bg, 8) : darken(bg, 3)
  const surfaceMuted = darkBg ? lighten(bg, 4) : darken(bg, 1.5)
  const border = darkBg ? lighten(bg, 12) : darken(bg, 8)

  let css = `/* Generated from PPTX template: ${themeData.name} */
/* Contrast-validated for WCAG AA readability */

:root {
  /* Primary colors */
  --slidev-theme-primary: ${primaryOnBg};
  --slidev-theme-secondary: ${secondaryOnBg};

  /* Text & background */
  --slidev-theme-text: ${textOnBg};
  --slidev-theme-background: ${bg};
  --slidev-theme-text-secondary: ${textSecOnBg};
  --slidev-theme-background-secondary: ${colors.lt2};

  /* Surfaces (for visual depth) */
  --slidev-theme-surface: ${surfaceElevated};
  --slidev-theme-surface-muted: ${surfaceMuted};
  --slidev-theme-border: ${border};

  /* Accent palette */
  --slidev-theme-accent-3: ${ensureContrast(colors.accent3, bg, 3)};
  --slidev-theme-accent-4: ${ensureContrast(colors.accent4, bg, 3)};
  --slidev-theme-accent-5: ${ensureContrast(colors.accent5, bg, 3)};
  --slidev-theme-accent-6: ${ensureContrast(colors.accent6, bg, 3)};

  /* Links */
  --slidev-theme-link: ${linkOnBg};
  --slidev-theme-link-visited: ${linkVisitedOnBg};

  /* Derived variants */
  --slidev-theme-primary-light: ${lighten(primaryOnBg, 20)};
  --slidev-theme-primary-dark: ${darken(primaryOnBg, 15)};

  /* Typography */
  --slidev-theme-font-heading: '${themeData.fonts.majorFont}', ui-serif, Georgia, serif;
  --slidev-theme-font-body: '${themeData.fonts.minorFont}', ui-sans-serif, system-ui, sans-serif;
  --slidev-theme-font-mono: 'Fira Code', ui-monospace, monospace;
}
`

  if (options.colorSchema === 'both') {
    // For dark mode: swap text/bg but keep accent colors vibrant
    const dmBg = darkBg ? '#ffffff' : '#1a1a2e'
    const dmText = ensureContrast(darkBg ? '#1a1a2e' : '#f0f0f0', dmBg, 4.5)
    const dmPrimary = ensureContrast(colors.accent1, dmBg, 3)
    const dmSecondary = ensureContrast(colors.accent2, dmBg, 3)

    css += `
html.dark {
  --slidev-theme-text: ${dmText};
  --slidev-theme-background: ${dmBg};
  --slidev-theme-text-secondary: ${ensureContrast(colors.dk2, dmBg, 4.5)};
  --slidev-theme-background-secondary: ${isDarkBackground(dmBg) ? lighten(dmBg, 10) : darken(dmBg, 5)};
  --slidev-theme-surface: ${isDarkBackground(dmBg) ? lighten(dmBg, 8) : darken(dmBg, 3)};
  --slidev-theme-surface-muted: ${isDarkBackground(dmBg) ? lighten(dmBg, 4) : darken(dmBg, 1.5)};
  --slidev-theme-border: ${isDarkBackground(dmBg) ? lighten(dmBg, 15) : darken(dmBg, 10)};
  --slidev-theme-primary: ${dmPrimary};
  --slidev-theme-secondary: ${dmSecondary};
  --slidev-theme-primary-light: ${lighten(dmPrimary, 15)};
  --slidev-theme-primary-dark: ${darken(dmPrimary, 10)};
}
`
  }

  css += `
/* ─── Base ─── */
.slidev-layout {
  color: var(--slidev-theme-text);
  background: var(--slidev-theme-background);
  font-family: var(--slidev-theme-font-body);
  padding: 2.5rem 3.5rem;
  height: 100%;
  box-sizing: border-box;
  position: relative;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.slidev-layout h1,
.slidev-layout h2,
.slidev-layout h3,
.slidev-layout h4 {
  font-family: var(--slidev-theme-font-heading);
  color: var(--slidev-theme-text);
}

.slidev-layout h1 {
  font-size: 2.5rem;
  font-weight: 700;
  line-height: 1.2;
  letter-spacing: -0.02em;
}

.slidev-layout h2 {
  font-size: 1.75rem;
  font-weight: 600;
  line-height: 1.3;
}

.slidev-layout a {
  color: var(--slidev-theme-link);
  text-decoration-thickness: 1px;
  text-underline-offset: 2px;
}

.slidev-layout a:visited {
  color: var(--slidev-theme-link-visited);
}

/* ─── Lists ─── */
.slidev-layout ul {
  list-style: none;
  padding-left: 0;
}

.slidev-layout ul li {
  position: relative;
  padding-left: 1.5rem;
  margin-bottom: 0.5rem;
}

.slidev-layout ul li::before {
  content: '';
  position: absolute;
  left: 0;
  top: 0.55em;
  width: 8px;
  height: 8px;
  border-radius: 2px;
  background: var(--slidev-theme-primary);
  opacity: 0.8;
}

/* ─── Code ─── */
.slidev-layout code {
  font-family: var(--slidev-theme-font-mono);
  background: var(--slidev-theme-surface);
  padding: 0.15em 0.4em;
  border-radius: 0.25em;
  font-size: 0.875em;
  border: 1px solid var(--slidev-theme-border);
}

.slidev-layout pre {
  background: var(--slidev-theme-surface) !important;
  border: 1px solid var(--slidev-theme-border);
  border-radius: 0.5rem;
  padding: 1.25rem;
}

.slidev-layout pre code {
  background: none;
  border: none;
  padding: 0;
}

/* ─── Blockquote ─── */
.slidev-layout blockquote {
  border-left: 4px solid var(--slidev-theme-primary);
  padding-left: 1.25rem;
  margin-left: 0;
  font-style: italic;
  opacity: 0.9;
}

/* ─── Tables ─── */
.slidev-layout table {
  width: 100%;
  border-collapse: separate;
  border-spacing: 0;
  border: 1px solid var(--slidev-theme-border);
  border-radius: 0.5rem;
  overflow: hidden;
  font-size: 0.9em;
}

.slidev-layout thead th {
  background: var(--slidev-theme-primary);
  color: var(--slidev-theme-background);
  font-family: var(--slidev-theme-font-heading);
  font-weight: 600;
  font-size: 0.85em;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  padding: 0.65rem 1rem;
  text-align: left;
  border-bottom: 2px solid var(--slidev-theme-primary-dark);
}

.slidev-layout tbody td {
  padding: 0.55rem 1rem;
  border-bottom: 1px solid var(--slidev-theme-border);
  color: var(--slidev-theme-text);
}

.slidev-layout tbody tr:last-child td {
  border-bottom: none;
}

.slidev-layout tbody tr:nth-child(even) {
  background: var(--slidev-theme-surface-muted);
}

.slidev-layout tbody tr:hover {
  background: var(--slidev-theme-surface);
}

/* ─── Mermaid Diagrams ─── */
/* Note: Slidev renders Mermaid SVGs inside Shadow DOM.
   External CSS cannot reach SVG internals — use themeCSS in setup/mermaid.ts instead.
   These rules only affect the host element (.mermaid div). */
.slidev-layout .mermaid {
  flex: 1 1 0;
  min-height: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 0.5rem 0;
  overflow: hidden;
}
`

  await Bun.write(join(themeDir, 'styles', 'index.css'), css)
}

/**
 * Build a 6-color palette faithful to the source PPTX.
 *
 * Rich palette (diverse accents) → use original PPTX colors directly.
 * Monotone palette (accents all white/black) → monochromatic: shades and
 * tints of the primary color only, preserving the original design intent.
 */
function derivePalette(primary: string, secondary: string, accents: string[], bg: string): string[] {
  // Check if accents are actually diverse (not all same or near-white/near-black)
  const isUsable = (c: string) => {
    const [r, g, b] = hexToRgb(c)
    const lum = (r * 0.299 + g * 0.587 + b * 0.114)
    return lum > 25 && lum < 230
  }

  const usableAccents = accents.filter(isUsable)
  const usableSecondary = isUsable(secondary) && secondary.toLowerCase() !== primary.toLowerCase()

  if (usableAccents.length >= 2) {
    // Rich palette: use original PPTX colors directly
    const pool = [primary]
    if (usableSecondary) pool.push(secondary)
    pool.push(...usableAccents)
    // Deduplicate and ensure contrast
    const seen = new Set<string>()
    const result: string[] = []
    for (const c of pool) {
      const norm = ensureContrast(c, bg, 3).toLowerCase()
      if (!seen.has(norm)) {
        seen.add(norm)
        result.push(norm)
      }
      if (result.length >= 6) break
    }
    // Pad with darker/lighter primary variants if needed
    while (result.length < 6) {
      result.push(darken(primary, 10 + result.length * 8))
    }
    return result
  }

  // Monotone palette: vary both lightness AND saturation for clear distinction
  const [pr, pg, pb] = hexToRgb(primary)
  const [ph, ps, pl] = rgbToHsl(pr, pg, pb)

  const mono = [
    [ph, ps, pl],                                          // original
    [ph, Math.max(ps - 15, 20), Math.max(pl - 22, 15)],   // darker, less saturated
    [ph, Math.min(ps + 10, 100), Math.min(pl + 18, 85)],  // lighter, more saturated
    [ph, Math.max(ps - 25, 15), Math.max(pl - 38, 10)],   // much darker
    [ph, Math.min(ps + 5, 95), Math.min(pl + 32, 90)],    // much lighter
    usableSecondary ? null : [(ph + 15) % 360, Math.max(ps - 10, 25), pl], // slight hue shift
  ].map(hsl => {
    if (!hsl) return secondary
    const [nr, ng, nb] = hslToRgb(hsl[0], hsl[1], hsl[2])
    return rgbToHex(nr, ng, nb)
  })

  return mono.map(c => ensureContrast(c, bg, 3))
}

async function writeMermaidSetup(
  themeDir: string,
  themeData: PptxThemeData,
): Promise<void> {
  const { colors } = themeData
  const bg = colors.lt1
  const darkBg = isDarkBackground(bg)

  const primaryOnBg = ensureContrast(colors.accent1, bg, 3)
  const secondaryOnBg = ensureContrast(colors.accent2, bg, 3)
  const textOnBg = ensureContrast(colors.dk1, bg, 4.5)

  // Derive a vibrant 6-color palette for diagrams
  const palette = derivePalette(
    primaryOnBg, secondaryOnBg,
    [colors.accent3, colors.accent4, colors.accent5, colors.accent6],
    bg,
  )

  // Softer node backgrounds (tinted, not washed out)
  const nodeBg = lighten(palette[0], 28)
  const nodeBorder = palette[0]
  const secondaryNodeBg = lighten(palette[1], 28)
  const secondaryNodeBorder = palette[1]

  // Surface colors for neutral elements
  const surfaceElevated = darkBg ? lighten(bg, 8) : darken(bg, 3)
  const surfaceMuted = darkBg ? lighten(bg, 4) : darken(bg, 1.5)
  const border = darkBg ? lighten(bg, 12) : darken(bg, 8)

  // Dark mode
  const dmBg = darkBg ? '#ffffff' : '#1a1a2e'
  const dmPrimary = ensureContrast(colors.accent1, dmBg, 3)
  const dmText = ensureContrast(darkBg ? '#1a1a2e' : '#f0f0f0', dmBg, 4.5)
  const dmNodeBg = lighten(dmPrimary, isDarkBackground(dmBg) ? 12 : 28)

  // Dark mode palette
  const dmPalette = derivePalette(
    dmPrimary, ensureContrast(colors.accent2, dmBg, 3),
    [colors.accent3, colors.accent4, colors.accent5, colors.accent6],
    dmBg,
  )

  // Note colors
  const noteColor = palette[4] || palette[2]
  const dmNoteColor = dmPalette[4] || dmPalette[2]

  // Actor text: pick white or dark based on which has better contrast against node bg
  // For saturated colored boxes, white almost always looks cleaner
  const pickTextOnColor = (bgColor: string): string => {
    const whiteContrast = contrastRatio('#ffffff', bgColor)
    const darkContrast = contrastRatio('#000000', bgColor)
    // Prefer white unless dark has significantly better contrast (>2x)
    return whiteContrast >= 2.5 || whiteContrast * 2 > darkContrast ? '#ffffff' : '#000000'
  }
  const actorText = pickTextOnColor(nodeBg)
  const dmActorText = pickTextOnColor(dmNodeBg)

  // themeCSS: injected directly into SVG <style> — the ONLY reliable way to override Mermaid text colors
  const buildThemeCSS = (pieTextColor: string, actorTxt: string, signalTxt: string, noteTxt: string) => `
    .slice { fill: ${pieTextColor} !important; font-weight: 600; font-size: 14px; }
    .pieOuterCircle { stroke-width: 2px; }
    .actor { stroke-width: 1.5px; }
    .actor-man { stroke-width: 1.5px; }
    text.actor > tspan { fill: ${actorTxt} !important; }
    .actor-label tspan { fill: ${actorTxt} !important; }
    .sequenceNumber { fill: #ffffff !important; }
    .messageText { fill: ${signalTxt} !important; }
    .noteText > tspan { fill: ${noteTxt} !important; }
    .loopText > tspan { fill: ${signalTxt} !important; }
    .labelText > tspan { fill: ${signalTxt} !important; }
    .nodeLabel { color: ${actorTxt} !important; }
    .node .label text { fill: ${actorTxt} !important; }
    .node rect, .node polygon, .node circle { stroke-width: 1.5px; }
    .edgeLabel { color: ${signalTxt} !important; }
    .edgeLabel .label { color: ${signalTxt} !important; }
  `

  const lightThemeCSS = buildThemeCSS('#ffffff', actorText, textOnBg, textOnBg)
  const darkThemeCSS = buildThemeCSS('#ffffff', dmActorText, dmText, dmText)

  const setup = `export default () => {
  const isDark = document.documentElement.classList.contains('dark')

  return {
    theme: 'base',
    themeCSS: isDark ? \`${darkThemeCSS}\` : \`${lightThemeCSS}\`,
    pie: { useMaxWidth: true },
    sequence: { useMaxWidth: true, mirrorActors: true },
    flowchart: { useMaxWidth: true },
    themeVariables: isDark ? {
      primaryColor: '${dmNodeBg}',
      primaryBorderColor: '${dmPrimary}',
      secondaryColor: '${lighten(dmPalette[1], 12)}',
      secondaryBorderColor: '${dmPalette[1]}',
      tertiaryColor: '${lighten(dmPalette[2], 12)}',
      tertiaryBorderColor: '${dmPalette[2]}',
      lineColor: '${dmPalette[0]}',
      textColor: '${dmText}',
      mainBkg: '${dmNodeBg}',
      nodeBorder: '${dmPrimary}',
      clusterBkg: '${isDarkBackground(dmBg) ? lighten(dmBg, 4) : darken(dmBg, 1.5)}',
      clusterBorder: '${isDarkBackground(dmBg) ? lighten(dmBg, 15) : darken(dmBg, 10)}',
      titleColor: '${dmText}',
      edgeLabelBackground: '${dmBg}',
      nodeTextColor: '${dmActorText}',
      pie1: '${dmPalette[0]}',
      pie2: '${dmPalette[1]}',
      pie3: '${dmPalette[2]}',
      pie4: '${dmPalette[3]}',
      pie5: '${dmPalette[4]}',
      pie6: '${dmPalette[5]}',
      pieTitleTextColor: '${dmText}',
      pieLegendTextColor: '${dmText}',
      pieStrokeColor: '${isDarkBackground(dmBg) ? lighten(dmBg, 15) : darken(dmBg, 10)}',
      pieStrokeWidth: '2px',
      actorBkg: '${dmNodeBg}',
      actorBorder: '${dmPrimary}',
      activationBkgColor: '${lighten(dmPrimary, 10)}',
      activationBorderColor: '${dmPrimary}',
      noteBkgColor: '${lighten(dmNoteColor, 10)}',
      noteBorderColor: '${dmNoteColor}',
      fontFamily: "'${themeData.fonts.minorFont}', ui-sans-serif, system-ui, sans-serif",
    } : {
      primaryColor: '${nodeBg}',
      primaryBorderColor: '${nodeBorder}',
      secondaryColor: '${secondaryNodeBg}',
      secondaryBorderColor: '${secondaryNodeBorder}',
      tertiaryColor: '${lighten(palette[2], 28)}',
      tertiaryBorderColor: '${palette[2]}',
      lineColor: '${palette[0]}',
      textColor: '${textOnBg}',
      mainBkg: '${nodeBg}',
      nodeBorder: '${nodeBorder}',
      clusterBkg: '${surfaceMuted}',
      clusterBorder: '${border}',
      titleColor: '${textOnBg}',
      edgeLabelBackground: '${bg}',
      nodeTextColor: '${actorText}',
      pie1: '${palette[0]}',
      pie2: '${palette[1]}',
      pie3: '${palette[2]}',
      pie4: '${palette[3]}',
      pie5: '${palette[4]}',
      pie6: '${palette[5]}',
      pieTitleTextColor: '${textOnBg}',
      pieLegendTextColor: '${textOnBg}',
      pieStrokeColor: '${border}',
      pieStrokeWidth: '2px',
      actorBkg: '${nodeBg}',
      actorBorder: '${nodeBorder}',
      activationBkgColor: '${lighten(palette[0], 30)}',
      activationBorderColor: '${palette[0]}',
      noteBkgColor: '${lighten(noteColor, 30)}',
      noteBorderColor: '${noteColor}',
      fontFamily: "'${themeData.fonts.minorFont}', ui-sans-serif, system-ui, sans-serif",
    },
  }
}
`

  await Bun.write(join(themeDir, 'setup', 'mermaid.ts'), setup)
}

async function writeLayouts(themeDir: string, themeData: PptxThemeData): Promise<void> {
  const p = themeData.personality
  const layouts: Record<string, string> = {
    'cover.vue': coverLayout(p, themeData),
    'intro.vue': introLayout(p),
    'default.vue': defaultLayout(p),
    'center.vue': centerLayout(p),
    'section.vue': sectionLayout(p),
    'statement.vue': statementLayout(p),
    'two-cols.vue': twoColsLayout(p),
    'image-right.vue': imageLayout('right'),
    'image-left.vue': imageLayout('left'),
    'end.vue': endLayout(p),
  }

  await Promise.all(
    Object.entries(layouts).map(([file, content]) =>
      Bun.write(join(themeDir, 'layouts', file), content)
    )
  )
}

// ━━━ Personality-driven layout generators ━━━
// Each layout function switches on personality to produce distinct visuals.

import type { DesignPersonality } from './types'

// ── COVER ──
function coverLayout(p: DesignPersonality, themeData: PptxThemeData): string {
  // If slide 1 has a specific background, override the cover style
  // Ensure text will be readable by picking the right text color
  const cover = themeData.coverSlide
  let coverBgCss = ''
  let coverTextCss = ''

  const determineCoverBg = (bgColor: string) => {
    // Find the best text color for this background
    const textOnBg = ensureContrast(themeData.colors.dk1, bgColor, 4.5)
    coverBgCss = `background: ${bgColor};`
    coverTextCss = `color: ${textOnBg};`
    // Override heading/p colors too
    coverTextCss += `\n.cover :deep(h1) { color: ${textOnBg}; -webkit-text-fill-color: ${textOnBg}; background: none; }`
    coverTextCss += `\n.cover :deep(p) { color: ${textOnBg}; opacity: 0.75; }`
  }

  if (cover.background.type === 'solid') {
    determineCoverBg(cover.background.value)
  } else if (cover.background.type === 'gradient') {
    const firstColor = cover.background.value.match(/#[0-9a-fA-F]{6}/)?.[0]
    if (firstColor && firstColor !== '#000000') {
      coverBgCss = `background: ${cover.background.value};`
      const textOnBg = ensureContrast(themeData.colors.dk1, firstColor, 4.5)
      coverTextCss = `color: ${textOnBg};`
      coverTextCss += `\n.cover :deep(h1) { color: ${textOnBg}; -webkit-text-fill-color: ${textOnBg}; background: none; }`
      coverTextCss += `\n.cover :deep(p) { color: ${textOnBg}; opacity: 0.75; }`
    }
  }

  // If slide 1 has images, add the first one as a decorative element
  const hasImage = cover.images.length > 0
  const imageDecor = hasImage
    ? `<img class="cover-image" src="/assets/${cover.images[0]}" />`
    : ''

  // Extra shape-color decorations from slide 1
  const shapeDecors = cover.shapeColors.slice(0, 3).map((c, i) =>
    `<div class="shape-decor sd-${i}" />`
  ).join('\n    ')
  const shapeStyles = cover.shapeColors.slice(0, 3).map((c, i) => {
    const positions = [
      'top: 10%; right: 8%; width: 180px; height: 180px; border-radius: 50%;',
      'bottom: 15%; left: 5%; width: 120px; height: 120px; border-radius: 8px; transform: rotate(15deg);',
      'top: 60%; right: 25%; width: 80px; height: 80px; border-radius: 50%;',
    ]
    return `.sd-${i} { position: absolute; background: ${c}; opacity: 0.15; ${positions[i]} }`
  }).join('\n')
  const decor: Record<DesignPersonality, string> = {
    vibrant: `
    <div class="neon-glow" />
    <div class="color-stripe s1" />
    <div class="color-stripe s2" />
    <div class="color-stripe s3" />`,
    minimal: `
    <div class="line-accent" />`,
    corporate: `
    <div class="corner-decor" />
    <div class="accent-bar" />`,
    bold: `
    <div class="diag-block" />
    <div class="accent-bar" />`,
  }

  const styles: Record<DesignPersonality, string> = {
    vibrant: `
.cover { background: var(--slidev-theme-background); padding: 3rem 4rem; }
.cover :deep(h1) { font-size: 4rem; font-weight: 900; letter-spacing: -0.04em; line-height: 1.05;
  background: linear-gradient(135deg, var(--slidev-theme-primary), var(--slidev-theme-secondary), var(--slidev-theme-accent-5, var(--slidev-theme-primary)));
  -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text; }
.cover :deep(p) { color: var(--slidev-theme-text); opacity: 0.5; font-size: 1.25rem; text-transform: uppercase; letter-spacing: 0.15em; }
.neon-glow { position: absolute; width: 600px; height: 600px; border-radius: 50%; top: -200px; right: -200px;
  background: radial-gradient(circle, var(--slidev-theme-primary) 0%, transparent 70%); opacity: 0.15; }
.color-stripe { position: absolute; right: 0; width: 6px; }
.s1 { top: 20%; height: 15%; background: var(--slidev-theme-primary); }
.s2 { top: 38%; height: 15%; background: var(--slidev-theme-secondary); }
.s3 { top: 56%; height: 15%; background: var(--slidev-theme-accent-5, var(--slidev-theme-primary)); }`,

    minimal: `
.cover { background: var(--slidev-theme-background); padding: 4rem 5rem; }
.cover :deep(h1) { font-size: 3rem; font-weight: 600; letter-spacing: -0.02em; line-height: 1.15; color: var(--slidev-theme-text); }
.cover :deep(p) { color: var(--slidev-theme-text); opacity: 0.4; font-size: 1rem; margin-top: 1rem; }
.line-accent { position: absolute; bottom: 4rem; left: 5rem; width: 60px; height: 3px; background: var(--slidev-theme-primary); }`,

    corporate: `
.cover { background: var(--slidev-theme-primary); color: var(--slidev-theme-background); padding: 3rem 4rem; }
.cover :deep(h1) { color: var(--slidev-theme-background); font-size: 3.25rem; font-weight: 700; letter-spacing: -0.02em; line-height: 1.1; margin-bottom: 0.75rem; }
.cover :deep(p) { color: var(--slidev-theme-background); opacity: 0.75; font-size: 1.125rem; }
.corner-decor { position: absolute; top: 0; right: 0; width: 200px; height: 200px; background: var(--slidev-theme-secondary); opacity: 0.15; clip-path: polygon(100% 0, 0 0, 100% 100%); }
.accent-bar { position: absolute; bottom: 0; left: 0; right: 0; height: 4px; background: linear-gradient(90deg, var(--slidev-theme-secondary), var(--slidev-theme-accent-3, var(--slidev-theme-primary-light)), var(--slidev-theme-accent-5, var(--slidev-theme-primary))); }`,

    bold: `
.cover { background: var(--slidev-theme-primary); color: var(--slidev-theme-background); padding: 3rem 4rem; }
.cover :deep(h1) { color: var(--slidev-theme-background); font-size: 3.5rem; font-weight: 800; letter-spacing: -0.03em; line-height: 1.08; text-transform: uppercase; }
.cover :deep(p) { color: var(--slidev-theme-background); opacity: 0.7; font-size: 1.125rem; }
.diag-block { position: absolute; top: -10%; right: -5%; width: 50%; height: 120%; background: var(--slidev-theme-primary-dark); opacity: 0.3; transform: skewX(-8deg); }
.accent-bar { position: absolute; bottom: 0; left: 0; right: 0; height: 6px; background: var(--slidev-theme-secondary); }`,
  }

  // Visual analysis overrides (from rendered cover image)
  const analysis = themeData.coverAnalysis
  let analysisLayoutClass = 'flex flex-col justify-center items-center text-center'
  let analysisStyles = ''

  if (analysis) {
    // Override layout alignment based on detected orientation
    switch (analysis.layout) {
      case 'left-heavy':
        analysisLayoutClass = 'flex flex-col justify-center items-start text-left'
        analysisStyles += `\n.cover { padding-left: 5rem; padding-right: 2rem; }`
        break
      case 'right-heavy':
        analysisLayoutClass = 'flex flex-col justify-center items-end text-right'
        analysisStyles += `\n.cover { padding-right: 5rem; padding-left: 2rem; }`
        break
      case 'split':
        analysisLayoutClass = 'grid grid-cols-2 items-center'
        analysisStyles += `\n.cover { gap: 2rem; padding: 3rem 4rem; }`
        // Use the two most dominant region colors for split background
        const leftRegion = analysis.colorRegions.find(r => r.position === 'middle-left')
        const rightRegion = analysis.colorRegions.find(r => r.position === 'middle-right')
        if (leftRegion && rightRegion && leftRegion.color !== rightRegion.color) {
          analysisStyles += `\n.cover::before { content: ''; position: absolute; left: 0; top: 0; bottom: 0; width: 50%; background: ${leftRegion.color}; z-index: 0; }`
          analysisStyles += `\n.cover::after { content: ''; position: absolute; right: 0; top: 0; bottom: 0; width: 50%; background: ${rightRegion.color}; z-index: 0; }`
        }
        break
      case 'full-bleed':
        analysisLayoutClass = 'flex flex-col justify-center items-center text-center'
        break
      case 'centered':
      default:
        // Keep personality defaults
        break
    }

    // Adjust vertical alignment based on content gravity
    if (analysis.contentGravity.y > 0.65) {
      analysisStyles += `\n.cover { justify-content: flex-end; padding-bottom: 4rem; }`
    } else if (analysis.contentGravity.y < 0.35) {
      analysisStyles += `\n.cover { justify-content: flex-start; padding-top: 4rem; }`
    }

    // Add detected decorative bars
    if (analysis.horizontalBar) {
      const barPos = analysis.horizontalBar.position === 'top' ? 'top: 0;' : 'bottom: 0;'
      analysisStyles += `\n.analysis-hbar { position: absolute; left: 0; right: 0; height: 5px; ${barPos} background: ${analysis.horizontalBar.color}; z-index: 5; }`
    }
    if (analysis.verticalBar) {
      const barPos = analysis.verticalBar.position === 'left' ? 'left: 0;' : 'right: 0;'
      analysisStyles += `\n.analysis-vbar { position: absolute; top: 0; bottom: 0; width: 5px; ${barPos} background: ${analysis.verticalBar.color}; z-index: 5; }`
    }
  }

  const barDecors: string[] = []
  if (analysis?.horizontalBar) barDecors.push(`<div class="analysis-hbar" />`)
  if (analysis?.verticalBar) barDecors.push(`<div class="analysis-vbar" />`)
  const barDecor = barDecors.length ? '\n    ' + barDecors.join('\n    ') : ''

  return `<template>
  <div class="slidev-layout cover h-full ${analysisLayoutClass}">${decor[p]}${barDecor}
    ${shapeDecors}
    <div class="w-full max-w-4xl mx-auto relative z-10">
      <slot />
    </div>
  </div>
</template>

<style scoped>${styles[p]}
${coverBgCss ? `.cover { ${coverBgCss} }` : ''}
${coverTextCss || ''}
${shapeStyles}${analysisStyles}
</style>
`
}

// ── INTRO ──
function introLayout(p: DesignPersonality): string {
  const decor: Record<DesignPersonality, string> = {
    vibrant: `<div class="gradient-side" />`,
    minimal: `<div class="dot-accent" />`,
    corporate: `<div class="side-bar" />`,
    bold: `<div class="thick-bar" />`,
  }

  const styles: Record<DesignPersonality, string> = {
    vibrant: `
.intro { padding: 3rem 4rem 3rem 5.5rem; }
.gradient-side { position: absolute; left: 0; top: 0; bottom: 0; width: 8px;
  background: linear-gradient(180deg, var(--slidev-theme-primary), var(--slidev-theme-accent-5, var(--slidev-theme-secondary)), var(--slidev-theme-accent-6, var(--slidev-theme-primary))); }
.intro :deep(h1) { font-size: 3rem; font-weight: 900; color: var(--slidev-theme-primary); letter-spacing: -0.03em; }
.intro :deep(h2) { font-size: 1.5rem; font-weight: 400; color: var(--slidev-theme-text); opacity: 0.4; text-transform: uppercase; letter-spacing: 0.1em; }
.intro :deep(p) { font-size: 1.125rem; line-height: 1.7; opacity: 0.7; }`,

    minimal: `
.intro { padding: 4rem 5rem; }
.dot-accent { position: absolute; left: 5rem; top: 3.5rem; width: 8px; height: 8px; border-radius: 50%; background: var(--slidev-theme-primary); }
.intro :deep(h1) { font-size: 2.25rem; font-weight: 600; color: var(--slidev-theme-text); margin-top: 1.5rem; }
.intro :deep(h2) { font-size: 1.125rem; font-weight: 400; color: var(--slidev-theme-text); opacity: 0.4; }
.intro :deep(p) { font-size: 1rem; line-height: 1.8; opacity: 0.6; max-width: 32rem; }`,

    corporate: `
.intro { padding: 3rem 4rem 3rem 5rem; }
.side-bar { position: absolute; left: 0; top: 0; bottom: 0; width: 5px;
  background: linear-gradient(180deg, var(--slidev-theme-primary), var(--slidev-theme-secondary)); }
.intro :deep(h1) { font-size: 2.75rem; font-weight: 700; color: var(--slidev-theme-primary); }
.intro :deep(h2) { font-size: 1.25rem; font-weight: 400; opacity: 0.6; }
.intro :deep(p) { font-size: 1.125rem; line-height: 1.7; opacity: 0.7; }`,

    bold: `
.intro { padding: 3rem 4rem 3rem 6rem; }
.thick-bar { position: absolute; left: 0; top: 0; bottom: 0; width: 16px; background: var(--slidev-theme-primary); }
.intro :deep(h1) { font-size: 3rem; font-weight: 800; color: var(--slidev-theme-primary); text-transform: uppercase; letter-spacing: -0.02em; }
.intro :deep(h2) { font-size: 1.25rem; font-weight: 500; opacity: 0.5; }
.intro :deep(p) { font-size: 1.125rem; line-height: 1.6; opacity: 0.7; }`,
  }

  return `<template>
  <div class="slidev-layout intro h-full flex flex-col justify-center">
    ${decor[p]}
    <div class="w-full max-w-3xl relative z-10"><slot /></div>
  </div>
</template>

<style scoped>${styles[p]}
</style>
`
}

// ── DEFAULT ──
function defaultLayout(p: DesignPersonality): string {
  const decor: Record<DesignPersonality, string> = {
    vibrant: `<div class="top-gradient" />`,
    minimal: ``,
    corporate: `<div class="top-rule" />`,
    bold: `<div class="top-block" />`,
  }

  const styles: Record<DesignPersonality, string> = {
    vibrant: `
.top-gradient { position: absolute; top: 0; left: 0; right: 0; height: 3px;
  background: linear-gradient(90deg, var(--slidev-theme-primary), var(--slidev-theme-secondary), var(--slidev-theme-accent-5, var(--slidev-theme-primary)), var(--slidev-theme-accent-6, var(--slidev-theme-secondary))); }
.default :deep(h1) { margin-bottom: 1.5rem; color: var(--slidev-theme-primary); }`,

    minimal: `
.default :deep(h1) { margin-bottom: 2rem; font-weight: 600; font-size: 2rem; }
.default :deep(h1)::after { content: ''; display: block; width: 32px; height: 2px; background: var(--slidev-theme-primary); margin-top: 0.75rem; }`,

    corporate: `
.top-rule { position: absolute; top: 0; left: 3.5rem; right: 3.5rem; height: 3px;
  background: linear-gradient(90deg, var(--slidev-theme-primary) 0%, var(--slidev-theme-primary) 30%, var(--slidev-theme-border) 30%); }
.default :deep(h1) { margin-bottom: 1.5rem; padding-bottom: 0.75rem; border-bottom: 1px solid var(--slidev-theme-border); }`,

    bold: `
.top-block { position: absolute; top: 0; left: 0; width: 120px; height: 6px; background: var(--slidev-theme-primary); }
.default :deep(h1) { margin-bottom: 1.5rem; text-transform: uppercase; font-size: 2rem; letter-spacing: 0.02em; }`,
  }

  return `<script setup lang="ts">
defineProps<{ class?: string }>()
</script>

<template>
  <div class="slidev-layout default" :class="$props.class">
    ${decor[p]}
    <slot />
  </div>
</template>

<style scoped>
.default { padding-top: 3rem; }
${styles[p]}
</style>
`
}

// ── CENTER ──
function centerLayout(p: DesignPersonality): string {
  const decor: Record<DesignPersonality, string> = {
    vibrant: `<div class="glow" />`,
    minimal: ``,
    corporate: `<div class="ring" />`,
    bold: `<div class="cross" />`,
  }

  const styles: Record<DesignPersonality, string> = {
    vibrant: `
.center :deep(h1) { background: linear-gradient(135deg, var(--slidev-theme-primary), var(--slidev-theme-secondary));
  -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text; font-weight: 900; }
.glow { position: absolute; width: 400px; height: 400px; border-radius: 50%; top: 50%; left: 50%; transform: translate(-50%,-50%);
  background: radial-gradient(circle, var(--slidev-theme-primary) 0%, transparent 70%); opacity: 0.06; }`,

    minimal: `
.center :deep(h1) { font-weight: 600; font-size: 2rem; color: var(--slidev-theme-text); }
.center :deep(p) { max-width: 28rem; margin: 0 auto; }`,

    corporate: `
.center :deep(h1) { color: var(--slidev-theme-primary); }
.ring { position: absolute; width: 500px; height: 500px; border: 2px solid var(--slidev-theme-primary); border-radius: 50%;
  opacity: 0.05; top: 50%; left: 50%; transform: translate(-50%,-50%); }`,

    bold: `
.center :deep(h1) { color: var(--slidev-theme-primary); font-weight: 800; text-transform: uppercase; }
.cross { position: absolute; top: 50%; left: 50%; transform: translate(-50%,-50%); width: 200px; height: 200px; opacity: 0.04; }
.cross::before, .cross::after { content: ''; position: absolute; background: var(--slidev-theme-primary); }
.cross::before { width: 100%; height: 4px; top: 50%; }
.cross::after { width: 4px; height: 100%; left: 50%; }`,
  }

  return `<template>
  <div class="slidev-layout center h-full grid place-content-center text-center">
    ${decor[p]}
    <div class="max-w-3xl mx-auto relative z-10"><slot /></div>
  </div>
</template>

<style scoped>
.center :deep(p) { opacity: 0.7; font-size: 1.125rem; line-height: 1.6; }
${styles[p]}
</style>
`
}

// ── SECTION ──
function sectionLayout(p: DesignPersonality): string {
  const decor: Record<DesignPersonality, string> = {
    vibrant: `<div class="color-blocks"><span/><span/><span/></div>`,
    minimal: `<div class="line" />`,
    corporate: `<div class="bg-block" /><div class="circle-decor" />`,
    bold: `<div class="fill-block" />`,
  }

  const styles: Record<DesignPersonality, string> = {
    vibrant: `
.section { background: var(--slidev-theme-background); padding: 3rem 4rem; }
.section :deep(h1) { font-size: 3rem; font-weight: 900; color: var(--slidev-theme-text); }
.section :deep(p) { color: var(--slidev-theme-text); opacity: 0.4; text-transform: uppercase; letter-spacing: 0.1em; margin-top: 0.5rem; }
.color-blocks { position: absolute; bottom: 3rem; left: 4rem; display: flex; gap: 6px; }
.color-blocks span { width: 40px; height: 6px; border-radius: 3px; }
.color-blocks span:nth-child(1) { background: var(--slidev-theme-primary); }
.color-blocks span:nth-child(2) { background: var(--slidev-theme-secondary); }
.color-blocks span:nth-child(3) { background: var(--slidev-theme-accent-5, var(--slidev-theme-primary)); }`,

    minimal: `
.section { background: var(--slidev-theme-background); padding: 4rem 5rem; }
.section :deep(h1) { font-size: 2rem; font-weight: 600; color: var(--slidev-theme-text); }
.section :deep(p) { opacity: 0.4; margin-top: 0.5rem; }
.line { position: absolute; bottom: 4rem; left: 5rem; width: 40px; height: 2px; background: var(--slidev-theme-primary); }`,

    corporate: `
.section { background: var(--slidev-theme-surface-muted, var(--slidev-theme-background-secondary)); padding: 3rem 4rem; }
.section :deep(h1) { color: var(--slidev-theme-primary); font-size: 2.5rem; }
.section :deep(p) { opacity: 0.6; margin-top: 0.5rem; }
.bg-block { position: absolute; top: 0; left: 0; width: 40%; height: 100%; background: var(--slidev-theme-primary); opacity: 0.06; clip-path: polygon(0 0,100% 0,80% 100%,0 100%); }
.circle-decor { position: absolute; right: 4rem; bottom: 2rem; width: 100px; height: 100px; border: 3px solid var(--slidev-theme-primary); border-radius: 50%; opacity: 0.08; }`,

    bold: `
.section { background: var(--slidev-theme-primary); color: var(--slidev-theme-background); padding: 3rem 4rem; }
.section :deep(h1) { color: var(--slidev-theme-background); font-size: 2.75rem; font-weight: 800; text-transform: uppercase; }
.section :deep(p) { color: var(--slidev-theme-background); opacity: 0.6; }
.fill-block { position: absolute; inset: 0; background: linear-gradient(135deg, var(--slidev-theme-primary) 60%, var(--slidev-theme-primary-dark) 100%); }`,
  }

  return `<template>
  <div class="slidev-layout section h-full flex flex-col justify-center">
    ${decor[p]}
    <div class="relative z-10 px-4"><slot /></div>
  </div>
</template>

<style scoped>${styles[p]}
</style>
`
}

// ── STATEMENT ──
function statementLayout(p: DesignPersonality): string {
  const decor: Record<DesignPersonality, string> = {
    vibrant: `<div class="glow-bg" />`,
    minimal: `<div class="dash" />`,
    corporate: `<div class="quote-mark">&ldquo;</div><div class="bottom-line" />`,
    bold: `<div class="big-quote">&ldquo;</div>`,
  }

  const styles: Record<DesignPersonality, string> = {
    vibrant: `
.statement { padding: 3rem 5rem; }
.glow-bg { position: absolute; width: 500px; height: 500px; border-radius: 50%; top: 50%; left: 50%; transform: translate(-50%,-50%);
  background: radial-gradient(circle, var(--slidev-theme-primary) 0%, transparent 70%); opacity: 0.05; }
.statement :deep(blockquote) { font-size: 2.25rem; font-weight: 700; border: none; padding: 0; margin: 0;
  background: linear-gradient(135deg, var(--slidev-theme-primary), var(--slidev-theme-secondary));
  -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text; }
.statement :deep(blockquote p) { font-size: inherit; }
.statement :deep(p) { font-size: 1rem; opacity: 0.4; text-transform: uppercase; letter-spacing: 0.1em; margin-top: 1.5rem; }`,

    minimal: `
.statement { padding: 4rem 6rem; }
.dash { position: absolute; top: 50%; left: 6rem; transform: translateY(-50%) translateX(-3rem); width: 20px; height: 2px; background: var(--slidev-theme-primary); }
.statement :deep(blockquote) { font-size: 1.75rem; font-weight: 500; font-style: italic; color: var(--slidev-theme-text); border: none; padding: 0 0 0 2rem; margin: 0; }
.statement :deep(blockquote p) { font-size: inherit; color: inherit; }
.statement :deep(p) { font-size: 0.875rem; opacity: 0.4; margin-top: 1.5rem; }`,

    corporate: `
.statement { padding: 3rem 5rem; background: var(--slidev-theme-surface-muted, var(--slidev-theme-background)); }
.quote-mark { position: absolute; top: 1.5rem; left: 3rem; font-size: 8rem; font-family: var(--slidev-theme-font-heading); color: var(--slidev-theme-primary); opacity: 0.08; line-height: 1; }
.bottom-line { position: absolute; bottom: 2.5rem; left: 50%; transform: translateX(-50%); width: 60px; height: 3px; background: var(--slidev-theme-primary); opacity: 0.4; border-radius: 2px; }
.statement :deep(blockquote) { font-size: 2rem; font-style: italic; font-weight: 500; color: var(--slidev-theme-primary); border: none; padding: 0; margin: 0; }
.statement :deep(blockquote p) { font-size: inherit; color: inherit; }
.statement :deep(p) { font-size: 1rem; opacity: 0.5; margin-top: 1.5rem; text-transform: uppercase; letter-spacing: 0.05em; }`,

    bold: `
.statement { padding: 3rem 5rem; }
.big-quote { position: absolute; top: 0; left: 3rem; font-size: 14rem; font-family: var(--slidev-theme-font-heading); color: var(--slidev-theme-primary); opacity: 0.1; line-height: 1; }
.statement :deep(blockquote) { font-size: 2.25rem; font-weight: 700; color: var(--slidev-theme-primary); border: none; padding: 0; margin: 0; text-transform: uppercase; }
.statement :deep(blockquote p) { font-size: inherit; color: inherit; text-transform: inherit; }
.statement :deep(p) { font-size: 1rem; opacity: 0.5; margin-top: 1.5rem; }`,
  }

  return `<template>
  <div class="slidev-layout statement h-full flex flex-col justify-center items-center text-center">
    ${decor[p]}
    <div class="max-w-3xl relative z-10"><slot /></div>
  </div>
</template>

<style scoped>${styles[p]}
</style>
`
}

// ── TWO-COLS ──
function twoColsLayout(p: DesignPersonality): string {
  const dividerStyle: Record<DesignPersonality, string> = {
    vibrant: `background: linear-gradient(180deg, var(--slidev-theme-primary), var(--slidev-theme-secondary)); width: 3px; opacity: 0.4;`,
    minimal: `background: var(--slidev-theme-border); width: 1px;`,
    corporate: `background: var(--slidev-theme-border); width: 1px;`,
    bold: `background: var(--slidev-theme-primary); width: 4px; opacity: 0.3;`,
  }

  return `<script setup lang="ts">
defineProps<{ class?: string; layoutClass?: string }>()
</script>

<template>
  <div class="slidev-layout two-columns w-full h-full grid grid-cols-2" :class="layoutClass">
    <div class="col-left" :class="$props.class"><slot /><slot name="left" /></div>
    <div class="col-divider" />
    <div class="col-right" :class="$props.class"><slot name="right" /></div>
  </div>
</template>

<style scoped>
.two-columns { gap: 0; padding: 2.5rem 0; }
.col-left, .col-right { padding: 0 2.5rem; }
.col-divider { position: absolute; left: 50%; top: 12%; bottom: 12%; ${dividerStyle[p]} }
.col-left :deep(h1), .col-right :deep(h1) { font-size: 1.75rem; margin-bottom: 1rem; color: var(--slidev-theme-primary); }
</style>
`
}

// ── IMAGE ──
function imageLayout(side: 'right' | 'left'): string {
  const isRight = side === 'right'
  return `<script setup lang="ts">
defineProps<{ image?: string; class?: string }>()
</script>

<template>
  <div class="slidev-layout image-${side} w-full h-full grid grid-cols-2 gap-0">
    ${isRight ? `<div class="col-content flex flex-col justify-center p-8" :class="$props.class"><slot /></div>
    <div class="col-media h-full overflow-hidden"><slot name="right"><img v-if="image" :src="image" class="w-full h-full object-cover" /></slot></div>`
    : `<div class="col-media h-full overflow-hidden"><slot name="left"><img v-if="image" :src="image" class="w-full h-full object-cover" /></slot></div>
    <div class="col-content flex flex-col justify-center p-8" :class="$props.class"><slot /></div>`}
  </div>
</template>
`
}

// ── END ──
function endLayout(p: DesignPersonality): string {
  const decor: Record<DesignPersonality, string> = {
    vibrant: `<div class="glow-end" /><div class="stripes"><span/><span/><span/></div>`,
    minimal: `<div class="end-line" />`,
    corporate: `<div class="gradient-bg" /><div class="accent-bar" />`,
    bold: `<div class="diag" />`,
  }

  const styles: Record<DesignPersonality, string> = {
    vibrant: `
.end { background: var(--slidev-theme-background); }
.end :deep(h1) { font-size: 3.5rem; font-weight: 900;
  background: linear-gradient(135deg, var(--slidev-theme-primary), var(--slidev-theme-secondary));
  -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text; }
.end :deep(p) { color: var(--slidev-theme-text); opacity: 0.4; text-transform: uppercase; letter-spacing: 0.1em; }
.glow-end { position: absolute; width: 500px; height: 500px; border-radius: 50%; bottom: -150px; left: -100px;
  background: radial-gradient(circle, var(--slidev-theme-secondary) 0%, transparent 70%); opacity: 0.1; }
.stripes { position: absolute; right: 0; top: 30%; display: flex; flex-direction: column; gap: 6px; }
.stripes span { width: 6px; height: 30px; border-radius: 3px; }
.stripes span:nth-child(1) { background: var(--slidev-theme-primary); }
.stripes span:nth-child(2) { background: var(--slidev-theme-secondary); }
.stripes span:nth-child(3) { background: var(--slidev-theme-accent-5, var(--slidev-theme-primary)); }`,

    minimal: `
.end { background: var(--slidev-theme-background); }
.end :deep(h1) { font-size: 2.5rem; font-weight: 600; color: var(--slidev-theme-text); }
.end :deep(p) { color: var(--slidev-theme-text); opacity: 0.35; }
.end-line { position: absolute; top: 50%; left: 50%; transform: translate(-50%,-50%) translateY(-4rem); width: 40px; height: 2px; background: var(--slidev-theme-primary); }`,

    corporate: `
.end { background: var(--slidev-theme-primary); color: var(--slidev-theme-background); }
.gradient-bg { position: absolute; inset: 0; background: linear-gradient(135deg, var(--slidev-theme-primary) 0%, var(--slidev-theme-primary-dark) 100%); }
.end :deep(h1) { color: var(--slidev-theme-background); font-size: 3rem; }
.end :deep(p) { color: var(--slidev-theme-background); opacity: 0.65; }
.accent-bar { position: absolute; top: 0; left: 0; right: 0; height: 4px; background: linear-gradient(90deg, var(--slidev-theme-secondary), var(--slidev-theme-accent-3, var(--slidev-theme-primary-light))); }`,

    bold: `
.end { background: var(--slidev-theme-primary); color: var(--slidev-theme-background); }
.end :deep(h1) { color: var(--slidev-theme-background); font-size: 3.5rem; font-weight: 800; text-transform: uppercase; }
.end :deep(p) { color: var(--slidev-theme-background); opacity: 0.6; }
.diag { position: absolute; top: -10%; right: -5%; width: 40%; height: 120%; background: var(--slidev-theme-background); opacity: 0.05; transform: skewX(-8deg); }`,
  }

  return `<template>
  <div class="slidev-layout end h-full flex flex-col justify-center items-center text-center">
    ${decor[p]}
    <div class="relative z-10"><slot /></div>
  </div>
</template>

<style scoped>${styles[p]}
</style>
`
}

async function writeExampleSlides(
  themeDir: string,
  themeData: PptxThemeData,
  options: GeneratorOptions
): Promise<void> {
  const slides = `---
theme: ./
layout: cover
---

# ${themeData.name}

Converted from PowerPoint template

---
layout: intro
---

# Introduction

## Getting started with this theme

This is the intro layout — great for opening a talk with a title and brief context before diving into the content.

---

# Default Layout

This is the default content layout with standard text and bullet points.

- First point with some detail
- Second point explaining more
- Third point wrapping it up

\`\`\`ts
const theme = '${themeData.name}'
console.log(\`Using: \${theme}\`)
\`\`\`

---
layout: center
---

# Centered Content

This layout centers everything on the slide.

Perfect for a single impactful visual or short message.

---
layout: section
---

# Section Break

A new chapter begins here

---
layout: statement
---

> Design is not just what it looks like. Design is how it works.

Steve Jobs

---
layout: two-cols
---

# Left Column

Content on the left side.

- Item A
- Item B
- Item C

::right::

# Right Column

Content on the right side.

- Item D
- Item E
- Item F

---
layout: image-right
image: https://cover.sli.dev
---

# Image Right

Content sits on the left while an image fills the right side.

- Great for product showcases
- Screenshots and demos
- Visual storytelling

---
layout: image-left
image: https://cover.sli.dev
---

# Image Left

Image on the left, content on the right.

- Alternate visual rhythm
- Break up text-heavy sections
- Keep the audience engaged

---

# Mermaid Diagram

Slidev supports Mermaid diagrams out of the box.

\`\`\`mermaid
graph LR
  A[Idea] --> B[Design]
  B --> C[Build]
  C --> D[Ship]
  D --> E[Learn]
  E --> A
\`\`\`

---

# Chart

Render charts inline with a fenced code block.

\`\`\`mermaid {scale: 0.8}
pie title Project Breakdown
  "Design" : 25
  "Development" : 45
  "Testing" : 20
  "Documentation" : 10
\`\`\`

---

# Sequence Diagram

\`\`\`mermaid
sequenceDiagram
  participant U as User
  participant S as Server
  participant D as Database
  U->>S: Request
  S->>D: Query
  D-->>S: Result
  S-->>U: Response
\`\`\`

---

# LaTeX Math

Slidev supports KaTeX for mathematical expressions.

Euler's identity: $e^{i\\pi} + 1 = 0$

The quadratic formula:

$$x = \\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}$$

---

# Table Layout

| Feature | Status | Notes |
|---------|--------|-------|
| Cover | Done | With visual analysis |
| Layouts | Done | 10 built-in layouts |
| Dark mode | Done | Auto-generated |
| Fonts | Done | From PPTX metadata |
| Colors | Done | Extracted palette |

---
layout: end
---

# Thank You

Questions?
`

  await Bun.write(join(themeDir, 'example.md'), slides)
}

async function extractMediaAssets(themeDir: string, themeData: PptxThemeData): Promise<void> {
  await Promise.all(
    Array.from(themeData.mediaFiles, ([filename, data]) =>
      Bun.write(join(themeDir, 'assets', filename), data)
    )
  )
}
