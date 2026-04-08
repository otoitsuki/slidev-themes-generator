/**
 * PPTX ZIP extraction — reads the archive and returns parsed XML objects
 * for theme, slide masters, slide layouts, and presentation metadata.
 */

import JSZip from 'jszip'
import { XMLParser } from 'fast-xml-parser'

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  allowBooleanAttributes: true,
  parseAttributeValue: true,
})

export interface PptxRawData {
  theme: any
  slideMasters: any[]
  slideLayouts: any[]
  slide1: any
  slide1Rels: any
  presentation: any
  mediaFiles: Map<string, Uint8Array>
}

export async function extractPptx(filePath: string): Promise<PptxRawData> {
  const file = await Bun.file(filePath).arrayBuffer()
  const zip = await JSZip.loadAsync(file)

  // Extract theme XML
  const themeXml = await readXmlFile(zip, 'ppt/theme/theme1.xml')
  if (!themeXml) {
    throw new Error('No theme found in PPTX file (ppt/theme/theme1.xml missing)')
  }

  // Extract presentation XML (for slide dimensions)
  const presentationXml = await readXmlFile(zip, 'ppt/presentation.xml')

  // Extract slide masters
  const slideMasters: any[] = []
  for (const path of Object.keys(zip.files)) {
    if (path.match(/^ppt\/slideMasters\/slideMaster\d+\.xml$/)) {
      const parsed = await readXmlFile(zip, path)
      if (parsed) slideMasters.push(parsed)
    }
  }

  // Extract slide layouts
  const slideLayouts: any[] = []
  for (const path of Object.keys(zip.files)) {
    if (path.match(/^ppt\/slideLayouts\/slideLayout\d+\.xml$/)) {
      const parsed = await readXmlFile(zip, path)
      if (parsed) slideLayouts.push({ ...parsed, _path: path })
    }
  }

  // Extract media files (images for backgrounds)
  const mediaFiles = new Map<string, Uint8Array>()
  for (const [path, entry] of Object.entries(zip.files)) {
    if (path.startsWith('ppt/media/') && !entry.dir) {
      const data = await entry.async('uint8array')
      const filename = path.split('/').pop()!
      mediaFiles.set(filename, data)
    }
  }

  // Extract slide 1 and its relationships (for cover slide analysis)
  const slide1 = await readXmlFile(zip, 'ppt/slides/slide1.xml')
  const slide1Rels = await readXmlFile(zip, 'ppt/slides/_rels/slide1.xml.rels')

  return {
    theme: themeXml,
    slideMasters,
    slideLayouts,
    slide1,
    slide1Rels,
    presentation: presentationXml,
    mediaFiles,
  }
}

async function readXmlFile(zip: JSZip, path: string): Promise<any | null> {
  const file = zip.file(path)
  if (!file) return null
  const xml = await file.async('string')
  return xmlParser.parse(xml)
}
