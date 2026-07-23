'use client'

import { useState } from 'react'
import { api, type TrialSnapshot } from '@/lib/api'
import { PropertyList } from '@/components/PropertyList'
import type { SiteMetadata } from '@shared/types'

type TextField = Exclude<keyof SiteMetadata, 'fundedApplicationCount'>

const FIELDS: { key: TextField; label: string; width?: number }[] = [
  { key: 'siteName', label: 'Site name' },
  { key: 'operator', label: 'Operator / investigator' },
  { key: 'location', label: 'Location / field' },
  { key: 'city', label: 'City', width: 160 },
  { key: 'state', label: 'State / region', width: 160 },
  { key: 'country', label: 'Country', width: 160 },
  { key: 'plantingDate', label: 'Planting date', width: 160 },
]

/** Trial-only view: capture this site's metadata. Saved independently of randomization (the trial
 *  record exists up front), so it can be filled in before generating the layout. */
export function SiteView({
  trialId,
  snapshot,
  onSnapshotChange,
}: {
  trialId: number
  snapshot: TrialSnapshot
  onSnapshotChange: (snapshot: TrialSnapshot) => void
}) {
  const trial = snapshot.trial

  const [site, setSite] = useState<SiteMetadata>({
    siteName: trial.siteName ?? '',
    operator: trial.operator ?? '',
    location: trial.location ?? '',
    city: trial.city ?? '',
    state: trial.state ?? '',
    country: trial.country ?? '',
    plantingDate: trial.plantingDate ?? '',
    trialNotes: trial.trialNotes ?? '',
    startDate: trial.startDate ?? '',
    endDate: trial.endDate ?? '',
    fundedApplicationCount: trial.fundedApplicationCount ?? null,
  })

  // Persist on blur so a field commits when the user moves on (no explicit Save needed).
  const persist = async (next: SiteMetadata) => {
    const updated = await api.trials.saveSite(trialId, next)
    onSnapshotChange(updated)
  }

  return (
    <>
      <div className="card">
        <h2>Site Information</h2>
        <p className="muted">
          Recorded on this trial and included in the report returned to the protocol author.
        </p>
        <div className="field-grid">
          {FIELDS.map((f) => (
            <div key={f.key} style={f.width ? { width: f.width } : undefined}>
              <label>{f.label}</label>
              <input
                value={site[f.key]}
                onChange={(e) => setSite({ ...site, [f.key]: e.target.value })}
                onBlur={() => persist(site)}
              />
            </div>
          ))}
          <div style={{ gridColumn: '1 / -1' }}>
            <label>Trial notes</label>
            <textarea
              rows={2}
              value={site.trialNotes}
              onChange={(e) => setSite({ ...site, trialNotes: e.target.value })}
              onBlur={() => persist(site)}
            />
          </div>
        </div>
      </div>

      <div className="card">
        <h2>Site Details</h2>
        <p className="muted">
          Additional details for this site (soil type, previous crop, variety…). These appear on the
          printed trial documents. Anything free-form can also go in Trial notes above.
        </p>
        <PropertyList
          trialId={trialId}
          scope="trial"
          properties={snapshot.properties}
          onSnapshotChange={onSnapshotChange}
          addLabel="+ Add detail"
        />
      </div>
    </>
  )
}
