import { z } from 'zod'

/**
 * Shared domain types + zod schemas. Used by the main process (validating IPC
 * payloads) and the renderer (typing the preload API). Keep this the single
 * source of truth for the data model described in the project plan.
 */

export const DesignType = z.enum(['RCB', 'CRD'])
export type DesignType = z.infer<typeof DesignType>

export const MeanComparisonTest = z.enum(['LSD', 'TUKEY', 'DUNCAN', 'SNK'])
export type MeanComparisonTest = z.infer<typeof MeanComparisonTest>

export const AlphaLevel = z.union([z.literal(0.01), z.literal(0.05), z.literal(0.1)])
export type AlphaLevel = z.infer<typeof AlphaLevel>

// ---------------------------------------------------------------------------
// Protocol
// ---------------------------------------------------------------------------
export const Protocol = z.object({
  id: z.number().int().optional(),
  title: z.string().default(''),
  crop: z.string().default(''),
  targetPest: z.string().default(''),
  objective: z.string().default(''),
  investigator: z.string().default(''),
  season: z.string().default(''),
  notes: z.string().default('')
})
export type Protocol = z.infer<typeof Protocol>

export const Treatment = z.object({
  id: z.number().int().optional(),
  number: z.number().int().positive(),
  name: z.string().default(''),
  product: z.string().default(''),
  rate: z.string().default(''),
  rateUnit: z.string().default(''),
  type: z.string().default('')
})
export type Treatment = z.infer<typeof Treatment>

export const Application = z.object({
  id: z.number().int().optional(),
  timingCode: z.string().default(''),
  description: z.string().default(''),
  plannedDate: z.string().default(''),
  growthStage: z.string().default('')
})
export type Application = z.infer<typeof Application>

// ---------------------------------------------------------------------------
// Trial + layout
// ---------------------------------------------------------------------------
export const Trial = z.object({
  id: z.number().int().optional(),
  protocolId: z.number().int(),
  design: DesignType,
  replicates: z.number().int().min(2).max(20),
  plotRows: z.number().int().positive(),
  plotCols: z.number().int().positive(),
  plotWidth: z.number().default(0),
  plotLength: z.number().default(0),
  seed: z.number().int()
})
export type Trial = z.infer<typeof Trial>

export const Plot = z.object({
  id: z.number().int().optional(),
  trialId: z.number().int(),
  plotNumber: z.number().int(),
  rep: z.number().int(),
  treatmentId: z.number().int(),
  mapRow: z.number().int(),
  mapCol: z.number().int()
})
export type Plot = z.infer<typeof Plot>

// ---------------------------------------------------------------------------
// Assessments
// ---------------------------------------------------------------------------
export const AssessmentHeader = z.object({
  id: z.number().int().optional(),
  trialId: z.number().int(),
  partRated: z.string().default(''),
  ratingType: z.string().default(''),
  ratingUnit: z.string().default(''),
  timing: z.string().default(''),
  ratingDate: z.string().default(''),
  description: z.string().default(''),
  ordinal: z.number().int().default(0)
})
export type AssessmentHeader = z.infer<typeof AssessmentHeader>

export const AssessmentValue = z.object({
  assessmentHeaderId: z.number().int(),
  plotId: z.number().int(),
  value: z.number().nullable()
})
export type AssessmentValue = z.infer<typeof AssessmentValue>

// ---------------------------------------------------------------------------
// Randomization request/response (main <-> R)
// ---------------------------------------------------------------------------
export const RandomizeRequest = z.object({
  design: DesignType,
  treatments: z.number().int().min(2),
  replicates: z.number().int().min(2),
  seed: z.number().int()
})
export type RandomizeRequest = z.infer<typeof RandomizeRequest>

/** One randomized plot as returned by R: order = field order (plot sequence). */
export interface RandomizedPlot {
  order: number
  rep: number
  treatment: number // treatment *number* (1-based), mapped to treatmentId by caller
}

// ---------------------------------------------------------------------------
// ANOVA request/response
// ---------------------------------------------------------------------------
export const AovRequest = z.object({
  design: DesignType,
  test: MeanComparisonTest,
  alpha: AlphaLevel,
  /** Long-form observations. treatment = 1-based number, rep = 1-based block. */
  data: z.array(
    z.object({
      treatment: z.number().int(),
      rep: z.number().int(),
      value: z.number()
    })
  )
})
export type AovRequest = z.infer<typeof AovRequest>

export interface AovAnovaRow {
  source: string
  df: number
  ss: number
  ms: number
  f: number | null
  pValue: number | null
}

export interface TreatmentMean {
  treatment: number
  mean: number
  n: number
  std: number
  /** Mean-separation grouping letters, e.g. "a", "ab". */
  group: string
}

export interface AovResult {
  anova: AovAnovaRow[]
  means: TreatmentMean[]
  grandMean: number
  cv: number // coefficient of variation, percent
  lsd: number | null // critical value (LSD or HSD depending on test)
  criticalValueLabel: string // "LSD (0.05)" / "HSD (0.05)" etc.
  stdError: number
  test: MeanComparisonTest
  alpha: AlphaLevel
  significant: boolean // treatment effect significant at alpha
}

// ---------------------------------------------------------------------------
// Environment / R detection
// ---------------------------------------------------------------------------
export interface REnvStatus {
  rscriptFound: boolean
  rscriptPath: string | null
  version: string | null
  agricolaeInstalled: boolean
  message: string
}

// ---------------------------------------------------------------------------
// Project bundle (everything the renderer needs after opening a file)
// ---------------------------------------------------------------------------
export interface ProjectSnapshot {
  filePath: string
  protocol: Protocol
  treatments: Treatment[]
  applications: Application[]
  trial: Trial | null
  plots: Plot[]
  assessmentHeaders: AssessmentHeader[]
  assessmentValues: AssessmentValue[]
}

/** Standard envelope returned by the R runner. */
export interface RResponse<T> {
  ok: boolean
  result?: T
  error?: string
}
