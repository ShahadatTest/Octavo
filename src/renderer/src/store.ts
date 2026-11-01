import { create } from 'zustand'
import { activeFile, groupBooks } from '@shared/books'
import {
  DEFAULT_SETTINGS,
  type AppInfo,
  type Book,
  type BookFormat,
  type FileState,
  type ImportResult,
  type LibrarySnapshot,
  type NavCommand,
  type Settings
} from '@shared/types'
import { Indexer } from './lib/indexer'

export interface Toast {
  id: number
  message: string
  kind: 'info' | 'error'
  action?: { label: string; run: () => void }
}

export type View = 'gallery' | 'reader'

interface State {
  loaded: boolean
  info: AppInfo | null
  snapshot: LibrarySnapshot
  books: Book[]
  settings: Settings
  view: View
  reading: { bookId: string; fileId: string } | null
  query: string
  settingsOpen: boolean
  sidebarOpen: boolean
  /** The book whose title and authors are being edited. */
  editingDetails: Book | null
  toast: Toast | null
  indexing: { pending: number; done: number }
  importing: boolean

  load(): Promise<void>
  applySnapshot(snapshot: LibrarySnapshot): void
  setQuery(query: string): void
  updateSettings(fn: (s: Settings) => Settings): void
  importPaths(paths: string[]): Promise<void>
  importDialog(): Promise<void>
  rescan(): Promise<void>
  openBook(book: Book, format?: BookFormat): void
  closeReader(): void
  noteState(state: FileState): void
  removeBook(book: Book): Promise<void>
  toggleFinished(book: Book): Promise<void>
  exportBook(book: Book): Promise<void>
  showToast(message: string, kind?: Toast['kind'], action?: Toast['action']): void
  dismissToast(): void
  openSettings(open: boolean): void
  editDetails(book: Book | null): void
  toggleSidebar(open?: boolean): void
  navigate(cmd: NavCommand): void
}

/** Reader-level commands from the menu (Ctrl+B and friends), for whichever reader is mounted. */
export const readerCommands = new EventTarget()

const EMPTY: LibrarySnapshot = { root: '', files: [], states: {} }
let toastSeq = 0
let toastTimer = 0
let settingsTimer = 0

const indexer = new Indexer((pending, done) => useStore.setState({ indexing: { pending, done } }))

function describeImport(r: ImportResult): string {
  const parts: string[] = []
  parts.push(r.added === 1 ? 'Added 1 book file' : `Added ${r.added} book files`)
  if (r.duplicates) parts.push(`${r.duplicates} already in your library`)
  if (r.skipped) parts.push(`${r.skipped} skipped (not EPUB or PDF)`)
  return parts.join(' · ')
}

export const useStore = create<State>()((set, get) => ({
  loaded: false,
  info: null,
  snapshot: EMPTY,
  books: [],
  settings: DEFAULT_SETTINGS,
  view: 'gallery',
  reading: null,
  query: '',
  settingsOpen: false,
  sidebarOpen: false,
  editingDetails: null,
  toast: null,
  indexing: { pending: 0, done: 0 },
  importing: false,

  async load() {
    const [info, snapshot, settings] = await Promise.all([
      window.octavo.info(),
      window.octavo.library(),
      window.octavo.getSettings()
    ])
    document.documentElement.dataset.platform = info.platform
    set({ info, settings, loaded: true })
    get().applySnapshot(snapshot)
  },

  applySnapshot(snapshot) {
    set({ snapshot, books: groupBooks(snapshot.files) })
    indexer.enqueue(snapshot.files)
    // A book whose file vanished (removed, or deleted outside Octavo) cannot stay open.
    const reading = get().reading
    if (reading && !snapshot.files.some((f) => f.id === reading.fileId)) set({ reading: null, view: 'gallery' })
  },

  setQuery(query) {
    set({ query })
  },

  updateSettings(fn) {
    const settings = fn(get().settings)
    set({ settings })
    window.clearTimeout(settingsTimer)
    settingsTimer = window.setTimeout(() => void window.octavo.saveSettings(get().settings), 300)
  },

  async importPaths(paths) {
    if (paths.length === 0) return
    set({ importing: true })
    try {
      const result = await window.octavo.importPaths(paths)
      if (result.errors.length) get().showToast(`${describeImport(result)}. ${result.errors[0]}`, 'error')
      else get().showToast(describeImport(result))
    } finally {
      set({ importing: false })
    }
  },

  async importDialog() {
    set({ importing: true })
    try {
      const result = await window.octavo.importDialog()
      if (!result) return
      if (result.errors.length) get().showToast(`${describeImport(result)}. ${result.errors[0]}`, 'error')
      else get().showToast(describeImport(result))
    } finally {
      set({ importing: false })
    }
  },

  async rescan() {
    get().applySnapshot(await window.octavo.rescan())
    get().showToast('Library rescanned')
  },

  openBook(book, format) {
    const file =
      (format === 'epub' && book.epub) || (format === 'pdf' && book.pdf) || activeFile(book, get().snapshot.states)
    set({ view: 'reader', reading: { bookId: book.id, fileId: file.id } })
  },

  closeReader() {
    set({ view: 'gallery', reading: null })
  },

  noteState(state) {
    const snapshot = get().snapshot
    set({
      snapshot: {
        ...snapshot,
        states: {
          ...snapshot.states,
          [state.fileId]: {
            fraction: state.position?.fraction ?? 0,
            lastOpenedAt: state.lastOpenedAt,
            finishedAt: state.finishedAt,
            highlights: state.highlights.length,
            bookmarks: state.bookmarks.length
          }
        }
      }
    })
  },

  async removeBook(book) {
    const files = [book.epub, book.pdf].filter((f) => !!f)
    const ok = await window.octavo.confirm({
      message: `Remove “${book.title}” from your library?`,
      detail:
        files.length > 1
          ? 'Both the EPUB and the PDF move to the Recycle Bin. Highlights stay in the library folder and come back if you import the book again.'
          : 'The file moves to the Recycle Bin. Highlights stay in the library folder and come back if you import the book again.',
      confirmLabel: 'Remove'
    })
    if (!ok) return
    await window.octavo.removeFiles(files.map((f) => f.id))
    get().showToast(`Removed “${book.title}”`)
  },

  async toggleFinished(book) {
    const file = activeFile(book, get().snapshot.states)
    const state = await window.octavo.getState(file.id)
    state.finishedAt = state.finishedAt ? null : new Date().toISOString()
    state.lastOpenedAt ??= new Date().toISOString()
    await window.octavo.saveState(state)
    get().noteState(state)
  },

  async exportBook(book) {
    if (!get().settings.obsidian.vault) {
      get().showToast('Choose your Obsidian vault first.', 'error', { label: 'Open settings', run: () => get().openSettings(true) })
      return
    }
    try {
      const ids = [book.epub, book.pdf].filter((f) => !!f).map((f) => f.id)
      const result = await window.octavo.exportObsidian(ids)
      get().showToast(`Exported ${result.highlights} highlight${result.highlights === 1 ? '' : 's'} to ${result.path}`)
    } catch (e) {
      get().showToast(e instanceof Error ? e.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '') : String(e), 'error')
    }
  },

  showToast(message, kind = 'info', action) {
    window.clearTimeout(toastTimer)
    const id = ++toastSeq
    set({ toast: { id, message, kind, action } })
    toastTimer = window.setTimeout(() => {
      if (get().toast?.id === id) set({ toast: null })
    }, kind === 'error' ? 7000 : 4000)
  },

  dismissToast() {
    set({ toast: null })
  },

  openSettings(open) {
    set({ settingsOpen: open })
  },

  editDetails(book) {
    set({ editingDetails: book })
  },

  toggleSidebar(open) {
    set({ sidebarOpen: open ?? !get().sidebarOpen })
  },

  navigate(cmd) {
    const st = get()
    switch (cmd) {
      case 'gallery':
        st.closeReader()
        break
      case 'import':
        void st.importDialog()
        break
      case 'rescan':
        void st.rescan()
        break
      case 'settings':
        st.openSettings(true)
        break
      case 'toggle-sidebar':
        if (st.view === 'reader') st.toggleSidebar()
        break
      case 'toggle-bookmark':
        if (st.view === 'reader') readerCommands.dispatchEvent(new Event('toggle-bookmark'))
        break
      case 'theme-dark':
      case 'theme-light':
      case 'theme-system':
        st.updateSettings((s) => ({ ...s, appTheme: cmd.slice(6) as Settings['appTheme'] }))
        break
      default:
        if (cmd.startsWith('open:')) {
          const book = st.books.find((b) => b.id === cmd.slice(5) || b.epub?.id === cmd.slice(5) || b.pdf?.id === cmd.slice(5))
          if (book) st.openBook(book)
        }
    }
  }
}))
