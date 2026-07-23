import type {
  Protocol,
  Treatment,
  TreatmentComponent,
  Product,
  Application,
  ApplicationEvent,
  EventOccurrence,
  TreatmentMix,
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
  applicationEvents: ApplicationEvent[]
  eventOccurrences: EventOccurrence[]
  treatmentMixes: TreatmentMix[]
}

export interface PlanConflictInfo {
  ruleEventCount: number
  fundedCount: number
  difference: number
  suggestedIntervalDays: number | null
}

/** An application-document version with approval state (see application_document). */
export interface AppDocument {
  id: number
  eventId: number
  versionNumber: number
  status: 'draft' | 'awaiting_approval' | 'returned' | 'approved' | 'superseded'
  snapshotJson: unknown
  inputHash: string
  documentRef: string
  createdAt: string
  firstCheckById: number | null
  firstCheckAt: string | null
  assignedApproverId: number | null
  approvedById: number | null
  approvedAt: string | null
  returnReason: string
  comments: string
  printedAt: string | null
  firstCheckerName: string
  approverName: string
  approvedByName: string
}

export interface AppNotification {
  id: number
  type: string
  payloadJson: Record<string, unknown> | null
  readAt: string | null
  createdAt: string
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

  // Stable-ID treatment/component operations (replace the array-replace save path).
  treatments: {
    create: (protocolId: number, t?: Partial<Treatment>) =>
      json<Treatment>(`/api/protocol/${protocolId}/treatments`, {
        method: 'POST',
        body: JSON.stringify(t ?? {}),
      }),
    update: (
      id: number,
      patch: Partial<Pick<Treatment, 'name' | 'notes' | 'type' | 'number' | 'isCheck'>> & {
        expectedVersion?: number
      }
    ) =>
      json<Treatment>(`/api/treatment/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(patch),
      }),
    delete: (id: number) =>
      json<{ ok: boolean }>(`/api/treatment/${id}`, { method: 'DELETE' }),
  },

  components: {
    add: (treatmentId: number, c: Partial<TreatmentComponent>) =>
      json<TreatmentComponent>(`/api/treatment/${treatmentId}/components`, {
        method: 'POST',
        body: JSON.stringify(c),
      }),
    update: (id: number, patch: Partial<TreatmentComponent>) =>
      json<TreatmentComponent>(`/api/component/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(patch),
      }),
    remove: (id: number) =>
      json<{ ok: boolean }>(`/api/component/${id}`, { method: 'DELETE' }),
  },

  products: {
    list: (activeOnly = false) =>
      json<Product[]>(`/api/product${activeOnly ? '?active=1' : ''}`),
    create: (p: Partial<Product> & { name: string }) =>
      json<Product>('/api/product', { method: 'POST', body: JSON.stringify(p) }),
    update: (id: number, p: Partial<Product>) =>
      json<Product>(`/api/product/${id}`, { method: 'PUT', body: JSON.stringify(p) }),
    remove: (id: number) =>
      json<{ ok: boolean; deactivated: boolean }>(`/api/product/${id}`, { method: 'DELETE' }),
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
    generatePlan: (id: number) =>
      json<{ snapshot: TrialSnapshot; conflict: PlanConflictInfo | null }>(
        `/api/trial/${id}/plan/generate`,
        { method: 'POST' }
      ),
    updateEvent: (
      id: number,
      eventId: number,
      patch: {
        plannedDate?: string
        scope?: 'event' | 'rebase'
        cancel?: boolean
        reason?: string
        expectedVersion?: number
      }
    ) =>
      json<TrialSnapshot>(`/api/trial/${id}/event/${eventId}`, {
        method: 'PATCH',
        body: JSON.stringify(patch),
      }),
    completeEvent: (
      id: number,
      eventId: number,
      c: {
        actualDate: string
        actualStartTime?: string
        actualEndTime?: string
        operator?: string
        sprayer?: string
        completionNotes?: string
      }
    ) =>
      json<TrialSnapshot>(`/api/trial/${id}/event/${eventId}/complete`, {
        method: 'POST',
        body: JSON.stringify(c),
      }),
    mergeEvent: (id: number, eventId: number, intoEventId: number, reason?: string) =>
      json<TrialSnapshot>(`/api/trial/${id}/event/${eventId}/merge`, {
        method: 'POST',
        body: JSON.stringify({ intoEventId, reason }),
      }),
    splitEvent: (id: number, eventId: number, occurrenceIds: number[], newDate: string, reason?: string) =>
      json<TrialSnapshot>(`/api/trial/${id}/event/${eventId}/split`, {
        method: 'POST',
        body: JSON.stringify({ occurrenceIds, newDate, reason }),
      }),
    addManualOccurrence: (id: number, date: string, componentId: number) =>
      json<TrialSnapshot>(`/api/trial/${id}/event`, {
        method: 'POST',
        body: JSON.stringify({ date, componentId }),
      }),
    amendActuals: (
      id: number,
      eventId: number,
      patch: {
        actualDate?: string
        actualStartTime?: string
        actualEndTime?: string
        operator?: string
        sprayer?: string
        completionNotes?: string
        reason: string
        occurrenceActuals?: {
          id: number
          actualRateValue: number | null
          actualRateUnit?: string
          deviationReason?: string
        }[]
      }
    ) =>
      json<TrialSnapshot>(`/api/trial/${id}/event/${eventId}/actuals`, {
        method: 'PATCH',
        body: JSON.stringify(patch),
      }),
    saveMixSettings: (
      id: number,
      eventId: number,
      treatmentId: number,
      settings: Partial<
        Pick<
          TreatmentMix,
          | 'waterVolumeLPerHa'
          | 'overageEnabled'
          | 'overagePct'
          | 'waterIn'
          | 'sprayer'
          | 'tankMixStatus'
          | 'tankMixNotes'
        >
      >
    ) =>
      json<TrialSnapshot>(`/api/trial/${id}/event/${eventId}/mix/${treatmentId}`, {
        method: 'PUT',
        body: JSON.stringify(settings),
      }),
    updateOccurrence: (
      occurrenceId: number,
      patch: {
        plannedRateValue?: number | null
        plannedRateUnit?: string
        plannedOverrideReason?: string
        cancel?: boolean
        date?: string
        rebaseComponent?: boolean
        reason?: string
      }
    ) =>
      json<TrialSnapshot>(`/api/occurrence/${occurrenceId}`, {
        method: 'PATCH',
        body: JSON.stringify(patch),
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

  documents: {
    /** Latest document version for an event (null when none). */
    get: (trialId: number, eventId: number) =>
      json<AppDocument | null>(`/api/trial/${trialId}/event/${eventId}/document`),
    /** Complete the first check and submit to a Research Manager. */
    submit: (trialId: number, eventId: number, approverId: number, comments?: string) =>
      json<AppDocument>(`/api/trial/${trialId}/event/${eventId}/document`, {
        method: 'POST',
        body: JSON.stringify({ approverId, comments }),
      }),
    action: (
      documentId: number,
      action: 'approve' | 'return' | 'withdraw',
      versionNumber: number,
      opts?: { reason?: string; comments?: string }
    ) =>
      json<AppDocument>(`/api/document/${documentId}`, {
        method: 'PATCH',
        body: JSON.stringify({ action, versionNumber, ...opts }),
      }),
    recordPrint: (documentId: number) =>
      json<{ ok: boolean; documentRef: string }>(`/api/document/${documentId}`, {
        method: 'POST',
      }),
  },

  users: {
    list: () =>
      json<{ me: { id: number; roles: string[] }; users: { id: number; name: string; email: string }[] }>(
        '/api/users'
      ),
  },

  notifications: {
    list: () => json<AppNotification[]>('/api/notifications'),
    markRead: (ids?: number[]) =>
      json<{ ok: boolean }>('/api/notifications', {
        method: 'POST',
        body: JSON.stringify(ids ? { ids } : { all: true }),
      }),
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
