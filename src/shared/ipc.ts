/** Central registry of IPC channel names, shared by main handlers and preload. */
export const IPC = {
  // Documents (role-agnostic)
  projectSnapshot: 'project:snapshot',
  projectClose: 'project:close',

  // Protocol authoring
  protocolNew: 'protocol:new',
  protocolOpen: 'protocol:open',
  protocolSave: 'protocol:save',
  treatmentsSave: 'treatments:save',
  applicationsSave: 'applications:save',
  measurementDefSave: 'measurement:def:save',

  // Trial (created from a protocol)
  trialNewFromProtocol: 'trial:newFromProtocol',
  trialNewFromCurrent: 'trial:newFromCurrentProtocol',
  trialOpen: 'trial:open',
  trialGenerate: 'trial:generate',
  trialSaveSite: 'trial:saveSite',
  trialLockLayout: 'trial:lockLayout',
  applicationActualsSave: 'trial:applicationActuals:save',
  propertiesSave: 'trial:properties:save',
  plotSwap: 'plot:swap',
  plotMove: 'plot:move',
  layoutReshape: 'layout:reshape',
  plotSetExcluded: 'plot:setExcluded',

  // Measurements
  measurementHeaderAddSite: 'measurement:header:addSite',
  measurementHeaderUpsert: 'measurement:header:upsert',
  measurementHeaderDelete: 'measurement:header:delete',
  measurementMetadataSave: 'measurement:metadata:save',
  measurementValueSet: 'measurement:value:set',

  // Library (personal curated vocabulary)
  librarySuggest: 'library:suggest',
  libraryList: 'library:list',
  libraryUpdateLabel: 'library:updateLabel',
  libraryRename: 'library:rename',
  libraryRemove: 'library:remove',
  libraryExport: 'library:export',
  libraryImport: 'library:import',

  // Stats
  statsRunAov: 'stats:runAov',

  // Report
  reportExportPdf: 'report:exportPdf',

  // Menu (native menu bar ↔ renderer)
  menuSetState: 'menu:setState',

  // Audit
  auditList: 'audit:list',

  // Environment / R
  envDetectR: 'env:detectR',
  envSetRscriptPath: 'env:setRscriptPath'
} as const

export type IpcChannel = (typeof IPC)[keyof typeof IPC]
