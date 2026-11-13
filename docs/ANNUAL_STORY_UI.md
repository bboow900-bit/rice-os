# Annual story UI (2026-11-13)

Approved visual: `ui-reference/20261113-annual-story.png`.

Scope is the existing annual field timeline, not the calendar or home.
Use the application's existing typeface, seasonal colors, navigation and rice artwork.

- Small dates and a thin rail leave space for one column of history cards.
- Water management is one period card, not separate start/end cards.
- Actual panicle observations, heading observations and harvest work receive restrained artwork.
- A manually selected stage remains a field judgment, not an observed heading date.
- Harvest thermal totals appear only from a complete saved per-field harvest snapshot.
- Extra facts and notes expand inline only when present. The main card still opens the existing detail.
- Visible action menus and long-press retain the existing edit/delete routes.
- Repeated work is available through the timeline filter. Comparisons remain below the timeline.

No schema migration, record mutation or prediction generation is part of this UI change.
Verification uses isolated browser contexts, never the user's stored records.
