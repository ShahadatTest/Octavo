import { createHash } from 'node:crypto'
import { createWriteStream, promises as fs } from 'node:fs'
import { basename, isAbsolute, join, posix, relative, resolve, sep } from 'node:path'
import { Transform } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import yauzl from 'yauzl'
import {
  extensionOf,
  hashFile,
  ID_LENGTH,
  readJson,
  safeRelative,
  sniffFormat,
  uniquePath,
  walk,
  writeAtomic
} from './fsutil'
import {
  INDEX_VERSION,
  type BookDetails,
  type BookMeta,
  type FileRecord,
  type FileState,
  type ImportResult,
  type IndexUpdate,
  type LibrarySnapshot,
  type StateSummary
} from '../shared/types'
import { PAGE_INDEX_VERSION, type PageIndex } from '../shared/pages'

/** A page index from disk or from the renderer: two string arrays of the same length. */
function isPageIndex(x: unknown): x is PageIndex {
  const p = x as PageIndex | null
  return (
    !!p &&
    typeof p.version === 'number' &&
    Array.isArray(p.pages) &&
    Array.isArray(p.labels) &&
    p.pages.length === p.labels.length &&
    p.pages.every((s) => typeof s === 'string') &&
    p.labels.every((s) => typeof s === 'string')
  )
}

function cleanDetails(d: BookDetails): BookDetails | null {
  const title = typeof d.title === 'string' ? d.title.replace(/\s+/g, ' ').trim().slice(0, 500) : ''
  const authors = Array.isArray(d.authors)
    ? d.authors
        .filter((a): a is string => typeof a === 'string')
        .map((a) => a.replace(/\s+/g, ' ').trim().slice(0, 200))
        .filter(Boolean)
    : []
  return title ? { title, authors } : null
}

interface Catalog {
  version: 1
  files: FileRecord[]
}

export interface LibraryOptions {
  /** Moves a file to the OS trash. Injected so the class has no Electron dependency. */
  trash?: (path: string) => Promise<void>
  now?: () => Date
}

const FILE_ID = new RegExp(`^[0-9a-f]{${ID_LENGTH}}$`)
export const isFileId = (id: unknown): id is string => typeof id === 'string' && FILE_ID.test(id)

const message = (e: unknown): string => (e instanceof Error ? e.message : String(e))
const isInside = (path: string, root: string): boolean => {
  const rel = relative(root, path)
  return !!rel && rel.split(sep)[0] !== '..' && !isAbsolute(rel)
}

export function emptyState(fileId: string, title = ''): FileState {
  return {
    version: 1,
    fileId,
    title,
    lastOpenedAt: null,
    finishedAt: null,
    position: null,
    bookmarks: [],
    highlights: []
  }
}

export function summarize(state: FileState): StateSummary {
  return {
    fraction: state.position?.fraction ?? 0,
    lastOpenedAt: state.lastOpenedAt,
    finishedAt: state.finishedAt,
    highlights: state.highlights.length,
    bookmarks: state.bookmarks.length
  }
}

const clip = (s: unknown, max: number): string | undefined =>
  typeof s === 'string' && s.trim() ? s.trim().slice(0, max) : undefined

function cleanMeta(meta: BookMeta | null): BookMeta | null {
  if (!meta) return null
  return {
    title: clip(meta.title, 500) ?? '',
    authors: Array.isArray(meta.authors) ? meta.authors.map((a) => clip(a, 200)).filter((a): a is string => !!a) : [],
    publisher: clip(meta.publisher, 200),
    language: clip(meta.language, 40),
    published: clip(meta.published, 40),
    description: clip(meta.description, 4000),
    pages: typeof meta.pages === 'number' && meta.pages > 0 ? Math.floor(meta.pages) : undefined
  }
}

/**
 * The library folder: book files anywhere under `root`, plus Octavo's own data in `root/.octavo`.
 * Every mutation runs through one queue, so scans, imports and index updates never interleave.
 */
export class Library {
  readonly root: string
  readonly dataDir: string
  private files = new Map<string, FileRecord>()
  private states = new Map<string, StateSummary>()
  private queue: Promise<unknown> = Promise.resolve()

  constructor(
    root: string,
    private readonly opts: LibraryOptions = {}
  ) {
    this.root = resolve(root)
    this.dataDir = join(this.root, '.octavo')
  }

  private get catalogPath(): string {
    return join(this.dataDir, 'catalog.json')
  }

  private run<T>(fn: () => Promise<T>): Promise<T> {
    const next = this.queue.then(fn, fn)
    this.queue = next.catch(() => undefined)
    return next
  }

  private now(): string {
    return (this.opts.now?.() ?? new Date()).toISOString()
  }

  async init(): Promise<void> {
    for (const dir of ['covers', 'annotations', 'pages', 'tmp']) await fs.mkdir(join(this.dataDir, dir), { recursive: true })
    const catalog = await readJson<Catalog>(this.catalogPath)
    for (const f of catalog?.files ?? []) if (isFileId(f.id)) this.files.set(f.id, f)
    await this.loadStates()
    await this.scan()
  }

  list(): FileRecord[] {
    return [...this.files.values()]
  }

  get(id: string): FileRecord | undefined {
    return this.files.get(id)
  }

  snapshot(): LibrarySnapshot {
    return { root: this.root, files: this.list(), states: Object.fromEntries(this.states) }
  }

  resolvePath(id: string): string | null {
    const rec = this.files.get(id)
    return rec ? join(this.root, ...rec.path.split('/')) : null
  }

  coverPath(id: string): string {
    return join(this.dataDir, 'covers', `${id}.webp`)
  }

  private statePath(id: string): string {
    return join(this.dataDir, 'annotations', `${id}.json`)
  }

  private async saveCatalog(): Promise<void> {
    const files = this.list().sort((a, b) => a.path.localeCompare(b.path))
    await writeAtomic(this.catalogPath, JSON.stringify({ version: 1, files } satisfies Catalog, null, 2))
  }

  // ---- scanning ----------------------------------------------------------------------------

  scan(): Promise<void> {
    return this.run(() => this.doScan())
  }

  private async doScan(): Promise<void> {
    const byPath = new Map(this.list().map((f) => [f.path, f]))
    const seen = new Set<string>()
    let changed = false
    for (const rel of await walk(this.root)) {
      const abs = join(this.root, ...rel.split('/'))
      let st
      try {
        st = await fs.stat(abs)
      } catch {
        continue
      }
      const known = byPath.get(rel)
      if (known && known.size === st.size && Math.abs(known.mtimeMs - st.mtimeMs) < 1) {
        seen.add(known.id)
        continue
      }
      const format = await sniffFormat(abs).catch(() => null)
      if (!format) continue
      const id = await hashFile(abs)
      if (seen.has(id)) continue // a second copy of the same bytes inside the library
      const existing = this.files.get(id)
      if (existing) Object.assign(existing, { path: rel, format, size: st.size, mtimeMs: st.mtimeMs })
      else {
        this.files.set(id, {
          id,
          path: rel,
          format,
          size: st.size,
          mtimeMs: st.mtimeMs,
          addedAt: this.now(),
          meta: null,
          hasCover: false
        })
      }
      seen.add(id)
      changed = true
    }
    for (const id of [...this.files.keys()]) {
      if (!seen.has(id)) {
        this.files.delete(id)
        changed = true
      }
    }
    if (changed) await this.saveCatalog()
  }

  // ---- importing ---------------------------------------------------------------------------

  /** Copies files, folders (recursively) and zip archives into the library. */
  importPaths(paths: string[]): Promise<ImportResult> {
    return this.run(async () => {
      const result: ImportResult = { added: 0, duplicates: 0, skipped: 0, errors: [] }
      const known = new Set(this.files.keys())
      for (const p of paths) {
        const abs = resolve(p)
        try {
          if (abs === this.root || isInside(abs, this.root)) continue // already here; the rescan picks it up
          const st = await fs.stat(abs)
          if (st.isDirectory()) await this.importDir(abs, result, known)
          else if (extensionOf(abs) === '.zip') await this.importZip(abs, result, known)
          else await this.importFile(abs, '', result, known)
        } catch (e) {
          result.errors.push(`${basename(abs)}: ${message(e)}`)
        }
      }
      await this.doScan()
      return result
    })
  }

  private async destination(relDir: string, name: string, format: string): Promise<string> {
    const fileName = /\.(epub|pdf)$/i.test(name) ? name : `${name}.${format}`
    const dir = join(this.root, ...relDir.split('/').filter(Boolean))
    await fs.mkdir(dir, { recursive: true })
    return uniquePath(dir, fileName)
  }

  private async importFile(src: string, relDir: string, result: ImportResult, known: Set<string>): Promise<void> {
    const format = await sniffFormat(src)
    if (!format) {
      result.skipped++
      return
    }
    const id = await hashFile(src)
    if (known.has(id)) {
      result.duplicates++
      return
    }
    await fs.copyFile(src, await this.destination(relDir, basename(src), format))
    known.add(id)
    result.added++
  }

  private async importDir(src: string, result: ImportResult, known: Set<string>): Promise<void> {
    const base = safeRelative(basename(src)) ?? 'Imported'
    for (const rel of await walk(src)) {
      const relDir = posix.dirname(posix.join(base, rel))
      try {
        await this.importFile(join(src, ...rel.split('/')), relDir, result, known)
      } catch (e) {
        result.errors.push(`${rel}: ${message(e)}`)
      }
    }
  }

  private async importZip(src: string, result: ImportResult, known: Set<string>): Promise<void> {
    const zip = await new Promise<yauzl.ZipFile>((ok, fail) =>
      yauzl.open(src, { lazyEntries: true, autoClose: true }, (err, zf) => (err || !zf ? fail(err) : ok(zf)))
    )
    const tmpDir = join(this.dataDir, 'tmp')
    await new Promise<void>((ok, fail) => {
      zip.on('error', fail)
      zip.on('end', () => ok())
      zip.on('entry', (entry: yauzl.Entry) => {
        this.importZipEntry(zip, entry, tmpDir, result, known)
          .catch((e) => result.errors.push(`${entry.fileName}: ${message(e)}`))
          .finally(() => zip.readEntry())
      })
      zip.readEntry()
    })
  }

  private async importZipEntry(
    zip: yauzl.ZipFile,
    entry: yauzl.Entry,
    tmpDir: string,
    result: ImportResult,
    known: Set<string>
  ): Promise<void> {
    if (entry.fileName.endsWith('/')) return
    const rel = safeRelative(entry.fileName)
    if (!rel) return
    const ext = extensionOf(rel)
    if (ext && ext !== '.epub' && ext !== '.pdf') {
      result.skipped++
      return
    }
    const stream = await new Promise<NodeJS.ReadableStream>((ok, fail) =>
      zip.openReadStream(entry, (err, s) => (err || !s ? fail(err) : ok(s)))
    )
    const hash = createHash('sha256')
    // The temp file keeps the entry's extension, so sniffFormat judges it exactly as it would the original.
    const tmp = join(tmpDir, `${Date.now()}-${Math.random().toString(16).slice(2)}${ext}`)
    const hasher = new Transform({
      transform(chunk, _enc, cb) {
        hash.update(chunk)
        cb(null, chunk)
      }
    })
    try {
      await pipeline(stream, hasher, createWriteStream(tmp))
      const format = await sniffFormat(tmp)
      if (!format) {
        result.skipped++
        return
      }
      const id = hash.digest('hex').slice(0, ID_LENGTH)
      if (known.has(id)) {
        result.duplicates++
        return
      }
      await fs.rename(tmp, await this.destination(posix.dirname(rel), posix.basename(rel), format))
      known.add(id)
      result.added++
    } finally {
      await fs.rm(tmp, { force: true })
    }
  }

  // ---- metadata and covers -------------------------------------------------------------------

  saveIndex(update: IndexUpdate): Promise<void> {
    return this.run(async () => {
      const rec = this.files.get(update.fileId)
      if (!rec) return
      rec.meta = cleanMeta(update.meta) ?? rec.meta ?? { title: '', authors: [] }
      if (update.cover && update.cover.byteLength > 0) {
        await writeAtomic(this.coverPath(rec.id), Buffer.from(update.cover))
        rec.hasCover = true
      }
      if (update.error) rec.indexError = update.error.slice(0, 500)
      else delete rec.indexError
      rec.indexVersion = INDEX_VERSION
      await this.saveCatalog()
    })
  }

  /** Sets the reader's own title and authors on every file of a book; null goes back to the files' own. */
  setDetails(ids: string[], details: BookDetails | null): Promise<void> {
    return this.run(async () => {
      const clean = details ? cleanDetails(details) : null
      for (const id of ids) {
        const rec = this.files.get(id)
        if (!rec) continue
        if (clean) rec.custom = clean
        else delete rec.custom
      }
      await this.saveCatalog()
    })
  }

  // ---- page text of PDFs, for printed page numbers -------------------------------------------

  private pagesPath(id: string): string {
    return join(this.dataDir, 'pages', `${id}.json`)
  }

  async getPageIndex(id: string): Promise<PageIndex | null> {
    if (!isFileId(id)) return null
    const index = await readJson<PageIndex>(this.pagesPath(id))
    return isPageIndex(index) && index.version === PAGE_INDEX_VERSION ? index : null
  }

  savePageIndex(id: string, index: PageIndex): Promise<void> {
    return this.run(async () => {
      const rec = this.files.get(id)
      if (!rec || rec.format !== 'pdf' || !isPageIndex(index)) return
      await writeAtomic(this.pagesPath(id), JSON.stringify(index))
      rec.pageIndexVersion = index.version
      await this.saveCatalog()
    })
  }

  // ---- removal -------------------------------------------------------------------------------

  /** Moves the files to the trash. Their annotation files stay, so a re-import brings highlights back. */
  removeFiles(ids: string[]): Promise<void> {
    return this.run(async () => {
      for (const id of ids) {
        const path = this.resolvePath(id)
        if (!path) continue
        if (this.opts.trash) await this.opts.trash(path)
        else await fs.rm(path, { force: true })
        await fs.rm(this.coverPath(id), { force: true })
        await fs.rm(this.pagesPath(id), { force: true })
        this.files.delete(id)
      }
      await this.saveCatalog()
    })
  }

  // ---- reading state -------------------------------------------------------------------------

  private async loadStates(): Promise<void> {
    const dir = join(this.dataDir, 'annotations')
    for (const name of await fs.readdir(dir).catch(() => [] as string[])) {
      if (!name.endsWith('.json')) continue
      const state = await readJson<FileState>(join(dir, name))
      if (state && isFileId(state.fileId)) this.states.set(state.fileId, summarize(normalizeState(state, state.fileId)))
    }
  }

  async getState(id: string): Promise<FileState> {
    if (!isFileId(id)) throw new Error('Not a file id')
    const stored = await readJson<FileState>(this.statePath(id))
    const title = this.files.get(id)?.meta?.title ?? ''
    return normalizeState(stored, id, title)
  }

  async saveState(state: FileState): Promise<void> {
    if (!isFileId(state.fileId)) throw new Error('Not a file id')
    const clean = normalizeState(state, state.fileId)
    await writeAtomic(this.statePath(state.fileId), JSON.stringify(clean, null, 2))
    this.states.set(state.fileId, summarize(clean))
  }
}

/** Fills gaps in a state read from disk, so older or hand-edited files never break the reader. */
export function normalizeState(raw: Partial<FileState> | null, fileId: string, title = ''): FileState {
  const base = emptyState(fileId, raw?.title || title)
  if (!raw) return base
  return {
    ...base,
    lastOpenedAt: typeof raw.lastOpenedAt === 'string' ? raw.lastOpenedAt : null,
    finishedAt: typeof raw.finishedAt === 'string' ? raw.finishedAt : null,
    position: raw.position && typeof raw.position === 'object' && raw.position.at ? raw.position : null,
    bookmarks: Array.isArray(raw.bookmarks) ? raw.bookmarks.filter((b) => b && b.id && b.at) : [],
    highlights: Array.isArray(raw.highlights) ? raw.highlights.filter((h) => h && h.id && h.at) : []
  }
}
