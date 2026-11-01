import { contextBridge, ipcRenderer, webUtils } from 'electron'
import type { IpcRendererEvent } from 'electron'
import type { LibrarySnapshot, NavCommand, OctavoApi } from '../shared/types'

function subscribe<T>(channel: string, cb: (payload: T) => void): () => void {
  const handler = (_event: IpcRendererEvent, payload: T): void => cb(payload)
  ipcRenderer.on(channel, handler)
  return () => {
    ipcRenderer.removeListener(channel, handler)
  }
}

const api: OctavoApi = {
  info: () => ipcRenderer.invoke('app:info'),
  library: () => ipcRenderer.invoke('library:get'),
  rescan: () => ipcRenderer.invoke('library:rescan'),
  importPaths: (paths) => ipcRenderer.invoke('library:import', paths),
  importDialog: () => ipcRenderer.invoke('library:importDialog'),
  // Dropped File objects carry no path in a sandboxed renderer; Electron resolves it here.
  pathForFile: (file) => webUtils.getPathForFile(file),
  saveIndex: (update) => ipcRenderer.invoke('library:saveIndex', update),
  removeFiles: (ids) => ipcRenderer.invoke('library:remove', ids),
  revealFile: (id) => ipcRenderer.invoke('library:reveal', id),
  getState: (id) => ipcRenderer.invoke('state:get', id),
  saveState: (state) => ipcRenderer.invoke('state:save', state),
  exportObsidian: (ids) => ipcRenderer.invoke('export:obsidian', ids),
  getSettings: () => ipcRenderer.invoke('settings:get'),
  saveSettings: (settings) => ipcRenderer.invoke('settings:save', settings),
  pickFolder: (title) => ipcRenderer.invoke('app:pickFolder', title),
  openLibraryDir: () => ipcRenderer.invoke('app:openLibraryDir'),
  openExternal: (url) => ipcRenderer.invoke('app:openExternal', url),
  confirm: (opts) => ipcRenderer.invoke('app:confirm', opts),
  setTitleBarTheme: (theme) => ipcRenderer.invoke('app:titleBar', theme),
  onNavigate: (cb) => subscribe<NavCommand>('octavo:navigate', cb),
  onLibraryChanged: (cb) => subscribe<LibrarySnapshot>('library:changed', cb)
}

contextBridge.exposeInMainWorld('octavo', api)
