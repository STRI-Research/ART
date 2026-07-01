import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { openProject, closeProject } from './connection.js'
import * as dao from './dao.js'
import type { Treatment, Trial, Plot } from '@shared/types.js'

let dir: string

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'openarm-'))
  openProject(join(dir, 'test.armdb'))
})

afterEach(() => {
  closeProject()
  rmSync(dir, { recursive: true, force: true })
})

describe('protocol', () => {
  it('creates a singleton protocol row and round-trips fields', () => {
    const p = dao.getProtocol()
    expect(p.id).toBe(1)
    dao.saveProtocol({ ...p, title: 'Corn Rust Trial', crop: 'Corn' })
    expect(dao.getProtocol().title).toBe('Corn Rust Trial')
    expect(dao.getProtocol().crop).toBe('Corn')
  })
})

describe('treatments', () => {
  it('replaces the full treatment list and reads it back ordered by number', () => {
    const list: Treatment[] = [
      { number: 2, name: 'Product B' },
      { number: 1, name: 'Untreated' },
      { number: 3, name: 'Product C' }
    ].map((t) => ({ ...t, product: '', rate: '', rateUnit: '', type: '' }))
    dao.replaceTreatments(list)
    const back = dao.listTreatments()
    expect(back.map((t) => t.number)).toEqual([1, 2, 3])
    expect(back[0].name).toBe('Untreated')
  })
})

describe('trial + plots + assessments', () => {
  function seedTrial(): { headerId: number; plots: Plot[] } {
    dao.replaceTreatments(
      [1, 2, 3].map((n) => ({
        number: n,
        name: `T${n}`,
        product: '',
        rate: '',
        rateUnit: '',
        type: ''
      }))
    )
    const treatments = dao.listTreatments()
    const trial: Omit<Trial, 'id'> = {
      protocolId: 1,
      design: 'RCB',
      replicates: 2,
      plotRows: 2,
      plotCols: 3,
      plotWidth: 0,
      plotLength: 0,
      seed: 42
    }
    // 2 reps x 3 treatments = 6 plots, row-major.
    const plots = treatments.flatMap((t, i) =>
      [1, 2].map((rep) => ({
        plotNumber: rep * 10 + i,
        rep,
        treatmentId: t.id!,
        mapRow: rep - 1,
        mapCol: i
      }))
    )
    const trialId = dao.replaceTrialWithPlots(trial, plots)
    const headerId = dao.upsertAssessmentHeader({
      trialId,
      partRated: 'PLANT',
      ratingType: 'CONTRO',
      ratingUnit: '%',
      timing: '14 DA-A',
      ratingDate: '',
      description: 'Control',
      ordinal: 0
    })
    return { headerId, plots: dao.listPlots(trialId) }
  }

  it('persists a trial with plots and cascades on replace', () => {
    const { plots } = seedTrial()
    expect(plots).toHaveLength(6)
    // Regenerating replaces the trial (old plots gone).
    dao.replaceTrialWithPlots(
      { protocolId: 1, design: 'CRD', replicates: 2, plotRows: 1, plotCols: 6, plotWidth: 0, plotLength: 0, seed: 1 },
      []
    )
    const trial = dao.getTrial()
    expect(trial?.design).toBe('CRD')
    expect(dao.listPlots(trial!.id!)).toHaveLength(0)
  })

  it('sets, updates, and clears assessment values', () => {
    const { headerId, plots } = seedTrial()
    dao.setAssessmentValue({ assessmentHeaderId: headerId, plotId: plots[0].id!, value: 12.5 })
    dao.setAssessmentValue({ assessmentHeaderId: headerId, plotId: plots[1].id!, value: 8 })
    let values = dao.listAssessmentValues(plots[0].trialId)
    expect(values).toHaveLength(2)

    // Update existing cell.
    dao.setAssessmentValue({ assessmentHeaderId: headerId, plotId: plots[0].id!, value: 99 })
    values = dao.listAssessmentValues(plots[0].trialId)
    expect(values.find((v) => v.plotId === plots[0].id)!.value).toBe(99)

    // Null clears the cell.
    dao.setAssessmentValue({ assessmentHeaderId: headerId, plotId: plots[0].id!, value: null })
    expect(dao.listAssessmentValues(plots[0].trialId)).toHaveLength(1)
  })

  it('swaps treatment assignments between two plots', () => {
    const { plots } = seedTrial()
    const [a, b] = plots
    const beforeA = a.treatmentId
    const beforeB = b.treatmentId
    dao.swapPlotTreatments(a.id!, b.id!)
    const after = dao.listPlots(a.trialId)
    expect(after.find((p) => p.id === a.id)!.treatmentId).toBe(beforeB)
    expect(after.find((p) => p.id === b.id)!.treatmentId).toBe(beforeA)
  })

  it('builds a complete snapshot', () => {
    seedTrial()
    const snap = dao.snapshot()
    expect(snap.treatments).toHaveLength(3)
    expect(snap.plots).toHaveLength(6)
    expect(snap.assessmentHeaders).toHaveLength(1)
    expect(snap.trial?.design).toBe('RCB')
  })
})
