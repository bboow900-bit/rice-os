# Pre-push audit - 2026-11-28

> Historical audit below. Follow-up repairs were authorized and implemented later on the same day; see the resolution section at the end. No push has occurred.

## Scope and protection

- No push, commit, or production-data operation. Initial audit was read-only; the user subsequently approved limited CSS cleanup after a source backup.
- Primary reviewer plus reused independent code/data reviewer and mobile-UI reviewer.
- All browser checks use isolated fixture storage, not the user's phone data.
- Main tabs checked at 360, 390, and 1280 pixels. These are Windows Chrome viewport checks, not a physical iPhone Safari certification.
- External network calls are blocked in these UI fixtures; live weather retrieval and public-site offline update are not certified by these runs.

## Confirmed passes

- Main-tab suites: `check_home_minimal_primary`, `check_field_watercolor_primary`, `check_calendar_watercolor_primary`, `check_annual_reflection_primary`, `check_outlook_primary`, `check_management_watercolor_primary`, `check_data_management_compact` (all 360/390/1280).
- `check_backup_center_mobile`: cancellation, sharing success, unsupported sharing, failed download, actual JSON download (360/390).
- `check_material_controls_mobile`: edits, cancellation, failed persistence, undo, ledger navigation and reload (360/390/1280).
- `check_storage_protection_mobile`: stale-tab overwrite prevention, reload and failed-boot protection (360/390).
- `check_maintenance_meter_mobile`: editing/deleting, cancellation, failed persistence and reload (360/390).
- `check_seeder_master_mobile`: modes, units, read-only detail and cancel/back (360/390/1280).
- Independent mobile reviewer reproduced Home water input/back and annual water-record edit/cancel/back at 360/390; viewing and cancellation did not change stored records.
- All application JavaScript passes `node --check`; `git diff --check` has no whitespace errors (only Windows line-ending notices).
- Core schema/state/storage/agronomy/forecast-engine files have no current diff.

## Remaining UI findings

1. **P2: Off-field work action sheet is missing on the annual top.** Viewing the record works, but the context-menu request sets action state without rendering its sheet on the no-field-selected branch. See `assets/js/screens/annual.js:1021`, `2932`, `3165`, `3924`. Reproduced independently at 390 pixels. This does not establish that all other editing paths are broken.
2. **P2: Existing secondary controls are below 44 pixels.** Machine-local Back and notification permission are 34 pixels high; transplanter import/copy disclosure is about 41 pixels. See `index.html:705`, `index.html:696`, `assets/css/app.css:15502`.
3. **P3: Management advanced details retain old styling.** Diagnostic KPI tiles use 22-pixel corners/shadows, old action buttons remain rounded/shadowed, JSON disclosure has 10-pixel supplementary text. See `assets/css/app.css:5159`, `4927`, `4545`. Main management cards and primary data actions are unaffected.
4. **P3: Some supplementary text is too small.** Field-group count/area is 9 pixels; herbicide label-safety note is 11 pixels. See `assets/css/app.css:12858`, `assets/css/herbicide-master.css:32`.
5. **P3: Near-duplicate water guidance in field detail.** `focus.note` and `water.referenceNote` repeat essentially the same post-heading explanation. See `assets/js/screens/fields.js:754`, `assets/js/core/agro.js:467`, `518`.

## Regression-suite maintenance

Executed all 103 `tools/verify_*.js` suites: **98 pass, 5 fail**. Do not call this a clean all-pass suite.

- `verify_annual_hub.js`: exact-class-string expectation and navigation stub are stale.
- `verify_annual_record_actions.js`: old test forbids `openField` even for comparison navigation with `replace:true`.
- `verify_cultivation_integration.js`: compact card is incorrectly required to contain the old detailed fields.
- `verify_harvest_list_badges.js`: missing utility/group stubs plus old card wording expectations.
- `verify_home_harvest_grouping.js`: a mock `matches:()=>true` enters unrelated disclosure handlers without a dataset.

Independent reviewer diagnosed these five with in-memory test corrections, without changing files. Those diagnostic passes are not formal passes of the original suites.

Additional browser suites that stopped before completing:

- `check_water_ledger_mobile`: searches for removed management water-master shortcuts. Actual Home/annual water paths pass independent reproduction.
- `check_result_crud_mobile`: searches for the removed standalone milling entry rather than the integrated harvest ledger.
- `check_off_field_mobile`: searches for the old annual work-scope control after successfully saving a field-less sowing record.
- `check_tractor_settings_mobile`: selector matches both list and detail edit buttons after saving/copying a profile; full remaining path not certified by this run.
- `check_calendar_completion_mobile`: measured panicle record and completion-link persistence assertions pass, then the old visible-title assertion fails. Further diagnosis is recorded in the follow-up below.
- `check_harvest_ledger_mobile`: new milling record and stock/history-preservation assertions pass, then expected Back sequence times out. Further diagnosis is recorded in the follow-up below.

## Before any later push

- Resolve or explicitly accept the remaining UI findings and update stale regression expectations without weakening the behavioral checks.
- Bump release/cache version consistently; current local work still uses public `20261125_ver332` identifiers.
- Include the new referenced CSS and approved management PNG; exclude unrelated paused Google Drive work, manuals and unused image experiments.
- Repeat changed-state mobile checks and obtain push approval. No release is authorized by this audit.

## Approved CSS cleanup

- Full source snapshot: `.codex-remote-attachments/css-safety-backups/rice-os-before-css-cleanup-20261128-192348.zip` (80,411,402 bytes, 456 entries).
- SHA-256: `9E65CF12530CD80B02C8002BDE66FA373A2C78B5141C69AB8ED83F85B2FE7757`.
- ZIP entries for `app.css`, `index.html`, and `data.js` were independently hashed against their pre-cleanup working copies and matched. Snapshot is ignored by Git and contains source, not the phone's browser-local records.
- `app.css`: remove old annual-menu 31px block, earlier 34/40px important dimensions, and unused `.system-settings-trigger` (26 lines total). Existing 44px rule now takes effect.
- `management-watercolor.css`: remove two media blocks assigning the same `.5` icon scale as the base declaration; no layout change intended.
- Add annual-menu minimum 44px assertion to the primary regression test.
- After cleanup, primary annual/reflection, management, and data-management suites all passed again at 360/390/1280 pixels, including the 44px assertion. Main reviewer inspected the resulting annual screenshot. Independent reviewer found no unsafe deletion in the cleanup diff.
- To undo, selectively restore only the affected CSS/test files from the ZIP after reviewing later edits; do not bulk-overwrite the whole working tree.

## Browser-failure diagnosis follow-up

- Calendar completion: saved measured record and link are present; the test expects the old visible title, while the current row is named `生育ログ`. Not evidence of data loss.
- Harvest ledger: origin-only milling save automatically returns to the integrated ledger. The old test then takes an extra Back step and waits for a Back button at the management root. Saved quantity, stock and historical-preservation assertions passed before that point.
- Off-field work: stale scope-selector expectation is separate from the real action-sheet rendering defect listed above.

## Resolution after user approval

- Off-field records now render their action sheet at the review hub as well as inside a selected field. Read-only off-field details link to the existing editor. Existing save/delete handlers are reused.
- Machine Back, notification permission, and transplanter disclosure targets are at least 44px; field-group supplementary text and herbicide safety notes are 12px.
- Management advanced controls and diagnostics now use the approved restrained borders/corners and legible text; diagnostics are rows rather than floating tiles. Primary save/import actions and warning colors remain intact.
- Post-heading field detail renders one water-context explanation. Agronomy calculations and the source data are unchanged.
- Local release preparation is `20261128_ver333` with matching cache name and index/mobile/schema/PWA identifiers. This is not a published version.
- All 103 `verify_*.js` suites pass after updating stale contracts and adding off-field action regressions. Assertions still check cancellation and targeted deletion/data protection.
- Primary checks passed after repairs: all eight main UI/backup suites, measured-panicle/heading/work/water schedule completion, off-field create/edit/delete/cancel and return paths, integrated milling/shipment CRUD and stock/history protection.
- Actual service-worker install and offline reload of all six tabs passed on a separate isolated local server; new CSS and the approved management image were confirmed in the cache.
- All application JS syntax checks and whitespace checks pass. State/storage/agronomy/forecast engine implementations remain unchanged.
- UI evidence uses test fixtures, not the user's phone records. Physical iPhone Safari and live external weather fetching remain outside these tests.

## Verification interruption

- Execution approval review and the final reviewer stopped with an account usage-limit error. This was not a safety rejection. No alternative route was used to bypass the approval check.
- Confirmed primary passes before the interruption: the eight main UI/backup suites, calendar completion, off-field CRUD and cancel/back, integrated harvest/shipment CRUD, and actual release/offline checks. The 103 pure-JavaScript suites passed.
- Updated legacy result-CRUD, tractor and water-ledger browser tests are syntax-checked, but their final runtime results were not received. `check_audit_ui_repairs.cjs` was added, but its launch was blocked and it has not run.
- Independent review of CSS, field explanation and release/data safety passed. Independent review of the repaired annual action-sheet implementation remains pending because its author must not self-certify it.
- No push. Resume these remaining browser checks and independent annual review before claiming final release readiness.

## Resumed verification completed

- The previously interrupted `check_result_crud_mobile.cjs`, `check_tractor_settings_mobile.cjs`, `check_water_ledger_mobile.cjs`, and `check_audit_ui_repairs.cjs` all passed in the primary run at 360 and 390 pixels.
- Checks include save/edit/delete/cancel and failed-write protection; tractor work snapshots remain unchanged after master edits; water group movements and return routes work; small controls are at least 44px and diagnostics are readable flat rows. Water list/detail-state subtests use the public ledger API after a real Home input route; annual edit/cancel is exercised through actual UI controls.
- A reused reviewer, independent of the annual implementation author, reviewed the repaired action-sheet/edit route and reran the two verification suites and off-field browser suite. All passed at 360/390; no required fixes found.
- The account-limit interruption is resolved for these remaining checks. No additional application-source change was needed during this resumption.
- Remaining environment boundaries: these are isolated Windows Chrome fixtures, not physical iPhone Safari tests. The off-field context-menu test uses right-click, not an actual finger long-press. Legacy `otherWorks` browser round-trips and live external weather fetching were not exhaustively tested.
- No commit or push has been performed. The source backup remains available for selective rollback.

## Additional unresolved-path verification

- Real CDP touch events exposed a long-press issue hidden by right-click tests: releasing the touch could generate a click on the newly rendered action backdrop and immediately close the menu. The backdrop cancel handler now honors the existing short click-suppression window. Edit/delete and the explicit Cancel button are unaffected.
- The primary off-field browser suite passes at 390/360 after using a 700ms touch start/end sequence. Independent touch reproduction also passed at both widths, including explicit Cancel, deletion cancellation, and backdrop cancellation after the suppression interval. These are Chrome touch events, not a physical iPhone test.
- Legacy `otherWorks` memo editing exposed a creation-time overwrite. `saveOtherWork` now uses an explicitly supplied `createdAt`, then the previous record's value, then the current time. Only this assignment changed; no storage-format or migration change.
- Primary `check_other_work_created_at_mobile.cjs` passes at 360/390: old timestamps, unknown/nested attributes, pinned/legacy crop-year handling, unrelated records, cancel/back, newly created timestamps, explicit timestamp precedence and reload preservation.
- `check_release_offline.cjs --update` passes in primary and independent runs. It serves a version-number-substituted previous bundle, switches to the current bundle, clicks the real update button, checks exact pre-update JSON backup and preserved records, then verifies the new SW/cache and all six tabs offline. This is a controlled old-version simulation, not certification of every historical public build.
- Actual Open-Meteo requests passed through the app's weather module in Node and in a Chrome page, without mocked API responses: 3 archive days and a 7-day forecast, finite daily mean temperatures, source labels and Asia/Tokyo timezone, unchanged farm storage. A public Fukushima-city reference coordinate was used, not the user's saved location. This verifies connectivity/parsing, not field-level meteorological accuracy or equivalence to JMA station observations.
- All 103 pure-JavaScript verification suites pass again after the two application fixes. No commit or push.
- Independent created-time review and a separate 360/390 replay also passed, with no required fixes found.

## Android-specific emulation pass

- No `adb` command was available on this PC; no physical Android connection was established. User was asked whether USB-based real-device testing is possible.
- Added explicit `--android` test profiles using Playwright's Pixel 7 Android Chrome device descriptor, mobile/touch settings, and 360/412-pixel viewports. This is desktop Chromium emulation, not an Android OS or installed-PWA certification.
- `check_release_offline.cjs --update --android`: simulated previous-version upgrade, exact backup, record preservation, new SW/cache, offline reload and all six tabs passed.
- `check_data_management_compact.cjs --android`: save/import layout, actual downloaded JSON selection, inspection without changes, cancelled merge and confirmed merge without duplicated/overwritten domain records passed at 360/412.
- `check_off_field_mobile.cjs --android`: actual CDP touch long-press, detail/edit/delete/cancel, off-field schedule completion, group/field selection and return paths passed at 412/360.
- Independent code review found no confirmed Android-only regression, but OS Back has no history/popstate integration; hardware/gesture Back may leave the page instead of using the app's internal Back flow. Do not represent this as tested or fixed.
- Physical-device gaps: installed home-screen launch/update/restart, Android Back/gesture behavior, share-sheet destination and actual Files save/reopen, storage-pressure handling. Sharing handoff or download initiation does not prove destination persistence. LAN HTTP preview is not a valid SW/PWA test origin; HTTPS or device-localhost is needed.
- No application-source change or push in this Android verification step.
