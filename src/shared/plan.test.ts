import { describe, it, expect } from 'vitest'
import {
  eventLabel,
  nextLabels,
  generateComponentOccurrences,
  combineIntoEvents,
  generatePlan,
  planRegeneration,
  detectFundedConflict,
  rebaseDelta,
  shiftDate,
  eventCountdown,
  type PlanComponent
} from './plan'

const comp = (id: number, treatmentId: number, rule: unknown, extra: Partial<PlanComponent> = {}): PlanComponent => ({
  id,
  treatmentId,
  scheduleRule: rule,
  activeFrom: '',
  activeUntil: '',
  maxOccurrences: null,
  fromOccurrence: null,
  ...extra
})

describe('eventLabel / nextLabels', () => {
  it('produces A..Z then AA, AB…', () => {
    expect(eventLabel(0)).toBe('A')
    expect(eventLabel(25)).toBe('Z')
    expect(eventLabel(26)).toBe('AA')
    expect(eventLabel(27)).toBe('AB')
    expect(eventLabel(51)).toBe('AZ')
    expect(eventLabel(52)).toBe('BA')
  })

  it('skips labels already used by kept events', () => {
    expect(nextLabels(new Set(['A', 'C']), 3)).toEqual(['B', 'D', 'E'])
  })
})

describe('generateComponentOccurrences', () => {
  const start = '2026-04-01'
  const end = '2026-05-01'

  it('once: single occurrence at trial start (or fixed date)', () => {
    expect(generateComponentOccurrences(comp(1, 2, { type: 'once' }), start, end)).toEqual([
      { componentId: 1, treatmentId: 2, date: start, decisionRequired: false }
    ])
    expect(
      generateComponentOccurrences(comp(1, 2, { type: 'once', plannedDate: '2026-04-10' }), start, end)[0].date
    ).toBe('2026-04-10')
  })

  it('calendar interval: every N days within the window', () => {
    const occ = generateComponentOccurrences(
      comp(1, 2, { type: 'calendar_interval', intervalDays: 14 }),
      start,
      end
    )
    expect(occ.map((o) => o.date)).toEqual(['2026-04-01', '2026-04-15', '2026-04-29'])
  })

  it('weekly interval maps to 7-day steps', () => {
    const occ = generateComponentOccurrences(
      comp(1, 2, { type: 'weekly_interval', intervalWeeks: 2 }),
      start,
      end
    )
    expect(occ.map((o) => o.date)).toEqual(['2026-04-01', '2026-04-15', '2026-04-29'])
  })

  it('monthly: clamps to month length', () => {
    const occ = generateComponentOccurrences(
      comp(1, 2, { type: 'monthly', intervalMonths: 1 }),
      '2026-01-31',
      '2026-04-30'
    )
    expect(occ.map((o) => o.date)).toEqual(['2026-01-31', '2026-02-28', '2026-03-31', '2026-04-30'])
  })

  it('manual dates pass through, filtered to the active window', () => {
    const occ = generateComponentOccurrences(
      comp(1, 2, { type: 'manual', dates: ['2026-04-10', '2026-06-01'] }),
      start,
      end
    )
    expect(occ.map((o) => o.date)).toEqual(['2026-04-10'])
  })

  it('gdd rule produces a single decision-required placeholder', () => {
    const occ = generateComponentOccurrences(comp(1, 2, { type: 'gdd', targetGdd: 200 }), start, end)
    expect(occ).toHaveLength(1)
    expect(occ[0].decisionRequired).toBe(true)
  })

  it('applies the activeFrom/activeUntil window (seasonal component)', () => {
    const occ = generateComponentOccurrences(
      comp(1, 2, { type: 'calendar_interval', intervalDays: 7 }, { activeFrom: '2026-04-10', activeUntil: '2026-04-20' }),
      start,
      end
    )
    expect(occ.map((o) => o.date)).toEqual(['2026-04-10', '2026-04-17'])
  })

  it('maxOccurrences: only the first N applications include the product', () => {
    const occ = generateComponentOccurrences(
      comp(1, 2, { type: 'calendar_interval', intervalDays: 7 }, { maxOccurrences: 2 }),
      start,
      end
    )
    expect(occ.map((o) => o.date)).toEqual(['2026-04-01', '2026-04-08'])
  })

  it('fromOccurrence: active from application N onward', () => {
    const occ = generateComponentOccurrences(
      comp(1, 2, { type: 'calendar_interval', intervalDays: 7 }, { fromOccurrence: 3 }),
      start,
      end
    )
    expect(occ[0].date).toBe('2026-04-15')
  })

  it('returns nothing when the window is inverted', () => {
    expect(
      generateComponentOccurrences(
        comp(1, 2, { type: 'once' }, { activeFrom: '2026-06-01', activeUntil: '2026-05-01' }),
        start,
        end
      )
    ).toEqual([])
  })
})

describe('combineIntoEvents / generatePlan', () => {
  it('combines same-date occurrences into one event; separate dates stay separate (brief §10)', () => {
    // T2 base mix every 14 days + T2 fungicide every 28 days: coincide at day 0 and 28.
    const events = generatePlan(
      [
        comp(1, 2, { type: 'calendar_interval', intervalDays: 14 }),
        comp(2, 2, { type: 'calendar_interval', intervalDays: 28 })
      ],
      '2026-04-01',
      '2026-04-30'
    )
    expect(events.map((e) => e.plannedDate)).toEqual(['2026-04-01', '2026-04-15', '2026-04-29'])
    expect(events[0].occurrences).toHaveLength(2) // both components
    expect(events[1].occurrences).toHaveLength(1) // base mix only
    expect(events[2].occurrences.map((o) => o.componentId).sort()).toEqual([1, 2])
  })

  it('an event is decision-required only when all its occurrences are', () => {
    const events = generatePlan(
      [comp(1, 2, { type: 'once' }), comp(2, 3, { type: 'gdd', targetGdd: 200 })],
      '2026-04-01',
      '2026-04-30'
    )
    // Both land on 2026-04-01 → one event, mixed → not decision-required as a whole.
    expect(events).toHaveLength(1)
    expect(events[0].decisionRequired).toBe(false)
  })
})

describe('planRegeneration', () => {
  const gen = (dates: string[]) =>
    dates.map((d) => ({
      plannedDate: d,
      decisionRequired: false,
      occurrences: []
    }))

  it('replaces pending events and keeps completed ones untouched', () => {
    const existing = [
      { id: 10, label: 'A', plannedDate: '2026-04-01', executionStatus: 'completed', planningStatus: 'planned' },
      { id: 11, label: 'B', plannedDate: '2026-04-15', executionStatus: 'pending', planningStatus: 'planned' }
    ]
    const r = planRegeneration(existing, gen(['2026-04-16', '2026-04-30']))
    expect(r.keptEventIds).toEqual([10])
    expect(r.deleteEventIds).toEqual([11])
    expect(r.createEvents.map((e) => e.label)).toEqual(['B', 'C']) // A is frozen on the completed event
  })

  it('keeps cancelled events as history', () => {
    const existing = [
      { id: 10, label: 'A', plannedDate: '2026-04-01', executionStatus: 'pending', planningStatus: 'cancelled' }
    ]
    const r = planRegeneration(existing, gen(['2026-04-10']))
    expect(r.keptEventIds).toEqual([10])
    expect(r.deleteEventIds).toEqual([])
    expect(r.createEvents[0].label).toBe('B')
  })

  it('never lists a completed event for deletion (immutability guarantee)', () => {
    const existing = [
      { id: 1, label: 'A', plannedDate: '2026-04-01', executionStatus: 'completed', planningStatus: 'planned' },
      { id: 2, label: 'B', plannedDate: '2026-04-08', executionStatus: 'amended', planningStatus: 'planned' },
      { id: 3, label: 'C', plannedDate: '2026-04-15', executionStatus: 'pending', planningStatus: 'planned' }
    ]
    const r = planRegeneration(existing, gen(['2026-05-01']))
    expect(r.deleteEventIds).toEqual([3])
    expect(r.keptEventIds.sort()).toEqual([1, 2])
  })
})

describe('detectFundedConflict', () => {
  it('returns null when no funded count is set or counts match', () => {
    expect(detectFundedConflict([{}, {}], null, '2026-04-01', '2026-09-30')).toBeNull()
    expect(detectFundedConflict([{}, {}], 2, '2026-04-01', '2026-09-30')).toBeNull()
  })

  it("flags the brief's example: 14-day rule needs 14 events, 10 funded", () => {
    const events = Array.from({ length: 14 }, () => ({}))
    const c = detectFundedConflict(events, 10, '2026-04-01', '2026-09-30')!
    expect(c.ruleEventCount).toBe(14)
    expect(c.fundedCount).toBe(10)
    expect(c.difference).toBe(4)
    // 182 days / 9 gaps → 20-day interval fits 10 events into the window.
    expect(c.suggestedIntervalDays).toBe(20)
  })
})

describe('rebase', () => {
  it('moving Saturday→Friday shifts subsequent occurrences by −1 day (brief §12 example)', () => {
    const delta = rebaseDelta('2026-04-18', '2026-04-17')!
    expect(delta).toBe(-1)
    expect(shiftDate('2026-05-02', delta)).toBe('2026-05-01')
  })

  it('returns null for invalid dates', () => {
    expect(rebaseDelta('', '2026-04-17')).toBeNull()
  })
})

describe('eventCountdown', () => {
  it('reports days until, due-soon and overdue', () => {
    expect(eventCountdown('2026-04-05', '2026-04-01')).toEqual({ daysUntil: 4, overdue: false, dueSoon: true })
    expect(eventCountdown('2026-05-01', '2026-04-01').dueSoon).toBe(false)
    expect(eventCountdown('2026-03-30', '2026-04-01')).toEqual({ daysUntil: -2, overdue: true, dueSoon: false })
  })
})
