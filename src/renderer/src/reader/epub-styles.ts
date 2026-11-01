import literataUrl from '@fontsource-variable/literata/files/literata-latin-wght-normal.woff2?url'
import literataItalicUrl from '@fontsource-variable/literata/files/literata-latin-wght-italic.woff2?url'
import interUrl from '@fontsource-variable/inter/files/inter-latin-wght-normal.woff2?url'
import interItalicUrl from '@fontsource-variable/inter/files/inter-latin-wght-italic.woff2?url'
import type { ReaderSettings, ReaderTheme } from '@shared/types'

interface Palette {
  bg: string
  fg: string
  link: string
  line: string
  code: string
  dark: boolean
}

export const PALETTES: Record<ReaderTheme, Palette> = {
  paper: { bg: '#fbfaf6', fg: '#1d1c1a', link: '#9b3b20', line: 'rgba(0,0,0,.14)', code: '#f1efe8', dark: false },
  sepia: { bg: '#f4e9d3', fg: '#4a3826', link: '#8a4a1f', line: 'rgba(74,56,38,.2)', code: '#ecdfc4', dark: false },
  night: { bg: '#161615', fg: '#d9d4c7', link: '#e39a76', line: 'rgba(255,255,255,.14)', code: '#22221f', dark: true }
}

// Book pages are blob: documents, so the faces need absolute URLs to resolve there.
const abs = (url: string): string => new URL(url, document.baseURI).href

const FONT_FACES = `
@font-face { font-family: 'Octavo Serif'; src: url('${abs(literataUrl)}') format('woff2'); font-weight: 200 900; font-style: normal; }
@font-face { font-family: 'Octavo Serif'; src: url('${abs(literataItalicUrl)}') format('woff2'); font-weight: 200 900; font-style: italic; }
@font-face { font-family: 'Octavo Sans'; src: url('${abs(interUrl)}') format('woff2'); font-weight: 100 900; font-style: normal; }
@font-face { font-family: 'Octavo Sans'; src: url('${abs(interItalicUrl)}') format('woff2'); font-weight: 100 900; font-style: italic; }
`

const FAMILIES = {
  serif: `'Octavo Serif', Georgia, serif`,
  sans: `'Octavo Sans', system-ui, sans-serif`
}

/**
 * The stylesheet injected into every book page. Paper keeps the publisher's colours; sepia and night
 * repaint text and backgrounds, because a dark theme over a book's own colours is unreadable.
 */
export function epubStyles(s: ReaderSettings): string {
  const p = PALETTES[s.theme]
  const repaint = s.theme !== 'paper'
  const family = s.font === 'publisher' ? null : FAMILIES[s.font]
  return `${FONT_FACES}
:root {
  color-scheme: ${p.dark ? 'dark' : 'light'};
  --overlayer-highlight-opacity: ${p.dark ? 0.4 : 0.45};
  --overlayer-highlight-blend-mode: ${p.dark ? 'screen' : 'multiply'};
}
html {
  font-size: ${s.fontSize}px !important;
  /* Transparent, so the reader's own themed background shows through. foliate-js samples a page's
     background once, when the section loads, and would keep painting the margins with a stale one. */
  background: transparent !important;
  color: ${p.fg} !important;
}
body {
  background: transparent !important;
  color: ${p.fg} !important;
}
${
  repaint
    ? `:where(body *:not(img, svg, svg *, video, math, math *)) {
  color: inherit !important;
  background-color: transparent !important;
  border-color: ${p.line} !important;
}
pre { background: ${p.code} !important; }`
    : ''
}
a:any-link { color: ${p.link} !important; }
${
  family
    ? `body, :where(body :not(pre, pre *, code, code *, kbd, samp, tt, math, math *)) { font-family: ${family} !important; }`
    : ''
}
p, li, blockquote, dd { line-height: ${s.lineHeight} !important; }
p {
  text-align: ${s.justify ? 'justify' : 'start'};
  hyphens: ${s.justify ? 'auto' : 'manual'};
  widows: 2;
  orphans: 2;
}
[align="left"] { text-align: left; }
[align="right"] { text-align: right; }
[align="center"] { text-align: center; }
pre { white-space: pre-wrap !important; overflow-wrap: anywhere; }
${p.dark ? 'img { filter: brightness(0.88); }' : ''}
::selection { background: ${p.dark ? 'rgba(224,112,79,.45)' : 'rgba(181,70,42,.24)'}; }
`
}
