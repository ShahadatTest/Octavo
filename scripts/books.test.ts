import { test } from 'node:test'
import assert from 'node:assert/strict'
import { bookProgress, groupBooks, matchesQuery, normalizeKey, sortBooks, titleFromPath } from '../src/shared/books'
import type { FileRecord, StateSummary } from '../src/shared/types'

let n = 0
function file(path: string, meta: Partial<FileRecord['meta']> | null = null, extra: Partial<FileRecord> = {}): FileRecord {
  n++
  return {
    id: String(n).padStart(20, '0'),
    path,
    format: path.toLowerCase().endsWith('.pdf') ? 'pdf' : 'epub',
    size: 100,
    mtimeMs: 0,
    addedAt: `2026-10-${String(n).padStart(2, '0')}T00:00:00.000Z`,
    meta: meta ? { title: '', authors: [], ...meta } : null,
    hasCover: false,
    ...extra
  }
}

test('normalizeKey drops case, punctuation and spacing', () => {
  assert.equal(normalizeKey('Go_in_Action (Second-Edition)'), 'goinactionsecondedition')
  assert.equal(normalizeKey('The+Deeper+Love+of+Go'), 'thedeeperloveofgo')
})

test('titleFromPath makes something readable from a file name', () => {
  assert.equal(titleFromPath('Books/Go_in_Action_Second_Edition.epub'), 'Go In Action Second Edition')
  assert.equal(titleFromPath('The+Deeper+Love+of+Go.pdf'), 'The Deeper Love Of Go')
  assert.equal(titleFromPath('.epub'), 'Untitled')
})

test('an EPUB and a PDF with the same name in the same folder are one book', () => {
  const books = groupBooks([file('Books/datacontracts.epub'), file('Books/datacontracts.pdf'), file('Books/sicp.pdf')])
  assert.equal(books.length, 2)
  const pair = books.find((b) => b.epub && b.pdf)
  assert.ok(pair)
  assert.equal(pair.epub!.path, 'Books/datacontracts.epub')
  assert.equal(pair.pdf!.path, 'Books/datacontracts.pdf')
  assert.equal(pair.id, pair.epub!.id)
})

test('the same name in different folders does not pair by name', () => {
  const books = groupBooks([file('A/book.epub'), file('B/book.pdf')])
  assert.equal(books.length, 2)
})

test('two EPUBs with the same name stay separate books', () => {
  const books = groupBooks([file('A/Data-Contracts.epub'), file('A/data_contracts.epub'), file('A/datacontracts.pdf')])
  assert.equal(books.length, 2)
  assert.equal(books.filter((b) => b.pdf).length, 1)
})

test('lone files pair by title when the title is unambiguous', () => {
  const books = groupBooks([
    file('Books/Atlas/atlas.epub', { title: 'An Atlas of Small Things' }),
    file('An Atlas of Small Things, Second Edition.pdf', { title: 'An atlas of small things' })
  ])
  assert.equal(books.length, 1)
  assert.ok(books[0].epub && books[0].pdf)
})

test('title pairing is skipped for short or ambiguous titles', () => {
  const short = groupBooks([file('x.epub', { title: 'Go' }), file('y.pdf', { title: 'Go' })])
  assert.equal(short.length, 2)
  const ambiguous = groupBooks([
    file('a.epub', { title: 'Python Data Science Handbook' }),
    file('b.epub', { title: 'Python Data Science Handbook' }),
    file('c.pdf', { title: 'Python Data Science Handbook' })
  ])
  assert.equal(ambiguous.length, 3)
})

test('the EPUB supplies title, authors and cover; the PDF fills gaps', () => {
  const [book] = groupBooks([
    file('b/x.epub', { title: 'Data Contracts', authors: [] }, { hasCover: false }),
    file('b/x.pdf', { title: 'data contracts (pdf)', authors: ['Andrew Jones'] }, { hasCover: true })
  ])
  assert.equal(book.title, 'Data Contracts')
  assert.deepEqual(book.authors, ['Andrew Jones'])
  assert.equal(book.coverFileId, book.pdf!.id)
})

test('a file without metadata is titled from its name', () => {
  const [book] = groupBooks([file('Books/fundamentalsofdataengineering.epub')])
  assert.equal(book.title, 'Fundamentalsofdataengineering')
})

test('progress follows the most recently opened format', () => {
  const [book] = groupBooks([file('b/y.epub'), file('b/y.pdf')])
  const states: Record<string, StateSummary> = {
    [book.epub!.id]: { fraction: 0.2, lastOpenedAt: '2026-10-01T00:00:00Z', finishedAt: null, highlights: 3, bookmarks: 1 },
    [book.pdf!.id]: { fraction: 0.7, lastOpenedAt: '2026-10-05T00:00:00Z', finishedAt: null, highlights: 2, bookmarks: 0 }
  }
  const p = bookProgress(book, states)
  assert.equal(p.fraction, 0.7)
  assert.equal(p.highlights, 5)
  assert.equal(p.lastOpenedAt, '2026-10-05T00:00:00Z')
})

test('search matches every term against title, authors and path', () => {
  const [book] = groupBooks([file('Books/x.epub', { title: 'Fundamentals of Data Engineering', authors: ['Joe Reis'] })])
  assert.ok(matchesQuery(book, 'data reis'))
  assert.ok(matchesQuery(book, 'books/x'))
  assert.ok(!matchesQuery(book, 'data rust'))
})

test('sorting by title ignores a leading article; by author uses the surname', () => {
  const books = groupBooks([
    file('1.epub', { title: 'The Zebra Book', authors: ['Ann Abbot'] }),
    file('2.epub', { title: 'Apples', authors: ['Zed Young'] }),
    file('3.epub', { title: 'A Middle Book', authors: ['Bo Moore'] })
  ])
  assert.deepEqual(
    sortBooks(books, 'title', {}).map((b) => b.title),
    ['Apples', 'A Middle Book', 'The Zebra Book']
  )
  assert.deepEqual(
    sortBooks(books, 'author', {}).map((b) => b.authors[0]),
    ['Ann Abbot', 'Bo Moore', 'Zed Young']
  )
})
