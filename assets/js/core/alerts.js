(function () {
  "use strict";

  const RiceOS = window.RiceOS = window.RiceOS || {};
  const U = RiceOS.utils;

  const PRIORITY_ORDER = { urgent: 0, warn: 1, watch: 2, ok: 3, muted: 4 };

  function state() {
    return RiceOS.state;
  }

  function datePart(value) {
    return String(value || "").slice(0, 10);
  }

  function toneForPriority(priority) {
    if (priority === "urgent") return "bad";
    if (priority === "warn") return "warn";
    if (priority === "watch") return "info";
    if (priority === "ok") return "ok";
    return "";
  }

  function priorityLabel(priority) {
    if (priority === "urgent") return "急ぎ";
    if (priority === "warn") return "注意";
    if (priority === "watch") return "様子見";
    if (priority === "ok") return "問題なし";
    return "確認";
  }

  function leafScore(log) {
    if (!log) return "";
    return String(log.leafColorScore || RiceOS.schema.leafColorScoreFromText(log.leafColor || ""));
  }

  function leafText(score) {
    const level = RiceOS.schema.LEAF_COLOR_LEVELS.find((item) => String(item.value) === String(score));
    return level ? level.text : "";
  }

  function leafTone(score) {
    const level = RiceOS.schema.LEAF_COLOR_LEVELS.find((item) => String(item.value) === String(score));
    return level ? level.tone : "";
  }

  function waterAlertsForField(field, today) {
    const date = today || U.today();
    const alerts = [];

    const drainageDays = U.number(field.drainageTargetDays, 0);
    if (field.drainageStartDate && drainageDays > 0) {
      const endDate = U.dateAddDays(field.drainageStartDate, drainageDays);
      const remaining = U.daysBetween(date, endDate);
      if (remaining !== "") {
        let priority = "watch";
        let message = `中干し終了目安まであと${remaining}日`;
        if (remaining === 1) {
          priority = "warn";
          message = "中干し終了目安は明日です";
        } else if (remaining === 0) {
          priority = "urgent";
          message = "今日が中干し終了目安です";
        } else if (remaining < 0) {
          priority = "urgent";
          message = `中干し終了目安を${Math.abs(remaining)}日過ぎています`;
        } else if (remaining <= 3) {
          priority = "warn";
        }
        alerts.push({
          key: `drainage:${field.fieldId}:${endDate}`,
          type: "drainage",
          fieldId: field.fieldId,
          title: "中干し",
          message,
          date: endDate,
          remaining,
          priority,
          notify: remaining <= 1
        });
      }
    }

    const intervalDays = U.number(field.intermittentIntervalDays, 0);
    if (field.intermittentStartDate && intervalDays > 0) {
      const elapsed = U.daysBetween(field.intermittentStartDate, date);
      if (elapsed !== "") {
        let nextDate = field.intermittentStartDate;
        let remaining = 0;
        let message = "";
        let priority = "watch";
        if (elapsed < 0) {
          remaining = Math.abs(elapsed);
          message = `間断灌水開始まであと${remaining}日`;
          priority = remaining <= 3 ? "warn" : "watch";
        } else {
          const mod = elapsed % intervalDays;
          remaining = mod === 0 ? 0 : intervalDays - mod;
          nextDate = U.dateAddDays(date, remaining);
          if (remaining === 0) {
            message = "間断灌水の確認日です";
            priority = "urgent";
          } else if (remaining === 1) {
            message = "間断灌水の次回確認は明日です";
            priority = "warn";
          } else {
            message = `間断灌水の次回確認まであと${remaining}日`;
            priority = remaining <= 3 ? "warn" : "watch";
          }
        }
        alerts.push({
          key: `intermittent:${field.fieldId}:${nextDate}`,
          type: "intermittent",
          fieldId: field.fieldId,
          title: "間断灌水",
          message,
          date: nextDate,
          remaining,
          priority,
          notify: remaining <= 1
        });
      }
    }

    return alerts;
  }

  function lastYearRows(fieldId, rangeDays) {
    const range = U.lastYearSamePeriod(U.today(), rangeDays || 10);
    const works = state().fieldWorksFor(fieldId)
      .filter((w) => U.inDateRange(w.date, range.start, range.end))
      .map((w) => ({ date: w.date, label: w.workName, memo: w.memo || w.material || "" }));
    const growth = state().growthLogsFor(fieldId)
      .filter((g) => U.inDateRange(g.date, range.start, range.end))
      .map((g) => ({ date: g.date, label: "生育ログ", memo: `葉色:${g.leafColor} 雑草:${g.weed}` }));
    return [...works, ...growth].sort((a, b) => String(a.date).localeCompare(String(b.date)));
  }

  function backupAlert(data) {
    const meta = data && data.meta || {};
    const exported = datePart(meta.lastJsonExportAt);
    const days = exported ? U.daysSince(exported) : "";
    if (!exported) {
      return {
        key: `backup:none:${U.today()}`,
        type: "backup",
        title: "JSONバックアップ",
        message: "まだJSON保存日の記録がありません",
        priority: "warn",
        notify: false
      };
    }
    if (days !== "" && days >= 7) {
      return {
        key: `backup:${exported}:${U.today()}`,
        type: "backup",
        title: "JSONバックアップ",
        message: `前回のJSON保存から${days}日たっています`,
        priority: days >= 14 ? "urgent" : "warn",
        notify: days >= 14
      };
    }
    return null;
  }

  function komumeForField(field, baseSuggestions) {
    const lastGrowth = state().lastGrowthLog(field.fieldId);
    const lastGrowthAge = lastGrowth ? U.daysSince(lastGrowth.date) : "";
    const score = leafScore(lastGrowth);
    const water = waterAlertsForField(field);
    const lastYear = lastYearRows(field.fieldId, 10).slice(0, 3);
    const suggestions = (baseSuggestions || []).slice();
    const activeSuggestions = suggestions.filter((item) => !item.skip);

    let priority = "ok";
    if (water.some((item) => item.priority === "urgent")) priority = "urgent";
    else if (!lastGrowth || lastGrowthAge > 10 || water.some((item) => item.priority === "warn")) priority = "warn";
    else if (activeSuggestions.length) priority = "watch";

    const notes = [];
    if (score) {
      if (score === "1" || score === "2") notes.push(`葉色は${leafText(score)}寄りです。追肥や水管理は品種レシピと去年の流れを見て判断。`);
      if (score === "3") notes.push("葉色は標準域です。急な追肥より、次の水管理と雑草確認を優先。");
      if (score === "4" || score === "5") notes.push(`葉色は${leafText(score)}寄りです。追肥は急がず、倒伏リスクと天候を確認。`);
    } else {
      notes.push("葉色が未評価です。5段階で記録すると小梅の見立てが安定します。");
    }

    if (!lastGrowth || lastGrowthAge > 7) {
      notes.push(lastGrowth ? `生育ログが${lastGrowthAge}日前です。今日の葉色・雑草・水を軽く見ておくと安心。` : "生育ログがまだありません。最初の記録を作ると以後の判断がしやすくなります。");
    }
    water.slice(0, 2).forEach((item) => notes.push(item.message));
    if (lastYear.length) {
      const row = lastYear[0];
      notes.push(`去年の同時期は「${row.label}」の記録があります。時期ずれの確認材料にできます。`);
    }

    const doNow = [
      ...water.filter((item) => ["urgent", "warn"].includes(item.priority)).map((item) => item.message),
      ...activeSuggestions.slice(0, 2).map((item) => item.title)
    ];
    const avoid = suggestions.filter((item) => item.skip).map((item) => item.title);

    return {
      priority,
      priorityLabel: priorityLabel(priority),
      tone: toneForPriority(priority),
      opinion: notes[0] || "大きな抜けは見当たりません。記録を続けるだけで判断精度が上がります。",
      notes,
      doNow,
      avoid,
      water,
      lastYear,
      leafScore: score,
      leafTone: leafTone(score)
    };
  }

  function todayFocusItems() {
    const d = state().data();
    const items = [];
    state().activeFields().forEach((field) => {
      waterAlertsForField(field).forEach((alert) => {
        if (["urgent", "warn"].includes(alert.priority)) {
          items.push({ ...alert, fieldName: field.name });
        }
      });
      const lastGrowth = state().lastGrowthLog(field.fieldId);
      const age = lastGrowth ? U.daysSince(lastGrowth.date) : "";
      if (!lastGrowth || age > 10) {
        items.push({
          key: `growth:${field.fieldId}`,
          type: "growth",
          title: "生育ログ",
          fieldId: field.fieldId,
          fieldName: field.name,
          message: lastGrowth ? `生育ログが${age}日前です` : "生育ログが未記録です",
          priority: age > 14 || !lastGrowth ? "warn" : "watch",
          notify: false
        });
      }
    });
    const backup = backupAlert(d);
    if (backup) items.push({ ...backup, fieldName: "全体" });
    return items.sort((a, b) => {
      const p = PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority];
      if (p) return p;
      return String(a.date || "").localeCompare(String(b.date || ""));
    });
  }

  function notificationAlerts() {
    return todayFocusItems().filter((item) => item.notify);
  }

  function icsDate(dateText) {
    return String(dateText || "").replaceAll("-", "");
  }

  function escapeIcs(value) {
    return String(value || "")
      .replaceAll("\\", "\\\\")
      .replaceAll("\n", "\\n")
      .replaceAll(",", "\\,")
      .replaceAll(";", "\\;");
  }

  function calendarEventsForField(field) {
    const events = [];
    const drainageDays = U.number(field.drainageTargetDays, 0);
    if (field.drainageStartDate && drainageDays > 0) {
      const endDate = U.dateAddDays(field.drainageStartDate, drainageDays);
      events.push({
        date: endDate,
        title: `${field.name} 中干し終了目安`,
        description: `中干し開始: ${field.drainageStartDate} / 目安: ${drainageDays}日`
      });
    }
    const intervalDays = U.number(field.intermittentIntervalDays, 0);
    if (field.intermittentStartDate && intervalDays > 0) {
      let start = field.intermittentStartDate;
      const elapsed = U.daysBetween(start, U.today());
      if (elapsed !== "" && elapsed > 0) {
        const mod = elapsed % intervalDays;
        start = U.dateAddDays(U.today(), mod === 0 ? 0 : intervalDays - mod);
      }
      for (let i = 0; i < 8; i += 1) {
        const date = U.dateAddDays(start, intervalDays * i);
        events.push({
          date,
          title: `${field.name} 間断灌水確認`,
          description: `間断灌水開始: ${field.intermittentStartDate} / 間隔: ${intervalDays}日`
        });
      }
    }
    return events.filter((event) => event.date);
  }

  function downloadFieldCalendar(field) {
    const events = calendarEventsForField(field);
    if (!events.length) {
      alert("この圃場にはカレンダー登録できる水管理予定がありません。");
      return;
    }
    const stamp = new Date().toISOString().replace(/[-:.]/g, "").slice(0, 15);
    const lines = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//RiceOS//Water Alerts//JA",
      "CALSCALE:GREGORIAN"
    ];
    events.forEach((event, index) => {
      const date = icsDate(event.date);
      const end = icsDate(U.dateAddDays(event.date, 1));
      lines.push(
        "BEGIN:VEVENT",
        `UID:rice-os-${field.fieldId}-${date}-${index}@rice-os`,
        `DTSTAMP:${stamp}Z`,
        `DTSTART;VALUE=DATE:${date}`,
        `DTEND;VALUE=DATE:${end}`,
        `SUMMARY:${escapeIcs(event.title)}`,
        `DESCRIPTION:${escapeIcs(event.description)}`,
        "END:VEVENT"
      );
    });
    lines.push("END:VCALENDAR");
    U.download(`rice_os_water_${field.name || field.fieldId}.ics`, lines.join("\r\n"), "text/calendar;charset=utf-8");
  }

  RiceOS.alerts = {
    toneForPriority,
    priorityLabel,
    leafScore,
    leafText,
    leafTone,
    waterAlertsForField,
    lastYearRows,
    backupAlert,
    komumeForField,
    todayFocusItems,
    notificationAlerts,
    calendarEventsForField,
    downloadFieldCalendar
  };
})();
