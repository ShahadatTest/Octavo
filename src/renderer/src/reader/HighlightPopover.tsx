import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Copy, StickyNote, Trash2 } from 'lucide-react'
import { HIGHLIGHT_COLORS, type Highlight, type HighlightColor } from '@shared/types'
import { Popover } from '../components/Popover'
import { HIGHLIGHT_HEX, type Rect } from './engine'

interface Props {
  rect: Rect
  /** The highlight being edited, or null while the text is only selected. */
  highlight: Highlight | null
  editing: boolean
  onColor(color: HighlightColor): void
  onStartNote(): void
  onSaveNote(note: string): void
  onCopy(): void
  onDelete(): void
  onClose(): void
}

/** Colours, note and copy for a selection; recolour, note and delete for an existing highlight. */
export function HighlightPopover(props: Props): ReactNode {
  const { rect, highlight, editing } = props
  const [note, setNote] = useState(highlight?.note ?? '')
  const areaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    setNote(highlight?.note ?? '')
  }, [highlight?.id, highlight?.note])

  useEffect(() => {
    if (editing) areaRef.current?.focus()
  }, [editing])

  return (
    <Popover anchor={rect} onClose={props.onClose} className="hl-pop" placement="above" align="center">
      <div className="hl-pop__row">
        {HIGHLIGHT_COLORS.map((c) => (
          <button
            key={c}
            className="swatch"
            title={c[0].toUpperCase() + c.slice(1)}
            aria-pressed={highlight?.color === c}
            style={{ ['--swatch' as string]: HIGHLIGHT_HEX[c] }}
            onClick={() => props.onColor(c)}
          >
            <i />
          </button>
        ))}
        <span className="hl-pop__sep" />
        <button className="icon-btn icon-btn--sm" title={highlight?.note ? 'Edit note' : 'Add note'} onClick={props.onStartNote}>
          <StickyNote size={15} />
        </button>
        <button className="icon-btn icon-btn--sm" title="Copy text" onClick={props.onCopy}>
          <Copy size={15} />
        </button>
        {highlight && (
          <button className="icon-btn icon-btn--sm" title="Delete highlight" onClick={props.onDelete}>
            <Trash2 size={15} />
          </button>
        )}
      </div>
      {editing && (
        <>
          <textarea
            ref={areaRef}
            value={note}
            placeholder="Write a note…"
            onChange={(e) => setNote(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                e.preventDefault()
                props.onSaveNote(note)
              }
            }}
          />
          <div className="hl-pop__foot">
            <span className="muted" style={{ flex: 1, fontSize: 11.5, alignSelf: 'center' }}>
              Ctrl+Enter to save
            </span>
            <button className="btn btn--ghost" onClick={props.onClose}>
              Cancel
            </button>
            <button className="btn btn--primary" onClick={() => props.onSaveNote(note)}>
              Save note
            </button>
          </div>
        </>
      )}
    </Popover>
  )
}
