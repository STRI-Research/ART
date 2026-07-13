import { useEffect, useState } from 'react'
import { useStore } from '../store'
import { Combobox } from './Combobox'
import type { Property, PropertyScope } from '@shared/types'

/**
 * Editable key/value list for the generic property mechanism (site details or application
 * conditions). Rows are edited locally (so a freshly-added blank row stays put), and the whole
 * scope is persisted — dropping empty rows — on blur / discrete edits. Keys come from the
 * `property_key` library. This is the one metadata mechanism that avoids a wall of columns.
 */
export function PropertyList({
  scope,
  scopeRef,
  addLabel = '+ Add detail'
}: {
  scope: PropertyScope
  scopeRef?: string
  addLabel?: string
}): JSX.Element {
  const { snapshot, setSnapshot, run } = useStore()
  const ref = scopeRef ?? ''
  const saved = (snapshot?.properties ?? []).filter((p) => p.scope === scope && p.scopeRef === ref)

  // Local edit buffer — seeded from the snapshot, re-seeded when the saved set changes.
  const [rows, setRows] = useState<Property[]>(saved)
  const savedKey = saved.map((p) => `${p.key}=${p.value}`).join('|')
  useEffect(() => {
    setRows(saved)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [savedKey, scope, ref])

  const persist = (next: Property[]): void => {
    // Only rows with a key are saved; blank rows stay local until named.
    const keep = next.filter((p) => p.key.trim())
    void run('Saving properties', async () =>
      setSnapshot(await window.art.trial.saveProperties(scope, ref, keep))
    )
  }

  const setLocal = (i: number, patch: Partial<Property>): void =>
    setRows((prev) => prev.map((p, idx) => (idx === i ? { ...p, ...patch } : p)))
  const add = (): void => setRows((prev) => [...prev, { scope, scopeRef: ref, key: '', value: '' }])
  const remove = (i: number): void => {
    const next = rows.filter((_, idx) => idx !== i)
    setRows(next)
    persist(next)
  }

  return (
    <div className="property-list">
      {rows.map((p, i) => (
        <div className="row" key={i} style={{ gap: 8, marginBottom: 6, alignItems: 'flex-end' }}>
          <div style={{ width: 200 }}>
            <Combobox
              category="property_key"
              value={p.key}
              placeholder="detail (e.g. soil type)"
              onChange={(v) => {
                const next = rows.map((x, idx) => (idx === i ? { ...x, key: v } : x))
                setRows(next)
                persist(next)
              }}
            />
          </div>
          <div style={{ flex: 1, minWidth: 160 }}>
            <input
              value={p.value}
              placeholder="value"
              onChange={(e) => setLocal(i, { value: e.target.value })}
              onBlur={() => persist(rows)}
            />
          </div>
          <button className="danger" title="Remove" onClick={() => remove(i)}>
            ✕
          </button>
        </div>
      ))}
      <button onClick={add}>{addLabel}</button>
    </div>
  )
}
