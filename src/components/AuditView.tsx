'use client'

import { useEffect, useMemo, useState } from 'react'
import { api } from '@/lib/api'
import type { AuditEntry } from '@shared/types'

export function AuditView({ trialId }: { trialId: number }) {
  const [entries, setEntries] = useState<AuditEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('')

  const load = (): void => {
    setLoading(true)
    api.audit
      .list(trialId)
      .then(setEntries)
      .finally(() => setLoading(false))
  }

  useEffect(load, [trialId])

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase()
    if (!q) return entries
    return entries.filter((e) => `${e.actor} ${e.action} ${e.summary}`.toLowerCase().includes(q))
  }, [entries, filter])

  const fmtTime = (iso: string): string => {
    const d = new Date(iso)
    return isNaN(d.getTime()) ? iso : d.toLocaleString()
  }

  const exportCsv = (): void => {
    const rows: string[][] = [
      ['timestamp_utc', 'user', 'role', 'action', 'entity', 'summary'],
      ...entries.map((e) => [e.ts, e.actor, e.role, e.action, e.entity, e.summary])
    ]
    const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `trial-${trialId}-audit.csv`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  return (
    <div className="card">
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-end' }}>
        <div>
          <h2 style={{ margin: 0 }}>Audit Trail</h2>
          <p className="muted" style={{ margin: '4px 0 0' }}>
            Append-only record of every change.
            {entries.length > 0 && ` ${entries.length} entries.`}
          </p>
        </div>
        <div className="row no-print">
          <div style={{ width: 220 }}>
            <label>Filter</label>
            <input
              placeholder="user, action, or text…"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            />
          </div>
          <button onClick={load}>Refresh</button>
          <button className="primary" onClick={exportCsv} disabled={entries.length === 0}>
            Export CSV
          </button>
        </div>
      </div>

      {loading ? (
        <p className="muted" style={{ marginTop: 12 }}>
          Loading…
        </p>
      ) : filtered.length === 0 ? (
        <p className="muted" style={{ marginTop: 12 }}>
          {entries.length === 0 ? 'No changes recorded yet.' : 'No entries match the filter.'}
        </p>
      ) : (
        <table className="data" style={{ marginTop: 12 }}>
          <thead>
            <tr>
              <th style={{ width: 170 }}>When</th>
              <th style={{ width: 120 }}>User</th>
              <th style={{ width: 150 }}>Action</th>
              <th>Details</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((e) => (
              <tr key={e.id}>
                <td style={{ whiteSpace: 'nowrap' }}>{fmtTime(e.ts)}</td>
                <td>{e.actor || '—'}</td>
                <td>
                  <code style={{ fontSize: 11 }}>{e.action}</code>
                </td>
                <td>{e.summary}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
