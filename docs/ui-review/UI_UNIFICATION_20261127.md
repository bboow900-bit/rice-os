# UI unification checkpoints

## Approved direction

Use the current Home card typography and watercolor treatment across the six primary tabs, without changing saved data, seasonal state colors, the primary navigation, or established water input forms. Present an actual mobile screenshot at each checkpoint before proceeding to the next surface. No push is included in a checkpoint.

## Checkpoint 1: Home

- Blend the app header into the light paper surface; preserve save/error feedback and seasonal accent colors.
- Keep the existing four-fact card and daily water input.
- Replace the expanded historical management comparison with record-date and thermal-basis evidence.
- Send historical comparison to the existing annual comparison screen, carrying field ID and year through a dedicated `annual-compare` destination.
- Return to Home in one step from the comparison root, restoring scroll position, group filter, and card expansion.
- Keep comparison child-record navigation and existing annual-tab entry paths functional. Preserve the comparison route during field switching and input cancellation.
- No schema, storage-key, saved measurement, crop-stage calculation, or weather calculation changes.

### Compact follow-up

- Reduce card/header and fact-row spacing without reducing the main thermal value or daily water text below the approved sizes.
- Evidence is a separate native disclosure, initially closed even when the field card is expanded. Its in-memory open state survives redraws.
- The annual-comparison button remains outside the evidence disclosure, so no extra expansion is required to use it.
- Summary buttons and all input/disclosure targets remain at least 44px high.

## Verification

Use isolated fixtures only, at 360px, 390px, and 1280px:

```text
node tools/check_home_minimal_primary.cjs
node tools/check_annual_reflection_primary.cjs
node tools/verify_navigation_data_safety.js
node tools/verify_harvest_navigation_unified.js
node tools/verify_growth_evidence_semantics.js
node tools/verify_home_water_shortcut.js
```

Check both global and in-screen Back buttons, comparison child details, field switching, invalid targets, and an unchanged farm-store baseline. Screenshots in the local temporary directory use fixture values rather than the user's actual records.

## Checkpoint 2: Fields detail and settings

- Apply Home's heading/body typography and compact reading hierarchy to existing field detail and settings markup.
- Display fixed information as aligned label/value rows rather than nested tinted cells.
- Keep existing photos, illustrations, form items, immediate-save semantics, and stage/water colors unchanged.
- Use one-column phone forms with 44px input targets and readable labels; retain section disclosures.
- Wrap long field names without ellipsis and reserve space for Mincho glyph overhang.
- Correct overlapping global/local Back controls. The global Back first closes settings to detail, then follows the existing field origin; the local duplicate is hidden only while the global control is available.
- Verify detail/settings viewing does not change the farm store, and editing a master field preserves work, growth, and water histories.

## Checkpoint 3: Calendar

- Use paper surfaces, Mincho month/section headings, Gothic operations, thin rules, and Home's seasonal primary-action accent.
- Keep the existing month-grid geometry, selected/today markers, record colors, month navigation, target filters, and registration flows.
- Keep filters and Today aligned in one row; preserve 44px targets.
- Align record title and status in one row. Wrap long titles and keep the field subtitle readable.
- Scope presentation to `calendar-watercolor.css`, included in the page and offline app shell. No calendar renderer or saved-record changes.
- Check new visual targets at 360px, 390px, and 1280px, plus existing calendar display/filter/actual/shipment contracts and route tests.

## Checkpoint 4: Annual review and outlook

- Match the annual app header, year selector, and formerly dark heading band to Home's light paper and typography. Keep annual story, material cards, comparison geometry, images, and data intact.
- Use the seasonal accent for the annual-close action without changing its confirmation flow.
- Match outlook headings, cards, references, controls, and disclosure typography to Home.
- Distinguish a missing-record status from a large date value through a presentation-only class. Separate the outlook detail's field name from its small context label to avoid orphaned text.
- Forecast algorithms, confidence rules, source text, weather requests, saved values, and record routes remain unchanged.
- Check `check_annual_reflection_primary.cjs` and `check_outlook_primary.cjs` at 360px, 390px, and 1280px. Include missing records, long field names, evidence disclosure, back navigation, and an unchanged farm-store baseline for read-only actions.
- Follow-up: place the existing harvest/shipment entry at the bottom of the reflection hub. Remove the floating add button from both the hub and individual field histories; other screens' record-entry controls remain unchanged.

## Checkpoint 5: Management top

- Group twelve entries into six categories, including the data-management entry. Remove only the two management water shortcuts, not water records or other water routes.
- Reuse the approved watercolor art. Per follow-up approval, hide supplementary menu descriptions and show 90 by 70 pixel art above each title. Keep counts and navigation arrows.
- Keep backup details folded with a direct share action. Move the existing system-settings entry from the upper-right gear to a single data-management card. Disable both share buttons while sharing.
- Data management prioritizes two save/import buttons, with import options, advanced operations and diagnostics in disclosures. Capacity warnings automatically reveal diagnostics.
- Primary checks passed at 360, 390, and 1280 pixels: all twelve destinations and back paths, no overflow, settings, backup cancellation, and unchanged farm records.
- Backup regression passed at 360 and 390 pixels: cancellation, sharing, unsupported sharing, failed download, and actual JSON download.

## Further scope

Additional ledger redesigns beyond the audited repairs require a separate checkpoint and approval.

Present each checkpoint independently; do not treat an approved Home screenshot as evidence that the remaining tabs are finished.
