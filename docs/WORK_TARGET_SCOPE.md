# Work targets (2026-09-29)

## Record ownership

- New work uses the existing `fieldWorks` collection and `workId`.
- `targetScope` is `field` or `offField`. Missing legacy scope means `field`;
  an empty target array alone never means off-field work.
- Explicit off-field work has no field IDs, batch targets, field time allocations,
  herbicide links or field growth/harvest snapshots.
- Existing `otherWorks` keep their IDs, quantities, varieties and optional related
  fields. They remain editable through their original form, without copying or
  migrating them into `fieldWorks`.
- Existing planting/heading/water-linked records cannot change to off-field;
  rejecting that save preserves their derived field records atomically.

## Entry and review

- Home record entry: work, then field cards/group/all or off-field.
- The work form also offers an explicit scope switch. Off-field hides field
  selection and field-weather defaults. Other work names support free text.
- Schedules use the same target choices. Field schedules retain existing
  per-field batch semantics; off-field schedules are one targetless record.
- Calendar and date-sheet completion open a record form, not silent completion.
- Review top has all/field/off-field work filters. Off-field records are excluded
  from individual field histories and biological/water status calculations.
- Calendar and today's records include old `otherWorks` without duplication.

## Verification

- `tools/verify_work_target_scope.js`: normalization, target validation,
  schedule isolation, persistence, linked-record safeguards.
- `tools/verify_off_field_views.js`: calendar/review and legacy edit paths.
- `tools/check_off_field_mobile.cjs`: isolated Chrome profile, local fixture
  server on port 4182, 360px/390px entry/edit/schedule/completion/delete/cancel,
  group selection and arbitrary field-card selection. Screenshots are written
  under the OS temporary directory `rice-off-field-qa`, never into user records.
- Existing verification scripts remain required. This change is not pushed.

## Verified result

On 2026-09-29 all 31 verification scripts passed. Primary independently ran
isolated Chrome at 360px and 390px: selected two fields, changed to off-field,
saved without field IDs, edited through review, registered/completed off-field
schedules from both date sheet and calendar (including a custom title), cancelled
then accepted deletion, selected all three Kameishi fixture fields, and saved
two arbitrarily selected field schedules. Horizontal overflow checks passed.
Final screenshot replay confirmed two-column field cards and neutral work-form
heading. Separate review found and prompted fixes for custom-name loss, calendar
completion bypassing entry, and re-editing a literal Other name.
No production browser profile or farm records were read or modified.

On 2026-09-30 primary reran all 31 scripts and diff checks successfully.
Independent final review confirmed the literal Other edit/prefill fix and reran
the scope, view and harvest-review tests (50 harvest-review cases). No remaining
blockers were identified within the changed scope. Still uncommitted/unpushed.
