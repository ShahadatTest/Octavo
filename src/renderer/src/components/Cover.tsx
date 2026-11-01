import { useState, type CSSProperties, type ReactNode } from 'react'
import { Check } from 'lucide-react'
import { coverUrl, type Book } from '@shared/types'
import { bindingFor, formatsOf } from '../lib/format'

interface CoverProps {
  book: Book
  progress?: number
  finished?: boolean
  badges?: boolean
}

/** Width over height of the slot every cover sits in: close to most technical books (7 x 9.19 in). */
const SLOT = 3 / 4
/** Until the image has loaded, assume the commonest shape so the card does not jump. */
const TYPICAL = 0.76

/** The cover's box inside the slot: full width for wide covers, full height for narrow ones, never cropped. */
function frameFor(ratio: number): CSSProperties {
  return ratio >= SLOT
    ? { width: '100%', height: `${(SLOT / ratio) * 100}%` }
    : { width: `${(ratio / SLOT) * 100}%`, height: '100%' }
}

/**
 * A book cover at its own proportions, standing on the bottom-left of a 3:4 slot like a book on a
 * shelf. Books without a cover image get a drawn cloth binding that fills the slot.
 */
export function Cover({ book, progress, finished, badges = false }: CoverProps): ReactNode {
  const [failed, setFailed] = useState(false)
  const [ratio, setRatio] = useState<number | null>(null)
  const file = [book.epub, book.pdf].find((f) => f?.id === book.coverFileId)
  const indexed = [book.epub, book.pdf].every((f) => !f || f.meta)
  const showImage = !!book.coverFileId && !failed
  const [bg, fg] = bindingFor(book.title)

  return (
    <div className={`cover ${indexed ? '' : 'cover--loading'}`}>
      <div className="cover__book" style={showImage ? frameFor(ratio ?? TYPICAL) : undefined}>
        {showImage ? (
          <img
            src={coverUrl(book.coverFileId!, file?.mtimeMs ?? '')}
            alt=""
            draggable={false}
            loading="lazy"
            onLoad={(e) => {
              const img = e.currentTarget
              if (img.naturalWidth && img.naturalHeight) setRatio(img.naturalWidth / img.naturalHeight)
            }}
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
    </div>
  )
}
