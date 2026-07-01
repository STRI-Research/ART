import type Database from 'better-sqlite3'
import { getDb } from './connection.js'
import type {
  Protocol,
  Treatment,
  Application,
  Trial,
  Plot,
  AssessmentHeader,
  AssessmentValue,
  ProjectSnapshot
} from '@shared/types.js'
import { getCurrentPath } from './connection.js'

/**
 * Data-access layer. All row mapping between snake_case columns and camelCase
 * domain types lives here so the rest of main/ never touches raw SQL rows.
 */

// --- Protocol (singleton row id = 1) ---------------------------------------
export function getProtocol(db: Database.Database = getDb()): Protocol {
  const r = db
    .prepare(
      `SELECT title, crop, target_pest, objective, investigator, season, notes FROM protocol WHERE id = 1`
    )
    .get() as Record<string, string>
  return {
    id: 1,
    title: r.title,
    crop: r.crop,
    targetPest: r.target_pest,
    objective: r.objective,
    investigator: r.investigator,
    season: r.season,
    notes: r.notes
  }
}

export function saveProtocol(p: Protocol, db: Database.Database = getDb()): void {
  db.prepare(
    `UPDATE protocol SET title=@title, crop=@crop, target_pest=@targetPest,
       objective=@objective, investigator=@investigator, season=@season, notes=@notes
     WHERE id = 1`
  ).run({
    title: p.title,
    crop: p.crop,
    targetPest: p.targetPest,
    objective: p.objective,
    investigator: p.investigator,
    season: p.season,
    notes: p.notes
  })
}

// --- Treatments -------------------------------------------------------------
export function listTreatments(db: Database.Database = getDb()): Treatment[] {
  const rows = db
    .prepare(`SELECT * FROM treatment ORDER BY number`)
    .all() as Record<string, unknown>[]
  return rows.map((r) => ({
    id: r.id as number,
    number: r.number as number,
    name: r.name as string,
    product: r.product as string,
    rate: r.rate as string,
    rateUnit: r.rate_unit as string,
    type: r.type as string
  }))
}

/** Replace the entire treatment list in one transaction (simplest to keep in sync with UI). */
export function replaceTreatments(treatments: Treatment[], db: Database.Database = getDb()): void {
  const tx = db.transaction((items: Treatment[]) => {
    db.prepare('DELETE FROM treatment').run()
    const ins = db.prepare(
      `INSERT INTO treatment (number, name, product, rate, rate_unit, type)
       VALUES (@number, @name, @product, @rate, @rateUnit, @type)`
    )
    for (const t of items) {
      ins.run({
        number: t.number,
        name: t.name,
        product: t.product,
        rate: t.rate,
        rateUnit: t.rateUnit,
        type: t.type
      })
    }
  })
  tx(treatments)
}

// --- Applications -----------------------------------------------------------
export function listApplications(db: Database.Database = getDb()): Application[] {
  const rows = db.prepare(`SELECT * FROM application ORDER BY id`).all() as Record<string, unknown>[]
  return rows.map((r) => ({
    id: r.id as number,
    timingCode: r.timing_code as string,
    description: r.description as string,
    plannedDate: r.planned_date as string,
    growthStage: r.growth_stage as string
  }))
}

export function replaceApplications(apps: Application[], db: Database.Database = getDb()): void {
  const tx = db.transaction((items: Application[]) => {
    db.prepare('DELETE FROM application').run()
    const ins = db.prepare(
      `INSERT INTO application (timing_code, description, planned_date, growth_stage)
       VALUES (@timingCode, @description, @plannedDate, @growthStage)`
    )
    for (const a of items) ins.run(a)
  })
  tx(apps)
}

// --- Trial ------------------------------------------------------------------
export function getTrial(db: Database.Database = getDb()): Trial | null {
  const r = db.prepare(`SELECT * FROM trial ORDER BY id DESC LIMIT 1`).get() as
    | Record<string, unknown>
    | undefined
  if (!r) return null
  return {
    id: r.id as number,
    protocolId: r.protocol_id as number,
    design: r.design as Trial['design'],
    replicates: r.replicates as number,
    plotRows: r.plot_rows as number,
    plotCols: r.plot_cols as number,
    plotWidth: r.plot_width as number,
    plotLength: r.plot_length as number,
    seed: r.seed as number
  }
}

/** Persist a freshly generated trial + its plots, replacing any prior trial. */
export function replaceTrialWithPlots(
  trial: Omit<Trial, 'id'>,
  plots: Omit<Plot, 'id' | 'trialId'>[],
  db: Database.Database = getDb()
): number {
  const tx = db.transaction(() => {
    db.prepare('DELETE FROM trial').run() // cascades to plot / assessment_header / values
    const info = db
      .prepare(
        `INSERT INTO trial (protocol_id, design, replicates, plot_rows, plot_cols, plot_width, plot_length, seed)
         VALUES (@protocolId, @design, @replicates, @plotRows, @plotCols, @plotWidth, @plotLength, @seed)`
      )
      .run(trial)
    const trialId = info.lastInsertRowid as number
    const ins = db.prepare(
      `INSERT INTO plot (trial_id, plot_number, rep, treatment_id, map_row, map_col)
       VALUES (@trialId, @plotNumber, @rep, @treatmentId, @mapRow, @mapCol)`
    )
    for (const p of plots) ins.run({ ...p, trialId })
    return trialId
  })
  return tx()
}

export function listPlots(trialId: number, db: Database.Database = getDb()): Plot[] {
  const rows = db
    .prepare(`SELECT * FROM plot WHERE trial_id = ? ORDER BY plot_number`)
    .all(trialId) as Record<string, unknown>[]
  return rows.map((r) => ({
    id: r.id as number,
    trialId: r.trial_id as number,
    plotNumber: r.plot_number as number,
    rep: r.rep as number,
    treatmentId: r.treatment_id as number,
    mapRow: r.map_row as number,
    mapCol: r.map_col as number
  }))
}

/** Swap the treatment assignment of two plots (ARM-style hot edit). */
export function swapPlotTreatments(plotIdA: number, plotIdB: number, db: Database.Database = getDb()): void {
  const tx = db.transaction(() => {
    const a = db.prepare('SELECT treatment_id FROM plot WHERE id = ?').get(plotIdA) as
      | { treatment_id: number }
      | undefined
    const b = db.prepare('SELECT treatment_id FROM plot WHERE id = ?').get(plotIdB) as
      | { treatment_id: number }
      | undefined
    if (!a || !b) throw new Error('Plot not found for swap')
    db.prepare('UPDATE plot SET treatment_id = ? WHERE id = ?').run(b.treatment_id, plotIdA)
    db.prepare('UPDATE plot SET treatment_id = ? WHERE id = ?').run(a.treatment_id, plotIdB)
  })
  tx()
}

// --- Assessments ------------------------------------------------------------
export function listAssessmentHeaders(
  trialId: number,
  db: Database.Database = getDb()
): AssessmentHeader[] {
  const rows = db
    .prepare(`SELECT * FROM assessment_header WHERE trial_id = ? ORDER BY ordinal, id`)
    .all(trialId) as Record<string, unknown>[]
  return rows.map((r) => ({
    id: r.id as number,
    trialId: r.trial_id as number,
    partRated: r.part_rated as string,
    ratingType: r.rating_type as string,
    ratingUnit: r.rating_unit as string,
    timing: r.timing as string,
    ratingDate: r.rating_date as string,
    description: r.description as string,
    ordinal: r.ordinal as number
  }))
}

export function upsertAssessmentHeader(
  h: AssessmentHeader,
  db: Database.Database = getDb()
): number {
  if (h.id) {
    db.prepare(
      `UPDATE assessment_header SET part_rated=@partRated, rating_type=@ratingType,
        rating_unit=@ratingUnit, timing=@timing, rating_date=@ratingDate,
        description=@description, ordinal=@ordinal WHERE id=@id`
    ).run(h)
    return h.id
  }
  const info = db
    .prepare(
      `INSERT INTO assessment_header (trial_id, part_rated, rating_type, rating_unit, timing, rating_date, description, ordinal)
       VALUES (@trialId, @partRated, @ratingType, @ratingUnit, @timing, @ratingDate, @description, @ordinal)`
    )
    .run(h)
  return info.lastInsertRowid as number
}

export function deleteAssessmentHeader(id: number, db: Database.Database = getDb()): void {
  db.prepare('DELETE FROM assessment_header WHERE id = ?').run(id)
}

export function listAssessmentValues(
  trialId: number,
  db: Database.Database = getDb()
): AssessmentValue[] {
  const rows = db
    .prepare(
      `SELECT av.assessment_header_id, av.plot_id, av.value
       FROM assessment_value av
       JOIN plot p ON p.id = av.plot_id
       WHERE p.trial_id = ?`
    )
    .all(trialId) as Record<string, unknown>[]
  return rows.map((r) => ({
    assessmentHeaderId: r.assessment_header_id as number,
    plotId: r.plot_id as number,
    value: r.value as number | null
  }))
}

/** Set (or clear) one cell. A null value deletes the row. */
export function setAssessmentValue(v: AssessmentValue, db: Database.Database = getDb()): void {
  if (v.value === null || Number.isNaN(v.value)) {
    db.prepare(
      'DELETE FROM assessment_value WHERE assessment_header_id = ? AND plot_id = ?'
    ).run(v.assessmentHeaderId, v.plotId)
    return
  }
  db.prepare(
    `INSERT INTO assessment_value (assessment_header_id, plot_id, value)
     VALUES (@assessmentHeaderId, @plotId, @value)
     ON CONFLICT (assessment_header_id, plot_id) DO UPDATE SET value = excluded.value`
  ).run(v)
}

// --- Analysis cache ---------------------------------------------------------
export function saveAnalysisResult(
  assessmentHeaderId: number,
  engineVersion: string,
  params: unknown,
  result: unknown,
  db: Database.Database = getDb()
): void {
  db.prepare(
    `INSERT INTO analysis_result (assessment_header_id, engine_version, params_json, result_json)
     VALUES (?, ?, ?, ?)`
  ).run(assessmentHeaderId, engineVersion, JSON.stringify(params), JSON.stringify(result))
}

// --- Full snapshot ----------------------------------------------------------
export function snapshot(db: Database.Database = getDb()): ProjectSnapshot {
  const trial = getTrial(db)
  return {
    filePath: getCurrentPath() ?? '',
    protocol: getProtocol(db),
    treatments: listTreatments(db),
    applications: listApplications(db),
    trial,
    plots: trial ? listPlots(trial.id!, db) : [],
    assessmentHeaders: trial ? listAssessmentHeaders(trial.id!, db) : [],
    assessmentValues: trial ? listAssessmentValues(trial.id!, db) : []
  }
}
