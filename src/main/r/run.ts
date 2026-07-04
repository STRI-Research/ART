import { spawn } from 'child_process'
import { existsSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import type { RResponse } from '@shared/types.js'

const __dirname = dirname(fileURLToPath(import.meta.url))

/** Allow overriding the Rscript binary (e.g. a non-PATH install). */
let rscriptPath = process.env.ART_RSCRIPT || 'Rscript'

export function setRscriptPath(p: string): void {
  rscriptPath = p || 'Rscript'
}

export function getRscriptPath(): string {
  return rscriptPath
}

/**
 * Resolve a bundled .R script. In dev the scripts live in src/main/r; in a
 * packaged app they are copied to resources/r (see electron-builder.yml).
 */
export function resolveScript(name: string): string {
  const candidates = [
    join(__dirname, name), // out/main next to bundled js (electron-vite copies? fallback below)
    join(__dirname, '../../src/main/r', name), // dev: out/main -> src/main/r
    join(process.resourcesPath ?? '', 'r', name) // packaged
  ]
  for (const c of candidates) {
    if (c && existsSync(c)) return c
  }
  // Return the dev path so the error message is actionable.
  return join(__dirname, '../../src/main/r', name)
}

/**
 * Run an R script as a JSON-in/JSON-out sidecar. Rejects on spawn failure or a
 * non-parseable response; resolves with the parsed { ok, result | error }.
 */
export function runRScript<TReq, TRes>(
  scriptName: string,
  request: TReq,
  timeoutMs = 30000
): Promise<RResponse<TRes>> {
  return new Promise((resolve, reject) => {
    const scriptPath = resolveScript(scriptName)
    const child = spawn(rscriptPath, ['--vanilla', scriptPath], {
      stdio: ['pipe', 'pipe', 'pipe']
    })

    let stdout = ''
    let stderr = ''
    let settled = false

    const timer = setTimeout(() => {
      if (settled) return
      settled = true
      child.kill('SIGKILL')
      reject(new Error(`R script "${scriptName}" timed out after ${timeoutMs}ms`))
    }, timeoutMs)

    child.stdout.on('data', (d) => (stdout += d.toString()))
    child.stderr.on('data', (d) => (stderr += d.toString()))

    child.on('error', (err) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      reject(
        new Error(
          `Failed to start Rscript ("${rscriptPath}"). Is R installed and on PATH? ${err.message}`
        )
      )
    })

    child.on('close', (code) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      if (code !== 0 && stdout.trim() === '') {
        reject(new Error(`R exited with code ${code}: ${stderr.trim() || 'no output'}`))
        return
      }
      try {
        resolve(JSON.parse(stdout) as RResponse<TRes>)
      } catch {
        reject(new Error(`Could not parse R output: ${stdout || stderr || '(empty)'}`))
      }
    })

    child.stdin.write(JSON.stringify(request))
    child.stdin.end()
  })
}
