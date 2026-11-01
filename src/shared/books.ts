import type { Book, FileRecord, GalleryFilter, GallerySort, StateSummary } from './types'

/** Lower case, letters and digits only: `Go_in_Action (2).pdf` and `go-in-action.epub` agree on `goinaction`. */
export const normalizeKey = (s: string): string =>
  s
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '')

const dirOf = (path: string): string => {
  const i = path.lastIndexOf('/')
  return i < 0 ? '' : path.slice(0, i)
}

export const stemOf = (path: string): string => {
  const name = path.slice(path.lastIndexOf('/') + 1)
  return name.replace(/\.(epub|pdf)$/i, '')
}

/**
 * A readable title from a file name, for files whose metadata has none:
 * `Go_in_Action_Second_Edition` → `Go In Action Second Edition`, `The+Deeper+Love+of+Go` → `The Deeper Love Of Go`.
 */
export function titleFromPath(path: string): string {
  const words = stemOf(path)
    .replace(/[+_]+/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/\s+/g, ' ')
    .trim()
  if (!words) return 'Untitled'
  return words.replace(/(^|\s)(\p{Ll})/gu, (_m, space: string, ch: string) => space + ch.toUpperCase())
}

const MIN_TITLE_KEY = 8

/**
 * Groups files into books. Same folder and same normalised name pairs first; then a lone EPUB and a
 * lone PDF with the same normalised title. A book holds at most one file per format.
 */
export function groupBooks(files: FileRecord[]): Book[] {
  const sorted = [...files].sort((a, b) => a.path.localeCompare(b.path))
  const groups: Array<{ epub: FileRecord | null; pdf: FileRecord | null }> = []

  const byName = new Map<string, { epub: FileRecord | null; pdf: FileRecord | null }>()
  for (const file of sorted) {
    const key = `${dirOf(file.path)}\u0000${normalizeKey(stemOf(file.path))}`
    let group = byName.get(key)
    if (!group || group[file.format]) {
      group = { epub: null, pdf: null }
      // A second EPUB with the same name stays its own book; later PDFs pair with the first open slot.
      if (!byName.has(key)) byName.set(key, group)
      groups.push(group)
    }
    group[file.format] = file
  }

  // Title pass: only singles take part, and each title must be unambiguous on both sides.
  const singles = groups.filter((g) => !(g.epub && g.pdf))
  const titleKey = (f: FileRecord | null): string => {
    const title = f?.custom?.title || f?.meta?.title
    return title ? normalizeKey(title) : ''
  }
  const epubByTitle = new Map<string, Array<(typeof groups)[number]>>()
  const pdfByTitle = new Map<string, Array<(typeof groups)[number]>>()
  for (const g of singles) {
    const key = titleKey(g.epub ?? g.pdf)
    if (key.length < MIN_TITLE_KEY) continue
    const map = g.epub ? epubByTitle : pdfByTitle
    map.set(key, [...(map.get(key) ?? []), g])
  }
  const merged = new Set<(typeof groups)[number]>()
  for (const [key, epubs] of epubByTitle) {
    const pdfs = pdfByTitle.get(key)
    if (epubs.length !== 1 || pdfs?.length !== 1) continue
    epubs[0].pdf = pdfs[0].pdf
    merged.add(pdfs[0])
  }

  return groups.filter((g) => !merged.has(g)).map(toBook)
}

function toBook(g: { epub: FileRecord | null; pdf: FileRecord | null }): Book {
  const first = (g.epub ?? g.pdf)!
  // Details the reader edited win; then the EPUB's metadata, then the PDF's, then the file name.
  const custom = g.epub?.custom ?? g.pdf?.custom
  const title = custom?.title || g.epub?.meta?.title || g.pdf?.meta?.title || titleFromPath(first.path)
  const authors = custom
    ? custom.authors
    : g.epub?.meta?.authors.length
      ? g.epub.meta.authors
      : (g.pdf?.meta?.authors ?? [])
  const coverFile = [g.epub, g.pdf].find((f) => f?.hasCover) ?? null
  const added = [g.epub?.addedAt, g.pdf?.addedAt].filter(Boolean).sort()[0] ?? first.addedAt
  return { id: first.id, title, authors, epub: g.epub, pdf: g.pdf, coverFileId: coverFile?.id ?? null, addedAt: added }
}

export const bookFiles = (book: Book): FileRecord[] => [book.epub, book.pdf].filter((f): f is FileRecord => !!f)

/** The file of a book read most recently, for the progress bar and for "open". */
export function activeFile(book: Book, states: Record<string, StateSummary>): FileRecord {
  const files = bookFiles(book)
  let best = files[0]
  for (const f of files) {
    const a = states[f.id]?.lastOpenedAt ?? ''
    const b = states[best.id]?.lastOpenedAt ?? ''
    if (a > b) best = f
  }
  return best
}

export interface BookProgress {
  fraction: number
  lastOpenedAt: string | null
  finished: boolean
  highlights: number
  bookmarks: number
}

export function bookProgress(book: Book, states: Record<string, StateSummary>): BookProgress {
  const active = states[activeFile(book, states).id]
  const all = bookFiles(book).map((f) => states[f.id])
  return {
    fraction: active?.fraction ?? 0,
    lastOpenedAt: all.map((s) => s?.lastOpenedAt ?? '').sort().pop() || null,
    finished: all.some((s) => !!s?.finishedAt),
    highlights: all.reduce((n, s) => n + (s?.highlights ?? 0), 0),
    bookmarks: all.reduce((n, s) => n + (s?.bookmarks ?? 0), 0)
  }
}

export function matchesFilter(p: BookProgress, filter: GalleryFilter): boolean {
  switch (filter) {
    case 'reading':
      return !p.finished && !!p.lastOpenedAt
    case 'unread':
      return !p.lastOpenedAt
    case 'finished':
      return p.finished
    default:
      return true
  }
}

export function matchesQuery(book: Book, query: string): boolean {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean)
  if (terms.length === 0) return true
  const hay = [book.title, ...book.authors, ...bookFiles(book).map((f) => f.path)].join(' ').toLowerCase()
  return terms.every((t) => hay.includes(t))
}

const surname = (author: string | undefined): string => (author ?? '').trim().split(/\s+/).pop() ?? ''
const sortTitle = (title: string): string => title.replace(/^(the|a|an)\s+/i, '').toLowerCase()

export function sortBooks(books: Book[], sort: GallerySort, states: Record<string, StateSummary>): Book[] {
  const progress = new Map(books.map((b) => [b.id, bookProgress(b, states)]))
  const byTitle = (a: Book, b: Book): number => sortTitle(a.title).localeCompare(sortTitle(b.title))
  const cmp: Record<GallerySort, (a: Book, b: Book) => number> = {
    recent: (a, b) =>
      (progress.get(b.id)?.lastOpenedAt ?? '').localeCompare(progress.get(a.id)?.lastOpenedAt ?? '') ||
      b.addedAt.localeCompare(a.addedAt) ||
      byTitle(a, b),
    added: (a, b) => b.addedAt.localeCompare(a.addedAt) || byTitle(a, b),
    title: byTitle,
    author: (a, b) => surname(a.authors[0]).localeCompare(surname(b.authors[0])) || byTitle(a, b)
  }
  return [...books].sort(cmp[sort])
}

/**
 * Tidies a title from book metadata: drops a bracketed ISBN or ID in front
 * (`[9780262270830] Introduction to Algorithms`) and collapses stray spacing.
 */
export function cleanTitle(title: string): string {
  return title
    .replace(/^\s*[[(]\s*(?:ISBN[:\s]*)?[\dXx-]{10,17}\s*[\])]\s*[-:–]?\s*/, '')
    .replace(/\s*[[(]\s*ISBN[:\s]*[\dXx-]{10,17}\s*[\])]\s*$/i, '')
    .replace(/\s+/g, ' ')
    .trim()
}

const NAME_SUFFIX = /^(inc|ltd|llc|co|corp|jr|sr|ii|iii|iv|phd|md)\.?$/i
const wordCount = (s: string): number => s.trim().split(/\s+/).length

/**
 * Tidies author names from book metadata:
 *   "Thomas H. Cormen ... [et Al.]."            → Thomas H. Cormen
 *   "Deitel, Paul & Deitel, Harvey"             → Paul Deitel, Harvey Deitel
 *   "Chad Sanderson, Mark Freeman, and B. Smith" → three authors
 * A comma list is split only when every part is a full name, and "Surname, Given" is turned round
 * only when the surname is one word, so "Peter Bruce, Andrew Bruce" and "O'Reilly Media, Inc."
 * keep their meaning.
 */
export function cleanAuthors(authors: string[]): string[] {
  const out: string[] = []
  const add = (name: string): void => {
    const n = name
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/[,;]+$/, '')
      // A stray full stop after a surname goes; "Inc.", "Ltd." and initials keep theirs.
      .replace(/(\p{Ll}{4,})\.$/u, '$1')
    if (n && !out.includes(n)) out.push(n)
  }
  for (const raw of authors) {
    const text = raw
      .replace(/\s*(?:\.{3}|…)?\s*\[?\bet\.?\s+al\b\.?\]?\.?\s*$/i, '')
      .replace(/\s*(?:\.{3}|…)\s*$/, '')
      .trim()
    for (const chunk of text.split(/\s*;\s*|\s+&\s+|,?\s+and\s+/i)) {
      const parts = chunk.split(/\s*,\s*/).filter(Boolean)
      if (parts.length === 2 && wordCount(parts[0]) === 1 && !NAME_SUFFIX.test(parts[1])) add(`${parts[1]} ${parts[0]}`)
      else if (parts.length > 1 && parts.every((p) => wordCount(p) >= 2)) parts.forEach(add)
      else add(chunk)
    }
  }
  return out
}

/** PDF titles are often a file name or a word processor's placeholder; those are worse than nothing. */
export function plausibleTitle(title: string | undefined): string {
  const t = (title ?? '').trim()
  if (t.length < 3) return ''
  if (/\.(pdf|docx?|indd|tex|dvi|pptx?|qxd|ps)$/i.test(t)) return ''
  if (/^(untitled|microsoft word|title|document|book|unknown|output|print)\b/i.test(t)) return ''
  if (/^[\w-]+$/.test(t) && !/\s/.test(t) && t.length > 20) return '' // looks like a slug
  return t
}
