export interface PptxThemeColor {
  name: string
  hex: string
}

export interface PptxFontScheme {
  majorFont: string
  minorFont: string
  titleSize: number  // in pt
  bodySize: number   // in pt
  subtitleSize: number // in pt
}

export interface PptxColorScheme {
  dk1: string
  lt1: string
  dk2: string
  lt2: string
  accent1: string
  accent2: string
  accent3: string
  accent4: string
  accent5: string
  accent6: string
  hlink: string
  folHlink: string
}

export type SlidevLayoutType = 'cover' | 'default' | 'section' | 'two-cols' | 'center' | 'end' | 'image-right' | 'image-left'

export interface PptxLayoutInfo {
  name: string
  index: number
  placeholderTypes: string[]
  suggestedSlidevLayout: SlidevLayoutType
}

export interface PptxBackground {
  type: 'solid' | 'gradient' | 'image' | 'none'
  value: string // hex color, CSS gradient, or image filename
}

/** Design data extracted from the first slide for cover reproduction */
export interface CoverSlideData {
  background: PptxBackground
  images: string[]        // filenames of images used in slide 1
  shapeColors: string[]   // colors found in slide 1 shapes
}

export type GridPosition =
  | 'top-left' | 'top-center' | 'top-right'
  | 'middle-left' | 'middle-center' | 'middle-right'
  | 'bottom-left' | 'bottom-center' | 'bottom-right'

/** Visual analysis results from rendering and analyzing the cover slide image */
export interface CoverAnalysis {
  /** Detected layout orientation */
  layout: 'centered' | 'left-heavy' | 'right-heavy' | 'split' | 'full-bleed'
  /** Where content concentrates (0-1 normalized coordinates) */
  contentGravity: { x: number; y: number }
  /** Dominant color regions detected in the image */
  colorRegions: { position: GridPosition; color: string; area: number }[]
  /** Detected decorative horizontal bar */
  horizontalBar?: { color: string; position: 'top' | 'bottom' }
  /** Detected decorative vertical bar */
  verticalBar?: { color: string; position: 'left' | 'right' }
  /** Confirmed background type from pixel analysis */
  backgroundConfirmed: 'solid' | 'gradient' | 'image' | 'complex'
  /** Top dominant colors by area */
  dominantColors: string[]
}

export interface PptxThemeData {
  name: string
  colors: PptxColorScheme
  fonts: PptxFontScheme
  layouts: PptxLayoutInfo[]
  background: PptxBackground
  coverSlide: CoverSlideData
  coverAnalysis?: CoverAnalysis
  slideWidth: number  // in pixels
  slideHeight: number // in pixels
  mediaFiles: Map<string, Uint8Array>
  personality: DesignPersonality
}

/**
 * Design personality detected from PPTX characteristics.
 * Determines which visual treatment set the generator uses.
 */
export type DesignPersonality = 'vibrant' | 'minimal' | 'corporate' | 'bold'

export interface GeneratorOptions {
  name: string
  outputDir: string
  colorSchema: 'light' | 'dark' | 'both'
}
