# ART Development Plan

> Working planning document. Captures the code-review findings, the strategic decision to
> become an Entra-authenticated team web tool, and the full feature backlog from planning,
> organised into shared foundations → themes → a proposed sequence.
>
> This supersedes the "where we are / gap / v1.0" framing in `ROADMAP.md`, which still
> describes the retired Electron + R + SQLite desktop app.

---

## 1. Where ART actually is today

ART was recently ported from an **Electron + R/`agricolae` + local SQLite** desktop app to a
**Next.js 15 (App Router) + Neon Postgres + Drizzle + jStat** web app. The runtime code made the
jump well; the surrounding scaffolding did not.

**Current stack**
- Next.js 15 / React 19, Zustand, `react-datasheet-grid`.
- Neon serverless Postgres via Drizzle ORM (`neon-http` driver — **no multi-statement transactions**).
- Statistics in **jStat** (JS port of the former R/`agricolae` engine): RCB / CRD / resolvable-alpha
  ANOVA, LSD / Tukey / Duncan* / SNK mean separation, PBIB intra-block analysis for alpha.
- Deployed on Vercel; access currently gated only by Vercel platform authentication.

**Strategic direction (decided in planning)**
- Online **team tool** with **Microsoft Entra ID** SSO.
- **Role-based access control** — team members with different admin rights (Research Manager,
  Study Director, Trials Officer, Admin) plus a **customer** read-only tier.
- Assume the Microsoft stack: **Azure Blob** for file storage, **Azure AD app-roles/groups** for RBAC.
- Several **external databases API'd in later** (customers, weather, people, field mapping) — build
  against interfaces + mocks now, wire real APIs when they exist.

---

## 2. Review findings that gate the roadmap

Full detail lives in the review conversation; the load-bearing items:

### Must-fix before multi-user (Critical)
- **No authorization / tenant isolation.** No owner/org column anywhere, no middleware, sequential
  integer ids → any logged-in user can read/mutate/delete any protocol or trial. Entra login proves
  *who*; nothing decides *what they may touch*. This is the foundation the whole direction rests on.
- **Cross-trial data corruption:** the measurement-value write validates the header belongs to the
  trial but never the plot (`measurements/values/route.ts`); `measurement_value` has no `trialId`.
- **Silent data-entry loss:** `DataEntryView` clears its pending-write queue *before* awaiting the
  save and has no `catch`; a failed save vanishes while the UI shows "saved".
- **Analysis on stale data:** navigating to Stats/Report races the 700 ms debounced flush and those
  views refetch instead of reading the in-memory snapshot; the nav bar uses raw `<a>` (hard nav) and
  drops pending edits.

### High
- **No transactions** (neon-http): generate / treatments / properties / actuals / swap do
  `delete → insert` non-atomically; a mid-sequence failure corrupts state, and a failed layout
  regenerate can wipe entered data (plot delete cascades to values).
- **Stats endpoint trusts & persists client-supplied observations** without re-deriving from stored
  values — fabricated input yields a cached "significant" result.
- **Concurrent-edit races:** no optimistic-concurrency token; no unique `(trialId, mapRow, mapCol)`
  constraint, so overlapping swaps/moves can duplicate positions.
- **ALPHA design regression:** the generator now does a plain shuffle split into blocks (a *random*
  incomplete-block layout), while validation still gates on `agricolae`'s exact alpha rules and the
  analysis runs PBIB as if it were a true resolvable alpha.

### Medium / hygiene
- Formula `[n]` hint is index-based but evaluation is ordinal-based (silent wrong-column risk).
- Missing `WHERE` scans the whole `treatment_application` table on every protocol load.
- N+1 everywhere it matters (reshape per-plot updates, library import, Combobox label lookups,
  un-memoised derive re-running every keystroke).
- Validation asymmetry: zod guards protocol routes; trial-side bodies trusted raw (`NaN` into `real`).
- Unguarded `req.json()` / `JSON.parse` → 500s leaking raw driver errors.

### Port left stale (not bugs, but blockers to trust)
- **CI broken:** `ci.yml` runs `rebuild:node` / `typecheck` / `test` — none exist in `package.json`;
  `release.yml` still packages Electron.
- **Tests can't run:** 4 real test files, no runner (`vitest`/`jest`), no config, no script.
- **Dead code:** `shared/ipc.ts` (Electron IPC registry, zero importers); vestigial R/Electron types
  (`RandomizeRequest`, `REnvStatus`, `RResponse`, `ProjectSnapshot.filePath`, `printToPDF` comments).
- **Docs describe the old app:** README + ROADMAP still say Electron / embedded R / SQLite / installers.

### Worth building on (strengths)
The statistics engine (correct SS, compact-letter-display, SNK via studentized range, honest
Duncan→LSD* labelling, real PBIB), the no-`eval` formula language, the "consumer test" design
principles, and the protocol→trial distribution model are all solid.

---

## 3. External integrations registry

The list you asked for. Pattern for **all** of these: define a TypeScript interface + a mock
implementation now; wire the real API later without touching the feature UI.

| Source | Provides | Consumers | Status |
|---|---|---|---|
| **Microsoft Entra ID** | People, roles, identity | Login, responsible-person pickers, audit actor, trial-library ordering, customer access tier | Foundation (now) |
| **Azure Blob storage** | Versioned files | Protocol report versions, historic docs, signed weigh sheets, plot/drone images, Word reports | Foundation (early) |
| **Customer DB** | Company + contact | Protocol builder, reports, visit sheet, weigh sheet, customer↔access mapping | Stub now, API later |
| **Weather DB** | Conditions by date/location | Weigh/application sheet, application condition records | Stub now, API later |
| **Field mapping / planner** | Plot geometry, field position | Plot-map orientation, printed maps, drone-image clipping | Longer term |

---

## 4. Shared foundations

Most of the backlog are *consumers* of five reusable capabilities. Build these once.

- **A · Identity & RBAC (Entra).** SSO, a user/org model, ownership columns on `protocol`/`trial`,
  RBAC middleware, Entra group/app-role → ART role mapping. Unblocks people, admin rights, customer
  tier, audit identity, library ordering.
- **B · External-source adapter layer.** Interfaces + mocks for Customer / Weather / People / Map.
  Cheap; lets feature UI be built now against future data.
- **C · Versioned document store (blob + audit-linked).** One mechanism behind protocol report
  versions, Word reports, signed weigh sheets, historic protocol docs, and plot/drone images —
  the property-mechanism philosophy applied to files.
- **D · Template / export engine.** Fixed-format **Excel** (filing system), **Word** report template,
  and print layouts (weigh sheet, visit sheet, data sheet, field map). All "render trial data into a
  controlled template".
- **E · Hybrid timing & schedule model.** Richer assessment timing + a trial-side schedule view.
  Feeds visit sheets, data sheets, weigh sheets, and time-series charts.

---

## 5. Themes & feature backlog

Each item: **what it is · consumer · depends on · rough size** (S ≈ days, M ≈ 1–2 wks, L ≈ multi-week).

### T0 · Stabilise the port  *(do first, cheap, unblocks verification)*
- Add a test runner (`vitest`) + wire the 4 existing test files; add `typecheck` script. **S**
- Fix `ci.yml` (lint / typecheck / test); replace/remove the Electron `release.yml`. **S**
- Delete dead code (`ipc.ts`, R/Electron vestigial types). **S**
- Rewrite README + retire/rewrite ROADMAP for the web reality. **S**

### T1 · Data integrity & security remediation  *(prerequisite for multi-user)*
- Close the cross-trial `plotId` hole; add `trialId` to `measurement_value` or validate it. **S**
- Add unique `(trialId, mapRow, mapCol)`; optimistic-concurrency token on writes. **M**
- Make multi-step writes atomic — move off `neon-http` to a transaction-capable driver (Neon
  WebSocket/pooled) or restructure as single-statement SQL. **M**
- Re-derive ANOVA input server-side instead of trusting the client. **S**
- Fix data-entry write-loss (`catch` + re-queue) and the stale-analysis race (await flush / read
  in-memory snapshot); convert nav to `next/link` + `beforeunload` guard. **M**
- Validate trial-side request bodies (zod); guard `req.json()`/`JSON.parse`. **S**

### T2 · Identity, people & access (Foundation A)
- Entra ID SSO; user/org model; ownership on protocol/trial. **L**
- RBAC: Admin / Study Director / Research Manager / Trials Officer / Customer, mapped from Entra
  app-roles/groups; middleware enforcement. **M**
- **Responsible persons on a trial** (Research Manager, Study Director, Trials Officer) sourced from
  Entra. *Consumer:* reports, weigh sheets, visit sheets, audit. **M**
- **Audit log shows the Entra identity** of who made each change (replaces header-trusted actor). **S**
- **Trial-library ordering** prioritised by the logged-in user (your trials at top). **S**
- **Customer read-only tier** — a hard, separate read path that can only see approved/published
  artifacts, never a toggled-off edit view. **M**

### T3 · Protocol builder enhancements
- **Customer field** (company + contact) via the Customer adapter (B). *Consumer:* reports, sheets. **M**
- **Versioned protocol report output** — builder emits a templated report stored in blob under
  v1.0 / v1.1 / v1.2 …; every change shows on the audit log. *Consumer:* filing, approval, trial book.
  Uses C + D. **M**
- **Immutable distributed protocols** — once distributed to a trial, a version is frozen; edits fork
  a new version; the trial records which version it ran. Makes versioning protect trial integrity,
  not just archive files. **M**

### T4 · Treatment & timing model (Foundation E)
- **Simplify treatment / timing labels.** *(Pending: which label — application timing codes A/B/C,
  treatment numbers, or the combined "Trt 3 @ B" label.)* **S–M**
- **Hybrid assessment timing** — time an assessment by calendar date, days-after-planting,
  days-after-application, or growth-stage trigger (and possibly a repeating interval series), instead
  of only "N DA-application". *(Pending: exact scheme.)* **M**
- **Assessment-dates / schedule section** (trial-side, mirroring Applications) that projects each
  assessment's date from planting + actual application dates and records when it actually happened.
  *Consumer:* visit sheet, data sheets, time-series charts. **M**

### T5 · Trial map polish
- **Blank / filler plots** in the layout. **S–M** (touches generation, analysis exclusion, printing)
- **Thick block-boundary lines** (extend the existing alpha-block rendering to all designs). **S**
- **N/S/E/W compass** for field orientation. **S**
- **Mapping-tool / planner integration** — connect the plot map to your existing field planner.
  Longer term; also the prerequisite for drone-image clipping. **L**

### T6 · Field-operations documents (Templates D + Docs C)
- **Weigh / application sheet** per treatment: plot map, area per plot, product amount to weigh &
  mix, mixing/sprayer instructions, **weather** (Weather adapter), **signature box**; scan the signed
  sheet back into blob storage. *Note:* the "amount to weigh" = `rate × plot area` with unit
  conversion — this is the roadmap's **product & rate calculations**; build together. **L**
- **Customer visit sheet** — plot map + data-to-today + an empty grid beyond for selected assessment
  metrics (what's upcoming). **M**
- **Data-collection sheets** — plots × assessment columns, blank or pre-filled, metadata header. **M**

### T7 · Exports
- **Fixed-format Excel** matching your current filing setup, at defined points in the workflow. **M**
- **Word report template** with stored versions (see T8). **M**

### T8 · Report writer v2
- **Versions** (stored in blob, audit-linked). **M**
- **New sections:** Discussion, Results, Future Work (+ review current report inputs). **S–M**
- **Word template** output. **M**

### T9 · Historic data ingestion
- Parse legacy **assessment sheets / master data tables** → commit old trials to the database.
  Staging → column-map → preview → commit; unmapped fields → notes/properties (per the import
  "danger zone" rule). *(Pending: archival vs full-structural vs tiered.)* **L**
- Store original historic protocol documents in blob (C). **S**

### T10 · Imagery  *(longer term)*
- **Per-plot image collection** — attach images to allocated plots (or all). **L**
- **Drone ortho cut-up** — one whole-field image georeferenced and clipped per plot. Gated on the
  mapping/planner integration (T5) for plot polygons. **L**
- Feeds the customer presentation surface.

### T11 · Visualization  *(parked — plan only)*
- **"Fiddle then pin"** explorer: tweak a chart, pin the chosen figure into the report. **L**
- **Hide treatments / show the customer** — shares the treatment-subset mechanism with the report
  and the customer-view visibility model (a treatment can be hidden from a customer *everywhere*).
- **Reuse existing code** from your current charting program rather than building fresh.
- Chart types: bar + error bars + letters (have basic) → box-and-whisker → time-series across
  assessments (needs E) → correlation → dose-response.

---

## 6. Open decisions (still to confirm)

1. **Treatment/timing label** — which of the three is "unwieldy"? (T4)
2. **"Hybrid" timing** — the exact scheme you want. (T4)
3. **Build order** — foundation-first / vertical-slice-first / foundation-but-auth-last. (§7)
4. **Historic import fidelity** — archival / full-structural / tiered. (T9)
5. **Customer access mechanism** — Entra guest role / share links / separate portal. (T2)
6. **Cloud confirmation** — Azure Blob + Azure AD app-roles assumed; confirm.

---

## 7. Proposed sequence

Recommended default (pending the §6 decisions), leaning **foundation-but-auth-last** for internal
work while landing Entra/RBAC **before any customer exposure**, and **tiered** historic import:

- **Phase 0 — Stabilise** (T0). Days. Makes everything after it verifiable.
- **Phase 1 — Integrity & security** (T1). The must-fix review items; prerequisite for multi-user.
- **Phase 2 — Foundations** (B adapter layer, C blob doc-store, D template engine). Delivers visible
  wins early (versioned reports, first printed docs) without waiting on auth.
- **Phase 3 — Identity & access** (T2, Foundation A). Entra SSO + RBAC + people + customer boundary.
  Must precede any customer-facing surface.
- **Phase 4 — Core features on the foundations:** protocol builder (T3), timing + schedule (T4),
  field-ops documents (T6), exports (T7), report v2 (T8), map polish (T5 items 1–3).
- **Phase 5 — Historic ingestion** (T9).
- **Phase 6 — Long-term:** mapping-tool integration (T5), imagery (T10), un-park visualization (T11).

*Alternative if you want a fast visible win:* pull the **weigh sheet** (T6) forward as a vertical
slice right after Phase 1, growing just enough of B/C/D/E to support it, then generalise.

---

## 8. Guardrails

- **The consumer test still governs.** Every new field must name the feature that reads it; ad-hoc
  metadata → notes / library / the property mechanism, not new columns. Good news: customer,
  responsible persons, and weather all pass (they render on reports/sheets and drive access).
- **One mechanism absorbs variety** — the document store (C) and the property mechanism are the
  patterns to reach for before adding schema.
- **Immutability protects the record** — frozen distributed protocol versions + append-only audit +
  scanned signed sheets keep ART defensible as a system of record.
- **Customer surface is a separate read path**, never a hidden edit view; treatment-level visibility
  is part of the RBAC model, designed in from the start.

---

## Appendix A — Build register

Every discrete build from planning, with a **stable ID** so it can be found and tracked. Conventions
for interrogating this with Claude Code:

- **Find a build:** grep its ID, e.g. `B21` or `B21c`. Every reference across the repo uses the same ID.
- **Status tokens** (greppable): `status: not-started` · `in-progress` · `done` · `blocked` · `parked`.
- **Phase / Theme** map to §5 (T0–T11) and §7 (Phase 0–6).
- When a build starts, add a `touches:` list of the real files changed and flip its status.

### Index

| ID | Build | Theme | Phase | Status | Depends on |
|----|-------|-------|-------|--------|-----------|
| B1 | Protocol builder: pull from an API'd external DB (generic) | B / T3 | 2 | not-started | — |
| B2 | Customer field on protocol (company + contact) | T3 | 4 | not-started | B1, Customer adapter |
| B3 | Responsible persons (Research Mgr, Study Director, Trials Officer) | T2 | 3 | not-started | A (Entra) |
| B4 | Entra login prioritises trial-library order | T2 | 3 | not-started | A |
| B5 | Audit log shows Entra identity of the editor | T2 | 3 | not-started | A |
| B6 | Parse historic trials (assessment sheets / master tables) | T9 | 5 | in-progress | C |
| B7 | Blob storage for historic protocol documents | C / T9 | 2 | not-started | C |
| B8 | Protocol builder emits a report in a template | T3 / D | 4 | not-started | D |
| B9 | Versioned protocol reports in blob (v1.0/v1.1/…) | T3 / C | 4 | not-started | C, B8 |
| B10 | Protocol-report changes shown on the audit log | T3 | 4 | not-started | B5, B9 |
| B11 | Trial map: add blank / filler plots | T5 | 4 | not-started | T1 |
| B12 | Trial map: thick black block-boundary lines | T5 | 4 | not-started | — |
| B13 | Trial map: N/S/E/W compass | T5 | 4 | not-started | — |
| B14 | Connect plot map to the field-planner mapping tool | T5 | 6 | not-started | Map adapter |
| B15 | Simplify treatment / label scheme (A,B,C,D) | T4 | 4 | not-started | *decision #1* |
| B16 | Hybrid assessment-timing model | T4 / E | 4 | not-started | *decision #2* |
| B17 | Investigate "locked" assessment/treatment dates | T4 | 4 | not-started | — |
| B18 | Separate Assessment-Dates / schedule section | T4 / E | 4 | not-started | B16 |
| B19 | Fixed-format Excel exports (filing system) | T7 / D | 4 | not-started | D |
| B20 | Customer visit sheet (map + data-to-today + upcoming grid) | T6 / D | 4 | not-started | D, B18 |
| B21 | Weigh / application sheet (per treatment) | T6 / D | 4 | not-started | D, Weather adapter, C |
| B22 | Per-plot image collection tool | T10 / C | 6 | not-started | C |
| B23 | Drone ortho image cut-up per plot | T10 | 6 | not-started | B14, B22 |
| B24 | Image presentation surface for customers | T10 / T2 | 6 | not-started | B22, B25 |
| B25 | Customer non-editable section (admin-controlled) | T2 | 3 | not-started | A |
| B26 | Report writer: versions | T8 / C | 4 | not-started | C |
| B27 | Report writer: Discussion / Results / Future Work inputs | T8 | 4 | not-started | — |
| B28 | Report writer: Word template + stored versions | T8 / D | 4 | not-started | D, B26 |
| B29 | Dataviz "fiddle-then-pin" explorer (reuse existing code) | T11 | 6 | parked | Stats engine, D, E |

### Detail

Each entry: what it is, its consumer, and the code it will most likely touch (from the current tree).

#### B1 · Protocol builder — pull from an API'd external database
`status: not-started` · phase 2 · theme B/T3
Generic capability to populate protocol fields from an external DB via an adapter interface + mock now,
real API later. Consumer: B2 (and any future coded source). Touches: new `src/lib/sources/*` adapter
interfaces, `src/components/ProtocolDetailPage.tsx`.

#### B2 · Customer field on a protocol (company + contact)
`status: not-started` · phase 4 · theme T3
Pick a customer (company + contact) from the Customer adapter. Consumer: reports, visit sheet (B20),
weigh sheet (B21), customer↔access mapping (B25). Touches: `schema.ts` (protocol), `ProtocolDetailPage.tsx`,
Customer adapter.

#### B3 · Responsible persons (Research Manager, Study Director, Trials Officer)
`status: not-started` · phase 3 · theme T2
Assign people to a trial from Entra. Consumer: reports, weigh/visit sheets, audit. Touches: `schema.ts`
(trial), `TrialDetailPage.tsx`/`SiteView.tsx`, People (Entra) adapter.

#### B4 · Entra login prioritises trial-library order
`status: not-started` · phase 3 · theme T2
Sort the trial list so the signed-in user's trials surface first. Touches: `src/app/trial/page.tsx`,
`api/trial/route.ts`, identity context.

#### B5 · Audit log shows the Entra identity
`status: not-started` · phase 3 · theme T2
Replace the header-trusted `actor` with the verified Entra identity on every audit write. Touches: all
`api/**/route.ts` audit inserts, `api/trial/[id]/audit/route.ts`, `AuditView.tsx`.

#### B6 · Parse historic trials (assessment sheets / master data tables)
`status: in-progress` · phase 5 · theme T9
Import legacy trials: upload → column-map → preview → commit; unmapped fields → notes/properties.
*Decision #4* sets fidelity (archival / structural / tiered).
First cuts shipped (STRI assessment-sheet format: one sheet per assessment date + a Trial Plan
sheet → protocol + treatments (Untreated → check) + plots + one date-stamped measurement header
per (measurement × date) + values, in one transaction; verified against a real file):
- **In-app upload** — `/trial/import` page + `POST /api/import/assessment-sheet` route, sharing the
  parser in `src/lib/import/assessmentSheet.ts`. Upload from the browser, no CLI.
- **CLI** — `npm run import:sheet <file.xlsx> [--dry-run]` (`scripts/import-assessment-sheet.ts`),
  plus a simpler flat-CSV importer `npm run import:trial` (`scripts/import-historic-trial.ts`).
Remaining B6 work: column-mapping for arbitrary sheets, the fidelity decision (#4), and messier
inputs (merged headers, subsamples, multi-factor Treat2). touches:
`src/lib/import/assessmentSheet.ts`, `src/app/trial/import/page.tsx`,
`src/app/api/import/assessment-sheet/route.ts`, `scripts/import-assessment-sheet.ts`.

#### B7 · Blob storage for historic protocol documents
`status: not-started` · phase 2 · theme C/T9
Store original historic protocol files in the document store (C). Touches: document-store service,
Azure Blob adapter.

#### B8 · Protocol builder emits a report in a template
`status: not-started` · phase 4 · theme T3/D
Render a protocol summary through the template engine (D). Consumer: filing, approval, trial book.
Touches: template engine, `ProtocolDetailPage.tsx`, `ReportView.tsx` patterns.

#### B9 · Versioned protocol reports in blob (v1.0 / v1.1 / …)
`status: not-started` · phase 4 · theme T3/C
Each emitted report is versioned and stored in the document store; ties to immutable distributed
protocol versions. Touches: document store (C), protocol versioning in `schema.ts`.

#### B10 · Protocol-report changes shown on the audit log
`status: not-started` · phase 4 · theme T3
Every protocol/report change writes an attributed audit entry. Depends on B5 (identity) + B9 (versioning).
Touches: audit writes on protocol routes, `AuditView.tsx`.

#### B11 · Trial map — add blank / filler plots
`status: not-started` · phase 4 · theme T5
Allow non-treatment blank plots in the layout; excluded from analysis, shown on the map/prints. Touches:
`api/trial/[id]/generate/route.ts`, `plot` schema, `src/lib/stats/buildData.ts` (omit blanks),
`TrialMapView.tsx`/`PlotGrid.tsx`.

#### B12 · Trial map — thick black block-boundary lines
`status: not-started` · phase 4 · theme T5
Extend the existing alpha block-boundary rendering to draw thick lines around blocks for all designs.
Touches: `TrialMapView.tsx` (block-boundary logic already present for alpha), print CSS.

#### B13 · Trial map — N/S/E/W compass
`status: not-started` · phase 4 · theme T5
Orientation compass on screen and on printed maps. Touches: `TrialMapView.tsx`, print layouts.

#### B14 · Connect plot map to the field-planner mapping tool
`status: not-started` · phase 6 · theme T5
Integrate ART's plot map with the existing planner (plot geometry / field position) via the Map adapter.
Prerequisite for B23. Touches: Map adapter, `TrialMapView.tsx`, `plot` geometry fields.

#### B15 · Simplify treatment / label scheme
`status: not-started` · phase 4 · theme T4 · **blocked on decision #1**
Rework the A/B/C(/treatment-number/combined) labelling that feels unwieldy. Touches: `schema.ts`,
`TreatmentProgram.tsx`, `ApplicationsView.tsx`, `src/shared/timing.ts`.

#### B16 · Hybrid assessment-timing model
`status: not-started` · phase 4 · theme T4/E · **blocked on decision #2**
Time assessments by calendar date / days-after-planting / days-after-application / growth-stage trigger
(and possibly interval series), not only "N DA-application". Touches: `src/shared/timing.ts`,
`TimingField.tsx`, `measurement_def`/`measurement_header` schema, `MeasurementsView.tsx`.

#### B17 · Investigate "locked" assessment/treatment dates
`status: not-started` · phase 4 · theme T4
Confirm the protocol(abstract)→trial(actual) date split is the cause and decide any UX change. Touches:
`ApplicationsView.tsx`, `TimingField.tsx`. (Investigation — likely folds into B16/B18.)

#### B18 · Separate Assessment-Dates / schedule section
`status: not-started` · phase 4 · theme T4/E
Trial-side view (like Applications) projecting each assessment's date from planting + actual application
dates, and recording actuals. Consumer: B20, data sheets, time-series charts. Touches: new schedule view,
`measurement_header` dates, `TrialDetailPage.tsx`.

#### B19 · Fixed-format Excel exports
`status: not-started` · phase 4 · theme T7/D
Export at defined workflow points in a fixed layout matching your filing system. Touches: template/export
engine (D), export endpoints.

#### B20 · Customer visit sheet
`status: not-started` · phase 4 · theme T6/D
Print: plot map + data-to-today + an empty grid beyond for selected upcoming assessment metrics. Touches:
template engine (D), `DocumentsView.tsx`, schedule model (B18).

#### B21 · Weigh / application sheet (per treatment)
`status: not-started` · phase 4 · theme T6/D
Generated from each treatment entry. Sub-parts:
- **B21a** plot map · **B21b** area per plot · **B21c** product amount to weigh out
  (`rate × plot area` + unit conversion — the roadmap's product/rate calc) · **B21d** mixing instructions ·
  **B21e** sprayer + other template fields · **B21f** weather (Weather adapter) · **B21g** signature box ·
  **B21h** scan/image the signed sheet into blob storage (longer term).
Touches: template engine (D), Weather adapter, document store (C), `treatment`/`treatment_application`
schema, `DocumentsView.tsx`.

#### B22 · Per-plot image collection tool
`status: not-started` · phase 6 · theme T10/C
Attach images to allocated plots (or all). Touches: document store (C), new image UI, `plot` linkage.

#### B23 · Drone ortho image cut-up per plot
`status: not-started` · phase 6 · theme T10
Georeference a whole-field image and clip it per plot. Gated on plot geometry from B14. Touches: Map
adapter/geometry, image pipeline, document store (C).

#### B24 · Image presentation surface for customers
`status: not-started` · phase 6 · theme T10/T2
Collected images shown to customers for presentations, via the read-only customer surface. Touches: B22
store, customer view (B25), presentation UI.

#### B25 · Customer non-editable section (admin-controlled)
`status: not-started` · phase 3 · theme T2
A hard, separate read path exposing only approved artifacts; admin controls what's shared; includes
treatment-level visibility (hide selected treatments from a customer everywhere). Touches: RBAC middleware
(A), customer routes/views.

#### B26 · Report writer — versions
`status: not-started` · phase 4 · theme T8/C
Store report versions in the document store, audit-linked. Touches: document store (C), `ReportView.tsx`.

#### B27 · Report writer — Discussion / Results / Future Work inputs
`status: not-started` · phase 4 · theme T8
Add the new authored sections (review the current report inputs first). Touches: `ReportView.tsx`, report
data model.

#### B28 · Report writer — Word template + stored versions
`status: not-started` · phase 4 · theme T8/D
Emit the report through a Word template; store each version (B26). Touches: template engine (D), document
store (C).

#### B29 · Dataviz "fiddle-then-pin" explorer
`status: parked` · phase 6 · theme T11
Interactive explorer: tweak a chart, hide treatments (shares the subset/visibility mechanism with B25),
pin the chosen figure into the report. **Reuse the user's existing charting program** rather than build
fresh. Touches: new viz module, stats engine, template engine (D), timing model (E, for time-series).
