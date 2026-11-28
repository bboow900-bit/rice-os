# Cultivation recipe detail - approved watercolor direction

- Baseline explicitly approved: current Home and bottom-navigation watercolor style. Approved proposal: right-hand recipe detail in `exec-18ea5433-d014-4742-8aed-a39e135c05a4.png`.
- Scope: recipe read-only details and the typography of their existing editor; no redesign of management cards or primary navigation.
- Reuse the approved illustration as a CSS sprite with isolated viewports. Section artwork has a 66x56px frame; the heading has 112x64px artwork. Check that neighboring text/rules are not visible in those viewports.
- Growth reference values are prominent, with registered days/temperature units. Target tiller count remains present. Empty and zero values are distinct; free text is escaped and retained.
- Keep top dressing, seed preparation, transplanter, base fertilizer, memo and historical comparison reachable. Hot-water reference values and soaking/germination settings remain distinct.
- No changes to storage keys, schema, save/cancel/adopt/delete handlers or calculation engines. All 27 reference keys remain displayed. Historical averages are still draft values until explicitly saved.
- Changed runtime files: `assets/js/screens/recipes.js`, `assets/css/recipes-watercolor.css`, `assets/images/recipes/recipe-detail-watercolor-approved.png`, `index.html`, `service-worker.js`.
- Primary `check_recipe_watercolor.cjs` passed at 360/390/412/1280: art size, long text, empty/zero values, no overflow/clipping, draft/cancel/save and Back.
- Existing `check_cultivation_primary.cjs` passed at 360/390/1280: validation, live forecast effects and immutable historical observations. All 103 pure-JS verification suites passed.
- Independent data review confirmed unchanged handlers, full field coverage and no persistence on read. Independent UI review passed all four widths; final art-edge issue was corrected and independently rechecked.
- Android-profile offline check passed with the new stylesheet and image included in the SW cache. This is emulation, not a physical Android/iPhone test.
- Screenshots contain isolated example data; no sample values are inserted into production data. Local version remains ver333 until a later authorized release bump. No push requested or performed.
