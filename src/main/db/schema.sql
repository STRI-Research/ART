-- Open ARM project schema. One SQLite file == one project (protocol + trial + data).
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS meta (
  key   TEXT PRIMARY KEY,
  value TEXT
);

CREATE TABLE IF NOT EXISTS protocol (
  id           INTEGER PRIMARY KEY CHECK (id = 1), -- single protocol per project file
  title        TEXT NOT NULL DEFAULT '',
  crop         TEXT NOT NULL DEFAULT '',
  target_pest  TEXT NOT NULL DEFAULT '',
  objective    TEXT NOT NULL DEFAULT '',
  investigator TEXT NOT NULL DEFAULT '',
  season       TEXT NOT NULL DEFAULT '',
  notes        TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS treatment (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  number    INTEGER NOT NULL,
  name      TEXT NOT NULL DEFAULT '',
  product   TEXT NOT NULL DEFAULT '',
  rate      TEXT NOT NULL DEFAULT '',
  rate_unit TEXT NOT NULL DEFAULT '',
  type      TEXT NOT NULL DEFAULT '',
  UNIQUE (number)
);

CREATE TABLE IF NOT EXISTS application (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  timing_code  TEXT NOT NULL DEFAULT '',
  description  TEXT NOT NULL DEFAULT '',
  planned_date TEXT NOT NULL DEFAULT '',
  growth_stage TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS trial (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  protocol_id INTEGER NOT NULL DEFAULT 1 REFERENCES protocol(id) ON DELETE CASCADE,
  design      TEXT NOT NULL CHECK (design IN ('RCB', 'CRD')),
  replicates  INTEGER NOT NULL,
  plot_rows   INTEGER NOT NULL,
  plot_cols   INTEGER NOT NULL,
  plot_width  REAL NOT NULL DEFAULT 0,
  plot_length REAL NOT NULL DEFAULT 0,
  seed        INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS plot (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  trial_id     INTEGER NOT NULL REFERENCES trial(id) ON DELETE CASCADE,
  plot_number  INTEGER NOT NULL,
  rep          INTEGER NOT NULL,
  treatment_id INTEGER NOT NULL REFERENCES treatment(id) ON DELETE CASCADE,
  map_row      INTEGER NOT NULL,
  map_col      INTEGER NOT NULL,
  UNIQUE (trial_id, plot_number)
);
CREATE INDEX IF NOT EXISTS idx_plot_trial ON plot(trial_id);

CREATE TABLE IF NOT EXISTS assessment_header (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  trial_id    INTEGER NOT NULL REFERENCES trial(id) ON DELETE CASCADE,
  part_rated  TEXT NOT NULL DEFAULT '',
  rating_type TEXT NOT NULL DEFAULT '',
  rating_unit TEXT NOT NULL DEFAULT '',
  timing      TEXT NOT NULL DEFAULT '',
  rating_date TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  ordinal     INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_header_trial ON assessment_header(trial_id);

CREATE TABLE IF NOT EXISTS assessment_value (
  assessment_header_id INTEGER NOT NULL REFERENCES assessment_header(id) ON DELETE CASCADE,
  plot_id              INTEGER NOT NULL REFERENCES plot(id) ON DELETE CASCADE,
  value                REAL,
  PRIMARY KEY (assessment_header_id, plot_id)
);

CREATE TABLE IF NOT EXISTS analysis_result (
  id                   INTEGER PRIMARY KEY AUTOINCREMENT,
  assessment_header_id INTEGER NOT NULL REFERENCES assessment_header(id) ON DELETE CASCADE,
  engine_version       TEXT NOT NULL DEFAULT '',
  params_json          TEXT NOT NULL DEFAULT '{}',
  result_json          TEXT NOT NULL DEFAULT '{}',
  created_at           TEXT NOT NULL DEFAULT (datetime('now'))
);
