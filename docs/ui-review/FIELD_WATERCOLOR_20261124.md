# Approved compact field cards and navigation

## Scope

The fields list uses the approved four-fact watercolor card: observed stage, outlook, thermal accumulation and water management. The card is a single button into the existing field detail. No nested controls, mock values or new records are introduced.

`RiceOS.fieldProgress` exposes the existing home calculations and heat cache to fields. Do not introduce an independent stage or thermal formula in the field renderer. Confirmed weather ends yesterday for unfinished crops; completed harvests remain anchored to the harvest date. Missing data and partial coverage must not be displayed as complete measurements.

Water movement is shown only when there is no overlapping-period warning. Non-active field usage states, incomplete forecasts, herbicide assignments and harvest completion remain visible. The four labels share fixed width, padding and vertical alignment; long values wrap without truncation. A normal 360px card is checked against a 350px height ceiling.

The six navigation targets and their order are unchanged. Five icons share a transparent watercolor sprite, while reflection uses the individually approved notebook. Artwork is decorative; readable labels remain. The application shell precaches all added resources.

## Verification

- `tools/check_field_watercolor_primary.cjs`: 360px, 390px, 1280px; measured data, wait phase, overlapping water records, fallow field, missing records, fixed harvest accumulation, detail/settings/back, all six routes, no farm-store writes.
- `tools/check_season_theme_mobile.cjs`: seasonal palette, harvest status and navigation.
- `tools/verify_home_harvest_heat_stop.js` and `tools/verify_home_water_shortcut.js`: existing calculation and shortcut contracts.

Browser fixture values and screenshot names in tests are not production data. The earlier one-card prototype remains a design-only preview tool.
