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
