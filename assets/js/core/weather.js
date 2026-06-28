(function () {
  "use strict";

  const RiceOS = window.RiceOS = window.RiceOS || {};
  const U = RiceOS.utils;

  const DAILY_PARAMS = [
    "weather_code",
    "temperature_2m_max",
    "temperature_2m_min",
    "temperature_2m_mean",
    "precipitation_sum"
  ].join(",");

  const WEATHER_LABELS = {
    0: "快晴",
    1: "晴れ",
    2: "薄曇り",
    3: "曇り",
    45: "霧",
    48: "霧氷",
    51: "弱い霧雨",
    53: "霧雨",
    55: "強い霧雨",
    56: "弱い凍雨",
    57: "強い凍雨",
    61: "小雨",
    63: "雨",
    65: "強い雨",
    66: "弱い凍雨",
    67: "強い凍雨",
    71: "弱い雪",
    73: "雪",
    75: "大雪",
    77: "雪粒",
    80: "にわか雨",
    81: "強いにわか雨",
    82: "激しいにわか雨",
    85: "にわか雪",
    86: "強いにわか雪",
    95: "雷雨",
    96: "ひょうを伴う雷雨",
    99: "強いひょうを伴う雷雨"
  };

  const GEO_MAXIMUM_AGE_MS = 5 * 60 * 1000;
  const GEO_STALE_MS = 12 * 60 * 60 * 1000;

  function weatherLabel(code) {
    return WEATHER_LABELS[Number(code)] || `天気コード${code}`;
  }

  function round(value) {
    const n = Number(value);
    return Number.isFinite(n) ? Math.round(n * 10) / 10 : "";
  }

  function updatedAtMs(location) {
    const t = location && location.updatedAt ? Date.parse(location.updatedAt) : NaN;
    return Number.isFinite(t) ? t : 0;
  }

  function isGeolocation(location) {
    return String(location && location.source || "") === "geolocation" || String(location && location.label || "") === "現在地";
  }

  function isStaleCurrentLocation(location) {
    if (!location || !isGeolocation(location)) return false;
    const updated = updatedAtMs(location);
    return !updated || Date.now() - updated > GEO_STALE_MS;
  }

  function locationText(location) {
    if (!location) return "位置未設定";
    const lat = Number(location.latitude);
    const lon = Number(location.longitude);
    const coords = Number.isFinite(lat) && Number.isFinite(lon) ? `${lat.toFixed(5)}, ${lon.toFixed(5)}` : "";
    const accuracy = location.accuracy ? `精度約${Math.round(location.accuracy)}m` : "";
    return [location.label || "取得位置", coords, accuracy].filter(Boolean).join(" / ");
  }

  function isPastDate(dateText) {
    return String(dateText || "") < U.today();
  }

  function endpointFor(dateText) {
    return isPastDate(dateText)
      ? "https://archive-api.open-meteo.com/v1/archive"
      : "https://api.open-meteo.com/v1/forecast";
  }

  function buildUrl(dateText, location) {
    const url = new URL(endpointFor(dateText));
    url.searchParams.set("latitude", String(location.latitude));
    url.searchParams.set("longitude", String(location.longitude));
    url.searchParams.set("daily", DAILY_PARAMS);
    url.searchParams.set("timezone", "Asia/Tokyo");
    url.searchParams.set("start_date", dateText);
    url.searchParams.set("end_date", dateText);
    return url.toString();
  }

  function buildRangeUrl(startDate, endDate, location, endpoint) {
    const url = new URL(endpoint);
    url.searchParams.set("latitude", String(location.latitude));
    url.searchParams.set("longitude", String(location.longitude));
    url.searchParams.set("daily", DAILY_PARAMS);
    url.searchParams.set("timezone", "Asia/Tokyo");
    url.searchParams.set("start_date", startDate);
    url.searchParams.set("end_date", endDate);
    return url.toString();
  }

  function dailyValue(daily, key) {
    const arr = daily && daily[key];
    return Array.isArray(arr) ? arr[0] : "";
  }

  async function fetchDaily(dateText, location) {
    if (!dateText) throw new Error("作業日を入力してください。");
    if (!location || location.latitude === undefined || location.longitude === undefined) {
      throw new Error("天気取得位置が未設定です。");
    }
    const url = buildUrl(dateText, location);
    const response = await fetch(url);
    if (!response.ok) throw new Error(`天気APIエラー: ${response.status}`);
    const json = await response.json();
    if (json.error) throw new Error(json.reason || "天気を取得できませんでした。");
    const daily = json.daily || {};
    const code = dailyValue(daily, "weather_code");
    const result = {
      date: dateText,
      source: isPastDate(dateText) ? "Open-Meteo Archive" : "Open-Meteo Forecast",
      latitude: Number(location.latitude),
      longitude: Number(location.longitude),
      label: location.label || "取得位置",
      weatherCode: code,
      weather: weatherLabel(code),
      tempMax: round(dailyValue(daily, "temperature_2m_max")),
      tempMin: round(dailyValue(daily, "temperature_2m_min")),
      tempMean: round(dailyValue(daily, "temperature_2m_mean")),
      precipitation: round(dailyValue(daily, "precipitation_sum")),
      fetchedAt: U.now()
    };
    result.summary = formatSummary(result);
    return result;
  }

  async function fetchDailyRange(startDate, endDate, location) {
    if (!startDate || !endDate) throw new Error("開始日と終了日を指定してください。");
    if (!location || location.latitude === undefined || location.longitude === undefined) {
      throw new Error("天気取得位置が未設定です。");
    }
    const today = U.today();
    const ranges = [];
    if (startDate < today) {
      const archiveEnd = endDate < today ? endDate : addDays(today, -1);
      if (startDate <= archiveEnd) {
        ranges.push({
          source: "Open-Meteo Archive",
          url: buildRangeUrl(startDate, archiveEnd, location, "https://archive-api.open-meteo.com/v1/archive")
        });
      }
    }
    if (endDate >= today) {
      const forecastStart = startDate > today ? startDate : today;
      ranges.push({
        source: "Open-Meteo Forecast",
        url: buildRangeUrl(forecastStart, endDate, location, "https://api.open-meteo.com/v1/forecast")
      });
    }

    const rows = [];
    for (const range of ranges) {
      const response = await fetch(range.url);
      if (!response.ok) throw new Error(`天気APIエラー: ${response.status}`);
      const json = await response.json();
      if (json.error) throw new Error(json.reason || "天気を取得できませんでした。");
      const daily = json.daily || {};
      const dates = daily.time || [];
      dates.forEach((date, index) => {
        rows.push({
          date,
          source: range.source,
          weatherCode: Array.isArray(daily.weather_code) ? daily.weather_code[index] : "",
          tempMax: round(Array.isArray(daily.temperature_2m_max) ? daily.temperature_2m_max[index] : ""),
          tempMin: round(Array.isArray(daily.temperature_2m_min) ? daily.temperature_2m_min[index] : ""),
          tempMean: round(Array.isArray(daily.temperature_2m_mean) ? daily.temperature_2m_mean[index] : ""),
          precipitation: round(Array.isArray(daily.precipitation_sum) ? daily.precipitation_sum[index] : "")
        });
      });
    }
    rows.sort((a, b) => String(a.date).localeCompare(String(b.date)));
    const valid = rows.filter((row) => row.tempMean !== "");
    const total = valid.reduce((sum, row) => sum + Number(row.tempMean), 0);
    return {
      startDate,
      endDate,
      rows,
      count: valid.length,
      total: Math.round(total * 10) / 10,
      location,
      fetchedAt: U.now()
    };
  }

  function addDays(dateText, diff) {
    const d = U.localDate ? U.localDate(dateText) : new Date(`${dateText}T00:00:00`);
    d.setDate(d.getDate() + diff);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }

  function formatSummary(weather) {
    if (!weather) return "";
    const temp = weather.tempMean !== ""
      ? `平均${weather.tempMean}℃`
      : `最高${weather.tempMax}℃ / 最低${weather.tempMin}℃`;
    const range = weather.tempMean !== "" ? `最高${weather.tempMax}℃ 最低${weather.tempMin}℃` : "";
    const rain = weather.precipitation !== "" ? `降水${weather.precipitation}mm` : "";
    return [weather.weather, temp, range, rain].filter(Boolean).join(" / ");
  }

  function currentPosition() {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        reject(new Error("このブラウザでは現在地を取得できません。"));
        return;
      }
      if (window.isSecureContext === false) {
        reject(new Error("ChromeではHTTP接続の現在地取得が制限されます。地名検索か位置を手入力してください。"));
        return;
      }
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          resolve({
            latitude: Math.round(pos.coords.latitude * 100000) / 100000,
            longitude: Math.round(pos.coords.longitude * 100000) / 100000,
            accuracy: Math.round(pos.coords.accuracy || 0),
            label: "現在地",
            source: "geolocation",
            updatedAt: U.now()
          });
        },
        () => reject(new Error("現在地を取得できませんでした。ブラウザの位置情報許可を確認してください。")),
        { enableHighAccuracy: true, timeout: 15000, maximumAge: GEO_MAXIMUM_AGE_MS }
      );
    });
  }

  async function searchPlace(name) {
    const q = String(name || "").trim();
    if (!q) throw new Error("地名を入力してください。");
    const url = new URL("https://geocoding-api.open-meteo.com/v1/search");
    url.searchParams.set("name", q);
    url.searchParams.set("count", "1");
    url.searchParams.set("language", "ja");
    url.searchParams.set("format", "json");
    const response = await fetch(url.toString());
    if (!response.ok) throw new Error(`地名検索エラー: ${response.status}`);
    const json = await response.json();
    const item = json.results && json.results[0];
    if (!item) throw new Error("地名が見つかりませんでした。市町村名で試してください。");
    return {
      latitude: Math.round(Number(item.latitude) * 100000) / 100000,
      longitude: Math.round(Number(item.longitude) * 100000) / 100000,
      label: [item.name, item.admin1, item.country].filter(Boolean).join(" / "),
      source: "geocoding",
      updatedAt: U.now()
    };
  }

  async function ensureLocation(options) {
    const opts = options || {};
    const current = RiceOS.state.data().meta && RiceOS.state.data().meta.weatherLocation;
    if (!opts.refresh && current && current.latitude !== undefined && current.longitude !== undefined && !isStaleCurrentLocation(current)) return current;
    const location = await currentPosition();
    RiceOS.state.updateWeatherLocation(location);
    return location;
  }

  RiceOS.weather = {
    fetchDaily,
    formatSummary,
    weatherLabel,
    currentPosition,
    searchPlace,
    ensureLocation,
    locationText,
    fetchDailyRange
  };
})();
