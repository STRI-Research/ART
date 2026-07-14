import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { openProject, closeProject } from './connection.js'
import { MeasurementDef } from '@shared/types.js'
import * as dao from './dao.js'

let dir: string
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'art-prop-'))
  openProject(join(dir, 't.arttrial'), { role: 'trial', create: true })
})
afterEach(() => {
  closeProject()
  rmSync(dir, { recursive: true, force: true })
})

describe('properties', () => {
  it('replaces properties per scope+ref without touching other scopes', () => {
    dao.replaceProperties('trial', '', [
      { scope: 'trial', scopeRef: '', key: 'soil type', value: 'clay loam' },
      { scope: 'trial', scopeRef: '', key: 'previous crop', value: 'wheat' }
    ])
    dao.replaceProperties('application', 'A', [
      { scope: 'application', scopeRef: 'A', key: 'wind speed', value: '5 km/h' }
    ])

    expect(dao.listProperties()).toHaveLength(3)
    // Re-saving the trial scope leaves the application-scope row intact.
    dao.replaceProperties('trial', '', [{ scope: 'trial', scopeRef: '', key: 'variety', value: 'X' }])
    const props = dao.listProperties()
    expect(props.filter((p) => p.scope === 'trial')).toHaveLength(1)
    expect(props.filter((p) => p.scope === 'application' && p.scopeRef === 'A')).toHaveLength(1)
    // Blank keys are dropped.
    dao.replaceProperties('trial', '', [{ scope: 'trial', scopeRef: '', key: '  ', value: 'x' }])
    expect(dao.listProperties().filter((p) => p.scope === 'trial')).toHaveLength(0)
    // Snapshot exposes them.
    expect(dao.snapshot().properties.some((p) => p.key === 'wind speed')).toBe(true)
  })
})

describe('measurement growth stage', () => {
  it('is captured at data entry as event metadata on the trial header, not the definition', () => {
    // Growth stage is not part of the protocol definition — it's observed when the measurement
    // is performed, so it lives on the trial header and defaults empty until recorded.
    dao.replaceMeasurementDefs([MeasurementDef.parse({ measurementType: 'CONTRO', description: 'Control' })])

    const trialId = dao.replaceTrialWithPlots(
      {
        protocolId: 1,
        plotRows: 1,
        plotCols: 1,
        seed: 1,
        siteName: '',
        operator: '',
        location: '',
        city: '',
        state: '',
        country: '',
        plantingDate: '',
        trialNotes: ''
      },
      []
    )
    dao.materializeCoreHeaders(trialId)
    const header = dao.listMeasurementHeaders(trialId)[0]
    expect(header.growthStage).toBe('')

    dao.updateMeasurementMetadata(header.id!, {
      measurementDate: '2026-07-01',
      assessedBy: 'JD',
      growthStage: 'BBCH 65'
    })
    const updated = dao.listMeasurementHeaders(trialId)[0]
    expect(updated.growthStage).toBe('BBCH 65')
    expect(updated.measurementDate).toBe('2026-07-01')
    expect(updated.assessedBy).toBe('JD')
  })
})
