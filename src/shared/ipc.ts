/** Central registry of IPC channel names, shared by main handlers and preload. */
export const IPC = {
  // Project
  projectNew: 'project:new',
  projectOpen: 'project:open',
  projectSnapshot: 'project:snapshot',
  projectClose: 'project:close',

  // Protocol
  protocolSave: 'protocol:save',
  treatmentsSave: 'treatments:save',
  applicationsSave: 'applications:save',

  // Trial
  trialGenerate: 'trial:generate',
  plotSwap: 'plot:swap',

  // Assessments
  assessmentHeaderUpsert: 'assessment:header:upsert',
  assessmentHeaderDelete: 'assessment:header:delete',
  assessmentValueSet: 'assessment:value:set',

  // Stats
  statsRunAov: 'stats:runAov',

  // Environment / R
  envDetectR: 'env:detectR',
  envSetRscriptPath: 'env:setRscriptPath'
} as const

export type IpcChannel = (typeof IPC)[keyof typeof IPC]
