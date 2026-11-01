import { useEffect, useState } from 'react'
import { useStore } from './store'

const DARK = { color: '#111110', symbolColor: '#efeee9' }
const LIGHT = { color: '#f4f3ef', symbolColor: '#141413' }

/** Window controls in the app theme; the reader repaints them in the page theme while it is open. */
export function restoreTitleBar(): void {
  window.octavo.setTitleBarTheme(document.documentElement.dataset.theme === 'dark' ? DARK : LIGHT).catch(() => undefined)
}

/** Resolves the app theme against the OS preference, stamps it on <html> and repaints the window controls. */
export function useTheme(): void {
  const theme = useStore((s) => s.settings.appTheme)
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const apply = (): void => {
      const dark = theme === 'dark' || (theme === 'system' && mq.matches)
      document.documentElement.dataset.theme = dark ? 'dark' : 'light'
      window.octavo.setTitleBarTheme(dark ? DARK : LIGHT).catch(() => undefined)
    }
    apply()
    mq.addEventListener('change', apply)
    return () => mq.removeEventListener('change', apply)
  }, [theme])
}

/**
 * Files, folders and zips dropped anywhere on the window are imported. Returns whether a drag with
 * files is over the window, for the drop overlay.
 */
export function useFileDrop(): boolean {
  const [over, setOver] = useState(false)
  useEffect(() => {
    let depth = 0
    const hasFiles = (e: DragEvent): boolean => !!e.dataTransfer && Array.from(e.dataTransfer.types).includes('Files')
    const onEnter = (e: DragEvent): void => {
      if (!hasFiles(e)) return
      e.preventDefault()
      depth++
      setOver(true)
    }
    const onOver = (e: DragEvent): void => {
      if (!hasFiles(e)) return
      e.preventDefault()
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy'
    }
    const onLeave = (e: DragEvent): void => {
      if (!hasFiles(e)) return
      depth = Math.max(0, depth - 1)
      if (depth === 0) setOver(false)
    }
    const onDrop = (e: DragEvent): void => {
      if (!hasFiles(e)) return
      e.preventDefault()
      depth = 0
      setOver(false)
      const paths = Array.from(e.dataTransfer?.files ?? [])
        .map((f) => window.octavo.pathForFile(f))
        .filter(Boolean)
      void useStore.getState().importPaths(paths)
    }
    window.addEventListener('dragenter', onEnter)
    window.addEventListener('dragover', onOver)
    window.addEventListener('dragleave', onLeave)
    window.addEventListener('drop', onDrop)
    return () => {
      window.removeEventListener('dragenter', onEnter)
      window.removeEventListener('dragover', onOver)
      window.removeEventListener('dragleave', onLeave)
      window.removeEventListener('drop', onDrop)
    }
  }, [])
  return over
}
