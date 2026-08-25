(function () {
  "use strict";

  const RiceOS = window.RiceOS = window.RiceOS || {};
  const NOTIFIED_KEY = "rice_os_notified_alerts";
  const APP_VERSION = "20260825_ver260";
  const UPDATE_RELOAD_KEY = "rice_os_pwa_reload_version";

  let deferredPrompt = null;

  function isLocalhost() {
    return ["localhost", "127.0.0.1", "::1"].includes(location.hostname);
  }

  function canUseServiceWorker() {
    return "serviceWorker" in navigator && (window.isSecureContext || isLocalhost());
  }

  function canNotify() {
    return canUseServiceWorker() && "Notification" in window;
  }

  function installHelpText() {
    if (!window.isSecureContext && !isLocalhost()) {
      return "このURLはHTTP接続のため、ChromeではPWAやオフライン機能が制限されます。メニューから「ホーム画面に追加」できる場合があります。安定運用にはHTTPS公開が必要です。";
    }
    return "Chromeのメニューから「ホーム画面に追加」を選んでください。インストール候補が出た場合は、このボタンからも追加できます。";
  }

  function register() {
    window.addEventListener("beforeinstallprompt", (event) => {
      event.preventDefault();
      deferredPrompt = event;
      if (RiceOS.utils && RiceOS.utils.toast) RiceOS.utils.toast("ホーム画面に追加できます");
    });

    if (!canUseServiceWorker()) return;

    // Keep this URL stable. Older installed clients can then discover a new
    // worker instead of continuing to check only their old versioned URL.
    navigator.serviceWorker.register("./service-worker.js", { updateViaCache: "none" })
      .then((registration) => {
        registration.update();
      })
      .catch(() => {
        // PWA registration is an enhancement. The app should keep working.
      });
  }

  async function promptInstall() {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      await deferredPrompt.userChoice;
      deferredPrompt = null;
      return;
    }
    alert(installHelpText());
  }

  async function requestNotifications() {
    if (!canNotify()) {
      alert("この環境では通知を使えません。HTTPSのChromeで開いてください。");
      return false;
    }
    const permission = await Notification.requestPermission();
    if (permission !== "granted") {
      alert("通知が許可されませんでした。Chromeのサイト設定から通知を許可できます。");
      return false;
    }
    await showNotification("稲作カルテ 通知を有効にしました", {
      body: "中干し、間断灌水、湿潤灌漑などの目安日が近いときに通知します。",
      tag: "rice-os-notification-enabled"
    });
    return true;
  }

  async function showNotification(title, options) {
    if (!canNotify() || Notification.permission !== "granted") return false;
    const registration = await navigator.serviceWorker.ready;
    await registration.showNotification(title, {
      icon: "assets/icons/icon-192.png",
      badge: "assets/icons/icon-192.png",
      data: { url: location.href },
      ...options
    });
    return true;
  }

  function readNotified() {
    try {
      return JSON.parse(localStorage.getItem(NOTIFIED_KEY) || "{}");
    } catch (error) {
      return {};
    }
  }

  function writeNotified(value) {
    try {
      localStorage.setItem(NOTIFIED_KEY, JSON.stringify(value));
    } catch (error) {
      // Notification de-duplication is an enhancement.
    }
  }

  async function notifyDueAlerts(alerts) {
    if (!Array.isArray(alerts) || !alerts.length) return 0;
    if (!canNotify() || Notification.permission !== "granted") return 0;
    const today = RiceOS.utils ? RiceOS.utils.today() : new Date().toISOString().slice(0, 10);
    const sent = readNotified();
    sent[today] = sent[today] || {};
    let count = 0;
    for (const alert of alerts) {
      const key = alert.key || `${alert.type}:${alert.fieldId || ""}:${alert.date || today}`;
      if (sent[today][key]) continue;
      await showNotification(`稲作カルテ ${alert.title || "確認"}`, {
        body: `${alert.fieldName ? `${alert.fieldName}: ` : ""}${alert.message || ""}`,
        tag: key,
        renotify: false
      });
      sent[today][key] = true;
      count += 1;
    }
    writeNotified(sent);
    if (count && RiceOS.state && RiceOS.state.markNotificationCheck) RiceOS.state.markNotificationCheck();
    return count;
  }

  function currentVersionUrl() {
    const url = new URL(location.href);
    url.searchParams.set("v", APP_VERSION);
    return url.href;
  }

  function waitForControllerChange(timeoutMs) {
    return new Promise((resolve) => {
      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        navigator.serviceWorker.removeEventListener("controllerchange", finish);
        resolve();
      };
      navigator.serviceWorker.addEventListener("controllerchange", finish, { once: true });
      setTimeout(finish, timeoutMs);
    });
  }

  async function forceUpdate() {
    if (!canUseServiceWorker()) {
      location.replace(currentVersionUrl());
      return;
    }
    const registration = await navigator.serviceWorker.getRegistration()
      || await navigator.serviceWorker.register("./service-worker.js", { updateViaCache: "none" });
    const controllerChanged = waitForControllerChange(3500);
    await registration.update();
    if (registration.waiting) registration.waiting.postMessage({ type: "SKIP_WAITING" });
    await controllerChanged;
    try {
      sessionStorage.setItem(UPDATE_RELOAD_KEY, APP_VERSION);
    } catch (error) {
      // The versioned URL still makes a fresh page request when storage is unavailable.
    }
    location.replace(currentVersionUrl());
  }

  RiceOS.pwa = {
    register,
    promptInstall,
    requestNotifications,
    notifyDueAlerts,
    forceUpdate,
    canNotify,
    canUseServiceWorker,
    installHelpText
  };
})();






