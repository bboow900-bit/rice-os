"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs"), path = require("node:path"), vm = require("node:vm");
const memory = new Map();
let writes = 0;
const c = vm.createContext({ console, navigator: {}, document: { getElementById: () => null, querySelectorAll: () => [] },
  localStorage: { getItem: key => memory.get(key) ?? null, setItem(key, value) { writes++; memory.set(key, String(value)); }, removeItem: key => memory.delete(key) } });
c.window = c;
for (const name of ["utils", "schema", "storage"]) vm.runInContext(fs.readFileSync(path.join(__dirname, "../assets/js/core", `${name}.js`), "utf8"), c);
const R = c.RiceOS, plain = value => JSON.parse(JSON.stringify(value));
R.utils.now = () => "2026-11-06T00:00:00Z";
const profile = (profileId, cropYear) => ({ profileId, cropYear, name: profileId, method: "conventional", medium: "soil", germinatedSeedGPerTray: 0, bedThicknessCm: "", futureMetadata: { keep: true } });
const current = R.schema.normalize({ meta: { custom: { existing: true }, activeCropYear: 2027,
  seederProfiles: [profile("existing", 2026)], nextSeasonIdeas: [{ ideaId: "idea", text: "current" }],
  importedSeederHistory: { seederSettingsSnapshot: profile("existing", 2025) } },
  shipments: [{ shipmentId: "shipment", recipient: "Current" }] });
const incoming = R.schema.normalize({ meta: { custom: { existing: false }, activeCropYear: 2028,
  seederProfiles: [{ ...profile("existing", 2027), name: "Changed incoming" }, { ...profile("new", 2027), copiedFromProfileId: "existing" }],
  nextSeasonIdeas: [{ ideaId: "idea", text: "changed" }, { ideaId: "idea2", text: "new" }] },
  shipments: [{ shipmentId: "shipment", recipient: "Changed" }, { shipmentId: "shipment2", recipient: "New" }] });
const before = JSON.stringify([current, incoming, [...memory], writes]);
const result = R.storage.mergeData(current, incoming);
assert.equal(JSON.stringify([current, incoming, [...memory], writes]), before);
assert.deepEqual(plain(result.data.meta.seederProfiles), [plain(current.meta.seederProfiles[0]), plain(incoming.meta.seederProfiles[1])]);
assert.equal(result.added.seederProfiles, 1); assert.equal(result.skipped.seederProfiles, 1);
assert.deepEqual(plain(result.data.meta.custom), plain(current.meta.custom));
assert.equal(result.data.meta.activeCropYear, 2027);
assert.deepEqual(plain(result.data.meta.importedSeederHistory), plain(current.meta.importedSeederHistory));
assert.deepEqual(plain(result.data.shipments[0]), plain(current.shipments[0]));
assert.equal(result.data.shipments.length, 2);
assert.equal(result.data.meta.nextSeasonIdeas.find(row => row.ideaId === "idea").text, "current");
assert.equal(result.data.meta.nextSeasonIdeas.length, 2);
const repeated = R.storage.mergeData(result.data, incoming);
assert.deepEqual(plain(repeated.data.meta.seederProfiles), plain(result.data.meta.seederProfiles));
assert.equal(repeated.added.seederProfiles, 0);
const empty = R.storage.mergeData({}, incoming);
assert.deepEqual(plain(empty.data.meta.seederProfiles), plain(incoming.meta.seederProfiles));
assert.deepEqual(plain(R.schema.normalize(plain(result.data)).meta.seederProfiles), plain(result.data.meta.seederProfiles));
const unchanged = R.storage.mergeData(current, {});
assert.deepEqual(plain(unchanged.data.meta.seederProfiles), plain(current.meta.seederProfiles));
for (const malformed of [null, false, {}, "bad", [null], [[]], [{}], [{ profileId: 1 }], [{ profileId: "" }], [profile("same", 2026), profile("same", 2027)]]) {
  for (const side of ["current", "incoming"]) {
    const bad = { meta: { seederProfiles: malformed } };
    const first = side === "current" ? bad : current, second = side === "incoming" ? bad : incoming;
    const original = JSON.stringify([first, second, [...memory], writes]);
    assert.throws(() => R.storage.mergeData(first, second));
    assert.equal(JSON.stringify([first, second, [...memory], writes]), original);
  }
}
// No deletion tombstones: importing an old JSON can restore a removed profile.
assert.equal(R.storage.mergeData({ meta: { seederProfiles: [] } }, current).data.meta.seederProfiles[0].profileId, "existing");
console.log("seeder merge PASS: existing IDs win, new IDs append, metadata/snapshots retained, repeat, JSON, malformed no-write");
