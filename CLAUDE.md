# CLAUDE.md — orientation for Claude Code

> Read this first. The `README.md` and `ROADMAP.md` are **stale** — they describe the retired
> Electron + R + SQLite desktop app. This repo is now a web app. Trust this file and
> `DEVELOPMENT-PLAN.md` over those two.

## What ART is (current reality)

**ART** (Agricultural Research Tool) plans, randomizes, collects, and analyzes agricultural field
trials: **Protocol → randomized Trial → Trial Map → Measurement data → ANOVA → Report**.

**Stack**
- **Next.js 15** (App Router) + **React 19**, Zustand, `react-datasheet-grid`.
- **Neon Postgres** via **Drizzle ORM** — driver is `neon-http` (`src/lib/db/index.ts`), which has
  **no multi-statement transactions**. Keep this in mind for any multi-step write.
- Statistics in **jStat** (`src/lib/stats/`), a JS port of the old R/`agricolae` engine.
- Deployed on Vercel. Auth is currently only Vercel platform gating — **there is no app-level
  authorization yet** (see below).

## Where things live

| Area | Path |
|---|---|
| DB schema (Drizzle, Postgres) | `src/lib/db/schema.ts` |
| API routes (App Router) | `src/app/api/**/route.ts` |
| Shared domain types + zod | `src/shared/types.ts` |
| Stats engine (ANOVA/PBIB) | `src/lib/stats/anova.ts`, `buildData.ts` |
| Formula language (no `eval`) | `src/shared/formula.ts`, `derive.ts` |
| Design validation / randomization rules | `src/shared/design.ts`, `timing.ts` |
| React views | `src/components/*.tsx` |
| Client API wrapper | `src/lib/api.ts` |

## The plan and the build register

- **`DEVELOPMENT-PLAN.md`** is the source of truth for direction, review findings, and the backlog.
- **`DEVELOPMENT-PLAN.md` → Appendix A** is the **build register**: every planned build has a
  **stable ID** (`B1`…`B29`, with sub-parts like `B21c`).

**To find a build:** grep its ID across the repo, e.g. `B16`. The register entry lists its status,
phase, theme, dependencies, and the files it will most likely touch.

**Status tokens** (greppable): `status: not-started` · `in-progress` · `done` · `blocked` · `parked`.
When you start a build, flip its status in the register and add a `touches:` list of the files you
changed. Reference the build ID in commit messages (e.g. `B12: draw block-boundary lines`).

## Strategic direction (decided)

Becoming a **Microsoft Entra ID**-authenticated **team** tool with **role-based access control**
(Admin / Study Director / Research Manager / Trials Officer / Customer read-only). Assume the Azure
stack: **Azure Blob** storage, **Azure AD app-roles/groups**. Several external databases (customers,
weather, people, field mapping) get **API'd in later** — build against interfaces + mocks now.

## Known issues to respect (full detail in DEVELOPMENT-PLAN.md §2)

- **No authorization / tenant isolation** — sequential integer ids, no owner/org column, no
  middleware. Any logged-in user can read/mutate/delete any trial. This is the #1 foundation.
- **No transactions on `neon-http`** — `delete → insert` sequences (generate, treatments, properties)
  are non-atomic; a failed layout regenerate can wipe data (plot delete cascades to values).
- **Cross-trial write hole** — measurement-value writes don't validate the plot belongs to the trial.
- **Data-entry write-loss + stale-analysis races** in `DataEntryView` / Stats / Report.
- **CI is broken** and **tests can't run** (no runner configured) — fixing these is build **B**-phase-0
  work (see plan §5, T0). Don't assume `npm test` / `npm run typecheck` exist yet.
- **ALPHA generator** produces a random incomplete-block layout, not a true resolvable alpha, while
  validation still claims agricolae conformance.

## Design principle (the gate for new fields)

Per `docs/DESIGN-PRINCIPLES.md`: **a field earns a dedicated column only if a feature consumes it**
(randomizer, analysis, map, data entry, a report, or a print). Ad-hoc metadata goes to notes, the
library, or the generic `property` mechanism — not new columns.

## Conventions

- TypeScript throughout; zod schemas in `src/shared/types.ts` are the validation source of truth.
- Path aliases: `@/*` → `src/*`, `@shared/*` → `src/shared/*`.
- Prettier + ESLint (`npm run lint`). Add a `typecheck` script + test runner as part of T0.
