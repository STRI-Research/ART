# ART

An open-source **Agricultural Research Tool** — a cross-platform desktop app for planning,
randomizing, collecting, and analyzing agricultural field trials, covering the full workflow:

**Protocol → randomized Trial → Trial Map → Assessment data → ANOVA → Report.**

Built with Electron + React + TypeScript, with a SQLite file per project and an embedded **R**
statistics engine (via the [`agricolae`](https://cran.r-project.org/package=agricolae) package).

## Features (MVP)

- **Protocol editor** — trial metadata, treatment list, application timings.
- **Randomized trial generation** — Randomized Complete Block (RCB), Completely Randomized
  (CRD), and resolvable Incomplete Block (Alpha) designs, generated in R with
  `agricolae::design.rcbd` / `design.crd` / `design.alpha`. Alpha designs split each replicate
  into incomplete blocks of a chosen size k (the treatment count must be divisible by k).
- **Trial map** — visual plot grid with "hot edit" (click two plots to swap treatments).
- **Assessment setup & data entry** — define assessment columns (rating type, timing, subsamples)
  on the Assessments tab, then record measurements on a dedicated Data Entry tab: a
  spreadsheet-style grid (rows = plots, columns = assessments) with paste-from-clipboard support.
- **Statistics** — one-/two-way ANOVA plus mean-comparison tests (Fisher's LSD, Tukey's HSD,
  Duncan's MRT, Student-Newman-Keuls) at α = 0.01 / 0.05 / 0.10, with mean-separation letters,
  CV, grand mean, and critical values. Alpha designs use a block-adjusted analysis
  (`agricolae::PBIB.test`, REML with a variance-components fallback) reporting adjusted treatment
  means and separation letters.
- **Report** — protocol summary, treatment-means table, and a bar chart with error bars
  (Vega-Lite); export means to CSV or print/save the report as PDF.

## Prerequisites

- **Node.js** ≥ 20
- **R** with the `agricolae` and `jsonlite` packages, for the statistics/randomization engine:

  ```r
  install.packages(c("agricolae", "jsonlite"))
  ```

  `Rscript` must be on your `PATH`, or set a custom path in the app's setup banner (or the
  `ART_RSCRIPT` environment variable). The app runs without R, but trial generation and
  analysis are disabled until R is available.

## Development

```bash
npm install          # installs deps; rebuilds better-sqlite3 for Electron
npm run dev          # launch the app with hot reload
npm run typecheck    # type-check main + renderer
npm run build        # production build into out/
```

### Testing

Unit tests cover the SQLite DAO and the R runner. Because `better-sqlite3` is a native module,
its build target (ABI) differs between Node and Electron. The `postinstall`/`npm run dev` path
builds it for **Electron**; the test runner needs the **Node** build:

```bash
npm run rebuild:node     # build better-sqlite3 for Node (before testing)
npm test                 # run vitest
npm run rebuild:electron # restore the Electron build (before npm run dev)
```

## Packaging

```bash
npm run package   # unpacked app in dist-app/
npm run dist      # installer (NSIS / dmg / AppImage) via electron-builder
```

The `.R` scripts are shipped as `extraResources`; R itself is a documented prerequisite and is not
bundled.

## Architecture

```
src/
  main/      Electron main process
    db/      better-sqlite3 connection, schema.sql, typed DAO
    r/       R sidecar: detect.ts, run.ts (JSON stdin/stdout), randomize.R, aov.R, service.ts
    ipc/     typed IPC handlers
  preload/   contextBridge API exposed as window.art (contextIsolation on)
  renderer/  React UI (features: protocol, trialmap, assessments, stats, report)
  shared/    domain types + zod schemas + IPC channel names (single source of truth)
```

- The **renderer** has no Node access; every privileged action goes through a typed `window.art.*`
  IPC call to the main process.
- A **project** is a single `.artdb` SQLite file holding the protocol, trial, plots, assessment
  data, and cached analysis results.
- The **R sidecar** is a plain JSON-in / JSON-out child process: the main process writes a request
  on stdin and reads `{ ok, result | error }` on stdout, so the R scripts stay pure and testable.

## Data model

One SQLite file = one project: `protocol` (singleton) · `treatment` · `application` · `trial` ·
`plot` · `assessment_header` · `assessment_value` (long form) · `analysis_result` (cached R output).
See `src/main/db/schema.sql`.

## Roadmap

Planned additions, building on the extensible schema and R sidecar:

- **More designs** — factorial and split-plot layouts, extending the existing design engine.
- **Summary-across-trials** — combined multi-trial analysis and reporting.
- **Field data collector** — a tablet-friendly mode for in-field assessment entry.
- **EPPO code libraries** — standardized crop, pest, and disease code lookups.
- **Import/export** — read and write third-party trial file formats.
- **Cloud sync** — share and back up projects across devices.

## License

MIT
