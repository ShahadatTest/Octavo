import { createHash, randomBytes } from 'node:crypto'
import { createReadStream, promises as fs } from 'node:fs'
import { dirname, extname, join, relative, sep } from 'node:path'
import type { BookFormat } from '../shared/types'

export const ID_LENGTH = 20

/** Writes through a temp file and a rename, so a crash never leaves half a JSON file behind. */
export async function writeAtomic(path: string, data: string | Uint8Array): Promise<void> {
  await fs.mkdir(dirname(path), { recursive: true })
  const tmp = `${path}.${randomBytes(4).toString('hex')}.tmp`
  await fs.writeFile(tmp, data)
  await fs.rename(tmp, path)
}

export async function readJson<T>(path: string): Promise<T | null> {
  try {
    return JSON.parse(await fs.readFile(path, 'utf8')) as T
  } catch {
    return null
  }
}

export function hashFile(path: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha256')
    createReadStream(path)
      .on('data', (chunk) => hash.update(chunk))
      .on('error', reject)
      .on('end', () => resolve(hash.digest('hex').slice(0, ID_LENGTH)))
  })
}

const EPUB_MIMETYPE = 'mimetypeapplication/epub+zip'

/** The extension, if the name has a real one: `Vol. 2` and `Applications, Eighth Edition` have none. */
export function extensionOf(path: string): string {
  const ext = extname(path)
  return /^\.[a-z0-9]{1,5}$/i.test(ext) ? ext.toLowerCase() : ''
}

/**
 * Detects the format from the first bytes. A `.epub` that is a zip is trusted; a file without an
 * extension must carry the EPUB `mimetype` entry first, as the spec requires.
 */
export async function sniffFormat(path: string): Promise<BookFormat | null> {
  const ext = extensionOf(path)
  if (ext && ext !== '.epub' && ext !== '.pdf') return null
  let head: Buffer
  const handle = await fs.open(path, 'r')
  try {
    head = Buffer.alloc(64)
    const { bytesRead } = await handle.read(head, 0, 64, 0)
    head = head.subarray(0, bytesRead)
  } finally {
    await handle.close()
  }
  if (head.subarray(0, 5).toString('latin1') === '%PDF-') return 'pdf'
  const zip = head[0] === 0x50 && head[1] === 0x4b && head[2] === 0x03 && head[3] === 0x04
  if (!zip) return null
  if (ext === '.epub') return 'epub'
  return head.subarray(30, 30 + EPUB_MIMETYPE.length).toString('latin1') === EPUB_MIMETYPE ? 'epub' : null
}

/** Every file under `root`, skipping dot folders such as `.octavo`. Paths are relative, with `/`. */
export async function walk(root: string, dir = root): Promise<string[]> {
  let entries
  try {
    entries = await fs.readdir(dir, { withFileTypes: true })
  } catch {
    return []
  }
  const out: string[] = []
  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue
    const full = join(dir, entry.name)
    if (entry.isDirectory()) out.push(...(await walk(root, full)))
    else if (entry.isFile()) out.push(relative(root, full).split(sep).join('/'))
  }
  return out
}

/** `dir/name.ext`, or `dir/name (2).ext` and so on if that is taken. */
export async function uniquePath(dir: string, name: string): Promise<string> {
  const ext = extname(name)
  const stem = name.slice(0, name.length - ext.length)
  for (let n = 1; ; n++) {
    const candidate = join(dir, n === 1 ? name : `${stem} (${n})${ext}`)
    try {
      await fs.access(candidate)
    } catch {
      return candidate
    }
  }
}

/** Strips anything that could climb out of the destination folder from a zip entry or dropped path. */
export function safeRelative(path: string): string | null {
  const parts = path
    .replace(/\\/g, '/')
    .split('/')
    .filter((p) => p && p !== '.')
  if (parts.some((p) => p === '..')) return null
  const cleaned = parts.map((p) => p.replace(/[<>:"|?*\u0000-\u001f]/g, '_').replace(/[. ]+$/, '') || '_')
  return cleaned.length ? cleaned.join('/') : null
}
