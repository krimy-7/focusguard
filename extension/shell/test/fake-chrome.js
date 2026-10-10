// @ts-check
/** In-memory chrome.* for node --test. Mutating calls are recorded in `calls` as [name, ...args]. */

/** @param {{hostAccess?:boolean, injectFails?:boolean}} [opts] */
export function fakeChrome(opts = {}) {
  /** @type {any[][]} */
  const calls = [];
  /** @type {Record<string, Function>} */
  const listeners = {};
  const ev = (/** @type {string} */ name) => ({ addListener: (/** @type {Function} */ fn) => { listeners[name] = fn; } });
  const missing = (/** @type {string} */ what, /** @type {unknown} */ id) => new Error(`No ${what} with id: ${id}.`);

  /** @param {string} name */
  function area(name) {
    /** @type {Map<string, any>} */
    const data = new Map();
    return {
      data,
      /** @param {string|string[]|null} [keys] */
      async get(keys) {
        const list = keys == null ? [...data.keys()] : Array.isArray(keys) ? keys : [keys];
        /** @type {Record<string, any>} */
        const out = {};
        for (const k of list) if (data.has(k)) out[k] = structuredClone(data.get(k));
        return out;
      },
      /** @param {Record<string, any>} obj */
      async set(obj) {
        calls.push([`storage.${name}.set`, structuredClone(obj)]);
        for (const [k, v] of Object.entries(obj)) data.set(k, structuredClone(v));
      },
      /** @param {string|string[]} keys */
      async remove(keys) {
        calls.push([`storage.${name}.remove`, keys]);
        for (const k of Array.isArray(keys) ? keys : [keys]) data.delete(k);
      },
      async setAccessLevel() {},
    };
  }

  /** @type {Map<string, any>} */ const alarms = new Map();
  /** @type {Map<number, any>} */ const tabs = new Map();
  /** @type {Map<number, any>} */ const groups = new Map();
  let nextTab = 100;
  let nextGroup = 500;
  /** @param {any} t */
  const addTab = (t) => {
    const tab = { id: nextTab++, windowId: 1, groupId: -1, active: false, pinned: false, title: "", url: "", ...t };
    tabs.set(tab.id, tab);
    return tab;
  };

  return {
    calls,
    opts,
    listeners,
    storage: { local: area("local"), session: area("session") },
    alarms: {
      map: alarms,
      /** @param {string} name @param {{when?:number, periodInMinutes?:number}} info */
      async create(name, info) {
        calls.push(["alarms.create", name, info]);
        alarms.set(name, { name, scheduledTime: info.when ?? 0, periodInMinutes: info.periodInMinutes });
      },
      /** @param {string} name */
      async clear(name) { calls.push(["alarms.clear", name]); return alarms.delete(name); },
      /** @param {string} name */
      async get(name) { return alarms.get(name); },
      async getAll() { return [...alarms.values()]; },
      onAlarm: ev("alarms.onAlarm"),
    },
    tabs: {
      map: tabs,
      add: addTab,
      /** @param {number} id */
      async get(id) { const t = tabs.get(id); if (!t) throw missing("tab", id); return { ...t }; },
      /** @param {Record<string, any>} [q] */
      async query(q = {}) {
        const keys = Object.keys(q).filter((k) => k !== "lastFocusedWindow" && k !== "currentWindow");
        return [...tabs.values()].filter((t) => keys.every((k) => t[k] === q[k])).map((t) => ({ ...t }));
      },
      /** @param {number} id @param {any} props */
      async update(id, props) {
        calls.push(["tabs.update", id, props]);
        const t = tabs.get(id);
        if (!t) throw missing("tab", id);
        Object.assign(t, props);
        return { ...t };
      },
      /** @param {any} props */
      async create(props) { calls.push(["tabs.create", props]); return { ...addTab(props) }; },
      /** @param {{tabIds:number|number[], groupId?:number}} arg */
      async group({ tabIds, groupId }) {
        calls.push(["tabs.group", { tabIds, groupId }]);
        const ids = Array.isArray(tabIds) ? tabIds : [tabIds];
        for (const id of ids) if (!tabs.has(id)) throw missing("tab", id);
        if (groupId != null && !groups.has(groupId)) throw missing("group", groupId);
        const g = groupId ?? nextGroup++;
        if (!groups.has(g)) groups.set(g, { id: g, title: "", color: "grey" });
        for (const id of ids) tabs.get(id).groupId = g;
        return g;
      },
      onActivated: ev("tabs.onActivated"),
      onUpdated: ev("tabs.onUpdated"),
      onRemoved: ev("tabs.onRemoved"),
    },
    tabGroups: {
      TAB_GROUP_ID_NONE: -1,
      map: groups,
      /** @param {number} id */
      async get(id) { const g = groups.get(id); if (!g) throw missing("group", id); return { ...g }; },
      /** @param {number} id @param {any} props */
      async update(id, props) {
        calls.push(["tabGroups.update", id, props]);
        const g = groups.get(id);
        if (!g) throw missing("group", id);
        Object.assign(g, props);
        return { ...g };
      },
      onRemoved: ev("tabGroups.onRemoved"),
    },
    windows: {
      WINDOW_ID_NONE: -1,
      /** @param {number} id @param {any} props */
      async update(id, props) { calls.push(["windows.update", id, props]); return { id }; },
      async getLastFocused() { return { id: 1, focused: true }; },
      onFocusChanged: ev("windows.onFocusChanged"),
    },
    notifications: {
      /** @param {string} id @param {any} o */
      async create(id, o) { calls.push(["notifications.create", id, o]); return id; },
      /** @param {string} id */
      async clear(id) { calls.push(["notifications.clear", id]); return true; },
      onButtonClicked: ev("notifications.onButtonClicked"),
      onClicked: ev("notifications.onClicked"),
    },
    scripting: {
      /** @param {any} injection */
      async executeScript(injection) {
        calls.push(["scripting.executeScript", injection]);
        if (opts.injectFails) throw new Error("Cannot access contents of the page.");
        return [{ result: null }];
      },
    },
    declarativeNetRequest: {
      async getDynamicRules() { return []; },
      async getSessionRules() { return []; },
      /** @param {any} o */
      async updateDynamicRules(o) { calls.push(["dnr.updateDynamicRules", o]); },
      /** @param {any} o */
      async updateSessionRules(o) { calls.push(["dnr.updateSessionRules", o]); },
    },
    permissions: {
      /** @param {{origins:string[]}} p */
      async contains(p) { calls.push(["permissions.contains", p]); return !!opts.hostAccess; },
    },
    action: {
      /** @param {{text:string}} o */
      async setBadgeText(o) { calls.push(["action.setBadgeText", o]); },
      async openPopup() { calls.push(["action.openPopup"]); },
    },
    idle: {
      /** @param {number} s */
      setDetectionInterval(s) { calls.push(["idle.setDetectionInterval", s]); },
      onStateChanged: ev("idle.onStateChanged"),
    },
    runtime: {
      id: "test-ext",
      /** @param {string} p */
      getURL: (p) => `chrome-extension://test-ext/${p}`,
      onMessage: ev("runtime.onMessage"),
      onStartup: ev("runtime.onStartup"),
      onInstalled: ev("runtime.onInstalled"),
    },
  };
}

/** @param {{calls:any[][]}} chrome @param {string} name */
export const callsOf = (chrome, name) => chrome.calls.filter((c) => c[0] === name);

/** @param {number} status @param {unknown} body */
export const jsonResponse = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body });

/** @param {(url:string, init:any)=>any} handler */
export function fakeFetch(handler) {
  /** @type {{url:string, init:any}[]} */
  const log = [];
  /** @param {string} url @param {any} [init] */
  const f = async (url, init = {}) => {
    log.push({ url, init });
    return handler(url, init);
  };
  return Object.assign(f, { log });
}
