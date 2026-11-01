/// <reference types="vite/client" />
import type { OctavoApi } from '@shared/types'

declare global {
  interface Window {
    octavo: OctavoApi
  }
}

export {}
