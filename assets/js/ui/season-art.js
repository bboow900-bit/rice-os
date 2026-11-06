(function () {
  "use strict";

  const RiceOS = window.RiceOS = window.RiceOS || {};
  // Decorative calendar seasons only, independent of crop records or observed stages.
  const phases = Object.freeze([
    { key: "sowing", label: "播種・育苗", months: [4], src: "assets/images/ui-pop/rice-sowing.png" },
    { key: "transplanting", label: "田植え", months: [5, 6], src: "assets/images/ui-pop/rice-transplanter.png" },
    { key: "growing", label: "生育", months: [7, 8], src: "assets/images/ui-pop/rice-growing.png" },
    { key: "harvesting", label: "稲刈り", months: [9, 10], src: "assets/images/ui-pop/rice-combine.png" },
    { key: "processing", label: "籾摺り・出荷", months: [11], src: "assets/images/ui-pop/rice-processing.png" },
    { key: "winter", label: "農閑期・来季準備", months: [12, 1, 2, 3], src: "assets/images/ui-pop/rice-winter.png" }
  ].map(phase => Object.freeze({ ...phase, months: Object.freeze(phase.months) })));

  function forDate(date) {
    let month = null;
    if (typeof date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(date) && Number(date.slice(0, 4)) > 0) {
      const parsed = Date.parse(`${date}T00:00:00Z`);
      if (Number.isFinite(parsed) && new Date(parsed).toISOString().slice(0, 10) === date) month = Number(date.slice(5, 7));
    }
    const phase = phases.find(item => item.months.includes(month)) || phases.find(item => item.key === "winter");
    return { key: phase.key, label: phase.label, src: phase.src };
  }

  RiceOS.seasonArt = Object.freeze({ phases, forDate });
})();
