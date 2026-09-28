(function () {
  "use strict";
  const RiceOS = window.RiceOS = window.RiceOS || {};
  const U = RiceOS.utils;
  const pending = new Map();

  // Pure when asOfDate is provided: all counts are derived from daily cells.
  function summarize(startDate, endDate, rows, metadata) {
    return RiceOS.schema.normalizeHarvestWeather({ ...metadata, startDate, endDate, rows });
  }

  async function fetchSnapshot(startDate, endDate, location) {
    const metadata = { latitude: location && location.latitude, longitude: location && location.longitude,
      locationLabel: location && location.label || "", fetchedAt: U.now(), asOfDate: U.today() };
    const initial = summarize(startDate, endDate, [], metadata);
    if (["missing_drain", "invalid_range", "location_missing"].includes(initial.status)) return initial;
    const yesterday = new Date(Date.parse(`${metadata.asOfDate}T00:00:00Z`) - 86400000).toISOString().slice(0, 10);
    const until = endDate < yesterday ? endDate : yesterday;
    if (startDate > until) return initial;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 30000);
    try {
      const url = new URL("https://archive-api.open-meteo.com/v1/archive");
      Object.entries({ latitude: initial.latitude, longitude: initial.longitude, start_date: startDate, end_date: until,
        daily: "temperature_2m_mean,precipitation_sum", timezone: "Asia/Tokyo" }).forEach(([key, value]) => url.searchParams.set(key, value));
      const raw = await fetch(url, { signal: controller.signal });
      if (!raw.ok) throw new Error("Archive request failed");
      const json = await raw.json();
      if (json.error) throw new Error("Archive request failed");
      const daily = json.daily || {};
      if (!Array.isArray(daily.time)) throw new Error("Invalid Archive dates");
      const cell = (values, i) => Array.isArray(values) && typeof values[i] === "number"
        && Number.isFinite(values[i]) ? values[i] : "";
      const rows = daily.time.map((date, i) => ({ date, source: "Open-Meteo Archive",
        tempMean: cell(daily.temperature_2m_mean, i), precipitation: cell(daily.precipitation_sum, i) }));
      return summarize(startDate, endDate, rows, { ...metadata, fetchedAt: U.now() });
    } catch (_) {
      return summarize(startDate, endDate, [], { ...metadata, status: "fetch_failed" });
    } finally {
      clearTimeout(timer);
    }
  }

  async function capture(workId, fieldId) {
    const data = RiceOS.state.data();
    const work = (data.fieldWorks || []).find((row) => row.workId === workId);
    const snapshot = work && (work.harvestSnapshots || []).find((row) => row.fieldId === fieldId);
    if (!snapshot || !["稲刈り", "収穫"].includes(work.workName) || !(work.fieldIds || []).includes(fieldId)) return { status: "stale" };
    const old = RiceOS.schema.normalizeHarvestWeather(snapshot.weather);
    const endDate = snapshot.harvestDate;
    const startDate = snapshot.water && snapshot.water.finalDrainDate || "";
    if (work.date !== endDate || !(data.fields || []).some((row) => row.fieldId === fieldId)) return { status: "stale" };
    const sameRange = old && old.startDate === startDate && old.endDate === endDate;
    if (sameRange && old.status === "complete") return old;
    const location = data.meta && data.meta.weatherLocation;
    const locationKey = JSON.stringify(location);
    const workName = work.workName;
    const key = JSON.stringify([workId, fieldId, endDate, startDate, workName, locationKey]);
    if (pending.has(key)) return pending.get(key);
    const task = (async () => {
      let payload = await fetchSnapshot(startDate, endDate, location);
      const current = RiceOS.state.data();
      if (JSON.stringify(current.meta && current.meta.weatherLocation) !== locationKey
        || (current.fieldWorks || []).find((row) => row.workId === workId)?.workName !== workName) return { ...payload, status: "not_saved" };
      if (sameRange && ["partial", "complete"].includes(payload.status)
        && old.latitude === payload.latitude && old.longitude === payload.longitude) {
        payload = summarize(startDate, endDate, payload.rows.map((row) => {
          const before = old.rows.find((item) => item.date === row.date);
          return before ? { ...row, source: "Open-Meteo Archive",
            tempMean: before.tempMean !== "" ? before.tempMean : row.tempMean,
            precipitation: before.precipitation !== "" ? before.precipitation : row.precipitation } : row;
        }), payload);
      }
      const saved = RiceOS.state.saveHarvestWeatherSnapshot(workId, fieldId, endDate, startDate, payload);
      return saved ? payload : { ...payload, status: "not_saved" };
    })();
    pending.set(key, task);
    try { return await task; } finally { pending.delete(key); }
  }

  RiceOS.harvestWeather = { summarize, fetchSnapshot, capture };
})();
