(function () {
  "use strict";

  const RiceOS = window.RiceOS = window.RiceOS || {};
  const U = RiceOS.utils;

  let activeScreen = "home";
  let inputOriginScreen = "";
  let bound = false;
  const initialScreens = new Set([
    "home",
    "fields",
    "annual",
    "outlook",
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
    "results",
    "other-work"
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

  function updateBackButton() {
    const button = U.$("appBackButton");
    if (!button) return;
    const mod = screenModule(activeScreen);
    const hasRoute = Boolean(RiceOS.navigation && RiceOS.navigation.current && RiceOS.navigation.current());
    const sheetOpen = Boolean(RiceOS.bottomSheet && RiceOS.bottomSheet.isOpen && RiceOS.bottomSheet.isOpen());
    const canGoBack = sheetOpen || hasRoute || Boolean(inputOriginScreen) || Boolean(mod && typeof mod.canHandleBack === "function" && mod.canHandleBack());
    button.classList.toggle("hidden", !canGoBack);
  }

  function show(screenId, options) {
    const opts = options || {};
    if (!initialScreens.has(screenId)) screenId = "home";
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
    updateBackButton();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function back() {
    // The record sheet is a temporary layer over its origin screen. Close it
    // first so Home/Calendar state and any selected calendar date remain.
    if (RiceOS.bottomSheet && RiceOS.bottomSheet.isOpen && RiceOS.bottomSheet.isOpen()) {
      RiceOS.bottomSheet.close();
      updateBackButton();
      return;
    }
    // Close temporary review layers before walking back through selected fields.
    if (activeScreen === "annual" && RiceOS.screens.annual && RiceOS.screens.annual.hasTransientBackState && RiceOS.screens.annual.hasTransientBackState()) {
      RiceOS.screens.annual.handleBack();
      updateBackButton();
      return;
    }
    if (RiceOS.navigation && RiceOS.navigation.back && RiceOS.navigation.back()) {
      updateBackButton();
      return;
    }
    // New records opened from the date sheet are not routes yet. Keep their
    // source tab so cancelling an input never strands the user on a form.
    if (inputOriginScreen) {
      const origin = inputOriginScreen;
      inputOriginScreen = "";
      show(origin, { skipHistory: true });
      return;
    }
    const mod = screenModule(activeScreen);
    if (mod && typeof mod.handleBack === "function" && mod.handleBack()) {
      updateBackButton();
    }
  }

  function markSaved(message, statusValue) {
    const status = U.$("saveStatus");
    if (!status) return;
    const state = statusValue || "saved";
    status.dataset.saveState = state;
    status.textContent = message || "保存しました";
    clearTimeout(window.__riceSaveStatusTimer);
    if (state === "saved") {
      window.__riceSaveStatusTimer = setTimeout(() => {
        status.textContent = "保存済み";
        status.dataset.saveState = "idle";
      }, 1800);
    }
  }

  function openInput(screenId, originScreen) {
    inputOriginScreen = originScreen || activeScreen || "home";
    show(screenId, { skipHistory: true });
    updateBackButton();
  }

  function clearInputOrigin() {
    inputOriginScreen = "";
    updateBackButton();
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
    const primaryLabels = {
      home: "ホーム",
      calendar: "カレンダー",
      "field-work": "記録入力",
      fields: "圃場",
      annual: "振り返り",
      outlook: "見通し",
      data: "管理"
    };
    Object.keys(primaryLabels).forEach((screenId) => {
      const label = document.querySelector(`[data-screen="${screenId}"] .nav-label`);
      if (label) label.textContent = primaryLabels[screenId];
    });
    U.$$(".nav-item").forEach((button) => {
      button.addEventListener("click", () => {
        clearInputOrigin();
        if (activeScreen === "annual" && RiceOS.screens.annual && RiceOS.screens.annual.resetNavigation) {
          RiceOS.screens.annual.resetNavigation();
        }
        if (button.dataset.screen === "field-work" && RiceOS.bottomSheet) {
          // Record input starts a new task. Do not leave an old field-detail
          // route behind the temporary sheet, or the next back press can jump
          // to an unrelated screen after the sheet is dismissed.
          if (RiceOS.navigation && RiceOS.navigation.clear) RiceOS.navigation.clear();
          window.scrollTo({ top: 0, behavior: "smooth" });
          RiceOS.bottomSheet.open(U.today());
          return;
        }
        if (button.dataset.screen === activeScreen) {
          if (RiceOS.navigation && RiceOS.navigation.clear) RiceOS.navigation.clear();
          const mod = screenModule(activeScreen);
          if (mod && typeof mod.resetNavigation === "function") mod.resetNavigation();
          window.scrollTo({ top: 0, behavior: "smooth" });
          return;
        }
        // Outlook detail is an in-screen view, not a navigation-stack route.
        // Clear it explicitly before moving to another independent tab.
        if (activeScreen === "outlook" && RiceOS.screens.outlook && RiceOS.screens.outlook.resetNavigation) {
          RiceOS.screens.outlook.resetNavigation();
        }
        if (RiceOS.navigation && RiceOS.navigation.clear) RiceOS.navigation.clear();
        show(button.dataset.screen, { skipHistory: true });
      });
    });
    const backButton = U.$("appBackButton");
    if (backButton) backButton.addEventListener("click", back);
  }

  function bindGlobalActions() {
    const addVarietyButton = document.querySelector('[data-action="add-variety"]');
    if (addVarietyButton) addVarietyButton.addEventListener("click", () => {
      const name = prompt("追加する品種名");
      if (name === null) return;
      const varietyId = RiceOS.state.addVariety(name);
      if (!varietyId) return;
      show("recipes");
    });

    const addFieldButton = document.querySelector('[data-action="add-field"]');
    if (addFieldButton) addFieldButton.addEventListener("click", () => {
      const name = prompt("追加する圃場名");
      if (name === null) return;
      const fieldId = RiceOS.state.addField(name);
      if (!fieldId) return;
      show("fields");
      if (RiceOS.screens.fields && RiceOS.screens.fields.openField) RiceOS.screens.fields.openField(fieldId, "settings");
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
        if (!confirm("最新版を読み込みます。保存していない入力内容は失われるため、必要な記録は先に保存してください。")) return;
        if (RiceOS.pwa) RiceOS.pwa.forceUpdate();
        else location.reload();
      });
    }

    document.addEventListener("click", (event) => {
      const jump = event.target.closest("[data-jump-screen]");
      if (!jump) return;
      const target = jump.dataset.jumpScreen;
      if (!target || !initialScreens.has(target)) {
        console.warn("Unknown rice-os screen target:", target);
        return;
      }
      event.preventDefault();
      show(target);
      if (target === "irrigation" && jump.dataset.waterType && RiceOS.screens.irrigation) {
        const firstField = RiceOS.state.activeFields()[0];
        RiceOS.screens.irrigation.prefillDate(U.today(), firstField && firstField.fieldId, jump.dataset.waterType);
      }
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

  function resetNestedScreens() {
    ["annual", "fields", "outlook"].forEach((screenId) => {
      const mod = screenModule(screenId);
      if (mod && typeof mod.resetNavigation === "function") mod.resetNavigation();
    });
  }

  function routeToField(route) {
    const fieldId = route && route.fieldId;
    if (!fieldId) return false;
    const options = route.options || {};
    if (options.destination === "annual-history" && RiceOS.screens.annual && RiceOS.screens.annual.openField) {
      show("annual", { skipHistory: true });
      RiceOS.screens.annual.openField(fieldId, options.tab || "karte");
      return true;
    }
    if (!RiceOS.screens.fields || !RiceOS.screens.fields.openField) return false;
    // A field is always opened through the single field-detail screen.
    // Annual review remains the origin for record editing, not a competing field detail.
    show("fields", { skipHistory: true });
    RiceOS.screens.fields.openField(fieldId);
    return true;
  }

  function routeToRecord(route) {
    const kind = route && route.kind;
    const id = route && route.id;
    if (!kind || !id) return false;
    if ((kind === "work" || kind === "fieldWork") && RiceOS.screens.fieldWork) {
      show("field-work", { skipHistory: true });
      RiceOS.screens.fieldWork.editWork(id);
      return true;
    }
    if (kind === "growth" && RiceOS.screens.growth) {
      show("growth", { skipHistory: true });
      RiceOS.screens.growth.editLog(id);
      return true;
    }
    if ((kind === "dry" || kind === "irrigation") && RiceOS.screens.annual) {
      show("annual", { skipHistory: true });
      return RiceOS.screens.annual.openWaterEditor(kind, id);
    }
    if (kind === "other" && RiceOS.screens.otherWork) {
      show("other-work", { skipHistory: true });
      RiceOS.screens.otherWork.editWork(id);
      return true;
    }
    return false;
  }

  function routeBack(destination, leaving) {
    const options = leaving && leaving.options || {};
    // A review field switch is a filter, so an edited B record returns to B
    // even when the underlying navigation route originated from field A.
    if (leaving && leaving.type === "record" && options.originScreen === "annual" && options.returnToAnnualFieldId && RiceOS.screens.annual && RiceOS.screens.annual.openField) {
      show("annual", { skipHistory: true });
      RiceOS.screens.annual.openField(options.returnToAnnualFieldId, options.returnToAnnualTab || options.tab || "karte");
      return true;
    }
    if (destination && destination.type === "field") return routeToField(destination);
    if (destination && destination.type === "record") return routeToRecord(destination);
    // Annual history can be opened from a field detail even when that detail
    // was reached without a navigation-stack entry. Keep the return target
    // deterministic instead of reopening the annual history view.
    if (options.destination === "annual-history" && leaving && leaving.fieldId && RiceOS.screens.fields && RiceOS.screens.fields.openField) {
      show("fields", { skipHistory: true });
      RiceOS.screens.fields.openField(leaving.fieldId);
      return true;
    }
    const origin = options.originScreen || "annual";
    if (origin === "calendar") {
      if (RiceOS.screens.fields && RiceOS.screens.fields.resetNavigation) RiceOS.screens.fields.resetNavigation();
      show("calendar", { skipHistory: true });
      return true;
    }
    if (options.fieldId && RiceOS.screens.annual && RiceOS.screens.annual.openField) {
      show("annual", { skipHistory: true });
      RiceOS.screens.annual.openField(options.fieldId, options.tab || "karte");
      return true;
    }
    if (origin === "annual" && RiceOS.screens.annual && RiceOS.screens.annual.resetNavigation) {
      RiceOS.screens.annual.resetNavigation();
    }
    if (RiceOS.screens.fields && RiceOS.screens.fields.resetNavigation) {
      RiceOS.screens.fields.resetNavigation();
    }
    show(origin, { skipHistory: true });
    return true;
  }

  function configureNavigation() {
    if (!RiceOS.navigation || !RiceOS.navigation.configure) return;
    RiceOS.navigation.configure({
      onOpenField: routeToField,
      onOpenRecord: routeToRecord,
      onBack: routeBack,
      onClear: () => {
        resetNestedScreens();
        return true;
      }
    });
  }

  function init() {
    activeScreen = initialScreen();
    U.$("todayLabel").textContent = U.fd(U.today());
    bindNav();
    bindScreens();
    bindGlobalActions();
    configureNavigation();
    window.addEventListener("riceos:navigationchange", updateBackButton);
    if (RiceOS.pwa) RiceOS.pwa.register();
    if (RiceOS.weather && RiceOS.weather.repairStoredWeatherLabels) {
      const meta = RiceOS.state.data().meta || {};
      if (meta.weatherLabelRepairVersion !== "20260629_ver80") RiceOS.weather.repairStoredWeatherLabels();
    }
    window.addEventListener("riceos:datachange", (event) => {
      markSaved(event.detail && event.detail.message, event.detail && event.detail.status);
      if (event.detail && event.detail.status === "saving") return;
      const mod = screenModule(activeScreen);
      if (!mod || !mod.preserveOnDataChange) renderAll();
      if (RiceOS.pwa && RiceOS.alerts) RiceOS.pwa.notifyDueAlerts(RiceOS.alerts.notificationAlerts());
      const message = event.detail && event.detail.message || "保存しました";
      const canUndo = event.detail && event.detail.status === "saved" && !/戻しました|復元しました/.test(message);
      U.toast(message, canUndo ? {
        actionLabel: "取り消す",
        duration: 4500,
        onAction: () => RiceOS.state.undoLastSave()
      } : undefined);
    });
    initializeFormDefaults();
    show(activeScreen, { skipHistory: true });
    if (RiceOS.pwa && RiceOS.alerts) RiceOS.pwa.notifyDueAlerts(RiceOS.alerts.notificationAlerts());
    markSaved("保存準備完了", "saved");
  }

  RiceOS.app = {
    init,
    show,
    openInput,
    back,
    clearInputOrigin,
    syncBackButton: updateBackButton,
    currentScreen: () => activeScreen,
    renderAll,
    markSaved
  };

  document.addEventListener("DOMContentLoaded", init);
})();
