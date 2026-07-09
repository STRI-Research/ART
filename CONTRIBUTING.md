# Contributing to ART

## Setup

```bash
npm install       # installs deps; postinstall builds better-sqlite3 for Electron
npm run dev       # launch the app with hot reload
```

R (with the `agricolae` and `jsonlite` packages) is a runtime prerequisite for randomization and
analysis, but not for building or for most of the test suite — see the README.

## Checks

```bash
npm run typecheck   # tsc for main + renderer
npm run lint        # ESLint (fails on warnings)
npm run format      # Prettier (write) — or `format:check`
npm test            # vitest
```

## The better-sqlite3 ABI dance (important)

`better-sqlite3` is a native module, so its build target (ABI) differs between **Electron** (what
the app runs on) and **Node** (what `vitest` runs on). Only one build can exist at a time.

- `npm run dev` / packaging need the **Electron** build (set by `postinstall` =
  `electron-builder install-app-deps`).
- `npm test` needs the **Node** build.

So the test cycle is:

```bash
npm run rebuild:node       # build better-sqlite3 for Node
npm test
npm run rebuild:electron   # restore the Electron build before `npm run dev`
```

**Gotcha:** `electron-builder install-app-deps` sometimes no-ops and fails to switch back to the
Electron ABI. If the app then can't load `better-sqlite3`, force it against the installed Electron
version:

```bash
npx electron-rebuild -f -v "$(node -e "console.log(require('electron/package.json').version)")" -o better-sqlite3
```

Verify which ABI is active by loading the module under each runtime (the inline `node -e` probe is
unreliable):

```bash
# Electron must load it; plain Node must NOT (they use different NODE_MODULE_VERSION):
ELECTRON_RUN_AS_NODE=1 ./node_modules/.bin/electron -e "require('better-sqlite3'); console.log('electron OK')"
node -e "require('better-sqlite3')"   # expected to FAIL when the Electron build is active
```

CI (`.github/workflows/ci.yml`) does `npm ci` → `npm run rebuild:node` → lint/typecheck/test, so it
runs against the Node ABI. Tests that need R (`randomize`, `aov`, `alpha-conformance`) skip
automatically when `Rscript`/`agricolae` aren't present.

## Adding schema fields or form controls (the anti-bloat gate)

ART deliberately avoids becoming a wall of data-capture boxes — see
[docs/DESIGN-PRINCIPLES.md](docs/DESIGN-PRINCIPLES.md). Any PR that adds a database column or
a form field must state, in its description, **which ART feature consumes the value**
(randomizer, analysis, trial map, data entry, or report).

If no feature consumes it, don't add the field — triage the need down this ladder instead:

1. an existing freeform **note** field,
2. a **library term** (the coded-field vocabulary),
3. a **generic property** mechanism (if one exists by then),
4. an **import/attachment** for data that already exists elsewhere.

## Commits & PRs

Work on a branch, keep changes focused, and make sure `lint`, `typecheck`, and `test` pass.
