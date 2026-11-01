import { resolve } from 'node:path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    resolve: { alias: { '@shared': resolve('src/shared') } }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    resolve: { alias: { '@shared': resolve('src/shared') } }
  },
  renderer: {
    resolve: {
      alias: {
        '@': resolve('src/renderer/src'),
        '@shared': resolve('src/shared')
      }
    },
    // pdf.js fetches its fonts, CMaps and wasm decoders at runtime; scripts/copy-pdfjs-assets.js
    // copies them here before every dev and build run.
    publicDir: resolve('src/renderer/public'),
    // foliate-js loads its zip reader with relative dynamic imports, which pre-bundling breaks.
    optimizeDeps: { exclude: ['foliate-js'] },
    build: { target: 'esnext' },
    worker: { format: 'es' },
    plugins: [react()]
  }
})
