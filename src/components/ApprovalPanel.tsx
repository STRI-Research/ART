'use client'

import { useCallback, useEffect, useState } from 'react'
import { api, type AppDocument } from '@/lib/api'
import type { ApplicationEvent } from '@shared/types'

const STATUS_LABELS: Record<AppDocument['status'], string> = {
  draft: 'Draft',
  awaiting_approval: 'Awaiting Research Manager approval',
  returned: 'Returned for changes',
  approved: 'Approved for application',
  superseded: 'Superseded',
}

/**
 * Two-person approval workflow for one application event (brief §18): first check + submit to
 * a chosen Research Manager, approve / return-with-reason by the assigned approver, withdraw
 * by the preparer, and the approved-print gate. Identities are server-side Entra users; this
 * panel only renders what the API allows.
 */
export function ApprovalPanel({
  trialId,
  event,
  onError,
}: {
  trialId: number
  event: ApplicationEvent
  onError: (msg: string) => void
}) {
  const [doc, setDoc] = useState<AppDocument | null>(null)
  const [loading, setLoading] = useState(true)
  const [me, setMe] = useState<{ id: number; roles: string[] } | null>(null)
  const [users, setUsers] = useState<{ id: number; name: string; email: string }[]>([])
  const [approverId, setApproverId] = useState<number | ''>('')
  const [comments, setComments] = useState('')
  const [returnReason, setReturnReason] = useState('')

  const load = useCallback((): void => {
    Promise.all([api.documents.get(trialId, event.id!), api.users.list()]).then(([d, u]) => {
      setDoc(d)
      setMe(u.me)
      setUsers(u.users)
      setLoading(false)
    })
  }, [trialId, event.id])

  useEffect(load, [load])

  const run = (p: Promise<AppDocument | { ok: boolean }>): void => {
    onError('')
    p.then(() => load()).catch((e: Error) => {
      try {
        onError(JSON.parse(e.message).error ?? e.message)
      } catch {
        onError(e.message)
      }
    })
  }

  if (loading) return <p className="muted">Loading approval status…</p>

  const pending = event.executionStatus === 'pending' && event.planningStatus === 'planned'
  const canSubmit =
    pending && (!doc || doc.status === 'returned' || doc.status === 'superseded' || doc.status === 'draft')
  const isAssignedApprover = me != null && doc?.assignedApproverId === me.id
  const isResearchManager = !!me?.roles.includes('research_manager') || !!me?.roles.includes('admin')

  return (
    <div>
      {doc ? (
        <div style={{ fontSize: 13, marginBottom: 10 }}>
          <div>
            <strong>{doc.documentRef}</strong> — version {doc.versionNumber}:{' '}
            <strong>{STATUS_LABELS[doc.status]}</strong>
          </div>
          {doc.firstCheckerName && (
            <div className="muted">
              First check: {doc.firstCheckerName}
              {doc.firstCheckAt ? ` · ${new Date(doc.firstCheckAt).toLocaleString()}` : ''}
            </div>
          )}
          {doc.status === 'awaiting_approval' && doc.approverName && (
            <div className="muted">Awaiting: {doc.approverName}</div>
          )}
          {doc.status === 'approved' && (
            <div className="muted">
              Approved by {doc.approvedByName}
              {doc.approvedAt ? ` · ${new Date(doc.approvedAt).toLocaleString()}` : ''}
            </div>
          )}
          {doc.status === 'returned' && doc.returnReason && (
            <div style={{ color: '#9a6700' }}>Returned: {doc.returnReason}</div>
          )}
          {doc.status === 'superseded' && (
            <div style={{ color: '#9a6700' }}>
              Application changed after this version was checked — previous approvals apply to
              version {doc.versionNumber} only. The revised application requires checking again.
            </div>
          )}
        </div>
      ) : (
        <p className="muted" style={{ fontSize: 13 }}>
          No weigh-sheet version has been submitted for checking yet.
        </p>
      )}

      {canSubmit && (
        <div className="row" style={{ gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div style={{ minWidth: 220 }}>
            <label>Research Manager approver</label>
            <select
              value={approverId}
              onChange={(e) => setApproverId(e.target.value === '' ? '' : Number(e.target.value))}
            >
              <option value="">choose…</option>
              {users
                .filter((u) => u.id !== me?.id)
                .map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name || u.email}
                  </option>
                ))}
            </select>
          </div>
          <div style={{ flex: 1, minWidth: 180 }}>
            <label>Comments</label>
            <input value={comments} onChange={(e) => setComments(e.target.value)} />
          </div>
          <button
            className="primary"
            disabled={approverId === ''}
            title="Confirms you have reviewed the treatments, products, rates, water and calculations"
            onClick={() => {
              if (
                confirm(
                  'Complete the first check? This confirms you have reviewed the treatments, products, rates, water and calculations for this application.'
                )
              )
                run(api.documents.submit(trialId, event.id!, approverId as number, comments))
            }}
          >
            Complete first check & submit
          </button>
        </div>
      )}

      {doc?.status === 'awaiting_approval' && (
        <div style={{ marginTop: 10 }}>
          {isAssignedApprover ? (
            isResearchManager ? (
              <div className="row" style={{ gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
                <button
                  className="primary"
                  onClick={() => {
                    if (confirm(`Approve ${doc.documentRef} for application?`))
                      run(api.documents.action(doc.id, 'approve', doc.versionNumber))
                  }}
                >
                  Approve version {doc.versionNumber}
                </button>
                <div style={{ flex: 1, minWidth: 200 }}>
                  <label>Return reason</label>
                  <input
                    value={returnReason}
                    onChange={(e) => setReturnReason(e.target.value)}
                    placeholder="required to return for changes"
                  />
                </div>
                <button
                  disabled={!returnReason.trim()}
                  onClick={() =>
                    run(api.documents.action(doc.id, 'return', doc.versionNumber, { reason: returnReason }))
                  }
                >
                  Return for changes
                </button>
              </div>
            ) : (
              <p style={{ fontSize: 12, color: '#9a6700' }}>
                This application is assigned to you, but your account does not carry the
                Research Manager role (Entra app role) required to approve it.
              </p>
            )
          ) : (
            doc.firstCheckById === me?.id && (
              <button onClick={() => run(api.documents.action(doc.id, 'withdraw', doc.versionNumber))}>
                Withdraw from approval
              </button>
            )
          )}
        </div>
      )}

      {doc?.status === 'approved' && (
        <div style={{ marginTop: 10 }}>
          <a href={`/trial/${trialId}/pack/${event.id}`}>
            <button className="primary">Open approved application pack</button>
          </a>
          {doc.printedAt && (
            <span className="muted" style={{ fontSize: 12, marginLeft: 8 }}>
              last printed {new Date(doc.printedAt).toLocaleString()}
            </span>
          )}
        </div>
      )}
    </div>
  )
}
