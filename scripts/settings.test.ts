import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { merge, SettingsStore } from '../src/main/settings'
import { DEFAULT_SETTINGS } from '../src/shared/types'

test('a missing settings file yields the defaults', async () => {
  const store = new SettingsStore(mkdtempSync(join(tmpdir(), 'octavo-settings-')))
  await store.init()
  assert.deepEqual(store.get(), DEFAULT_SETTINGS)
})

test('stored values overlay the defaults; unknown keys and wrong types are dropped', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'octavo-settings-'))
  writeFileSync(
    join(dir, 'settings.json'),
    JSON.stringify({ appTheme: 'dark', reader: { fontSize: 22, flow: 7, extra: true }, obsidian: null, junk: 1 })
  )
  const store = new SettingsStore(dir)
  await store.init()
  const s = store.get()
  assert.equal(s.appTheme, 'dark')
  assert.equal(s.reader.fontSize, 22)
  assert.equal(s.reader.flow, 'paginated')
  assert.deepEqual(s.obsidian, DEFAULT_SETTINGS.obsidian)
  assert.ok(!('junk' in s) && !('extra' in s.reader))
})

test('merge treats null as missing at every level', () => {
  assert.deepEqual(merge({ a: 1, b: { c: 'x' } }, null), { a: 1, b: { c: 'x' } })
  assert.deepEqual(merge({ a: 1, b: { c: 'x' } }, { a: null, b: { c: null } }), { a: 1, b: { c: 'x' } })
})
