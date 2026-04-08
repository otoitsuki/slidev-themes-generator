/**
 * Export PPTX slides as PNG images using LibreOffice headless.
 * Pipeline: PPTX → PDF (via LibreOffice) → PNG per page (via pdftoppm)
 */

import { existsSync } from 'node:fs'
import { mkdir, rm } from 'node:fs/promises'
import { join, basename } from 'node:path'

export async function checkExportDeps(): Promise<{ soffice: boolean; pdftoppm: boolean }> {
  const check = async (cmd: string) => {
    try {
      const proc = Bun.spawn(['which', cmd], { stdout: 'pipe', stderr: 'pipe' })
      return (await proc.exited) === 0
    } catch {
      return false
    }
  }

  return {
    soffice: await check('soffice'),
    pdftoppm: await check('pdftoppm'),
  }
}

/** Convert PPTX to PDF via LibreOffice headless. Returns the PDF path. */
async function pptxToPdf(pptxPath: string, tmpDir: string): Promise<string> {
  await mkdir(tmpDir, { recursive: true })

  const proc = Bun.spawn([
    'soffice', '--headless', '--nolockcheck',
    '--convert-to', 'pdf', '--outdir', tmpDir, pptxPath,
  ], { stdout: 'pipe', stderr: 'pipe' })

  const exitCode = await proc.exited
  if (exitCode !== 0) {
    const stderr = await new Response(proc.stderr).text()
    throw new Error(`LibreOffice PDF export failed (exit ${exitCode}): ${stderr}`)
  }

  const pdfPath = join(tmpDir, basename(pptxPath, '.pptx') + '.pdf')
  if (!existsSync(pdfPath)) {
    throw new Error(`Expected PDF not found at: ${pdfPath}`)
  }

  return pdfPath
}

/** Convert PDF pages to PNG via pdftoppm. Returns array of PNG paths. */
async function pdfToPages(
  pdfPath: string, prefix: string, dpi: number,
  pageRange?: { first: number; last: number },
): Promise<string[]> {
  const args = ['pdftoppm', '-png', '-r', String(dpi)]
  if (pageRange) {
    args.push('-f', String(pageRange.first), '-l', String(pageRange.last))
  }
  args.push(pdfPath, prefix)

  const proc = Bun.spawn(args, { stdout: 'pipe', stderr: 'pipe' })
  const exitCode = await proc.exited
  if (exitCode !== 0) {
    const stderr = await new Response(proc.stderr).text()
    throw new Error(`pdftoppm failed (exit ${exitCode}): ${stderr}`)
  }

  return collectPngs(prefix, pageRange?.first ?? 1)
}

/** Find rendered PNG files by probing padding variants. */
function collectPngs(prefix: string, startPage: number = 1): string[] {
  const pngs: string[] = []
  for (let i = startPage; i <= 999; i++) {
    let found = false
    for (const pad of [2, 3, 1]) {
      const path = `${prefix}-${String(i).padStart(pad, '0')}.png`
      if (existsSync(path)) {
        pngs.push(path)
        found = true
        break
      }
    }
    if (!found) break
  }
  return pngs
}

/**
 * Render a single slide from a PPTX file as a PNG.
 * Optionally accepts a pre-existing PDF to avoid re-invoking LibreOffice.
 */
export async function renderSingleSlide(
  pptxPath: string,
  outputPath: string,
  pageNum: number = 1,
  dpi: number = 150,
  existingPdfPath?: string,
): Promise<string> {
  const outDir = join(outputPath, '..')
  await mkdir(outDir, { recursive: true })

  const tmpDir = join(outDir, '.tmp-render')
  const ownPdf = !existingPdfPath

  try {
    const pdfPath = existingPdfPath ?? await pptxToPdf(pptxPath, tmpDir)
    const prefix = join(tmpDir, 'page')

    await mkdir(tmpDir, { recursive: true })
    const pngs = await pdfToPages(pdfPath, prefix, dpi, { first: pageNum, last: pageNum })

    if (pngs.length === 0) {
      throw new Error(`Rendered page not found for page ${pageNum}`)
    }

    await Bun.write(outputPath, await Bun.file(pngs[0]).arrayBuffer())
    return outputPath
  } finally {
    await rm(tmpDir, { recursive: true, force: true }).catch(() => {})
  }
}

/**
 * Export all slides from a PPTX file as PNG images.
 * Optionally accepts a pre-existing PDF to avoid re-invoking LibreOffice.
 */
export async function exportSlideImages(
  pptxPath: string,
  outputDir: string,
  dpi: number = 150,
  existingPdfPath?: string,
): Promise<string[]> {
  await mkdir(outputDir, { recursive: true })

  const tmpDir = join(outputDir, '.tmp-pdf')

  try {
    const pdfPath = existingPdfPath ?? await pptxToPdf(pptxPath, tmpDir)
    const slidePrefix = join(outputDir, 'slide')
    const pngs = await pdfToPages(pdfPath, slidePrefix, dpi)

    return pngs
  } finally {
    await rm(tmpDir, { recursive: true, force: true }).catch(() => {})
  }
}

/**
 * Convert PPTX to PDF once. Returns the PDF path and a cleanup function.
 * Callers can pass this PDF to renderSingleSlide and exportSlideImages
 * to avoid duplicate LibreOffice invocations.
 */
export async function preparePdf(
  pptxPath: string, tmpDir: string,
): Promise<{ pdfPath: string; cleanup: () => Promise<void> }> {
  const pdfPath = await pptxToPdf(pptxPath, tmpDir)
  return {
    pdfPath,
    cleanup: () => rm(tmpDir, { recursive: true, force: true }),
  }
}
