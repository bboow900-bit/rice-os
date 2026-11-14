# Annual story UI (2026-11-13)

Approved visual: `ui-reference/20261113-annual-story.png`.

Scope is the existing annual field timeline, not the calendar or home.
Use the application's existing typeface and navigation, with the approved green/blue/gold story palette.

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

## Fidelity correction (ver317)

The first implementation reused tiny rice-clump images and did not match the approved botanical close-ups.
The corrected layout uses a fixed category column, aligned title/details, inline water-period duration,
outlined observation labels and dedicated tightly framed transparent illustrations.
The note toggle shares the primary content row without overlapping the title or stealing card navigation.
Stage information alone does not create a redundant supplement button.

Production assets are in `assets/images/annual-story/`. Generated with the built-in image tool using the
approved screenshot as the reference, not the API/CLI. The final prompt set requested:

- `annual-story-panicle.png`: isolate the exact young green rice illustration from the panicle card;
  pointed leaves and a small upright green young panicle, no roots, ground, labels or background;
  preserve the reference silhouette and soft botanical shading; tightly framed transparent alpha.
- `annual-story-heading.png`: isolate the green rice ear from the heading card; a sparse curving green
  panicle, clearly shaped grains and fresh green leaves, no mature gold grains or photorealistic clump;
  match the reference style and silhouette, tightly framed transparent alpha.
- `annual-story-harvest.png`: isolate the golden ripe rice illustration; three left-bending golden ears,
  distinct grains and long green leaves; no glow, halo, bloom, haze, shadow, text or background;
  clean silhouette with fully transparent pixels outside the plant, tightly framed square canvas.

Review screenshots use clearly named, isolated fixture records. They are actual browser captures,
not generated mockups and not the user's real saved data.

## Harvest thermal visibility

Do not silently hide a saved total merely because its metadata fails the latest completeness check.
Use only a unique snapshot matching the selected field and the harvest work date.
Show complete totals normally; label partial totals as partial, legacy totals as legacy,
and other incomplete metadata as needing review. Missing values display an explicit missing status.
Malformed or ambiguous values display a review status, never another field's total or a fabricated zero.
The card has a separate wide thermal line. Reading this line never recalculates or overwrites a saved total.
The current review screenshot intentionally exercises a synthetic partial total, labelled as such.

## Larger milestone artwork (2026-11-14)

Illustration frames are 88 x 104 CSS pixels at 360px and 96 x 112 pixels at 390px and wider.
Previously they were only 50 x 60 and 58 x 64 pixels. No replacement plant or extra crop data is introduced.
Artwork occupies the first grid row beside the title; thermal values occupy a subsequent row.
Illustrated cards put the note control in its own row below the primary button, not on top of the image.
Mobile regression checks enforce minimum frame dimensions, loaded images and text/thermal separation.
