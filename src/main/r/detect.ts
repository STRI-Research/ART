import { spawnSync } from 'child_process'
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

  // Check that agricolae + jsonlite load.
  const pkgCheck = spawnSync(
    rscript,
    [
      '--vanilla',
      '-e',
      'cat(all(c("agricolae","jsonlite") %in% rownames(installed.packages())))'
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
      : 'R was found but the "agricolae" and/or "jsonlite" packages are missing. In R run: install.packages(c("agricolae","jsonlite"))'
  }
}
