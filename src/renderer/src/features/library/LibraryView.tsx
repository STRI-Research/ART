import { useEffect, useMemo, useState } from 'react'
import { useStore } from '../../store'
import {
  LIBRARY_CATEGORY_LABELS,
  LibraryCategory,
  isCropScoped,
  type PersonalTerm
} from '@shared/types'

/**
 * Manage the author's personal library — the vocabulary that has accreted from use across all
 * protocols on this machine. Terms show how often they've been used and which crops they've
 * appeared with (the implicit scope that drives ranking). Import/export shares a library with a
 * team. This library is machine-level; each protocol carries its own snapshot to trial operators.
 */
export function LibraryView(): JSX.Element {
  const { run, setNotice } = useStore()
  const [terms, setTerms] = useState<PersonalTerm[]>([])
  const [category, setCategory] = useState<LibraryCategory>('measurement_type')

  const load = (): void => {
    run('Loading library', async () => setTerms((await window.art.library.list()) ?? []))
  }
  // Load the personal library once on mount.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(load, [])

  const rows = useMemo(() => terms.filter((t) => t.category === category), [terms, category])
  const countFor = (c: LibraryCategory): number => terms.filter((t) => t.category === c).length
  const showCrops = isCropScoped(category)

  const saveLabel = (t: PersonalTerm, label: string): void => {
    if (label === t.label) return
    run('Updating term', async () => setTerms((await window.art.library.updateLabel(t.id, label)) ?? []))
  }
  const saveValue = (t: PersonalTerm, value: string): void => {
    const next = value.trim()
    if (!next || next === t.value) return
    run('Renaming term', async () => setTerms((await window.art.library.rename(t.id, next)) ?? []))
  }
  const remove = (id: number): void =>
    void run('Removing term', async () => setTerms((await window.art.library.remove(id)) ?? []))

  const exportLib = (): void =>
    void run('Exporting library', async () => {
      const path = await window.art.library.exportToFile()
      if (path) setNotice(`Library exported to ${path}`)
    })
  const importLib = (): void =>
    void run('Importing library', async () => {
      const res = await window.art.library.importFromFile()
      if (res) {
        setTerms((await window.art.library.list()) ?? [])
        setNotice(`Imported library: ${res.added} added, ${res.updated} updated`)
      }
    })

  return (
    <div className="card">
      <h2>Library</h2>
      <p className="muted">
        Your personal vocabulary, built up as you author trials. Terms are suggested as you type,
        ranked by the crops you've used them on. This library lives on this computer; each protocol
        carries a copy of the terms it uses so trial sites see the same names.
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
        <button onClick={exportLib}>Export…</button>
        <button onClick={importLib}>Import…</button>
      </div>

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
                Nothing here yet — values you type into {LIBRARY_CATEGORY_LABELS[category].toLowerCase()}{' '}
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
                  title="Rename this term (does not change values already saved in existing protocols)"
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
    </div>
  )
}
