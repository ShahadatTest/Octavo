import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { ArrowLeft, Bookmark as BookmarkIcon, BookmarkCheck, ChevronLeft, ChevronRight, PanelLeft, Type } from 'lucide-react'
import type { Book, FileRecord, FileState, Highlight, HighlightColor, Locator, ReaderSettings } from '@shared/types'
import { readerCommands, useStore } from '../store'
import { fetchBookFile, loadPageIndex } from '../lib/indexer'
import { PageLocator } from '@shared/pages'
import { percent, uid } from '../lib/format'
import { rectOf, type Anchor } from '../components/Popover'
import { restoreTitleBar } from '../hooks'
import { PALETTES } from './epub-styles'
import { EpubEngine } from './epub-engine'
import { PdfEngine } from './pdf-engine'
import { HighlightPopover } from './HighlightPopover'
import { AppearancePanel } from './AppearancePanel'
import { Sidebar, type SidebarTab } from './Sidebar'
import type { Engine, EngineEvents, Rect, Relocation, SelectionInfo, TocItem } from './engine'

type PopState =
  | { kind: 'selection'; sel: SelectionInfo; editing: boolean }
  | { kind: 'highlight'; id: string; rect: Rect; editing: boolean }

const POSITION_SAVE_MS = 800
const now = (): string => new Date().toISOString()
const errorText = (e: unknown): string => (e instanceof Error ? e.message : String(e))

export function Reader(): ReactNode {
  const fileId = useStore((s) => s.reading?.fileId)
  const book = useStore((s) => s.books.find((b) => b.epub?.id === fileId || b.pdf?.id === fileId))
  const file = book && [book.epub, book.pdf].find((f) => f?.id === fileId)
  if (!book || !file) return null
  // A new key per file: switching between a book's EPUB and PDF builds a fresh engine.
  return <ReaderView key={file.id} book={book} file={file} />
}

function ReaderView({ book, file }: { book: Book; file: FileRecord }): ReactNode {
  const settings = useStore((s) => s.settings.reader)
  const sidebarOpen = useStore((s) => s.sidebarOpen)
  const stageRef = useRef<HTMLDivElement>(null)
  const engineRef = useRef<Engine | null>(null)
  const stateRef = useRef<FileState | null>(null)
  const saveTimer = useRef(0)
  const lastColor = useRef<HighlightColor>('yellow')
  const [state, setState] = useState<FileState | null>(null)
  const [loc, setLoc] = useState<Relocation | null>(null)
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [error, setError] = useState('')
  const [toc, setToc] = useState<TocItem[]>([])
  const [ticks, setTicks] = useState<number[]>([])
  const [pop, setPop] = useState<PopState | null>(null)
  const [appearance, setAppearance] = useState<Anchor | null>(null)
  const [scrub, setScrub] = useState<number | null>(null)
  const [tab, setTab] = useState<SidebarTab>('contents')
  const [zoom, setZoom] = useState(1)
  // EPUBs have no printed pages of their own; with the same book's PDF in the library, passages are
  // looked up in its page text instead.
  const locatorRef = useRef<PageLocator | null>(null)
  const [hasLocator, setHasLocator] = useState(false)
  const pageFor = (text: string | undefined, fraction: number): string | undefined =>
    text ? locatorRef.current?.locate(text, fraction)?.label : undefined

  const persist = useCallback((s: FileState) => {
    void window.octavo.saveState(s)
    useStore.getState().noteState(s)
  }, [])

  /** Annotation edits: applied at once and saved at once. */
  const update = useCallback(
    (fn: (s: FileState) => FileState) => {
      const cur = stateRef.current
      if (!cur) return
      const next = fn(cur)
      stateRef.current = next
      setState(next)
      window.clearTimeout(saveTimer.current)
      persist(next)
    },
    [persist]
  )

  // ---- engine lifecycle ------------------------------------------------------------------------

  const keyRef = useRef<(e: KeyboardEvent) => void>(() => undefined)

  useEffect(() => {
    const host = stageRef.current!
    let cancelled = false

    const notePosition = (r: Relocation): void => {
      const cur = stateRef.current
      if (!cur) return
      const finished = cur.finishedAt ?? (r.atEnd && r.fraction > 0.9 ? now() : null)
      stateRef.current = { ...cur, finishedAt: finished, position: { at: r.at, fraction: r.fraction, label: r.chapter, updatedAt: now() } }
      window.clearTimeout(saveTimer.current)
      saveTimer.current = window.setTimeout(() => stateRef.current && persist(stateRef.current), POSITION_SAVE_MS)
    }

    const events: EngineEvents = {
      onRelocate: (r) => {
        if (cancelled || !Number.isFinite(r.fraction)) return
        setLoc(r)
        notePosition(r)
      },
      onSelection: (sel) => {
        if (cancelled) return
        setPop((p) => (sel ? { kind: 'selection', sel, editing: false } : p?.kind === 'selection' && !p.editing ? null : p))
      },
      onHighlightClick: (id, rect) => !cancelled && setPop({ kind: 'highlight', id, rect, editing: false }),
      onKey: (e) => keyRef.current(e),
      onPointerDown: () => setAppearance(null),
      onExternalLink: (href) => void window.octavo.openExternal(href)
    }

    const engine: Engine = file.format === 'epub' ? new EpubEngine(host, events) : new PdfEngine(host, events)
    engineRef.current = engine
    setStatus('loading')

    void (async () => {
      const [blob, stored] = await Promise.all([fetchBookFile(file), window.octavo.getState(file.id)])
      if (cancelled) return
      const opened: FileState = { ...stored, title: stored.title || book.title, lastOpenedAt: now() }
      stateRef.current = opened
      setState(opened)
      persist(opened)
      await engine.open(blob, opened, useStore.getState().settings.reader)
      if (cancelled) return
      setToc(engine.toc)
      setTicks(engine.ticks)
      setZoom(engine.zoom ?? 1)
      setStatus('ready')
    })().catch((e) => {
      if (cancelled) return
      setError(errorText(e))
      setStatus('error')
    })

    return () => {
      cancelled = true
      window.clearTimeout(saveTimer.current)
      if (stateRef.current) persist(stateRef.current)
      engine.destroy()
      engineRef.current = null
    }
    // The engine belongs to this file; the book object changes identity on every library update.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file.id])

  useEffect(() => {
    if (status === 'ready') engineRef.current?.applySettings(settings)
  }, [settings, status])

  const pairedPdf = file.format === 'epub' ? book.pdf : null
  useEffect(() => {
    if (!pairedPdf) return
    let cancelled = false
    void loadPageIndex(pairedPdf).then((index) => {
      if (cancelled || !index) return
      locatorRef.current = new PageLocator(index)
      setHasLocator(true)
    })
    return () => {
      cancelled = true
    }
    // The page index belongs to the PDF file, whatever object currently describes it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pairedPdf?.id])

  // Highlights and bookmarks made before their page was known get it once it is.
  const backfilled = useRef(false)
  useEffect(() => {
    const engine = engineRef.current
    const cur = stateRef.current
    if (status !== 'ready' || !engine || !cur || backfilled.current) return
    if (file.format === 'epub' && !hasLocator) return
    backfilled.current = true
    const pageOf = (at: Locator, text: string, fraction: number): string | undefined =>
      'page' in at ? engine.pageLabel?.(at.page) : pageFor(text, fraction)
    let changed = false
    const highlights = cur.highlights.map((h) => {
      if (h.page) return h
      const page = pageOf(h.at, h.text, h.fraction)
      if (!page) return h
      changed = true
      return { ...h, page }
    })
    const bookmarks = cur.bookmarks.map((b) => {
      if (b.page) return b
      const page = pageOf(b.at, b.excerpt, b.fraction)
      if (!page) return b
      changed = true
      return { ...b, page }
    })
    if (changed) update((s) => ({ ...s, highlights, bookmarks }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, hasLocator])

  useEffect(() => {
    const p = PALETTES[settings.theme]
    window.octavo.setTitleBarTheme({ color: p.bg, symbolColor: p.fg }).catch(() => undefined)
  }, [settings.theme])
  useEffect(() => restoreTitleBar, [])

  const highlights = state?.highlights
  useEffect(() => {
    if (status === 'ready' && highlights) engineRef.current?.setHighlights(highlights)
  }, [highlights, status])

  // ---- actions -------------------------------------------------------------------------------

  const setReader = (patch: Partial<ReaderSettings>): void =>
    useStore.getState().updateSettings((s) => ({ ...s, reader: { ...s.reader, ...patch } }))

  const goTo = (target: string | number | Locator): void => {
    setPop(null)
    void engineRef.current?.goTo(target)
  }

  const toggleBookmark = useCallback(() => {
    const engine = engineRef.current
    const cur = stateRef.current
    if (!engine || !cur) return
    const here = new Set(engine.bookmarksHere(cur.bookmarks).map((b) => b.id))
    if (here.size) {
      update((s) => ({ ...s, bookmarks: s.bookmarks.filter((b) => !here.has(b.id)) }))
      useStore.getState().showToast('Bookmark removed')
    } else {
      const b = engine.bookmarkHere()
      if (!b) return
      const page = b.page ?? pageFor(b.excerpt, b.fraction)
      update((s) => ({ ...s, bookmarks: [...s.bookmarks, { ...b, page, id: uid(), createdAt: now() }] }))
      useStore.getState().showToast('Page bookmarked')
    }
  }, [update])

  useEffect(() => {
    const onToggle = (): void => toggleBookmark()
    readerCommands.addEventListener('toggle-bookmark', onToggle)
    return () => readerCommands.removeEventListener('toggle-bookmark', onToggle)
  }, [toggleBookmark])

  const addHighlight = (sel: SelectionInfo, color: HighlightColor, editing: boolean): void => {
    const h: Highlight = {
      id: uid(),
      at: sel.at,
      fraction: sel.fraction,
      label: sel.label,
      page: sel.page ?? pageFor(sel.lead ?? sel.text, sel.fraction),
      text: sel.text,
      note: '',
      color,
      createdAt: now(),
      updatedAt: now()
    }
    lastColor.current = color
    update((s) => ({ ...s, highlights: [...s.highlights, h] }))
    engineRef.current?.clearSelection()
    setPop({ kind: 'highlight', id: h.id, rect: sel.rect, editing })
  }

  const editHighlight = (id: string, patch: Partial<Highlight>): void =>
    update((s) => ({ ...s, highlights: s.highlights.map((h) => (h.id === id ? { ...h, ...patch, updatedAt: now() } : h)) }))

  const deleteHighlight = (id: string): void => update((s) => ({ ...s, highlights: s.highlights.filter((h) => h.id !== id) }))

  const copy = (text: string): void => {
    void navigator.clipboard.writeText(text)
    useStore.getState().showToast('Copied to the clipboard')
  }

  // ---- keyboard ------------------------------------------------------------------------------

  keyRef.current = (e: KeyboardEvent): void => {
    const t = e.target as HTMLElement | null
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return
    if (e.ctrlKey || e.metaKey || e.altKey) return
    const engine = engineRef.current
    if (!engine) return
    switch (e.key) {
      case 'ArrowRight':
      case 'PageDown':
        engine.next()
        break
      case 'ArrowLeft':
      case 'PageUp':
        engine.prev()
        break
      case ' ':
        if (e.shiftKey) engine.prev()
        else engine.next()
        break
      case 'Escape':
        if (pop) setPop(null)
        else if (appearance) setAppearance(null)
        else useStore.getState().closeReader()
        break
      default:
        return
    }
    e.preventDefault()
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => keyRef.current(e)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // ---- render --------------------------------------------------------------------------------

  const currentPage = loc?.page ?? (hasLocator && loc ? pageFor(loc.lead, loc.fraction) : undefined)

  const engine = engineRef.current
  const bookmarked = !!(engine && state && loc && engine.bookmarksHere(state.bookmarks).length > 0)
  const fraction = scrub ?? loc?.fraction ?? 0
  const popHighlight = pop?.kind === 'highlight' ? (state?.highlights.find((h) => h.id === pop.id) ?? null) : null
  const commitScrub = (): void => {
    if (scrub === null) return
    void engineRef.current?.goToFraction(scrub)
    setScrub(null)
  }

  return (
    <div className="reader" data-reader-theme={settings.theme}>
      {sidebarOpen && (
        <Sidebar
          book={book}
          state={state}
          toc={toc}
          currentId={loc?.chapterId ?? null}
          tab={tab}
          onTab={setTab}
          onGo={goTo}
          onDeleteBookmark={(id) => update((s) => ({ ...s, bookmarks: s.bookmarks.filter((b) => b.id !== id) }))}
          onDeleteHighlight={deleteHighlight}
          onSaveNote={(id, note) => editHighlight(id, { note })}
          onExport={() => void useStore.getState().exportBook(book)}
        />
      )}

      <div className="reader__main">
        <header className="titlebar">
          <button className="icon-btn" title="Back to the library (Esc)" onClick={() => useStore.getState().closeReader()}>
            <ArrowLeft size={17} />
          </button>
          <button
            className="icon-btn"
            title="Contents, bookmarks and highlights (Ctrl+\)"
            aria-pressed={sidebarOpen}
            onClick={() => useStore.getState().toggleSidebar()}
          >
            <PanelLeft size={16} />
          </button>
          <div className="titlebar__title">
            <strong>{book.title}</strong>
            {loc?.chapter && <span>{loc.chapter}</span>}
          </div>
          <div className="titlebar__spacer" />
          <div className="titlebar__group">
            {book.epub && book.pdf && (
              <div className="seg" role="group" aria-label="Format" style={{ marginRight: 6 }}>
                <button aria-pressed={file.format === 'epub'} onClick={() => useStore.getState().openBook(book, 'epub')}>
                  EPUB
                </button>
                <button aria-pressed={file.format === 'pdf'} onClick={() => useStore.getState().openBook(book, 'pdf')}>
                  PDF
                </button>
              </div>
            )}
            <button
              className="icon-btn"
              title={bookmarked ? 'Remove bookmark (Ctrl+B)' : 'Bookmark this page (Ctrl+B)'}
              aria-pressed={bookmarked}
              onClick={toggleBookmark}
              disabled={status !== 'ready'}
            >
              {bookmarked ? <BookmarkCheck size={16} /> : <BookmarkIcon size={16} />}
            </button>
            <button
              className="icon-btn"
              title="Appearance"
              aria-pressed={!!appearance}
              onClick={(e) => setAppearance(appearance ? null : rectOf(e.currentTarget))}
            >
              <Type size={16} />
            </button>
          </div>
        </header>

        <div className="reader__stage" ref={stageRef}>
          {file.format === 'epub' && settings.flow === 'paginated' && status === 'ready' && (
            <>
              <button className="turn turn--prev" aria-label="Previous page" onClick={() => engineRef.current?.prev()}>
                <ChevronLeft size={22} />
              </button>
              <button className="turn turn--next" aria-label="Next page" onClick={() => engineRef.current?.next()}>
                <ChevronRight size={22} />
              </button>
            </>
          )}
          {status === 'loading' && <div className="reader__loading">Opening…</div>}
          {status === 'error' && (
            <div className="reader__error">
              <div>
                <strong>This book could not be opened.</strong>
                {error}
              </div>
            </div>
          )}
        </div>

        <footer className="reader__footer">
          <span className="chapter">{loc?.chapter || ' '}</span>
          <div className="scrubber">
            <input
              type="range"
              min={0}
              max={1}
              step={0.001}
              value={fraction}
              style={{ ['--fill' as string]: `${fraction * 100}%` }}
              aria-label="Position in book"
              disabled={status !== 'ready'}
              onChange={(e) => setScrub(Number(e.target.value))}
              onPointerUp={commitScrub}
              onKeyUp={commitScrub}
            />
            <div className="scrubber__ticks">
              {ticks.map((t) => (
                <i key={t} style={{ left: `${t * 100}%` }} />
              ))}
            </div>
          </div>
          <span className="where" title={currentPage && file.format === 'epub' ? 'Page in the print edition, from the PDF' : undefined}>
            {currentPage ? `Page ${currentPage} · ` : loc?.where ? `${loc.where} · ` : ''}
            {percent(fraction)}
          </span>
        </footer>
      </div>

      {pop && (
        <HighlightPopover
          rect={pop.kind === 'selection' ? pop.sel.rect : pop.rect}
          highlight={popHighlight}
          editing={pop.editing}
          onClose={() => {
            if (pop.kind === 'selection') engineRef.current?.clearSelection()
            setPop(null)
          }}
          onColor={(color) => {
            if (pop.kind === 'selection') addHighlight(pop.sel, color, false)
            else editHighlight(pop.id, { color })
          }}
          onStartNote={() => {
            if (pop.kind === 'selection') addHighlight(pop.sel, lastColor.current, true)
            else setPop({ ...pop, editing: true })
          }}
          onSaveNote={(note) => {
            if (pop.kind === 'highlight') editHighlight(pop.id, { note: note.trim() })
            setPop(null)
          }}
          onCopy={() => {
            copy(pop.kind === 'selection' ? pop.sel.text : (popHighlight?.text ?? ''))
            if (pop.kind === 'selection') engineRef.current?.clearSelection()
            setPop(null)
          }}
          onDelete={() => {
            if (pop.kind === 'highlight') deleteHighlight(pop.id)
            setPop(null)
          }}
        />
      )}

      {appearance && (
        <AppearancePanel
          anchor={appearance}
          format={file.format}
          settings={settings}
          zoom={zoom}
          onChange={setReader}
          onZoom={
            engine?.zoomBy
              ? (f) => {
                  engine.zoomBy!(f)
                  setZoom(engine.zoom ?? 1)
                }
              : undefined
          }
          onClose={() => setAppearance(null)}
        />
      )}
    </div>
  )
}
