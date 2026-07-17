import type {
  Protocol,
  Treatment,
  Application,
  MeasurementDef,
  MeasurementHeader,
  MeasurementValue,
  ApplicationActual,
  Property,
  PropertyScope,
  SiteMetadata,
  AovRequest,
  AovResult,
  LibraryCategory,
  SuggestHit,
  PersonalTerm,
  AuditEntry,
  Plot,
  Trial,
} from '@shared/types'

async function json<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  })
  if (!res.ok) {
    const body = await res.text().catch(() => res.statusText)
    throw new Error(body)
  }
  return res.json()
}

export interface ProtocolSummary {
  id: number
  title: string
  crop: string
  design: string
  investigator: string
  season: string
  treatmentCount: number
  createdAt: string
}

export interface ProtocolSnapshot {
  protocol: Protocol
  treatments: Treatment[]
  applications: Application[]
  measurementDefs: MeasurementDef[]
}

export interface TrialSummary {
  id: number
  protocolId: number
  protocolTitle: string
  siteName: string
  operator: string
  plotCount: number
  layoutLockedAt: string
  createdAt: string
}

export interface TrialSnapshot {
  trial: Trial
  protocol: Protocol
  treatments: Treatment[]
  applications: Application[]
  measurementDefs: MeasurementDef[]
  plots: Plot[]
  measurementHeaders: MeasurementHeader[]
  measurementValues: MeasurementValue[]
  applicationActuals: ApplicationActual[]
  properties: Property[]
}

export const api = {
  protocols: {
    list: () => json<ProtocolSummary[]>('/api/protocol'),
    get: (id: number) => json<ProtocolSnapshot>(`/api/protocol/${id}`),
    create: () =>
      json<ProtocolSnapshot>('/api/protocol', { method: 'POST' }),
    save: (id: number, p: Partial<Protocol>) =>
      json<Protocol>(`/api/protocol/${id}`, {
        method: 'PUT',
        body: JSON.stringify(p),
      }),
    saveTreatments: (id: number, list: Treatment[]) =>
      json<Treatment[]>(`/api/protocol/${id}/treatments`, {
        method: 'PUT',
        body: JSON.stringify(list),
      }),
    saveApplications: (id: number, list: Application[]) =>
      json<Application[]>(`/api/protocol/${id}/applications`, {
        method: 'PUT',
        body: JSON.stringify(list),
      }),
    saveMeasurementDefs: (id: number, list: MeasurementDef[]) =>
      json<MeasurementDef[]>(`/api/protocol/${id}/measurement-defs`, {
        method: 'PUT',
        body: JSON.stringify(list),
      }),
    delete: (id: number) =>
      json<{ ok: boolean }>(`/api/protocol/${id}`, { method: 'DELETE' }),
  },

  trials: {
    list: () => json<TrialSummary[]>('/api/trial'),
    get: (id: number) => json<TrialSnapshot>(`/api/trial/${id}`),
    create: (protocolId: number) =>
      json<TrialSnapshot>('/api/trial', {
        method: 'POST',
        body: JSON.stringify({ protocolId }),
      }),
    saveSite: (id: number, site: Partial<SiteMetadata>) =>
      json<TrialSnapshot>(`/api/trial/${id}/site`, {
        method: 'PUT',
        body: JSON.stringify(site),
      }),
    generate: (id: number, seed?: number) =>
      json<TrialSnapshot>(`/api/trial/${id}/generate`, {
        method: 'POST',
        body: JSON.stringify({ seed }),
      }),
    lock: (id: number) =>
      json<TrialSnapshot>(`/api/trial/${id}/lock`, { method: 'POST' }),
    swapPlots: (id: number, plotIdA: number, plotIdB: number) =>
      json<TrialSnapshot>(`/api/trial/${id}/plots/swap`, {
        method: 'POST',
        body: JSON.stringify({ plotIdA, plotIdB }),
      }),
    setPlotExcluded: (
      id: number,
      plotId: number,
      excluded: boolean,
      reason: string
    ) =>
      json<TrialSnapshot>(`/api/trial/${id}/plots/exclude`, {
        method: 'POST',
        body: JSON.stringify({ plotId, excluded, reason }),
      }),
    reshapeLayout: (id: number, cols: number) =>
      json<TrialSnapshot>(`/api/trial/${id}/plots/reshape`, {
        method: 'POST',
        body: JSON.stringify({ cols }),
      }),
    movePlot: (id: number, plotId: number, mapRow: number, mapCol: number) =>
      json<TrialSnapshot>(`/api/trial/${id}/plots/move`, {
        method: 'POST',
        body: JSON.stringify({ plotId, mapRow, mapCol }),
      }),
    saveApplicationActuals: (id: number, actuals: ApplicationActual[]) =>
      json<TrialSnapshot>(`/api/trial/${id}/application-actuals`, {
        method: 'PUT',
        body: JSON.stringify(actuals),
      }),
    saveProperties: (
      id: number,
      scope: PropertyScope,
      scopeRef: string,
      props: Property[]
    ) =>
      json<TrialSnapshot>(`/api/trial/${id}/properties`, {
        method: 'PUT',
        body: JSON.stringify({ scope, scopeRef, props }),
      }),
    delete: (id: number) =>
      json<{ ok: boolean }>(`/api/trial/${id}`, { method: 'DELETE' }),
  },

  measurements: {
    listHeaders: (trialId: number) =>
      json<MeasurementHeader[]>(`/api/trial/${trialId}/measurements`),
    addSiteHeader: (trialId: number, h: Partial<MeasurementHeader>) =>
      json<MeasurementHeader>(`/api/trial/${trialId}/measurements`, {
        method: 'POST',
        body: JSON.stringify(h),
      }),
    updateHeader: (
      trialId: number,
      headerId: number,
      h: Partial<MeasurementHeader>
    ) =>
      json<MeasurementHeader>(
        `/api/trial/${trialId}/measurements/${headerId}`,
        { method: 'PUT', body: JSON.stringify(h) }
      ),
    deleteHeader: (trialId: number, headerId: number) =>
      json<{ ok: boolean }>(
        `/api/trial/${trialId}/measurements/${headerId}`,
        { method: 'DELETE' }
      ),
    saveMetadata: (
      trialId: number,
      headerId: number,
      meta: {
        measurementDate: string
        assessedBy: string
        growthStage: string
      }
    ) =>
      json<MeasurementHeader>(
        `/api/trial/${trialId}/measurements/${headerId}/metadata`,
        { method: 'PUT', body: JSON.stringify(meta) }
      ),
    listValues: (trialId: number) =>
      json<MeasurementValue[]>(
        `/api/trial/${trialId}/measurements/values`
      ),
    setValue: (trialId: number, v: MeasurementValue) =>
      json<{ ok: boolean }>(
        `/api/trial/${trialId}/measurements/values`,
        { method: 'PUT', body: JSON.stringify(v) }
      ),
  },

  stats: {
    runAov: (trialId: number, headerId: number, req: AovRequest) =>
      json<AovResult>(`/api/trial/${trialId}/stats`, {
        method: 'POST',
        body: JSON.stringify({ headerId, request: req }),
      }),
  },

  library: {
    suggest: (category: LibraryCategory, query: string, crop: string) =>
      json<SuggestHit[]>(
        `/api/library/suggest?category=${category}&query=${encodeURIComponent(query)}&crop=${encodeURIComponent(crop)}`
      ),
    list: () => json<PersonalTerm[]>('/api/library'),
    update: (id: number, data: { label?: string; value?: string }) =>
      json<PersonalTerm>(`/api/library/${id}`, {
        method: 'PUT',
        body: JSON.stringify(data),
      }),
    remove: (id: number) =>
      json<{ ok: boolean }>(`/api/library/${id}`, { method: 'DELETE' }),
  },

  audit: {
    list: (trialId: number) =>
      json<AuditEntry[]>(`/api/trial/${trialId}/audit`),
  },
}
