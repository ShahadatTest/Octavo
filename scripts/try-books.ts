// Imports the given books into a throwaway library, opens each one, and screenshots the gallery,
// the first page and a few pages in, plus the contents list. Reports renderer errors.
// Usage: npm run build && npx tsx scripts/try-books.ts <file-or-folder>...
//        set OCTAVO_EXE=dist\win-unpacked\Octavo.exe to try a packaged build
import { mkdirSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { _electron as electron } from 'playwright-core'

const root = join(__dirname, '..')
const out = join(root, 'screenshots', 'try')
const electronPath = require('electron') as unknown as string

async function main(): Promise<void> {
  const inputs = process.argv.slice(2).map((p) => resolve(p))
  if (inputs.length === 0) throw new Error('Give one or more files or folders to try.')
  mkdirSync(out, { recursive: true })
  const base = mkdtempSync(join(tmpdir(), 'octavo-try-'))
  const env = { ...process.env, OCTAVO_USER_DATA: join(base, 'profile'), OCTAVO_LIBRARY_DIR: join(base, 'Library') } as Record<string, string>
  delete env.ELECTRON_RUN_AS_NODE
  // OCTAVO_EXE points at a packaged build (dist/win-unpacked/Octavo.exe) to try that instead of the source.
  const exe = process.env.OCTAVO_EXE
  const app = await electron.launch(
    exe ? { executablePath: exe, args: [], env } : { executablePath: electronPath, args: ['.'], cwd: root, env }
  )
  const page = await app.firstWindow()
  const problems: string[] = []
  page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`))
  page.on('console', (m) => {
    // pdf.js only warns when its font, CMap or wasm assets fail to load, then quietly falls back.
    if (m.type() === 'error' || (m.type() === 'warning' && /font|cmap|wasm|icc|fetch|load/i.test(m.text())))
      problems.push(`console ${m.type()}: ${m.text()}`)
  })
  await page.waitForSelector('.titlebar')

  const result = await page.evaluate((paths) => window.octavo.importPaths(paths), inputs)
  console.log('import', result)
  await page.waitForSelector('.card')
  await page.waitForFunction(() => !document.querySelector('.indexing'), null, { timeout: 120000 })
  await page.waitForTimeout(800)
  await page.screenshot({ path: join(out, 'gallery.png') })

  const files = await page.evaluate(async () => (await window.octavo.library()).files)
  for (const f of files) {
    console.log(`\n${f.format.toUpperCase()} ${f.path}`)
    console.log(`  meta: ${JSON.stringify(f.meta)}${f.indexError ? `  error: ${f.indexError}` : ''}  cover: ${f.hasCover}`)
  }

  const bookIds = await page.$$eval('.card', (els) => els.map((e) => (e as HTMLElement).dataset.book!))
  for (const [n, id] of bookIds.entries()) {
    await page.click(`.card[data-book="${id}"]`)
    await page.waitForSelector('.reader', { timeout: 10000 })
    const formats = (await page.$('.reader .seg[aria-label="Format"]')) ? ['epub', 'pdf'] : [null]
    for (const format of formats) {
      if (format) await page.click(`.reader .seg button:has-text("${format.toUpperCase()}")`)
      await page.waitForFunction(() => !document.querySelector('.reader__loading'), null, { timeout: 60000 })
      await page.waitForTimeout(1500)
      const title = await page.$eval('.titlebar__title strong', (e) => e.textContent ?? '')
      const stem = `${n + 1}-${format ?? 'book'}`
      console.log(`\n${title} (${format ?? 'single file'})`)
      await page.screenshot({ path: join(out, `${stem}-1.png`) })
      for (let i = 0; i < 4; i++) {
        await page.keyboard.press('PageDown')
        await page.waitForTimeout(400)
      }
      await page.waitForTimeout(800)
      await page.screenshot({ path: join(out, `${stem}-2.png`) })
      await page.click('.reader button[title^="Contents, bookmarks"]')
      await page.waitForTimeout(500)
      const toc = await page.$$eval('.toc-item', (els) => els.map((e) => e.textContent))
      console.log(`  contents: ${toc.length} entries: ${toc.slice(0, 6).join(' | ')}`)
      console.log(`  footer: ${await page.$eval('.reader__footer', (e) => (e as HTMLElement).innerText.replace(/\s+/g, ' '))}`)
      const overflow = await page.evaluate(() => {
        const c = document.querySelector<HTMLElement>('.pdf-container')
        if (!c) return null
        const pageEl = c.querySelector<HTMLElement>('.page')
        const cs = pageEl ? getComputedStyle(pageEl) : null
        return {
          scrollWidth: c.scrollWidth,
          clientWidth: c.clientWidth,
          viewer: c.querySelector<HTMLElement>('.pdfViewer')?.scrollWidth,
          page: pageEl?.getBoundingClientRect().width,
          pageMargin: cs?.margin,
          pageBorder: cs?.borderWidth
        }
      })
      if (overflow) console.log(`  pdf layout: ${JSON.stringify(overflow)}`)
      await page.screenshot({ path: join(out, `${stem}-3-contents.png`) })
      await page.click('.reader button[title^="Contents, bookmarks"]')
    }
    await page.keyboard.press('Escape')
    await page.waitForSelector('.gallery')
  }
  await app.close()
  console.log(problems.length ? `\nRenderer problems:\n  ${problems.join('\n  ')}` : '\nNo renderer errors.')
  console.log(`Screenshots in ${out}`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
