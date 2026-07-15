import { spawnSync, spawn } from 'child_process'
import type { REnvStatus } from '@shared/types.js'
import { getRscriptPath } from './run.js'

/**
 * Probe the environment for a usable R + agricolae installation. Runs
 * synchronously (called on startup and on demand from the setup screen).
 */
export function detectR(): REnvStatus {
  const rscript = getRscriptPath()

  const version = spawnSync(rscript, ['--version'], { encoding: 'utf8' })
  if (version.error || version.status !== 0) {
    return {
      rscriptFound: false,
      rscriptPath: null,
      version: null,
      agricolaeInstalled: false,
      message:
        'Rscript was not found. Install R (https://www.r-project.org/) and ensure "Rscript" is on your PATH, or set a custom path in Settings.'
    }
  }

  // R prints version to stderr on some platforms, stdout on others.
  const versionText = (version.stdout || version.stderr || '').split('\n')[0].trim()

  // Check that agricolae + jsonlite are available. requireNamespace resolves each package
  // directly; installed.packages() (the previous approach) scans the whole R library and is slow.
  const pkgCheck = spawnSync(
    rscript,
    [
      '--vanilla',
      '-e',
      'cat(all(vapply(c("agricolae","jsonlite"), requireNamespace, logical(1), quietly = TRUE)))'
    ],
    { encoding: 'utf8' }
  )
  const agricolaeInstalled = (pkgCheck.stdout || '').trim() === 'TRUE'

  return {
    rscriptFound: true,
    rscriptPath: rscript,
    version: versionText,
    agricolaeInstalled,
    message: agricolaeInstalled
      ? 'R and required packages are ready.'
      : 'R was found but the "agricolae" and/or "jsonlite" packages are missing. Click "Install required R packages" below, or in R run: install.packages(c("agricolae","jsonlite"))'
  }
}

/**
 * Install the required R packages (agricolae + jsonlite) into the user's
 * personal library via the detected Rscript. Runs asynchronously so a slow
 * download doesn't block the UI, then re-probes the environment. On failure the
 * returned status carries the captured stderr in `message` so the setup banner
 * can surface it. Requires base R to already be present (rscriptFound).
 */
export function installRPackages(timeoutMs = 600_000): Promise<REnvStatus> {
  return new Promise((resolve) => {
    const rscript = getRscriptPath()
    const child = spawn(
      rscript,
      [
        '--vanilla',
        '-e',
        'install.packages(c("agricolae","jsonlite"), repos="https://cloud.r-project.org")'
      ],
      { stdio: ['ignore', 'pipe', 'pipe'] }
    )

    let stderr = ''
    let settled = false

    const timer = setTimeout(() => {
      if (settled) return
      settled = true
      child.kill('SIGKILL')
      resolve({
        rscriptFound: true,
        rscriptPath: rscript,
        version: null,
        agricolaeInstalled: false,
        message: `Installing R packages timed out after ${Math.round(timeoutMs / 1000)}s. Check your network connection and try again.`
      })
    }, timeoutMs)

    child.stderr.on('data', (d) => (stderr += d.toString()))

    child.on('error', (err) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolve({
        rscriptFound: false,
        rscriptPath: rscript,
        version: null,
        agricolaeInstalled: false,
        message: `Failed to start Rscript ("${rscript}"). Is R installed? ${err.message}`
      })
    })

    child.on('close', () => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      // Re-probe: if agricolae is now importable, detectR() reports success;
      // otherwise surface the tail of stderr so the user can see what failed.
      const status = detectR()
      if (!status.agricolaeInstalled && stderr.trim()) {
        status.message = `Package install did not complete. R output:\n${stderr.trim().split('\n').slice(-8).join('\n')}`
      }
      resolve(status)
    })
  })
}
