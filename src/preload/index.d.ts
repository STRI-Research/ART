import type { ArtApi } from './index.js'

declare global {
  interface Window {
    art: ArtApi
  }
}

export {}
