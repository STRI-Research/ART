import { runRScript } from './run.js'
import {
  RandomizeRequest,
  AovRequest,
  type RandomizedPlot,
  type AovResult
} from '@shared/types.js'

export const ENGINE_VERSION = 'R+agricolae'

/** Ask R to produce a randomized layout. Throws on any R-side error. */
export async function randomize(req: RandomizeRequest): Promise<RandomizedPlot[]> {
  const parsed = RandomizeRequest.parse(req)
  const res = await runRScript<RandomizeRequest, RandomizedPlot[]>('randomize.R', parsed)
  if (!res.ok || !res.result) {
    throw new Error(res.error || 'Randomization failed')
  }
  return res.result
}

/** Run ANOVA + mean comparison in R. Throws on any R-side error. */
export async function runAov(req: AovRequest): Promise<AovResult> {
  const parsed = AovRequest.parse(req)
  const res = await runRScript<AovRequest, AovResult>('aov.R', parsed)
  if (!res.ok || !res.result) {
    throw new Error(res.error || 'ANOVA failed')
  }
  return res.result
}
