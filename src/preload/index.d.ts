import type { ArmApi } from './index.js'

declare global {
  interface Window {
    arm: ArmApi
  }
}

export {}
