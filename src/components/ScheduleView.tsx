'use client'

import { useEffect, useMemo, useState } from 'react'
import { api, type TrialSnapshot, type PlanConflictInfo } from '@/lib/api'
import { MixCalculations } from '@/components/MixCalculations'
import { ApprovalPanel } from '@/components/ApprovalPanel'
import { eventCountdown, daysBetween } from '@shared/plan'
import { parseScheduleRule, ruleLabel } from '@shared/schedule'
import type { ApplicationEvent, Product, TreatmentComponent } from '@shared/types'

/**
 * Operational application schedule (brief §11): a matrix with application events as columns and
 * treatment components as rows, plus planning inputs, funded-count conflict warnings, and an
 * event panel for move/rebase/merge/split/cancel/complete. Simple trials see the simple view;
 * per-occurrence controls live in the selected-event panel (progressive disclosure).
 */
export function ScheduleView({
  trialId,
  snapshot,
  onSnapshotChange,
}: {
  trialId: number
  snapshot: TrialSnapshot
  onSnapshotChange: (snapshot: TrialSnapshot) => void
}) {
  const [products, setProducts] = useState<Product[]>([])
  const [conflict, setConflict] = useState<PlanConflictInfo | null>(null)
  const [error, setError] = useState('')
  const [selectedEventId, setSelectedEventId] = useState<number | null>(null)
  const [showCancelled, setShowCancelled] = useState(false)

  useEffect(() => {
    api.products.list().then(setProducts)
  }, [])

  const trial = snapshot.trial
  const today = new Date().toISOString().slice(0, 10)
  const productById = useMemo(() => new Map(products.map((p) => [p.id!, p])), [products])
  const treatmentById = useMemo(
    () => new Map(snapshot.treatments.map((t) => [t.id!, t])),
    [snapshot.treatments]
  )

  // Component rows, grouped by treatment order.
  const componentRows = useMemo(() => {
    const rows: { component: TreatmentComponent; treatmentNumber: number; treatmentName: string }[] = []
    for (const t of snapshot.treatments) {
      for (const c of t.components) {
        rows.push({ component: c, treatmentNumber: t.number, treatmentName: t.name })
      }
    }
    return rows
  }, [snapshot.treatments])

  const events = useMemo(() => {
    const list = snapshot.applicationEvents.filter(
      (e) => showCancelled || e.planningStatus !== 'cancelled'
    )
    return [...list].sort((a, b) =>
      a.plannedDate < b.plannedDate ? -1 : a.plannedDate > b.plannedDate ? 1 : a.sequence - b.sequence
    )
  }, [snapshot.applicationEvents, showCancelled])

  const occByEvent = useMemo(() => {
    const m = new Map<number, typeof snapshot.eventOccurrences>()
    for (const o of snapshot.eventOccurrences) {
      const arr = m.get(o.eventId) ?? []
      arr.push(o)
      m.set(o.eventId, arr)
    }
    return m
  }, [snapshot.eventOccurrences])

  const handle = (p: Promise<TrialSnapshot>): void => {
    setError('')
    p.then(onSnapshotChange).catch((e: Error) => {
      try {
        setError(JSON.parse(e.message).error ?? e.message)
      } catch {
        setError(e.message)
      }
    })
  }

  const saveTrialPlan = (patch: {
    startDate?: string
    endDate?: string
    fundedApplicationCount?: number | null
  }): void => handle(api.trials.saveSite(trialId, patch))

  const generate = (): void => {
    const pending = snapshot.applicationEvents.filter(
      (e) => e.executionStatus === 'pending' && e.planningStatus === 'planned'
    )
    if (
      pending.length > 0 &&
      !confirm(
        `Regenerate the schedule? ${pending.length} pending event(s) will be replaced. Completed applications are kept unchanged.`
      )
    )
      return
    setError('')
    api.trials
      .generatePlan(trialId)
      .then(({ snapshot: s, conflict: c }) => {
        onSnapshotChange(s)
        setConflict(c)
      })
      .catch((e: Error) => {
        try {
          setError(JSON.parse(e.message).error ?? e.message)
        } catch {
          setError(e.message)
        }
      })
  }

  const completedCount = snapshot.applicationEvents.filter((e) => e.executionStatus !== 'pending').length
  const plannedCount = snapshot.applicationEvents.filter(
    (e) => e.executionStatus === 'pending' && e.planningStatus === 'planned'
  ).length
  const daysToFinish = trial.endDate ? daysBetween(today, trial.endDate) : null

  const selectedEvent = events.find((e) => e.id === selectedEventId) ?? null

  return (
    <>
      <div className="card">
        <h2>Application Schedule</h2>
        {error && <p style={{ color: 'var(--danger, #b00020)', fontSize: 13 }}>⚠ {error}</p>}
        <div className="row" style={{ alignItems: 'flex-end', gap: 16, flexWrap: 'wrap' }}>
          <div style={{ width: 150 }}>
            <label>Trial start</label>
            <input
              type="date"
              defaultValue={trial.startDate}
              onBlur={(e) => e.target.value !== trial.startDate && saveTrialPlan({ startDate: e.target.value })}
            />
          </div>
          <div style={{ width: 150 }}>
            <label>Trial finish</label>
            <input
              type="date"
              defaultValue={trial.endDate}
              onBlur={(e) => e.target.value !== trial.endDate && saveTrialPlan({ endDate: e.target.value })}
            />
          </div>
          <div style={{ width: 170 }}>
            <label>Funded applications</label>
            <input
              type="number"
              min={1}
              defaultValue={trial.fundedApplicationCount ?? ''}
              placeholder="no limit"
              onBlur={(e) =>
                saveTrialPlan({
                  fundedApplicationCount: e.target.value === '' ? null : Number(e.target.value),
                })
              }
            />
          </div>
          <button className="primary" onClick={generate}>
            {snapshot.applicationEvents.length ? 'Regenerate schedule' : 'Generate schedule'}
          </button>
          <label style={{ display: 'flex', gap: 4, alignItems: 'center', fontSize: 12 }}>
            <input type="checkbox" checked={showCancelled} onChange={(e) => setShowCancelled(e.target.checked)} />
            show cancelled
          </label>
        </div>

        {conflict && (
          <div style={{ marginTop: 12, padding: 10, background: '#fff8e6', borderRadius: 6, fontSize: 13 }}>
            <strong>⚠ Schedule / funding mismatch:</strong> the rules generate{' '}
            <strong>{conflict.ruleEventCount}</strong> application events but{' '}
            <strong>{conflict.fundedCount}</strong> are funded (difference {conflict.difference > 0 ? '+' : ''}
            {conflict.difference}).
            <div className="muted" style={{ marginTop: 4 }}>
              Options: keep the dates and change the component intervals
              {conflict.suggestedIntervalDays != null && (
                <> (≈ every {conflict.suggestedIntervalDays} days fits the funded count)</>
              )}
              ; shorten the active period; change the funded count; or accept the mismatch and edit
              the schedule manually. Nothing has been discarded automatically.
            </div>
          </div>
        )}

        <div className="row" style={{ gap: 24, marginTop: 12, fontSize: 13 }}>
          <span>
            <strong>{completedCount}</strong> completed · <strong>{plannedCount}</strong> planned
          </span>
          {daysToFinish != null && (
            <span>
              <strong>{daysToFinish}</strong> days until trial finish
            </span>
          )}
          {snapshot.applicationEvents.some(
            (e) => e.executionStatus === 'completed' && e.evidenceStatus === 'outstanding'
          ) && (
            <span style={{ color: '#9a6700' }}>
              ⚠ completed application(s) awaiting signed evidence
            </span>
          )}
        </div>
      </div>

      {events.length > 0 && componentRows.length > 0 && (
        <div className="card" style={{ overflowX: 'auto' }}>
          <table className="data" style={{ minWidth: 600 }}>
            <thead>
              <tr>
                <th style={{ minWidth: 220 }}>Treatment / component</th>
                <th style={{ width: 110 }}>Rule</th>
                {events.map((ev) => {
                  const cd = eventCountdown(ev.plannedDate, today)
                  const done = ev.executionStatus !== 'pending'
                  const cancelled = ev.planningStatus === 'cancelled'
                  return (
                    <th
                      key={ev.id}
                      style={{
                        width: 90,
                        cursor: 'pointer',
                        background:
                          selectedEventId === ev.id
                            ? 'var(--accent-soft, #e8f0fe)'
                            : cancelled
                              ? '#f5f5f5'
                              : done
                                ? '#eef7ee'
                                : cd.overdue
                                  ? '#fdecea'
                                  : undefined,
                      }}
                      title={cancelled ? 'Cancelled' : done ? `Completed ${ev.actualDate}` : 'Click to manage this event'}
                      onClick={() => setSelectedEventId(ev.id === selectedEventId ? null : ev.id!)}
                    >
                      <div>{ev.label}</div>
                      <div style={{ fontWeight: 400, fontSize: 11 }}>{ev.plannedDate || '—'}</div>
                      <div style={{ fontWeight: 400, fontSize: 11 }} className="muted">
                        {cancelled
                          ? 'cancelled'
                          : done
                            ? `✓ ${ev.actualDate}`
                            : ev.decisionRequired
                              ? 'decision'
                              : cd.daysUntil == null
                                ? ''
                                : cd.overdue
                                  ? `${-cd.daysUntil}d overdue`
                                  : `in ${cd.daysUntil}d`}
                      </div>
                    </th>
                  )
                })}
              </tr>
            </thead>
            <tbody>
              {componentRows.map(({ component: c, treatmentNumber, treatmentName }) => (
                <tr key={c.id}>
                  <td>
                    <strong>T{treatmentNumber}</strong> {productById.get(c.productId)?.name ?? '…'}
                    <div className="muted" style={{ fontSize: 11 }}>
                      {treatmentName}
                    </div>
                  </td>
                  <td style={{ fontSize: 11 }}>{ruleLabel(parseScheduleRule(c.scheduleRule))}</td>
                  {events.map((ev) => {
                    const occ = (occByEvent.get(ev.id!) ?? []).find((o) => o.componentId === c.id)
                    return (
                      <td key={ev.id} className="num" style={{ textAlign: 'center' }}>
                        {occ ? (
                          <span
                            title={
                              occ.status === 'cancelled'
                                ? 'Cancelled'
                                : occ.plannedRateValue != null
                                  ? `Rate override: ${occ.plannedRateValue} ${occ.plannedRateUnit}`
                                  : undefined
                            }
                            style={{
                              opacity: occ.status === 'cancelled' ? 0.35 : 1,
                              textDecoration: occ.status === 'cancelled' ? 'line-through' : undefined,
                            }}
                          >
                            {occ.status === 'applied' ? '✓' : occ.plannedRateValue != null ? '✱' : '●'}
                          </span>
                        ) : (
                          ''
                        )}
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
          <p className="muted" style={{ fontSize: 11, marginBottom: 0 }}>
            ● planned · ✱ planned with rate override · ✓ applied. Click an event column header to
            move, merge, split, complete or cancel it.
          </p>
        </div>
      )}

      {events.length === 0 && (
        <div className="card">
          <p className="muted">
            No application events yet. Set the trial start/finish dates and generate the schedule
            from the treatment programme rules{componentRows.length === 0 ? ' (the protocol has no components yet)' : ''}.
          </p>
        </div>
      )}

      {selectedEvent && (
        <EventPanel
          key={selectedEvent.id}
          trialId={trialId}
          event={selectedEvent}
          events={events}
          occurrences={occByEvent.get(selectedEvent.id!) ?? []}
          snapshot={snapshot}
          products={products}
          productById={productById}
          treatmentById={treatmentById}
          componentRows={componentRows}
          onResult={(s) => {
            onSnapshotChange(s)
          }}
          onError={setError}
          onClose={() => setSelectedEventId(null)}
        />
      )}
    </>
  )
}

function EventPanel({
  trialId,
  event: ev,
  events,
  occurrences,
  snapshot,
  products,
  productById,
  treatmentById,
  componentRows,
  onResult,
  onError,
  onClose,
}: {
  trialId: number
  event: ApplicationEvent
  events: ApplicationEvent[]
  occurrences: TrialSnapshot['eventOccurrences']
  snapshot: TrialSnapshot
  products: Product[]
  productById: Map<number, Product>
  treatmentById: Map<number, TrialSnapshot['treatments'][number]>
  componentRows: { component: TreatmentComponent; treatmentNumber: number; treatmentName: string }[]
  onResult: (s: TrialSnapshot) => void
  onError: (msg: string) => void
  onClose: () => void
}) {
  const [showCalc, setShowCalc] = useState(false)
  const [moveDate, setMoveDate] = useState(ev.plannedDate)
  const [moveScope, setMoveScope] = useState<'event' | 'rebase'>('event')
  const [reason, setReason] = useState('')
  const [actualDate, setActualDate] = useState(ev.plannedDate)
  const [operator, setOperator] = useState('')
  const [sprayer, setSprayer] = useState('')
  const [manualComponentId, setManualComponentId] = useState<number | ''>('')

  const pending = ev.executionStatus === 'pending' && ev.planningStatus === 'planned'
  const otherPending = events.filter(
    (e) => e.id !== ev.id && e.executionStatus === 'pending' && e.planningStatus === 'planned'
  )

  const run = (p: Promise<TrialSnapshot>): void => {
    onError('')
    p.then(onResult).catch((e: Error) => {
      try {
        onError(JSON.parse(e.message).error ?? e.message)
      } catch {
        onError(e.message)
      }
    })
  }

  const laterPendingCount = events.filter(
    (e) =>
      e.executionStatus === 'pending' &&
      e.planningStatus === 'planned' &&
      e.plannedDate > ev.plannedDate
  ).length

  return (
    <div className="card">
      <div className="cta-row">
        <h2 style={{ margin: 0 }}>
          Application {ev.label} — {ev.plannedDate}
          {ev.executionStatus !== 'pending' && (
            <span style={{ fontSize: 13, fontWeight: 400 }}> · completed {ev.actualDate}</span>
          )}
          {ev.planningStatus === 'cancelled' && (
            <span style={{ fontSize: 13, fontWeight: 400 }}> · cancelled</span>
          )}
        </h2>
        <div style={{ display: 'flex', gap: 8 }}>
          <a href={`/trial/${trialId}/pack/${ev.id}`}>
            <button>Application pack</button>
          </a>
          <button onClick={onClose}>Close</button>
        </div>
      </div>

      <table className="data" style={{ marginTop: 10 }}>
        <thead>
          <tr>
            <th style={{ width: 50 }}>Trt</th>
            <th>Product</th>
            <th style={{ width: 140 }}>Planned rate</th>
            <th style={{ width: 90 }}>Status</th>
            {pending && <th style={{ width: 260 }}>Actions</th>}
          </tr>
        </thead>
        <tbody>
          {occurrences.map((o) => {
            const comp = componentRows.find((r) => r.component.id === o.componentId)?.component
            const prod = comp ? productById.get(comp.productId) : undefined
            const trt = treatmentById.get(o.treatmentId)
            const effRate = o.plannedRateValue ?? comp?.rateValue
            const effUnit = o.plannedRateValue != null ? o.plannedRateUnit || comp?.rateUnit : comp?.rateUnit
            return (
              <tr key={o.id} style={o.status === 'cancelled' ? { opacity: 0.5 } : undefined}>
                <td className="num">T{trt?.number ?? o.treatmentId}</td>
                <td>{prod?.name ?? `component #${o.componentId}`}</td>
                <td>
                  {effRate != null ? `${effRate} ${effUnit ?? ''}` : '—'}
                  {o.plannedRateValue != null && (
                    <span className="muted" style={{ fontSize: 11 }}>
                      {' '}
                      (override)
                    </span>
                  )}
                </td>
                <td>{o.status}</td>
                {pending && (
                  <td>
                    <OccurrenceActions occurrence={o} component={comp} run={run} />
                  </td>
                )}
              </tr>
            )
          })}
          {occurrences.length === 0 && (
            <tr>
              <td colSpan={5} className="muted">
                No product lines in this event.
              </td>
            </tr>
          )}
        </tbody>
      </table>

      {occurrences.filter((o) => o.status !== 'cancelled').length > 1 && (
        <p style={{ fontSize: 12, color: '#9a6700', marginTop: 8 }}>
          ⚠ Multiple products are planned in this event. Where they share a treatment mix, confirm
          that they can be tank mixed.
        </p>
      )}

      <div style={{ marginTop: 12 }}>
        <button onClick={() => setShowCalc(!showCalc)}>
          {showCalc ? '▾ Hide weigh sheet' : '▸ Weigh sheet & calculations'}
        </button>
        {showCalc && (
          <div style={{ marginTop: 10 }}>
            <MixCalculations
              trialId={trialId}
              event={ev}
              snapshot={snapshot}
              products={products}
              onSnapshotChange={onResult}
              onError={onError}
            />
          </div>
        )}
      </div>

      <div style={{ marginTop: 16, borderTop: '1px solid var(--border, #ddd)', paddingTop: 12 }}>
        <h3 style={{ margin: '0 0 8px', fontSize: 14 }}>Checking & approval</h3>
        <ApprovalPanel trialId={trialId} event={ev} onError={onError} />
      </div>

      {pending && (
        <>
          <div className="row" style={{ alignItems: 'flex-end', gap: 12, marginTop: 12, flexWrap: 'wrap' }}>
            <div style={{ width: 150 }}>
              <label>Move to date</label>
              <input type="date" value={moveDate} onChange={(e) => setMoveDate(e.target.value)} />
            </div>
            <div>
              <label>Scope</label>
              <select value={moveScope} onChange={(e) => setMoveScope(e.target.value as 'event' | 'rebase')}>
                <option value="event">This event only</option>
                <option value="rebase">Rebase later events ({laterPendingCount}) by the same shift</option>
              </select>
            </div>
            <div style={{ flex: 1, minWidth: 160 }}>
              <label>Reason</label>
              <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. disease pressure increasing" />
            </div>
            <button
              disabled={!moveDate || moveDate === ev.plannedDate}
              onClick={() =>
                run(
                  api.trials.updateEvent(trialId, ev.id!, {
                    plannedDate: moveDate,
                    scope: moveScope,
                    reason,
                    expectedVersion: ev.version,
                  })
                )
              }
            >
              Move
            </button>
            {otherPending.length > 0 && (
              <select
                value=""
                onChange={(e) => {
                  const into = Number(e.target.value)
                  if (!into) return
                  if (
                    confirm(
                      'Merge this event into the selected one? Tank-mix compatibility must be confirmed for combined products.'
                    )
                  )
                    run(api.trials.mergeEvent(trialId, ev.id!, into, reason))
                }}
              >
                <option value="">Merge into…</option>
                {otherPending.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.label} ({e.plannedDate})
                  </option>
                ))}
              </select>
            )}
            <button
              className="danger"
              onClick={() => {
                if (confirm(`Cancel application ${ev.label}?`))
                  run(api.trials.updateEvent(trialId, ev.id!, { cancel: true, reason, expectedVersion: ev.version }))
              }}
            >
              Cancel event
            </button>
          </div>

          <div className="row" style={{ alignItems: 'flex-end', gap: 12, marginTop: 16, flexWrap: 'wrap' }}>
            <div style={{ width: 150 }}>
              <label>Actual date</label>
              <input type="date" value={actualDate} onChange={(e) => setActualDate(e.target.value)} />
            </div>
            <div style={{ width: 160 }}>
              <label>Operator</label>
              <input value={operator} onChange={(e) => setOperator(e.target.value)} />
            </div>
            <div style={{ width: 160 }}>
              <label>Sprayer</label>
              <input value={sprayer} onChange={(e) => setSprayer(e.target.value)} />
            </div>
            <button
              className="primary"
              disabled={!actualDate}
              onClick={() => {
                if (
                  confirm(
                    `Record application ${ev.label} as completed on ${actualDate}? Completed applications become fixed evidence.`
                  )
                )
                  run(api.trials.completeEvent(trialId, ev.id!, { actualDate, operator, sprayer }))
              }}
            >
              Record as completed
            </button>
          </div>

          <div className="row" style={{ alignItems: 'flex-end', gap: 12, marginTop: 16 }}>
            <div>
              <label>Add product line (manual)</label>
              <select value={manualComponentId} onChange={(e) => setManualComponentId(e.target.value === '' ? '' : Number(e.target.value))}>
                <option value="">choose component…</option>
                {componentRows.map((r) => (
                  <option key={r.component.id} value={r.component.id}>
                    T{r.treatmentNumber} {productById.get(r.component.productId)?.name}
                  </option>
                ))}
              </select>
            </div>
            <button
              disabled={manualComponentId === ''}
              onClick={() =>
                run(api.trials.addManualOccurrence(trialId, ev.plannedDate, manualComponentId as number))
              }
            >
              Add to this date
            </button>
          </div>
        </>
      )}
    </div>
  )
}

function OccurrenceActions({
  occurrence: o,
  component,
  run,
}: {
  occurrence: TrialSnapshot['eventOccurrences'][number]
  component: TreatmentComponent | undefined
  run: (p: Promise<TrialSnapshot>) => void
}) {
  const [showRate, setShowRate] = useState(false)
  const [showMove, setShowMove] = useState(false)
  const [rate, setRate] = useState<string>(o.plannedRateValue != null ? String(o.plannedRateValue) : '')
  const [rateReason, setRateReason] = useState(o.plannedOverrideReason)
  const [date, setDate] = useState('')
  const [rebase, setRebase] = useState(false)

  return (
    <div style={{ fontSize: 12 }}>
      <button onClick={() => setShowRate(!showRate)}>rate</button>{' '}
      <button onClick={() => setShowMove(!showMove)}>move</button>{' '}
      <button
        className="danger"
        onClick={() => run(api.trials.updateOccurrence(o.id!, { cancel: o.status !== 'cancelled' }))}
      >
        {o.status === 'cancelled' ? 'restore' : '✕'}
      </button>
      {showRate && (
        <div className="row" style={{ gap: 6, marginTop: 4, alignItems: 'center' }}>
          <input
            type="number"
            step="any"
            min={0}
            style={{ width: 80 }}
            value={rate}
            placeholder={component?.rateValue != null ? String(component.rateValue) : 'rate'}
            onChange={(e) => setRate(e.target.value)}
          />
          <input
            style={{ width: 150 }}
            value={rateReason}
            placeholder="reason (required)"
            onChange={(e) => setRateReason(e.target.value)}
          />
          <button
            disabled={rate !== '' && !rateReason.trim()}
            onClick={() =>
              run(
                api.trials.updateOccurrence(o.id!, {
                  plannedRateValue: rate === '' ? null : Number(rate),
                  plannedRateUnit: component?.rateUnit,
                  plannedOverrideReason: rateReason,
                })
              )
            }
          >
            {rate === '' ? 'clear override' : 'set'}
          </button>
        </div>
      )}
      {showMove && (
        <div className="row" style={{ gap: 6, marginTop: 4, alignItems: 'center' }}>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          <label style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
            <input type="checkbox" checked={rebase} onChange={(e) => setRebase(e.target.checked)} />
            rebase this component&apos;s later dates
          </label>
          <button
            disabled={!date}
            onClick={() => run(api.trials.updateOccurrence(o.id!, { date, rebaseComponent: rebase }))}
          >
            move line
          </button>
        </div>
      )}
    </div>
  )
}
