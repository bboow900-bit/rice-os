(function () {
  "use strict";

  const RiceOS = window.RiceOS = window.RiceOS || {};

  const $ = (id) => document.getElementById(id);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

  function pad2(value) {
    return String(value).padStart(2, "0");
  }

  function today() {
    const d = new Date();
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  }

  function now() {
    return new Date().toISOString();
  }

  function localDate(dateText) {
    if (!dateText) return null;
    const d = new Date(`${dateText}T00:00:00`);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  function weekday(dateText) {
    const d = localDate(dateText);
    return d ? ["日", "月", "火", "水", "木", "金", "土"][d.getDay()] : "";
  }

  function fd(dateText) {
    const d = localDate(dateText);
    if (!d) return "";
    return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}(${weekday(dateText)})`;
  }

  function season(dateText) {
    const d = localDate(dateText);
    return d ? d.getFullYear() : new Date().getFullYear();
  }

  function monthKey(dateText) {
    const d = localDate(dateText);
    return d ? `${d.getFullYear()}年${d.getMonth() + 1}月` : "日付未設定";
  }

  function id(prefix, dateText) {
    const d = (dateText || today()).replaceAll("-", "");
    const stamp = Date.now().toString(36);
    const rand = Math.random().toString(36).slice(2, 7);
    return `${prefix}_${d}_${stamp}_${rand}`;
  }

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function escapeHTML(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function attr(value) {
    return escapeHTML(value).replaceAll("`", "&#096;");
  }

  function number(value, fallback = 0) {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
  }

  function daysBetween(fromDate, toDate) {
    const a = localDate(fromDate);
    const b = localDate(toDate);
    if (!a || !b) return "";
    return Math.round((b.getTime() - a.getTime()) / 86400000);
  }

  function daysAfterPlanting(field, dateText) {
    if (!field || !field.plantingDate || !dateText) return "";
    return daysBetween(field.plantingDate, dateText);
  }

  function daysSince(dateText) {
    if (!dateText) return "";
    return daysBetween(dateText, today());
  }

  function parseWorkHours(value) {
    const text = String(value || "").trim();
    if (!text) return 0;
    const normalized = text.replace(/[０-９．]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xFEE0));
    const hour = normalized.match(/([\d.]+)\s*(時間|h|H)/);
    const minute = normalized.match(/([\d.]+)\s*(分|m|M)/);
    if (hour || minute) {
      return number(hour && hour[1], 0) + number(minute && minute[1], 0) / 60;
    }
    return number(normalized, 0);
  }

  function formatHours(hours) {
    const n = number(hours, 0);
    if (!n) return "0時間";
    const rounded = Math.round(n * 10) / 10;
    return `${rounded}時間`;
  }

  function dateAddDays(dateText, days) {
    const d = localDate(dateText);
    if (!d) return "";
    d.setDate(d.getDate() + days);
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  }

  function lastYearSamePeriod(centerDate, rangeDays) {
    const d = localDate(centerDate || today());
    if (!d) return { start: "", end: "" };
    d.setFullYear(d.getFullYear() - 1);
    const center = `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
    return {
      center,
      start: dateAddDays(center, -rangeDays),
      end: dateAddDays(center, rangeDays)
    };
  }

  function inDateRange(dateText, start, end) {
    const d = localDate(dateText);
    const s = localDate(start);
    const e = localDate(end);
    return Boolean(d && s && e && d >= s && d <= e);
  }

  function setOptions(select, options, value) {
    if (!select) return;
    select.innerHTML = options.map((opt) => {
      const item = typeof opt === "string" ? { value: opt, label: opt } : opt;
      return `<option value="${attr(item.value)}" ${String(item.value) === String(value) ? "selected" : ""}>${escapeHTML(item.label)}</option>`;
    }).join("");
  }

  function toast(message) {
    const el = $("toast");
    if (!el) return;
    el.textContent = message;
    el.classList.remove("hidden");
    clearTimeout(window.__riceToastTimer);
    window.__riceToastTimer = setTimeout(() => el.classList.add("hidden"), 1800);
  }

  function download(filename, content, type) {
    const blob = new Blob([content], { type });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1200);
  }

  function readFileText(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = () => reject(reader.error || new Error("ファイルを読めませんでした"));
      reader.readAsText(file);
    });
  }

  function imageFileToDataUrl(file, maxSize = 900, quality = 0.72) {
    return new Promise((resolve, reject) => {
      if (!file) {
        resolve("");
        return;
      }
      const reader = new FileReader();
      reader.onerror = () => reject(reader.error || new Error("写真を読めませんでした"));
      reader.onload = () => {
        const img = new Image();
        img.onerror = () => reject(new Error("写真を読み込めませんでした"));
        img.onload = () => {
          const scale = Math.min(maxSize / img.width, maxSize / img.height, 1);
          const canvas = document.createElement("canvas");
          canvas.width = Math.max(1, Math.round(img.width * scale));
          canvas.height = Math.max(1, Math.round(img.height * scale));
          const ctx = canvas.getContext("2d");
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          resolve(canvas.toDataURL("image/jpeg", quality));
        };
        img.src = String(reader.result || "");
      };
      reader.readAsDataURL(file);
    });
  }

  RiceOS.utils = {
    $,
    $$,
    today,
    now,
    fd,
    weekday,
    season,
    monthKey,
    id,
    clone,
    escapeHTML,
    attr,
    number,
    daysBetween,
    daysAfterPlanting,
    daysSince,
    parseWorkHours,
    formatHours,
    dateAddDays,
    lastYearSamePeriod,
    inDateRange,
    setOptions,
    toast,
    download,
    readFileText,
    imageFileToDataUrl
  };
})();
