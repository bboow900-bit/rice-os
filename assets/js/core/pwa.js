(function () {
  "use strict";

  const RiceOS = window.RiceOS = window.RiceOS || {};

  let deferredPrompt = null;

  function isLocalhost() {
    return ["localhost", "127.0.0.1", "::1"].includes(location.hostname);
  }

  function canUseServiceWorker() {
    return "serviceWorker" in navigator && (window.isSecureContext || isLocalhost());
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

    navigator.serviceWorker.register("./service-worker.js?v=20260623_pwa1")
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

  RiceOS.pwa = {
    register,
    promptInstall,
    canUseServiceWorker,
    installHelpText
  };
})();
