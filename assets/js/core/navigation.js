(function () {
  "use strict";

  // Navigation is intentionally UI-only. It stores stable IDs in memory and
  // lets the app shell decide how each route should be rendered.
  const RiceOS = window.RiceOS = window.RiceOS || {};
  const stack = [];
  let handlers = {};

  function emit() {
    window.dispatchEvent(new CustomEvent("riceos:navigationchange"));
  }

  function copy(value) {
    if (!value || typeof value !== "object") return value;
    if (Array.isArray(value)) return value.map(copy);
    return Object.keys(value).reduce((next, key) => {
      next[key] = copy(value[key]);
      return next;
    }, {});
  }

  function routeOptions(options) {
    const source = options && typeof options === "object" ? options : {};
    return Object.keys(source).reduce((next, key) => {
      if (key !== "replace") next[key] = copy(source[key]);
      return next;
    }, {});
  }

  function snapshot() {
    return stack.map(copy);
  }

  function current() {
    return stack.length ? copy(stack[stack.length - 1]) : null;
  }

  function configure(nextHandlers) {
    const next = nextHandlers && typeof nextHandlers === "object" ? nextHandlers : {};
    handlers = {
      ...handlers,
      ...Object.keys(next).reduce((result, key) => {
        if (["onOpenField", "onOpenRecord", "onBack", "onClear"].includes(key)) {
          result[key] = typeof next[key] === "function" ? next[key] : null;
        }
        return result;
      }, {})
    };
    return RiceOS.navigation;
  }

  function push(route, handlerName, replace) {
    const handler = handlers[handlerName];
    if (typeof handler !== "function") return false;
    const nextRoute = copy(route);
    const nextStack = replace && stack.length
      ? [...stack.slice(0, -1), nextRoute]
      : [...stack, nextRoute];
    if (handler(copy(nextRoute), nextStack.map(copy)) === false) return false;
    stack.splice(0, stack.length, ...nextStack);
    emit();
    return true;
  }

  function openField(fieldId, options) {
    const id = String(fieldId || "");
    if (!id) return false;
    const source = options && typeof options === "object" ? options : {};
    return push({ type: "field", fieldId: id, options: routeOptions(source) }, "onOpenField", Boolean(source.replace));
  }

  function openRecord(kind, id, options) {
    const recordKind = String(kind || "");
    const recordId = String(id || "");
    if (!recordKind || !recordId) return false;
    const source = options && typeof options === "object" ? options : {};
    return push({
      type: "record",
      kind: recordKind,
      id: recordId,
      fieldId: String(source.fieldId || ""),
      options: routeOptions(source)
    }, "onOpenRecord", Boolean(source.replace));
  }

  function back() {
    if (!stack.length || typeof handlers.onBack !== "function") return false;
    const leaving = current();
    const nextStack = stack.slice(0, -1);
    const destination = nextStack.length ? copy(nextStack[nextStack.length - 1]) : null;
    if (handlers.onBack(destination, leaving, nextStack.map(copy)) === false) return false;
    stack.splice(0, stack.length, ...nextStack);
    emit();
    return true;
  }

  function clear() {
    if (!stack.length) return false;
    const previous = snapshot();
    if (typeof handlers.onClear === "function" && handlers.onClear(previous) === false) return false;
    stack.splice(0, stack.length);
    emit();
    return true;
  }

  RiceOS.navigation = {
    configure,
    openField,
    openRecord,
    back,
    clear,
    current,
    snapshot
  };
})();
