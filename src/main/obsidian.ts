import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import { groupBooks } from '../shared/books'
import { isOctavoNote, noteFileName, renderNote, type NoteSection } from '../shared/export'
import type { ExportResult, Settings } from '../shared/types'
import { safeRelative, writeAtomic } from './fsutil'
import type { Library } from './library'

const today = (): string => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/**
 * Writes one book's highlights to `<vault>/<folder>/<Title>.md`. An existing note is replaced only
 * when Octavo wrote it; a hand-made note of the same name gets `<Title> (Octavo).md` beside it.
 */
export async function exportToObsidian(
  library: Library,
  fileIds: string[],
  target: Settings['obsidian']
): Promise<ExportResult> {
  if (!target.vault) throw new Error('Choose your Obsidian vault in Settings first.')
  await fs.access(target.vault).catch(() => {
    throw new Error(`The vault folder ${target.vault} does not exist.`)
  })
  const files = fileIds.map((id) => library.get(id)).filter((f) => !!f)
  const book = groupBooks(files)[0]
  if (!book) throw new Error('That book is no longer in the library.')

  const sections: NoteSection[] = []
  for (const file of [book.epub, book.pdf]) {
    if (!file) continue
    const state = await library.getState(file.id)
    sections.push({ format: file.format, highlights: state.highlights })
  }
  const markdown = renderNote({ title: book.title, authors: book.authors, sections, date: today() })

  const folder = safeRelative(target.folder) ?? ''
  const dir = join(target.vault, ...folder.split('/').filter(Boolean))
  const name = noteFileName(book.title)
  let path = join(dir, name)
  const existing = await fs.readFile(path, 'utf8').catch(() => null)
  if (existing !== null && !isOctavoNote(existing)) path = join(dir, name.replace(/\.md$/, ' (Octavo).md'))
  await writeAtomic(path, markdown)
  return { path, highlights: sections.reduce((n, s) => n + s.highlights.length, 0) }
}
