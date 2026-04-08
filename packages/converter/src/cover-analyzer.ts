/**
 * Visual analysis of the rendered cover slide image.
 * Uses pixel-level heuristics to extract layout information
 * that XML parsing alone cannot capture.
 */

import { PNG } from 'pngjs'
import { readFileSync } from 'node:fs'
import type { CoverAnalysis, GridPosition } from './types'
import { hexToRgb, rgbToHex } from './color-utils'

/** Quantization shift — 8 levels per channel (256/32=8), 512 total buckets */
const BUCKET_SHIFT = 5
const BUCKET_CENTER = 1 << (BUCKET_SHIFT - 1)

interface PixelData {
  width: number
  height: number
  data: Buffer // RGBA interleaved
}

/**
 * Analyze a rendered cover slide PNG to extract layout heuristics.
 */
export function analyzeCoverImage(imagePath: string): CoverAnalysis {
  const png = PNG.sync.read(readFileSync(imagePath)) as PixelData

  const dominantColors = extractDominantColors(png)
  const colorRegions = analyzeColorRegions(png)
  const layout = detectLayoutOrientation(colorRegions)
  const contentGravity = detectContentGravity(png, dominantColors[0])
  const bars = detectBars(png, dominantColors[0])
  const backgroundConfirmed = confirmBackgroundType(png)

  return {
    layout,
    contentGravity,
    colorRegions,
    horizontalBar: bars.horizontal ?? undefined,
    verticalBar: bars.vertical ?? undefined,
    backgroundConfirmed,
    dominantColors,
  }
}

function getPixel(png: PixelData, x: number, y: number): [number, number, number] {
  const idx = (y * png.width + x) * 4
  return [png.data[idx], png.data[idx + 1], png.data[idx + 2]]
}

/** Encode RGB into a single numeric bucket key (0-511) */
function pixelToBucket(r: number, g: number, b: number): number {
  return ((r >> BUCKET_SHIFT) << 6) | ((g >> BUCKET_SHIFT) << 3) | (b >> BUCKET_SHIFT)
}

/** Decode a numeric bucket key back to approximate hex color */
function bucketToHex(key: number): string {
  const r = (key >> 6) & 7
  const g = (key >> 3) & 7
  const b = key & 7
  return rgbToHex(
    (r << BUCKET_SHIFT) + BUCKET_CENTER,
    (g << BUCKET_SHIFT) + BUCKET_CENTER,
    (b << BUCKET_SHIFT) + BUCKET_CENTER,
  )
}

/** Convert a hex color to its bucket key */
function hexToBucket(hex: string): number {
  const [r, g, b] = hexToRgb(hex)
  return pixelToBucket(r, g, b)
}

function extractDominantColors(png: PixelData, topN: number = 5): string[] {
  const counts = new Uint32Array(512) // 8^3 buckets

  for (let y = 0; y < png.height; y += 4) {
    for (let x = 0; x < png.width; x += 4) {
      const [r, g, b] = getPixel(png, x, y)
      counts[pixelToBucket(r, g, b)]++
    }
  }

  // Find top N buckets
  const indices = Array.from({ length: 512 }, (_, i) => i)
  indices.sort((a, b) => counts[b] - counts[a])

  return indices.slice(0, topN)
    .filter(i => counts[i] > 0)
    .map(bucketToHex)
}

interface ColorRegion {
  position: GridPosition
  color: string
  area: number
}

const GRID_POSITIONS: GridPosition[] = [
  'top-left', 'top-center', 'top-right',
  'middle-left', 'middle-center', 'middle-right',
  'bottom-left', 'bottom-center', 'bottom-right',
]

function analyzeColorRegions(png: PixelData): ColorRegion[] {
  const cols = 3
  const rows = 3
  const cellW = Math.floor(png.width / cols)
  const cellH = Math.floor(png.height / rows)

  const regions: ColorRegion[] = []

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const x0 = col * cellW
      const y0 = row * cellH
      const color = dominantColorInRegion(png, x0, y0, cellW, cellH)
      regions.push({
        position: GRID_POSITIONS[row * cols + col],
        color,
        area: 1 / (rows * cols),
      })
    }
  }

  return regions
}

function dominantColorInRegion(
  png: PixelData, x0: number, y0: number, w: number, h: number,
): string {
  const counts = new Uint32Array(512)
  const step = Math.max(2, Math.floor(Math.min(w, h) / 20))

  for (let y = y0; y < y0 + h; y += step) {
    for (let x = x0; x < x0 + w; x += step) {
      const [r, g, b] = getPixel(png, x, y)
      counts[pixelToBucket(r, g, b)]++
    }
  }

  let maxCount = 0
  let maxKey = 0
  for (let i = 0; i < 512; i++) {
    if (counts[i] > maxCount) {
      maxCount = counts[i]
      maxKey = i
    }
  }

  return bucketToHex(maxKey)
}

function detectLayoutOrientation(
  regions: ColorRegion[],
): CoverAnalysis['layout'] {
  const left = regions.filter(r => r.position.endsWith('-left'))
  const right = regions.filter(r => r.position.endsWith('-right'))
  const center = regions.filter(r => r.position.endsWith('-center'))

  const leftColors = new Set(left.map(r => r.color))
  const rightColors = new Set(right.map(r => r.color))
  const centerColors = new Set(center.map(r => r.color))

  const leftUnique = [...leftColors].filter(c => !rightColors.has(c))
  const rightUnique = [...rightColors].filter(c => !leftColors.has(c))

  if (leftUnique.length >= 2 || rightUnique.length >= 2) {
    return 'split'
  }

  const allColors = new Set(regions.map(r => r.color))
  if (allColors.size <= 2) {
    return 'full-bleed'
  }

  const leftVariance = leftColors.size
  const rightVariance = rightColors.size
  const centerVariance = centerColors.size

  if (leftVariance > rightVariance + 1) return 'left-heavy'
  if (rightVariance > leftVariance + 1) return 'right-heavy'
  if (centerVariance >= leftVariance && centerVariance >= rightVariance) return 'centered'

  return 'centered'
}

function detectContentGravity(
  png: PixelData, bgColor: string,
): { x: number; y: number } {
  let totalWeight = 0
  let weightedX = 0
  let weightedY = 0

  const bgBucket = hexToBucket(bgColor)
  const step = 8

  for (let y = 0; y < png.height; y += step) {
    for (let x = 0; x < png.width; x += step) {
      const [r, g, b] = getPixel(png, x, y)
      if (pixelToBucket(r, g, b) !== bgBucket) {
        totalWeight++
        weightedX += x
        weightedY += y
      }
    }
  }

  if (totalWeight === 0) return { x: 0.5, y: 0.5 }

  return {
    x: Math.round((weightedX / totalWeight / png.width) * 100) / 100,
    y: Math.round((weightedY / totalWeight / png.height) * 100) / 100,
  }
}

interface BarDetection {
  horizontal: { color: string; position: 'top' | 'bottom' } | null
  vertical: { color: string; position: 'left' | 'right' } | null
}

/**
 * Detect thin decorative bars by scanning rows/columns
 * with uniform non-background color spanning >50% of the axis.
 */
function detectBars(png: PixelData, bgColor: string): BarDetection {
  const bgBucket = hexToBucket(bgColor)
  const result: BarDetection = { horizontal: null, vertical: null }
  const minSpan = 0.5

  // Horizontal bars in top/bottom 20%
  const hZones = [
    { startY: 0, endY: Math.floor(png.height * 0.2), position: 'top' as const },
    { startY: Math.floor(png.height * 0.8), endY: png.height, position: 'bottom' as const },
  ]

  for (const zone of hZones) {
    for (let y = zone.startY; y < zone.endY; y++) {
      const rowCounts = new Uint32Array(512)
      let nonBgTotal = 0
      for (let x = 0; x < png.width; x += 4) {
        const [r, g, b] = getPixel(png, x, y)
        const bucket = pixelToBucket(r, g, b)
        if (bucket !== bgBucket) {
          rowCounts[bucket]++
          nonBgTotal++
        }
      }

      const samplesPerRow = Math.floor(png.width / 4)
      for (let i = 0; i < 512; i++) {
        if (rowCounts[i] / samplesPerRow >= minSpan) {
          result.horizontal = { color: bucketToHex(i), position: zone.position }
          break
        }
      }
      if (result.horizontal) break
    }
    if (result.horizontal) break
  }

  // Vertical bars in left/right 20%
  const vZones = [
    { startX: 0, endX: Math.floor(png.width * 0.2), position: 'left' as const },
    { startX: Math.floor(png.width * 0.8), endX: png.width, position: 'right' as const },
  ]

  for (const zone of vZones) {
    for (let x = zone.startX; x < zone.endX; x++) {
      const colCounts = new Uint32Array(512)
      for (let y = 0; y < png.height; y += 4) {
        const [r, g, b] = getPixel(png, x, y)
        const bucket = pixelToBucket(r, g, b)
        if (bucket !== bgBucket) {
          colCounts[bucket]++
        }
      }

      const samplesPerCol = Math.floor(png.height / 4)
      for (let i = 0; i < 512; i++) {
        if (colCounts[i] / samplesPerCol >= minSpan) {
          result.vertical = { color: bucketToHex(i), position: zone.position }
          break
        }
      }
      if (result.vertical) break
    }
    if (result.vertical) break
  }

  return result
}

function confirmBackgroundType(png: PixelData): CoverAnalysis['backgroundConfirmed'] {
  const samples: [number, number][] = [
    [5, 5],
    [png.width - 6, 5],
    [5, png.height - 6],
    [png.width - 6, png.height - 6],
    [Math.floor(png.width / 2), Math.floor(png.height / 2)],
  ]

  const colors = samples.map(([x, y]) => {
    const [r, g, b] = getPixel(png, x, y)
    return rgbToHex(r, g, b)
  })

  const uniqueColors = new Set(colors)

  if (uniqueColors.size === 1) return 'solid'

  const cornerVariance = colorDistance(colors[0], colors[3])
  if (uniqueColors.size <= 3 && cornerVariance > 20 && cornerVariance < 200) {
    return 'gradient'
  }

  if (uniqueColors.size >= 4) return 'image'

  return 'complex'
}

function colorDistance(hex1: string, hex2: string): number {
  const [r1, g1, b1] = hexToRgb(hex1)
  const [r2, g2, b2] = hexToRgb(hex2)
  return Math.sqrt((r1 - r2) ** 2 + (g1 - g2) ** 2 + (b1 - b2) ** 2)
}
