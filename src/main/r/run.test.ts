import { describe, it, expect } from 'vitest'
import { resolveScript, runRScript, setRscriptPath } from './run.js'

describe('resolveScript', () => {
  it('resolves the bundled randomize.R to an existing path in dev', () => {
    const p = resolveScript('randomize.R')
    expect(p.endsWith('randomize.R')).toBe(true)
  })
})

describe('runRScript', () => {
  it('rejects with an actionable message when Rscript is missing', async () => {
    setRscriptPath('definitely-not-a-real-rscript-binary')
    await expect(runRScript('randomize.R', { design: 'RCB' })).rejects.toThrow(/Rscript|install/i)
    setRscriptPath('Rscript') // restore default
  })
})
