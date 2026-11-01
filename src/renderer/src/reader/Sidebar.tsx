import { useState, type ReactNode } from 'react'
import { NotebookPen, StickyNote, Trash2 } from 'lucide-react'
import type { Book, Bookmark, FileState, Highlight } from '@shared/types'
import { Cover } from '../components/Cover'
import { authorsLine, percent, relativeDay } from '../lib/format'
import { HIGHLIGHT_HEX, type TocItem } from './engine'

export type SidebarTab = 'contents' | 'bookmarks' | 'highlights'

interface Props {
  book: Book
  state: FileState | null
  toc: TocItem[]
  currentId: string | null
  tab: SidebarTab
  onTab(tab: SidebarTab): void
  onGo(target: TocItem['target'] | Bookmark['at']): void
  onDeleteBookmark(id: string): void
  onDeleteHighlight(id: string): void
  onSaveNote(id: string, note: string): void
  onExport(): void
}

/** "p. 112 · Chapter 3 · today": the printed page when known, the chapter, and when it was made. */
function whereLine(item: Highlight | Bookmark): string {
  const fallback = 'page' in item.at ? `Page ${item.at.page}` : percent(item.fraction)
  return [item.page ? `p. ${item.page}` : '', item.label || (item.page ? '' : fallback), relativeDay(item.createdAt)]
    .filter(Boolean)
    .join(' · ')
}

function TocList({  items,
  depth,
  current,
  onGo
}: {
  items: TocItem[]
  depth: number
  current: string | null
  onGo(t: TocItem['target']): void
}): ReactNode {
  return (
    <>
      {items.map((item) => (
        <div key={item.id}>
          <button
            className="toc-item"
            style={{ paddingLeft: 8 + depth * 14 }}
            aria-current={current === item.id}
            onClick={() => onGo(item.target)}
          >
            {item.label}
          </button>
          {item.children.length > 0 && <TocList items={item.children} depth={depth + 1} current={current} onGo={onGo} />}
        </div>
      ))}
    </>
  )
}

function HighlightItem({ h, onGo, onDelete, onSaveNote }: { h: Highlight; onGo(): void; onDelete(): void; onSaveNote(note: string): void }): ReactNode {
  const [editing, setEditing] = useState(false)
  const [note, setNote] = useState(h.note)
  return (
    <div className="anno" style={{ ['--anno-color' as string]: HIGHLIGHT_HEX[h.color] }} onClick={onGo} data-highlight={h.id}>
      <div className="anno__text">{h.text}</div>
      {editing ? (
        <div className="hl-pop" style={{ position: 'static', boxShadow: 'none', border: 0, padding: '6px 0 0', animation: 'none', background: 'transparent' }} onClick={(e) => e.stopPropagation()}>
          <textarea
            autoFocus
            style={{ width: '100%' }}
            value={note}
            placeholder="Write a note…"
            onChange={(e) => setNote(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                onSaveNote(note)
                setEditing(false)
              } else if (e.key === 'Escape') {
                e.stopPropagation()
                setNote(h.note)
                setEditing(false)
              }
            }}
          />
          <div className="hl-pop__foot">
            <button className="btn btn--ghost" onClick={() => (setNote(h.note), setEditing(false))}>
              Cancel
            </button>
            <button className="btn btn--primary" onClick={() => (onSaveNote(note), setEditing(false))}>
              Save
            </button>
          </div>
        </div>
      ) : (
        h.note && <div className="anno__note">{h.note}</div>
      )}
      <div className="anno__meta">
        <span>
          {whereLine(h)}
        </span>
        <div className="anno__actions" onClick={(e) => e.stopPropagation()}>
          <button className="icon-btn icon-btn--sm" title={h.note ? 'Edit note' : 'Add note'} onClick={() => setEditing(true)}>
            <StickyNote size={14} />
          </button>
          <button className="icon-btn icon-btn--sm" title="Delete highlight" onClick={onDelete}>
            <Trash2 size={14} />
          </button>
        </div>
      </div>
    </div>
  )
}

export function Sidebar(props: Props): ReactNode {
  const { book, state, toc, tab } = props
  const bookmarks = [...(state?.bookmarks ?? [])].sort((a, b) => a.fraction - b.fraction)
  const highlights = [...(state?.highlights ?? [])].sort((a, b) => a.fraction - b.fraction)

  return (
    <aside className="bookside">
      <div className="bookside__book">
        <Cover book={book} />
        <div>
          <strong>{book.title}</strong>
          {book.authors.length > 0 && <span>{authorsLine(book.authors)}</span>}
        </div>
      </div>
      <div className="bookside__tabs">
        <div className="seg" role="tablist">
          <button role="tab" aria-pressed={tab === 'contents'} onClick={() => props.onTab('contents')}>
            Contents
          </button>
          <button role="tab" aria-pressed={tab === 'bookmarks'} onClick={() => props.onTab('bookmarks')}>
            Bookmarks{bookmarks.length ? ` ${bookmarks.length}` : ''}
          </button>
          <button role="tab" aria-pressed={tab === 'highlights'} onClick={() => props.onTab('highlights')}>
            Highlights{highlights.length ? ` ${highlights.length}` : ''}
          </button>
        </div>
      </div>

      <div className="bookside__list">
        {tab === 'contents' &&
          (toc.length ? (
            <TocList items={toc} depth={0} current={props.currentId} onGo={props.onGo} />
          ) : (
            <div className="bookside__empty">This book has no table of contents.</div>
          ))}

        {tab === 'bookmarks' &&
          (bookmarks.length ? (
            bookmarks.map((b) => (
              <div className="anno" key={b.id} onClick={() => props.onGo(b.at)} data-bookmark={b.id}>
                <div className="anno__text" style={{ fontSize: 13, WebkitLineClamp: 3 }}>
                  {b.excerpt || b.label || 'Bookmark'}
                </div>
                <div className="anno__meta">
                  <span>
                    {whereLine(b)}
                  </span>
                  <div className="anno__actions" onClick={(e) => e.stopPropagation()}>
                    <button className="icon-btn icon-btn--sm" title="Remove bookmark" onClick={() => props.onDeleteBookmark(b.id)}>
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              </div>
            ))
          ) : (
            <div className="bookside__empty">
              No bookmarks yet. Press <kbd>Ctrl</kbd>+<kbd>B</kbd> to bookmark the page you are on.
            </div>
          ))}

        {tab === 'highlights' &&
          (highlights.length ? (
            highlights.map((h) => (
              <HighlightItem
                key={h.id}
                h={h}
                onGo={() => props.onGo(h.at)}
                onDelete={() => props.onDeleteHighlight(h.id)}
                onSaveNote={(note) => props.onSaveNote(h.id, note)}
              />
            ))
          ) : (
            <div className="bookside__empty">No highlights yet. Select text in the book to highlight it.</div>
          ))}
      </div>

      {tab === 'highlights' && highlights.length > 0 && (
        <div className="bookside__foot">
          <button className="btn" onClick={props.onExport}>
            <NotebookPen size={15} /> Export to Obsidian
          </button>
        </div>
      )}
    </aside>
  )
}
