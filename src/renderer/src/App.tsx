import { useEffect, type ReactNode } from 'react'
import { Download } from 'lucide-react'
import { useStore } from './store'
import { useFileDrop, useTheme } from './hooks'
import { TitleBar } from './components/TitleBar'
import { Gallery } from './components/Gallery'
import { SettingsPanel } from './components/SettingsPanel'
import { Toast } from './components/Toast'
import { Reader } from './reader/Reader'

export default function App(): ReactNode {
  const loaded = useStore((s) => s.loaded)
  const view = useStore((s) => s.view)
  const dropping = useFileDrop()

  useEffect(() => {
    void useStore.getState().load()
    const offNavigate = window.octavo.onNavigate((cmd) => useStore.getState().navigate(cmd))
    const offLibrary = window.octavo.onLibraryChanged((snapshot) => useStore.getState().applySnapshot(snapshot))
    return () => {
      offNavigate()
      offLibrary()
    }
  }, [])
  useTheme()

  return (
    <div className="app">
      {view !== 'reader' && <TitleBar />}
      <div className="app__body">
        {!loaded ? <div className="loading">Opening your library…</div> : view === 'reader' ? <Reader /> : <Gallery />}
      </div>
      {dropping && (
        <div className="drop">
          <div className="drop__msg">
            <Download size={30} color="var(--accent)" />
            <strong>Drop to add to your library</strong>
            <span>EPUB and PDF files, folders, or zip archives from Google Drive</span>
          </div>
        </div>
      )}
      <SettingsPanel />
      <Toast />
    </div>
  )
}
