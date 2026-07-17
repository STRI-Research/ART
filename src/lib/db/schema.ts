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
} from 'drizzle-orm/pg-core'

// ---------------------------------------------------------------------------
// Auth (NextAuth adapter tables)
// ---------------------------------------------------------------------------
export const users = pgTable('user', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  name: text('name'),
  email: text('email').unique(),
  emailVerified: timestamp('emailVerified', { mode: 'date' }),
  image: text('image'),
})

export const accounts = pgTable(
  'account',
  {
    userId: text('userId')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    type: text('type').notNull(),
    provider: text('provider').notNull(),
    providerAccountId: text('providerAccountId').notNull(),
    refresh_token: text('refresh_token'),
    access_token: text('access_token'),
    expires_at: integer('expires_at'),
    token_type: text('token_type'),
    scope: text('scope'),
    id_token: text('id_token'),
    session_state: text('session_state'),
  },
  (t) => [primaryKey({ columns: [t.provider, t.providerAccountId] })]
)

export const sessions = pgTable('session', {
  sessionToken: text('sessionToken').primaryKey(),
  userId: text('userId')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  expires: timestamp('expires', { mode: 'date' }).notNull(),
})

export const verificationTokens = pgTable(
  'verificationToken',
  {
    identifier: text('identifier').notNull(),
    token: text('token').notNull(),
    expires: timestamp('expires', { mode: 'date' }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.identifier, t.token] })]
)

// ---------------------------------------------------------------------------
// Protocol
// ---------------------------------------------------------------------------
export const protocol = pgTable('protocol', {
  id: serial('id').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
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
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
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
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
})

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
})

// ---------------------------------------------------------------------------
// Library terms (per-user curated vocabulary)
// ---------------------------------------------------------------------------
export const libraryTerm = pgTable(
  'library_term',
  {
    id: serial('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    category: text('category').notNull(),
    value: text('value').notNull(),
    label: text('label').notNull().default(''),
    useCount: integer('use_count').notNull().default(0),
    crops: text('crops').notNull().default(''),
  },
  (t) => [uniqueIndex('libterm_user_cat_val').on(t.userId, t.category, t.value)]
)
