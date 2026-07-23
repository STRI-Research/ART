'use client'

import { useEffect, useState } from 'react'
import { api, type AppNotification } from '@/lib/api'

interface AwaitingDoc {
  id: number
  documentRef: string
  versionNumber: number
  createdAt: string
  trialId: number | null
  eventLabel: string
  plannedDate: string
}

interface OutstandingItem {
  eventId: number
  trialId: number
  label: string
  actualDate: string
  siteName: string
  daysOutstanding: number | null
}

const NOTIFICATION_TEXT: Record<string, (p: Record<string, unknown>) => string> = {
  approval_requested: (p) => `${p.from} submitted ${p.documentRef} (application ${p.eventLabel}, planned ${p.plannedDate}) for your approval`,
  approval_granted: (p) => `${p.by} approved ${p.documentRef}`,
  approval_returned: (p) => `${p.by} returned ${p.documentRef}: ${p.reason}`,
  approval_withdrawn: (p) => `${p.by} withdrew ${p.documentRef} from approval`,
  approval_invalidated: (p) => `${p.documentRef} was superseded — the application changed after checking`,
}

/** Approvals awaiting the signed-in user, plus their in-app notifications. */
export function AppRovalsPage() {
  const [docs, setDocs] = useState<AwaitingDoc[]>([])
  const [outstanding, setOutstanding] = useState<OutstandingItem[]>([])
  const [notifications, setNotifications] = useState<AppNotification[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      fetch('/api/approvals').then((r) => r.json()),
      fetch('/api/outstanding').then((r) => r.json()),
      api.notifications.list(),
    ]).then(([d, o, n]) => {
      setDocs(d)
      setOutstanding(o)
      setNotifications(n)
      setLoading(false)
    })
  }, [])

  if (loading) {
    return (
      <div style={{ padding: 24 }}>
        <p className="muted">Loading…</p>
      </div>
    )
  }

  const unread = notifications.filter((n) => !n.readAt)

  return (
    <div style={{ maxWidth: 800, margin: '0 auto', padding: '24px 16px' }}>
      <div className="card">
        <h2>Awaiting your approval</h2>
        {docs.length === 0 ? (
          <p className="muted">Nothing awaiting your approval.</p>
        ) : (
          <table className="data">
            <thead>
              <tr>
                <th>Document</th>
                <th style={{ width: 90 }}>Application</th>
                <th style={{ width: 120 }}>Planned date</th>
                <th style={{ width: 130 }}>Submitted</th>
                <th style={{ width: 90 }}></th>
              </tr>
            </thead>
            <tbody>
              {docs.map((d) => (
                <tr key={d.id}>
                  <td>
                    {d.documentRef} <span className="muted">v{d.versionNumber}</span>
                  </td>
                  <td>{d.eventLabel}</td>
                  <td>{d.plannedDate}</td>
                  <td>{new Date(d.createdAt).toLocaleDateString()}</td>
                  <td>
                    {d.trialId != null && (
                      <a href={`/trial/${d.trialId}`}>
                        <button>Review</button>
                      </a>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <p className="muted" style={{ fontSize: 12 }}>
          Open the trial&apos;s Schedule view and select the application event to review the exact
          version, calculations and warnings before approving.
        </p>
      </div>

      <div className="card">
        <h2>Outstanding actions</h2>
        {outstanding.length === 0 ? (
          <p className="muted">No outstanding actions.</p>
        ) : (
          <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {outstanding.map((o) => (
              <li key={o.eventId} style={{ padding: '6px 0', fontSize: 13, color: '#9a6700' }}>
                ⚠ Application {o.label}
                {o.siteName ? ` (${o.siteName})` : ''} completed{' '}
                {o.daysOutstanding != null
                  ? `${o.daysOutstanding} day${o.daysOutstanding === 1 ? '' : 's'} ago`
                  : ''}{' '}
                — signed application document missing.{' '}
                <a href={`/trial/${o.trialId}`}>Open trial</a>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="card">
        <div className="cta-row">
          <h2 style={{ margin: 0 }}>Notifications</h2>
          {unread.length > 0 && (
            <button
              onClick={() =>
                api.notifications.markRead().then(() =>
                  setNotifications((all) =>
                    all.map((n) => ({ ...n, readAt: n.readAt ?? new Date().toISOString() }))
                  )
                )
              }
            >
              Mark all read ({unread.length})
            </button>
          )}
        </div>
        {notifications.length === 0 ? (
          <p className="muted">No notifications.</p>
        ) : (
          <ul style={{ listStyle: 'none', padding: 0, margin: '8px 0 0' }}>
            {notifications.map((n) => (
              <li
                key={n.id}
                style={{
                  padding: '6px 8px',
                  borderBottom: '1px solid var(--border, #eee)',
                  fontWeight: n.readAt ? 400 : 600,
                  fontSize: 13,
                }}
              >
                {(NOTIFICATION_TEXT[n.type] ?? (() => n.type))(n.payloadJson ?? {})}
                <span className="muted" style={{ fontWeight: 400, marginLeft: 8, fontSize: 11 }}>
                  {new Date(n.createdAt).toLocaleString()}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
