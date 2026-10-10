// @ts-check
// Injected with chrome.scripting.executeScript({target:{tabId}, func, args}).
// Chrome sends only each function's source text: nothing outside its own body may be referenced.

/** @param {any} model  NudgeModel | WelcomeModel from nudge/model.js */
export function renderCard(model) {
  const HOST_ID = "focusguard-nudge-host";
  const old = /** @type {any} */ (document.getElementById(HOST_ID));
  if (old) {
    if (old.__fgClose) old.__fgClose();
    else old.remove();
  }

  /** @param {string} tag @param {Record<string,string>} [attrs] @param {string} [text] */
  const el = (tag, attrs = {}, text = "") => {
    const e = /** @type {any} */ (document.createElement(tag));
    for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
    if (text) e.textContent = text;
    return e;
  };
  /** @param {string} label @param {()=>void} onClick @param {Record<string,string>} [attrs] */
  const button = (label, onClick, attrs = {}) => {
    const b = el("button", { type: "button", ...attrs }, label);
    b.addEventListener("click", onClick);
    return b;
  };

  const host = el("div");
  host.id = HOST_ID;
  const root = host.attachShadow({ mode: "closed" });
  const style = el("style");
  style.textContent = [
    ":host{all:initial}",
    ".card{position:fixed;right:16px;bottom:16px;z-index:2147483647;width:320px;max-width:calc(100vw - 32px);box-sizing:border-box;padding:16px;border-radius:14px;background:#fff;color:#1d1d1f;box-shadow:0 8px 32px rgba(0,0,0,.25);font:14px/1.45 system-ui,-apple-system,'Segoe UI',Roboto,sans-serif}",
    "p{margin:0 0 8px}",
    ".msg{font-size:15px;padding-right:28px}",
    ".mascot{font-size:28px;margin:0 0 4px}",
    ".explain,.sites{font-size:12.5px;color:#555}",
    ".note{font-weight:600}",
    ".row{display:flex;flex-wrap:wrap;gap:8px;margin-top:8px}",
    "button{min-height:44px;min-width:44px;padding:0 14px;border-radius:10px;border:1px solid #d0d0d6;background:#f4f4f6;color:inherit;font:inherit;cursor:pointer}",
    "button.primary{background:#4f46e5;border-color:#4f46e5;color:#fff}",
    "button.close{position:absolute;top:4px;right:4px;border:none;background:none;font-size:18px;padding:0}",
    "input{min-height:44px;flex:1 1 100%;box-sizing:border-box;padding:0 10px;border-radius:10px;border:1px solid #d0d0d6;background:#fff;color:inherit;font:inherit}",
    "a{color:#4f46e5}",
    "button:focus-visible,input:focus-visible,a:focus-visible{outline:2px solid #4f46e5;outline-offset:2px}",
    "[hidden]{display:none!important}",
    "@media (prefers-color-scheme:dark){.card{background:#1f1f23;color:#f2f2f5}.explain,.sites{color:#b4b4bb}button,input{background:#2c2c31;border-color:#3a3a40}a{color:#a5b4fc}}",
    "@media (prefers-reduced-motion:no-preference){.card{animation:fgin .18s ease-out}@keyframes fgin{from{opacity:0;transform:translateY(8px)}}}",
  ].join("\n");
  const card = el("div", { class: "card", role: "dialog", "aria-modal": "false", "aria-label": model.label });
  root.append(style, card);

  /** @param {string} action @param {Record<string, unknown>} [extra] */
  const send = (action, extra = {}) => {
    try {
      const p = chrome.runtime.sendMessage({ type: "nudge_action", interventionId: model.interventionId, action, ...extra });
      if (p && p.catch) p.catch(() => {});
    } catch {
      /* extension reloaded: nothing to tell */
    }
    close();
  };
  const dismiss = () => (model.kind === "nudge" ? send("dismiss") : close());
  /** @param {KeyboardEvent} e */
  const onKey = (e) => {
    if (e.key === "Escape") dismiss();
  };
  function close() {
    window.removeEventListener("keydown", onKey, true);
    window.removeEventListener("pagehide", close);
    host.remove();
  }
  host.__fgClose = close;
  window.addEventListener("keydown", onKey, true);
  window.addEventListener("pagehide", close);
  // Typing in the card must not trigger page shortcuts (YouTube "k", space to pause).
  for (const t of ["keydown", "keyup", "keypress"]) card.addEventListener(t, (/** @type {Event} */ e) => e.stopPropagation());

  card.append(button("×", dismiss, { class: "close", "aria-label": model.ui.dismiss }));

  if (model.kind === "welcome") {
    if (model.note) card.append(el("p", { class: "note" }, model.note));
    card.append(el("p", { class: "msg", "aria-live": "polite" }, model.message));
    if (model.sites) card.append(el("p", { class: "sites" }, model.sites));
    const row = el("div", { class: "row" });
    row.append(button(model.ui.got_it, close, { class: "primary" }));
    card.append(row);
  } else {
    if (model.mascot) card.append(el("p", { class: "mascot", "aria-hidden": "true" }, model.mascot));
    card.append(el("p", { class: "msg", "aria-live": "polite" }, model.message));
    if (model.explainer) {
      const p = el("p", { class: "explain" }, model.explainer + " ");
      p.append(el("a", { href: model.settingsUrl, target: "_blank", rel: "noopener" }, model.ui.settings));
      card.append(p);
    }
    const main = el("div", { class: "row" });
    const which = el("div", { class: "row" });
    const task = el("div", { class: "row" });
    const brk = el("div", { class: "row" });
    which.hidden = task.hidden = brk.hidden = true;
    const taskInput = el("input", { type: "text", maxlength: "120", "aria-label": model.ui.new_task_placeholder, placeholder: model.ui.new_task_placeholder });
    const noteInput = el("input", { type: "text", maxlength: "280", "aria-label": model.ui.break_note_placeholder, placeholder: model.ui.break_note_placeholder });
    const startTask = () => {
      const title = taskInput.value.trim();
      send("new_task", title ? { title } : {});
    };
    const startBreak = () => {
      const note = noteInput.value.trim();
      send("break", note ? { note } : {});
    };
    const thisIs = button(`${model.ui.this_is} ▾`, () => show(which.hidden ? which : null), { "aria-expanded": "false" });
    /** @param {any} panel */
    const show = (panel) => {
      for (const p of [which, task, brk]) p.hidden = p !== panel;
      thisIs.setAttribute("aria-expanded", String(panel === which || panel === task));
    };
    main.append(
      button(model.ui.back, () => send("back"), { class: "primary" }),
      thisIs,
      button(model.ui.extend, () => send("extend", { n: model.extendS })),
      button(model.ui.break, () => show(brk)),
    );
    which.append(button(model.ui.part_of, () => send("related")), button(model.ui.new_task, () => show(task)));
    taskInput.addEventListener("keydown", (/** @type {KeyboardEvent} */ e) => { if (e.key === "Enter") startTask(); });
    noteInput.addEventListener("keydown", (/** @type {KeyboardEvent} */ e) => { if (e.key === "Enter") startBreak(); });
    task.append(taskInput, button(model.ui.start, startTask, { class: "primary" }));
    brk.append(noteInput, button(model.ui.start_break, startBreak, { class: "primary" }));
    card.append(main, which, task, brk);
  }
  document.documentElement.append(host);
}

/** Remove the card (hide_nudge). Self-contained like renderCard. */
export function removeCard() {
  const host = /** @type {any} */ (document.getElementById("focusguard-nudge-host"));
  if (!host) return;
  if (host.__fgClose) host.__fgClose();
  else host.remove();
}
