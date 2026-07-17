'use client'

import { useEffect, useMemo, useState } from 'react'
import { api } from '@/lib/api'
import { LIBRARY_CATEGORY_LABELS, LibraryCategory, isCropScoped, type PersonalTerm } from '@shared/types'

/**
 * Manage the personal library — the vocabulary that accretes from use across all protocols. Terms
 * show how often they've been used and which crops they've appeared with (the implicit scope that
 * drives ranking in `library/suggest`). Import/export was Electron file-dialog based and is dropped
 * here; the library lives in the shared database instead of a per-machine file.
 */
export function LibraryView() {
  const [terms, setTerms] = useState<PersonalTerm[]>([])
  const [loading, setLoading] = useState(true)
  const [category, setCategory] = useState<LibraryCategory>('measurement_type')
  const [busy, setBusy] = useState(false)

  const load = (): void => {
    setLoading(true)
    api.library
      .list()
      .then(setTerms)
      .finally(() => setLoading(false))
  }
  useEffect(load, [])

  const rows = useMemo(() => terms.filter((t) => t.category === category), [terms, category])
  const countFor = (c: LibraryCategory): number => terms.filter((t) => t.category === c).length
  const showCrops = isCropScoped(category)

  const saveLabel = async (t: PersonalTerm, label: string): Promise<void> => {
    if (label === t.label) return
    setBusy(true)
    try {
      const updated = await api.library.update(t.id, { label })
      setTerms((prev) => prev.map((x) => (x.id === updated.id ? updated : x)))
    } finally {
      setBusy(false)
    }
  }
  const saveValue = async (t: PersonalTerm, value: string): Promise<void> => {
    const next = value.trim()
    if (!next || next === t.value) return
    setBusy(true)
    try {
      const updated = await api.library.update(t.id, { value: next })
      setTerms((prev) => prev.map((x) => (x.id === updated.id ? updated : x)))
    } finally {
      setBusy(false)
    }
  }
  const remove = async (id: number): Promise<void> => {
    setBusy(true)
    try {
      await api.library.remove(id)
      setTerms((prev) => prev.filter((t) => t.id !== id))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="card">
      <h2>Library</h2>
      <p className="muted">
        The shared personal vocabulary, built up as trials are authored. Terms are suggested as you
        type, ranked by the crops they've been used on.
      </p>

      <div className="row" style={{ marginBottom: 12 }}>
        <div style={{ width: 240 }}>
          <label>Category</label>
          <select value={category} onChange={(e) => setCategory(e.target.value as LibraryCategory)}>
            {LibraryCategory.options.map((c) => (
              <option key={c} value={c}>
                {LIBRARY_CATEGORY_LABELS[c]} ({countFor(c)})
              </option>
            ))}
          </select>
        </div>
        <div className="spacer" style={{ flex: 1 }} />
        {busy && <span className="muted">Saving…</span>}
      </div>

      {loading ? (
        <p className="muted">Loading…</p>
      ) : (
        <table className="data">
          <thead>
            <tr>
              <th style={{ width: 160 }}>Value</th>
              <th>Description</th>
              {showCrops && <th style={{ width: 200 }}>Used on crops</th>}
              <th style={{ width: 60 }} className="num">
                Uses
              </th>
              <th style={{ width: 40 }}></th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={showCrops ? 5 : 4} className="muted">
                  Nothing here yet — values entered into {LIBRARY_CATEGORY_LABELS[category].toLowerCase()}{' '}
                  fields will appear here.
                </td>
              </tr>
            )}
            {rows.map((t) => (
              <tr key={t.id}>
                <td>
                  <input
                    defaultValue={t.value}
                    onBlur={(e) => saveValue(t, e.target.value)}
                    title="Rename this term (does not change values already saved in existing trials)"
                  />
                </td>
                <td>
                  <input defaultValue={t.label} onBlur={(e) => saveLabel(t, e.target.value)} />
                </td>
                {showCrops && <td className="muted">{t.crops.join(', ') || '—'}</td>}
                <td className="num">{t.useCount}</td>
                <td>
                  <button className="danger" onClick={() => remove(t.id)} title="Remove term">
                    ✕
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
