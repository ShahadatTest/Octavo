import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, promises as fs, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { strToU8, zipSync } from 'fflate'
import { Library, normalizeState } from '../src/main/library'
import { safeRelative, sniffFormat } from '../src/main/fsutil'
import { INDEX_VERSION } from '../src/shared/types'
import { PAGE_INDEX_VERSION } from '../src/shared/pages'

const PDF = (tag: string): Uint8Array => strToU8(`%PDF-1.7\n% ${tag}\n%%EOF\n`)
const EPUB = (tag: string): Uint8Array =>
  zipSync({ mimetype: [strToU8('application/epub+zip'), { level: 0 }], 'OEBPS/x.xhtml': strToU8(tag) })

function sandbox(): { src: string; lib: string } {
  const base = mkdtempSync(join(tmpdir(), 'octavo-test-'))
  return { src: join(base, 'src'), lib: join(base, 'lib') }
}

test('sniffFormat reads bytes, not names', async () => {
  const { src } = sandbox()
  await fs.mkdir(src, { recursive: true })
  writeFileSync(join(src, 'Discrete Mathematics, Eighth Edition'), PDF('a'))
  writeFileSync(join(src, 'no-extension-epub'), EPUB('a'))
  writeFileSync(join(src, 'fake.pdf'), strToU8('hello'))
  writeFileSync(join(src, 'notes.txt'), PDF('b'))
  assert.equal(await sniffFormat(join(src, 'Discrete Mathematics, Eighth Edition')), 'pdf')
  assert.equal(await sniffFormat(join(src, 'no-extension-epub')), 'epub')
  assert.equal(await sniffFormat(join(src, 'fake.pdf')), null)
  assert.equal(await sniffFormat(join(src, 'notes.txt')), null)
})

test('safeRelative refuses to climb out of the destination', () => {
  assert.equal(safeRelative('Books/a.epub'), 'Books/a.epub')
  assert.equal(safeRelative('/Books//./a.epub'), 'Books/a.epub')
  assert.equal(safeRelative('Books/../../etc/passwd'), null)
  assert.equal(safeRelative('a:b?.pdf'), 'a_b_.pdf')
})

test('import copies books, adds missing extensions and skips duplicates', async () => {
  const { src, lib } = sandbox()
  await fs.mkdir(join(src, 'folder', 'sub'), { recursive: true })
  writeFileSync(join(src, 'one.epub'), EPUB('one'))
  writeFileSync(join(src, 'Rosen Discrete Math'), PDF('rosen'))
  writeFileSync(join(src, 'RosenDiscreteMath8Ed.pdf'), PDF('rosen'))
  writeFileSync(join(src, 'folder', 'sub', 'two.pdf'), PDF('two'))
  writeFileSync(join(src, 'folder', 'readme.txt'), strToU8('x'))

  const library = new Library(lib)
  await library.init()
  const result = await library.importPaths([
    join(src, 'one.epub'),
    join(src, 'Rosen Discrete Math'),
    join(src, 'RosenDiscreteMath8Ed.pdf'),
    join(src, 'folder')
  ])
  assert.deepEqual(result, { added: 3, duplicates: 1, skipped: 1, errors: [] })
  const paths = library.list().map((f) => f.path).sort()
  assert.deepEqual(paths, ['Rosen Discrete Math.pdf', 'folder/sub/two.pdf', 'one.epub'])

  const again = await library.importPaths([join(src, 'one.epub')])
  assert.equal(again.duplicates, 1)
  assert.equal(library.list().length, 3)
})

test('zip archives are unpacked with their folders; non-books are skipped', async () => {
  const { src, lib } = sandbox()
  await fs.mkdir(src, { recursive: true })
  const zip = join(src, 'Books-20261101T020000Z-1-001.zip')
  writeFileSync(
    zip,
    zipSync({
      'Books/Go/go.epub': EPUB('go'),
      'Books/sicp.pdf': PDF('sicp'),
      'Books/cover.jpg': strToU8('jpg'),
      '../escape.pdf': PDF('escape')
    })
  )
  const library = new Library(lib)
  await library.init()
  const result = await library.importPaths([zip])
  assert.equal(result.added, 2)
  assert.equal(result.skipped, 1)
  assert.deepEqual(library.list().map((f) => f.path).sort(), ['Books/Go/go.epub', 'Books/sicp.pdf'])
  await assert.rejects(fs.access(join(lib, '..', 'escape.pdf')))
})

test('a rescan follows renamed files and keeps their ids', async () => {
  const { lib } = sandbox()
  await fs.mkdir(lib, { recursive: true })
  writeFileSync(join(lib, 'a.pdf'), PDF('a'))
  const library = new Library(lib)
  await library.init()
  const [before] = library.list()
  await library.saveIndex({ fileId: before.id, meta: { title: 'A', authors: ['X'] }, cover: new Uint8Array([1, 2, 3]) })
  await fs.mkdir(join(lib, 'moved'))
  await fs.rename(join(lib, 'a.pdf'), join(lib, 'moved', 'renamed.pdf'))
  await library.scan()
  const [after] = library.list()
  assert.equal(after.id, before.id)
  assert.equal(after.path, 'moved/renamed.pdf')
  assert.equal(after.meta?.title, 'A')
  assert.ok(after.hasCover)

  // The catalog survives a restart.
  const reopened = new Library(lib)
  await reopened.init()
  assert.equal(reopened.get(before.id)?.path, 'moved/renamed.pdf')
})

test('deleted files leave the catalog but keep their annotations', async () => {
  const { lib } = sandbox()
  await fs.mkdir(lib, { recursive: true })
  writeFileSync(join(lib, 'a.pdf'), PDF('a'))
  const library = new Library(lib)
  await library.init()
  const [rec] = library.list()
  const state = await library.getState(rec.id)
  state.highlights.push({
    id: 'h1',
    at: { page: 1, rects: [[0, 0, 10, 10]] },
    fraction: 0,
    label: '',
    text: 'x',
    note: '',
    color: 'yellow',
    createdAt: '',
    updatedAt: ''
  })
  await library.saveState(state)
  assert.equal(library.snapshot().states[rec.id].highlights, 1)

  await library.removeFiles([rec.id])
  assert.equal(library.list().length, 0)
  await fs.access(join(lib, '.octavo', 'annotations', `${rec.id}.json`))

  writeFileSync(join(lib, 'back.pdf'), PDF('a'))
  await library.scan()
  assert.equal((await library.getState(rec.id)).highlights.length, 1)
})

test('normalizeState repairs partial files', () => {
  const s = normalizeState({ bookmarks: [null as never, { id: 'b', at: { page: 2 } } as never] }, 'f'.repeat(20))
  assert.equal(s.version, 1)
  assert.equal(s.bookmarks.length, 1)
  assert.deepEqual(s.highlights, [])
  assert.equal(s.position, null)
})

test('edited details are stored on every file of a book and survive re-indexing', async () => {
  const { lib } = sandbox()
  await fs.mkdir(lib, { recursive: true })
  writeFileSync(join(lib, 'b.pdf'), PDF('b'))
  writeFileSync(join(lib, 'b.epub'), EPUB('b'))
  const library = new Library(lib)
  await library.init()
  const ids = library.list().map((f) => f.id)
  await library.setDetails(ids, { title: '  Computer   Systems ', authors: ['Randal E. Bryant', ' ', 'David R. O’Hallaron'] })
  for (const f of library.list()) {
    assert.deepEqual(f.custom, { title: 'Computer Systems', authors: ['Randal E. Bryant', 'David R. O’Hallaron'] })
  }
  await library.saveIndex({ fileId: ids[0], meta: { title: 'CSAPP 2016', authors: [] }, cover: null })
  assert.equal(library.get(ids[0])?.custom?.title, 'Computer Systems')
  assert.equal(library.get(ids[0])?.indexVersion, INDEX_VERSION)
  await library.setDetails(ids, null)
  assert.ok(library.list().every((f) => !f.custom))
})

test('a PDF page index is stored, validated, and dropped with the file', async () => {
  const { lib } = sandbox()
  await fs.mkdir(lib, { recursive: true })
  writeFileSync(join(lib, 'p.pdf'), PDF('p'))
  writeFileSync(join(lib, 'e.epub'), EPUB('e'))
  const library = new Library(lib)
  await library.init()
  const pdf = library.list().find((f) => f.format === 'pdf')!
  const epub = library.list().find((f) => f.format === 'epub')!
  const index = { version: PAGE_INDEX_VERSION, labels: ['i', '1'], pages: ['preface', 'chapterone'] }
  await library.savePageIndex(pdf.id, index)
  assert.deepEqual(await library.getPageIndex(pdf.id), index)
  assert.equal(library.get(pdf.id)?.pageIndexVersion, PAGE_INDEX_VERSION)
  await library.savePageIndex(epub.id, index)
  assert.equal(await library.getPageIndex(epub.id), null, 'only PDFs have page indexes')
  await library.savePageIndex(pdf.id, { version: PAGE_INDEX_VERSION, labels: ['1'], pages: ['a', 'b'] } as never)
  assert.deepEqual(await library.getPageIndex(pdf.id), index, 'a malformed index is refused')
  await library.removeFiles([pdf.id])
  await assert.rejects(fs.access(join(lib, '.octavo', 'pages', `${pdf.id}.json`)))
})
