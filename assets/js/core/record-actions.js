(function () {
  "use strict";

  const RiceOS = window.RiceOS = window.RiceOS || {};
  const state = RiceOS.state;

  function idFor(kind, record) {
    if (!record) return "";
    if (kind === "work" || kind === "fieldWork") return record.workId || "";
    if (kind === "growth") return record.logId || "";
    if (kind === "dry") return record.dryPeriodId || "";
    if (kind === "irrigation") return record.irrigationId || "";
    if (kind === "schedule") return record.scheduleId || "";
    if (kind === "other") return record.otherWorkId || "";
    return record.id || "";
  }

  function labelFor(kind) {
    if (kind === "work" || kind === "fieldWork") return "圃場作業";
    if (kind === "growth") return "生育ログ";
    if (kind === "dry") return "中干し記録";
    if (kind === "irrigation") return "水管理記録";
    if (kind === "schedule") return "予定";
    if (kind === "other") return "その他作業";
    return "記録";
  }

  function editSchedule(record) {
    const title = prompt("予定名", record.title || record.scheduleType || "");
    if (title === null) return;
    const memo = prompt("メモ", record.memo || "");
    if (memo === null) return;
    state.saveSchedule({ ...record, title, scheduleType: title, memo });
  }

  function edit(kind, record) {
    if (!record) return false;
    if ((kind === "work" || kind === "fieldWork") && RiceOS.screens.fieldWork) {
      RiceOS.app.show("field-work");
      RiceOS.screens.fieldWork.editWork(record.workId);
      return true;
    }
    if (kind === "growth" && RiceOS.screens.growth) {
      RiceOS.app.show("growth");
      RiceOS.screens.growth.editLog(record.logId);
      return true;
    }
    if (kind === "dry" && RiceOS.screens.dryPeriod) {
      RiceOS.app.show("dry-period");
      RiceOS.screens.dryPeriod.editDry(record.dryPeriodId);
      return true;
    }
    if (kind === "irrigation" && RiceOS.screens.irrigation) {
      RiceOS.app.show("irrigation");
      RiceOS.screens.irrigation.editIrrigation(record.irrigationId);
      return true;
    }
    if (kind === "schedule") {
      editSchedule(record);
      return true;
    }
    return false;
  }

  function remove(kind, record) {
    if (!record) return false;
    if (!confirm(`この${labelFor(kind)}を削除しますか？`)) return false;
    if (kind === "work" || kind === "fieldWork") state.deleteFieldWork(record.workId);
    else if (kind === "growth") state.deleteGrowthLog(record.logId);
    else if (kind === "dry") state.deleteDryPeriod(record.dryPeriodId);
    else if (kind === "irrigation") state.deleteIrrigation(record.irrigationId);
    else if (kind === "schedule") state.deleteSchedule(record.scheduleId);
    else if (kind === "other") state.deleteOtherWork(record.otherWorkId);
    else return false;
    return true;
  }

  RiceOS.recordActions = { idFor, edit, remove };
})();
