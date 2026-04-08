/**
 * Color conversion utilities for PPTX theme colors.
 * Handles hex ↔ HSL conversion and PPTX luminance modifiers.
 */

export function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '')
  return [
    parseInt(h.substring(0, 2), 16),
    parseInt(h.substring(2, 4), 16),
    parseInt(h.substring(4, 6), 16),
  ]
}

export function rgbToHex(r: number, g: number, b: number): string {
  const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)))
  return `#${[r, g, b].map(v => clamp(v).toString(16).padStart(2, '0')).join('')}`
}

export function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255
  g /= 255
  b /= 255

  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const l = (max + min) / 2
  let h = 0
  let s = 0

  if (max !== min) {
    const d = max - min
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break
      case g: h = ((b - r) / d + 2) / 6; break
      case b: h = ((r - g) / d + 4) / 6; break
    }
  }

  return [h * 360, s * 100, l * 100]
}

export function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  h /= 360
  s /= 100
  l /= 100

  if (s === 0) {
    const v = Math.round(l * 255)
    return [v, v, v]
  }

  const hue2rgb = (p: number, q: number, t: number) => {
    if (t < 0) t += 1
    if (t > 1) t -= 1
    if (t < 1 / 6) return p + (q - p) * 6 * t
    if (t < 1 / 2) return q
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6
    return p
  }

  const q = l < 0.5 ? l * (1 + s) : l + s - l * s
  const p = 2 * l - q

  return [
    Math.round(hue2rgb(p, q, h + 1 / 3) * 255),
    Math.round(hue2rgb(p, q, h) * 255),
    Math.round(hue2rgb(p, q, h - 1 / 3) * 255),
  ]
}

/**
 * Apply PPTX luminance modifiers to a hex color.
 * lumMod: percentage multiplier (e.g., 60000 = 60%)
 * lumOff: percentage offset (e.g., 40000 = 40%)
 * Values are in 1/1000th of a percent (PPTX convention).
 */
export function applyLuminanceModifiers(hex: string, lumMod?: number, lumOff?: number): string {
  const [r, g, b] = hexToRgb(hex)
  let [h, s, l] = rgbToHsl(r, g, b)

  if (lumMod !== undefined) {
    l = l * (lumMod / 100000)
  }
  if (lumOff !== undefined) {
    l = l + (lumOff / 100000) * 100
  }

  l = Math.max(0, Math.min(100, l))
  const [nr, ng, nb] = hslToRgb(h, s, l)
  return rgbToHex(nr, ng, nb)
}

/**
 * Generate a lighter variant of a color (for hover states, backgrounds, etc.)
 */
export function lighten(hex: string, amount: number = 20): string {
  return applyLuminanceModifiers(hex, 100000 - amount * 1000, amount * 1000)
}

/**
 * Generate a darker variant of a color
 */
export function darken(hex: string, amount: number = 20): string {
  return applyLuminanceModifiers(hex, 100000 - amount * 1000)
}

/**
 * Invert light/dark colors for dark mode derivation.
 * Swaps dk↔lt pairs and adjusts accent lightness.
 */
export function invertForDarkMode(hex: string): string {
  const [r, g, b] = hexToRgb(hex)
  let [h, s, l] = rgbToHsl(r, g, b)

  // Invert lightness: dark becomes light, light becomes dark
  l = 100 - l

  const [nr, ng, nb] = hslToRgb(h, s, l)
  return rgbToHex(nr, ng, nb)
}

/**
 * Calculate relative luminance per WCAG 2.1 spec.
 * Returns value between 0 (black) and 1 (white).
 */
export function relativeLuminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map(c => {
    const s = c / 255
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

/**
 * Calculate WCAG contrast ratio between two colors.
 * Returns value between 1 (no contrast) and 21 (max contrast).
 * WCAG AA requires 4.5:1 for normal text, 3:1 for large text.
 */
export function contrastRatio(hex1: string, hex2: string): number {
  const l1 = relativeLuminance(hex1)
  const l2 = relativeLuminance(hex2)
  const lighter = Math.max(l1, l2)
  const darker = Math.min(l1, l2)
  return (lighter + 0.05) / (darker + 0.05)
}

/**
 * Ensure a foreground color has sufficient contrast against a background.
 * If contrast is below minRatio, adjust the foreground lightness.
 * Returns the adjusted color (or original if already passing).
 */
export function ensureContrast(fg: string, bg: string, minRatio: number = 4.5): string {
  if (contrastRatio(fg, bg) >= minRatio) return fg

  const [r, g, b] = hexToRgb(fg)
  let [h, s, l] = rgbToHsl(r, g, b)
  const bgLum = relativeLuminance(bg)

  // Determine direction: lighten fg on dark bg, darken fg on light bg
  const direction = bgLum < 0.5 ? 1 : -1
  const step = 3

  for (let i = 0; i < 40; i++) {
    l = Math.max(0, Math.min(100, l + direction * step))
    const [nr, ng, nb] = hslToRgb(h, s, l)
    const candidate = rgbToHex(nr, ng, nb)
    if (contrastRatio(candidate, bg) >= minRatio) return candidate
  }

  // Fallback: white on dark, black on light
  return bgLum < 0.5 ? '#ffffff' : '#000000'
}

/**
 * Check if a background color is "dark" (luminance below threshold).
 */
export function isDarkBackground(hex: string): boolean {
  return relativeLuminance(hex) < 0.179
}

/** Convert PPTX EMU (English Metric Units) to pixels at 96 DPI */
export function emuToPixels(emu: number): number {
  return Math.round(emu / 9525)
}

/** Convert PPTX EMU to rem (assuming 16px = 1rem) */
export function emuToRem(emu: number): number {
  return Math.round((emu / 9525 / 16) * 100) / 100
}
