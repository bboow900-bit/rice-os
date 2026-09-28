# Audit follow-up: 2026-09-15

Scope: incremental corrections after the whole-app audit. No redesign,
schema migration, user-data operation, commit, or push in this stage.
Preserve all pre-existing working-tree changes.

## Stage 1

- Record entry: group selection must never fall back to an individual field
  when the group is blank, missing, or empty. Clearing the individual field
  must not restore a stale selection. Valid groups retain their field IDs.
- Schedule entry: apply the same no-fallback rule to group targets.
- JSON merge: include meta.nextSeasonIdeas, preserving current records with
  the same ideaId and adding new IDs only. Repeated imports must not duplicate
  ideas. Do not modify source objects or save during inspection/cancellation.

Implementation: assets/js/screens/bottom-sheet.js and assets/js/core/storage.js.
Regression coverage: tools/verify_first_stage_audit.js.

Primary verification: all 21 tools/verify_*.js scripts passed after the patch;
both changed production JS files passed node --check; git diff --check passed.
These checks use isolated test data, not the user's browser storage.

Roles: implementation agent; separate data-safety/interaction auditor;
primary integration and test review. No agronomy rules change.
Browser interaction and 360px/390px visual verification remain pending because
the browser control tool is unavailable in this turn. VM/handler checks do not
substitute for that release gate. Do not mark this stage as phone-verified.

## Stage 2: water reopening

Implemented in core/state.js and verified in tools/verify_water_schedule_links.js:
clearing an actual end date restores only schedules whose completion link matches
the same record kind, ID, and end event. Start, unrelated, and manual completions
remain unchanged. Re-completion and persistence are covered. Independent audit
also checked failed-save rollback. Annual editing retains its existing confirmation.

## Management and field-area follow-up (2026-09-16/17)

- Materials: retain existing edit/update/cancel; add confirmed deletion of unused
  entries. Exact-ID references in records, plans, and nested metadata block deletion.
- Recipes/transplanter settings: retain inline updates; add confirmed deletion
  of unused custom varieties. Built-in varieties cannot be deleted because schema
  normalization restores them. No cascading deletion of historical records.
- Fields: restore global active/planted area in a and ha plus field count. Exclude
  paused, fallow, and ended fields; group/search filtering never changes this total.
  Existing normalization maps unknown areas to zero, so zero and unknown must be
  labelled together rather than claiming that they remain distinguishable.
- Added handler/data regressions: verify_master_crud.js and
  verify_fields_active_area.js. Material-carte click mocks now match selectors
  correctly, preserving existing edit/cancel assertions.
- Review corrections implemented: reject explicitly blank material names while
  preserving omitted names in partial updates; area summaries now label zero
  and missing together and are tested with real schema-normalized fixtures.
- Primary reran all 23 verification scripts on 2026-09-17: all passed.

Machine edit, maintenance deletion, and retirement already have UI paths. They
have not all been browser-verified in this follow-up. Herbicide program and
observation history CRUD remains a separate incomplete audit item. Do not describe
all management screens as fully fixed.

Windows browser automation was stopped because the current URL could not be
verified safely. No smartphone screenshots or actual browser action verification
were completed for these UI changes. No production data was edited or deleted.
No push or PWA version bump has been made.

## Remaining audit corrections

1. Actual-browser verification of Outlook corrections below.
2. Herbicide program/observation history CRUD mobile verification.

Each correction needs a focused regression case before release. Existing
automated suites passing does not prove these untested transitions are safe.

## Historical water status (2026-09-17)

core/agro.js managementStatus now selects a movement covering the requested
date, including both start and end boundaries. Future and invalid movements
cannot supply the phase. At shared boundaries the latest start/creation wins.
Gaps show the parent management method, without an invented movement phase.
Home, fields, and irrigation already call this shared function; no caller,
schema, persisted record, or UI layout was changed.

tools/verify_water_status_as_of.js covers 13 isolated cases for intermittent and
saturated water, boundaries, gaps, invalid/future dates, today, and unchanged
parent planned/completed/overlap states. Primary reran all 24 verification
scripts successfully. No actual browser verification or push in this stage.

## Growth candidate corrections (2026-09-20)

core/state.js now reconciles derived heading candidates when their growth log is
edited. Clearing panicle evidence removes its candidate. Moving/redating keeps
one source-owned candidate and refreshes its estimate. Withdrawing/moving an
explicit heading confirmation falls back to another same-field/year explicit
observation, or clears the actual link. Manual stage selection is not evidence
of an observed heading. Save and delete share link reconciliation.

tools/verify_growth_candidate_corrections.js exercises source removal, date and
field/year changes, fallback, dismissed status, selected batch edits, failed-save
rollback, and reload persistence. Primary reran all 25 verification scripts:
all passed. No schema migration, UI redesign, production data operation, or push.
Existing stored stale candidates are not bulk rewritten on load; this change
reconciles candidates through subsequent record save/delete operations.

Independent audit found a nonheading-candidate scope leak. Save/delete now guard
candidateType explicitly; imported harvest actual links and fertilizer basis
links are preserved, with regression coverage and all 25 checks rerun passing.
Degraded loading without the agro estimator remains a hardening candidate;
normal index/mobile entry points load it before use.

## Outlook corrections (2026-09-20; review pending)

core/outlook.js compares the prior heading month/day in the current heading
year, not absolute dates a year apart. February 29 maps to February 28 in a
non-leap comparison year. Invalid dates yield no difference. Predictions and
stored snapshots are not rewritten.

screens/outlook.js resetNavigation now clears selection, rerenders the list,
and synchronizes the back button. Layout and explicit snapshot saving unchanged.
tools/verify_outlook_audit_fixes.js covers seasonal differences, invalid/leap
dates, list reset, back state, and absence of snapshot writes in isolated VM.

Both assigned agents stopped at the usage limit before editing. Primary applied
these narrow fixes and tests. Independent audit and real browser/mobile checks
remain mandatory before release. This is not a fully verified completion.
No push or version bump.

## Follow-up: Outlook and herbicide CRUD (2026-09-20)

Independent Outlook review found that resetNavigation started weather requests
through render, including while leaving the screen. render now accepts
skipWeather for navigation resets only. The added location-present regression
checks zero requests on reset and two on ordinary render. Independent re-review
passed; actual browser navigation remains unverified.

Herbicide management now offers confirmed deletion of unused program templates.
References in annual assignments (including superseded assignments) and other
stored programId/programIds links block deletion. Observation deletion removes
only the selected observation, leaving assignments and work records unchanged.
Stale program edit IDs cannot open a new-record form. Existing edit flows remain.

tools/verify_herbicide_crud.js tests actual module handlers in isolated storage:
stable IDs, stale edits, historical protection, confirmation cancellation,
failed-save rollback, deletion scope and reload persistence. Primary reran all
27 verification scripts successfully. Herbicide independent review passed,
including cancellation, failed-save UI/data retention, and stale ID rejection.

Browser attempt initially failed because fixture server port 4182 was not
running. Started the existing loopback-only fixture server. Selecting the failed
tab was then blocked by Browser Use URL policy for its generated error page;
no bypass attempted. No actual UI or 360/390px checks completed in this attempt.
Real farm data was not accessed or changed. No push or version bump.

## Browser verification and group selection (2026-09-21)

Restarted the loopback-only fixture server and opened its existing test origin.
At 360x800, personally verified fields total 72 a / 0.72 ha, eight fields and
five zero/unset areas. Screenshot inspected: summary wraps within the screen.
Group selection exposed a real defect: Kameishi filtered three cards but the
select reverted visually to all groups. Unassigned empty values also fell back
to all. Worker fixed selected options and retained empty values in fields.js;
verify_fields_group_selection.js covers redraw, unassigned and search behavior.
Independent review also caught stale selection when the selected group disappears.
Rendering now resets unavailable selections to all before building options/cards.
Added deleted-group, empty-group and unassigned-option-disappearance regressions.
Primary reran all 28 verification scripts successfully after this correction.
Independent final re-review passed with no additional findings in this scope.

Actual Outlook path: bottom Outlook tab -> fixture field detail -> bottom
Outlook tab again. Detail hidden and list combobox visible: passed.
Actual material path: Management -> materials -> create test material
"動作確認用資材0921" -> edit -> update to "動作確認用資材0921更新済".
Updated record visibly present without an extra card. Delete click timed out
at Input.dispatchMouseEvent; subsequent dialog and screenshot reads timed out.
No confirmed delete action was sent. Cancellation/deletion outcome unverified.
Temporary viewport override reset successfully. No browser data resets or
production record operations. Fixture material retained for future checks.

Remaining: post-fix group browser replay, CRUD cancellation/deletion,
herbicide UI and 390px checks. No push or version bump.

## Mobile replay and herbicide row layout (2026-09-22)

Actual browser replay after reload confirmed Kameishi selected with three
matching cards at 390px, then unassigned selected with one fixture field.
Global area remained 72 a / 0.72 ha throughout. Page had no horizontal overflow.
Material edit cancellation restored the add mode and retained the previously
saved name. This does not establish deletion-dialog cancellation.

Created a fixture-only herbicide program named
"検証専用・長い名称の除草体系0922" with one initial step, opened edit,
changed its name without saving, and cancelled. Original program remained and
the edit form closed. Reload later retained the saved original program.

Real screenshot inspection found edit/delete text wrapping one character per
line beside long program names. Limited app.css herbicide-program-row to a
two-column grid: full-width name above, action buttons below, 44px minimum
height and nowrap labels. No persistence logic changed. Independent CSS audit
passed. Parent inspected screenshots after reload at 390x844 and 360x800;
labels stayed horizontal with no overlap. scrollWidth equalled clientWidth
(375 and 345 respectively, excluding the 15px vertical scrollbar).
All 28 verification scripts passed. Existing farm data was not accessed.

Deletion confirmation/accept/cancel through the browser remains unverified
following the previous dialog transport timeouts. Do not describe CRUD browser
verification or the release gate as fully complete. No push or version bump.

## Update backup failure gate (2026-09-27)

Resumed the worker's pending patch and inspected the actual diff. app.js now
requires an available backup helper returning exactly true before update;
missing/non-callable helpers and thrown errors stop with the failure message.
storage.backupBeforeAppUpdate now reads the primary storage key inside its own
try/catch so read failures cannot masquerade as absent data. A genuinely absent
key still permits first-use update; empty/corrupt content fails closed.

verify_update_backup_failures.js executes the real app event-binding block and
storage module in isolated storage. Thirteen scenarios passed: normal backup,
read/write failures, missing storage/helper, invalid helper, exception, undefined
result, empty/corrupt payload, absent key, cancellation, and reload fallback.
Assertions check that current data is unchanged and backup precedes navigation.
Primary reran all 29 verification scripts and git diff --check successfully.
Independent audit found release-history reads could still fail open. The backup
writer now reads history strictly: only an absent key means empty history;
read exceptions, malformed JSON, non-array payloads and invalid entries return
false without overwriting history. Display-only history reads are unchanged.
Expanded to 27 update scenarios, including history preservation, duplicates,
empty arrays and quota fallback. When saving only the newest generation succeeds,
the existing capacity fallback still permits update; not every quota error stops
it. Primary reran all 29 verification scripts successfully after this patch.
Independent final re-review passed with no further findings. The reviewer also
checked 12 isolated cases for old-version load/save: failed backup leaves
stored data untouched, normal migration works, and quota fallback is preserved.
No production data operations or push.
The native confirmation-dialog browser verification remains unresolved; VM
confirmation responses are not reported as real browser accept/cancel evidence.

## Release checkpoint (2026-09-27)

User requested pushing completed work before starting off-field work entry.
No off-field feature edits are included. Release/cache tokens synchronized to
20260927_ver282. All 29 verification scripts passed again and diff check passed.
Separate manual files are excluded. Prior 360px/390px replay evidence above
applies; native deletion dialog verification remains an explicitly open gap.
