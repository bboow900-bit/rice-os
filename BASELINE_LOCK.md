# Rice OS baseline lock

Baseline: `8732364` / `20260730_ver180` / schema `16`

This file defines the working parts that must be kept while repairing the
remaining defects. It is a release contract, not a design specification.

## Data that must remain compatible

- Browser storage key: `rice_os_v8_stable`.
- JSON backup and restore, including normalization of legacy data.
- Fields, field groups, varieties, field works, growth logs, dry periods,
  irrigation periods, schedules, photos, materials, results, and season notes.
- Stable IDs and field links in existing records.
- Archived fields keep their historical records.

## Current workflows that must not be removed

- Home shows each field's current growth and water-management progress.
- Calendar remains the date and schedule view.
- Field records, growth records, water-management records, and group batch
  entry remain available.
- Annual Review contains the field-specific "year flow" with separate
  field-work and water-management lanes.
- Existing annual cards continue to open their existing edit paths.
- The global back button and the bottom navigation stay available.
- PWA cache versions in HTML, the PWA module, and the service worker move
  together on every release.

## Mandatory gate before any push

Run all of the following from the repository root:

```powershell
node tools/verify_data_integrity.js
node tools/verify_regression_contract.js
node --check assets/js/core/state.js
node --check assets/js/core/agro.js
node --check assets/js/screens/home.js
node --check assets/js/screens/annual.js
git diff --check
```

For a user-visible change, also run the mobile UI, agronomy, data-safety, and
independent route/PWA reviews. A repair may change a baseline item only when
the change is explicitly listed in the repair plan and validated in all linked
screens.
