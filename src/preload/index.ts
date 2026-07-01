import { contextBridge, ipcRenderer } from 'electron'
import { IPC } from '../shared/ipc.js'
import type {
  Protocol,
  Treatment,
  Application,
  AssessmentHeader,
  AssessmentValue,
  AovRequest,
  AovResult,
  ProjectSnapshot,
  REnvStatus,
  DesignType
} from '../shared/types.js'

/** The API surface exposed to the renderer. Every method is a typed IPC invoke. */
const api = {
  project: {
    new: (): Promise<ProjectSnapshot | null> => ipcRenderer.invoke(IPC.projectNew),
    open: (): Promise<ProjectSnapshot | null> => ipcRenderer.invoke(IPC.projectOpen),
    snapshot: (): Promise<ProjectSnapshot | null> => ipcRenderer.invoke(IPC.projectSnapshot),
    close: (): Promise<boolean> => ipcRenderer.invoke(IPC.projectClose)
  },
  protocol: {
    save: (p: Protocol): Promise<Protocol> => ipcRenderer.invoke(IPC.protocolSave, p)
  },
  treatments: {
    save: (list: Treatment[]): Promise<Treatment[]> => ipcRenderer.invoke(IPC.treatmentsSave, list)
  },
  applications: {
    save: (list: Application[]): Promise<Application[]> =>
      ipcRenderer.invoke(IPC.applicationsSave, list)
  },
  trial: {
    generate: (cfg: {
      design: DesignType
      replicates: number
      plotWidth?: number
      plotLength?: number
      seed?: number
    }): Promise<ProjectSnapshot> => ipcRenderer.invoke(IPC.trialGenerate, cfg),
    swapPlots: (a: number, b: number): Promise<ProjectSnapshot> =>
      ipcRenderer.invoke(IPC.plotSwap, a, b)
  },
  assessments: {
    upsertHeader: (h: AssessmentHeader): Promise<AssessmentHeader[]> =>
      ipcRenderer.invoke(IPC.assessmentHeaderUpsert, h),
    deleteHeader: (id: number): Promise<AssessmentHeader[]> =>
      ipcRenderer.invoke(IPC.assessmentHeaderDelete, id),
    setValue: (v: AssessmentValue): Promise<boolean> =>
      ipcRenderer.invoke(IPC.assessmentValueSet, v)
  },
  stats: {
    runAov: (headerId: number, req: AovRequest): Promise<AovResult> =>
      ipcRenderer.invoke(IPC.statsRunAov, headerId, req)
  },
  env: {
    detectR: (): Promise<REnvStatus> => ipcRenderer.invoke(IPC.envDetectR),
    setRscriptPath: (p: string): Promise<REnvStatus> =>
      ipcRenderer.invoke(IPC.envSetRscriptPath, p)
  }
}

export type ArmApi = typeof api

contextBridge.exposeInMainWorld('arm', api)
