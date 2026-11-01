export type BookFormat = 'epub' | 'pdf'

export interface BookMeta {
  title: string
  authors: string[]
  publisher?: string
  language?: string
  published?: string
  description?: string
  /** PDF page count. */
  pages?: number
}

/** One book file in the library, as recorded in `.octavo/catalog.json`. */
export interface FileRecord {
  /** First 20 hex characters of the file's SHA-256. */
  id: string
  /** Path relative to the library root, with forward slashes. */
  path: string
  format: BookFormat
  size: number
  mtimeMs: number
  addedAt: string
  /** Null until the renderer has extracted metadata. */
  meta: BookMeta | null
  hasCover: boolean
  indexError?: string
}

/** A gallery entry: one file, or an EPUB and a PDF of the same book. */
export interface Book {
  /** The id of the book's first file (EPUB before PDF). */
  id: string
  title: string
  authors: string[]
  epub: FileRecord | null
  pdf: FileRecord | null
  /** File whose cover the gallery shows. */
  coverFileId: string | null
  addedAt: string
}

export const HIGHLIGHT_COLORS = ['yellow', 'green', 'blue', 'pink', 'purple'] as const
export type HighlightColor = (typeof HIGHLIGHT_COLORS)[number]

/** Where something is in a book. EPUB uses a CFI; PDF uses a page and PDF user-space geometry. */
export type Locator = { cfi: string } | { page: number; y?: number; rects?: number[][] }

export interface Position {
  at: Locator
  fraction: number
  label?: string
  updatedAt: string
}

export interface Bookmark {
  id: string
  at: Locator
  fraction: number
  label: string
  excerpt: string
  createdAt: string
}

export interface Highlight {
  id: string
  at: Locator
  fraction: number
  /** Chapter title at the highlight. */
  label: string
  text: string
  note: string
  color: HighlightColor
  createdAt: string
  updatedAt: string
}

/** Reading state for one file, stored in `.octavo/annotations/<file-id>.json`. */
export interface FileState {
  version: 1
  fileId: string
  title: string
  lastOpenedAt: string | null
  finishedAt: string | null
  position: Position | null
  bookmarks: Bookmark[]
  highlights: Highlight[]
}

/** What the gallery needs from a file's state, without the annotations themselves. */
export interface StateSummary {
  fraction: number
  lastOpenedAt: string | null
  finishedAt: string | null
  highlights: number
  bookmarks: number
}

export interface LibrarySnapshot {
  root: string
  files: FileRecord[]
  states: Record<string, StateSummary>
}

export interface ImportResult {
  added: number
  duplicates: number
  /** Files that are neither EPUB nor PDF. */
  skipped: number
  errors: string[]
}

export interface IndexUpdate {
  fileId: string
  meta: BookMeta | null
  /** WebP or JPEG bytes. */
  cover: Uint8Array | null
  error?: string
}

export type ReaderTheme = 'paper' | 'sepia' | 'night'
export type ReaderFont = 'publisher' | 'serif' | 'sans'
export type PdfZoom = 'page-width' | 'page-fit' | 'auto'

export interface ReaderSettings {
  theme: ReaderTheme
  font: ReaderFont
  /** Root font size in px for EPUBs. */
  fontSize: number
  lineHeight: number
  /** Column width in px for EPUBs. */
  width: number
  flow: 'paginated' | 'scrolled'
  columns: 1 | 2
  justify: boolean
  pdfZoom: PdfZoom
  pdfNight: boolean
}

export type GallerySort = 'recent' | 'added' | 'title' | 'author'
export type GalleryFilter = 'all' | 'reading' | 'unread' | 'finished'

export interface Settings {
  appTheme: 'system' | 'light' | 'dark'
  reader: ReaderSettings
  gallery: { sort: GallerySort; filter: GalleryFilter; coverSize: number }
  obsidian: { vault: string; folder: string }
}

export const DEFAULT_SETTINGS: Settings = {
  appTheme: 'system',
  reader: {
    theme: 'paper',
    font: 'publisher',
    fontSize: 18,
    lineHeight: 1.55,
    width: 680,
    flow: 'paginated',
    columns: 2,
    justify: true,
    // pdf.js "auto" fits the width but stops at 125%, so wide windows do not blow pages up.
    pdfZoom: 'auto',
    pdfNight: false
  },
  gallery: { sort: 'recent', filter: 'all', coverSize: 168 },
  obsidian: { vault: '', folder: 'Books' }
}

export interface ExportResult {
  path: string
  highlights: number
}

export interface AppInfo {
  libraryDir: string
  version: string
  platform: string
}

export interface ConfirmOptions {
  message: string
  detail?: string
  confirmLabel?: string
}

export interface TitleBarTheme {
  color: string
  symbolColor: string
}

/** Commands the main process sends to the renderer: menu items and the screenshot walk-through. */
export type NavCommand =
  | 'gallery'
  | 'import'
  | 'rescan'
  | 'settings'
  | 'toggle-sidebar'
  | 'toggle-bookmark'
  | 'theme-dark'
  | 'theme-light'
  | 'theme-system'
  | `open:${string}`
  | `script:${string}`

export interface OctavoApi {
  info(): Promise<AppInfo>
  library(): Promise<LibrarySnapshot>
  rescan(): Promise<LibrarySnapshot>
  importPaths(paths: string[]): Promise<ImportResult>
  importDialog(): Promise<ImportResult | null>
  pathForFile(file: File): string
  saveIndex(update: IndexUpdate): Promise<void>
  removeFiles(fileIds: string[]): Promise<void>
  revealFile(fileId: string): Promise<void>
  getState(fileId: string): Promise<FileState>
  saveState(state: FileState): Promise<void>
  exportObsidian(fileIds: string[]): Promise<ExportResult>
  getSettings(): Promise<Settings>
  saveSettings(settings: Settings): Promise<void>
  pickFolder(title: string): Promise<string | null>
  openLibraryDir(): Promise<void>
  openExternal(url: string): Promise<void>
  confirm(opts: ConfirmOptions): Promise<boolean>
  setTitleBarTheme(theme: TitleBarTheme): Promise<void>
  onNavigate(cb: (cmd: NavCommand) => void): () => void
  onLibraryChanged(cb: (snapshot: LibrarySnapshot) => void): () => void
}

/** URL the renderer uses to load a book file. */
export const bookUrl = (fileId: string): string => `octavo-book://file/${fileId}`
/** URL of a file's cover thumbnail; `v` busts the cache when the cover changes. */
export const coverUrl = (fileId: string, v: string | number = ''): string => `octavo-book://cover/${fileId}?v=${v}`
