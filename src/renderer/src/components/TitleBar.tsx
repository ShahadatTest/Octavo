import { useEffect, useRef, type ReactNode } from 'react'
import { Plus, Search, Settings } from 'lucide-react'
import { useStore } from '../store'
import { Logo } from './Logo'

/** The gallery's title bar: brand, search, import and settings. The reader draws its own. */
export function TitleBar(): ReactNode {
  const query = useStore((s) => s.query)
  const setQuery = useStore((s) => s.setQuery)
  const importing = useStore((s) => s.importing)
  const hasBooks = useStore((s) => s.books.length > 0)
  const searchRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      const target = e.target as HTMLElement | null
      const typing = !!target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')
      if (((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') || (e.key === '/' && !typing)) {
        e.preventDefault()
        searchRef.current?.focus()
        searchRef.current?.select()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <header className="titlebar">
      <div className="titlebar__brand">
        <Logo />
        <span>Octavo</span>
      </div>
      <div className="titlebar__spacer" />
      {hasBooks && (
        <div className="search">
          <Search size={14} />
          <input
            ref={searchRef}
            className="field"
            placeholder="Search title or author"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                setQuery('')
                e.currentTarget.blur()
              }
            }}
          />
          {!query && <kbd>/</kbd>}
        </div>
      )}
      <div className="titlebar__group">
        <button className="btn btn--ghost" onClick={() => void useStore.getState().importDialog()} disabled={importing}>
          <Plus size={15} /> {importing ? 'Importing…' : 'Import'}
        </button>
        <button className="icon-btn" title="Settings (Ctrl+,)" onClick={() => useStore.getState().openSettings(true)}>
          <Settings size={16} />
        </button>
      </div>
    </header>
  )
}
