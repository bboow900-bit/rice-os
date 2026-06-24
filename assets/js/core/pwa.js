(function () {
  "use strict";

  const RiceOS = window.RiceOS = window.RiceOS || {};
  const NOTIFIED_KEY = "rice_os_notified_alerts";

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
      return "このURLはHTTP接続なので、Chromeでは完全なPWA/オフライン機能が制限されます。右上メニューから「ホーム画面に追加」はできる場合があります。完全対応にはHTTPS公開が必要です。";
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

    navigator.serviceWorker.register("./service-worker.js?v=20260625_ver20")
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
      alert("この環境では通知バーへの表示が使えません。HTTPSのChromeで開いてください。");
      return false;
    }
    const permission = await Notification.requestPermission();
    if (permission !== "granted") {
      alert("通知が許可されませんでした。Chromeのサイト設定から通知を許可できます。");
      return false;
    }
    await showNotification("稲作カルテの通知を有効にしました", {
      body: "中干し・間断灌水・湿潤灌漑の目安日が近いとき、アプリを開いたタイミングで通知します。",
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
      await showNotification(`稲作カルテ: ${alert.title || "確認"}`, {
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

  async function forceUpdate() {
    if (canUseServiceWorker()) {
      const registrations = await navigator.serviceWorker.getRegistrations();
      await Promise.all(registrations.map((registration) => registration.update()));
    }
    if ("caches" in window) {
      const keys = await caches.keys();
      await Promise.all(keys.filter((key) => key.startsWith("rice-os-") || key.startsWith("rice-karte-")).map((key) => caches.delete(key)));
    }
    location.reload();
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
