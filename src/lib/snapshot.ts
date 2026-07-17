import type { ProjectSnapshot } from '@shared/types'
import type { TrialSnapshot } from '@/lib/api'

/**
 * Adapts this web app's per-trial fetch bundle (`TrialSnapshot`, from `GET /api/trial/[id]`) into the
 * `ProjectSnapshot` shape the ported `@shared/derive.ts` and `lib/stats/buildData.ts` helpers expect
 * (the shape the original Electron app kept in its renderer store). This app has no per-file
 * `filePath`/`role` or a per-trial library-term snapshot, so those are filled with harmless defaults.
 */
export function toProjectSnapshot(snap: TrialSnapshot): ProjectSnapshot {
  return { filePath: '', role: 'trial', libraryTerms: [], ...snap }
}
