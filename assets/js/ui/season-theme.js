(function () {
  "use strict";
  const R = window.RiceOS = window.RiceOS || {};
  const stages = ["establishment", "earlyTillering", "peakTillering", "maximumTillering", "panicleInitiation", "meiosis", "booting", "heading", "fullHeading", "ripening", "yellowRipening", "maturity"];
  const colors = { neutral: "#38665d", growing: "#286848", heading: "#176a72", ripening: "#816016", harvested: "#884256" };

  // Presentation only: use this year's field evidence, never the input-year setting.
  function resolve(date) {
    const year = String(date).slice(0, 4);
    let best = { key: "neutral", rank: -1, fieldId: "", year };
    if (!R.state || !R.agro) return best;
    R.state.activeFields().filter(field => !/休耕|休止|終了/.test(field.status || "")).forEach(field => {
      const harvest = R.state.harvestStatusForField(field.fieldId, year, date);
      const stage = R.agro.seasonStageForField(field, date);
      const current = stage.fieldStage && stage.fieldStage.current;
      const rank = harvest.status === "complete" ? stages.length : stages.indexOf(current && current.key);
      if (rank <= best.rank) return;
      const key = harvest.status === "complete" ? "harvested" : rank >= 9 ? "ripening" : rank >= 4 ? "heading" : "growing";
      best = { key, rank, fieldId: field.fieldId, year };
    });
    return best;
  }

  function refresh() {
    if (!document.body || !R.utils) return;
    const result = resolve(R.utils.today());
    document.body.dataset.seasonTheme = result.key;
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", colors[result.key]);
  }
  R.seasonTheme = Object.freeze({ resolve, refresh });
  document.addEventListener("DOMContentLoaded", refresh);
  window.addEventListener("riceos:datachange", event => {
    if (!event.detail || event.detail.status !== "saving") refresh();
  });
  window.addEventListener("focus", refresh);
  document.addEventListener("visibilitychange", () => { if (!document.hidden) refresh(); });
})();
