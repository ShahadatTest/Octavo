// Builds small but real EPUB and PDF files for tests and the smoke run. Everything is generated,
// so the repository carries no third-party books.
import { strToU8, zipSync, type Zippable } from 'fflate'
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'

export interface FixtureBook {
  title: string
  author: string
  chapters: Array<{ title: string; paragraphs: string[]; rawHtml?: string }>
  /** Extra markup for every chapter's <head>. */
  head?: string
}

const SENTENCES = [
  'The light turned once every eleven seconds, and in the years she kept it she never once lost count.',
  'Fog came in from the east on the morning tide and sat on the water like wet wool.',
  'Every logbook entry began the same way: the hour, the wind, the state of the sea, and the ships that passed.',
  'She learned to read the weather from the colour of the gulls against the cliff.',
  'There is a particular silence after a storm, when the rain stops and the sea has not yet noticed.',
  'The keeper before her had left a shelf of books, most of them about rivers, which seemed a strange choice for a man who lived on a rock.',
  'Supplies came by boat on the first Tuesday of each month, weather permitting, which it often did not.',
  'At night the lamp room hummed, and the brass fittings ticked as they cooled after the noon polish.',
  'A good map tells you where the water is deep; a better one tells you where it used to be.',
  'She kept a second, private log in which she wrote down only the things that surprised her.',
  'The tide tables were printed a year in advance, and she trusted them more than any almanac.',
  'Small things collect at the edges of the world: shells, rope ends, glass worn smooth as soap.'
]

/** Deterministic prose: each chapter walks the sentence list from a different offset. */
export function prose(chapter: number, paragraphs: number): string[] {
  const out: string[] = []
  for (let p = 0; p < paragraphs; p++) {
    const sentences: string[] = []
    for (let s = 0; s < 5; s++) sentences.push(SENTENCES[(chapter * 7 + p * 3 + s) % SENTENCES.length])
    out.push(sentences.join(' '))
  }
  return out
}

export const LIGHTHOUSE: FixtureBook = {
  title: 'The Lighthouse Keeper',
  author: 'Mara Ellison',
  chapters: [
    { title: 'Chapter 1. The Rock', paragraphs: prose(1, 14) },
    { title: 'Chapter 2. Logbooks', paragraphs: prose(2, 14) },
    { title: 'Chapter 3. Weather', paragraphs: prose(3, 14) },
    { title: 'Chapter 4. The Last Tuesday', paragraphs: prose(4, 14) }
  ]
}

export const RIVERS: FixtureBook = {
  title: 'Field Notes on Rivers',
  author: 'Tomas Reyes',
  chapters: [
    { title: 'Headwaters', paragraphs: prose(5, 8) },
    { title: 'Meanders', paragraphs: prose(6, 8) },
    { title: 'The Delta', paragraphs: prose(7, 8) }
  ]
}

export const ATLAS: FixtureBook = {
  title: 'An Atlas of Small Things',
  author: 'June Okafor',
  chapters: [
    { title: 'Shells', paragraphs: prose(8, 6) },
    { title: 'Rope Ends', paragraphs: prose(9, 6) }
  ]
}

/**
 * A book that misbehaves: an inline script, an event-handler attribute, and remote image, stylesheet
 * and script loads. Opening it must run none of them and reach no server.
 */
export const TRAP_PORT = 47123
const TRAP = `http://127.0.0.1:${TRAP_PORT}`

export const HOSTILE: FixtureBook = {
  title: 'A Suspicious Pamphlet',
  author: 'Anonymous',
  head:
    `<link rel="stylesheet" href="${TRAP}/style.css"/>` +
    `<script src="${TRAP}/payload.js"></script>` +
    '<script>//<![CDATA[\ntry { parent.document.title = "PWNED"; } catch (e) {}\ndocument.documentElement.setAttribute("data-pwned", "script");\n//]]></script>',
  chapters: [
    {
      title: 'Read Me',
      rawHtml:
        `<p><img src="${TRAP}/pixel.png" alt="" onerror="document.documentElement.setAttribute('data-pwned', 'onerror')"/></p>\n`,
      paragraphs: prose(10, 6)
    }
  ]
}

const esc = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

const xhtml = (title: string, body: string, head = ''): string => `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" lang="en" xml:lang="en">
<head><meta charset="UTF-8"/><title>${esc(title)}</title><link rel="stylesheet" href="style.css"/>${head}</head>
<body>
${body}
</body>
</html>
`

/** An EPUB 3 package: nav document, one XHTML file per chapter, and an optional cover image. */
export function makeEpub(book: FixtureBook, cover: Uint8Array | null): Uint8Array {
  const chapters = book.chapters.map((ch, i) => ({
    id: `ch${i + 1}`,
    href: `ch${i + 1}.xhtml`,
    body: `<section epub:type="chapter"><h1>${esc(ch.title)}</h1>\n${ch.rawHtml ?? ''}${ch.paragraphs.map((p) => `<p>${esc(p)}</p>`).join('\n')}\n</section>`,
    title: ch.title
  }))
  const nav = xhtml(
    'Contents',
    `<nav epub:type="toc" id="toc"><h1>Contents</h1><ol>${chapters
      .map((c) => `<li><a href="${c.href}">${esc(c.title)}</a></li>`)
      .join('')}</ol></nav>`
  )
  const opf = `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="uid" xml:lang="en">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="uid">urn:octavo:fixture:${esc(book.title.toLowerCase().replace(/\W+/g, '-'))}</dc:identifier>
    <dc:title>${esc(book.title)}</dc:title>
    <dc:creator>${esc(book.author)}</dc:creator>
    <dc:language>en</dc:language>
    <dc:publisher>Octavo Fixtures</dc:publisher>
    <dc:date>2026-01-15</dc:date>
    <meta property="dcterms:modified">2026-01-15T00:00:00Z</meta>
  </metadata>
  <manifest>
    <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
    <item id="css" href="style.css" media-type="text/css"/>
    ${cover ? '<item id="cover" href="cover.png" media-type="image/png" properties="cover-image"/>' : ''}
    ${chapters.map((c) => `<item id="${c.id}" href="${c.href}" media-type="application/xhtml+xml"/>`).join('\n    ')}
  </manifest>
  <spine>
    ${chapters.map((c) => `<itemref idref="${c.id}"/>`).join('\n    ')}
  </spine>
</package>
`
  const files: Zippable = {
    mimetype: [strToU8('application/epub+zip'), { level: 0 }],
    'META-INF/container.xml': strToU8(`<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles>
</container>
`),
    'OEBPS/content.opf': strToU8(opf),
    'OEBPS/nav.xhtml': strToU8(nav),
    'OEBPS/style.css': strToU8('body { font-family: serif; } h1 { font-size: 1.6em; margin: 1em 0 0.8em; } p { text-indent: 1.2em; margin: 0; }\n')
  }
  if (cover) files['OEBPS/cover.png'] = cover
  for (const c of chapters) files[`OEBPS/${c.href}`] = strToU8(xhtml(c.title, c.body, book.head))
  return zipSync(files)
}

/** A text PDF at 6 x 9 in: a title page, then the chapters, wrapped to the page. */
export async function makePdf(book: FixtureBook): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  doc.setTitle(book.title)
  doc.setAuthor(book.author)
  doc.setCreationDate(new Date('2026-01-15T00:00:00Z'))
  doc.setModificationDate(new Date('2026-01-15T00:00:00Z'))
  const serif = await doc.embedFont(StandardFonts.TimesRoman)
  const bold = await doc.embedFont(StandardFonts.TimesRomanBold)
  const W = 432
  const H = 648
  const M = 54

  const titlePage = doc.addPage([W, H])
  titlePage.drawRectangle({ x: 0, y: 0, width: W, height: H, color: rgb(0.13, 0.22, 0.3) })
  titlePage.drawText(book.title, { x: M, y: H - 220, size: 26, font: bold, color: rgb(1, 1, 1), maxWidth: W - 2 * M, lineHeight: 32 })
  titlePage.drawText(book.author, { x: M, y: H - 300, size: 14, font: serif, color: rgb(0.85, 0.88, 0.9) })

  const wrap = (text: string, size: number, width: number): string[] => {
    const lines: string[] = []
    let line = ''
    for (const word of text.split(/\s+/)) {
      const next = line ? `${line} ${word}` : word
      if (serif.widthOfTextAtSize(next, size) > width && line) {
        lines.push(line)
        line = word
      } else line = next
    }
    if (line) lines.push(line)
    return lines
  }

  for (const ch of book.chapters) {
    let page = doc.addPage([W, H])
    let y = H - M - 20
    page.drawText(ch.title, { x: M, y, size: 18, font: bold })
    y -= 36
    for (const para of ch.paragraphs) {
      for (const line of wrap(para, 11, W - 2 * M)) {
        if (y < M) {
          page = doc.addPage([W, H])
          y = H - M
        }
        page.drawText(line, { x: M, y, size: 11, font: serif })
        y -= 15
      }
      y -= 8
    }
  }
  return doc.save()
}
