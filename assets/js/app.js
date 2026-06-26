(function () {
  "use strict";

  const RiceOS = window.RiceOS = window.RiceOS || {};
  const U = RiceOS.utils;

  let activeScreen = "home";
  let bound = false;
  const initialScreens = new Set([
    "home",
    "fields",
    "annual",
    "notices",
    "data",
    "calendar",
    "field-work",
    "materials",
    "growth",
    "dry-period",
    "irrigation",
    "recipes",
    "photos",
    "results"
  ]);

  function initialScreen() {
    const params = new URLSearchParams(window.location.search);
    const requested = params.get("screen");
    return initialScreens.has(requested) ? requested : "home";
  }

  function screenKey(screenId) {
    return String(screenId).replace(/-([a-z])/g, (_, ch) => ch.toUpperCase());
  }

  function screenModule(screenId) {
    return RiceOS.screens && RiceOS.screens[screenKey(screenId)];
  }

  function renderAll() {
    Object.keys(RiceOS.screens || {}).forEach((key) => {
      if (RiceOS.screens[key] && typeof RiceOS.screens[key].render === "function") {
        RiceOS.screens[key].render();
      }
    });
  }

  function show(screenId) {
    activeScreen = screenId;
    U.$$(".screen").forEach((section) => {
      section.classList.toggle("active", section.id === `screen-${screenId}`);
    });
    U.$$(".nav-item").forEach((button) => {
      button.classList.toggle("active", button.dataset.screen === screenId);
    });
    const section = U.$(`screen-${screenId}`);
    if (section) document.title = `${section.dataset.title || "稲作カルテ"} - 稲作カルテ`;
    const mod = screenModule(screenId);
    if (mod && typeof mod.render === "function") mod.render();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function markSaved(message) {
    const status = U.$("saveStatus");
    if (!status) return;
    status.textContent = message || "保存しました";
    clearTimeout(window.__riceSaveStatusTimer);
    window.__riceSaveStatusTimer = setTimeout(() => {
      status.textContent = "自動保存中";
    }, 1800);
  }

  function bindScreens() {
    if (bound) return;
    Object.keys(RiceOS.screens || {}).forEach((key) => {
      const mod = RiceOS.screens[key];
      if (mod && typeof mod.bind === "function") mod.bind();
    });
    bound = true;
  }

  function bindNav() {
    U.$$(".nav-item").forEach((button) => {
      button.addEventListener("click", () => show(button.dataset.screen));
    });
  }

  function bindGlobalActions() {
    document.querySelector('[data-action="add-variety"]').addEventListener("click", () => {
      const name = prompt("追加する品種名");
      if (name === null) return;
      RiceOS.state.addVariety(name);
      show("recipes");
    });

    document.querySelector('[data-action="add-field"]').addEventListener("click", () => {
      const name = prompt("追加する圃場名");
      if (name === null) return;
      RiceOS.state.addField(name);
      show("fields");
    });

    document.addEventListener("click", (event) => {
      const action = event.target.closest("[data-action]");
      if (!action) return;
      if (action.dataset.action === "refresh-home") {
        RiceOS.screens.home.render();
        U.toast("更新しました");
      }
      if (action.dataset.action === "install-pwa" && RiceOS.pwa) {
        RiceOS.pwa.promptInstall();
      }
    });

    U.$$('[data-action="enable-notifications"]').forEach((button) => {
      button.addEventListener("click", async () => {
        if (!RiceOS.pwa) return;
        const ok = await RiceOS.pwa.requestNotifications();
        if (ok && RiceOS.alerts) {
          const count = await RiceOS.pwa.notifyDueAlerts(RiceOS.alerts.notificationAlerts());
          U.toast(count ? `${count}件の通知を出しました` : "通知を有効にしました");
        }
      });
    });

    const updateButton = document.querySelector('[data-action="force-update"]');
    if (updateButton) {
      updateButton.addEventListener("click", () => {
        if (RiceOS.pwa) RiceOS.pwa.forceUpdate();
        else location.reload();
      });
    }

    U.$$("[data-jump-screen]").forEach((button) => {
      button.addEventListener("click", () => show(button.dataset.jumpScreen));
    });

    U.$$(".quick-button[data-work-shortcut]").forEach((button) => {
      button.addEventListener("click", () => {
        show("field-work");
        RiceOS.screens.fieldWork.prefillWorkName(button.dataset.workShortcut);
      });
    });
  }

  function initializeFormDefaults() {
    renderAll();
    if (RiceOS.screens.fieldWork) RiceOS.screens.fieldWork.resetForm();
    if (RiceOS.screens.growth) RiceOS.screens.growth.resetForm();
    if (RiceOS.screens.dryPeriod) RiceOS.screens.dryPeriod.resetForm();
    if (RiceOS.screens.irrigation) RiceOS.screens.irrigation.resetForm();
    if (RiceOS.screens.otherWork) RiceOS.screens.otherWork.resetForm();
    if (RiceOS.screens.materials) RiceOS.screens.materials.resetForm();
    if (RiceOS.screens.results) RiceOS.screens.results.resetForm();
    renderAll();
  }

  function init() {
    activeScreen = initialScreen();
    U.$("todayLabel").textContent = U.fd(U.today());
    bindNav();
    bindScreens();
    bindGlobalActions();
    if (RiceOS.pwa) RiceOS.pwa.register();
    window.addEventListener("riceos:datachange", (event) => {
      markSaved(event.detail && event.detail.message);
      renderAll();
      if (RiceOS.pwa && RiceOS.alerts) RiceOS.pwa.notifyDueAlerts(RiceOS.alerts.notificationAlerts());
      U.toast(event.detail && event.detail.message || "保存しました");
    });
    initializeFormDefaults();
    show(activeScreen);
    if (RiceOS.pwa && RiceOS.alerts) RiceOS.pwa.notifyDueAlerts(RiceOS.alerts.notificationAlerts());
    markSaved("保存準備完了");
  }

  RiceOS.app = {
    init,
    show,
    renderAll,
    markSaved
  };

  document.addEventListener("DOMContentLoaded", init);
})();
