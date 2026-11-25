# Home minimal integration

## Scope

The approved Home sample is integrated into the existing dashboard. The Fields tab remains the fixed-information management entry. No persistence schema, growth resolver, water-period resolver, weather accumulation, or input destination is changed.

- Existing seasonal header and record-derived theme remain in use.
- Four summary actions use a two-by-two layout.
- All field cards use the approved compact four-fact layout and existing watercolor stage assets.
- Where daily water input is available, its state and elapsed days replace the duplicate water line above it.
- Water-movement history is available through a native disclosure. Its open state survives dashboard redraws in memory only.
- Movement-history text is at least 11px; input and disclosure targets are at least 44px high.
- Obsolete Home overrides were removed from `readable-ledgers.css`. The dedicated Home presentation stylesheet loads after the shared stylesheets.

## Checks

Run the following against the isolated local preview, not the user's saved phone data:

```text
node tools/check_home_minimal_primary.cjs
node tools/check_home_watercolor_primary.cjs
node tools/check_field_watercolor_primary.cjs
node tools/check_annual_reflection_primary.cjs
node tools/verify_home_water_shortcut.js
node tools/verify_growth_evidence_semantics.js
node tools/verify_fields_active_area.js
node tools/verify_fields_group_selection.js
```

Target widths: 360px, 390px, 1280px. Include long names, water waiting, movement disclosure/redraw, harvested fields, and absent records. Test record/input/detail round trips against an unchanged farm-store baseline.

Screenshots named `rice-home-minimal-*.png` in the local temporary directory contain isolated fixture values, not actual farm records. No publication or release-version bump is part of this integration.

## Result

- Main: Home minimal, Home actions, Fields management, annual reflection, and seasonal-theme browser checks passed at all three widths.
- Main: water shortcut, growth evidence, active area, group selection, seasonal-theme and seasonal-art contracts passed.
- Independent read-only reviewer: Home final test passed at all three widths; same-fixture four-fact values and seasonal theme matched the previous implementation. No remaining findings in this presentation scope.
- Removed issues: duplicated water state, always-expanded tiny timeline, disclosure reset on redraw, obsolete shared Home overrides, and final-card overlap with mobile navigation.
- Existing Fields seasonal test now checks the whole card for its harvest badge and clicks the separate open button, matching the approved DOM structure.
- No phone data, schema migration, release publication, or real-device PWA-update validation was performed.

## Typography follow-up

- Corrected the remaining 9px water-kind and elapsed-day labels to 12px.
- Kept Mincho for field/section headings and serif for numeric heat values; observed-stage and outlook values use Gothic.
- Non-numeric heat states receive `home-stage-heat-text` and 14px Gothic instead of the 26px numeric treatment. The underlying heat calculation is unchanged.
- Expanded management headings, dates, periods, comparisons, and critical-water explanations wrap without ellipsis or line clamps. Supplementary reading text uses 12px with adequate line height.
- Added executable checks for the label-column alignment, type roles, numeric/status sizes, daily-water label sizes, and unclipped expanded content at 360px, 390px, and 1280px.
