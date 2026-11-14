# Shared review destinations

## Scope (2026-11-14)

The annual story remains the factual, ascending timeline for the selected field and crop year.
The approved large panicle/heading/harvest artwork and harvest thermal line remain unchanged.

- Replace the duplicate field tabs with a history-kind filter: work, growth, water, photos and other.
- Retain ordinary growth observations and photo-only logs, not just biological milestones.
- Keep manual stage judgments separate from measured panicle length and observed heading dates.
- Field master editing opens the existing field settings screen.
- Keep the specialized legacy-water reconciliation route reachable from its actual legacy record.
- Water editing opens the existing irrigation editor. Its input UI, validation and persistence are unchanged.
- All general harvest/result entry points open the existing shared harvest ledger.
- Internal result and shipment editors remain available beneath that ledger; no records are migrated.

## Context and safety

Annual entry preserves crop year, variety, selected field, history filter and review state.
Input layers capture source-primary navigation, scroll position and existing navigation depth.
Nested input back/save returns do not consume unrelated underlying field routes.
The bottom navigation retains six primary tabs, and displays the primary tab that opened the input.

Harvest ledger totals are explicitly variety-wide. A field context may preselect the field on a NEW
quantity form, but must never allocate shared historical quantities to that field automatically.
Every ledger entry resets optional prefill fields/date so old sheet context cannot leak into new input.

The visible ledger prioritizes sales total, remaining rice, yield and actual transaction history.
Historical records, prices, household use, gifts and shipment issues retain their existing storage formats.
No import, schema migration, data deletion or automatic recalculation of saved historical snapshots occurs.

## Acceptance

Test isolated real browser contexts at 360/390px and desktop. Cover annual filters, ordinary growth/photo
records, water editor prefill and cancellation, field settings return, annual-to-ledger-to-editor back,
crop-year/variety scope, primary navigation highlight, sales arithmetic, preserved JSON and overflow.
Do not use real-user browser storage for fixtures. Do not push without the user's request.

Completed checks: 101 verification scripts; primary browser paths at 360/390/1280px; independent
review paths including declined/accepted draft cancellation and standalone-origin isolation.
Primary save-path fixtures also submit a new shipment and a new 30kg milling quantity through the UI,
verify resulting stock totals, and verify old work/growth/water arrays remain byte-for-byte unchanged.
Milling prefill occurs before the editor baseline, so opening an untouched prefilled form is not dirty.
Ledger-origin new shipment/milling saves return directly to the shared ledger; standalone paths keep
their existing detail/list behavior. Water-screen source differs only by the shared editor export.
