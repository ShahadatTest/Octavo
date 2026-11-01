import { useState, type ReactNode } from 'react'
import { Check } from 'lucide-react'
import { coverUrl, type Book } from '@shared/types'
import { bindingFor, formatsOf } from '../lib/format'

interface CoverProps {
  book: Book
  progress?: number
  finished?: boolean
  badges?: boolean
}

/** A book cover: the extracted image when there is one, otherwise a drawn cloth binding. */
export function Cover({ book, progress, finished, badges = false }: CoverProps): ReactNode {
  const [failed, setFailed] = useState(false)
  const file = [book.epub, book.pdf].find((f) => f?.id === book.coverFileId)
  const indexed = [book.epub, book.pdf].every((f) => !f || f.meta)
  const showImage = !!book.coverFileId && !failed
  const [bg, fg] = bindingFor(book.title)

  return (
    <div className={`cover ${indexed ? '' : 'cover--loading'}`}>
      {showImage ? (
        <img
          src={coverUrl(book.coverFileId!, file?.mtimeMs ?? '')}
          alt=""
          draggable={false}
          loading="lazy"
          onError={() => setFailed(true)}
        />
      ) : (
        <div className="gen-cover" style={{ ['--gen-bg' as string]: bg, ['--gen-fg' as string]: fg }}>
          <div>
            <div className="gen-cover__title">{book.title}</div>
            <div className="gen-cover__rule" />
          </div>
          <div className="gen-cover__author">{book.authors[0] ?? ''}</div>
        </div>
      )}
      {badges && (
        <div className="cover__badges">
          {formatsOf(book).map((f) => (
            <span key={f} className="badge">
              {f}
            </span>
          ))}
        </div>
      )}
      {finished ? (
        <div className="cover__done" title="Finished">
          <Check size={12} strokeWidth={3} />
        </div>
      ) : null}
      {progress !== undefined && progress > 0 && !finished ? (
        <div className="cover__progress">
          <i style={{ width: `${Math.max(2, progress * 100)}%` }} />
        </div>
      ) : null}
    </div>
  )
}
