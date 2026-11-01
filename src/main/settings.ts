import { join } from 'node:path'
import { readJson, writeAtomic } from './fsutil'
import { DEFAULT_SETTINGS, type Settings } from '../shared/types'

const isObject = (x: unknown): x is Record<string, unknown> => !!x && typeof x === 'object' && !Array.isArray(x)

/** Overlays `value` on `base`, keeping only keys `base` knows and values of the same type. */
export function merge<T>(base: T, value: unknown): T {
  if (isObject(base)) {
    if (!isObject(value)) return base
    const out: Record<string, unknown> = { ...base }
    for (const key of Object.keys(base)) if (key in value) out[key] = merge(base[key], value[key])
    return out as T
  }
  return value !== null && typeof value === typeof base ? (value as T) : base
}

/** Per-machine preferences in `userData/settings.json`; the library folder holds only book data. */
export class SettingsStore {
  private path: string
  private current: Settings = DEFAULT_SETTINGS

  constructor(dir: string) {
    this.path = join(dir, 'settings.json')
  }

  async init(): Promise<void> {
    this.current = merge(DEFAULT_SETTINGS, await readJson<unknown>(this.path))
  }

  get(): Settings {
    return this.current
  }

  async save(next: Settings): Promise<void> {
    this.current = merge(DEFAULT_SETTINGS, next)
    await writeAtomic(this.path, JSON.stringify(this.current, null, 2))
  }
}
