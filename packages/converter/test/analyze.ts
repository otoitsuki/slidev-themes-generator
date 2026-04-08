import { extractPptx } from '../src/extract'
import { parseThemeData } from '../src/theme-parser'

const files = [
  '../../pptx/BUILD PowerPoint Presentation Template (Dark).pptx',
  '../../pptx/BUILD PowerPoint Presentation Template (Light).pptx',
  '../../pptx/Coloron PowerPoint Template.pptx',
  '../../pptx/Nice - Pitch Deck.pptx',
]

for (const f of files) {
  const raw = await extractPptx(f)
  const name = f.split('/').pop()!.replace('.pptx', '')
  const theme = parseThemeData(raw, name)
  const accents = [theme.colors.accent1, theme.colors.accent2, theme.colors.accent3, theme.colors.accent4, theme.colors.accent5, theme.colors.accent6]
  const unique = new Set(accents.filter(c => c.toUpperCase() !== '#FFFFFF' && c.toUpperCase() !== '#000000')).size

  console.log(name)
  console.log('  heading:', theme.fonts.majorFont, theme.fonts.titleSize + 'pt')
  console.log('  body:', theme.fonts.minorFont, theme.fonts.bodySize + 'pt')
  console.log('  bg:', theme.colors.lt1, '| text:', theme.colors.dk1)
  console.log('  unique accents:', unique, '|', accents.join(', '))
  console.log('  layouts:', theme.layouts.length)
  console.log()
}
