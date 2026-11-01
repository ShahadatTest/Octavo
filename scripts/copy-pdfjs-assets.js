// Copies the runtime assets pdf.js fetches on demand (standard fonts, CMaps, ICC profiles and
// wasm image decoders) into the renderer's public folder, so they ship next to the bundle.
const { cpSync, existsSync, mkdirSync, rmSync } = require('node:fs')
const { join } = require('node:path')

const root = join(__dirname, '..')
const src = join(root, 'node_modules', 'pdfjs-dist')
const dest = join(root, 'src', 'renderer', 'public', 'pdfjs')

if (!existsSync(src)) {
  console.error('pdfjs-dist is not installed; run npm install first.')
  process.exit(1)
}

rmSync(dest, { recursive: true, force: true })
mkdirSync(dest, { recursive: true })
for (const dir of ['standard_fonts', 'cmaps', 'iccs', 'wasm']) {
  cpSync(join(src, dir), join(dest, dir), { recursive: true })
}
console.log(`pdf.js assets copied to ${dest}`)
