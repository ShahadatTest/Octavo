import type { BookFormat, Highlight, Locator } from './types'

export interface NoteSection {
  format: BookFormat
  highlights: Highlight[]
}

export interface NoteInput {
  title: string
  authors: string[]
  sections: NoteSection[]
  /** YYYY-MM-DD */
  date: string
}

const yamlString = (s: string): string => JSON.stringify(s)

/** Characters Windows, macOS and Obsidian links all accept. */
export function noteFileName(title: string): string {
  const clean = title
    .replace(/[\\/:*?"<>|#^[\]]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120)
    .replace(/[. ]+$/, '')
  return `${clean || 'Untitled'}.md`
}

/** True when a note was written by Octavo and may be overwritten. */
export function isOctavoNote(content: string): boolean {
  const fm = /^---\r?\n([\s\S]*?)\r?\n---/.exec(content)
  return !!fm && /^source:\s*octavo\s*$/m.test(fm[1])
}

const pageOf = (at: Locator): number | null => ('page' in at ? at.page : null)

function quote(text: string): string {
  return text
    .trim()
    .split(/\r?\n+/)
    .map((line) => `> ${line.trim()}`)
    .join('\n>\n')
}

function where(h: Highlight): string {
  const page = pageOf(h.at)
  return page !== null ? `p. ${page}` : `${Math.round(h.fraction * 100)}%`
}

function renderHighlights(highlights: Highlight[], headingLevel: number): string[] {
  const out: string[] = []
  const ordered = [...highlights].sort((a, b) => a.fraction - b.fraction)
  let chapter: string | null = null
  const hashes = '#'.repeat(headingLevel)
  for (const h of ordered) {
    // PDFs without an outline have no chapter names; their highlights simply follow one another.
    const label = h.label.trim()
    if (label && label !== chapter) {
      out.push(`${hashes} ${label}`, '')
      chapter = label
    }
    out.push(quote(h.text), '')
    if (h.note.trim()) out.push(h.note.trim(), '')
    out.push(`*${where(h)}*`, '')
  }
  return out
}

/** Markdown for an Obsidian note holding a book's highlights, grouped by chapter in reading order. */
export function renderNote(input: NoteInput): string {
  const sections = input.sections.filter((s) => s.highlights.length > 0)
  const count = sections.reduce((n, s) => n + s.highlights.length, 0)
  const lines = [
    '---',
    `title: ${yamlString(input.title)}`,
    ...(input.authors.length ? [`author: ${yamlString(input.authors.join(', '))}`] : []),
    'source: octavo',
    `highlights: ${count}`,
    `exported: ${input.date}`,
    '---',
    '',
    `# ${input.title}`,
    ''
  ]
  if (input.authors.length) lines.push(`*${input.authors.join(', ')}*`, '')
  if (count === 0) {
    lines.push('No highlights yet.', '')
  } else if (sections.length === 1) {
    lines.push(...renderHighlights(sections[0].highlights, 2))
  } else {
    for (const s of sections) {
      lines.push(`## From the ${s.format.toUpperCase()}`, '')
      lines.push(...renderHighlights(s.highlights, 3))
    }
  }
  return lines.join('\n').replace(/\n+$/, '\n')
}
