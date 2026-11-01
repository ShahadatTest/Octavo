import { app, BrowserWindow, dialog, ipcMain, Menu, nativeTheme, net, protocol, session, shell } from 'electron'
import type { MenuItemConstructorOptions } from 'electron'
import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { isFileId, Library } from './library'
import { SettingsStore } from './settings'
import { exportToObsidian } from './obsidian'
import { version as appVersion } from '../../package.json'
import type { PageIndex } from '../shared/pages'
import type {
  AppInfo,
  BookDetails,
  ConfirmOptions,
  FileState,
  ImportResult,
  IndexUpdate,
  NavCommand,
  Settings,
  TitleBarTheme
} from '../shared/types'

const DARK_BG = '#111110'
const LIGHT_BG = '#f4f3ef'
const TITLEBAR_HEIGHT = 40

// Portable and test runs: keep Electron's profile and the library wherever the caller says.
if (process.env.OCTAVO_USER_DATA) app.setPath('userData', process.env.OCTAVO_USER_DATA)
const libraryDir = process.env.OCTAVO_LIBRARY_DIR || join(app.getPath('userData'), 'Library')

const library = new Library(libraryDir, { trash: (path) => shell.trashItem(path) })
const settings = new SettingsStore(app.getPath('userData'))
let win: BrowserWindow | null = null

// Book files and covers are served by id through this scheme, so the renderer never sees a path.
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'octavo-book',
    privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, corsEnabled: true }
  }
])

function send(cmd: NavCommand): void {
  win?.webContents.send('octavo:navigate', cmd)
}

function broadcastLibrary(): void {
  win?.webContents.send('library:changed', library.snapshot())
}

const iconPath = app.isPackaged
  ? undefined
  : join(app.getAppPath(), 'resources', process.platform === 'win32' ? 'icon.ico' : 'icon.png')

function registerProtocol(): void {
  protocol.handle('octavo-book', async (request) => {
    const url = new URL(request.url)
    const id = url.pathname.replace(/^\//, '')
    if (!isFileId(id)) return new Response('Not found', { status: 404 })
    if (url.hostname === 'file') {
      const path = library.resolvePath(id)
      if (!path) return new Response('Not found', { status: 404 })
      return net.fetch(pathToFileURL(path).toString())
    }
    if (url.hostname === 'cover') {
      try {
        const data = await fs.readFile(library.coverPath(id))
        return new Response(data, { headers: { 'content-type': 'image/webp', 'cache-control': 'max-age=31536000' } })
      } catch {
        return new Response('Not found', { status: 404 })
      }
    }
    return new Response('Not found', { status: 404 })
  })
}

/**
 * Books can reference remote images, fonts and stylesheets. Octavo is an offline reader, so the
 * renderer never touches the network; only the dev server is allowed through in development.
 */
function blockNetwork(): void {
  const devUrl = process.env.ELECTRON_RENDERER_URL
  const devOrigin = devUrl ? new URL(devUrl).origin : null
  session.defaultSession.webRequest.onBeforeRequest(
    { urls: ['http://*/*', 'https://*/*', 'ws://*/*', 'wss://*/*'] },
    (details, callback) => {
      const origin = (() => {
        try {
          const u = new URL(details.url)
          return `${u.protocol === 'ws:' ? 'http:' : u.protocol === 'wss:' ? 'https:' : u.protocol}//${u.host}`
        } catch {
          return ''
        }
      })()
      callback({ cancel: !devOrigin || origin !== devOrigin })
    }
  )
}

function createWindow(): void {
  const dark = nativeTheme.shouldUseDarkColors
  win = new BrowserWindow({
    width: 1360,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    show: false,
    ...(iconPath ? { icon: iconPath } : {}),
    backgroundColor: dark ? DARK_BG : LIGHT_BG,
    autoHideMenuBar: true,
    title: 'Octavo',
    ...(process.platform === 'win32'
      ? {
          titleBarStyle: 'hidden' as const,
          titleBarOverlay: {
            color: dark ? DARK_BG : LIGHT_BG,
            symbolColor: dark ? '#efeee9' : '#141413',
            height: TITLEBAR_HEIGHT
          }
        }
      : {}),
    ...(process.platform === 'darwin'
      ? { titleBarStyle: 'hiddenInset' as const, trafficLightPosition: { x: 14, y: 12 } }
      : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false
    }
  })

  win.once('ready-to-show', () => win?.show())
  win.on('closed', () => {
    win = null
  })

  win.webContents.on('context-menu', (_event, params) => {
    const items: MenuItemConstructorOptions[] = []
    if (params.isEditable) {
      items.push(
        { role: 'cut', enabled: params.editFlags.canCut },
        { role: 'copy', enabled: params.editFlags.canCopy },
        { role: 'paste', enabled: params.editFlags.canPaste },
        { type: 'separator' },
        { role: 'selectAll', enabled: params.editFlags.canSelectAll }
      )
    } else if (params.selectionText.trim()) {
      items.push({ role: 'copy' })
    }
    if (items.length === 0 || !win) return
    Menu.buildFromTemplate(items).popup({ window: win })
  })

  // Links in books open in the system browser, never inside the app.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })
  win.webContents.on('will-navigate', (event, url) => {
    const current = win?.webContents.getURL() ?? ''
    if (url !== current) {
      event.preventDefault()
      if (/^https?:/i.test(url)) void shell.openExternal(url)
    }
  })

  const devUrl = process.env.ELECTRON_RENDERER_URL
  if (devUrl) void win.loadURL(devUrl)
  else void win.loadFile(join(__dirname, '../renderer/index.html'))
}

function buildMenu(): void {
  const mac = process.platform === 'darwin'
  const template: MenuItemConstructorOptions[] = [
    ...(mac ? [{ role: 'appMenu' as const }] : []),
    {
      label: 'File',
      submenu: [
        { label: 'Import Books…', accelerator: 'CmdOrCtrl+O', click: () => send('import') },
        { label: 'Rescan Library', accelerator: 'CmdOrCtrl+R', click: () => send('rescan') },
        { type: 'separator' },
        { label: 'Open Library Folder', click: () => void shell.openPath(library.root) },
        { type: 'separator' },
        mac ? { role: 'close' } : { role: 'quit' }
      ]
    },
    { role: 'editMenu' },
    {
      label: 'View',
      submenu: [
        { label: 'Gallery', accelerator: 'CmdOrCtrl+1', click: () => send('gallery') },
        { label: 'Toggle Sidebar', accelerator: 'CmdOrCtrl+\\', click: () => send('toggle-sidebar') },
        { label: 'Toggle Bookmark', accelerator: 'CmdOrCtrl+B', click: () => send('toggle-bookmark') },
        { label: 'Settings', accelerator: 'CmdOrCtrl+,', click: () => send('settings') },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
        { role: 'toggleDevTools' }
      ]
    },
    { role: 'windowMenu' }
  ]
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

async function importAndBroadcast(paths: string[]): Promise<ImportResult> {
  const result = await library.importPaths(paths)
  broadcastLibrary()
  return result
}

function registerIpc(): void {
  ipcMain.handle('app:info', (): AppInfo => ({ libraryDir: library.root, version: appVersion, platform: process.platform }))
  ipcMain.handle('library:get', () => library.snapshot())
  ipcMain.handle('library:rescan', async () => {
    await library.scan()
    return library.snapshot()
  })
  ipcMain.handle('library:import', (_e, paths: unknown) =>
    importAndBroadcast(Array.isArray(paths) ? paths.filter((p): p is string => typeof p === 'string') : [])
  )
  ipcMain.handle('library:importDialog', async () => {
    if (!win) return null
    const result = await dialog.showOpenDialog(win, {
      title: 'Import books',
      buttonLabel: 'Import',
      properties: ['openFile', 'multiSelections'],
      filters: [
        { name: 'Books and archives', extensions: ['epub', 'pdf', 'zip'] },
        { name: 'All files', extensions: ['*'] }
      ]
    })
    if (result.canceled || result.filePaths.length === 0) return null
    return importAndBroadcast(result.filePaths)
  })
  ipcMain.handle('library:saveIndex', async (_e, update: IndexUpdate) => {
    if (!isFileId(update?.fileId)) return
    await library.saveIndex(update)
    broadcastLibrary()
  })
  ipcMain.handle('library:setDetails', async (_e, ids: unknown, details: BookDetails | null) => {
    await library.setDetails(Array.isArray(ids) ? ids.filter(isFileId) : [], details && typeof details === 'object' ? details : null)
    broadcastLibrary()
  })
  ipcMain.handle('pages:get', (_e, id: unknown) => (isFileId(id) ? library.getPageIndex(id) : null))
  ipcMain.handle('pages:save', async (_e, id: unknown, index: PageIndex) => {
    if (isFileId(id)) await library.savePageIndex(id, index)
  })
  ipcMain.handle('library:remove', async (_e, ids: unknown) => {
    const valid = Array.isArray(ids) ? ids.filter(isFileId) : []
    await library.removeFiles(valid)
    broadcastLibrary()
  })
  ipcMain.handle('library:reveal', (_e, id: unknown) => {
    const path = isFileId(id) ? library.resolvePath(id) : null
    if (path) shell.showItemInFolder(path)
  })
  ipcMain.handle('state:get', (_e, id: string) => library.getState(id))
  ipcMain.handle('state:save', (_e, state: FileState) => library.saveState(state))
  ipcMain.handle('export:obsidian', (_e, ids: unknown) =>
    exportToObsidian(library, Array.isArray(ids) ? ids.filter(isFileId) : [], settings.get().obsidian)
  )
  ipcMain.handle('settings:get', () => settings.get())
  ipcMain.handle('settings:save', (_e, next: Settings) => settings.save(next))
  ipcMain.handle('app:pickFolder', async (_e, title: string) => {
    if (!win) return null
    const result = await dialog.showOpenDialog(win, { title, properties: ['openDirectory', 'createDirectory'] })
    return result.canceled ? null : (result.filePaths[0] ?? null)
  })
  ipcMain.handle('app:openLibraryDir', async () => {
    await shell.openPath(library.root)
  })
  ipcMain.handle('app:openExternal', async (_e, url: string) => {
    if (typeof url === 'string' && /^(https?|mailto):/i.test(url)) await shell.openExternal(url)
  })
  ipcMain.handle('app:titleBar', (_e, theme: TitleBarTheme) => {
    if (process.platform === 'win32' && win) {
      win.setTitleBarOverlay({ color: theme.color, symbolColor: theme.symbolColor, height: TITLEBAR_HEIGHT })
    }
  })
  ipcMain.handle('app:confirm', async (_e, opts: ConfirmOptions) => {
    if (!win) return false
    const result = await dialog.showMessageBox(win, {
      type: 'question',
      buttons: ['Cancel', opts.confirmLabel ?? 'OK'],
      defaultId: 1,
      cancelId: 0,
      noLink: true,
      message: opts.message,
      detail: opts.detail
    })
    return result.response === 1
  })
}

void app.whenReady().then(async () => {
  await settings.init()
  await library.init()
  registerProtocol()
  blockNetwork()
  registerIpc()
  buildMenu()
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
