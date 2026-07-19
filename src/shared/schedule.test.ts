import { describe, it, expect } from 'vitest'
import {
  daysBetween,
  eventOffsets,
  dateForOffset,
  finishDate,
  solveInterval,
  solveCount,
} from './schedule'

describe('schedule', () => {
  it('daysBetween counts whole days, UTC-safe', () => {
    expect(daysBetween('2025-07-03', '2025-07-16')).toBe(13)
    expect(daysBetween('2025-07-03', '')).toBeNull()
  })

  it('eventOffsets spaces events by the interval', () => {
    expect(eventOffsets(4, 14)).toEqual([0, 14, 28, 42])
    expect(eventOffsets(1, 14)).toEqual([0])
    expect(eventOffsets(0, 14)).toEqual([])
  })

  it('dateForOffset adds days to the start', () => {
    expect(dateForOffset('2025-07-03', 14)).toBe('2025-07-17')
    expect(dateForOffset('', 14)).toBe('')
  })

  it('finishDate = start + (count-1)*interval', () => {
    expect(finishDate('2025-07-03', 4, 14)).toBe('2025-08-14')
    expect(finishDate('2025-07-03', 1, 14)).toBe('2025-07-03')
  })

  it('the linked fields round-trip: count/interval → finish → back', () => {
    const start = '2025-07-03'
    const fin = finishDate(start, 4, 14) // 2025-08-14
    expect(solveInterval(start, fin, 4)).toBe(14)
    expect(solveCount(start, fin, 14)).toBe(4)
  })

  it('solveInterval/solveCount guard degenerate input', () => {
    expect(solveInterval('2025-07-03', '2025-08-14', 1)).toBeNull()
    expect(solveCount('2025-07-03', '2025-08-14', 0)).toBeNull()
  })
})
