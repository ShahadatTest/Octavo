import 'pdfjs-dist/web/pdf_viewer.css'
import type { PDFDocumentProxy } from 'pdfjs-dist'
import type { PDFViewer } from 'pdfjs-dist/web/pdf_viewer.mjs'
import type { Bookmark, FileState, Highlight, Locator, ReaderSettings } from '@shared/types'
import { mergeLineBoxes, type Box } from '@shared/geometry'
import { loadViewer, openPdf, pdfjsLib } from '../lib/pdfjs'
import { HIGHLIGHT_HEX, type Engine, type EngineEvents, type Rect, type TocItem } from './engine'

interface OutlineNode {
  title: string
  dest: string | unknown[] | null
  items: OutlineNode[]
}

type PdfLocator = Extract<Locator, { page: number }>
interface Chapter {
  id: string
  label: string
  page: number
  /** Height of the heading on its page, 0 at the top. */
  y: number
}
const pdfOf = (at: Locator): PdfLocator | null => ('page' in at ? at : null)
const clamp = (x: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, x))

/** PDF through pdf.js's PDFViewer: continuous scroll, a text layer for selection, outline links. */
export class PdfEngine implements Engine {
  private container: HTMLDivElement
  private viewerEl: HTMLDivElement
  private viewer: PDFViewer | null = null
  private doc: PDFDocumentProxy | null = null
  private highlights: Highlight[] = []
  private chapters: Chapter[] = []
  private current = { page: 1, y: 0 }
  private reportTimer = 0
  private settings: ReaderSettings | null = null
  private destroyed = false
  private lastWidth = 0
  private resizeFrame = 0
  private resizeObserver = new ResizeObserver(() => {
    cancelAnimationFrame(this.resizeFrame)
    this.resizeFrame = requestAnimationFrame(() => this.refit())
  })
  toc: TocItem[] = []
  ticks: number[] = []

  constructor(
    host: HTMLElement,
    private readonly events: EngineEvents
  ) {
    this.container = document.createElement('div')
    this.container.className = 'pdf-container'
    this.container.tabIndex = 0
    this.viewerEl = document.createElement('div')
    this.viewerEl.className = 'pdfViewer'
    this.container.append(this.viewerEl)
    host.append(this.container)

    // pdf.js fits pages once; opening the sidebar or resizing the window must fit them again.
    this.resizeObserver.observe(this.container)
    this.container.addEventListener('scroll', this.onScroll, { passive: true })
    this.container.addEventListener('pointerdown', () => this.events.onPointerDown())
    this.container.addEventListener('pointerup', (e) => setTimeout(() => this.onPointerUp(e), 0))
    document.addEventListener('selectionchange', this.onSelectionChange)
  }

  get pageCount(): number {
    return this.doc?.numPages ?? 0
  }

  get zoom(): number {
    return this.viewer?.currentScale ?? 1
  }

  async open(file: File, state: FileState, settings: ReaderSettings): Promise<void> {
    const { EventBus, PDFLinkService, PDFViewer, LinkTarget } = await loadViewer()
    const doc = await openPdf(await file.arrayBuffer())
    if (this.destroyed) {
      void doc.loadingTask.destroy()
      return
    }
    this.doc = doc
    const bus = new EventBus()
    const links = new PDFLinkService({ eventBus: bus, externalLinkTarget: LinkTarget.BLANK })
    const viewer = new PDFViewer({
      container: this.container,
      viewer: this.viewerEl,
      eventBus: bus,
      linkService: links,
      textLayerMode: 1,
      // With borders removed pdf.js also drops the scrollbar allowance from "fit width", and the
      // page ends up a scrollbar wider than the view. reader.css draws its own page edges instead.
      removePageBorders: false,
      annotationMode: pdfjsLib.AnnotationMode.ENABLE
    })
    links.setViewer(viewer)
    this.viewer = viewer
    this.highlights = state.highlights.filter((h) => pdfOf(h.at))

    const ready = new Promise<void>((resolve) => bus.on('pagesinit', () => resolve(), { once: true }))
    bus.on('textlayerrendered', ({ pageNumber }: { pageNumber: number }) => this.drawPage(pageNumber))
    bus.on('pagerendered', ({ pageNumber }: { pageNumber: number }) => this.drawPage(pageNumber))
    viewer.setDocument(doc)
    links.setDocument(doc, null)
    await ready
    if (this.destroyed) return

    this.applySettings(settings)
    const at = state.position ? pdfOf(state.position.at) : null
    if (at) this.scrollToPosition(at.page, at.y ?? 0)
    await this.loadOutline()
    this.report()
  }

  /**
   * Resolves the outline to pages and heights. Several sections often start on one page, so each
   * keeps the height of its heading (0 at the top of the page) to tell them apart.
   */
  private async loadOutline(): Promise<void> {
    const doc = this.doc!
    const outline = ((await doc.getOutline().catch(() => null)) ?? []) as OutlineNode[]
    const locate = async (dest: OutlineNode['dest']): Promise<{ page: number; y: number } | null> => {
      try {
        const explicit = typeof dest === 'string' ? await doc.getDestination(dest) : dest
        if (!Array.isArray(explicit) || explicit.length === 0) return null
        const ref = explicit[0]
        const page =
          typeof ref === 'number' ? ref + 1 : ref && typeof ref === 'object' ? (await doc.getPageIndex(ref as never)) + 1 : null
        if (page === null) return null
        // [ref, {name: 'XYZ'}, left, top, zoom] or [ref, {name: 'FitH'}, top]: top is in PDF units, from the bottom.
        const kind = (explicit[1] as { name?: string } | undefined)?.name
        const top = kind === 'XYZ' ? explicit[3] : kind === 'FitH' || kind === 'FitBH' ? explicit[2] : null
        return { page, y: typeof top === 'number' ? this.yOfPdfPoint(page, top) : 0 }
      } catch {
        return null // an outline entry pointing nowhere is skipped
      }
    }
    const flat: Chapter[] = []
    let seq = 0
    const walk = async (nodes: OutlineNode[]): Promise<TocItem[]> => {
      const out: TocItem[] = []
      for (const n of nodes) {
        const id = `pdf-${seq++}`
        const at = await locate(n.dest)
        const label = (n.title ?? '').trim() || 'Untitled'
        const children = await walk(n.items ?? [])
        if (!at && children.length === 0) continue
        if (at) flat.push({ id, label, ...at })
        out.push({ id, label, target: at ?? (children[0].target as Locator), children })
      }
      return out
    }
    this.toc = await walk(outline)
    this.chapters = flat.sort((a, b) => a.page - b.page || a.y - b.y)
    const n = this.pageCount
    this.ticks = [...new Set(this.toc.map((t) => (t.target as PdfLocator).page))]
      .map((p) => (p - 1) / n)
      .filter((f) => f > 0.001 && f < 0.999)
  }

  /** The last section whose heading is at or above the given point. */
  private chapterFor(page: number, y = 1): Chapter | null {
    let found: Chapter | null = null
    for (const c of this.chapters) {
      if (c.page < page || (c.page === page && c.y <= y + 0.02)) found = c
      else break
    }
    return found
  }

  // ---- position ------------------------------------------------------------------------------

  private onScroll = (): void => {
    if (this.reportTimer) return
    this.reportTimer = window.setTimeout(() => {
      this.reportTimer = 0
      this.report()
    }, 120)
  }

  /** The page at the top edge of the view, and how far down it the edge sits (0 to 1). */
  private topPosition(): { page: number; y: number } {
    const viewer = this.viewer
    if (!viewer || viewer.pagesCount === 0) return { page: 1, y: 0 }
    const top = this.container.getBoundingClientRect().top + 1
    let lo = 0
    let hi = viewer.pagesCount - 1
    while (lo < hi) {
      const mid = (lo + hi) >> 1
      if (viewer.getPageView(mid).div.getBoundingClientRect().bottom <= top) lo = mid + 1
      else hi = mid
    }
    const r = viewer.getPageView(lo).div.getBoundingClientRect()
    // Pages have no height for a moment while the viewer swaps documents.
    return { page: lo + 1, y: r.height > 0 ? clamp((top - r.top) / r.height, 0, 1) : 0 }
  }

  private report(): void {
    if (!this.viewer) return
    this.current = this.topPosition()
    const n = this.pageCount
    const { page, y } = this.current
    const chapter = this.chapterFor(page, y)
    const atEnd = this.container.scrollTop + this.container.clientHeight >= this.container.scrollHeight - 4
    this.events.onRelocate({
      fraction: n ? clamp((page - 1 + y) / n, 0, 1) : 0,
      chapter: chapter?.label ?? '',
      chapterId: chapter?.id ?? null,
      at: { page, y: Math.round(y * 1000) / 1000 },
      where: `Page ${page} of ${n}`,
      atEnd
    })
  }

  private scrollToPosition(page: number, y: number): void {
    const viewer = this.viewer
    if (!viewer) return
    const index = clamp(page, 1, viewer.pagesCount) - 1
    const div = viewer.getPageView(index).div
    const cTop = this.container.getBoundingClientRect().top
    const offset = div.getBoundingClientRect().top - cTop + this.container.scrollTop
    this.container.scrollTop = offset + y * div.getBoundingClientRect().height
  }

  next(): void {
    this.container.scrollBy({ top: this.container.clientHeight * 0.92, behavior: 'smooth' })
  }

  prev(): void {
    this.container.scrollBy({ top: -this.container.clientHeight * 0.92, behavior: 'smooth' })
  }

  async goTo(target: string | number | Locator): Promise<void> {
    if (typeof target === 'number') this.scrollToPosition(target, 0)
    else if (typeof target === 'object') {
      const at = pdfOf(target)
      if (!at) return
      // A highlight's own rectangle is a better target than the top of its page.
      const first = at.rects?.[0]
      const y = first ? this.yOfPdfPoint(at.page, Math.max(first[1], first[3])) : (at.y ?? 0)
      this.scrollToPosition(at.page, Math.max(0, y - 0.04))
    }
    this.report()
  }

  async goToFraction(fraction: number): Promise<void> {
    const n = this.pageCount
    if (!n) return
    const exact = clamp(fraction, 0, 1) * n
    const page = Math.min(n, Math.floor(exact) + 1)
    this.scrollToPosition(page, exact - (page - 1))
    this.report()
  }

  private yOfPdfPoint(page: number, pdfY: number): number {
    const pv = this.viewer?.getPageView(page - 1)
    if (!pv) return 0
    const [, vy] = pv.viewport.convertToViewportPoint(0, pdfY)
    return clamp(vy / pv.viewport.height, 0, 1)
  }

  // ---- selection and highlights ----------------------------------------------------------------

  private onSelectionChange = (): void => {
    const sel = document.getSelection()
    if (!sel || sel.isCollapsed) this.events.onSelection(null)
  }

  private onPointerUp(e: PointerEvent): void {
    const sel = document.getSelection()
    if (!sel || sel.isCollapsed || sel.rangeCount === 0) {
      const hit = this.hitTest(e.clientX, e.clientY)
      if (hit) this.events.onHighlightClick(hit.id, hit.rect)
      return
    }
    const range = sel.getRangeAt(0)
    if (!this.container.contains(range.commonAncestorContainer)) return
    const text = sel.toString().replace(/\s+/g, ' ').trim()
    if (!text) return
    const rects = this.pdfRectsFor(range)
    if (rects.length === 0) return
    const page = rects[0][4]
    const r = range.getBoundingClientRect()
    this.events.onSelection({
      text,
      at: { page, rects },
      rect: { left: r.left, top: r.top, right: r.right, bottom: r.bottom },
      fraction: this.pageCount ? (page - 1) / this.pageCount : 0,
      label: this.chapterFor(page, this.yOfPdfPoint(page, rects[0][3]))?.label ?? ''
    })
  }

  /** The selection as [x1, y1, x2, y2, page] boxes in PDF user space, one per line. */
  private pdfRectsFor(range: Range): number[][] {
    const viewer = this.viewer!
    const client = Array.from(range.getClientRects())
    if (client.length === 0) return []
    const heights = client.map((r) => r.height).sort((a, b) => a - b)
    const median = heights[Math.floor(heights.length / 2)] || 1
    const out: number[][] = []
    const first = this.topPosition().page - 1
    const candidates: number[] = []
    for (let i = Math.max(0, first - 2); i < Math.min(viewer.pagesCount, first + 6); i++) candidates.push(i)
    for (const index of candidates) {
      const pv = viewer.getPageView(index)
      const pr = pv.div.getBoundingClientRect()
      const boxes: Box[] = []
      for (const r of client) {
        // The text layer's end-of-content filler yields one tall box; real lines are all of a height.
        if (r.height > median * 3.5) continue
        const cx = (r.left + r.right) / 2
        const cy = (r.top + r.bottom) / 2
        if (cx < pr.left || cx > pr.right || cy < pr.top || cy > pr.bottom) continue
        boxes.push({ left: r.left - pr.left, top: r.top - pr.top, right: r.right - pr.left, bottom: r.bottom - pr.top })
      }
      if (boxes.length === 0) continue
      const kx = pv.viewport.width / pr.width
      const ky = pv.viewport.height / pr.height
      for (const b of mergeLineBoxes(boxes)) {
        const [x1, y1] = pv.viewport.convertToPdfPoint(b.left * kx, b.top * ky)
        const [x2, y2] = pv.viewport.convertToPdfPoint(b.right * kx, b.bottom * ky)
        const round = (v: number): number => Math.round(v * 100) / 100
        out.push([round(Math.min(x1, x2)), round(Math.min(y1, y2)), round(Math.max(x1, x2)), round(Math.max(y1, y2)), index + 1])
      }
    }
    return out
  }

  private drawPage(pageNumber: number): void {
    const pv = this.viewer?.getPageView(pageNumber - 1)
    if (!pv?.div) return
    const page = pv.div as HTMLDivElement
    let layer = page.querySelector<HTMLDivElement>(':scope > .pdf-hl-layer')
    if (!layer) {
      layer = document.createElement('div')
      layer.className = 'pdf-hl-layer'
      page.append(layer)
    }
    layer.replaceChildren()
    const vp = pv.viewport.clone({ scale: 1 })
    for (const h of this.highlights) {
      const at = pdfOf(h.at)
      if (!at?.rects) continue
      for (const r of at.rects) {
        if ((r[4] ?? at.page) !== pageNumber) continue
        // Percentages of the page box keep the highlight in place at every zoom level.
        const [ax, ay] = vp.convertToViewportPoint(r[0], r[1])
        const [bx, by] = vp.convertToViewportPoint(r[2], r[3])
        const el = document.createElement('i')
        el.dataset.id = h.id
        el.style.left = `${(Math.min(ax, bx) / vp.width) * 100}%`
        el.style.top = `${(Math.min(ay, by) / vp.height) * 100}%`
        el.style.width = `${(Math.abs(bx - ax) / vp.width) * 100}%`
        el.style.height = `${(Math.abs(by - ay) / vp.height) * 100}%`
        el.style.background = HIGHLIGHT_HEX[h.color]
        layer.append(el)
      }
    }
  }

  private hitTest(x: number, y: number): { id: string; rect: Rect } | null {
    for (const el of this.container.querySelectorAll<HTMLElement>('.pdf-hl-layer > i')) {
      const r = el.getBoundingClientRect()
      if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom && el.dataset.id) {
        return { id: el.dataset.id, rect: { left: r.left, top: r.top, right: r.right, bottom: r.bottom } }
      }
    }
    return null
  }

  setHighlights(list: Highlight[]): void {
    this.highlights = list.filter((h) => pdfOf(h.at))
    const viewer = this.viewer
    if (!viewer) return
    for (let i = 0; i < viewer.pagesCount; i++) {
      if (viewer.getPageView(i).div.querySelector('.textLayer')) this.drawPage(i + 1)
    }
  }

  // ---- bookmarks -----------------------------------------------------------------------------

  bookmarksHere(bookmarks: Bookmark[]): Bookmark[] {
    return bookmarks.filter((b) => pdfOf(b.at)?.page === this.current.page)
  }

  bookmarkHere(): Omit<Bookmark, 'id' | 'createdAt'> | null {
    if (!this.viewer) return null
    const { page, y } = this.current
    const textLayer = this.viewer.getPageView(page - 1).div.querySelector('.textLayer')
    const excerpt = (textLayer?.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 180)
    return {
      at: { page, y: Math.round(y * 1000) / 1000 },
      fraction: this.pageCount ? (page - 1 + y) / this.pageCount : 0,
      label: this.chapterFor(page, y)?.label ?? `Page ${page}`,
      excerpt
    }
  }

  // ---- appearance ----------------------------------------------------------------------------

  applySettings(s: ReaderSettings): void {
    const viewer = this.viewer
    const prev = this.settings
    this.settings = s
    this.container.dataset.night = String(s.theme === 'night' && s.pdfNight)
    if (!viewer) return
    if (!prev || prev.pdfZoom !== s.pdfZoom) {
      const keep = this.topPosition()
      viewer.currentScaleValue = s.pdfZoom
      this.scrollToPosition(keep.page, keep.y)
    }
  }

  /** Re-applies a fit mode after the view changes width. A zoom set by hand is left alone. */
  private refit(): void {
    const viewer = this.viewer
    const width = this.container.clientWidth
    if (!viewer || width === this.lastWidth) return
    this.lastWidth = width
    const mode = viewer.currentScaleValue
    if (mode !== 'auto' && mode !== 'page-width' && mode !== 'page-fit') return
    const keep = this.topPosition()
    viewer.currentScaleValue = mode
    this.scrollToPosition(keep.page, keep.y)
  }

  zoomBy(factor: number): void {
    const viewer = this.viewer
    if (!viewer) return
    const keep = this.topPosition()
    viewer.currentScale = clamp(viewer.currentScale * factor, 0.3, 5)
    this.scrollToPosition(keep.page, keep.y)
  }

  clearSelection(): void {
    document.getSelection()?.removeAllRanges()
  }

  destroy(): void {
    this.destroyed = true
    this.resizeObserver.disconnect()
    cancelAnimationFrame(this.resizeFrame)
    document.removeEventListener('selectionchange', this.onSelectionChange)
    this.container.removeEventListener('scroll', this.onScroll)
    window.clearTimeout(this.reportTimer)
    this.viewer?.setDocument(null as never)
    void this.doc?.loadingTask.destroy()
    this.container.remove()
  }
}
