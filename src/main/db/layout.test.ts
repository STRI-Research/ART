import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { openProject, closeProject } from './connection.js'
import { Treatment } from '@shared/types.js'
import * as dao from './dao.js'

const SITE = {
  siteName: '',
  operator: '',
  location: '',
  city: '',
  state: '',
  country: '',
  plantingDate: '',
  trialNotes: ''
}

let dir: string
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'art-layout-'))
  openProject(join(dir, 't.arttrial'))
})
afterEach(() => {
  closeProject()
  rmSync(dir, { recursive: true, force: true })
})

/** A 3-treatment × 2-rep trial (6 plots), laid out `cols` wide by plotNumber. */
function seedTrial(cols: number): number {
  dao.replaceTreatments([
    Treatment.parse({ number: 1, name: 'A' }),
    Treatment.parse({ number: 2, name: 'B' }),
    Treatment.parse({ number: 3, name: 'C' })
  ])
  const trts = dao.listTreatments()
  const plots = Array.from({ length: 6 }, (_, i) => ({
    plotNumber: i + 1,
    rep: Math.floor(i / 3) + 1,
    block: Math.floor(i / 3) + 1,
    treatmentId: trts[i % 3].id!,
    mapRow: Math.floor(i / cols),
    mapCol: i % cols
  }))
  return dao.replaceTrialWithPlots(
    { protocolId: 1, plotRows: Math.ceil(6 / cols), plotCols: cols, seed: 1, ...SITE },
    plots
  )
}

const at = (trialId: number, n: number) => dao.listPlots(trialId).find((p) => p.plotNumber === n)!

describe('layout', () => {
  it('reshapeLayout re-flows plots by plotNumber and updates dimensions', () => {
    const id = seedTrial(3)
    dao.reshapeLayout(2)
    // plotNumber 1..6 fill a 2-wide grid: (0,0)(0,1)(1,0)(1,1)(2,0)(2,1)
    expect([at(id, 1), at(id, 2), at(id, 3)].map((p) => [p.mapRow, p.mapCol])).toEqual([
      [0, 0],
      [0, 1],
      [1, 0]
    ])
    const trial = dao.getTrial()!
    expect(trial.plotCols).toBe(2)
    expect(trial.plotRows).toBe(3)
  })

  it('movePlotToCell swaps positions when the target is occupied, keeping treatments', () => {
    const id = seedTrial(3)
    const p1 = at(id, 1) // (0,0)
    const p6 = at(id, 6) // (1,2)
    const t1 = p1.treatmentId
    const t6 = p6.treatmentId
    dao.movePlotToCell(p1.id!, p6.mapRow, p6.mapCol)
    expect([at(id, 1).mapRow, at(id, 1).mapCol]).toEqual([1, 2])
    expect([at(id, 6).mapRow, at(id, 6).mapCol]).toEqual([0, 0])
    // Treatments/reps/numbers unchanged — physical move only.
    expect(at(id, 1).treatmentId).toBe(t1)
    expect(at(id, 6).treatmentId).toBe(t6)
  })

  it('movePlotToCell moves a plot into an empty cell', () => {
    const id = seedTrial(4) // 6 plots in 4 cols -> (1,2) and (1,3) are empty
    const p1 = at(id, 1) // (0,0)
    dao.movePlotToCell(p1.id!, 1, 2)
    expect([at(id, 1).mapRow, at(id, 1).mapCol]).toEqual([1, 2])
    // old cell now empty
    expect(dao.listPlots(id).some((p) => p.mapRow === 0 && p.mapCol === 0)).toBe(false)
  })
})
