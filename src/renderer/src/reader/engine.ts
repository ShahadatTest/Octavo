import type { Bookmark, FileState, Highlight, HighlightColor, Locator, ReaderSettings } from '@shared/types'

export const HIGHLIGHT_HEX: Record<HighlightColor, string> = {
  yellow: '#f6c445',
  green: '#7cc98a',
  blue: '#6ea8ec',
  pink: '#f08cae',
  purple: '#b495ec'
}

export interface Rect {
  left: number
  top: number
  right: number
  bottom: number
}

export interface TocItem {
  /** Unique within the book: EPUB uses the href, PDF the entry's position in the outline. */
  id: string
  label: string
  /** EPUB: an href. PDF: a page and a height on it. */
  target: string | Locator
  children: TocItem[]
}

export interface Relocation {
  fraction: number
  chapter: string
  /** The TocItem id of the current chapter, to mark it in the contents list. */
  chapterId: string | null
  at: Locator
  /** Fallback position text when there is no printed page: "Loc 31 of 410". */
  where: string
  /** Printed page label, when the format knows it (PDF). */
  page?: string
  /** EPUB: the text at the top of the view, to find the printed page in a paired PDF. */
  lead?: string
  atEnd: boolean
}

export interface SelectionInfo {
  text: string
  at: Locator
  rect: Rect
  fraction: number
  label: string
  /** Printed page label, when the format knows it (PDF). */
  page?: string
  /** EPUB: the text from the start of the selection onward, to find its page in a paired PDF. */
  lead?: string
}

export interface EngineEvents {
  onRelocate(r: Relocation): void
  onSelection(s: SelectionInfo | null): void
  onHighlightClick(id: string, rect: Rect): void
  /** Key presses inside the book's own document, which do not reach the window. */
  onKey(e: KeyboardEvent): void
  onPointerDown(): void
  onExternalLink(href: string): void
}

/** What the reader shell needs from a format. EpubEngine and PdfEngine implement it. */
export interface Engine {
  readonly toc: TocItem[]
  /** Chapter starts as fractions, for the scrubber. */
  readonly ticks: number[]
  open(file: File, state: FileState, settings: ReaderSettings): Promise<void>
  next(): void
  prev(): void
  goTo(target: string | number | Locator): Promise<void>
  goToFraction(fraction: number): Promise<void>
  setHighlights(highlights: Highlight[]): void
  /** Bookmarks that fall on what is on screen now. */
  bookmarksHere(bookmarks: Bookmark[]): Bookmark[]
  /** A bookmark for the current position, without id or timestamps. */
  bookmarkHere(): Omit<Bookmark, 'id' | 'createdAt'> | null
  applySettings(settings: ReaderSettings): void
  clearSelection(): void
  zoomBy?(factor: number): void
  readonly zoom?: number
  /** PDF: the printed label of a 1-based page ("xii", "112"). */
  pageLabel?(page: number): string
  destroy(): void
}

/** A range's box in the top window, also when the range lives inside a book's iframe. */
export function rectOfRange(range: Range): Rect {
  const r = range.getBoundingClientRect()
  const frame = range.startContainer.ownerDocument?.defaultView?.frameElement as HTMLElement | null
  const f = frame?.getBoundingClientRect() ?? { left: 0, top: 0 }
  return { left: r.left + f.left, top: r.top + f.top, right: r.right + f.left, bottom: r.bottom + f.top }
}
