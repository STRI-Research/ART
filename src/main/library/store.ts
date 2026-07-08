import Database from 'better-sqlite3'
import { isCropScoped } from '@shared/types.js'
import type {
  LibraryCategory,
  SuggestHit,
  PersonalTerm,
  LibraryExport
} from '@shared/types.js'
import type { TermRef } from './extract.js'

/**
 * The author's personal, machine-level library (app userData). It accretes from usage —
 * every coded value typed on a protocol is recorded here — and each term remembers the
 * crops it's been used on (`term_crop`), which gives implicit crop-scoping: suggestions are
 * ranked by how much a term has been used on the current crop, then overall popularity.
 *
 * Electron-free (the db path is supplied) so it is unit-testable; a thin caller resolves the
 * userData path and calls `open()` on app startup.
 */
let db: Database.Database | null = null

export function open(path: string): void {
  close()
  db = new Database(path)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  db.exec(`
    CREATE TABLE IF NOT EXISTS term (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      category     TEXT NOT NULL,
      value        TEXT NOT NULL,
      label        TEXT NOT NULL DEFAULT '',
      use_count    INTEGER NOT NULL DEFAULT 0,
      last_used_at TEXT NOT NULL DEFAULT '',
      UNIQUE (category, value)
    );
    CREATE TABLE IF NOT EXISTS term_crop (
      term_id   INTEGER NOT NULL REFERENCES term(id) ON DELETE CASCADE,
      crop      TEXT NOT NULL,
      use_count INTEGER NOT NULL DEFAULT 0,
      UNIQUE (term_id, crop)
    );
  `)
}

export function close(): void {
  if (db) db.close()
  db = null
}

export function isOpen(): boolean {
  return db !== null
}

function requireDb(): Database.Database {
  if (!db) throw new Error('Personal library is not open')
  return db
}

const RANK = { crop: 10, freq: 3 }

/**
 * Record that these terms were used (once per document — the caller passes only terms newly
 * referenced by the document). Bumps overall usage and, when a crop is given, the per-crop count.
 */
export function recordUsage(entries: TermRef[], crop = ''): void {
  if (entries.length === 0) return
  const d = requireDb()
  const now = new Date().toISOString()
  const upsertTerm = d.prepare(
    `INSERT INTO term (category, value, label, use_count, last_used_at)
     VALUES (@category, @value, '', 1, @now)
     ON CONFLICT (category, value) DO UPDATE SET use_count = use_count + 1, last_used_at = @now`
  )
  const getId = d.prepare('SELECT id FROM term WHERE category = ? AND value = ?')
  const bumpCrop = d.prepare(
    `INSERT INTO term_crop (term_id, crop, use_count) VALUES (?, ?, 1)
     ON CONFLICT (term_id, crop) DO UPDATE SET use_count = use_count + 1`
  )
  const tx = d.transaction(() => {
    for (const e of entries) {
      upsertTerm.run({ category: e.category, value: e.value, now })
      // General vocabularies (crop, unit) apply to all crops — don't track per-crop usage.
      if (crop && isCropScoped(e.category)) {
        const { id } = getId.get(e.category, e.value) as { id: number }
        bumpCrop.run(id, crop)
      }
    }
  })
  tx()
}

/** Ranked suggestions for a category, biased toward the current crop (implicit scope). */
export function suggest(category: LibraryCategory, query = '', crop = '', limit = 20): SuggestHit[] {
  const d = requireDb()
  // General vocabularies (crop, unit) apply to all crops — rank by usage only, ignore the crop.
  const cropCtx = isCropScoped(category) ? crop : ''
  const like = `%${query.trim().toLowerCase()}%`
  const rows = d
    .prepare(
      `SELECT t.value AS value, t.label AS label,
         COALESCE(tc.use_count, 0) * @wcrop + t.use_count * @wfreq AS score
       FROM term t
       LEFT JOIN term_crop tc ON tc.term_id = t.id AND tc.crop = @crop
       WHERE t.category = @category
         AND (@q = '' OR lower(t.value) LIKE @like OR lower(t.label) LIKE @like)
       ORDER BY score DESC, t.last_used_at DESC, t.value
       LIMIT @limit`
    )
    .all({
      category,
      crop: cropCtx,
      q: query.trim(),
      like,
      wcrop: RANK.crop,
      wfreq: RANK.freq,
      limit
    }) as { value: string; label: string }[]
  return rows.map((r) => ({ value: r.value, label: r.label }))
}

/** The label for a term, or '' if unknown — used to fill the per-project snapshot. */
export function labelFor(category: LibraryCategory, value: string): string {
  const d = requireDb()
  const r = d.prepare('SELECT label FROM term WHERE category = ? AND value = ?').get(category, value) as
    | { label: string }
    | undefined
  return r?.label ?? ''
}

// --- Management (Library tab) ----------------------------------------------
export function list(category?: LibraryCategory): PersonalTerm[] {
  const d = requireDb()
  const rows = (
    category
      ? d.prepare('SELECT * FROM term WHERE category = ? ORDER BY use_count DESC, value').all(category)
      : d.prepare('SELECT * FROM term ORDER BY category, use_count DESC, value').all()
  ) as Record<string, unknown>[]
  const crops = d.prepare('SELECT crop FROM term_crop WHERE term_id = ? ORDER BY use_count DESC')
  return rows.map((r) => ({
    id: r.id as number,
    category: r.category as LibraryCategory,
    value: r.value as string,
    label: r.label as string,
    useCount: r.use_count as number,
    crops: (crops.all(r.id) as { crop: string }[]).map((c) => c.crop)
  }))
}

export function updateLabel(id: number, label: string): void {
  requireDb().prepare('UPDATE term SET label = ? WHERE id = ?').run(label, id)
}

/**
 * Rename a term's value. If the new value already exists in the same category, merge into it
 * (sum usage, union per-crop counts) and drop the renamed row — so renaming to consolidate a
 * duplicate just works. Does not rewrite values already stored in existing protocols.
 */
export function rename(id: number, value: string): void {
  const d = requireDb()
  const next = value.trim()
  const row = d.prepare('SELECT category, value FROM term WHERE id = ?').get(id) as
    | { category: string; value: string }
    | undefined
  if (!row || !next || next === row.value) return
  const target = d.prepare('SELECT id FROM term WHERE category = ? AND value = ?').get(row.category, next) as
    | { id: number }
    | undefined

  if (!target) {
    d.prepare('UPDATE term SET value = ? WHERE id = ?').run(next, id)
    return
  }
  // Merge the renamed term into the existing one.
  const tx = d.transaction(() => {
    d.prepare('UPDATE term SET use_count = use_count + (SELECT use_count FROM term WHERE id = @from) WHERE id = @to').run(
      { from: id, to: target.id }
    )
    for (const c of d.prepare('SELECT crop, use_count FROM term_crop WHERE term_id = ?').all(id) as {
      crop: string
      use_count: number
    }[]) {
      d.prepare(
        `INSERT INTO term_crop (term_id, crop, use_count) VALUES (@to, @crop, @n)
         ON CONFLICT (term_id, crop) DO UPDATE SET use_count = use_count + @n`
      ).run({ to: target.id, crop: c.crop, n: c.use_count })
    }
    d.prepare('DELETE FROM term WHERE id = ?').run(id)
  })
  tx()
}

export function remove(id: number): void {
  requireDb().prepare('DELETE FROM term WHERE id = ?').run(id)
}

// --- Import / export -------------------------------------------------------
export function exportLibrary(): LibraryExport {
  const terms = list().map((t) => ({
    category: t.category,
    value: t.value,
    label: t.label,
    crops: t.crops
  }))
  return { version: 1, exportedAt: new Date().toISOString(), terms }
}

/** Merge an imported library — never overwrites: fills empty labels, unions crops, bumps usage. */
export function importLibrary(payload: LibraryExport): { added: number; updated: number } {
  const d = requireDb()
  const now = new Date().toISOString()
  const upsert = d.prepare(
    `INSERT INTO term (category, value, label, use_count, last_used_at)
     VALUES (@category, @value, @label, 1, @now)
     ON CONFLICT (category, value) DO UPDATE SET
       label = CASE WHEN term.label = '' THEN excluded.label ELSE term.label END,
       use_count = term.use_count + 1,
       last_used_at = @now`
  )
  const existed = d.prepare('SELECT 1 FROM term WHERE category = ? AND value = ?')
  const getId = d.prepare('SELECT id FROM term WHERE category = ? AND value = ?')
  const bumpCrop = d.prepare(
    `INSERT INTO term_crop (term_id, crop, use_count) VALUES (?, ?, 1)
     ON CONFLICT (term_id, crop) DO UPDATE SET use_count = use_count + 1`
  )
  let added = 0
  let updated = 0
  const tx = d.transaction(() => {
    for (const t of payload.terms) {
      const value = (t.value ?? '').trim()
      if (!value) continue
      const wasThere = !!existed.get(t.category, value)
      upsert.run({ category: t.category, value, label: t.label ?? '', now })
      if (wasThere) updated++
      else added++
      const { id } = getId.get(t.category, value) as { id: number }
      for (const crop of t.crops ?? []) if (crop) bumpCrop.run(id, crop)
    }
  })
  tx()
  return { added, updated }
}
