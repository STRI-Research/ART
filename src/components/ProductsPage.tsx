'use client'

import { useEffect, useState } from 'react'
import { api } from '@/lib/api'
import { RATE_UNIT_LABELS, RateUnit, PhysicalForm, type Product } from '@shared/types'

const EMPTY: Product = {
  name: '',
  code: '',
  mappNumber: '',
  formulationType: '',
  physicalForm: 'liquid',
  defaultRateValue: null,
  defaultRateUnit: 'L/ha',
  minRateValue: null,
  maxRateValue: null,
  defaultWaterVolLPerHa: null,
  manufacturer: '',
  active: true,
  notes: '',
}

/**
 * The controlled product catalogue (brief §7): products are selected here once and then picked
 * from a list in the treatment builder — no more free-text product entry. Rate ranges configured
 * here drive out-of-range warnings on treatment components.
 */
export function ProductsPage() {
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<Product | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    api.products.list().then((p) => {
      setProducts(p)
      setLoading(false)
    })
  }, [])

  const save = (): void => {
    if (!editing) return
    setError('')
    const op = editing.id
      ? api.products.update(editing.id, editing)
      : api.products.create(editing as Product & { name: string })
    op.then((row) => {
      setProducts((all) => {
        const idx = all.findIndex((p) => p.id === row.id)
        const next = idx >= 0 ? all.map((p) => (p.id === row.id ? row : p)) : [...all, row]
        return next.sort((a, b) => a.name.localeCompare(b.name))
      })
      setEditing(null)
    }).catch((e: Error) => {
      try {
        setError(JSON.parse(e.message).error ?? e.message)
      } catch {
        setError(e.message)
      }
    })
  }

  const remove = (p: Product): void => {
    if (!p.id) return
    if (!confirm(`Delete product "${p.name}"? If it is referenced by any treatment it will be deactivated instead.`))
      return
    api.products.remove(p.id).then(({ deactivated }) => {
      setProducts((all) =>
        deactivated ? all.map((x) => (x.id === p.id ? { ...x, active: false } : x)) : all.filter((x) => x.id !== p.id)
      )
    })
  }

  if (loading) {
    return (
      <div style={{ padding: 24 }}>
        <p className="muted">Loading…</p>
      </div>
    )
  }

  const num = (v: number | null): string => (v == null ? '—' : String(v))

  return (
    <div style={{ maxWidth: 1000, margin: '0 auto', padding: '24px 16px' }}>
      <div className="cta-row" style={{ marginBottom: 16 }}>
        <h2 style={{ margin: 0 }}>Product catalogue</h2>
        <button className="primary" onClick={() => setEditing({ ...EMPTY })}>
          + Add product
        </button>
      </div>
      <p className="muted">
        Treatments select products from this catalogue — consistent identity, units, and rate
        ranges feed the weigh-sheet calculations and out-of-range warnings.
      </p>

      {products.length > 0 && (
        <div className="card">
          <table className="data">
            <thead>
              <tr>
                <th>Product</th>
                <th style={{ width: 90 }}>STRI code</th>
                <th style={{ width: 90 }}>MAPP</th>
                <th style={{ width: 70 }}>Form</th>
                <th style={{ width: 110 }}>Default rate</th>
                <th style={{ width: 120 }}>Expected range</th>
                <th style={{ width: 100 }}>Water (L/ha)</th>
                <th style={{ width: 70 }}>Active</th>
                <th style={{ width: 90 }}></th>
              </tr>
            </thead>
            <tbody>
              {products.map((p) => (
                <tr key={p.id} style={p.active ? undefined : { opacity: 0.5 }}>
                  <td>
                    {p.name}
                    {p.manufacturer && (
                      <div className="muted" style={{ fontSize: 11 }}>
                        {p.manufacturer}
                      </div>
                    )}
                  </td>
                  <td>{p.code || '—'}</td>
                  <td>{p.mappNumber || '—'}</td>
                  <td>{p.physicalForm}</td>
                  <td>
                    {p.defaultRateValue != null
                      ? `${p.defaultRateValue} ${RATE_UNIT_LABELS[p.defaultRateUnit as RateUnit] ?? p.defaultRateUnit}`
                      : '—'}
                  </td>
                  <td>
                    {p.minRateValue != null || p.maxRateValue != null
                      ? `${num(p.minRateValue)}–${num(p.maxRateValue)}`
                      : '—'}
                  </td>
                  <td>{num(p.defaultWaterVolLPerHa)}</td>
                  <td>{p.active ? '✓' : '—'}</td>
                  <td>
                    <button onClick={() => setEditing({ ...p })}>Edit</button>{' '}
                    <button className="danger" onClick={() => remove(p)}>
                      ✕
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editing && (
        <div className="card">
          <h2>{editing.id ? `Edit ${editing.name}` : 'New product'}</h2>
          {error && <p style={{ color: 'var(--danger, #b00020)', fontSize: 13 }}>⚠ {error}</p>}
          <div className="field-grid">
            <div>
              <label>Product name *</label>
              <input value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} />
            </div>
            <div>
              <label>STRI code</label>
              <input value={editing.code} onChange={(e) => setEditing({ ...editing, code: e.target.value })} />
            </div>
            <div>
              <label>MAPP number</label>
              <input
                value={editing.mappNumber}
                onChange={(e) => setEditing({ ...editing, mappNumber: e.target.value })}
              />
            </div>
            <div>
              <label>Manufacturer</label>
              <input
                value={editing.manufacturer}
                onChange={(e) => setEditing({ ...editing, manufacturer: e.target.value })}
              />
            </div>
            <div>
              <label>Formulation / type</label>
              <input
                value={editing.formulationType}
                onChange={(e) => setEditing({ ...editing, formulationType: e.target.value })}
              />
            </div>
            <div>
              <label>Physical form (calculation type)</label>
              <select
                value={editing.physicalForm}
                onChange={(e) => setEditing({ ...editing, physicalForm: e.target.value as PhysicalForm })}
              >
                <option value="liquid">Liquid (ml)</option>
                <option value="solid">Solid (g)</option>
              </select>
            </div>
            <div>
              <label>Default rate</label>
              <input
                type="number"
                step="any"
                min={0}
                value={editing.defaultRateValue ?? ''}
                onChange={(e) =>
                  setEditing({
                    ...editing,
                    defaultRateValue: e.target.value === '' ? null : Number(e.target.value),
                  })
                }
              />
            </div>
            <div>
              <label>Rate unit</label>
              <select
                value={editing.defaultRateUnit}
                onChange={(e) => setEditing({ ...editing, defaultRateUnit: e.target.value as RateUnit })}
              >
                {RateUnit.options.map((u) => (
                  <option key={u} value={u}>
                    {RATE_UNIT_LABELS[u]}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label>Expected minimum rate</label>
              <input
                type="number"
                step="any"
                min={0}
                value={editing.minRateValue ?? ''}
                onChange={(e) =>
                  setEditing({
                    ...editing,
                    minRateValue: e.target.value === '' ? null : Number(e.target.value),
                  })
                }
              />
            </div>
            <div>
              <label>Expected maximum rate</label>
              <input
                type="number"
                step="any"
                min={0}
                value={editing.maxRateValue ?? ''}
                onChange={(e) =>
                  setEditing({
                    ...editing,
                    maxRateValue: e.target.value === '' ? null : Number(e.target.value),
                  })
                }
              />
            </div>
            <div>
              <label>Default water volume (L/ha)</label>
              <input
                type="number"
                step="any"
                min={0}
                value={editing.defaultWaterVolLPerHa ?? ''}
                onChange={(e) =>
                  setEditing({
                    ...editing,
                    defaultWaterVolLPerHa: e.target.value === '' ? null : Number(e.target.value),
                  })
                }
              />
            </div>
            <div>
              <label>Active</label>
              <select
                value={editing.active ? '1' : '0'}
                onChange={(e) => setEditing({ ...editing, active: e.target.value === '1' })}
              >
                <option value="1">Active</option>
                <option value="0">Inactive</option>
              </select>
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
              <label>Notes</label>
              <textarea
                rows={2}
                value={editing.notes}
                onChange={(e) => setEditing({ ...editing, notes: e.target.value })}
              />
            </div>
          </div>
          <div className="cta-row" style={{ marginTop: 12 }}>
            <button onClick={() => setEditing(null)}>Cancel</button>
            <button className="primary" disabled={!editing.name.trim()} onClick={save}>
              Save product
            </button>
          </div>
        </div>
      )}

      {products.length === 0 && !editing && (
        <div className="card" style={{ textAlign: 'center' }}>
          <p className="muted">No products yet. Add the first one to start building treatments.</p>
        </div>
      )}
    </div>
  )
}
