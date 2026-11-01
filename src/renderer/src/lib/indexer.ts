import { makeBook, type FoliateBook, type FoliateContributor, type LanguageMap } from 'foliate-js/view.js'
import { bookUrl, INDEX_VERSION, type BookMeta, type FileRecord, type IndexUpdate } from '@shared/types'
import { cleanAuthors, cleanTitle, plausibleTitle } from '@shared/books'
import { normalizeText, PAGE_INDEX_VERSION, type PageIndex } from '@shared/pages'
import { openPdf } from './pdfjs'

const COVER_HEIGHT = 480
const COVER_MAX_WIDTH = 400

export async function fetchBookFile(file: FileRecord): Promise<File> {
  const res = await fetch(bookUrl(file.id))
  if (!res.ok) throw new Error(`Could not read ${file.path} (${res.status})`)
  const name = file.path.slice(file.path.lastIndexOf('/') + 1)
  return new File([await res.blob()], /\.(epub|pdf)$/i.test(name) ? name : `${name}.${file.format}`)
}

const langText = (x: LanguageMap | undefined): string => {
  if (!x) return ''
  if (typeof x === 'string') return x
  return x.en ?? Object.values(x)[0] ?? ''
}

const contributorName = (c: string | FoliateContributor): string => (typeof c === 'string' ? c : langText(c?.name))

const contributors = (x: unknown): string[] => {
  if (!x) return []
  const list = Array.isArray(x) ? x : [x]
  return list.map((c) => contributorName(c as string | FoliateContributor).trim()).filter(Boolean)
}

const stripHtml = (s: string | undefined): string | undefined => {
  if (!s) return undefined
  const doc = new DOMParser().parseFromString(s, 'text/html')
  return doc.body.textContent?.replace(/\s+/g, ' ').trim() || undefined
}

/** Scales an image down to a thumbnail and encodes it as WebP. */
async function thumbnail(source: CanvasImageSource & { width: number; height: number }): Promise<Uint8Array | null> {
  const scale = Math.min(1, COVER_HEIGHT / source.height, COVER_MAX_WIDTH / source.width)
  const w = Math.max(1, Math.round(source.width * scale))
  const h = Math.max(1, Math.round(source.height * scale))
  const canvas = new OffscreenCanvas(w, h)
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(source, 0, 0, w, h)
  const blob = await canvas.convertToBlob({ type: 'image/webp', quality: 0.86 })
  return new Uint8Array(await blob.arrayBuffer())
}

async function indexEpub(file: File): Promise<{ meta: BookMeta; cover: Uint8Array | null }> {
  const book: FoliateBook = await makeBook(file)
  const m = book.metadata ?? {}
  const language = Array.isArray(m.language) ? m.language[0] : m.language
  const meta: BookMeta = {
    title: cleanTitle(langText(m.title)),
    authors: cleanAuthors(contributors(m.author)),
    publisher: contributors(m.publisher)[0] || (typeof m.publisher === 'string' ? m.publisher : undefined),
    language: language || undefined,
    published: m.published || undefined,
    description: stripHtml(m.description)
  }
  let cover: Uint8Array | null = null
  try {
    const blob = await book.getCover?.()
    if (blob && blob.size > 0) {
      const bitmap = await createImageBitmap(blob)
      cover = await thumbnail(bitmap)
      bitmap.close()
    }
  } catch {
    cover = null // a broken cover image is not worth failing the book over
  }
  return { meta, cover }
}

async function indexPdf(file: File): Promise<{ meta: BookMeta; cover: Uint8Array | null }> {
  const doc = await openPdf(await file.arrayBuffer())
  try {
    const { info } = (await doc.getMetadata().catch(() => ({ info: {} }))) as { info: Record<string, unknown> }
    const author = typeof info.Author === 'string' ? info.Author : ''
    const meta: BookMeta = {
      title: plausibleTitle(cleanTitle(typeof info.Title === 'string' ? info.Title : '')),
      authors: cleanAuthors(author ? [author] : []),
      publisher: typeof info.Publisher === 'string' ? info.Publisher : undefined,
      pages: doc.numPages
    }
    const page = await doc.getPage(1)
    const base = page.getViewport({ scale: 1 })
    const scale = Math.min(2, (COVER_HEIGHT * 1.5) / base.height)
    const viewport = page.getViewport({ scale })
    const canvas = new OffscreenCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height))
    const ctx = canvas.getContext('2d')!
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    // An OffscreenCanvas context goes in canvasContext; pdf.js wants canvas null in that case.
    await page.render({ canvas: null, canvasContext: ctx as unknown as CanvasRenderingContext2D, viewport }).promise
    const cover = await thumbnail(canvas)
    page.cleanup()
    return { meta, cover }
  } finally {
    await doc.loadingTask.destroy()
  }
}

export async function indexFile(file: FileRecord): Promise<IndexUpdate> {
  try {
    const blob = await fetchBookFile(file)
    const { meta, cover } = file.format === 'epub' ? await indexEpub(blob) : await indexPdf(blob)
    return { fileId: file.id, meta, cover }
  } catch (e) {
    return { fileId: file.id, meta: null, cover: null, error: e instanceof Error ? e.message : String(e) }
  }
}

// ---- page text of PDFs ------------------------------------------------------------------------

/** Each page's printed label and normalised text, for finding EPUB passages in the PDF. */
async function buildPageIndex(file: FileRecord): Promise<PageIndex> {
  const doc = await openPdf(await (await fetchBookFile(file)).arrayBuffer())
  try {
    const pages: string[] = []
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i)
      const content = await page.getTextContent()
      pages.push(normalizeText(content.items.map((item) => ('str' in item ? item.str : '')).join(' ')))
      page.cleanup()
    }
    const printed = ((await doc.getPageLabels().catch(() => null)) ?? []) as string[]
    const labels = pages.map((_, i) => printed[i]?.trim() || String(i + 1))
    return { version: PAGE_INDEX_VERSION, labels, pages }
  } finally {
    await doc.loadingTask.destroy()
  }
}

const pageIndexes = new Map<string, Promise<PageIndex | null>>()

/** A PDF's page index: from the library folder, or built and stored on first use. Kept in memory. */
export function loadPageIndex(file: FileRecord): Promise<PageIndex | null> {
  let p = pageIndexes.get(file.id)
  if (!p) {
    p = (async () => {
      const stored = await window.octavo.getPageIndex(file.id)
      if (stored) return stored
      const built = await buildPageIndex(file)
      await window.octavo.savePageIndex(file.id, built)
      return built
    })().catch(() => null)
    pageIndexes.set(file.id, p)
  }
  return p
}

/** Builds and stores a page index ahead of time, without keeping it in memory. */
async function storePageIndex(file: FileRecord): Promise<void> {
  if (pageIndexes.has(file.id)) return
  try {
    await window.octavo.savePageIndex(file.id, await buildPageIndex(file))
  } catch {
    // a PDF whose text cannot be read simply has no page numbers for its EPUB
  }
}

const needsMeta = (f: FileRecord): boolean => !f.meta || (f.indexVersion ?? 1) < INDEX_VERSION
const needsPages = (f: FileRecord): boolean => f.format === 'pdf' && (f.pageIndexVersion ?? 0) < PAGE_INDEX_VERSION

/**
 * Works through the library one file at a time, so a large import does not hold dozens of books in
 * memory at once: first metadata and covers (files never read, or read by an older INDEX_VERSION),
 * then, in the background, the page text of PDFs.
 */
export class Indexer {
  private queue: FileRecord[] = []
  private pageQueue: FileRecord[] = []
  private queued = new Set<string>()
  private pageQueued = new Set<string>()
  private running = false
  done = 0

  constructor(private readonly onProgress: (pending: number, done: number) => void) {}

  enqueue(files: FileRecord[]): void {
    for (const f of files) {
      if (needsMeta(f) && !this.queued.has(f.id)) {
        this.queued.add(f.id)
        this.queue.push(f)
      }
      if (needsPages(f) && !this.pageQueued.has(f.id)) {
        this.pageQueued.add(f.id)
        this.pageQueue.push(f)
      }
    }
    this.onProgress(this.queue.length + (this.running ? 1 : 0), this.done)
    void this.pump()
  }

  private async pump(): Promise<void> {
    if (this.running) return
    this.running = true
    try {
      while (this.queue.length || this.pageQueue.length) {
        if (this.queue.length) {
          const file = this.queue.shift()!
          this.onProgress(this.queue.length + 1, this.done)
          const update = await indexFile(file)
          await window.octavo.saveIndex(update)
          this.done++
          if (this.queue.length === 0) this.onProgress(0, this.done)
        } else {
          await storePageIndex(this.pageQueue.shift()!)
        }
      }
    } finally {
      this.running = false
      this.onProgress(this.queue.length, this.done)
    }
  }
}
