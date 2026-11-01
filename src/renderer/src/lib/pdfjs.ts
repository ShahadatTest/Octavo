import * as pdfjsLib from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import type { PDFDocumentProxy } from 'pdfjs-dist'

// pdf_viewer.mjs reads the library from this global instead of importing it.
;(globalThis as unknown as { pdfjsLib: typeof pdfjsLib }).pdfjsLib = pdfjsLib
pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl

export { pdfjsLib }

/** Fonts, CMaps, ICC profiles and wasm decoders, copied next to the bundle by scripts/copy-pdfjs-assets.js. */
const asset = (dir: string): string => new URL(`pdfjs/${dir}/`, document.baseURI).href

export function openPdf(data: ArrayBuffer): Promise<PDFDocumentProxy> {
  return pdfjsLib.getDocument({
    data: new Uint8Array(data),
    cMapUrl: asset('cmaps'),
    cMapPacked: true,
    standardFontDataUrl: asset('standard_fonts'),
    wasmUrl: asset('wasm'),
    iccUrl: asset('iccs'),
    enableXfa: false
  }).promise
}

let viewerModule: Promise<typeof import('pdfjs-dist/web/pdf_viewer.mjs')> | null = null

/** The viewer components, loaded after the global above is in place. */
export function loadViewer(): Promise<typeof import('pdfjs-dist/web/pdf_viewer.mjs')> {
  viewerModule ??= import('pdfjs-dist/web/pdf_viewer.mjs')
  return viewerModule
}
