// Drives an already running `npm run dev` (started with REMOTE_DEBUGGING_PORT=9333 and a throwaway
// OCTAVO_USER_DATA / OCTAVO_LIBRARY_DIR): imports the fixtures, opens an EPUB and a PDF, reports errors.
import { join } from 'node:path'
import { chromium } from 'playwright-core'

async function main(): Promise<void> {
  const fixtures = join(__dirname, '..', 'e2e', 'fixtures')
  let browser
  for (let i = 0; i < 60 && !browser; i++) {
    browser = await chromium.connectOverCDP('http://127.0.0.1:9333').catch(() => undefined)
    if (!browser) await new Promise((r) => setTimeout(r, 1000))
  }
  if (!browser) throw new Error('No dev app on port 9333')
  const page = browser.contexts()[0].pages().find((p) => p.url().startsWith('http://localhost'))!
  const problems: string[] = []
  page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`))
  page.on('console', (m) => (m.type() === 'error' || m.type() === 'warning') && problems.push(`console ${m.type()}: ${m.text()}`))
  await page.reload()
  await page.waitForSelector('.titlebar')
  console.log('url', page.url())
  const result = await page.evaluate((paths) => window.octavo.importPaths(paths), [join(fixtures, 'drop')])
  console.log('import', result)
  await page.waitForFunction(() => document.querySelectorAll('.card').length >= 2 && !document.querySelector('.indexing'), null, { timeout: 60000 })
  await page.click('.card[title="The Lighthouse Keeper"]')
  await page.waitForFunction(() => !document.querySelector('.reader__loading') && !document.querySelector('.reader__error'), null, { timeout: 30000 })
  await page.waitForTimeout(1500)
  await page.click('.reader .seg button:has-text("PDF")')
  await page.waitForSelector('.pdf-container .textLayer span', { timeout: 30000 })
  console.log('epub and pdf opened in dev')
  await page.screenshot({ path: join(__dirname, '..', 'screenshots', 'dev-pdf.png') })
  console.log(problems.length ? `problems:\n  ${problems.join('\n  ')}` : 'No renderer errors or warnings.')
  await browser.close()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
