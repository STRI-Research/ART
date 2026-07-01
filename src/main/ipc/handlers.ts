import { ipcMain, dialog, BrowserWindow } from 'electron'
import { IPC } from '@shared/ipc.js'
import {
  Protocol,
  Treatment,
  Application,
  AssessmentHeader,
  AssessmentValue,
  AovRequest,
  DesignType,
  type ProjectSnapshot,
  type Trial,
  type Plot
} from '@shared/types.js'
import { z } from 'zod'
import { openProject, closeProject, getCurrentPath } from '../db/connection.js'
import * as dao from '../db/dao.js'
import { detectR } from '../r/detect.js'
import { setRscriptPath } from '../r/run.js'
import { randomize, runAov, ENGINE_VERSION } from '../r/service.js'

/** Wrap a handler so thrown errors become a rejected invoke (surfaced in UI). */
function handle<T>(channel: string, fn: (...args: any[]) => Promise<T> | T): void {
  ipcMain.handle(channel, async (_e, ...args) => fn(...args))
}

const GenerateTrialInput = z.object({
  design: DesignType,
  replicates: z.number().int().min(2).max(20),
  plotWidth: z.number().default(0),
  plotLength: z.number().default(0),
  seed: z.number().int().optional()
})

export function registerIpc(getWindow: () => BrowserWindow | null): void {
  // --- Project ---
  handle(IPC.projectNew, async (): Promise<ProjectSnapshot | null> => {
    const win = getWindow()
    const res = await dialog.showSaveDialog(win!, {
      title: 'New Open ARM Project',
      defaultPath: 'trial.armdb',
      filters: [{ name: 'Open ARM Project', extensions: ['armdb'] }]
    })
    if (res.canceled || !res.filePath) return null
    openProject(res.filePath)
    return dao.snapshot()
  })

  handle(IPC.projectOpen, async (): Promise<ProjectSnapshot | null> => {
    const win = getWindow()
    const res = await dialog.showOpenDialog(win!, {
      title: 'Open Project',
      properties: ['openFile'],
      filters: [{ name: 'Open ARM Project', extensions: ['armdb'] }]
    })
    if (res.canceled || res.filePaths.length === 0) return null
    openProject(res.filePaths[0])
    return dao.snapshot()
  })

  handle(IPC.projectSnapshot, (): ProjectSnapshot | null => {
    if (!getCurrentPath()) return null
    return dao.snapshot()
  })

  handle(IPC.projectClose, () => {
    closeProject()
    return true
  })

  // --- Protocol ---
  handle(IPC.protocolSave, (p: unknown) => {
    dao.saveProtocol(Protocol.parse(p))
    return dao.getProtocol()
  })

  handle(IPC.treatmentsSave, (list: unknown) => {
    const treatments = z.array(Treatment).parse(list)
    dao.replaceTreatments(treatments)
    return dao.listTreatments()
  })

  handle(IPC.applicationsSave, (list: unknown) => {
    const apps = z.array(Application).parse(list)
    dao.replaceApplications(apps)
    return dao.listApplications()
  })

  // --- Trial generation ---
  handle(IPC.trialGenerate, async (input: unknown): Promise<ProjectSnapshot> => {
    const cfg = GenerateTrialInput.parse(input)
    const treatments = dao.listTreatments()
    if (treatments.length < 2) throw new Error('Add at least 2 treatments before generating a trial.')

    const seed = cfg.seed ?? Math.floor(Math.random() * 1_000_000)
    const randomized = await randomize({
      design: cfg.design,
      treatments: treatments.length,
      replicates: cfg.replicates,
      seed
    })

    // Layout: columns = treatment count, one row per replicate block (row-major).
    const plotCols = treatments.length
    const plotRows = cfg.replicates
    const byNumber = new Map(treatments.map((t) => [t.number, t.id!]))

    const plots: Omit<Plot, 'id' | 'trialId'>[] = randomized.map((rp) => {
      const treatmentId = byNumber.get(rp.treatment)
      if (treatmentId === undefined) {
        throw new Error(`R returned treatment number ${rp.treatment} with no matching treatment row`)
      }
      return {
        plotNumber: rp.order,
        rep: rp.rep,
        treatmentId,
        mapRow: Math.floor((rp.order - 1) / plotCols),
        mapCol: (rp.order - 1) % plotCols
      }
    })

    const trial: Omit<Trial, 'id'> = {
      protocolId: 1,
      design: cfg.design,
      replicates: cfg.replicates,
      plotRows,
      plotCols,
      plotWidth: cfg.plotWidth,
      plotLength: cfg.plotLength,
      seed
    }
    dao.replaceTrialWithPlots(trial, plots)
    return dao.snapshot()
  })

  handle(IPC.plotSwap, (a: unknown, b: unknown) => {
    const plotIdA = z.number().int().parse(a)
    const plotIdB = z.number().int().parse(b)
    dao.swapPlotTreatments(plotIdA, plotIdB)
    return dao.snapshot()
  })

  // --- Assessments ---
  handle(IPC.assessmentHeaderUpsert, (h: unknown) => {
    dao.upsertAssessmentHeader(AssessmentHeader.parse(h))
    const trial = dao.getTrial()
    return trial ? dao.listAssessmentHeaders(trial.id!) : []
  })

  handle(IPC.assessmentHeaderDelete, (id: unknown) => {
    dao.deleteAssessmentHeader(z.number().int().parse(id))
    const trial = dao.getTrial()
    return trial ? dao.listAssessmentHeaders(trial.id!) : []
  })

  handle(IPC.assessmentValueSet, (v: unknown) => {
    dao.setAssessmentValue(AssessmentValue.parse(v))
    return true
  })

  // --- Statistics ---
  handle(IPC.statsRunAov, async (headerId: unknown, req: unknown) => {
    const assessmentHeaderId = z.number().int().parse(headerId)
    const aovReq = AovRequest.parse(req)
    const result = await runAov(aovReq)
    dao.saveAnalysisResult(assessmentHeaderId, ENGINE_VERSION, aovReq, result)
    return result
  })

  // --- Environment ---
  handle(IPC.envDetectR, () => detectR())
  handle(IPC.envSetRscriptPath, (p: unknown) => {
    setRscriptPath(z.string().parse(p))
    return detectR()
  })
}
