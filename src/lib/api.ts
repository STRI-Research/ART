import type { Protocol, Treatment, Application, MeasurementDef } from '@shared/types'

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

export const api = {
  protocols: {
    list: () => json<ProtocolSummary[]>('/api/protocol'),
    get: (id: number) => json<ProtocolSnapshot>(`/api/protocol/${id}`),
    create: () =>
      json<ProtocolSnapshot>('/api/protocol', { method: 'POST' }),
    save: (id: number, p: Protocol) =>
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
}
