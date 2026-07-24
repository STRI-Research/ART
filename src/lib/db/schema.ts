import {
  pgTable,
  serial,
  text,
  integer,
  real,
  boolean,
  timestamp,
  uniqueIndex,
  index,
  primaryKey,
  jsonb,
} from 'drizzle-orm/pg-core'

// ---------------------------------------------------------------------------
// Protocol
// ---------------------------------------------------------------------------
export const protocol = pgTable('protocol', {
  id: serial('id').primaryKey(),
  protocolUid: text('protocol_uid').notNull().default(''),
  protocolVersion: integer('protocol_version').notNull().default(1),
  title: text('title').notNull().default(''),
  crop: text('crop').notNull().default(''),
  targetPest: text('target_pest').notNull().default(''),
  objective: text('objective').notNull().default(''),
  investigator: text('investigator').notNull().default(''),
  season: text('season').notNull().default(''),
  notes: text('notes').notNull().default(''),
  design: text('design').notNull().default('RCB'),
  replicates: integer('replicates').notNull().default(4),
  blockSize: integer('block_size').notNull().default(2),
  plotWidth: real('plot_width').notNull().default(0),
  plotLength: real('plot_length').notNull().default(0),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
})

// ---------------------------------------------------------------------------
// Treatment
// ---------------------------------------------------------------------------
export const treatment = pgTable(
  'treatment',
  {
    id: serial('id').primaryKey(),
    protocolId: integer('protocol_id')
      .notNull()
      .references(() => protocol.id, { onDelete: 'cascade' }),
    number: integer('number').notNull(),
    name: text('name').notNull().default(''),
    type: text('type').notNull().default(''),
    isCheck: boolean('is_check').notNull().default(false),
    notes: text('notes').notNull().default(''),
    /** Optimistic-concurrency version; incremented on every update. */
    version: integer('version').notNull().default(1),
    updatedAt: timestamp('updated_at').defaultNow(),
  },
  (t) => [uniqueIndex('treatment_proto_num').on(t.protocolId, t.number)]
)

export const treatmentApplication = pgTable(
  'treatment_application',
  {
    id: serial('id').primaryKey(),
    treatmentId: integer('treatment_id')
      .notNull()
      .references(() => treatment.id, { onDelete: 'cascade' }),
    ordinal: integer('ordinal').notNull().default(0),
    applicationRef: text('application_ref').notNull().default(''),
    product: text('product').notNull().default(''),
    rate: text('rate').notNull().default(''),
    rateUnit: text('rate_unit').notNull().default(''),
  },
  (t) => [index('idx_trtappl_treatment').on(t.treatmentId)]
)

// ---------------------------------------------------------------------------
// Product (controlled catalogue — consumed by rate validation, the weigh-sheet
// calculation engine, and printed application documents)
// ---------------------------------------------------------------------------
export const product = pgTable(
  'product',
  {
    id: serial('id').primaryKey(),
    name: text('name').notNull(),
    /** Internal STRI product code. */
    code: text('code').notNull().default(''),
    mappNumber: text('mapp_number').notNull().default(''),
    formulationType: text('formulation_type').notNull().default(''),
    /** 'liquid' (ml calculations) or 'solid' (g calculations). */
    physicalForm: text('physical_form').notNull().default('liquid'),
    defaultRateValue: real('default_rate_value'),
    defaultRateUnit: text('default_rate_unit').notNull().default('L/ha'),
    /** Expected/permitted rate range; entries outside it need a deviation reason. */
    minRateValue: real('min_rate_value'),
    maxRateValue: real('max_rate_value'),
    defaultWaterVolLPerHa: real('default_water_vol_l_per_ha'),
    manufacturer: text('manufacturer').notNull().default(''),
    active: boolean('active').notNull().default(true),
    notes: text('notes').notNull().default(''),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
  },
  (t) => [uniqueIndex('product_name').on(t.name)]
)

// ---------------------------------------------------------------------------
// Treatment component (one product line within a treatment programme, with a
// default rate and a typed scheduling rule; replaces free-text program lines)
// ---------------------------------------------------------------------------
export const treatmentComponent = pgTable(
  'treatment_component',
  {
    id: serial('id').primaryKey(),
    treatmentId: integer('treatment_id')
      .notNull()
      .references(() => treatment.id, { onDelete: 'cascade' }),
    productId: integer('product_id')
      .notNull()
      .references(() => product.id, { onDelete: 'restrict' }),
    ordinal: integer('ordinal').notNull().default(0),
    rateValue: real('rate_value'),
    rateUnit: text('rate_unit').notNull().default('L/ha'),
    /** Required when the rate falls outside the product's configured range. */
    rateOutOfRangeReason: text('rate_out_of_range_reason').notNull().default(''),
    waterVolumeLPerHa: real('water_volume_l_per_ha'),
    waterIn: boolean('water_in').notNull().default(false),
    inTankMix: boolean('in_tank_mix').notNull().default(true),
    /** Typed ScheduleRule union (see src/shared/schedule.ts). */
    scheduleRule: jsonb('schedule_rule').notNull().default({ type: 'once' }),
    /** Active window (ISO dates, '' = unbounded). */
    activeFrom: text('active_from').notNull().default(''),
    activeUntil: text('active_until').notNull().default(''),
    /** Occurrence-count window: at most N occurrences / active from occurrence N. */
    maxOccurrences: integer('max_occurrences'),
    fromOccurrence: integer('from_occurrence'),
    groupName: text('group_name').notNull().default(''),
    notes: text('notes').notNull().default(''),
    updatedAt: timestamp('updated_at').defaultNow(),
  },
  (t) => [index('idx_component_treatment').on(t.treatmentId)]
)

// ---------------------------------------------------------------------------
// Application (protocol-defined plan)
// ---------------------------------------------------------------------------
export const application = pgTable('application', {
  id: serial('id').primaryKey(),
  protocolId: integer('protocol_id')
    .notNull()
    .references(() => protocol.id, { onDelete: 'cascade' }),
  ordinal: integer('ordinal').notNull().default(0),
  timingCode: text('timing_code').notNull().default(''),
  targetGrowthStage: text('growth_stage').notNull().default(''),
  description: text('description').notNull().default(''),
})

// ---------------------------------------------------------------------------
// Measurement definitions (protocol-authored)
// ---------------------------------------------------------------------------
export const measurementDef = pgTable('measurement_def', {
  id: serial('id').primaryKey(),
  protocolId: integer('protocol_id')
    .notNull()
    .references(() => protocol.id, { onDelete: 'cascade' }),
  partMeasured: text('part_measured').notNull().default(''),
  measurementType: text('measurement_type').notNull().default(''),
  measurementUnit: text('measurement_unit').notNull().default(''),
  applicationRef: text('application_ref').notNull().default(''),
  daysAfter: integer('days_after'),
  timing: text('timing').notNull().default(''),
  description: text('description').notNull().default(''),
  ordinal: integer('ordinal').notNull().default(0),
  analyze: boolean('analyze').notNull().default(true),
  subsamples: integer('subsamples').notNull().default(1),
  formula: text('formula').notNull().default(''),
})

// ---------------------------------------------------------------------------
// Trial
// ---------------------------------------------------------------------------
export const trial = pgTable('trial', {
  id: serial('id').primaryKey(),
  protocolId: integer('protocol_id')
    .notNull()
    .references(() => protocol.id, { onDelete: 'cascade' }),
  plotRows: integer('plot_rows').notNull().default(0),
  plotCols: integer('plot_cols').notNull().default(0),
  seed: integer('seed').notNull().default(0),
  siteName: text('site_name').notNull().default(''),
  operator: text('operator').notNull().default(''),
  location: text('location').notNull().default(''),
  city: text('city').notNull().default(''),
  state: text('state').notNull().default(''),
  country: text('country').notNull().default(''),
  plantingDate: text('planting_date').notNull().default(''),
  trialNotes: text('trial_notes').notNull().default(''),
  layoutLockedAt: text('layout_locked_at').notNull().default(''),
  /** Application-planning window (ISO dates; '' = not set). */
  startDate: text('start_date').notNull().default(''),
  endDate: text('end_date').notNull().default(''),
  /** Client-funded application-event count (null = no funding constraint). */
  fundedApplicationCount: integer('funded_application_count'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
})

// ---------------------------------------------------------------------------
// Application events (trial-side plan): one row per distinct planned/actual
// spraying date, labelled A, B, C… Completed events are historical evidence —
// schedule regeneration and rebasing never touch them.
// ---------------------------------------------------------------------------
export const applicationEvent = pgTable(
  'application_event',
  {
    id: serial('id').primaryKey(),
    trialId: integer('trial_id')
      .notNull()
      .references(() => trial.id, { onDelete: 'cascade' }),
    /** Monotonic creation counter (unique per trial); display order is by date. */
    sequence: integer('sequence').notNull(),
    /** A…Z then AA, AB…; frozen once the event is completed. */
    label: text('label').notNull().default(''),
    plannedDate: text('planned_date').notNull().default(''),
    actualDate: text('actual_date').notNull().default(''),
    actualStartTime: text('actual_start_time').notNull().default(''),
    actualEndTime: text('actual_end_time').notNull().default(''),
    /** planned | cancelled */
    planningStatus: text('planning_status').notNull().default('planned'),
    /** pending | completed | amended */
    executionStatus: text('execution_status').notNull().default('pending'),
    /** not_required | outstanding | uploaded */
    evidenceStatus: text('evidence_status').notNull().default('not_required'),
    /** Model-driven rules (GDD etc.) generate decision-required occurrences. */
    decisionRequired: boolean('decision_required').notNull().default(false),
    /** generated | manual | merge | split | migrated */
    createdFrom: text('created_from').notNull().default('generated'),
    rescheduleReason: text('reschedule_reason').notNull().default(''),
    operator: text('operator').notNull().default(''),
    sprayer: text('sprayer').notNull().default(''),
    forecastSnapshot: jsonb('forecast_snapshot'),
    actualWeather: jsonb('actual_weather'),
    preChecks: jsonb('pre_checks'),
    completionNotes: text('completion_notes').notNull().default(''),
    amendReason: text('amend_reason').notNull().default(''),
    /** Optimistic-concurrency version. */
    version: integer('version').notNull().default(1),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
  },
  (t) => [
    uniqueIndex('appevent_trial_seq').on(t.trialId, t.sequence),
    index('idx_appevent_trial').on(t.trialId),
  ]
)

/** One component occurrence inside an application event (which product lines are due). */
export const eventOccurrence = pgTable(
  'event_occurrence',
  {
    id: serial('id').primaryKey(),
    eventId: integer('event_id')
      .notNull()
      .references(() => applicationEvent.id, { onDelete: 'cascade' }),
    componentId: integer('component_id')
      .notNull()
      .references(() => treatmentComponent.id, { onDelete: 'restrict' }),
    treatmentId: integer('treatment_id')
      .notNull()
      .references(() => treatment.id, { onDelete: 'restrict' }),
    /** Planned-rate override for this occurrence only (null = component default). */
    plannedRateValue: real('planned_rate_value'),
    plannedRateUnit: text('planned_rate_unit').notNull().default(''),
    plannedOverrideReason: text('planned_override_reason').notNull().default(''),
    actualRateValue: real('actual_rate_value'),
    actualRateUnit: text('actual_rate_unit').notNull().default(''),
    deviationReason: text('deviation_reason').notNull().default(''),
    /** planned | cancelled | applied */
    status: text('status').notNull().default('planned'),
    /** Same-date but must-spray-separately sub-mix grouping (0 = main mix). */
    subMixIndex: integer('sub_mix_index').notNull().default(0),
    /** rule | manual */
    origin: text('origin').notNull().default('rule'),
  },
  (t) => [index('idx_occurrence_event').on(t.eventId)]
)

// ---------------------------------------------------------------------------
// Treatment mixes: per (event × treatment) spray-mix settings. One treatment =
// one separately prepared mix (never combined across treatments); all products
// in the mix share one water volume.
// ---------------------------------------------------------------------------
export const treatmentMix = pgTable(
  'treatment_mix',
  {
    id: serial('id').primaryKey(),
    eventId: integer('event_id')
      .notNull()
      .references(() => applicationEvent.id, { onDelete: 'cascade' }),
    treatmentId: integer('treatment_id')
      .notNull()
      .references(() => treatment.id, { onDelete: 'restrict' }),
    /** Shared water volume for the whole mix (null = derive from components/products). */
    waterVolumeLPerHa: real('water_volume_l_per_ha'),
    overageEnabled: boolean('overage_enabled').notNull().default(false),
    overagePct: real('overage_pct').notNull().default(0),
    waterIn: boolean('water_in').notNull().default(false),
    sprayer: text('sprayer').notNull().default(''),
    /** unconfirmed | confirmed | separate | not_confirmed */
    tankMixStatus: text('tank_mix_status').notNull().default('unconfirmed'),
    tankMixNotes: text('tank_mix_notes').notNull().default(''),
  },
  (t) => [uniqueIndex('mix_event_treatment').on(t.eventId, t.treatmentId)]
)

// ---------------------------------------------------------------------------
// Application documents: immutable versioned weigh-sheet snapshots with the
// two-person approval record. An approval applies only to the exact version
// reviewed; material input changes supersede it.
// ---------------------------------------------------------------------------
export const applicationDocument = pgTable(
  'application_document',
  {
    id: serial('id').primaryKey(),
    eventId: integer('event_id')
      .notNull()
      .references(() => applicationEvent.id, { onDelete: 'cascade' }),
    versionNumber: integer('version_number').notNull(),
    /** draft | awaiting_approval | returned | approved | superseded */
    status: text('status').notNull().default('draft'),
    /** Complete immutable input + calculation snapshot (renders the pack exactly). */
    snapshotJson: jsonb('snapshot_json').notNull(),
    /** Hash of the material inputs — mismatch with live data invalidates approval. */
    inputHash: text('input_hash').notNull().default(''),
    /** Printed reference + QR target, e.g. "ART-12-C-v2". */
    documentRef: text('document_ref').notNull().default(''),
    createdById: integer('created_by_id').references(() => appUser.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at').defaultNow(),
    firstCheckById: integer('first_check_by_id').references(() => appUser.id, { onDelete: 'set null' }),
    firstCheckAt: timestamp('first_check_at'),
    assignedApproverId: integer('assigned_approver_id').references(() => appUser.id, { onDelete: 'set null' }),
    approvedById: integer('approved_by_id').references(() => appUser.id, { onDelete: 'set null' }),
    approvedAt: timestamp('approved_at'),
    returnReason: text('return_reason').notNull().default(''),
    comments: text('comments').notNull().default(''),
    printedAt: timestamp('printed_at'),
    supersededAt: timestamp('superseded_at'),
  },
  (t) => [
    uniqueIndex('appdoc_event_version').on(t.eventId, t.versionNumber),
    uniqueIndex('appdoc_ref').on(t.documentRef),
    index('idx_appdoc_event').on(t.eventId),
  ]
)

// ---------------------------------------------------------------------------
// Uploaded signed evidence (blob references) for completed applications
// ---------------------------------------------------------------------------
export const evidenceFile = pgTable(
  'evidence_file',
  {
    id: serial('id').primaryKey(),
    eventId: integer('event_id')
      .notNull()
      .references(() => applicationEvent.id, { onDelete: 'cascade' }),
    documentId: integer('document_id').references(() => applicationDocument.id, {
      onDelete: 'set null',
    }),
    blobKey: text('blob_key').notNull().default(''),
    blobUrl: text('blob_url').notNull().default(''),
    fileName: text('file_name').notNull().default(''),
    mimeType: text('mime_type').notNull().default(''),
    sizeBytes: integer('size_bytes').notNull().default(0),
    evidenceType: text('evidence_type').notNull().default('signed_application'),
    uploadedById: integer('uploaded_by_id').references(() => appUser.id, { onDelete: 'set null' }),
    uploadedAt: timestamp('uploaded_at').defaultNow(),
    /** Set on the OLD file when a replacement is uploaded (history preserved). */
    replacedById: integer('replaced_by_id'),
  },
  (t) => [index('idx_evidence_event').on(t.eventId)]
)

// ---------------------------------------------------------------------------
// Application actuals (trial-side)
// ---------------------------------------------------------------------------
export const applicationActual = pgTable(
  'application_actual',
  {
    id: serial('id').primaryKey(),
    trialId: integer('trial_id')
      .notNull()
      .references(() => trial.id, { onDelete: 'cascade' }),
    timingCode: text('timing_code').notNull().default(''),
    actualDate: text('actual_date').notNull().default(''),
  },
  (t) => [uniqueIndex('appactual_trial_code').on(t.trialId, t.timingCode)]
)

// ---------------------------------------------------------------------------
// Properties (trial-side key/value metadata)
// ---------------------------------------------------------------------------
export const property = pgTable(
  'property',
  {
    id: serial('id').primaryKey(),
    trialId: integer('trial_id')
      .notNull()
      .references(() => trial.id, { onDelete: 'cascade' }),
    scope: text('scope').notNull().default('trial'),
    scopeRef: text('scope_ref').notNull().default(''),
    key: text('key').notNull().default(''),
    value: text('value').notNull().default(''),
  },
  (t) => [index('idx_property_scope').on(t.scope, t.scopeRef)]
)

// ---------------------------------------------------------------------------
// Plot
// ---------------------------------------------------------------------------
export const plot = pgTable(
  'plot',
  {
    id: serial('id').primaryKey(),
    trialId: integer('trial_id')
      .notNull()
      .references(() => trial.id, { onDelete: 'cascade' }),
    plotNumber: integer('plot_number').notNull(),
    rep: integer('rep').notNull(),
    block: integer('block').notNull().default(0),
    treatmentId: integer('treatment_id')
      .notNull()
      .references(() => treatment.id, { onDelete: 'cascade' }),
    mapRow: integer('map_row').notNull(),
    mapCol: integer('map_col').notNull(),
    excluded: boolean('excluded').notNull().default(false),
    excludeReason: text('exclude_reason').notNull().default(''),
  },
  (t) => [
    uniqueIndex('plot_trial_number').on(t.trialId, t.plotNumber),
    index('idx_plot_trial').on(t.trialId),
  ]
)

// ---------------------------------------------------------------------------
// Measurement headers (trial-side columns)
// ---------------------------------------------------------------------------
export const measurementHeader = pgTable(
  'measurement_header',
  {
    id: serial('id').primaryKey(),
    trialId: integer('trial_id')
      .notNull()
      .references(() => trial.id, { onDelete: 'cascade' }),
    partMeasured: text('part_measured').notNull().default(''),
    measurementType: text('measurement_type').notNull().default(''),
    measurementUnit: text('measurement_unit').notNull().default(''),
    applicationRef: text('application_ref').notNull().default(''),
    daysAfter: integer('days_after'),
    timing: text('timing').notNull().default(''),
    description: text('description').notNull().default(''),
    ordinal: integer('ordinal').notNull().default(0),
    origin: text('origin').notNull().default('site'),
    locked: boolean('locked').notNull().default(false),
    analyze: boolean('analyze').notNull().default(true),
    subsamples: integer('subsamples').notNull().default(1),
    formula: text('formula').notNull().default(''),
    measurementDate: text('measurement_date').notNull().default(''),
    assessedBy: text('assessed_by').notNull().default(''),
    growthStage: text('growth_stage').notNull().default(''),
  },
  (t) => [index('idx_header_trial').on(t.trialId)]
)

// ---------------------------------------------------------------------------
// Measurement values
// ---------------------------------------------------------------------------
export const measurementValue = pgTable(
  'measurement_value',
  {
    measurementHeaderId: integer('measurement_header_id')
      .notNull()
      .references(() => measurementHeader.id, { onDelete: 'cascade' }),
    plotId: integer('plot_id')
      .notNull()
      .references(() => plot.id, { onDelete: 'cascade' }),
    subsample: integer('subsample').notNull().default(1),
    value: real('value'),
  },
  (t) => [
    primaryKey({
      columns: [t.measurementHeaderId, t.plotId, t.subsample],
    }),
  ]
)

// ---------------------------------------------------------------------------
// Analysis results (cached)
// ---------------------------------------------------------------------------
export const analysisResult = pgTable('analysis_result', {
  id: serial('id').primaryKey(),
  measurementHeaderId: integer('measurement_header_id')
    .notNull()
    .references(() => measurementHeader.id, { onDelete: 'cascade' }),
  engineVersion: text('engine_version').notNull().default(''),
  paramsJson: text('params_json').notNull().default('{}'),
  resultJson: text('result_json').notNull().default('{}'),
  createdAt: timestamp('created_at').defaultNow(),
})

// ---------------------------------------------------------------------------
// Audit log
// ---------------------------------------------------------------------------
export const auditLog = pgTable('audit_log', {
  id: serial('id').primaryKey(),
  trialId: integer('trial_id').references(() => trial.id, {
    onDelete: 'set null',
  }),
  protocolId: integer('protocol_id').references(() => protocol.id, {
    onDelete: 'set null',
  }),
  ts: timestamp('ts').defaultNow(),
  actor: text('actor').notNull().default(''),
  role: text('role').notNull().default(''),
  action: text('action').notNull().default(''),
  entity: text('entity').notNull().default(''),
  summary: text('summary').notNull().default(''),
  detail: text('detail').notNull().default('{}'),
  /** Application-document version this entry relates to, where applicable. */
  documentVersion: integer('document_version'),
  /** User-supplied reason, where the action requires one. */
  reason: text('reason').notNull().default(''),
  /** Bounded field-level before/after diffs (not full entity dumps). */
  beforeJson: jsonb('before_json'),
  afterJson: jsonb('after_json'),
})

// ---------------------------------------------------------------------------
// App users (identity only — roles come from Entra app-role claims; this table
// exists for FKs, notifications, and audit attribution)
// ---------------------------------------------------------------------------
export const appUser = pgTable(
  'app_user',
  {
    id: serial('id').primaryKey(),
    email: text('email').notNull(),
    name: text('name').notNull().default(''),
    /** Entra object id (oid claim), for durable identity across email changes. */
    entraOid: text('entra_oid').notNull().default(''),
    /**
     * ART application role, owned here rather than derived from an identity
     * provider — one of 'preparer' | 'research_manager' | 'admin' (see
     * @shared/roles). Authentication comes from STRI Suite; authorization is
     * this column, looked up by email. Managed by an ART admin.
     */
    role: text('role').notNull().default('preparer'),
    active: boolean('active').notNull().default(true),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
  },
  (t) => [uniqueIndex('app_user_email').on(t.email)]
)

// ---------------------------------------------------------------------------
// In-app notifications (approval requests, returns, outstanding evidence)
// ---------------------------------------------------------------------------
export const notification = pgTable(
  'notification',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id')
      .notNull()
      .references(() => appUser.id, { onDelete: 'cascade' }),
    type: text('type').notNull().default(''),
    payloadJson: jsonb('payload_json'),
    readAt: timestamp('read_at'),
    createdAt: timestamp('created_at').defaultNow(),
  },
  (t) => [index('idx_notification_user').on(t.userId)]
)

// ---------------------------------------------------------------------------
// Library terms (curated vocabulary)
// ---------------------------------------------------------------------------
export const libraryTerm = pgTable(
  'library_term',
  {
    id: serial('id').primaryKey(),
    category: text('category').notNull(),
    value: text('value').notNull(),
    label: text('label').notNull().default(''),
    useCount: integer('use_count').notNull().default(0),
    crops: text('crops').notNull().default(''),
  },
  (t) => [uniqueIndex('libterm_cat_val').on(t.category, t.value)]
)
