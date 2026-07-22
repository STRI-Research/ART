'use client'

import { Fragment, useState } from 'react'
import { api } from '@/lib/api'
import { RATE_UNIT_LABELS, RateUnit, type Product, type TreatmentComponent } from '@shared/types'
import { parseScheduleRule, ruleLabel, type ScheduleRule, type ScheduleRuleType } from '@shared/schedule'
import { checkRateAgainstProduct } from '@shared/treatmentValidation'

const RULE_TYPES: { value: ScheduleRuleType; label: string }[] = [
  { value: 'once', label: 'Once only' },
  { value: 'calendar_interval', label: 'Every N days' },
  { value: 'weekly_interval', label: 'Every N weeks' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'manual', label: 'Manual dates' },
  { value: 'gdd', label: 'Growth degree days' },
  { value: 'growth_potential', label: 'Growth potential' },
  { value: 'review_pressure', label: 'Review pressure' },
]

function defaultRuleFor(type: ScheduleRuleType): ScheduleRule {
  switch (type) {
    case 'once':
      return { type: 'once' }
    case 'calendar_interval':
      return { type: 'calendar_interval', intervalDays: 14 }
    case 'weekly_interval':
      return { type: 'weekly_interval', intervalWeeks: 2 }
    case 'monthly':
      return { type: 'monthly', intervalMonths: 1 }
    case 'manual':
      return { type: 'manual', dates: [] }
    case 'gdd':
      return { type: 'gdd', targetGdd: 200 }
    case 'growth_potential':
      return { type: 'growth_potential' }
    case 'review_pressure':
      return { type: 'review_pressure' }
  }
}

/** One-line summary of a treatment's structured components, e.g. "Product X 1 L/ha (every 14 days)". */
export function componentSummary(
  components: TreatmentComponent[],
  productById: Map<number, Product>
): string {
  if (components.length === 0) return ''
  return components
    .map((c) => {
      const name = productById.get(c.productId)?.name ?? `product #${c.productId}`
      const rate = c.rateValue != null ? `${c.rateValue} ${RATE_UNIT_LABELS[c.rateUnit as RateUnit] ?? c.rateUnit}` : ''
      return [name, rate, `(${ruleLabel(parseScheduleRule(c.scheduleRule))})`].filter(Boolean).join(' ')
    })
    .join(' · ')
}

/**
 * Structured programme editor for one treatment: a list of components (product from the
 * catalogue + numeric rate + water volume + schedule rule + active window). Simple by default —
 * product / rate / unit / rule on one row; the active-window and water controls sit behind a
 * per-row "advanced" toggle (progressive disclosure).
 */
export function ComponentsEditor({
  treatmentId,
  components,
  products,
  disabled,
  onChange,
}: {
  treatmentId: number
  components: TreatmentComponent[]
  products: Product[]
  disabled?: boolean
  onChange: (components: TreatmentComponent[]) => void
}) {
  const [advanced, setAdvanced] = useState<Set<number>>(new Set())
  const [error, setError] = useState('')
  const productById = new Map(products.map((p) => [p.id!, p]))
  const activeProducts = products.filter((p) => p.active)

  const toggleAdvanced = (id: number): void =>
    setAdvanced((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const handle = (promise: Promise<unknown>, apply: () => void): void => {
    setError('')
    promise.then(apply).catch((e: Error) => {
      try {
        setError(JSON.parse(e.message).error ?? e.message)
      } catch {
        setError(e.message)
      }
    })
  }

  const add = (productId: number): void => {
    const prod = productById.get(productId)
    if (!prod) return
    handleAdd({
      productId,
      rateValue: prod.defaultRateValue,
      rateUnit: prod.defaultRateUnit,
      waterVolumeLPerHa: prod.defaultWaterVolLPerHa,
      scheduleRule: { type: 'once' },
      ordinal: components.length,
    })
  }
  const handleAdd = (c: Partial<TreatmentComponent>): void =>
    handle(
      api.components.add(treatmentId, c).then((row) => onChange([...components, row])),
      () => undefined
    )

  const patch = (id: number, p: Partial<TreatmentComponent>): void =>
    handle(
      api.components
        .update(id, p)
        .then((row) => onChange(components.map((c) => (c.id === id ? row : c)))),
      () => undefined
    )

  const remove = (id: number): void =>
    handle(
      api.components.remove(id).then(() => onChange(components.filter((c) => c.id !== id))),
      () => undefined
    )

  // Local (unsaved) numeric edits keyed by component id, committed on blur.
  const [drafts, setDrafts] = useState<Record<number, Partial<TreatmentComponent>>>({})
  const draftFor = (c: TreatmentComponent): TreatmentComponent => ({ ...c, ...drafts[c.id!] })
  const setDraft = (id: number, p: Partial<TreatmentComponent>): void =>
    setDrafts((d) => ({ ...d, [id]: { ...d[id], ...p } }))
  const commitDraft = (id: number): void => {
    const d = drafts[id]
    if (!d) return
    setDrafts((all) => {
      const rest = { ...all }
      delete rest[id]
      return rest
    })
    patch(id, d)
  }

  const ruleEditor = (c: TreatmentComponent): React.ReactNode => {
    const rule = parseScheduleRule(draftFor(c).scheduleRule)
    const setRule = (r: ScheduleRule): void => patch(c.id!, { scheduleRule: r })
    return (
      <span style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }}>
        <select
          disabled={disabled}
          value={rule.type}
          onChange={(e) => setRule(defaultRuleFor(e.target.value as ScheduleRuleType))}
        >
          {RULE_TYPES.map((r) => (
            <option key={r.value} value={r.value}>
              {r.label}
            </option>
          ))}
        </select>
        {rule.type === 'calendar_interval' && (
          <input
            type="number"
            min={1}
            max={365}
            style={{ width: 60 }}
            disabled={disabled}
            defaultValue={rule.intervalDays}
            title="Interval (days)"
            onBlur={(e) => {
              const v = Number(e.target.value)
              if (v >= 1 && v !== rule.intervalDays) setRule({ ...rule, intervalDays: v })
            }}
          />
        )}
        {rule.type === 'weekly_interval' && (
          <input
            type="number"
            min={1}
            max={52}
            style={{ width: 60 }}
            disabled={disabled}
            defaultValue={rule.intervalWeeks}
            title="Interval (weeks)"
            onBlur={(e) => {
              const v = Number(e.target.value)
              if (v >= 1 && v !== rule.intervalWeeks) setRule({ ...rule, intervalWeeks: v })
            }}
          />
        )}
        {rule.type === 'monthly' && (
          <input
            type="number"
            min={1}
            max={12}
            style={{ width: 60 }}
            disabled={disabled}
            defaultValue={rule.intervalMonths}
            title="Interval (months)"
            onBlur={(e) => {
              const v = Number(e.target.value)
              if (v >= 1 && v !== rule.intervalMonths) setRule({ ...rule, intervalMonths: v })
            }}
          />
        )}
        {rule.type === 'gdd' && (
          <input
            type="number"
            min={1}
            style={{ width: 80 }}
            disabled={disabled}
            defaultValue={rule.targetGdd}
            title="Target growth degree days"
            onBlur={(e) => {
              const v = Number(e.target.value)
              if (v > 0 && v !== rule.targetGdd) setRule({ ...rule, targetGdd: v })
            }}
          />
        )}
        {rule.type === 'manual' && (
          <input
            style={{ width: 180 }}
            disabled={disabled}
            defaultValue={rule.dates.join(', ')}
            placeholder="2026-05-01, 2026-06-01"
            title="Comma-separated ISO dates"
            onBlur={(e) => {
              const dates = e.target.value
                .split(',')
                .map((s) => s.trim())
                .filter((s) => /^\d{4}-\d{2}-\d{2}$/.test(s))
              setRule({ ...rule, dates })
            }}
          />
        )}
        {(rule.type === 'gdd' || rule.type === 'growth_potential' || rule.type === 'review_pressure') && (
          <span className="muted" style={{ fontSize: 11 }} title="Model-driven rules generate decision-required occurrences until weather integration lands">
            model ⏳
          </span>
        )}
      </span>
    )
  }

  return (
    <div className="treatment-program">
      {error && (
        <p style={{ color: 'var(--danger, #b00020)', fontSize: 12, marginTop: 0 }}>⚠ {error}</p>
      )}
      {components.length > 0 && (
        <table className="data">
          <thead>
            <tr>
              <th>Product</th>
              <th style={{ width: 90 }}>Rate</th>
              <th style={{ width: 90 }}>Unit</th>
              <th style={{ width: 240 }}>Schedule</th>
              <th style={{ width: 60 }}></th>
              {!disabled && <th style={{ width: 36 }}></th>}
            </tr>
          </thead>
          <tbody>
            {components.map((c) => {
              const d = draftFor(c)
              const prod = productById.get(c.productId)
              const rateCheck = prod
                ? checkRateAgainstProduct(d.rateValue, d.rateUnit, prod)
                : { inRange: true, notAssessed: true, message: '' }
              const duplicate = components.some(
                (x) => x.id !== c.id && x.productId === c.productId
              )
              return (
                <Fragment key={c.id}>
                  <tr>
                    <td>
                      <select
                        disabled={disabled}
                        value={c.productId}
                        onChange={(e) => patch(c.id!, { productId: Number(e.target.value) })}
                      >
                        {[...activeProducts, ...(prod && !prod.active ? [prod] : [])].map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name}
                            {!p.active ? ' (inactive)' : ''}
                          </option>
                        ))}
                      </select>
                      {duplicate && (
                        <div style={{ fontSize: 11, color: '#9a6700' }}>
                          ⚠ product appears twice in this treatment
                        </div>
                      )}
                    </td>
                    <td>
                      <input
                        type="number"
                        step="any"
                        min={0}
                        disabled={disabled}
                        value={d.rateValue ?? ''}
                        onChange={(e) =>
                          setDraft(c.id!, {
                            rateValue: e.target.value === '' ? null : Number(e.target.value),
                          })
                        }
                        onBlur={() => commitDraft(c.id!)}
                      />
                    </td>
                    <td>
                      <select
                        disabled={disabled}
                        value={d.rateUnit}
                        onChange={(e) => patch(c.id!, { rateUnit: e.target.value as RateUnit })}
                      >
                        {RateUnit.options.map((u) => (
                          <option key={u} value={u}>
                            {RATE_UNIT_LABELS[u]}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>{ruleEditor(c)}</td>
                    <td>
                      <button
                        className="expander"
                        title="Water volume, active window, tank-mix options"
                        onClick={() => toggleAdvanced(c.id!)}
                      >
                        {advanced.has(c.id!) ? '▾ more' : '▸ more'}
                      </button>
                    </td>
                    {!disabled && (
                      <td>
                        <button className="danger" title="Remove component" onClick={() => remove(c.id!)}>
                          ✕
                        </button>
                      </td>
                    )}
                  </tr>
                  {!rateCheck.inRange && (
                    <tr>
                      <td colSpan={disabled ? 5 : 6} style={{ background: '#fff8e6' }}>
                        <div style={{ fontSize: 12, color: '#9a6700' }}>⚠ {rateCheck.message}</div>
                        <input
                          style={{ width: '100%', marginTop: 4 }}
                          disabled={disabled}
                          placeholder="Reason for out-of-range rate (required)"
                          defaultValue={c.rateOutOfRangeReason}
                          onBlur={(e) => {
                            if (e.target.value !== c.rateOutOfRangeReason)
                              patch(c.id!, { rateOutOfRangeReason: e.target.value })
                          }}
                        />
                      </td>
                    </tr>
                  )}
                  {advanced.has(c.id!) && (
                    <tr>
                      <td colSpan={disabled ? 5 : 6}>
                        <div className="row" style={{ gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
                          <div style={{ width: 130 }}>
                            <label>Water (L/ha)</label>
                            <input
                              type="number"
                              step="any"
                              min={0}
                              disabled={disabled}
                              value={d.waterVolumeLPerHa ?? ''}
                              onChange={(e) =>
                                setDraft(c.id!, {
                                  waterVolumeLPerHa:
                                    e.target.value === '' ? null : Number(e.target.value),
                                })
                              }
                              onBlur={() => commitDraft(c.id!)}
                            />
                          </div>
                          <div style={{ width: 140 }}>
                            <label>Active from</label>
                            <input
                              type="date"
                              disabled={disabled}
                              value={d.activeFrom}
                              onChange={(e) => patch(c.id!, { activeFrom: e.target.value })}
                            />
                          </div>
                          <div style={{ width: 140 }}>
                            <label>Active until</label>
                            <input
                              type="date"
                              disabled={disabled}
                              value={d.activeUntil}
                              onChange={(e) => patch(c.id!, { activeUntil: e.target.value })}
                            />
                          </div>
                          <div style={{ width: 110 }}>
                            <label>Max occurrences</label>
                            <input
                              type="number"
                              min={1}
                              disabled={disabled}
                              value={d.maxOccurrences ?? ''}
                              onChange={(e) =>
                                setDraft(c.id!, {
                                  maxOccurrences:
                                    e.target.value === '' ? null : Number(e.target.value),
                                })
                              }
                              onBlur={() => commitDraft(c.id!)}
                            />
                          </div>
                          <div style={{ width: 120 }}>
                            <label>From occurrence</label>
                            <input
                              type="number"
                              min={1}
                              disabled={disabled}
                              value={d.fromOccurrence ?? ''}
                              onChange={(e) =>
                                setDraft(c.id!, {
                                  fromOccurrence:
                                    e.target.value === '' ? null : Number(e.target.value),
                                })
                              }
                              onBlur={() => commitDraft(c.id!)}
                            />
                          </div>
                          <label style={{ display: 'flex', gap: 4, alignItems: 'center', fontSize: 12 }}>
                            <input
                              type="checkbox"
                              disabled={disabled}
                              checked={c.waterIn}
                              onChange={(e) => patch(c.id!, { waterIn: e.target.checked })}
                            />
                            Water in
                          </label>
                          <label style={{ display: 'flex', gap: 4, alignItems: 'center', fontSize: 12 }}>
                            <input
                              type="checkbox"
                              disabled={disabled}
                              checked={c.inTankMix}
                              onChange={(e) => patch(c.id!, { inTankMix: e.target.checked })}
                            />
                            In tank mix
                          </label>
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              )
            })}
          </tbody>
        </table>
      )}
      {!disabled && (
        <div style={{ marginTop: 8 }}>
          {activeProducts.length === 0 ? (
            <p className="muted" style={{ fontSize: 12 }}>
              No products in the catalogue yet — add them on the <a href="/products">Products</a> page.
            </p>
          ) : (
            <select
              value=""
              onChange={(e) => {
                if (e.target.value) add(Number(e.target.value))
                e.target.value = ''
              }}
            >
              <option value="">+ Add product…</option>
              {activeProducts.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          )}
        </div>
      )}
    </div>
  )
}
