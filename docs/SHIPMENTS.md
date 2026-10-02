# Rice shipments and gifts

## Ownership

`shipments` stores one actual delivery per record. It is independent of fields,
field work, material inventory and variety results. Existing shipping work and
historical shipped quantities are retained and are not automatically imported or
added to ledger totals.

`season` means crop year; `date` means delivery date. A delivery in January can
therefore belong to the previous crop year. Packages hold kilograms per bag and
integer bag counts. Totals are derived from packages, never separately entered.
Brown and white rice are distinguished; totals describe delivered weight and do
not estimate paddy yield or milling loss.

`shipmentPrices` stores optional selling prices by crop year and recipient.
`pricePer60Kg` is yen per tawara (60 kilograms). Each actual delivery retains its
own price snapshot; editing the default price does not change old revenue.
Revenue is delivered kilograms times the snapshot price divided by 60, rounded
to the nearest yen. Gifts are excluded; unpriced deliveries remain uncalculated.
Legacy package `unitPrice` values are retained but not used in this calculation.
Recipient totals use the crop year filter.

## Routes

- Home record sheet: Shipping / distribution opens a new record without fields.
- Annual review, Work / materials: Shipping / distribution opens the ledger.
- Ledger card: detail; detail offers edit and confirmed deletion.
- Back from editor: prior detail or list, without saving.
- Back from detail: ledger; back from ledger: original screen.

## Compatibility

Existing storage keys and backup/import/export paths remain in use. The new
collection defaults to an empty array for historical backups. No shipping data
is inferred from free-text work memos. The ledger does not calculate stock yet.

## Verification

`tools/verify_shipments.js` covers legacy rows, CRUD, invalid no-op operations,
storage failure rollback, JSON roundtrip, recipient/year rate uniqueness and
historical price retention. `tools/check_shipments_mobile.cjs` reproduces home
and annual entry, mixed bag sizes, 60kg revenue, edit/cancel/delete/cancel,
registered rate lookup and immutable historical snapshots at 360px and 390px.
The same browser path checks the annual mowing bitmap and field-data retention.
