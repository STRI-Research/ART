import { contextBridge, ipcRenderer } from 'electron'
import { IPC } from '../shared/ipc.js'
import type {
  Protocol,
  Treatment,
  Application,
  ApplicationActual,
  Property,
  PropertyScope,
  MeasurementDef,
  MeasurementHeader,
  MeasurementValue,
  AovRequest,
  AovResult,
  AuditEntry,
  LibraryCategory,
  PersonalTerm,
  SuggestHit,
  ProjectSnapshot,
  PrintProfile,
  REnvStatus,
  SiteMetadata
} from '../shared/types.js'

/** The API surface exposed to the renderer. Every method is a typed IPC invoke. */
const api = {
  project: {
    snapshot: (): Promise<ProjectSnapshot | null> => ipcRenderer.invoke(IPC.projectSnapshot),
    close: (): Promise<boolean> => ipcRenderer.invoke(IPC.projectClose)
  },
  protocol: {
    new: (): Promise<ProjectSnapshot | null> => ipcRenderer.invoke(IPC.protocolNew),
    open: (): Promise<ProjectSnapshot | null> => ipcRenderer.invoke(IPC.protocolOpen),
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
    newFromProtocol: (): Promise<ProjectSnapshot | null> =>
      ipcRenderer.invoke(IPC.trialNewFromProtocol),
    newFromCurrent: (): Promise<ProjectSnapshot | null> =>
      ipcRenderer.invoke(IPC.trialNewFromCurrent),
    open: (): Promise<ProjectSnapshot | null> => ipcRenderer.invoke(IPC.trialOpen),
    generate: (cfg: { seed?: number }): Promise<ProjectSnapshot> =>
      ipcRenderer.invoke(IPC.trialGenerate, cfg),
    saveSite: (site: SiteMetadata): Promise<ProjectSnapshot> =>
      ipcRenderer.invoke(IPC.trialSaveSite, site),
    lockLayout: (): Promise<ProjectSnapshot> => ipcRenderer.invoke(IPC.trialLockLayout),
    saveApplicationActuals: (list: ApplicationActual[]): Promise<ProjectSnapshot> =>
      ipcRenderer.invoke(IPC.applicationActualsSave, list),
    saveProperties: (scope: PropertyScope, scopeRef: string, props: Property[]): Promise<ProjectSnapshot> =>
      ipcRenderer.invoke(IPC.propertiesSave, { scope, scopeRef, props }),
    swapPlots: (a: number, b: number): Promise<ProjectSnapshot> =>
      ipcRenderer.invoke(IPC.plotSwap, a, b),
    movePlot: (plotId: number, mapRow: number, mapCol: number): Promise<ProjectSnapshot> =>
      ipcRenderer.invoke(IPC.plotMove, { plotId, mapRow, mapCol }),
    reshapeLayout: (cols: number): Promise<ProjectSnapshot> =>
      ipcRenderer.invoke(IPC.layoutReshape, cols),
    setPlotExcluded: (plotId: number, excluded: boolean, reason: string): Promise<ProjectSnapshot> =>
      ipcRenderer.invoke(IPC.plotSetExcluded, { plotId, excluded, reason })
  },
  measurements: {
    saveDefs: (list: MeasurementDef[]): Promise<MeasurementDef[]> =>
      ipcRenderer.invoke(IPC.measurementDefSave, list),
    addSiteHeader: (h: MeasurementHeader): Promise<MeasurementHeader[]> =>
      ipcRenderer.invoke(IPC.measurementHeaderAddSite, h),
    upsertHeader: (h: MeasurementHeader): Promise<MeasurementHeader[]> =>
      ipcRenderer.invoke(IPC.measurementHeaderUpsert, h),
    deleteHeader: (id: number): Promise<MeasurementHeader[]> =>
      ipcRenderer.invoke(IPC.measurementHeaderDelete, id),
    saveMetadata: (
      id: number,
      meta: { measurementDate: string; assessedBy: string; growthStage: string }
    ): Promise<ProjectSnapshot> => ipcRenderer.invoke(IPC.measurementMetadataSave, { id, ...meta }),
    setValue: (v: MeasurementValue): Promise<boolean> =>
      ipcRenderer.invoke(IPC.measurementValueSet, v)
  },
  library: {
    suggest: (category: LibraryCategory, query: string, crop: string): Promise<SuggestHit[]> =>
      ipcRenderer.invoke(IPC.librarySuggest, { category, query, crop }),
    list: (): Promise<PersonalTerm[]> => ipcRenderer.invoke(IPC.libraryList),
    updateLabel: (id: number, label: string): Promise<PersonalTerm[]> =>
      ipcRenderer.invoke(IPC.libraryUpdateLabel, { id, label }),
    rename: (id: number, value: string): Promise<PersonalTerm[]> =>
      ipcRenderer.invoke(IPC.libraryRename, { id, value }),
    remove: (id: number): Promise<PersonalTerm[]> => ipcRenderer.invoke(IPC.libraryRemove, id),
    exportToFile: (): Promise<string | null> => ipcRenderer.invoke(IPC.libraryExport),
    importFromFile: (): Promise<{ added: number; updated: number } | null> =>
      ipcRenderer.invoke(IPC.libraryImport)
  },
  stats: {
    runAov: (headerId: number, req: AovRequest): Promise<AovResult> =>
      ipcRenderer.invoke(IPC.statsRunAov, headerId, req)
  },
  report: {
    exportPdf: (opts: { title: string; print?: PrintProfile }): Promise<string | null> =>
      ipcRenderer.invoke(IPC.reportExportPdf, opts)
  },
  audit: {
    list: (): Promise<AuditEntry[]> => ipcRenderer.invoke(IPC.auditList)
  },
  menu: {
    /** Tell the native menu what's applicable for the current document. */
    setState: (s: { role: 'protocol' | 'trial' | null; hasDocument: boolean }): Promise<boolean> =>
      ipcRenderer.invoke(IPC.menuSetState, s),
    /** Subscribe to native-menu actions; returns an unsubscribe fn. */
    onAction: (cb: (action: string) => void): (() => void) => {
      const listener = (_e: unknown, action: string): void => cb(action)
      ipcRenderer.on('menu', listener)
      return () => ipcRenderer.removeListener('menu', listener)
    }
  },
  env: {
    detectR: (): Promise<REnvStatus> => ipcRenderer.invoke(IPC.envDetectR),
    setRscriptPath: (p: string): Promise<REnvStatus> =>
      ipcRenderer.invoke(IPC.envSetRscriptPath, p),
    installRPackages: (): Promise<REnvStatus> => ipcRenderer.invoke(IPC.envInstallRPackages)
  }
}

export type ArtApi = typeof api

contextBridge.exposeInMainWorld('art', api)
