(function () {
  "use strict";

  const RiceOS = window.RiceOS = window.RiceOS || {};
  const state = RiceOS.state;
  const U = RiceOS.utils;
  const copy = (value) => U.clone(value);
  const array = (value) => Array.isArray(value) ? value : [];
  const object = (value) => !!value && typeof value === "object" && !Array.isArray(value);
  const validRow = (key, row) => object(row) && (key === "herbicideObservations"
    || (Array.isArray(row.steps) && row.steps.every(object)));
  const rows = (key) => array((state.data().meta || {})[key]).filter((row) => validRow(key, row));
  const text = (value) => String(value ?? "");

  function yearValue(value) {
    if (!/^\d{4}$/.test(text(value)) || Number(value) < 1) throw new Error("年度を指定してください。");
    return Number(value);
  }

  function commit(change, message) {
    let result;
    const saved = state.mutate((draft) => {
      if (draft.meta === undefined) draft.meta = {};
      if (!draft.meta || typeof draft.meta !== "object" || Array.isArray(draft.meta)) throw new Error("除草管理データの形式を確認してください。");
      ["herbicidePrograms", "herbicideAssignments", "herbicideObservations"].forEach((key) => {
        if (draft.meta[key] === undefined) draft.meta[key] = [];
        if (!Array.isArray(draft.meta[key]) || !draft.meta[key].every((row) => validRow(key, row))) throw new Error("除草管理データの形式を確認してください。");
      });
      result = change(draft.meta, draft);
    }, message);
    return saved ? copy(result) : null;
  }

  function reviewYears(value = 3) {
    const years = Number(value);
    if (!Number.isInteger(years) || years < 1 || years > 20 || typeof value === "boolean") throw new Error("見直し年数は1から20の整数で指定してください。");
    return years;
  }

  function materialFor(step, data) {
    if (!object(step)) throw new Error("工程の形式を確認してください。");
    if (!text(step.category).trim()) throw new Error("工程の区分を入力してください。");
    const materialId = text(step.materialId);
    const material = array(data.materials).find((item) => object(item) && item.materialId === materialId);
    if (materialId && !material) throw new Error("選択した資材が見つかりません。");
    return material;
  }

  function saveProgram(record) {
    return commit((draft, data) => {
      const input = record || {};
      const previous = draft.herbicidePrograms.find((item) => item.programId === input.programId);
      if (input.programId && !previous) throw new Error("体系が見つかりません。");
      const next = { ...previous, ...input };
      if (!text(next.name).trim()) throw new Error("体系名を入力してください。");
      if (!Array.isArray(next.steps) || !next.steps.length) throw new Error("工程を追加してください。");
      const ids = new Set();
      const steps = next.steps.map((step) => {
        if (!step || typeof step !== "object") throw new Error("工程の形式を確認してください。");
        const material = materialFor(step, data);
        const id = text(step.id || U.id("herbicide-step", U.today()));
        if (ids.has(id)) throw new Error("工程IDが重複しています。");
        ids.add(id);
        return { ...copy(step), id, category: text(step.category), materialId: text(step.materialId),
          materialName: material ? text(material.formalName || material.name) : text(step.materialName).trim(),
          plannedTiming: text(step.plannedTiming), purpose: text(step.purpose) };
      });
      const program = { ...next, programId: previous ? previous.programId : U.id("herbicide-program", U.today()),
        name: text(next.name).trim(), steps, reviewYears: reviewYears(next.reviewYears), revision: previous ? Number(previous.revision || 0) + 1 : 1,
        createdAt: previous ? previous.createdAt : U.now(), updatedAt: U.now() };
      if (previous) draft.herbicidePrograms[draft.herbicidePrograms.indexOf(previous)] = program;
      else draft.herbicidePrograms.push(program);
      return program;
    }, "除草体系を保存しました");
  }

  function assignProgram(options) {
    return commit((draft, data) => {
      const input = options || {};
      const year = yearValue(input.year);
      const program = draft.herbicidePrograms.find((item) => item.programId === input.programId);
      if (!program) throw new Error("体系を選択してください。");
      const years = reviewYears(program.reviewYears);
      if (!Array.isArray(program.steps) || !program.steps.length) throw new Error("工程を追加してください。");
      const steps = program.steps.map((step) => {
        const material = materialFor(step, data);
        return { ...copy(step), materialName: material ? text(material.formalName || material.name) : text(step.materialName).trim(),
          registrationNumber: material ? text(material.registrationNumber) : "" };
      });
      if (input.fieldIds !== undefined && !Array.isArray(input.fieldIds)) throw new Error("対象圃場を確認してください。");
      if (input.fieldGroupId && !(data.fieldGroups || []).some((group) => group.fieldGroupId === input.fieldGroupId)) throw new Error("圃場グループが見つかりません。");
      const groupedIds = input.fieldGroupId ? data.fields.filter((field) => field.fieldGroupId === input.fieldGroupId && !["休止", "終了"].includes(field.status)).map((field) => field.fieldId) : [];
      const fieldIds = [...new Set([...(input.fieldIds || []), ...groupedIds])];
      if (!fieldIds.length || fieldIds.some((id) => !data.fields.some((field) => field.fieldId === id))) throw new Error("対象圃場を選択してください。");
      return fieldIds.map((fieldId) => {
        const assignment = { assignmentId: U.id("herbicide-assignment", U.today()), fieldId, year,
          programId: program.programId, revision: program.revision, name: program.name,
          steps: copy(steps), reviewYears: years, active: true, createdAt: U.now() };
        draft.herbicideAssignments.filter((item) => item.fieldId === fieldId && Number(item.year) === year && item.active !== false).forEach((item) => {
          item.active = false;
          item.supersededBy = assignment.assignmentId;
          item.supersededAt = U.now();
        });
        draft.herbicideAssignments.push(assignment);
        return assignment;
      });
    }, "圃場に除草体系を設定しました");
  }

  function deleteProgram(programId) {
    return commit((draft, data) => {
      const previous = draft.herbicidePrograms.find((item) => item.programId === programId);
      if (!programId || !previous) throw new Error("体系が見つかりません。");
      // Include inactive annual assignments and imported historical references.
      const references = (value) => value && typeof value === "object"
        && (value.programId === programId || array(value.programIds).includes(programId)
          || Object.values(value).some(references));
      const otherData = { ...data, meta: { ...draft, herbicidePrograms: [] } };
      if (references(otherData)) throw new Error("年度割当・履歴で参照されている体系は削除できません。");
      draft.herbicidePrograms = draft.herbicidePrograms.filter((item) => item.programId !== programId);
      return previous;
    }, "除草体系を削除しました");
  }

  function saveObservation(record) {
    return commit((draft) => {
      const input = record || {};
      const previous = draft.herbicideObservations.find((item) => item.observationId === input.observationId);
      if (input.observationId && !previous) throw new Error("観察記録が見つかりません。");
      const next = { ...previous, ...input };
      const assignment = draft.herbicideAssignments.find((item) => item.assignmentId === next.assignmentId);
      if (!assignment || assignment.fieldId !== next.fieldId) throw new Error("観察対象の体系と圃場が一致しません。");
      if (previous && (previous.assignmentId !== next.assignmentId || previous.fieldId !== next.fieldId)) throw new Error("観察記録の対象は変更できません。");
      const date = text(next.date);
      const parsed = new Date(`${date}T00:00:00Z`);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date || Number(date.slice(0, 4)) !== Number(assignment.year)) throw new Error("割当年度内の有効な観察日を指定してください。");
      if (!text(next.status).trim()) throw new Error("観察状況を入力してください。");
      if (next.weeds !== undefined && typeof next.weeds !== "string" && (!Array.isArray(next.weeds) || next.weeds.some((weed) => typeof weed !== "string"))) throw new Error("雑草名の形式を確認してください。");
      const observation = { ...next, observationId: previous ? previous.observationId : U.id("herbicide-observation", date),
        date, fieldId: assignment.fieldId, assignmentId: assignment.assignmentId, status: text(next.status).trim(),
        weeds: copy(next.weeds ?? []), memo: text(next.memo), createdAt: previous ? previous.createdAt : U.now(), updatedAt: U.now() };
      if (previous) draft.herbicideObservations[draft.herbicideObservations.indexOf(previous)] = observation;
      else draft.herbicideObservations.push(observation);
      return observation;
    }, "除草の観察を保存しました");
  }

  function programs() { return copy(rows("herbicidePrograms")); }

  function deleteObservation(observationId) {
    return commit((draft) => {
      const previous = draft.herbicideObservations.find((item) => item.observationId === observationId);
      if (!observationId || !previous) throw new Error("観察記録が見つかりません。");
      draft.herbicideObservations = draft.herbicideObservations.filter((item) => item.observationId !== observationId);
      return previous;
    }, "除草の観察を削除しました");
  }

  function assignments(fieldId, year) {
    return copy(rows("herbicideAssignments").filter((item) => (fieldId === undefined || item.fieldId === fieldId)
      && (year === undefined || String(item.year) === String(year))));
  }

  function assignmentFor(fieldId, year) {
    return assignments(fieldId, year).filter((item) => item.active !== false).at(-1) || null;
  }

  function observations(assignmentId) {
    return copy(rows("herbicideObservations").filter((item) => assignmentId === undefined || item.assignmentId === assignmentId)
      .slice().sort((a, b) => String(a.date).localeCompare(String(b.date))));
  }

  function usageForAssignment(assignmentId) {
    const assignment = rows("herbicideAssignments").find((item) => item.assignmentId === assignmentId);
    if (!assignment) return null;
    const matches = (work, stepId) => array(work.herbicideLinks).some((link) => link && link.fieldId === assignment.fieldId
      && link.assignmentId === assignmentId && link.stepId === stepId);
    const works = array(state.data().fieldWorks).filter((work) => work && work.workName === "除草剤" && array(work.fieldIds).includes(assignment.fieldId) && U.isInYear(work.date, assignment.year)
      && assignment.steps.some((step) => matches(work, step.id)))
      .slice().sort((a, b) => String(a.date).localeCompare(String(b.date)));
    return copy({ assignment, works, steps: assignment.steps.map((step) => ({ ...step, works: works.filter((work) => matches(work, step.id)) })) });
  }

  RiceOS.herbicide = { saveProgram, deleteProgram, assignProgram, saveObservation, deleteObservation, programs, assignments, assignmentFor, observations, usageForAssignment };
})();
