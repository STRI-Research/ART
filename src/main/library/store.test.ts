import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import * as library from './store.js'

let dir: string

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'art-lib-'))
  library.open(join(dir, 'library.sqlite'))
})
afterEach(() => {
  library.close()
  rmSync(dir, { recursive: true, force: true })
})

describe('personal library', () => {
  it('emerges terms from usage and counts per crop', () => {
    library.recordUsage([{ category: 'measurement_type', value: 'awn length' }], 'wheat')
    library.recordUsage([{ category: 'measurement_type', value: 'awn length' }], 'wheat')
    const [awn] = library.list('measurement_type')
    expect(awn.value).toBe('awn length')
    expect(awn.useCount).toBe(2)
    expect(awn.crops).toEqual(['wheat'])
  })

  it('ranks crop-scoped terms above general ones for that crop, and flips by crop', () => {
    // awn length: cereal-specific (used twice on wheat). yield: general (used across crops).
    library.recordUsage([{ category: 'measurement_type', value: 'awn length' }], 'wheat')
    library.recordUsage([{ category: 'measurement_type', value: 'awn length' }], 'wheat')
    library.recordUsage([{ category: 'measurement_type', value: 'yield' }], 'wheat')
    library.recordUsage([{ category: 'measurement_type', value: 'yield' }], 'cotton')
    library.recordUsage([{ category: 'measurement_type', value: 'yield' }], 'maize')

    const onWheat = library.suggest('measurement_type', '', 'wheat').map((h) => h.value)
    expect(onWheat[0]).toBe('awn length') // cereal term floats up on cereals

    const onCotton = library.suggest('measurement_type', '', 'cotton').map((h) => h.value)
    expect(onCotton[0]).toBe('yield') // and sinks on cotton, where the general term wins
    expect(onCotton).toContain('awn length') // still present / typeable, never hidden
  })

  it('does not crop-scope general categories (crop, unit)', () => {
    library.recordUsage([{ category: 'unit', value: '%' }], 'wheat')
    library.recordUsage([{ category: 'unit', value: '%' }], 'cotton')
    const [pct] = library.list('unit')
    expect(pct.useCount).toBe(2)
    expect(pct.crops).toEqual([]) // units apply to all crops — no per-crop tracking
  })

  it('renames a term, merging when the new value already exists', () => {
    library.recordUsage([{ category: 'measurement_type', value: 'awnlen' }], 'wheat')
    library.recordUsage([{ category: 'measurement_type', value: 'awn length' }], 'barley')
    const before = library.list('measurement_type')
    const awnlen = before.find((t) => t.value === 'awnlen')!

    // Plain rename to a new value.
    library.rename(awnlen.id, 'awn len')
    expect(library.list('measurement_type').some((t) => t.value === 'awn len')).toBe(true)

    // Rename onto an existing value merges the two into one row.
    const id = library.list('measurement_type').find((t) => t.value === 'awn len')!.id
    library.rename(id, 'awn length')
    const merged = library.list('measurement_type')
    expect(merged).toHaveLength(1)
    expect(merged[0].value).toBe('awn length')
    expect(merged[0].useCount).toBe(2)
    expect(merged[0].crops.sort()).toEqual(['barley', 'wheat'])
  })

  it('filters suggestions by the query', () => {
    library.recordUsage(
      [
        { category: 'unit', value: '%' },
        { category: 'unit', value: 'KG/HA' }
      ],
      'wheat'
    )
    expect(library.suggest('unit', 'kg', 'wheat').map((h) => h.value)).toEqual(['KG/HA'])
  })

  it('exports and re-imports (merge: fills labels, unions crops, no duplicates)', () => {
    library.recordUsage([{ category: 'measurement_type', value: 'awn length' }], 'wheat')
    library.updateLabel(library.list('measurement_type')[0].id, 'Length of the awn')
    library.recordUsage([{ category: 'measurement_type', value: 'awn length' }], 'barley')
    const payload = library.exportLibrary()
    expect(payload.terms).toContainEqual({
      category: 'measurement_type',
      value: 'awn length',
      label: 'Length of the awn',
      crops: expect.arrayContaining(['wheat', 'barley'])
    })

    // Import into a fresh library reproduces the term + crops.
    const dir2 = mkdtempSync(join(tmpdir(), 'art-lib2-'))
    library.open(join(dir2, 'library.sqlite'))
    const res = library.importLibrary(payload)
    expect(res.added).toBe(1)
    const [awn] = library.list('measurement_type')
    expect(awn.label).toBe('Length of the awn')
    expect(awn.crops.sort()).toEqual(['barley', 'wheat'])
    // Re-importing the same payload merges without duplicating.
    const res2 = library.importLibrary(payload)
    expect(res2.updated).toBe(1)
    expect(library.list('measurement_type')).toHaveLength(1)
    rmSync(dir2, { recursive: true, force: true })
  })
})
