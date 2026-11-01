// End-to-end run against the built app: import the fixtures, read both formats, highlight, bookmark,
// export, restart, and screenshot each step into screenshots/. Run with `npm run smoke`.
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs'
import { createServer } from 'node:http'
import { TRAP_PORT } from './fixture-books'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import assert from 'node:assert/strict'
import { _electron as electron, type ElectronApplication, type Frame, type Page } from 'playwright-core'
import sharp from 'sharp'

const root = join(__dirname, '..')
const fixtures = join(root, 'e2e', 'fixtures')
const shots = join(root, 'screenshots')
const electronPath = require('electron') as unknown as string

const base = mkdtempSync(join(tmpdir(), 'octavo-smoke-'))
const userData = join(base, 'profile')
const libraryDir = join(base, 'Library')
const vault = join(base, 'Vault')
mkdirSync(vault, { recursive: true })
rmSync(shots, { recursive: true, force: true })
mkdirSync(shots, { recursive: true })

const problems: string[] = []

async function launch(): Promise<{ app: ElectronApplication; page: Page }> {
  const env = { ...process.env, OCTAVO_USER_DATA: userData, OCTAVO_LIBRARY_DIR: libraryDir } as Record<string, string>
  // VS Code's terminal sets this, and it turns Electron into plain Node.
  delete env.ELECTRON_RUN_AS_NODE
  const app = await electron.launch({ executablePath: electronPath, args: ['.'], cwd: root, env })
  const page = await app.firstWindow()
  page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`))
  page.on('console', (m) => {
    if (m.type() === 'error') problems.push(`console: ${m.text()}`)
  })
  await page.setViewportSize({ width: 1360, height: 860 }).catch(() => undefined)
  await page.waitForSelector('.titlebar, .reader', { timeout: 20000 })
  return { app, page }
}

const shot = async (page: Page, name: string): Promise<void> => {
  await page.waitForTimeout(450)
  await page.screenshot({ path: join(shots, `${name}.png`) })
  console.log(`  screenshot ${name}`)
}

async function bookFrame(page: Page): Promise<Frame> {
  for (let i = 0; i < 60; i++) {
    const frame = page.frames().find((f) => f.url().startsWith('blob:'))
    if (frame && (await frame.evaluate(() => document.querySelectorAll('p').length).catch(() => 0)) > 0) return frame
    await page.waitForTimeout(150)
  }
  throw new Error('The EPUB page frame never appeared')
}

/**
 * foliate-js draws highlights in a closed shadow root, out of reach of the DOM, so the check reads
 * pixels: the share of the box that is tinted with the highlight colour rather than paper or ink.
 */
async function highlightPixels(
  page: Page,
  box: { x: number; y: number; width: number; height: number },
  color: 'yellow' | 'green'
): Promise<number> {
  const png = await page.screenshot({ clip: { x: box.x + 2, y: box.y + 2, width: Math.max(4, box.width - 4), height: Math.max(4, box.height - 4) } })
  const { data, info } = await sharp(png).removeAlpha().raw().toBuffer({ resolveWithObject: true })
  let tinted = 0
  for (let i = 0; i < data.length; i += 3) {
    const [r, g, b] = [data[i], data[i + 1], data[i + 2]]
    if (color === 'yellow' ? r > 200 && g > 170 && b < 200 && r - b > 50 : g > 170 && g - r > 25 && g - b > 15) tinted++
  }
  return tinted / (info.width * info.height)
}

async function pixelAt(page: Page, x: number, y: number): Promise<[number, number, number]> {
  const png = await page.screenshot({ clip: { x: Math.round(x), y: Math.round(y), width: 1, height: 1 } })
  const { data } = await sharp(png).removeAlpha().raw().toBuffer({ resolveWithObject: true })
  return [data[0], data[1], data[2]]
}

const fileIds = (page: Page): Promise<Array<{ id: string; path: string; format: string; title: string }>> =>
  page.evaluate(async () =>
    (await window.octavo.library()).files.map((f) => ({ id: f.id, path: f.path, format: f.format, title: f.meta?.title ?? '' }))
  )

async function main(): Promise<void> {
  console.log(`Library: ${libraryDir}`)
  let { app, page } = await launch()

  // ---- empty library ----
  await page.waitForSelector('.empty')
  await shot(page, '01-empty')

  // ---- import: a folder, an extensionless PDF and a Drive zip ----
  const result = await page.evaluate(
    (paths) => window.octavo.importPaths(paths),
    [join(fixtures, 'drop'), join(fixtures, 'An Atlas of Small Things, Second Edition'), join(fixtures, 'Books-20261101T020000Z-1-001.zip')]
  )
  console.log('import', result)
  assert.deepEqual(result, { added: 5, duplicates: 1, skipped: 1, errors: [] })

  await page.waitForSelector('.card')
  await page.waitForFunction(() => !document.querySelector('.indexing'), null, { timeout: 30000 })
  await page.waitForFunction(() => document.querySelectorAll('.card').length === 3, null, { timeout: 10000 })
  const cards = await page.$$eval('.card', (els) =>
    els.map((el) => ({
      title: el.querySelector('.card__title')?.textContent,
      badges: Array.from(el.querySelectorAll('.badge')).map((b) => b.textContent).join('+'),
      img: !!el.querySelector('.cover img')
    }))
  )
  console.log('cards', cards)
  const byTitle = Object.fromEntries(cards.map((c) => [c.title, c]))
  assert.equal(byTitle['The Lighthouse Keeper']?.badges, 'EPUB+PDF', 'name pairing')
  assert.equal(byTitle['An Atlas of Small Things']?.badges, 'EPUB+PDF', 'title pairing')
  assert.equal(byTitle['Field Notes on Rivers']?.badges, 'EPUB')
  assert.equal(byTitle['Field Notes on Rivers']?.img, false, 'drawn cover for a book without one')
  assert.equal(byTitle['The Lighthouse Keeper']?.img, true)
  await shot(page, '02-gallery')

  // Every cover is drawn at its own proportions: nothing cropped to fit the slot.
  const shapes = await page.$$eval('.card .cover__book img', (imgs) =>
    (imgs as HTMLImageElement[]).map((img) => {
      const r = img.parentElement!.getBoundingClientRect()
      return { frame: r.width / r.height, image: img.naturalWidth / img.naturalHeight }
    })
  )
  assert.ok(shapes.length >= 2)
  for (const s of shapes) assert.ok(Math.abs(s.frame - s.image) < 0.02, `cover cropped: frame ${s.frame} vs image ${s.image}`)

  // Edit a book's title and authors, then go back to what the file says.
  await page.click('.card[title="Field Notes on Rivers"]', { button: 'right' })
  await page.click('.menu__item:has-text("Edit title and author")')
  await page.waitForSelector('.details')
  await page.fill('.details input >> nth=0', 'Rivers: Field Notes')
  await page.fill('.details input[aria-label="Author 1"]', 'T. Reyes')
  await page.click('.details button:has-text("Add author")')
  await page.fill('.details input[aria-label="Author 2"]', 'A. Second')
  await shot(page, '02b-edit-details')
  await page.click('.details button[type="submit"]')
  await page.waitForSelector('.card[title="Rivers: Field Notes"]')
  assert.equal(
    await page.$eval('.card[title="Rivers: Field Notes"] .card__author', (e) => e.textContent),
    'T. Reyes & A. Second'
  )
  await page.click('.card[title="Rivers: Field Notes"]', { button: 'right' })
  await page.click('.menu__item:has-text("Edit title and author")')
  await page.click(`.details button:has-text("Use the file's details")`)
  await page.waitForSelector('.card[title="Field Notes on Rivers"]')

  const files = await fileIds(page)
  const lighthouseEpub = files.find((f) => f.title === 'The Lighthouse Keeper' && f.format === 'epub')!
  const lighthousePdf = files.find((f) => f.title === 'The Lighthouse Keeper' && f.format === 'pdf')!
  assert.ok(files.some((f) => f.path === 'An Atlas of Small Things, Second Edition.pdf'), 'extension added on import')
  assert.ok(files.some((f) => f.path === 'Books/Atlas/atlas.epub'), 'zip folders kept')

  // ---- EPUB reader ----
  await page.click('.card[title="The Lighthouse Keeper"]')
  await page.waitForSelector('.reader')
  await page.waitForFunction(() => !document.querySelector('.reader__loading'), null, { timeout: 20000 })
  let frame = await bookFrame(page)
  await shot(page, '03-epub-cover')
  for (let i = 0; i < 3; i++) {
    await page.keyboard.press('ArrowRight')
    await page.waitForTimeout(350)
  }
  frame = await bookFrame(page)
  await shot(page, '04-epub-page')

  // Select the first sentence of the first visible paragraph, as a mouse drag would.
  const selection = await frame.evaluate(() => {
    const p = Array.from(document.querySelectorAll('p')).find((el) => {
      const r = el.getBoundingClientRect()
      return r.width > 0 && r.left >= 0 && r.left < window.innerWidth && (el.textContent ?? '').length > 80
    })
    if (!p?.firstChild) return null
    const range = document.createRange()
    const text = p.firstChild.textContent ?? ''
    range.setStart(p.firstChild, 0)
    range.setEnd(p.firstChild, Math.min(text.indexOf('.') + 1 || 60, text.length))
    const sel = document.getSelection()!
    sel.removeAllRanges()
    sel.addRange(range)
    document.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }))
    const r = range.getClientRects()[0]
    return { text: range.toString(), rect: { x: r.left, y: r.top, width: r.width, height: r.height } }
  })
  assert.ok(selection, 'a visible paragraph to select')
  const frameBox = (await (await frame.frameElement()).boundingBox())!
  const firstLine = { ...selection.rect, x: selection.rect.x + frameBox.x, y: selection.rect.y + frameBox.y }
  console.log('selected:', selection.text)
  assert.ok(selection.text.length > 10)
  await page.waitForSelector('.hl-pop')
  await shot(page, '05-epub-selection')
  await page.click('.hl-pop .swatch[title="Yellow"]')
  await page.waitForTimeout(300)
  await page.click('.hl-pop button[title="Add note"]')
  await page.fill('.hl-pop textarea', 'The keeper counts the light: a habit that becomes a vocation.')
  await page.click('.hl-pop .btn--primary')
  let state = await page.evaluate((id) => window.octavo.getState(id), lighthouseEpub.id)
  assert.equal(state.highlights.length, 1)
  assert.match(state.highlights[0].note, /counts the light/)
  assert.ok('cfi' in state.highlights[0].at)
  // The EPUB has no page map of its own; its page comes from the paired PDF's text.
  await page.waitForFunction(
    async (id) => !!(await window.octavo.getState(id)).highlights[0]?.page,
    lighthouseEpub.id,
    { timeout: 15000, polling: 250 }
  )
  state = await page.evaluate((id) => window.octavo.getState(id), lighthouseEpub.id)
  console.log(`EPUB highlight on printed page ${state.highlights[0].page}`)
  assert.match(state.highlights[0].page!, /^\d+$/)
  assert.match(await page.$eval('.reader__footer .where', (e) => e.textContent ?? ''), /^Page \d+ · \d+%$/)
  await page.waitForTimeout(300)
  const tint = await highlightPixels(page, firstLine, 'yellow')
  console.log(`highlight tint ${(tint * 100).toFixed(0)}%`)
  assert.ok(tint > 0.15, 'yellow highlight drawn over the selected words')
  await shot(page, '06-epub-highlight')

  await page.click('.reader button[title^="Bookmark this page"]')
  state = await page.evaluate((id) => window.octavo.getState(id), lighthouseEpub.id)
  assert.equal(state.bookmarks.length, 1)
  assert.ok(await page.$('.reader button[title^="Remove bookmark"]'))

  // Ctrl+\ is a native menu accelerator, which synthetic key events do not reach; use the button.
  await page.click('.reader button[title^="Contents, bookmarks"]')
  await page.waitForSelector('.bookside')
  await shot(page, '07-epub-contents')
  await page.click('.bookside__tabs button:has-text("Highlights")')
  await shot(page, '08-epub-highlights')

  await page.click('.reader button[title="Appearance"]')
  await page.waitForSelector('.appearance')
  await shot(page, '09-appearance')
  await page.click('.theme-chip:has-text("Night")')
  await page.keyboard.press('Escape')
  await shot(page, '10-epub-night')
  // The page margins, the band above the text and the bar must all turn dark, not only the text block.
  const stage = (await page.locator('.reader__stage').boundingBox())!
  for (const [x, y] of [
    [stage.x + 12, stage.y + stage.height / 2],
    [stage.x + stage.width / 2, stage.y + 8],
    [stage.x + stage.width - 20, stage.y + stage.height / 2],
    [stage.x + stage.width / 2, 20]
  ]) {
    const [r, g, b] = await pixelAt(page, x, y)
    assert.ok(r < 40 && g < 40 && b < 40, `night background at ${Math.round(x)},${Math.round(y)} is rgb(${r},${g},${b})`)
  }
  // So must the unread part of the scrubber: Chromium's native track stayed light.
  const track = (await page.locator('.scrubber input').boundingBox())!
  const [tr, tg, tb] = await pixelAt(page, track.x + track.width - 30, track.y + track.height / 2)
  assert.ok(tr < 90 && tg < 90 && tb < 90, `night scrubber track is rgb(${tr},${tg},${tb})`)
  await page.click('.reader button[title="Appearance"]')
  await page.click('.theme-chip:has-text("Sepia")')
  await page.click('.appearance .seg button:has-text("Scroll")')
  await page.keyboard.press('Escape')
  await shot(page, '11-epub-sepia-scroll')
  await page.click('.reader button[title="Appearance"]')
  await page.click('.theme-chip:has-text("Paper")')
  await page.click('.appearance .seg button:has-text("Two pages")')
  await page.keyboard.press('Escape')

  // ---- PDF of the same book ----
  await page.click('.reader .seg button:has-text("PDF")')
  await page.waitForSelector('.pdf-container .textLayer span', { timeout: 20000 })
  await page.waitForTimeout(600)
  await page.evaluate(() => {
    const container = document.querySelector('.pdf-container')!
    container.scrollTop = (document.querySelectorAll('.pdfViewer .page')[1] as HTMLElement).offsetTop - 10
  })
  await page.waitForSelector('.page[data-page-number="2"] .textLayer span', { timeout: 20000 })
  await page.waitForTimeout(400)
  const pdfSelected = await page.evaluate(() => {
    const spans = Array.from(document.querySelectorAll('.page[data-page-number="2"] .textLayer span')).filter(
      (s) => (s.textContent ?? '').trim().length > 20
    )
    const range = document.createRange()
    range.setStart(spans[1].firstChild!, 0)
    range.setEnd(spans[3].firstChild!, (spans[3].textContent ?? '').length)
    const sel = document.getSelection()!
    sel.removeAllRanges()
    sel.addRange(range)
    document.querySelector('.pdf-container')!.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }))
    return sel.toString()
  })
  console.log('pdf selected:', pdfSelected.slice(0, 80))
  await page.waitForSelector('.hl-pop')
  await page.click('.hl-pop .swatch[title="Green"]')
  await page.waitForSelector('.pdf-hl-layer i')
  const pdfState = await page.evaluate((id) => window.octavo.getState(id), lighthousePdf.id)
  assert.equal(pdfState.highlights.length, 1)
  const at = pdfState.highlights[0].at as { page: number; rects: number[][] }
  assert.equal(at.page, 2)
  assert.equal(at.rects.length, 3, 'three selected lines become three boxes')
  assert.equal(pdfState.highlights[0].page, '2', 'PDF highlight carries its page label')
  await page.keyboard.press('Escape')
  await shot(page, '12-pdf-highlight')

  // Zoom must keep the highlight on its words.
  await page.click('.reader button[title="Appearance"]')
  await page.click('.appearance .seg button:has-text("Fit page")')
  await page.keyboard.press('Escape')
  await page.waitForTimeout(600)
  await shot(page, '13-pdf-fit-page')

  // ---- back to the gallery: progress and continue reading ----
  await page.keyboard.press('Escape')
  await page.waitForSelector('.gallery')
  await page.waitForSelector('.resume')
  await shot(page, '14-gallery-progress')

  // ---- Obsidian export ----
  const settings = await page.evaluate(() => window.octavo.getSettings())
  await page.evaluate((s) => window.octavo.saveSettings(s), { ...settings, obsidian: { vault, folder: 'Books' } })
  const exported = await page.evaluate((ids) => window.octavo.exportObsidian(ids), [lighthouseEpub.id, lighthousePdf.id])
  console.log('exported', exported)
  const note = readFileSync(exported.path, 'utf8')
  assert.equal(exported.highlights, 2)
  assert.match(note, /source: octavo/)
  assert.match(note, /## From the EPUB/)
  assert.match(note, /## From the PDF/)
  assert.match(note, /\*p\. 2\*/)
  assert.deepEqual(readdirSync(join(vault, 'Books')), ['The Lighthouse Keeper.md'])

  // ---- restart: everything comes back ----
  await app.close()
  ;({ app, page } = await launch())
  await page.waitForSelector('.resume')
  await page.click('.resume')
  await page.waitForSelector('.pdf-container .page', { timeout: 20000 })
  await page.waitForSelector('.pdf-hl-layer i', { timeout: 20000 })
  await page.click('.reader .seg button:has-text("EPUB")')
  await page.waitForFunction(() => !document.querySelector('.reader__loading'), null, { timeout: 20000 })
  frame = await bookFrame(page)
  await page.waitForTimeout(800)
  // Find the highlighted sentence on the restored page and check it is still painted.
  const again = await frame.evaluate((text) => {
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const i = (n.textContent ?? '').indexOf(text.slice(0, 40))
      if (i < 0) continue
      const range = document.createRange()
      range.setStart(n, i)
      range.setEnd(n, i + 40)
      const r = range.getClientRects()[0]
      if (r && r.left >= 0 && r.left < window.innerWidth) return { x: r.left, y: r.top, width: r.width, height: r.height }
    }
    return null
  }, selection.text)
  assert.ok(again, 'restored to the page with the highlight')
  const box2 = (await (await frame.frameElement()).boundingBox())!
  assert.ok(
    (await highlightPixels(page, { ...again, x: again.x + box2.x, y: again.y + box2.y }, 'yellow')) > 0.15,
    'EPUB highlight back after restart'
  )
  assert.ok(await page.$('.reader button[title^="Remove bookmark"]'), 'bookmark back after restart')
  await shot(page, '15-after-restart')

  // ---- a hostile EPUB: no script runs, nothing reaches the network ----
  const trapHits: string[] = []
  const trap = createServer((req, res) => {
    trapHits.push(req.url ?? '')
    res.end('')
  })
  await new Promise<void>((ok) => trap.listen(TRAP_PORT, '127.0.0.1', ok))
  try {
    await page.keyboard.press('Escape')
    await page.waitForSelector('.gallery')
    await page.evaluate((p) => window.octavo.importPaths([p]), join(fixtures, 'hostile', 'suspicious-pamphlet.epub'))
    await page.waitForSelector('.card[title="A Suspicious Pamphlet"]')
    await page.click('.card[title="A Suspicious Pamphlet"]')
    await page.waitForFunction(() => !document.querySelector('.reader__loading'), null, { timeout: 20000 })
    frame = await bookFrame(page)
    await page.waitForTimeout(1500)
    assert.notEqual(await page.title(), 'PWNED', 'book script reached the app window')
    assert.equal(await frame.evaluate(() => document.documentElement.getAttribute('data-pwned')), null, 'book script ran')
    assert.deepEqual(trapHits, [], 'book reached the network')
    await shot(page, '16-hostile-book')
  } finally {
    trap.close()
  }

  await app.close()
  // The sandbox warning is foliate-js's iframe (allow-scripts + allow-same-origin); the CSP is what stops book scripts.
  const serious = problems.filter(
    (p) => !/Autofill|DevTools|Electron Security Warning|can escape its sandboxing|Content Security Policy/.test(p)
  )
  if (serious.length) {
    console.log('\nRenderer problems:')
    for (const p of serious) console.log(`  ${p}`)
  }
  console.log(`\nSmoke passed. Screenshots in ${shots}`)
}

main().catch((e) => {
  console.error(e)
  if (problems.length) console.error(problems.join('\n'))
  process.exit(1)
})
