import 'foliate-js/view.js'
import type { FoliateTocItem, RelocateDetail, View } from 'foliate-js/view.js'
import { Overlayer } from 'foliate-js/overlayer.js'
import { collapse, compare } from 'foliate-js/epubcfi.js'
import type { Bookmark, FileState, Highlight, HighlightColor, Locator, ReaderSettings } from '@shared/types'
import { selectionText } from '@shared/selection'
import { epubStyles } from './epub-styles'
import { HIGHLIGHT_HEX, rectOfRange, type Engine, type EngineEvents, type TocItem } from './engine'

const mapToc = (items: FoliateTocItem[] | undefined): TocItem[] =>
  (items ?? []).map((t) => ({ id: t.href, label: t.label?.trim() || 'Untitled', target: t.href, children: mapToc(t.subitems) }))

const cfiOf = (at: Locator): string | null => ('cfi' in at ? at.cfi : null)

/** Enough text to find a passage in the paired PDF even when a page break interrupts it there. */
const LEAD_CHARS = 400

/** EPUB through foliate-js: paginated or scrolled, CFI locations, SVG highlight overlays. */
export class EpubEngine implements Engine {
  private view: View
  private highlights = new Map<string, { cfi: string; color: HighlightColor }>()
  private byCfi = new Map<string, string>()
  private last: RelocateDetail | null = null
  private opened = false
  private destroyed = false
  private wheelAt = 0
  private flow: ReaderSettings['flow'] = 'paginated'
  toc: TocItem[] = []
  ticks: number[] = []

  constructor(
    host: HTMLElement,
    private readonly events: EngineEvents
  ) {
    this.view = document.createElement('foliate-view') as View
    this.view.addEventListener('relocate', (e) => this.onRelocate((e as CustomEvent<RelocateDetail>).detail))
    this.view.addEventListener('load', (e) => this.onLoad((e as CustomEvent<{ doc: Document; index: number }>).detail))
    this.view.addEventListener('create-overlay', (e) => this.drawSection((e as CustomEvent<{ index: number }>).detail.index))
    this.view.addEventListener('draw-annotation', (e) => {
      const { draw, annotation } = (e as CustomEvent).detail
      draw(Overlayer.highlight, { color: annotation.color })
    })
    this.view.addEventListener('show-annotation', (e) => {
      const { value, range } = (e as CustomEvent<{ value: string; range: Range }>).detail
      const id = this.byCfi.get(value)
      if (id) this.events.onHighlightClick(id, rectOfRange(range))
    })
    this.view.addEventListener('external-link', (e) => {
      e.preventDefault()
      this.events.onExternalLink((e as CustomEvent<{ href: string }>).detail.href)
    })
    host.append(this.view)
  }

  async open(file: File, state: FileState, settings: ReaderSettings): Promise<void> {
    await this.view.open(file)
    if (this.destroyed) return
    this.opened = true
    this.toc = mapToc(this.view.book.toc)
    this.ticks = this.view.getSectionFractions().filter((f) => f > 0.001 && f < 0.999)
    this.view.renderer.setAttribute('animated', '')
    this.applySettings(settings)
    // Highlights are drawn as each section loads, through create-overlay.
    this.rememberHighlights(state.highlights)
    const cfi = state.position ? cfiOf(state.position.at) : null
    await this.view.init({ lastLocation: cfi, showTextStart: false })
  }

  private onLoad({ doc, index }: { doc: Document; index: number }): void {
    doc.addEventListener('pointerdown', () => this.events.onPointerDown())
    doc.addEventListener('pointerup', () => setTimeout(() => this.reportSelection(doc, index), 0))
    doc.addEventListener('keyup', (e) => {
      if (e.shiftKey) this.reportSelection(doc, index)
    })
    doc.addEventListener('selectionchange', () => {
      const sel = doc.getSelection()
      if (!sel || sel.isCollapsed) this.events.onSelection(null)
    })
    doc.addEventListener('keydown', (e) => this.events.onKey(e))
    // The mouse wheel turns pages in paginated layout, as it does in most readers.
    doc.addEventListener(
      'wheel',
      (e) => {
        if (this.flow !== 'paginated' || Math.abs(e.deltaY) < 8) return
        const now = Date.now()
        if (now - this.wheelAt < 350) return
        this.wheelAt = now
        if (e.deltaY > 0) this.next()
        else this.prev()
      },
      { passive: true }
    )
  }

  private reportSelection(doc: Document, index: number): void {
    const sel = doc.getSelection()
    if (!sel || sel.isCollapsed || sel.rangeCount === 0) return
    const range = sel.getRangeAt(0)
    const text = selectionText(range.toString())
    if (!text) return
    const cfi = this.view.getCFI(index, range)
    const label = this.view.getProgressOf(index, range)?.tocItem?.label ?? this.last?.tocItem?.label ?? ''
    // The selection plus what follows it: a short highlight alone is too little text to find in a PDF.
    const after = range.cloneRange()
    after.setEnd(doc.body, doc.body.childNodes.length)
    const lead = after.toString().slice(0, LEAD_CHARS)
    this.events.onSelection({ text, at: { cfi }, rect: rectOfRange(range), fraction: this.last?.fraction ?? 0, label, lead })
  }

  private onRelocate(detail: RelocateDetail): void {
    this.last = detail
    const where = detail.pageItem
      ? `Page ${detail.pageItem.label}`
      : detail.location
        ? `Loc ${detail.location.current + 1} of ${detail.location.total}`
        : ''
    this.events.onRelocate({
      fraction: detail.fraction ?? 0,
      chapter: detail.tocItem?.label?.trim() ?? '',
      chapterId: detail.tocItem?.href ?? null,
      at: { cfi: collapse(detail.cfi) },
      where,
      lead: detail.range?.toString().slice(0, LEAD_CHARS),
      atEnd: !!this.view.renderer?.atEnd
    })
  }

  private rememberHighlights(list: Highlight[]): void {
    this.highlights = new Map()
    for (const h of list) {
      const cfi = cfiOf(h.at)
      if (cfi) this.highlights.set(h.id, { cfi, color: h.color })
    }
    this.byCfi = new Map([...this.highlights].map(([id, h]) => [h.cfi, id]))
  }

  private drawSection(_index: number): void {
    // addAnnotation only draws into sections that are loaded, so offering all of them is safe.
    for (const h of this.highlights.values()) void this.view.addAnnotation({ value: h.cfi, color: HIGHLIGHT_HEX[h.color] })
  }

  setHighlights(list: Highlight[]): void {
    const before = this.highlights
    this.rememberHighlights(list)
    if (!this.opened) return
    for (const [id, old] of before) {
      const now = this.highlights.get(id)
      if (!now || now.cfi !== old.cfi) void this.view.deleteAnnotation({ value: old.cfi })
    }
    for (const [id, h] of this.highlights) {
      const old = before.get(id)
      if (!old || old.cfi !== h.cfi || old.color !== h.color) {
        void this.view.addAnnotation({ value: h.cfi, color: HIGHLIGHT_HEX[h.color] })
      }
    }
  }

  bookmarksHere(bookmarks: Bookmark[]): Bookmark[] {
    if (!this.last?.cfi) return []
    const start = collapse(this.last.cfi)
    const end = collapse(this.last.cfi, true)
    return bookmarks.filter((b) => {
      const cfi = cfiOf(b.at)
      try {
        return !!cfi && compare(cfi, start) >= 0 && compare(cfi, end) <= 0
      } catch {
        return false
      }
    })
  }

  bookmarkHere(): Omit<Bookmark, 'id' | 'createdAt'> | null {
    if (!this.last?.cfi) return null
    const excerpt = (this.last.range?.toString() ?? '').replace(/\s+/g, ' ').trim().slice(0, 180)
    return {
      at: { cfi: collapse(this.last.cfi) },
      fraction: this.last.fraction ?? 0,
      label: this.last.tocItem?.label?.trim() ?? '',
      excerpt
    }
  }

  next(): void {
    void this.view.goRight()
  }

  prev(): void {
    void this.view.goLeft()
  }

  async goTo(target: string | number | Locator): Promise<void> {
    if (typeof target === 'object') {
      const cfi = cfiOf(target)
      if (cfi) await this.view.goTo(cfi)
      return
    }
    await this.view.goTo(target)
  }

  async goToFraction(fraction: number): Promise<void> {
    await this.view.goToFraction(Math.max(0, Math.min(1, fraction)))
  }

  applySettings(s: ReaderSettings): void {
    if (!this.opened) return
    this.flow = s.flow
    const r = this.view.renderer
    r.setAttribute('flow', s.flow)
    r.setAttribute('max-inline-size', `${s.width}px`)
    r.setAttribute('max-column-count', String(s.columns))
    r.setAttribute('gap', '6%')
    r.setAttribute('margin', '36px')
    r.setStyles(epubStyles(s))
  }

  clearSelection(): void {
    this.view.deselect()
  }

  destroy(): void {
    this.destroyed = true
    try {
      if (this.opened) this.view.close()
    } finally {
      this.view.remove()
    }
  }
}
