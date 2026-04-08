import JSZip from 'jszip'

const files = [
  '../../pptx/Coloron PowerPoint Template.pptx',
  '../../pptx/Nice - Pitch Deck.pptx',
  '../../pptx/BUILD PowerPoint Presentation Template (Dark).pptx',
]

for (const f of files) {
  const data = await Bun.file(f).arrayBuffer()
  const zip = await JSZip.loadAsync(data)
  const name = f.split('/').pop()!.replace('.pptx', '')
  console.log(`\n=== ${name} ===`)

  // Find slide1.xml and its relationships
  const slide1 = await zip.file('ppt/slides/slide1.xml')?.async('string')
  const slide1Rels = await zip.file('ppt/slides/_rels/slide1.xml.rels')?.async('string')

  if (slide1Rels) {
    // Find image relationships
    const imageRels = [...slide1Rels.matchAll(/Target="([^"]*\.(png|jpg|jpeg|svg|gif|emf|wmf))"/gi)]
    console.log('  Images in slide 1:', imageRels.length)
    imageRels.forEach(m => console.log('    ', m[1]))
  }

  if (slide1) {
    // Count shapes
    const shapes = (slide1.match(/<p:sp>/g) || []).length
    const pics = (slide1.match(/<p:pic>/g) || []).length
    const groups = (slide1.match(/<p:grpSp>/g) || []).length
    console.log(`  Shapes: ${shapes} | Pictures: ${pics} | Groups: ${groups}`)

    // Check for background
    const hasBg = slide1.includes('<p:bg>')
    console.log(`  Has custom bg: ${hasBg}`)

    // Print first 500 chars of slide structure
    const clean = slide1.substring(0, 800)
    console.log(`  Preview: ${clean.substring(0, 400)}...`)
  }
}
