# Approved field management cards and navigation

## Scope

The 2026-11-25 role-separation design supersedes the four-fact list introduced in ver331. The fields list now manages fixed information: name, variety, area, district, master group, herbicide assignment, soil and water-holding characteristics. Live progress facts remain on Home. Home presentation is a separate pending change.

The fields list no longer calls `RiceOS.fieldProgress` or fetches weather. The shared provider remains available to existing consumers. Field detail still shows context and provides access to settings and annual history; do not remove these destinations merely because the list is simpler.

The card article contains separate detail and edit buttons, never nested buttons. Direct edit uses the existing in-tab settings/detail/list hierarchy. Edits remain immediately saved; returning is not cancellation. Repeated change events with an identical value do not save again. Non-active use status and harvest completion remain visible. The edit label is 28px high inside a 44px touch target, aligned beside soil information. Typical cards stay below 300px, while long names and values wrap instead of being truncated.

The six navigation targets and their order are unchanged. Five icons share a transparent watercolor sprite, while reflection uses the individually approved notebook. Artwork is decorative; readable labels remain. The application shell precaches all added resources.

## Verification

- `tools/check_field_watercolor_primary.cjs`: 360px, 390px, 1280px; no duplicated live facts or list weather fetch, search, global area, separate detail/edit, persisted master edits, preserved work/growth/water history, all six routes.
- `tools/verify_fields_active_area.js` and `tools/verify_fields_group_selection.js`: numeric totals, missing-area warnings, master group filtering and non-mutating rendering.
- `tools/check_season_theme_mobile.cjs`: seasonal palette, harvest status and navigation.
- `tools/verify_home_harvest_heat_stop.js` and `tools/verify_home_water_shortcut.js`: existing calculation and shortcut contracts.

Browser fixture values and screenshot names in tests are not production data. The earlier one-card prototype remains a design-only preview tool.
