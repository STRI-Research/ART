# Treatment & Application-Planning Redesign — Phase 0 Review

Status: **design review — no schema or production code changed yet.**
Scope: the redesign brief covering treatment components, scheduling rules, trial application
events, the calculation engine, two-person Entra approval, application packs, evidence upload,
and audit. This document is the required "first response" (brief §33): current-code findings,
proposed architecture, implementation plan, and open questions.

---

## A. Current-code findings

### A1. Schema (`src/lib/db/schema.ts`, Postgres/Neon via Drizzle)

| Table | Owner | Notes |
|---|---|---|
| `protocol` | protocol | Singleton-per-protocol metadata + design (RCB/CRD/ALPHA), replicates, blockSize, plotWidth/Length |
| `treatment` | protocol | `(protocolId, number)` unique. `id` serial — **reassigned on every save** (delete-all + reinsert) |
| `treatment_application` | protocol | Program lines: `applicationRef` (timing code text), `product` **free text**, `rate` **free text**, `rateUnit` text |
| `application` | protocol | The A/B/C timing *plan*: `timingCode`, `targetGrowthStage`, `description`. No dates |
| `measurement_def` | protocol | Copied into trials at creation as locked `measurement_header` rows |
| `trial` | trial | Site metadata, layout, `layoutLockedAt`. **No start/finish dates, no funded-application count** (only `plantingDate`) |
| `application_actual` | trial | `(trialId, timingCode)` unique → `actualDate` only. This is the *entire* current "actual application record" |
| `property` | trial | Generic key/value, scope `trial` or `application` (per timing code) — carries application conditions today |
| `plot` | trial | `plot.treatmentId → treatment.id` FK **`onDelete: cascade`** — the central hazard |
| `measurement_header` / `measurement_value` | trial | Values keyed `(headerId, plotId, subsample)` |
| `analysis_result` | trial | Cached stats |
| `audit_log` | both | Flat rows; nullable trial/protocol FKs (`set null`) |
| `library_term` | global | Vocabulary; **no user/org scoping** |

**No `drizzle/` migrations folder exists.** `drizzle.config.ts` points at `./drizzle` but it has
never been generated — the schema is evidently managed with `drizzle-kit push`. There is no
migration history to build on; introducing real migrations is itself a Phase 1 task.

### A2. Treatment save routes

- `PUT /api/protocol/[id]/treatments` — validates with zod, then **`DELETE` all treatments for
  the protocol and multi-row `INSERT ... RETURNING`**, relying on positional alignment to rebuild
  application lines. Returns 409 if any trial exists ("Protocol has trials and cannot be edited").
  Same delete-and-reinsert pattern for `/applications` and `/measurement-defs`.
- Every keystroke-blur in `ProtocolDetailPage.tsx` posts the **whole treatments array**.
- Audit entry is a single "treatments.replace — N treatment(s)" row; no field-level diff.

### A3. Trial generation & cascade behaviour

- `POST /api/trial/[id]/generate` randomizes in JS (mulberry32, RCB/CRD/ALPHA), deletes existing
  plots, inserts new ones referencing **live protocol `treatment.id`s**. Treatments are *not*
  snapshotted into the trial; `getTrialSnapshot` re-reads them from the protocol on every fetch.
- Cascade map: delete a treatment → cascades to `plot` → cascades to `measurement_value`.
  This is why treatment editing is frozen post-trial; the freeze is a guard around the unsafe
  save pattern, not a domain rule.

### A4. Authentication / session

- NextAuth v5 beta + `MicrosoftEntraID` provider (`src/auth.ts`), JWT sessions, `trustHost`.
- `src/middleware.ts` gates **all** pages and API routes except `/sign-in` and `/api/auth/*`.
- Session shape is the NextAuth default: `user.name`, `user.email`, `user.image`. **No roles, no
  Entra `sub`/`oid` surfaced, no `users` table in the DB.** `getActor()` reduces identity to an
  email/name string for audit rows. Individual API routes do not re-check `auth()` themselves;
  they rely on middleware.

### A5. Audit service

- No service layer: each route inlines `db.insert(auditLog).values({...})` in a `try {} catch {}`.
  Granularity is coarse ("replaced N"), no before/after data, no document versions, no reasons.

### A6. Blob storage — **none**

- The only `Blob` usages are client-side CSV downloads (`ReportView`, `AuditView`, `LibraryView`).
  No `@vercel/blob`, no upload route, no file table. Evidence upload is greenfield.

### A7. Print / PDF capability

- Browser-only: `DocumentsView.tsx` renders five documents (field map, plot labels, data sheets,
  spray record, trial summary) and relies on `window.print()` + `@media print` CSS (label stock
  presets inject a print-only `@page`). Electron's `printToPDF` is gone. **No server-side PDF
  generation and no QR library.**

### A8. Plot-map rendering

- `PlotGrid.tsx` is a reusable grid used by both the interactive trial map (`TrialMapView`) and
  the printable field map — exactly the "reuse the existing trial-map source" the brief wants for
  application-pack page 2.

### A9. Actual application records today

- One field: `application_actual.actualDate` per timing code, edited in `ApplicationsView.tsx`.
  Conditions (weather, operator, sprayer, nozzle…) live as generic `property` rows scoped to the
  application code. No times, no status, no checks, no deviation capture.

### A10. Measurement timing model

- `measurement_header.applicationRef` (timing code) + `daysAfter` + free-text `timing` override.
  `src/shared/timing.ts` derives the label ("14 DA-A") and the calendar date from
  `application_actual.actualDate`. Already normalized — no wide per-application columns. DAT
  derivation for the new model only needs the anchor to resolve to an application **event's
  actual date** instead of `application_actual`.

### A11. Check-treatment constraint (brief §5 asked explicitly)

- `src/shared/derive.ts:controlMean` collects **all** `isCheck` treatments and averages across
  their non-excluded plots. So the correct validation is **"at least one check when any formula
  uses `control()`/`abbott()`"** — multiple checks are supported and meaningful (their plots are
  pooled). Do **not** constrain to exactly one.

### A12. Platform constraints discovered

1. **No interactive transactions.** `src/lib/db/index.ts` uses `drizzle-orm/neon-http`, which
   does not support `db.transaction()`. The approval, schedule-generation and invalidation flows
   the brief requires need atomicity → switch to the `neon-serverless` WebSocket `Pool` driver
   (same package family, supported by Drizzle, works on Vercel) as part of Phase 1.
2. **No test infrastructure.** `src/shared/*.test.ts` files survive from the Electron port, but
   `package.json` has no test script and no vitest/jest dependency. Adding vitest is a
   prerequisite for the calculation engine's test requirements.
3. **No concurrency control anywhere** — no version columns, no updated-at checks; last write
   wins on every entity.
4. **No ownership scoping** — every authenticated user sees and edits all rows. The brief says
   not to solve org-wide permissions now, but the approval roles need *some* user model (see B).

---

## B. Proposed architecture

### B1. Guiding decisions

1. **Randomized identity vs. schedule are different things.** `treatment` (number, name, check
   status) stays the stable experimental unit that plots reference. Everything schedule-shaped
   moves *out* of the protocol treatment into components (protocol) and events (trial). Plot FKs
   are never touched by planning edits.
2. **Additive schema, upsert saves.** No existing table is dropped or repurposed in early phases.
   `treatment_application` is retained read-only as the legacy program representation until
   migrated. The delete-and-reinsert endpoints are replaced by explicit per-entity operations.
3. **Completed events are evidence.** Schedule regeneration/rebasing only ever touches events
   with `executionStatus = 'pending'`; completed/approved events are excluded by the domain
   layer *and* by DB-level status checks in the write paths.
4. **Typed JSONB for rule/config payloads** (schedule rules, weather snapshots, check lists,
   document snapshots) with zod schemas in `src/shared/` as the single source of truth —
   avoiding a column per future model, per the brief.

### B2. Entity relationship (new/changed)

```
product (org catalogue)
    ▲
treatment (existing, stabilized)
    └── treatment_component        ← default rate, water, schedule_rule JSONB, active window
trial (add startDate, endDate, fundedApplicationCount)
    └── application_event          ← one per distinct date; label A…Z, AA…; planned/actual
          ├── event_occurrence     ← (event × component): planned/actual rate overrides, status
          ├── treatment_mix        ← one per (event × treatment): water, overage, tank-mix status
          ├── application_document ← immutable version snapshots + approval records
          │       └── evidence_file← blob refs for signed uploads
          └── (weather snapshots as JSONB on the event)
app_user / notification            ← minimal identity + roles + in-app notifications
```

### B3. Schema additions (Drizzle, all additive)

- **`product`** — `id`, `name`, `code` (STRI), `mappNumber`, `formulationType`,
  `physicalForm` (`'liquid' | 'solid'`), `defaultRateValue`, `defaultRateUnit`, `minRateValue`,
  `maxRateValue`, `defaultWaterVolLPerHa`, `manufacturer`, `active`, `notes`, timestamps.
  Every field has a named consumer (weigh-sheet calc, range validation, pack printing).
- **`treatment_component`** — `id`, `treatmentId` FK (`cascade` — components die with their
  treatment, which is safe because treatments no longer get deleted casually), `productId` FK
  (`restrict`), `ordinal`, `rateValue real`, `rateUnit text`, `rateOutOfRangeReason`,
  `waterVolumeLPerHa`, `waterIn boolean`, `inTankMix boolean`, `scheduleRule jsonb`,
  `activeFrom date`, `activeUntil date`, `maxOccurrences int`, `fromOccurrence int`,
  `groupName`, `notes`, `updatedAt`.
- **`treatment` (alter)** — add `notes`, `updatedAt`, `version int` (optimistic concurrency).
  Existing columns unchanged; `plot.treatmentId` FK untouched.
- **`trial` (alter)** — add `startDate`, `endDate`, `fundedApplicationCount int`,
  `fundedCountScope` (`'trial' | 'component'` + optional `fundedComponentId`) so the funded
  limit can attach at the right level (brief §9).
- **`application_event`** — `id`, `trialId` FK, `sequence int`, `label text` (A…Z, then AA, AB…),
  `plannedDate`, `actualDate`, `actualStartTime`, `actualEndTime`, `planningStatus`
  (`planned | rescheduled | cancelled`), `executionStatus` (`pending | completed | amended`),
  `evidenceStatus` (`not_required | outstanding | uploaded`), `createdFrom`
  (`generated | manual | merge | split | migrated`), `rescheduleReason`, `operator`, `sprayer`,
  `forecastSnapshot jsonb`, `actualWeather jsonb`, `preChecks jsonb`, `completionNotes`,
  `amendReason`, `version int`, timestamps. Unique `(trialId, sequence)`.
  Separate planning/approval/execution/evidence statuses (approval lives on the document
  version, see below) — this is the multi-axis status model §19 prefers, preventing invalid
  combinations like "approved but never planned".
- **`event_occurrence`** — `id`, `eventId` FK (`cascade`), `componentId` FK (`restrict`),
  `treatmentId` (denormalized for mix grouping; `restrict`), `plannedRateValue/Unit` (nullable
  override), `plannedOverrideReason`, `actualRateValue/Unit`, `deviationReason`,
  `status` (`planned | cancelled | applied`), `subMixIndex int` (same-date but
  must-spray-separately support), `origin` (`rule | manual`).
- **`treatment_mix`** — `id`, `eventId` FK, `treatmentId` FK, `waterVolumeLPerHa`,
  `overageEnabled`, `overagePct real`, `waterIn`, `sprayer`, `tankMixStatus`
  (`unconfirmed | confirmed | separate | not_confirmed`), `tankMixNotes`. Unique
  `(eventId, treatmentId)` — enforces "one treatment = one separately prepared mix".
- **`application_document`** — `id`, `eventId` FK, `versionNumber int`, `status`
  (`draft | awaiting_first_check | awaiting_approval | returned | approved | superseded`),
  `snapshotJson jsonb` (the complete immutable input + calculation snapshot), `inputHash text`,
  `documentRef text` unique (printed reference + QR target), `createdById`, `firstCheckById/At`,
  `assignedApproverId`, `approvedById/At`, `returnReason`, `comments`, `printedAt`.
  Unique `(eventId, versionNumber)`.
- **`evidence_file`** — `id`, `eventId`, `documentId`, `blobKey`, `blobUrl`, `fileName`,
  `mimeType`, `sizeBytes`, `evidenceType`, `uploadedById/At`, `replacesId` (self-FK for
  replacement history).
- **`app_user`** — `id`, `email` unique, `name`, `entraOid`, `roles jsonb`
  (`["preparer","research_manager","admin"]`), `active`, timestamps. Populated/refreshed at
  sign-in via the NextAuth `jwt`/`signIn` callback. This is deliberately *minimal identity +
  roles*, not an ownership model — protocols/trials remain globally visible, which is the
  honest statement of the current missing ownership layer (brief §18 asked this be explained,
  not solved).
- **`notification`** — `id`, `userId`, `type`, `payloadJson`, `readAt`, `createdAt`.
- **`audit_log` (alter)** — add `documentVersion int`, `reason text`, `beforeJson jsonb`,
  `afterJson jsonb` (bounded: field-level diffs, not entity dumps).

### B4. Schedule rules (typed JSONB)

Zod discriminated union in `src/shared/schedule.ts`, stored in `treatment_component.scheduleRule`:

```ts
type ScheduleRule =
  | { type: 'once'; plannedDate?: string }
  | { type: 'calendar_interval'; intervalDays: number }
  | { type: 'weekly_interval'; intervalWeeks: number }
  | { type: 'monthly'; intervalMonths: number }
  | { type: 'manual'; dates: string[] }
  | { type: 'gdd'; targetGdd: number; baseTempC?: number; modelConfig?: Record<string, unknown> }
  | { type: 'growth_potential'; threshold?: number; modelConfig?: Record<string, unknown> }
  | { type: 'review_pressure'; reviewAfterDays?: number; modelRef?: string; modelConfig?: Record<string, unknown> }
```

`gdd` / `growth_potential` / `review_pressure` generate **placeholder occurrences** (flagged
"forecast/decision required" in the timeline) until a weather adapter exists. A
`WeatherProvider` interface (`src/lib/weather/provider.ts`) defines the boundary now; snapshots
are stored as JSONB on the event so history reflects what was known at the time.

### B5. Stable-ID and save-path strategy

- Kill delete-and-reinsert for `treatment`/`treatment_application`. New endpoints:
  `POST /api/protocol/[id]/treatments` (create one), `PATCH /api/treatment/[id]`,
  `DELETE /api/treatment/[id]` (guarded: 409 if any plot references it),
  `POST /api/treatment/[id]/components`, `PATCH /api/component/[id]`, `DELETE /api/component/[id]`
  (guarded: 409 if any non-cancelled occurrence references it), plus explicit `reorder` ops.
- With stable IDs, the blanket post-trial freeze relaxes to targeted rules:
  - always editable: treatment `name`, `notes`, component cosmetic fields;
  - trial-planning-editable: everything on events/occurrences/mixes (trial-side);
  - restricted post-trial: treatment create/delete, `number`, `isCheck`, component
    add/remove/product/rate changes — these alter the experiment definition. Phase 1 keeps
    these blocked when trials exist (same 409, now enforced per-operation); full protocol
    versioning is explicitly out of scope, matching brief §26's fallback.
- Optimistic concurrency: `version` column on `treatment`, `application_event`,
  `application_document`; PATCH carries the version, mismatch → 409 with a clear conflict body.

### B6. Approval-state model

Approval state lives on **`application_document`** (the version), never on the event:

```
draft → awaiting_first_check → awaiting_approval → approved → superseded
              ↑______________ returned ______________|
```

- First check + approve are separate server-verified actions by two *different* `app_user`s,
  identities taken from the server session (`auth()`), never from the client payload.
- Approver must approve the exact `versionNumber` they opened (version echoed in the request,
  checked server-side).
- **Invalidation:** all material inputs are part of `snapshotJson`; a domain function
  `computeInputHash(snapshot)` covers products, rates, units, water, overage, treatments
  included, occurrences, plot area, plot counts, planned date, water-in, mix structure and a
  calc-engine version string. Any mutation that changes the hash while an
  `approved`/`awaiting_*` document exists marks it `superseded`/`returned` (transactionally),
  resets the event to needs-checking, notifies, and audits. Actual/completion details
  (times, operator, sprayer, actual weather, checks, evidence, notes) are *not* hashed → don't
  invalidate, per brief §18. Actual rate ≠ planned rate stores the actual + required
  `deviationReason` and flags it, without invalidating pre-application approval.
- Printing gate: pack preview renders always but watermarked `DRAFT — NOT APPROVED FOR
  APPLICATION` unless `status = 'approved'`; the print action records `printedAt` + audit.

### B7. Calculation engine

Pure, deterministic module `src/shared/appcalc.ts` (+ tests) — no React, no DB:

```
treatedAreaM2   = plotAreaM2 × plotCount          (plotCount from live plot allocation, excluded plots omitted)
totalProductMl  = rateLPerHa  × treatedAreaM2 × 0.1   (liquid, L/ha)
totalProductG   = rateKgPerHa × treatedAreaM2 × 0.1   (solid, kg/ha)
totalWaterMl    = waterLPerHa × treatedAreaM2 × 0.1
adjusted        = base × (1 + overagePct / 100)        (applied to water and products alike)
```

- Water computed **once per treatment mix**; products added to (never subtracted from) water.
- Rate-unit support: `L/ha`, `kg/ha`, `ml/m²`, `g/m²` (the m² units skip the ×0.1 hectare
  conversion). Extensible via a small unit table, not a general conversion framework.
- Rounding: display-rounding only (ml/g to 0.1 below 10, 1 above; L/kg to 0.01), raw values
  retained in the snapshot; quantities below a configurable measurement floor (default 0.1 ml /
  0.01 g) trigger a "below reliable measurement range" warning, never silent zero.
- The same module output feeds the review UI, the document snapshot, and the printed pack — one
  implementation, three consumers.

### B8. Application pack & QR

- Pack = a print-routed page rendered from the **document snapshot** (not live data): §1 control
  & approval header, §2 plot map (reusing `PlotGrid`), §3+ one section per treatment mix, final
  field-execution record section. Browser print CSS, consistent with `DocumentsView`.
- Immutability = `snapshotJson` + `inputHash` (re-renderable exactly), rather than storing a
  server-generated PDF — Vercel serverless makes headless-Chrome PDF generation heavy, and the
  *signed uploaded scan* is the true evidentiary artifact. (Flagged as open question D3.)
- QR encodes `/{origin}/apply/{documentRef}` → auth → evidence-upload page for that exact
  event/version. QR generated with a small dependency (`qrcode`) as SVG at pack render.

### B9. Evidence upload

- Vercel Blob (`@vercel/blob`, store keyed by `documentRef`) behind
  `POST /api/event/[id]/evidence` (multipart; server-side auth; size/MIME limits;
  audit + `evidence_file` row in one transaction). Replacement keeps the old row via
  `replacesId`. Outstanding-evidence warnings derive from
  `executionStatus = completed ∧ evidenceStatus = outstanding` + days elapsed, surfaced on the
  timeline and a cross-trial outstanding-actions view.

### B10. Backward compatibility & migration

- **Introduce real Drizzle migrations first** (baseline-generate against current schema), since
  none exist. All new DDL ships as additive migrations.
- Legacy `treatment_application` rows: a per-protocol **assisted conversion** ("Upgrade this
  protocol") maps each distinct product string → a `product` record (fuzzy-matched suggestions,
  user-confirmed — free text is never auto-trusted), parses `rate` strings numerically where
  unambiguous (`"1.5"` + `"L/ha"`), flags ambiguous ones for manual entry, and creates
  components with `manual`/`once` rules anchored to the old A/B/C codes. Original rows are kept
  untouched for reference.
- Legacy `application_actual` rows become `application_event`s (`createdFrom: 'migrated'`,
  label = timing code, actualDate carried over) so existing measurement-timing anchors and DAT
  derivations keep working; `src/shared/timing.ts` gets an adapter that resolves an anchor
  against events first, then legacy actuals.
- Old trials remain fully viewable/analyzable without conversion (stats/report read treatments +
  plots + values, none of which change). They gain the new application workflow only after the
  protocol-level conversion is confirmed.

### B11. Consumer-test mapping (delta)

| New value | Consumer |
|---|---|
| `product.*` rate range | Component validation, approval-screen exception list, audit |
| `product.physicalForm` | Calc engine branch (ml vs g), pack rendering |
| Numeric `rateValue/Unit` | Calc engine, pack, deviation detection |
| `scheduleRule` | Plan generation, timeline, conflict detection |
| `trial.startDate/endDate/fundedApplicationCount` | Plan generation + conflict warning, timeline countdowns |
| `event.plannedDate/actualDate` | Timeline, rebasing, DAT derivation, pack |
| `treatment_mix.waterVolumeLPerHa/overagePct` | Calc engine, pack |
| `document.snapshotJson/inputHash` | Approval invalidation, immutable reprint |
| `evidence_file.*` | Completion gating, outstanding-actions view |
| `app_user.roles` | Server-side approval authorization |

---

## C. Implementation plan

Small, reviewable phases; each lands with its migration, tests, and a working UI slice.
Definition of done for every phase includes: typecheck + lint clean, tests green, no regression
to stats/report/map on an existing trial.

### Phase 1 — Foundations (stable IDs, products, components, numeric rates)
- **Migrations:** baseline; `product`; `treatment_component`; `treatment` +
  `notes/updatedAt/version`; `audit_log` extensions; `app_user`.
- **Infra:** switch DB driver to `neon-serverless` Pool (transactions); add vitest + test
  script; NextAuth callback upserts `app_user` and surfaces id/roles in the session.
- **API:** per-entity treatment/component CRUD (upsert, guarded deletes, optimistic
  concurrency); product CRUD; deprecate (keep, but stop using) the array-replace endpoints.
- **UI:** Treatments tab reworked — product picker (from catalogue), numeric rate + unit,
  out-of-range warning + required reason, duplicate-product warning, validation surface
  (unique/contiguous numbers, required name, ≥1 check when formulas use control()).
- **Tests:** rate validation, save-path (no cascade), concurrency conflicts, check-constraint.
- **Risks:** driver swap touches every route (mitigate: `getDb()` is the single entry point);
  coexistence of legacy program lines and components (mitigate: read-only legacy display until
  converted).

### Phase 2 — Trial application planning
- **Migrations:** `application_event`, `event_occurrence`; `trial` date/funded fields.
- **Domain (`src/shared/`):** schedule generation from rules + trial window, event
  merging/combination by date, lettering (A…Z, AA…), conflict computation
  (dates × interval × funded count) with resolution options, rebasing (single occurrence /
  component-forward / whole-event / all-forward), split & merge, completed-event protection.
- **API:** generate plan, move occurrence/event (with scope + preview), merge, split, cancel,
  add manual occurrence — all transactional, all audited with reasons.
- **UI:** timeline/matrix view (events as columns, components as rows, countdowns, overdue,
  trial-level summary), progressive disclosure, preview-before-save for multi-event changes.
- **Migration:** `application_actual` → migrated events; timing adapter for DAT.
- **Tests:** generation determinism, combination rules, rebasing scopes, funded-count conflicts,
  completed-event immutability (regeneration cannot touch completed events).
- **Risks:** rebasing semantics are the subtlest logic in the project — mitigated by pure
  domain functions with exhaustive tests before any UI.

### Phase 3 — Calculation engine
- **Migrations:** `treatment_mix`.
- **Domain:** `appcalc.ts` per B7 (liquid/solid, water-per-mix, overage, rounding,
  sub-measurable warnings, per-plot and totals).
- **API/UI:** mix settings (water, overage, tank-mix status + warning + compatibility record,
  sub-mix split), calculation review screen showing base + adjusted values.
- **Tests:** the full §16 matrix — liquid, solid, areas, replicates-from-plot-allocation,
  overage, multi-product shared water, separate mixes, overrides, rounding edges, untreated,
  missing inputs.

### Phase 4 — Entra approval workflow
- **Migrations:** `application_document`, `notification`.
- **Domain:** snapshot builder, `computeInputHash`, status machine, invalidation triggers wired
  into every material-input write path.
- **API:** first-check, submit (choose approver), return (required reason), approve
  (version-checked, role-checked, server identity), withdraw; in-app notifications.
- **UI:** approval screens for preparer and manager, exception list (out-of-range rates,
  tank-mix warnings), status chips on timeline.
- **Tests:** two-different-users enforcement, version-mismatch rejection, material change →
  invalidation, non-material completion details → no invalidation, role enforcement
  server-side.

### Phase 5 — Application pack
- Pack renderer from `snapshotJson` (control page, plot map via `PlotGrid`, per-mix weigh
  sections, field execution record), DRAFT watermark gate, QR (`qrcode` dep), `documentRef`,
  print action recording. Tests: snapshot render determinism, gating.

### Phase 6 — Execution & evidence
- **Migrations:** `evidence_file`; event execution fields already present from Phase 2.
- **API/UI:** record-actuals (plan pre-copied, deviations require reasons), amend-completed
  (reason + before/after audit), Vercel Blob upload via QR-landed page, replacement history,
  outstanding-evidence warnings + outstanding-actions view, finalization.
- **Tests:** completed-record protection, amendment audit, evidence gating of "complete".

### Later (explicitly deferred)
Weather adapter implementation (forecast/actual snapshots auto-filled), GDD/growth-potential/
Smith-Kerns live rules, email/Microsoft notifications, inventory/Chemvault, protocol versioning,
org-wide ownership model.

---

## D. Open questions (genuinely blocking)

1. **Production data & migration baseline.** There is no `drizzle/` migrations folder — is the
   Neon database currently managed purely by `drizzle-kit push`, and does it hold real
   production protocols/trials that must survive in place? This determines whether the baseline
   migration can be generated fresh or must be introspected from the live DB.
2. **Role source.** Should `research_manager`/`admin` roles come from Entra (app roles/groups in
   the token) or from an in-app admin-managed table? Proposed default: in-app `app_user.roles`
   (simplest, no tenant-admin dependency), with the Entra `oid` stored so a later switch to
   directory roles is clean. Confirm.
3. **Approved-document immutability.** Is an immutable **data snapshot + exact re-render**
   acceptable as the controlled version (with the signed uploaded scan as the physical
   artifact), or is a stored generated PDF required for compliance? Server-side PDF on Vercel
   is possible (headless Chromium) but adds real weight; recommendation is snapshot + re-render.
4. **Blob provider.** Vercel Blob is the natural fit for the deployment; confirm it's
   acceptable for signed application evidence (retention/limits), or name the preferred store.
5. **Overage scope.** Confirm overage scales **both water and all product quantities**
   proportionally (spray-to-waste style), as assumed in B7 — the brief says "apply consistently
   based on the agreed operating method" without stating the method.
