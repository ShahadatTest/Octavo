import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Plus, X } from 'lucide-react'
import { bookFiles, titleFromPath } from '@shared/books'
import type { Book } from '@shared/types'
import { useStore } from '../store'
import { authorsLine } from '../lib/format'

/** What the book's own files say, before any edit: EPUB first, then PDF, then the file name. */
function fileDetails(book: Book): { title: string; authors: string[] } {
  const first = (book.epub ?? book.pdf)!
  const title = book.epub?.meta?.title || book.pdf?.meta?.title || titleFromPath(first.path)
  const authors = book.epub?.meta?.authors.length ? book.epub.meta.authors : (book.pdf?.meta?.authors ?? [])
  return { title, authors }
}

/**
 * Edits a book's title and authors. The change is stored in Octavo's catalog for every file of the
 * book (EPUB and PDF alike); the book files themselves are never modified.
 */
export function BookDetailsDialog(): ReactNode {
  const book = useStore((s) => s.editingDetails)
  if (!book) return null
  return <DetailsForm key={book.id} book={book} />
}

function DetailsForm({ book }: { book: Book }): ReactNode {
  const close = (): void => useStore.getState().editDetails(null)
  const original = fileDetails(book)
  const edited = !!(book.epub?.custom ?? book.pdf?.custom)
  const [title, setTitle] = useState(book.title)
  const [authors, setAuthors] = useState<string[]>(book.authors.length ? book.authors : [''])
  const [saving, setSaving] = useState(false)
  const titleRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    titleRef.current?.select()
  }, [])

  const ids = bookFiles(book).map((f) => f.id)
  const cleanAuthors = authors.map((a) => a.trim()).filter(Boolean)
  const canSave = title.trim().length > 0 && !saving

  const save = async (): Promise<void> => {
    if (!canSave) return
    setSaving(true)
    try {
      await window.octavo.setBookDetails(ids, { title: title.trim(), authors: cleanAuthors })
      useStore.getState().showToast(`Saved “${title.trim()}”`)
      close()
    } finally {
      setSaving(false)
    }
  }

  const reset = async (): Promise<void> => {
    setSaving(true)
    try {
      await window.octavo.setBookDetails(ids, null)
      useStore.getState().showToast('Back to the details in the file')
      close()
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <div className="scrim" onClick={close} />
      <div
        className="sheet details"
        role="dialog"
        aria-label="Edit title and author"
        onKeyDown={(e) => {
          if (e.key === 'Escape') close()
        }}
      >
        <div className="sheet__head">
          <h2>Edit title and author</h2>
          <button className="icon-btn" aria-label="Close" onClick={close}>
            <X size={16} />
          </button>
        </div>
        <form
          className="sheet__body"
          onSubmit={(e) => {
            e.preventDefault()
            void save()
          }}
        >
          <label className="details__field">
            <span>Title</span>
            <input ref={titleRef} className="field" value={title} onChange={(e) => setTitle(e.target.value)} />
          </label>

          <div className="details__field">
            <span>Authors</span>
            {authors.map((a, i) => (
              <div className="details__author" key={i}>
                <input
                  className="field"
                  value={a}
                  placeholder="Name"
                  aria-label={`Author ${i + 1}`}
                  onChange={(e) => setAuthors(authors.map((x, j) => (j === i ? e.target.value : x)))}
                />
                <button
                  type="button"
                  className="icon-btn icon-btn--sm"
                  title="Remove author"
                  onClick={() => setAuthors(authors.length > 1 ? authors.filter((_, j) => j !== i) : [''])}
                >
                  <X size={14} />
                </button>
              </div>
            ))}
            <button type="button" className="btn btn--ghost details__add" onClick={() => setAuthors([...authors, ''])}>
              <Plus size={14} /> Add author
            </button>
          </div>

          <p className="details__from">
            From the file{bookFiles(book).length > 1 ? 's' : ''}: <strong>{original.title}</strong>
            {original.authors.length ? ` by ${authorsLine(original.authors)}` : ', no author'}. The book files are not changed.
          </p>

          <div className="details__foot">
            {edited && (
              <button type="button" className="btn btn--ghost" onClick={() => void reset()} disabled={saving}>
                Use the file's details
              </button>
            )}
            <span className="titlebar__spacer" />
            <button type="button" className="btn btn--ghost" onClick={close}>
              Cancel
            </button>
            <button type="submit" className="btn btn--primary" disabled={!canSave}>
              Save
            </button>
          </div>
        </form>
      </div>
    </>
  )
}
