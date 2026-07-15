import { useState } from 'react'
import { useStore } from '../store'

/**
 * Shows R/agricolae setup guidance when the stats engine isn't ready. When base
 * R is present but the packages are missing, offers a one-click install; when R
 * itself is missing, lets the user point at a custom Rscript path and re-check.
 */
export function REnvBanner(): JSX.Element | null {
  const { rEnv, setREnv } = useStore()
  const [path, setPath] = useState('')
  const [installing, setInstalling] = useState(false)

  if (!rEnv || (rEnv.rscriptFound && rEnv.agricolaeInstalled)) return null

  const canInstall = rEnv.rscriptFound && !rEnv.agricolaeInstalled

  return (
    <div className="banner no-print">
      <strong>Statistics engine not ready.</strong> {rEnv.message}
      {canInstall && (
        <div className="row" style={{ marginTop: 8 }}>
          <button
            disabled={installing}
            onClick={async () => {
              setInstalling(true)
              try {
                setREnv(await window.art.env.installRPackages())
              } finally {
                setInstalling(false)
              }
            }}
          >
            {installing ? 'Installing…' : 'Install required R packages'}
          </button>
          {installing && (
            <span style={{ alignSelf: 'center', color: 'var(--muted, #666)' }}>
              Downloading agricolae + jsonlite from CRAN — this can take a few minutes.
            </span>
          )}
        </div>
      )}
      <div className="row" style={{ marginTop: 8 }}>
        <div style={{ flex: 1, minWidth: 240 }}>
          <label>Custom Rscript path (optional)</label>
          <input
            placeholder="/usr/local/bin/Rscript"
            value={path}
            onChange={(e) => setPath(e.target.value)}
          />
        </div>
        <button
          disabled={installing}
          onClick={async () => setREnv(await window.art.env.setRscriptPath(path))}
        >
          Re-check
        </button>
      </div>
    </div>
  )
}
