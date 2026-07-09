# Design principles

ART exists because the incumbent tools in this space grew, one reasonable request at a time,
into walls of mostly-empty form fields — site descriptions with hundreds of boxes for soil
texture, nozzle type, wind speed per application, each added for *someone* and rendered for
*everyone*. That wasn't bad taste; it was structural: the only way those tools could say yes
to a metadata request was to add a column and a form control, and no field was ever removed.

This document is the gate that keeps ART from the same fate. It is short on purpose. When a
change request arrives shaped as "add a field for X", the answer comes from here.

## The consumer test

**A field earns a dedicated box only if the software itself consumes it.**

"Consumes" means an ART feature *reads the value and does something with it*: the randomizer,
the analysis engine, the trial map, data entry, or the report. Everything in the schema today
passes this test — design/replicates/block size feed R, treatments feed the ANOVA, plot
dimensions feed the map, assessment definitions feed data entry and analysis.

A field that exists only so a human can read it back later is not a box; it is a note.

## Corollaries

- **Notes over boxes.** Context that only a human will ever read belongs in the freeform
  `notes` / `trial_notes` fields. A dedicated box implies the software will act on the value;
  if it won't, the box is a lie.

- **Vocabulary over schema.** The coded-field library (`library_term` + the crop-ranked
  comboboxes) is the deliberate inversion of the incumbent approach: instead of shipping
  thousands of predefined codes and empty slots, ART's vocabulary accretes from what each
  user actually types, and a document carries only the snapshot of terms it uses. When
  someone needs to record a *kind* of thing ART doesn't predefine, extend the vocabulary —
  not the schema.

- **Import or attach, never transcribe.** If the data already exists in a machine somewhere
  (weather stations, GPS, lab exports), the feature is an import or an attachment, not a form
  for a human to re-key it into.

- **The blankness heuristic.** If a proposed field would be empty in more than half of real
  project files, it doesn't get a box.

- **Compliance is a log, not a form.** The append-only `audit_log` provides attribution and
  traceability mechanically, without asking the user to fill anything in. When a compliance
  request arrives shaped as "add these N fields", ask what the audit actually needs to
  *verify*, and capture that automatically.

## The triage ladder

A request for a new field that cannot name its software consumer gets triaged down this
ladder, stopping at the first rung that fits:

1. **Note** — humans-only context goes in an existing freeform field.
2. **Library term** — a new *kind* of coded value goes in the personal library.
3. **Generic property** — if pressure for ad-hoc site/trial metadata ever mounts, the
   structural answer is one key/value property mechanism (keys backed by the library),
   not new columns. One mechanism absorbs unbounded variety.
4. **Import / attachment** — data that exists elsewhere gets linked or imported.

Only a field that a feature genuinely consumes graduates to real schema — and it should be
added *when* that feature ships, not speculatively.

## Known danger zones

- **Trial-format import/export.** Reading third-party trial files will create pressure to
  mirror their site-description schema field-for-field so nothing is "lost". Don't: map
  foreign metadata into notes or generic properties on import, and promote a field to real
  schema only when an ART feature consumes it.

- **Summary-across-trials.** Multi-trial analysis will eventually want covariates (location,
  year, environment). That is the consumer test working as intended: when the combined
  analysis genuinely uses a value as a factor, that field has earned structure. Add it then.
