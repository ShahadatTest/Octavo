// Writes e2e/fixtures/: the books the smoke run imports. Run with `npm run fixtures`.
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import sharp from 'sharp'
import { strToU8, zipSync } from 'fflate'
import { ATLAS, HOSTILE, LIGHTHOUSE, RIVERS, makeEpub, makePdf } from './fixture-books'

const out = join(__dirname, '..', 'e2e', 'fixtures')

async function cover(title: string, author: string, bg: string, fg: string): Promise<Uint8Array> {
  const words = title.split(' ')
  const lines: string[] = []
  for (const w of words) {
    const last = lines[lines.length - 1]
    if (last && (last + ' ' + w).length <= 14) lines[lines.length - 1] = `${last} ${w}`
    else lines.push(w)
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="900">
    <rect width="600" height="900" fill="${bg}"/>
    <circle cx="470" cy="190" r="110" fill="${fg}" opacity="0.18"/>
    <rect x="60" y="560" width="480" height="4" fill="${fg}" opacity="0.6"/>
    ${lines.map((l, i) => `<text x="60" y="${300 + i * 78}" font-family="Georgia, serif" font-size="68" font-weight="bold" fill="${fg}">${l}</text>`).join('')}
    <text x="60" y="640" font-family="Georgia, serif" font-size="34" fill="${fg}" opacity="0.85">${author}</text>
  </svg>`
  return new Uint8Array(await sharp(Buffer.from(svg)).png().toBuffer())
}

async function main(): Promise<void> {
  rmSync(out, { recursive: true, force: true })
  mkdirSync(join(out, 'drop'), { recursive: true })

  const lighthouseCover = await cover(LIGHTHOUSE.title, LIGHTHOUSE.author, '#1f3a4d', '#f3e9d2')
  // A pair: the same book as EPUB and PDF, named alike so they share one gallery card.
  writeFileSync(join(out, 'drop', 'the_lighthouse_keeper.epub'), makeEpub(LIGHTHOUSE, lighthouseCover))
  writeFileSync(join(out, 'drop', 'thelighthousekeeper.pdf'), await makePdf(LIGHTHOUSE))
  // An EPUB without a cover image: the gallery draws one. fflate stamps the time into each zip, so
  // the bytes are built once and reused for the duplicate inside the archive below.
  const rivers = makeEpub(RIVERS, null)
  writeFileSync(join(out, 'drop', 'field-notes-on-rivers.epub'), rivers)
  // A book that tries to run scripts and phone home; it is opened by the smoke run, not imported with the rest.
  mkdirSync(join(out, 'hostile'), { recursive: true })
  writeFileSync(join(out, 'hostile', 'suspicious-pamphlet.epub'), makeEpub(HOSTILE, null))
  // A PDF with no file extension, like one book in the Drive library.
  writeFileSync(join(out, 'An Atlas of Small Things, Second Edition'), await makePdf(ATLAS))
  // A Google Drive style download: a zip of a folder. The atlas EPUB pairs with the PDF above by
  // title, the rivers EPUB is a duplicate, and the text file is skipped.
  const atlasCover = await cover(ATLAS.title, ATLAS.author, '#6b3e26', '#fbeee0')
  writeFileSync(
    join(out, 'Books-20261101T020000Z-1-001.zip'),
    zipSync({
      'Books/Atlas/atlas.epub': makeEpub(ATLAS, atlasCover),
      'Books/Rivers/field-notes-on-rivers-copy.epub': rivers,
      'Books/notes.txt': strToU8('not a book')
    })
  )
  console.log(`Fixtures written to ${out}`)
}

void main()
