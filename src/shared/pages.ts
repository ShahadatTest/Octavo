/**
 * Printed page numbers for EPUBs that have none of their own.
 *
 * Most EPUBs carry no map to the print edition, so a position in one is only a fraction or a
 * "location" (a fixed slice of text). When the same book is in the library as a PDF, the PDF's
 * pages are the print pages: Octavo extracts each page's text once, and finds an EPUB passage by
 * searching for its text there. Comparison ignores case, spacing, punctuation and line-end
 * hyphens, which is where an EPUB and its print layout differ.
 */

export const PAGE_INDEX_VERSION = 1

export interface PageIndex {
  version: number
  /** Printed page labels ("xii", "112"), one per PDF page. */
  labels: string[]
  /** Each page's text, normalised with normalizeText. */
  pages: string[]
}

/** Lower-case letters and digits only, with ligatures and accents folded: "ﬁnal Café-\nau" → "finalcafeau". */
export function normalizeText(s: string): string {
  return s
    .normalize('NFKD')
    .replace(/\p{M}+/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '')
}

/** Probes shorter than this match too many places to mean anything. */
const MIN_PROBE = 24
const PROBE = 64
const MAX_HITS = 40

export interface PageHit {
  /** 0-based PDF page. */
  index: number
  label: string
}

export class PageLocator {
  private text: string
  private starts: number[]

  constructor(private readonly index: PageIndex) {
    this.starts = []
    let at = 0
    for (const p of index.pages) {
      this.starts.push(at)
      at += p.length
    }
    this.text = index.pages.join('')
  }

  get pageCount(): number {
    return this.index.pages.length
  }

  label(i: number): string {
    return this.index.labels[i] || String(i + 1)
  }

  private pageAt(offset: number): number {
    let lo = 0
    let hi = this.starts.length - 1
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1
      if (this.starts[mid] <= offset) lo = mid
      else hi = mid - 1
    }
    return lo
  }

  private hits(probe: string): number[] {
    const out: number[] = []
    for (let at = this.text.indexOf(probe); at >= 0 && out.length < MAX_HITS; at = this.text.indexOf(probe, at + 1)) out.push(at)
    return out
  }

  /**
   * The page where `text` starts. `near` (0 to 1, the passage's position in the EPUB) picks between
   * repeated passages. Probes the start of the text first; if a page break, running head or
   * footnote marker interrupts it in the PDF, it falls back to later stretches of the text.
   */
  locate(text: string, near = 0.5): PageHit | null {
    const norm = normalizeText(text)
    if (norm.length < MIN_PROBE || this.text.length === 0) return null
    const probeLen = Math.min(PROBE, norm.length)
    const offsets = [0]
    for (let o = probeLen; o + MIN_PROBE <= norm.length && offsets.length < 4; o += probeLen) offsets.push(o)
    for (const skip of offsets) {
      const probe = norm.slice(skip, skip + probeLen)
      if (probe.length < MIN_PROBE) break
      const hits = this.hits(probe)
      if (hits.length === 0) continue
      const target = near * this.text.length
      const best = hits.reduce((a, b) => (Math.abs(b - target) < Math.abs(a - target) ? b : a))
      // A probe found further into the text still names the page the text starts on, unless the
      // skipped part crossed a page break; then the start is on the previous page.
      let index = this.pageAt(best)
      if (skip > 0 && best - skip < this.starts[index] && index > 0) index--
      return { index, label: this.label(index) }
    }
    return null
  }
}
