import type { ReactNode } from 'react'
import { FolderOpen, RefreshCw, X } from 'lucide-react'
import type { Settings } from '@shared/types'
import { useStore } from '../store'

const SHORTCUTS: Array<[string, string]> = [
  ['← →  PgUp PgDn  Space', 'Turn pages'],
  ['Ctrl+B', 'Bookmark this page'],
  ['Ctrl+\\', 'Contents, bookmarks and highlights'],
  ['Esc', 'Back to the library'],
  ['Ctrl+O', 'Import books'],
  ['/  or  Ctrl+F', 'Search the library'],
  ['Ctrl+R', 'Rescan the library folder']
]

export function SettingsPanel(): ReactNode {
  const open = useStore((s) => s.settingsOpen)
  const settings = useStore((s) => s.settings)
  const info = useStore((s) => s.info)
  const updateSettings = useStore((s) => s.updateSettings)
  if (!open) return null

  const close = (): void => useStore.getState().openSettings(false)
  const setObsidian = (patch: Partial<Settings['obsidian']>): void =>
    updateSettings((s) => ({ ...s, obsidian: { ...s.obsidian, ...patch } }))

  return (
    <>
      <div className="scrim" onClick={close} />
      <div
        className="sheet"
        role="dialog"
        aria-label="Settings"
        onKeyDown={(e) => {
          if (e.key === 'Escape') close()
        }}
      >
        <div className="sheet__head">
          <h2>Settings</h2>
          <button className="icon-btn" aria-label="Close" onClick={close}>
            <X size={16} />
          </button>
        </div>
        <div className="sheet__body">
          <section className="sheet__section">
            <h3>Appearance</h3>
            <div className="setting">
              <div>
                <div className="setting__label">App theme</div>
                <div className="setting__hint">The reading page has its own paper, sepia and night themes.</div>
              </div>
              <div className="seg">
                {(['system', 'light', 'dark'] as const).map((t) => (
                  <button key={t} aria-pressed={settings.appTheme === t} onClick={() => updateSettings((s) => ({ ...s, appTheme: t }))}>
                    {t[0].toUpperCase() + t.slice(1)}
                  </button>
                ))}
              </div>
            </div>
          </section>

          <section className="sheet__section">
            <h3>Obsidian</h3>
            <div className="setting setting--stack">
              <div>
                <div className="setting__label">Vault folder</div>
                <div className="setting__hint">Highlights export as one Markdown note per book.</div>
              </div>
              <div className="setting__path">
                <input className="field" value={settings.obsidian.vault} placeholder="Not set" readOnly />
                <button
                  className="btn"
                  onClick={async () => {
                    const path = await window.octavo.pickFolder('Choose your Obsidian vault')
                    if (path) setObsidian({ vault: path })
                  }}
                >
                  Choose…
                </button>
              </div>
            </div>
            <div className="setting">
              <div>
                <div className="setting__label">Folder inside the vault</div>
                <div className="setting__hint">Created if it does not exist. Leave empty for the vault root.</div>
              </div>
              <input
                className="field"
                style={{ width: 160 }}
                value={settings.obsidian.folder}
                onChange={(e) => setObsidian({ folder: e.target.value })}
              />
            </div>
          </section>

          <section className="sheet__section">
            <h3>Library</h3>
            <div className="setting setting--stack">
              <div>
                <div className="setting__label">Library folder</div>
                <div className="setting__hint">{info?.libraryDir}</div>
              </div>
              <div className="setting__path">
                <button className="btn" onClick={() => void window.octavo.openLibraryDir()}>
                  <FolderOpen size={15} /> Open folder
                </button>
                <button className="btn" onClick={() => void useStore.getState().rescan()}>
                  <RefreshCw size={15} /> Rescan
                </button>
              </div>
              <div className="setting__hint">
                Files you copy into this folder appear after a rescan. Highlights and reading positions live in its
                hidden .octavo folder, one file per book.
              </div>
            </div>
          </section>

          <section className="sheet__section">
            <h3>Keyboard</h3>
            {SHORTCUTS.map(([keys, what]) => (
              <div className="setting" key={keys} style={{ padding: '4px 0' }}>
                <span>{what}</span>
                <span className="muted" style={{ fontSize: 12.5 }}>
                  {keys}
                </span>
              </div>
            ))}
          </section>

          <section className="sheet__section">
            <h3>About</h3>
            <div className="setting__hint">
              Octavo {info?.version}. EPUB rendering by foliate-js (MIT), PDF rendering by pdf.js (Apache 2.0).
            </div>
          </section>
        </div>
      </div>
    </>
  )
}
