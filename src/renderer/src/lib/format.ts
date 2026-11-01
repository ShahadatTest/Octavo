import type { Book } from '@shared/types'

export const percent = (f: number): string => `${Math.round(Math.max(0, Math.min(1, f)) * 100)}%`

export const authorsLine = (authors: string[]): string => {
  if (authors.length <= 2) return authors.join(' & ')
  return `${authors[0]} and ${authors.length - 1} others`
}

const DAY = 86_400_000

/** "today", "yesterday", "3 days ago", then a date. */
export function relativeDay(iso: string | null, now = new Date()): string {
  if (!iso) return ''
  const then = new Date(iso)
  const start = (d: Date): number => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
  const days = Math.round((start(now) - start(then)) / DAY)
  if (days <= 0) return 'today'
  if (days === 1) return 'yesterday'
  if (days < 7) return `${days} days ago`
  return then.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: then.getFullYear() === now.getFullYear() ? undefined : 'numeric' })
}

export const uid = (): string => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`

function hash(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

/** Cloth-binding colours for drawn covers, picked by title so a book always gets the same one. */
const BINDINGS: Array<[string, string]> = [
  ['#1f3a4d', '#f3e9d2'],
  ['#6b3e26', '#fbeee0'],
  ['#2f4f3a', '#eef3e4'],
  ['#5a2d4a', '#f6e6ef'],
  ['#2b2f5c', '#e8e9f8'],
  ['#7a5a1e', '#fff4dc'],
  ['#3d3d3a', '#f1efe8'],
  ['#8a3324', '#fde9e2']
]

export const bindingFor = (title: string): [string, string] => BINDINGS[hash(title) % BINDINGS.length]

export const formatsOf = (book: Book): string[] => [book.epub && 'EPUB', book.pdf && 'PDF'].filter((x): x is string => !!x)
