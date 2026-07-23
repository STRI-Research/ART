'use client'

import { useMemo, useState } from 'react'
import { api, type TrialSnapshot } from '@/lib/api'
import {
  buildEventMixes,
  calculateMix,
  formatQuantity,
  formatTotal,
  type MixResult,
} from '@shared/appcalc'
import type { ApplicationEvent, Product, TankMixStatus } from '@shared/types'

const TANK_MIX_LABELS: Record<TankMixStatus, string> = {
  unconfirmed: 'Compatibility unconfirmed',
  confirmed: 'Compatibility confirmed',
  separate: 'Must be applied separately',
  not_confirmed: 'Compatibility NOT confirmed',
}

/**
 * Weigh-sheet calculation review for one application event (brief §16): one section per
 * treatment mix, water calculated once per mix, every product quantity listed separately,
 * base + adjusted (overage) values both shown. All numbers come from the shared calculation
 * engine — the same code that will feed the printed application pack.
 */
export function MixCalculations({
  trialId,
  event,
  snapshot,
  products,
  onSnapshotChange,
  onError,
}: {
  trialId: number
  event: ApplicationEvent
  snapshot: TrialSnapshot
  products: Product[]
  onSnapshotChange: (s: TrialSnapshot) => void
  onError: (msg: string) => void
}) {
  const pending = event.executionStatus === 'pending'
  const plotAreaM2 = (snapshot.protocol.plotWidth || 0) * (snapshot.protocol.plotLength || 0)

  const results: MixResult[] = useMemo(() => {
    const componentById = new Map(
      snapshot.treatments.flatMap((t) => t.components.map((c) => [c.id!, c] as const))
    )
    const productById = new Map(products.map((p) => [p.id!, p]))
    const treatmentById = new Map(snapshot.treatments.map((t) => [t.id!, t]))
    const mixes = buildEventMixes({
      eventId: event.id!,
      occurrences: snapshot.eventOccurrences,
      componentById,
      productById: new Map(
        [...productById.entries()].map(([id, p]) => [
          id,
          {
            id,
            name: p.name,
            code: p.code,
            mappNumber: p.mappNumber,
            physicalForm: p.physicalForm,
            defaultWaterVolLPerHa: p.defaultWaterVolLPerHa,
          },
        ])
      ),
      treatmentById,
      plots: snapshot.plots,
      plotAreaM2,
      mixSettings: snapshot.treatmentMixes.filter((m) => m.eventId === event.id),
    })
    return mixes.map((m) => calculateMix(m))
  }, [snapshot, products, event.id, plotAreaM2])

  const run = (p: Promise<TrialSnapshot>): void => {
    onError('')
    p.then(onSnapshotChange).catch((e: Error) => {
      try {
        onError(JSON.parse(e.message).error ?? e.message)
      } catch {
        onError(e.message)
      }
    })
  }

  if (results.length === 0) {
    return (
      <p className="muted" style={{ fontSize: 13 }}>
        No treatment mixes for this event (untreated only, or no product lines).
      </p>
    )
  }

  return (
    <div>
      {plotAreaM2 <= 0 && (
        <p style={{ color: 'var(--danger, #b00020)', fontSize: 13 }}>
          ⚠ Plot dimensions are not set on the protocol — quantities cannot be calculated.
        </p>
      )}
      {results.map((r) => (
        <MixSection
          key={`${r.treatmentId}-${r.subMixIndex}`}
          trialId={trialId}
          event={event}
          result={r}
          settings={snapshot.treatmentMixes.find(
            (m) => m.eventId === event.id && m.treatmentId === r.treatmentId
          )}
          pending={pending}
          run={run}
        />
      ))}
    </div>
  )
}

function MixSection({
  trialId,
  event,
  result: r,
  settings,
  pending,
  run,
}: {
  trialId: number
  event: ApplicationEvent
  result: MixResult
  settings: TrialSnapshot['treatmentMixes'][number] | undefined
  pending: boolean
  run: (p: Promise<TrialSnapshot>) => void
}) {
  const [water, setWater] = useState<string>(
    r.waterVolumeLPerHa != null ? String(r.waterVolumeLPerHa) : ''
  )
  const [overagePct, setOveragePct] = useState<string>(String(r.overagePct || ''))
  const [notes, setNotes] = useState(settings?.tankMixNotes ?? '')

  const save = (patch: Parameters<typeof api.trials.saveMixSettings>[3]): void =>
    run(api.trials.saveMixSettings(trialId, event.id!, r.treatmentId!, patch))

  const showAdjusted = r.overageEnabled && r.overagePct > 0
  const mixTitle = `Treatment ${r.treatmentNumber}${r.treatmentName ? ` — ${r.treatmentName}` : ''}${
    r.subMixIndex > 0 ? ` (separate mix ${r.subMixIndex + 1})` : ''
  }`

  return (
    <div
      style={{
        border: '1px solid var(--border, #ddd)',
        borderRadius: 6,
        padding: 12,
        marginBottom: 12,
      }}
    >
      <div className="cta-row" style={{ alignItems: 'baseline' }}>
        <strong>{mixTitle}</strong>
        <span className="muted" style={{ fontSize: 12 }}>
          {r.plotCount} plot(s) × {r.plotAreaM2} m² = {r.treatedAreaM2} m² treated
        </span>
      </div>

      {pending && (
        <div className="row" style={{ gap: 12, alignItems: 'flex-end', marginTop: 8, flexWrap: 'wrap' }}>
          <div style={{ width: 130 }}>
            <label>Water (L/ha)</label>
            <input
              type="number"
              step="any"
              min={0}
              value={water}
              onChange={(e) => setWater(e.target.value)}
              onBlur={() =>
                save({ waterVolumeLPerHa: water === '' ? null : Number(water) })
              }
            />
          </div>
          <div style={{ width: 140 }}>
            <label>Overage</label>
            <select
              value={r.overageEnabled ? 'custom' : 'none'}
              onChange={(e) =>
                save(
                  e.target.value === 'none'
                    ? { overageEnabled: false }
                    : { overageEnabled: true, overagePct: Number(overagePct) || 10 }
                )
              }
            >
              <option value="none">No overage</option>
              <option value="custom">Overage %</option>
            </select>
          </div>
          {r.overageEnabled && (
            <div style={{ width: 90 }}>
              <label>%</label>
              <input
                type="number"
                min={0}
                max={100}
                step="any"
                value={overagePct}
                onChange={(e) => setOveragePct(e.target.value)}
                onBlur={() => save({ overagePct: Number(overagePct) || 0 })}
              />
            </div>
          )}
          <div style={{ width: 220 }}>
            <label>Tank mix</label>
            <select
              value={settings?.tankMixStatus ?? 'unconfirmed'}
              onChange={(e) => save({ tankMixStatus: e.target.value as TankMixStatus })}
            >
              {(Object.keys(TANK_MIX_LABELS) as TankMixStatus[]).map((s) => (
                <option key={s} value={s}>
                  {TANK_MIX_LABELS[s]}
                </option>
              ))}
            </select>
          </div>
          <div style={{ flex: 1, minWidth: 160 }}>
            <label>Mix notes</label>
            <input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              onBlur={() => notes !== (settings?.tankMixNotes ?? '') && save({ tankMixNotes: notes })}
            />
          </div>
        </div>
      )}

      <table className="data" style={{ marginTop: 10 }}>
        <thead>
          <tr>
            <th></th>
            <th style={{ width: 110 }}>Rate</th>
            <th style={{ width: 100 }}>Per plot</th>
            <th style={{ width: 110 }}>Total</th>
            {showAdjusted && <th style={{ width: 130 }}>+{r.overagePct}% overage</th>}
          </tr>
        </thead>
        <tbody>
          <tr style={{ fontWeight: 550 }}>
            <td>Water</td>
            <td>{r.waterVolumeLPerHa != null ? `${r.waterVolumeLPerHa} L/ha` : '—'}</td>
            <td>{r.water ? formatQuantity(r.water.perPlot, 'ml') : '—'}</td>
            <td>{r.water ? formatTotal(r.water.total, 'ml') : '—'}</td>
            {showAdjusted && <td>{r.water ? formatTotal(r.water.adjustedTotal, 'ml') : '—'}</td>}
          </tr>
          {r.products.map((p, i) => (
            <tr key={i}>
              <td>
                {p.productName}
                {p.rateIsOverride && (
                  <span className="muted" style={{ fontSize: 11 }}>
                    {' '}
                    (rate override)
                  </span>
                )}
              </td>
              <td>
                {p.rateValue != null ? `${p.rateValue} ${p.rateUnit === 'ml/m2' ? 'ml/m²' : p.rateUnit === 'g/m2' ? 'g/m²' : p.rateUnit}` : '—'}
              </td>
              <td>{p.quantity ? formatQuantity(p.quantity.perPlot, p.quantity.unit) : '—'}</td>
              <td>
                {p.quantity ? formatTotal(p.quantity.total, p.quantity.unit) : '—'}
                {p.quantity?.belowMeasurable && ' ⚠'}
              </td>
              {showAdjusted && (
                <td>{p.quantity ? formatTotal(p.quantity.adjustedTotal, p.quantity.unit) : '—'}</td>
              )}
            </tr>
          ))}
        </tbody>
      </table>

      {r.water && r.products.some((p) => p.quantity) && (
        <p className="muted" style={{ fontSize: 12, margin: '8px 0 0' }}>
          Mixing: measure {formatTotal((showAdjusted ? r.water.adjustedTotal : r.water.total), 'ml')} water
          {r.products
            .filter((p) => p.quantity)
            .map(
              (p) =>
                `, add ${formatQuantity(
                  showAdjusted ? p.quantity!.adjustedTotal : p.quantity!.total,
                  p.quantity!.unit
                )} ${p.productName}`
            )
            .join('')}
          . Products are added to the measured water — do not make up to a final volume.
        </p>
      )}

      {r.warnings.length > 0 && (
        <div style={{ marginTop: 8 }}>
          {r.warnings.map((w, i) => (
            <p key={i} style={{ margin: '2px 0', fontSize: 12, color: '#9a6700' }}>
              ⚠ {w}
            </p>
          ))}
        </div>
      )}
    </div>
  )
}
