'use client'

import { useEffect, useState } from 'react'
import QRCode from 'qrcode'
import { api, type TrialSnapshot } from '@/lib/api'
import { toProjectSnapshot } from '@/lib/snapshot'
import { PlotGrid } from '@/components/PlotGrid'
import { formatQuantity, formatTotal } from '@shared/appcalc'
import type { DocumentSnapshot } from '@shared/approval'

interface PackData {
  mode: 'approved' | 'draft'
  snapshot: DocumentSnapshot
  event: {
    id: number
    label: string
    plannedDate: string
    actualDate: string
    executionStatus: string
  }
  document: {
    id: number
    versionNumber: number
    status: string
    documentRef: string
    createdAt: string
    firstCheckerName: string
    firstCheckAt: string | null
    approverName: string
    approvedByName: string
    approvedAt: string | null
  } | null
}

/**
 * The generated application pack (brief §20): §1 control & approval, §2 randomized plot map,
 * §3+ one weigh/dilution section per treatment mix, final field-execution record. Renders from
 * the approved document's immutable snapshot (or as a watermarked DRAFT), prints via the
 * browser's print CSS like every other ART document.
 */
export function ApplicationPack({ trialId, eventId }: { trialId: number; eventId: number }) {
  const [pack, setPack] = useState<PackData | null>(null)
  const [trial, setTrial] = useState<TrialSnapshot | null>(null)
  const [qr, setQr] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    Promise.all([
      fetch(`/api/trial/${trialId}/event/${eventId}/pack`).then(async (r) => {
        if (!r.ok) throw new Error(await r.text())
        return r.json() as Promise<PackData>
      }),
      api.trials.get(trialId),
    ])
      .then(([p, t]) => {
        setPack(p)
        setTrial(t)
        const ref = p.document?.documentRef ?? `ART-${trialId}-${p.event.label}-draft`
        return QRCode.toDataURL(`${window.location.origin}/apply/${encodeURIComponent(ref)}`, {
          width: 140,
          margin: 1,
        }).then(setQr)
      })
      .catch((e: Error) => {
        try {
          setError(JSON.parse(e.message).error ?? e.message)
        } catch {
          setError(e.message)
        }
      })
  }, [trialId, eventId])

  if (error) {
    return (
      <div style={{ padding: 24 }}>
        <p style={{ color: 'var(--danger, #b00020)' }}>⚠ {error}</p>
      </div>
    )
  }
  if (!pack || !trial) {
    return (
      <div style={{ padding: 24 }}>
        <p className="muted">Generating application pack…</p>
      </div>
    )
  }

  const s = pack.snapshot
  const draft = pack.mode !== 'approved'
  const generatedAt = new Date().toLocaleString()

  const print = (): void => {
    if (!draft && pack.document) void api.documents.recordPrint(pack.document.id)
    window.print()
  }

  const field = (label: string, width = 160) => (
    <div style={{ display: 'inline-block', marginRight: 24, marginBottom: 10 }}>
      <span style={{ fontSize: 11, color: '#555' }}>{label}</span>
      <div style={{ borderBottom: '1px solid #999', width, height: 18 }} />
    </div>
  )
  const checkbox = (label: string) => (
    <span style={{ marginRight: 18, fontSize: 12 }}>☐ {label}</span>
  )

  return (
    <div style={{ maxWidth: 800, margin: '0 auto', padding: '24px 16px', position: 'relative' }}>
      <div className="no-print cta-row" style={{ marginBottom: 16 }}>
        <a href={`/trial/${trialId}`}>
          <button>&larr; Back to trial</button>
        </a>
        <button className="primary" onClick={print}>
          {draft ? 'Print draft' : 'Print approved application pack'}
        </button>
      </div>

      {draft && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            pointerEvents: 'none',
            zIndex: 10,
          }}
        >
          <div
            style={{
              transform: 'rotate(-30deg)',
              fontSize: 46,
              fontWeight: 800,
              color: 'rgba(200, 30, 30, 0.18)',
              whiteSpace: 'nowrap',
            }}
          >
            DRAFT — NOT APPROVED FOR APPLICATION
          </div>
        </div>
      )}

      {/* ------- Section 1: application control & approval ------- */}
      <div className="card">
        <div className="cta-row" style={{ alignItems: 'flex-start' }}>
          <div>
            <h1 style={{ margin: '0 0 4px', fontSize: 20 }}>Application record — {s.trial.protocolTitle || 'Trial'}</h1>
            <table style={{ fontSize: 13 }}>
              <tbody>
                {[
                  ['Trial reference', `${s.trial.protocolUid.slice(0, 8)} / trial ${s.trial.id}`],
                  ['Site', s.trial.siteName || '—'],
                  ['Location', s.trial.location || '—'],
                  ['Crop', s.trial.crop || '—'],
                  ['Investigator', s.trial.investigator || '—'],
                  ['Application', `${s.event.label} — planned ${s.event.plannedDate || '—'}`],
                  ['Document', pack.document ? `${pack.document.documentRef} (version ${pack.document.versionNumber})` : 'draft (no controlled version)'],
                  ['Generated', generatedAt],
                ].map(([k, v]) => (
                  <tr key={k}>
                    <td style={{ paddingRight: 16, color: '#555', paddingBottom: 2 }}>{k}</td>
                    <td style={{ paddingBottom: 2 }}>{v}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {qr && (
            <div style={{ textAlign: 'center' }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={qr} alt="QR link to this application record" width={110} height={110} />
              <div style={{ fontSize: 10, color: '#555' }}>Scan to open this application record</div>
            </div>
          )}
        </div>

        <table className="data" style={{ marginTop: 12 }}>
          <thead>
            <tr>
              <th></th>
              <th>Name</th>
              <th style={{ width: 180 }}>Date / time</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>First check</td>
              <td>{pack.document?.firstCheckerName || '—'}</td>
              <td>{pack.document?.firstCheckAt ? new Date(pack.document.firstCheckAt).toLocaleString() : '—'}</td>
            </tr>
            <tr>
              <td>Research Manager approval</td>
              <td>{pack.document?.approvedByName || pack.document?.approverName || '—'}</td>
              <td>{pack.document?.approvedAt ? new Date(pack.document.approvedAt).toLocaleString() : '—'}</td>
            </tr>
            <tr>
              <td>Approval status</td>
              <td colSpan={2}>
                <strong>{draft ? 'DRAFT — NOT APPROVED FOR APPLICATION' : 'Approved for application'}</strong>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* ------- Section 2: randomized plot map ------- */}
      <div className="card" style={{ pageBreakBefore: 'always' }}>
        <h2 style={{ marginTop: 0 }}>Plot map</h2>
        <p className="muted" style={{ fontSize: 12 }}>
          Treatments involved in this application:{' '}
          {s.mixes.map((m) => `T${m.treatmentNumber}`).join(', ') || 'none'} · plot{' '}
          {trial.protocol.plotWidth || '?'} × {trial.protocol.plotLength || '?'} m
        </p>
        {trial.plots.length > 0 ? (
          <PlotGrid snapshot={toProjectSnapshot(trial)} colourBy="treatment" legend cell={44} />
        ) : (
          <p className="muted">No randomized layout yet.</p>
        )}
      </div>

      {/* ------- Section 3+: one weigh section per treatment mix ------- */}
      {s.mixes.map((m) => {
        const adjusted = m.overageEnabled && m.overagePct > 0
        return (
          <div key={`${m.treatmentId}-${m.subMixIndex}`} className="card" style={{ pageBreakInside: 'avoid' }}>
            <h2 style={{ marginTop: 0 }}>
              Treatment {m.treatmentNumber}
              {m.treatmentName ? ` — ${m.treatmentName}` : ''}
              {m.subMixIndex > 0 ? ` (separate mix ${m.subMixIndex + 1})` : ''}
            </h2>
            <p style={{ fontSize: 13, margin: '4px 0' }}>
              {m.plotCount} plot(s) · plot area {m.plotAreaM2} m² · total treated area {m.treatedAreaM2} m²
              {m.waterVolumeLPerHa != null && <> · water volume {m.waterVolumeLPerHa} L/ha</>}
              {adjusted && <> · overage {m.overagePct}%</>}
            </p>
            <table className="data">
              <thead>
                <tr>
                  <th>Product</th>
                  <th style={{ width: 80 }}>STRI code</th>
                  <th style={{ width: 80 }}>MAPP</th>
                  <th style={{ width: 100 }}>Rate</th>
                  <th style={{ width: 90 }}>Per plot</th>
                  <th style={{ width: 100 }}>{adjusted ? 'Total (base)' : 'Total'}</th>
                  {adjusted && <th style={{ width: 110 }}>Measure (+{m.overagePct}%)</th>}
                  <th style={{ width: 70 }}>Added ☐</th>
                </tr>
              </thead>
              <tbody>
                <tr style={{ fontWeight: 600 }}>
                  <td>Water</td>
                  <td>—</td>
                  <td>—</td>
                  <td>{m.waterVolumeLPerHa != null ? `${m.waterVolumeLPerHa} L/ha` : '—'}</td>
                  <td>{m.water ? formatQuantity(m.water.perPlot, 'ml') : '—'}</td>
                  <td>{m.water ? formatTotal(m.water.total, 'ml') : '—'}</td>
                  {adjusted && <td>{m.water ? formatTotal(m.water.adjustedTotal, 'ml') : '—'}</td>}
                  <td></td>
                </tr>
                {m.products.map((p, i) => (
                  <tr key={i}>
                    <td>{p.productName}</td>
                    <td>{p.striCode || '—'}</td>
                    <td>{p.mappNumber || '—'}</td>
                    <td>
                      {p.rateValue != null
                        ? `${p.rateValue} ${p.rateUnit === 'ml/m2' ? 'ml/m²' : p.rateUnit === 'g/m2' ? 'g/m²' : p.rateUnit}`
                        : '—'}
                      {p.rateIsOverride ? ' *' : ''}
                    </td>
                    <td>{p.quantity ? formatQuantity(p.quantity.perPlot, p.quantity.unit) : '—'}</td>
                    <td>{p.quantity ? formatTotal(p.quantity.total, p.quantity.unit) : '—'}</td>
                    {adjusted && (
                      <td>{p.quantity ? formatTotal(p.quantity.adjustedTotal, p.quantity.unit) : '—'}</td>
                    )}
                    <td></td>
                  </tr>
                ))}
              </tbody>
            </table>
            {m.water && m.products.some((p) => p.quantity) && (
              <p style={{ fontSize: 12, margin: '8px 0 0' }}>
                <strong>Mixing:</strong> measure{' '}
                {formatTotal(adjusted ? m.water.adjustedTotal : m.water.total, 'ml')} water
                {m.products
                  .filter((p) => p.quantity)
                  .map(
                    (p) =>
                      `, add ${formatQuantity(
                        adjusted ? p.quantity!.adjustedTotal : p.quantity!.total,
                        p.quantity!.unit
                      )} ${p.productName}`
                  )
                  .join('')}
                . Products are added to the measured water — do not make up to a final volume.
              </p>
            )}
            {m.products.filter((p) => p.quantity).length > 1 && (
              <p style={{ fontSize: 12, color: '#9a6700', margin: '6px 0 0' }}>
                ⚠ Multiple products in this mix — confirm tank-mix compatibility before mixing.
              </p>
            )}
            {m.warnings
              .filter((w) => !w.includes('tank mixed'))
              .map((w, i) => (
                <p key={i} style={{ fontSize: 12, color: '#9a6700', margin: '4px 0 0' }}>
                  ⚠ {w}
                </p>
              ))}
          </div>
        )
      })}

      {/* ------- Final section: field execution record ------- */}
      <div className="card" style={{ pageBreakBefore: 'always' }}>
        <h2 style={{ marginTop: 0 }}>Field execution record — application {s.event.label}</h2>
        <div style={{ marginTop: 8 }}>
          {field('Actual application date')}
          {field('Start time', 100)}
          {field('Finish time', 100)}
          {field('Operator')}
          {field('Sprayer / equipment')}
          {field('Weighed by')}
          {field('Checked by')}
        </div>
        <h3 style={{ fontSize: 13, margin: '10px 0 6px' }}>Weather at application</h3>
        <div>
          {field('Temperature (°C)', 90)}
          {field('Relative humidity (%)', 90)}
          {field('Wind speed / direction', 140)}
          {field('Soil temperature (°C)', 90)}
          {field('Cloud cover', 100)}
          {field('Turf surface condition', 160)}
        </div>
        <h3 style={{ fontSize: 13, margin: '10px 0 6px' }}>Pre-application checks</h3>
        <div style={{ marginBottom: 8 }}>
          {checkbox('Nozzle check')}
          {checkbox('Filter check')}
          {checkbox('Visual inspection')}
          {checkbox('Chemvault / inventory updated')}
        </div>
        <h3 style={{ fontSize: 13, margin: '10px 0 6px' }}>Deviations from plan</h3>
        <p className="muted" style={{ fontSize: 11, margin: '0 0 4px' }}>
          Record any actual product, rate or water quantity that differed from the approved plan,
          with the reason.
        </p>
        <div style={{ borderBottom: '1px solid #999', height: 18, marginBottom: 8 }} />
        <div style={{ borderBottom: '1px solid #999', height: 18, marginBottom: 8 }} />
        <div style={{ borderBottom: '1px solid #999', height: 18, marginBottom: 16 }} />
        <div className="cta-row">
          {field('Operator signature', 220)}
          {field('Date', 100)}
        </div>
        <p className="muted" style={{ fontSize: 11 }}>
          After application: record completion in ART and upload this signed record via the QR code
          on page 1.
        </p>
      </div>
    </div>
  )
}
