/**
 * Parse PPTX raw XML data into structured theme data.
 * Extracts colors, fonts, layouts, and backgrounds.
 */

import type { PptxRawData } from './extract'
import type {
  PptxColorScheme,
  PptxFontScheme,
  PptxLayoutInfo,
  PptxBackground,
  PptxThemeData,
  SlidevLayoutType,
  DesignPersonality,
  CoverSlideData,
} from './types'
import { emuToPixels } from './color-utils'

/** Convert PPTX hundredths-of-a-point to pt */
function hundredthsPtToPt(val: number): number {
  return Math.round(val / 100)
}

export function parseThemeData(raw: PptxRawData, themeName: string): PptxThemeData {
  const colors = extractColors(raw.theme)
  const fonts = extractFonts(raw.theme)
  const layouts = extractLayouts(raw.slideLayouts)
  const background = extractBackground(raw.slideMasters[0])
  const { width, height } = extractSlideDimensions(raw.presentation)

  // Try to extract font sizes from slide master default text styles
  extractFontSizesFromMaster(raw.slideMasters[0], fonts)

  // Override dk1/lt1 with actual text colors from slide master txStyles.
  // Many templates set dk1 to a bogus color (e.g. red) but define the real
  // text color in the slide master's title/body solidFill.
  // Save originals for fallback in sanity check
  const originalDk2 = colors.dk2
  overrideTextColorsFromMaster(raw.slideMasters[0], colors, background, originalDk2)

  const personality = detectPersonality(colors, fonts, layouts, background)
  console.log(`  [style] Detected personality: ${personality}`)

  const coverSlide = extractCoverSlide(raw.slide1, raw.slide1Rels)
  if (coverSlide.background.type !== 'none') {
    console.log(`  [cover] Slide 1 bg: ${coverSlide.background.type} (${coverSlide.background.value.substring(0, 50)})`)
  }
  if (coverSlide.images.length) {
    console.log(`  [cover] Slide 1 images: ${coverSlide.images.join(', ')}`)
  }
  if (coverSlide.shapeColors.length) {
    console.log(`  [cover] Slide 1 shape colors: ${coverSlide.shapeColors.join(', ')}`)
  }

  return {
    name: themeName,
    colors,
    fonts,
    layouts,
    background,
    coverSlide,
    slideWidth: width,
    slideHeight: height,
    mediaFiles: raw.mediaFiles,
    personality,
  }
}

/**
 * Detect the design personality from PPTX characteristics.
 *
 * Signals used:
 * - Font weight keywords in font name (Black, Bold, Light, Thin)
 * - Title font size (>80pt = bold/vibrant, <50pt = standard)
 * - Unique accent color count (1 = minimal, 4+ = vibrant/corporate)
 * - Background darkness (black bg = dramatic)
 * - Color saturation (high saturation + dark bg = neon/vibrant)
 */
function detectPersonality(
  colors: PptxColorScheme,
  fonts: PptxFontScheme,
  layouts: PptxLayoutInfo[],
  background: PptxBackground
): DesignPersonality {
  const fontName = (fonts.majorFont + ' ' + fonts.minorFont).toLowerCase()
  const isBoldFont = fontName.includes('black') || fontName.includes('heavy') || (fontName.includes('bold') && !fontName.includes('semibold'))
  const isLightFont = fontName.includes('light') || fontName.includes('thin')
  const isLargeTitle = fonts.titleSize > 80
  const darkBg = isDarkBg(colors.lt1)

  // Count unique, non-neutral accent colors
  const accents = [colors.accent1, colors.accent2, colors.accent3, colors.accent4, colors.accent5, colors.accent6]
  const uniqueAccents = new Set(accents.filter(c => {
    const upper = c.toUpperCase()
    return upper !== '#FFFFFF' && upper !== '#000000' && upper !== '#FFFFFF'
  })).size

  // Vibrant: bold font + dark bg + many saturated colors + large titles
  if (darkBg && isBoldFont && isLargeTitle && uniqueAccents >= 4) {
    return 'vibrant'
  }

  // Minimal: few accent colors, standard fonts, light bg
  if (uniqueAccents <= 2 && !darkBg && !isBoldFont) {
    return 'minimal'
  }

  // Bold: bold/heavy fonts OR large titles, but not full vibrant
  if (isBoldFont || isLargeTitle) {
    return 'bold'
  }

  // Corporate: many layouts, light fonts, standard sizing
  return 'corporate'
}

/**
 * Extract design data from slide 1 for cover reproduction.
 * Reads background, embedded images, and shape colors.
 */
function extractCoverSlide(slide1: any, slide1Rels: any): CoverSlideData {
  const result: CoverSlideData = {
    background: { type: 'none', value: '' },
    images: [],
    shapeColors: [],
  }

  if (!slide1) return result

  const sld = slide1['p:sld']
  const cSld = sld?.['p:cSld']

  // Extract slide 1 background
  const bg = cSld?.['p:bg']
  if (bg) {
    const bgPr = bg['p:bgPr']
    if (bgPr) {
      // Solid fill
      const solidFill = bgPr['a:solidFill']
      if (solidFill) {
        const srgb = solidFill['a:srgbClr']
        if (srgb) {
          const val = srgb['@_val'] ?? srgb
          result.background = { type: 'solid', value: `#${val}` }
        }
      }

      // Gradient fill
      const gradFill = bgPr['a:gradFill']
      if (gradFill) {
        const stops = gradFill['a:gsLst']?.['a:gs']
        if (Array.isArray(stops) && stops.length >= 2) {
          const cssStops = stops.map((stop: any) => {
            const pos = (stop['@_pos'] ?? 0) / 1000
            const srgb = stop['a:srgbClr']
            const color = srgb ? `#${srgb['@_val'] ?? srgb}` : '#000000'
            return `${color} ${pos}%`
          })
          result.background = { type: 'gradient', value: `linear-gradient(135deg, ${cssStops.join(', ')})` }
        }
      }
    }
  }

  // Extract image filenames from slide 1 relationships
  if (slide1Rels) {
    const rels = slide1Rels['Relationships']?.['Relationship']
    const relArr = Array.isArray(rels) ? rels : rels ? [rels] : []
    for (const rel of relArr) {
      const target = rel['@_Target'] ?? ''
      if (target.match(/\.(png|jpg|jpeg|svg|gif)$/i)) {
        const filename = target.split('/').pop()!
        result.images.push(filename)
      }
    }
  }

  // Extract colors from shapes in slide 1
  const spTree = cSld?.['p:spTree']
  if (spTree) {
    const shapes = Array.isArray(spTree['p:sp']) ? spTree['p:sp'] : spTree['p:sp'] ? [spTree['p:sp']] : []
    const colorSet = new Set<string>()
    for (const sp of shapes) {
      // Check shape fill
      const spPr = sp?.['p:spPr']
      const solidFill = spPr?.['a:solidFill']
      if (solidFill) {
        const srgb = solidFill['a:srgbClr']
        if (srgb) {
          const val = srgb['@_val'] ?? srgb
          if (typeof val === 'string') colorSet.add(`#${val}`)
        }
      }
    }
    result.shapeColors = [...colorSet]
  }

  return result
}

function isDarkBg(hex: string): boolean {
  const h = hex.replace('#', '')
  const r = parseInt(h.substring(0, 2), 16)
  const g = parseInt(h.substring(2, 4), 16)
  const b = parseInt(h.substring(4, 6), 16)
  return (r * 299 + g * 587 + b * 114) / 1000 < 128
}

function extractColors(theme: any): PptxColorScheme {
  const themeElements = theme?.['a:theme']?.['a:themeElements']
  const clrScheme = themeElements?.['a:clrScheme']

  if (!clrScheme) {
    console.warn('No color scheme found in theme, using defaults')
    return defaultColors()
  }

  const getColor = (node: any): string => {
    if (!node) return '#000000'
    // Direct sRGB color
    if (node['a:srgbClr']) {
      const val = node['a:srgbClr']['@_val'] ?? node['a:srgbClr']
      return typeof val === 'string' ? `#${val}` : '#000000'
    }
    // System color (e.g., windowText, window)
    if (node['a:sysClr']) {
      const lastClr = node['a:sysClr']['@_lastClr']
      return lastClr ? `#${lastClr}` : '#000000'
    }
    return '#000000'
  }

  return {
    dk1: getColor(clrScheme['a:dk1']),
    lt1: getColor(clrScheme['a:lt1']),
    dk2: getColor(clrScheme['a:dk2']),
    lt2: getColor(clrScheme['a:lt2']),
    accent1: getColor(clrScheme['a:accent1']),
    accent2: getColor(clrScheme['a:accent2']),
    accent3: getColor(clrScheme['a:accent3']),
    accent4: getColor(clrScheme['a:accent4']),
    accent5: getColor(clrScheme['a:accent5']),
    accent6: getColor(clrScheme['a:accent6']),
    hlink: getColor(clrScheme['a:hlink']),
    folHlink: getColor(clrScheme['a:folHlink']),
  }
}

function extractFonts(theme: any): PptxFontScheme {
  const themeElements = theme?.['a:theme']?.['a:themeElements']
  const fontScheme = themeElements?.['a:fontScheme']

  if (!fontScheme) {
    return { majorFont: 'Inter', minorFont: 'Inter' }
  }

  const getMajor = (): string => {
    const latin = fontScheme['a:majorFont']?.['a:latin']
    return latin?.['@_typeface'] ?? 'Inter'
  }

  const getMinor = (): string => {
    const latin = fontScheme['a:minorFont']?.['a:latin']
    return latin?.['@_typeface'] ?? 'Inter'
  }

  return {
    majorFont: getMajor(),
    minorFont: getMinor(),
    titleSize: 44,    // PPTX default title size
    bodySize: 18,     // PPTX default body size
    subtitleSize: 28, // PPTX default subtitle size
  }
}

function extractLayouts(slideLayouts: any[]): PptxLayoutInfo[] {
  return slideLayouts.map((layout, index) => {
    const sldLayout = layout['p:sldLayout']
    const cSld = sldLayout?.['p:cSld']
    const spTree = cSld?.['p:spTree']

    const placeholderTypes = extractPlaceholderTypes(spTree)
    const layoutName = cSld?.['@_name'] ?? sldLayout?.['@_type'] ?? `Layout ${index + 1}`

    return {
      name: layoutName,
      index,
      placeholderTypes,
      suggestedSlidevLayout: classifyLayout(placeholderTypes, layoutName),
    }
  })
}

function extractPlaceholderTypes(spTree: any): string[] {
  if (!spTree) return []

  const shapes = Array.isArray(spTree['p:sp']) ? spTree['p:sp'] : spTree['p:sp'] ? [spTree['p:sp']] : []

  return shapes
    .map((sp: any) => {
      const ph = sp?.['p:nvSpPr']?.['p:nvPr']?.['p:ph']
      return ph?.['@_type'] ?? null
    })
    .filter(Boolean) as string[]
}

function classifyLayout(placeholderTypes: string[], name: string): SlidevLayoutType {
  const types = new Set(placeholderTypes)
  const nameLower = name.toLowerCase()

  // === Name-based classification (higher priority for portfolio/mockup templates) ===

  // Welcome / intro slides → cover
  if (nameLower.includes('welcome') || nameLower.includes('intro') || nameLower.includes('title slide')) {
    return 'cover'
  }

  // End / thank you slides
  if (nameLower.includes('end') || nameLower.includes('thank')) {
    return 'end'
  }

  // Section headers
  if (nameLower.includes('section') || nameLower.includes('divider') || nameLower.includes('chapter')) {
    return 'section'
  }

  // Two-column variants
  if (nameLower.includes('two col') || nameLower.includes('2 col') || nameLower.includes('comparison')) {
    return 'two-cols'
  }

  // Image-heavy layouts (device mockups, portfolio, etc.)
  const imageLayoutPatterns = [
    'phone', 'tablet', 'laptop', 'watch', 'web browser', 'device',
    'portfolio', 'gallery', 'mockup', 'screenshot',
  ]
  if (imageLayoutPatterns.some(p => nameLower.includes(p))) {
    return 'image-right'
  }

  // Background image layouts
  if (nameLower.includes('background image') || nameLower.includes('full image')) {
    return 'cover'
  }

  // Team / people layouts
  if (nameLower.includes('team') || nameLower.includes('advisor') || nameLower.includes('client')) {
    return 'default'
  }

  // Facts / milestones / steps → default content
  if (nameLower.includes('fact') || nameLower.includes('milestone') || nameLower.includes('step')) {
    return 'default'
  }

  // === Placeholder-based classification (fallback) ===

  // Title Slide / Cover
  if (types.has('ctrTitle') || types.has('subTitle')) {
    return 'cover'
  }

  // Section header (title only)
  if (types.has('title') && types.size === 1) {
    return 'section'
  }

  // Two columns — has multiple body/object placeholders
  const bodyCount = placeholderTypes.filter(t => t === 'body' || t === 'obj').length
  if (bodyCount >= 2) {
    return 'two-cols'
  }

  // Blank / minimal
  if (types.size === 0 || (types.size <= 2 && !types.has('title') && !types.has('body'))) {
    return 'center'
  }

  // Default: title + body content
  return 'default'
}

function extractBackground(slideMaster: any): PptxBackground {
  if (!slideMaster) return { type: 'none', value: '' }

  const bg = slideMaster?.['p:sldMaster']?.['p:cSld']?.['p:bg']
  if (!bg) return { type: 'none', value: '' }

  const bgPr = bg['p:bgPr']
  if (!bgPr) return { type: 'none', value: '' }

  // Solid fill
  const solidFill = bgPr['a:solidFill']
  if (solidFill) {
    const srgb = solidFill['a:srgbClr']
    if (srgb) {
      const val = srgb['@_val'] ?? srgb
      return { type: 'solid', value: `#${val}` }
    }
  }

  // Gradient fill
  const gradFill = bgPr['a:gradFill']
  if (gradFill) {
    const stops = gradFill['a:gsLst']?.['a:gs']
    if (Array.isArray(stops) && stops.length >= 2) {
      const cssStops = stops.map((stop: any) => {
        const pos = (stop['@_pos'] ?? 0) / 1000
        const srgb = stop['a:srgbClr']
        const color = srgb ? `#${srgb['@_val'] ?? srgb}` : '#000000'
        return `${color} ${pos}%`
      })
      return { type: 'gradient', value: `linear-gradient(to bottom, ${cssStops.join(', ')})` }
    }
  }

  // Image fill
  const blipFill = bgPr['a:blipFill']
  if (blipFill) {
    const embed = blipFill['a:blip']?.['@_r:embed']
    if (embed) {
      return { type: 'image', value: embed }
    }
  }

  return { type: 'none', value: '' }
}

function extractSlideDimensions(presentation: any): { width: number; height: number } {
  const sldSz = presentation?.['p:presentation']?.['p:sldSz']
  if (!sldSz) {
    // Default 16:9
    return { width: 960, height: 540 }
  }

  return {
    width: emuToPixels(sldSz['@_cx'] ?? 12192000),
    height: emuToPixels(sldSz['@_cy'] ?? 6858000),
  }
}

/**
 * Many PPTX templates set dk1 to a placeholder color (like red) but define
 * the actual text color via solidFill in slide master txStyles. When the
 * master's title text color differs from dk1, trust the master.
 */
function overrideTextColorsFromMaster(
  slideMaster: any,
  colors: PptxColorScheme,
  background: PptxBackground,
  originalDk2: string
): void {
  if (!slideMaster) return

  const txStyles = slideMaster?.['p:sldMaster']?.['p:txStyles']
  if (!txStyles) return

  // Extract the actual title text color from master
  const titleStyle = txStyles['p:titleStyle']
  const titleDefRPr = titleStyle?.['a:lvl1pPr']?.['a:defRPr']
  const titleFill = titleDefRPr?.['a:solidFill']

  if (titleFill) {
    const srgb = titleFill['a:srgbClr']
    if (srgb) {
      const masterTextColor = `#${srgb['@_val'] ?? srgb}`
      // If master text color differs from dk1, the master is authoritative
      if (masterTextColor.toLowerCase() !== colors.dk1.toLowerCase()) {
        console.log(`  [fix] Overriding dk1 text color: ${colors.dk1} → ${masterTextColor} (from slide master)`)
        colors.dk1 = masterTextColor
      }
    }
  }

  // Extract body text color as secondary
  const bodyStyle = txStyles['p:bodyStyle']
  const bodyDefRPr = bodyStyle?.['a:lvl1pPr']?.['a:defRPr']
  const bodyFill = bodyDefRPr?.['a:solidFill']

  if (bodyFill) {
    const srgb = bodyFill['a:srgbClr']
    if (srgb) {
      const masterBodyColor = `#${srgb['@_val'] ?? srgb}`
      if (masterBodyColor.toLowerCase() !== colors.dk2.toLowerCase()) {
        console.log(`  [fix] Overriding dk2 body color: ${colors.dk2} → ${masterBodyColor} (from slide master)`)
        colors.dk2 = masterBodyColor
      }
    }
  }

  // Detect dark template: if background is dark and text is light, swap dk/lt
  if (background.type === 'solid') {
    const bgHex = background.value.replace('#', '')
    const bgR = parseInt(bgHex.substring(0, 2), 16)
    const bgG = parseInt(bgHex.substring(2, 4), 16)
    const bgB = parseInt(bgHex.substring(4, 6), 16)
    const bgLuminance = (bgR * 299 + bgG * 587 + bgB * 114) / 1000

    if (bgLuminance < 128) {
      // Dark background — set lt1 to background color for correct Slidev mapping
      console.log(`  [fix] Dark template detected (bg luminance: ${bgLuminance.toFixed(0)}), adjusting color mapping`)
      colors.lt1 = background.value
      // dk1 is already the text color from master override above
    }
  }

  // Sanity check: if text and background ended up the same color, fix it
  if (colors.dk1.toLowerCase() === colors.lt1.toLowerCase()) {
    const ltLum = hexLuminance(colors.lt1)
    if (ltLum > 128) {
      // Light background → text should be dark
      // Try original dk2 from theme XML (before master override), it's usually a good text color
      const origDk2Lum = hexLuminance(originalDk2)
      if (origDk2Lum < 128 && originalDk2.toLowerCase() !== colors.lt1.toLowerCase()) {
        console.log(`  [fix] Text/bg same color, using original dk2 as text: ${originalDk2}`)
        colors.dk1 = originalDk2
      } else {
        console.log(`  [fix] Text/bg same color, falling back to #1a1a2e`)
        colors.dk1 = '#1a1a2e'
      }
    } else {
      // Dark background → text should be light
      const lt2Lum = hexLuminance(colors.lt2)
      if (lt2Lum > 128 && colors.lt2.toLowerCase() !== colors.lt1.toLowerCase()) {
        console.log(`  [fix] Text/bg same color, using lt2 as text: ${colors.lt2}`)
        colors.dk1 = colors.lt2
      } else {
        console.log(`  [fix] Text/bg same color, falling back to #f0f0f0`)
        colors.dk1 = '#f0f0f0'
      }
    }
  }
}

function hexLuminance(hex: string): number {
  const h = hex.replace('#', '')
  const r = parseInt(h.substring(0, 2), 16)
  const g = parseInt(h.substring(2, 4), 16)
  const b = parseInt(h.substring(4, 6), 16)
  return (r * 299 + g * 587 + b * 114) / 1000
}

function extractFontSizesFromMaster(slideMaster: any, fonts: PptxFontScheme): void {
  if (!slideMaster) return

  const txStyles = slideMaster?.['p:sldMaster']?.['p:txStyles']
  if (!txStyles) return

  // Title style
  const titleStyle = txStyles['p:titleStyle']
  if (titleStyle) {
    const lvl1 = titleStyle['a:lvl1pPr']
    const defRPr = lvl1?.['a:defRPr']
    if (defRPr?.['@_sz']) {
      fonts.titleSize = hundredthsPtToPt(defRPr['@_sz'])
    }
  }

  // Body style
  const bodyStyle = txStyles['p:bodyStyle']
  if (bodyStyle) {
    const lvl1 = bodyStyle['a:lvl1pPr']
    const defRPr = lvl1?.['a:defRPr']
    if (defRPr?.['@_sz']) {
      fonts.bodySize = hundredthsPtToPt(defRPr['@_sz'])
    }
  }
}

function defaultColors(): PptxColorScheme {
  return {
    dk1: '#000000',
    lt1: '#FFFFFF',
    dk2: '#1F497D',
    lt2: '#EBEBEB',
    accent1: '#4472C4',
    accent2: '#ED7D31',
    accent3: '#A5A5A5',
    accent4: '#FFC000',
    accent5: '#5B9BD5',
    accent6: '#70AD47',
    hlink: '#0563C1',
    folHlink: '#954F72',
  }
}
