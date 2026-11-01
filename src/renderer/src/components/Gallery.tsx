import { memo, useMemo, useState, type CSSProperties, type ReactNode } from 'react'
import { BookOpen, Check, FileText, FolderOpen, NotebookPen, PenLine, RotateCcw, Trash2 } from 'lucide-react'
import { bookProgress, matchesFilter, matchesQuery, sortBooks, type BookProgress } from '@shared/books'
import type { Book, GalleryFilter, GallerySort } from '@shared/types'
import { useStore } from '../store'
import { authorsLine, percent, relativeDay } from '../lib/format'
import { Cover } from './Cover'
import { Logo } from './Logo'
import { Popover, pointAnchor, type Anchor } from './Popover'

const FILTERS: Array<[GalleryFilter, string]> = [
  ['all', 'All'],
  ['reading', 'Reading'],
  ['unread', 'Not started'],
  ['finished', 'Finished']
]

const SORTS: Array<[GallerySort, string]> = [
  ['recent', 'Recently read'],
  ['added', 'Recently added'],
  ['title', 'Title'],
  ['author', 'Author']
]

export function Gallery(): ReactNode {
  const books = useStore((s) => s.books)
  const states = useStore((s) => s.snapshot.states)
  const query = useStore((s) => s.query)
  const gallery = useStore((s) => s.settings.gallery)
  const indexing = useStore((s) => s.indexing)
  const updateSettings = useStore((s) => s.updateSettings)
  const [menu, setMenu] = useState<{ book: Book; anchor: Anchor } | null>(null)

  const progress = useMemo(() => new Map(books.map((b) => [b.id, bookProgress(b, states)])), [books, states])
  const visible = useMemo(() => {
    const filtered = books.filter((b) => matchesQuery(b, query) && matchesFilter(progress.get(b.id)!, gallery.filter))
    return sortBooks(filtered, gallery.sort, states)
  }, [books, query, gallery.filter, gallery.sort, states, progress])

  const resume = useMemo(
    () =>
      sortBooks(
        books.filter((b) => {
          const p = progress.get(b.id)!
          return p.lastOpenedAt && !p.finished
        }),
        'recent',
        states
      ).slice(0, 3),
    [books, progress, states]
  )

  if (books.length === 0) return <EmptyLibrary />

  const setGallery = (patch: Partial<typeof gallery>): void =>
    updateSettings((s) => ({ ...s, gallery: { ...s.gallery, ...patch } }))
  const showShelf = resume.length > 0 && !query && gallery.filter === 'all'

  return (
    <div className="gallery" style={{ ['--cover-w' as string]: `${gallery.coverSize}px` } as CSSProperties}>
      <div className="gallery__head">
        <div>
          <h1>Library</h1>
          <div className="gallery__count">
            {books.length === 1 ? '1 book' : `${books.length} books`}
            {indexing.pending > 0 && (
              <>
                {' · '}
                <span className="indexing">
                  <span className="indexing__spinner" /> Reading covers, {indexing.pending} to go
                </span>
              </>
            )}
          </div>
        </div>
        <div className="gallery__controls">
          <div className="seg" role="group" aria-label="Filter">
            {FILTERS.map(([value, label]) => (
              <button key={value} aria-pressed={gallery.filter === value} onClick={() => setGallery({ filter: value })}>
                {label}
              </button>
            ))}
          </div>
          <select
            className="field"
            aria-label="Sort"
            value={gallery.sort}
            onChange={(e) => setGallery({ sort: e.target.value as GallerySort })}
          >
            {SORTS.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
          <label className="gallery__size" title="Cover size">
            <BookOpen size={14} />
            <input
              type="range"
              min={120}
              max={240}
              step={4}
              value={gallery.coverSize}
              onChange={(e) => setGallery({ coverSize: Number(e.target.value) })}
            />
          </label>
        </div>
      </div>

      {showShelf && (
        <section className="shelf">
          <h2>Continue reading</h2>
          <div className="shelf__row">
            {resume.map((b) => (
              <ResumeCard key={b.id} book={b} progress={progress.get(b.id)!} />
            ))}
          </div>
        </section>
      )}

      {showShelf && <div className="grid-head">All books</div>}
      {visible.length === 0 ? (
        <div className="no-results">No books match{query ? ` “${query}”` : ' this filter'}.</div>
      ) : (
        <div className="grid">
          {visible.map((b, i) => (
            <BookCard
              key={b.id}
              book={b}
              progress={progress.get(b.id)!}
              index={i}
              onMenu={(anchor) => setMenu({ book: b, anchor })}
            />
          ))}
        </div>
      )}

      {menu && <BookMenu book={menu.book} anchor={menu.anchor} progress={progress.get(menu.book.id)} onClose={() => setMenu(null)} />}
    </div>
  )
}

function metaLine(p: BookProgress): string {
  if (p.finished) return 'Finished'
  const parts: string[] = []
  if (p.lastOpenedAt) parts.push(percent(p.fraction))
  if (p.highlights) parts.push(`${p.highlights} highlight${p.highlights === 1 ? '' : 's'}`)
  return parts.join(' · ') || 'Not started'
}

const BookCard = memo(function BookCard({
  book,
  progress,
  index,
  onMenu
}: {
  book: Book
  progress: BookProgress
  index: number
  onMenu(anchor: Anchor): void
}): ReactNode {
  const openBook = useStore((s) => s.openBook)
  return (
    <button
      className="card"
      style={{ animationDelay: `${Math.min(index, 24) * 18}ms` }}
      onClick={() => openBook(book)}
      onContextMenu={(e) => {
        e.preventDefault()
        onMenu(pointAnchor(e.clientX, e.clientY))
      }}
      title={book.title}
      data-book={book.id}
    >
      <Cover book={book} progress={progress.fraction} finished={progress.finished} badges />
      <div className="card__text">
        <div className="card__title">{book.title}</div>
        {book.authors.length > 0 && <div className="card__author">{authorsLine(book.authors)}</div>}
        <div className="card__meta">{metaLine(progress)}</div>
      </div>
    </button>
  )
})

function ResumeCard({ book, progress }: { book: Book; progress: BookProgress }): ReactNode {
  const openBook = useStore((s) => s.openBook)
  return (
    <button className="resume" onClick={() => openBook(book)} data-book={book.id}>
      <Cover book={book} />
      <div className="resume__body">
        <div className="resume__title">{book.title}</div>
        <div className="resume__chapter">{book.authors.length ? authorsLine(book.authors) : ' '}</div>
        <div className="resume__bar">
          <i style={{ width: `${Math.max(2, progress.fraction * 100)}%` }} />
        </div>
        <div className="resume__meta">
          <span>{percent(progress.fraction)}</span>
          <span>{relativeDay(progress.lastOpenedAt)}</span>
        </div>
      </div>
    </button>
  )
}

function BookMenu({
  book,
  anchor,
  progress,
  onClose
}: {
  book: Book
  anchor: Anchor
  progress?: BookProgress
  onClose(): void
}): ReactNode {
  const { openBook, toggleFinished, exportBook, removeBook, editDetails } = useStore.getState()
  const run = (fn: () => void): void => {
    onClose()
    fn()
  }
  const first = book.epub ?? book.pdf
  return (
    <Popover anchor={anchor} onClose={onClose}>
      <div className="menu" role="menu">
        {book.epub && (
          <button className="menu__item" onClick={() => run(() => openBook(book, 'epub'))}>
            <BookOpen size={15} /> Open EPUB
          </button>
        )}
        {book.pdf && (
          <button className="menu__item" onClick={() => run(() => openBook(book, 'pdf'))}>
            <FileText size={15} /> Open PDF
          </button>
        )}
        <div className="menu__sep" />
        <button className="menu__item" onClick={() => run(() => editDetails(book))}>
          <PenLine size={15} /> Edit title and author…
        </button>
        <button className="menu__item" onClick={() => run(() => void toggleFinished(book))}>
          {progress?.finished ? <RotateCcw size={15} /> : <Check size={15} />}
          {progress?.finished ? 'Mark as not finished' : 'Mark as finished'}
        </button>
        <button className="menu__item" disabled={!progress?.highlights} onClick={() => run(() => void exportBook(book))}>
          <NotebookPen size={15} /> Export highlights to Obsidian
        </button>
        {first && (
          <button className="menu__item" onClick={() => run(() => void window.octavo.revealFile(first.id))}>
            <FolderOpen size={15} /> Show in folder
          </button>
        )}
        <div className="menu__sep" />
        <button className="menu__item menu__item--danger" onClick={() => run(() => void removeBook(book))}>
          <Trash2 size={15} /> Remove from library
        </button>
      </div>
    </Popover>
  )
}

function EmptyLibrary(): ReactNode {
  const importDialog = useStore((s) => s.importDialog)
  return (
    <div className="gallery">
      <div className="empty">
        <div className="empty__card">
          <div className="empty__art">
            <Logo size={64} />
          </div>
          <h1>Your shelf is empty</h1>
          <p>Drop EPUB and PDF files anywhere on this window, or import them.</p>
          <div className="empty__steps">
            <strong>Bringing books over from Google Drive</strong>
            <ol>
              <li>In Drive, right-click your Books folder and choose Download.</li>
              <li>Drive packs the folder into one or more .zip files.</li>
              <li>Drop the .zip files here. Octavo unpacks the books and skips everything else.</li>
            </ol>
          </div>
          <div className="empty__actions">
            <button className="btn btn--primary" onClick={() => void importDialog()}>
              Import books…
            </button>
            <button className="btn" onClick={() => void window.octavo.openLibraryDir()}>
              <FolderOpen size={15} /> Open library folder
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
