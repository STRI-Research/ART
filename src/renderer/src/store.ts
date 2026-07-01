import { create } from 'zustand'
import type { ProjectSnapshot, REnvStatus, AovResult } from '@shared/types'

export type ViewId = 'protocol' | 'trialmap' | 'assessments' | 'stats' | 'report'

export interface LastAov {
  headerId: number
  result: AovResult
}

interface AppState {
  snapshot: ProjectSnapshot | null
  view: ViewId
  rEnv: REnvStatus | null
  busy: string | null // label of an in-flight operation, or null
  error: string | null
  lastAov: LastAov | null

  setView: (v: ViewId) => void
  setSnapshot: (s: ProjectSnapshot | null) => void
  setREnv: (s: REnvStatus | null) => void
  setError: (e: string | null) => void
  setLastAov: (a: LastAov | null) => void
  /** Run an async op with a busy label + centralized error capture. */
  run: <T>(label: string, fn: () => Promise<T>) => Promise<T | undefined>
}

export const useStore = create<AppState>((set) => ({
  snapshot: null,
  view: 'protocol',
  rEnv: null,
  busy: null,
  error: null,
  lastAov: null,

  setView: (view) => set({ view }),
  setSnapshot: (snapshot) => set({ snapshot }),
  setREnv: (rEnv) => set({ rEnv }),
  setError: (error) => set({ error }),
  setLastAov: (lastAov) => set({ lastAov }),

  run: async (label, fn) => {
    set({ busy: label, error: null })
    try {
      return await fn()
    } catch (e) {
      set({ error: e instanceof Error ? e.message : String(e) })
      return undefined
    } finally {
      set({ busy: null })
    }
  }
}))
