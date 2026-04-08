#!/usr/bin/env bun

/**
 * pptx2slidev — Convert PowerPoint templates to Slidev themes
 *
 * Usage:
 *   bun run packages/converter/src/cli.ts <input.pptx> [options]
 *
 * Options:
 *   --name <name>      Theme name (default: derived from filename)
 *   --output <dir>     Output directory (default: ./packages/themes)
 *   --color-schema     Color scheme: light, dark, both (default: both)
 */

import { resolve, basename, join } from 'node:path'
import { rm } from 'node:fs/promises'
import { extractPptx } from './extract'
import { parseThemeData } from './theme-parser'
import { generateSlidevTheme } from './slidev-generator'
import { checkExportDeps, preparePdf, renderSingleSlide } from './slide-export'
import { analyzeCoverImage } from './cover-analyzer'
import type { GeneratorOptions, CoverAnalysis } from './types'

function parseArgs(args: string[]): { input: string; options: Partial<GeneratorOptions> } {
  const input = args.find(a => !a.startsWith('--'))
  if (!input) {
    console.error(`
pptx2slidev — Convert PowerPoint templates to Slidev themes

Usage:
  pptx2slidev <input.pptx> [options]

Options:
  --name <name>          Theme name (default: derived from filename)
  --output <dir>         Output directory (default: ./packages/themes)
  --color-schema <mode>  Color scheme: light | dark | both (default: both)

Examples:
  pptx2slidev my-template.pptx
  pptx2slidev my-template.pptx --name elegant --output ./themes
`)
    process.exit(1)
  }

  const options: Partial<GeneratorOptions> = {}

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--name' && args[i + 1]) {
      options.name = args[i + 1]
      i++
    } else if (args[i] === '--output' && args[i + 1]) {
      options.outputDir = args[i + 1]
      i++
    } else if (args[i] === '--color-schema' && args[i + 1]) {
      const schema = args[i + 1] as 'light' | 'dark' | 'both'
      if (!['light', 'dark', 'both'].includes(schema)) {
        console.error(`Invalid color schema: ${schema}. Use: light, dark, both`)
        process.exit(1)
      }
      options.colorSchema = schema
      i++
    }
  }

  return { input, options }
}

async function main() {
  const args = process.argv.slice(2)
  const { input, options } = parseArgs(args)

  const inputPath = resolve(input)
  // Use original filename as theme name (preserving case, spaces → hyphens)
  const defaultName = basename(input, '.pptx')
    .replace(/\s+/g, '-')

  const generatorOptions: GeneratorOptions = {
    name: options.name ?? defaultName,
    outputDir: resolve(options.outputDir ?? './packages/themes'),
    colorSchema: options.colorSchema ?? 'both',
  }

  console.log(`\n  pptx2slidev`)
  console.log(`  ───────────────────────────────`)
  console.log(`  Input:  ${inputPath}`)
  console.log(`  Output: ${generatorOptions.outputDir}/slidev-theme-${generatorOptions.name}`)
  console.log(`  Schema: ${generatorOptions.colorSchema}\n`)

  // Step 1: Extract PPTX
  console.log('  [1/4] Extracting PPTX archive...')
  const rawData = await extractPptx(inputPath)

  // Step 2: Render cover slide & visual analysis (requires LibreOffice)
  let coverAnalysis: CoverAnalysis | undefined
  const deps = await checkExportDeps()
  let sharedPdfPath: string | undefined
  let sharedPdfCleanup: (() => Promise<void>) | undefined

  if (deps.soffice && deps.pdftoppm) {
    console.log('  [2/4] Rendering cover slide for visual analysis...')
    try {
      // Convert PPTX → PDF once, reuse for cover analysis and slide export
      const tmpPdfDir = join(generatorOptions.outputDir, '.tmp-shared-pdf')
      const pdf = await preparePdf(inputPath, tmpPdfDir)
      sharedPdfPath = pdf.pdfPath
      sharedPdfCleanup = pdf.cleanup

      const tmpCoverPath = join(generatorOptions.outputDir, '.tmp-cover-analysis.png')
      await renderSingleSlide(inputPath, tmpCoverPath, 1, 150, sharedPdfPath)
      coverAnalysis = analyzeCoverImage(tmpCoverPath)

      console.log(`    Layout: ${coverAnalysis.layout}`)
      console.log(`    Content gravity: (${coverAnalysis.contentGravity.x}, ${coverAnalysis.contentGravity.y})`)
      console.log(`    Background: ${coverAnalysis.backgroundConfirmed}`)
      console.log(`    Dominant colors: ${coverAnalysis.dominantColors.slice(0, 3).join(', ')}`)
      if (coverAnalysis.horizontalBar) console.log(`    Horizontal bar: ${coverAnalysis.horizontalBar.color} (${coverAnalysis.horizontalBar.position})`)
      if (coverAnalysis.verticalBar) console.log(`    Vertical bar: ${coverAnalysis.verticalBar.color} (${coverAnalysis.verticalBar.position})`)

      await rm(tmpCoverPath).catch(() => {})
    } catch (err: any) {
      console.log(`    Visual analysis failed: ${err.message}`)
      console.log(`    (Falling back to XML-only analysis)`)
    }
  } else {
    console.log(`  [2/4] Skipping visual analysis (${!deps.soffice ? 'soffice' : 'pdftoppm'} not found)`)
  }

  // Step 3: Parse theme data (incorporates visual analysis if available)
  console.log('  [3/4] Parsing theme data...')
  const themeData = parseThemeData(rawData, generatorOptions.name)
  if (coverAnalysis) {
    themeData.coverAnalysis = coverAnalysis
  }

  // Print extraction summary
  console.log(`\n  Extracted Theme Data:`)
  console.log(`  ───────────────────────────────`)
  console.log(`  Colors:`)
  console.log(`    Primary:    ${themeData.colors.accent1}`)
  console.log(`    Secondary:  ${themeData.colors.accent2}`)
  console.log(`    Text:       ${themeData.colors.dk1}`)
  console.log(`    Background: ${themeData.colors.lt1}`)
  console.log(`    Accent 3-6: ${themeData.colors.accent3}, ${themeData.colors.accent4}, ${themeData.colors.accent5}, ${themeData.colors.accent6}`)
  console.log(`    Link:       ${themeData.colors.hlink}`)
  console.log(`  Fonts:`)
  console.log(`    Heading: ${themeData.fonts.majorFont} (${themeData.fonts.titleSize}pt)`)
  console.log(`    Body:    ${themeData.fonts.minorFont} (${themeData.fonts.bodySize}pt)`)
  console.log(`  Layouts detected: ${themeData.layouts.length}`)
  themeData.layouts.forEach(l => {
    console.log(`    ${l.name} → ${l.suggestedSlidevLayout} (placeholders: ${l.placeholderTypes.join(', ') || 'none'})`)
  })
  console.log(`  Background: ${themeData.background.type}${themeData.background.type !== 'none' ? ` (${themeData.background.value.substring(0, 50)})` : ''}`)
  console.log(`  Slide size: ${themeData.slideWidth}x${themeData.slideHeight}px`)
  console.log(`  Media files: ${themeData.mediaFiles.size}`)
  if (coverAnalysis) {
    console.log(`  Visual analysis: ${coverAnalysis.layout} layout, gravity (${coverAnalysis.contentGravity.x}, ${coverAnalysis.contentGravity.y})`)
  }

  // Step 4: Generate Slidev theme
  console.log(`\n  [4/4] Generating Slidev theme...`)
  const outputDir = await generateSlidevTheme(themeData, generatorOptions)

  // Clean up shared PDF used for cover analysis
  await sharedPdfCleanup?.()


  console.log(`\n  Done! Theme generated at:`)
  console.log(`  ${outputDir}\n`)
  console.log(`  Next steps:`)
  console.log(`  1. cd ${outputDir}`)
  console.log(`  2. Review and customize styles/index.css`)
  console.log(`  3. Edit layouts/*.vue to match your template's look`)
  console.log(`  4. Test: npx slidev example.md`)
  console.log()
}

main().catch(err => {
  console.error('Error:', err.message)
  process.exit(1)
})
