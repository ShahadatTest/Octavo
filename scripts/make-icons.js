// Renders resources/icon.svg into the icon files the window and the installers use:
//   resources/icon.png   1024 px, Linux builds and the dev window on Linux/macOS
//   resources/icon.ico   Windows (window, taskbar, installer, exe)
//   resources/icon.icns  macOS bundle
// Run with: npm run icons   (after editing icon.svg)
const fs = require('node:fs')
const path = require('node:path')
const sharp = require('sharp')
const png2icons = require('png2icons')

const resources = path.resolve(__dirname, '..', 'resources')

async function main() {
  const svg = fs.readFileSync(path.join(resources, 'icon.svg'))
  const png = await sharp(svg, { density: 384 }).resize(1024, 1024).png().toBuffer()
  fs.writeFileSync(path.join(resources, 'icon.png'), png)

  // Classic Windows layout: BMP entries for the small sizes, PNG for 256 px.
  const ico = png2icons.createICO(png, png2icons.BICUBIC2, 0, false, true)
  const icns = png2icons.createICNS(png, png2icons.BICUBIC2, 0)
  if (!ico || !icns) throw new Error('Icon conversion failed.')
  fs.writeFileSync(path.join(resources, 'icon.ico'), ico)
  fs.writeFileSync(path.join(resources, 'icon.icns'), icns)

  const kb = (buf) => `${(buf.length / 1024).toFixed(0)} kB`
  console.log(`icon.png ${kb(png)}, icon.ico ${kb(ico)} (${ico.readUInt16LE(4)} sizes), icon.icns ${kb(icns)}`)
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
})
