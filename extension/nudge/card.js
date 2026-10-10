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
  // SVG is built node by node (no innerHTML: pages with Trusted Types would refuse it).
  /** @param {string} tag @param {Record<string,string|number>} [a] @param {any[]} [kids] */
  const svg = (tag, a = {}, kids = []) => {
    const n = /** @type {any} */ (document.createElementNS("http://www.w3.org/2000/svg", tag));
    for (const [k, v] of Object.entries(a)) n.setAttribute(k, String(v));
    n.append(...kids);
    return n;
  };
  /** @param {string} d @param {Record<string,string|number>} [a] */
  const path = (d, a = {}) => svg("path", { d, ...a });

  /** The Tikijhyal window with the Yeti looking out; the leaf is part-closed because FocusGuard is waiting. Drawn from extension/brand/yeti.svg + lattice.svg. */
  const mark = () => {
    const ink = "#2B1E17", fur = "#F7F4EC";
    const yeti = svg("svg", { x: 3, y: 6, width: 28, height: 28, viewBox: "0 0 64 64" }, [
      svg("defs", {}, [svg("g", { id: "fg-fur" }, [
        svg("ellipse", { cx: 32, cy: 31, rx: 19.5, ry: 17.5 }),
        path("M21 19Q19 12 25 8Q26.5 13 31 15Z"), path("M26 15Q27.5 8 32.5 4.5Q37.5 8 38 15Z"), path("M34 15Q37.5 10 42 8Q45 12 43 19Z"),
        path("M14.5 27Q8.5 36 10.5 49Q17 47 20 40Z"), path("M49.5 27Q55.5 36 53.5 49Q47 47 44 40Z"),
        svg("ellipse", { cx: 32, cy: 62, rx: 26, ry: 15 }),
        path("M9 53Q3 59 5 67L18 67Z"), path("M55 53Q61 59 59 67L46 67Z"),
      ])]),
      svg("use", { href: "#fg-fur", fill: ink, stroke: ink, "stroke-width": 3.4, "stroke-linejoin": "round" }),
      svg("use", { href: "#fg-fur", fill: fur, stroke: fur, "stroke-width": 1.6, "stroke-linejoin": "round" }),
      path("M12.5 40q1 4 3 6.5M51.5 40q-1 4-3 6.5M28 8.5q1 2.5 3 4M37 8.5q-1 2.5-3 4M14 57q3 2 5 8M50 57q-3 2-5 8", { fill: "none", stroke: "#CBC4B3", "stroke-width": 1.1, "stroke-linecap": "round" }),
      path("M32 19.5C41.5 19.5 48 25.5 48 33.5C48 41.5 41.5 47.5 32 47.5C22.5 47.5 16 41.5 16 33.5C16 25.5 22.5 19.5 32 19.5Z", { fill: "#D9E4E4" }),
      path("M19.5 28.5Q26 22.5 31.5 27M32.5 27Q38 22.5 44.5 28.5", { fill: "none", stroke: fur, "stroke-width": 3.2, "stroke-linecap": "round" }),
      path("M22 29.5q4.5-3 8.5-.5M33.5 29q4-2.5 8.5.5", { fill: "none", stroke: ink, "stroke-width": 1.5, "stroke-linecap": "round" }),
      svg("circle", { cx: 26, cy: 34, r: 2.2, fill: ink }), svg("circle", { cx: 38, cy: 34, r: 2.2, fill: ink }),
      svg("circle", { cx: 26.8, cy: 33.2, r: 0.75, fill: "#fff" }), svg("circle", { cx: 38.8, cy: 33.2, r: 0.75, fill: "#fff" }),
      svg("ellipse", { cx: 21.5, cy: 40, rx: 3.2, ry: 2.1, fill: "#9A3E24", opacity: 0.2 }), svg("ellipse", { cx: 42.5, cy: 40, rx: 3.2, ry: 2.1, fill: "#9A3E24", opacity: 0.2 }),
      path("M29.5 37.5q2.5-1.8 5 0-.4 2.5-2.5 2.5t-2.5-2.5z", { fill: "#6E4A3A" }),
      path("M28.2 42.5q3.8 2.8 7.6 0", { fill: "none", stroke: ink, "stroke-width": 1.4, "stroke-linecap": "round" }),
      path("M15.5 50q16.5 9.5 33 0l1.2 6q-17.7 8.5-35.4 0z", { fill: "#C8963E", stroke: ink, "stroke-width": 1.5, "stroke-linejoin": "round" }),
      path("M16 54q16 8 32 0", { fill: "none", stroke: "#9A3E24", "stroke-width": 1.5 }),
    ]);
    return svg("svg", { class: "mark", width: 44, height: 32, viewBox: "0 0 44 32", "aria-hidden": "true", focusable: "false" }, [
      svg("defs", {}, [
        svg("clipPath", { id: "fg-in" }, [svg("rect", { x: 2, y: 2, width: 40, height: 28, rx: 2 })]),
        svg("pattern", { id: "fg-lat", width: 8, height: 8, patternUnits: "userSpaceOnUse" }, [
          path("M0 0L8 8M8 0L0 8", { class: "lat-line" }),
          svg("rect", { x: 3.1, y: 3.1, width: 1.8, height: 1.8, transform: "rotate(45 4 4)", fill: "#C8963E" }),
        ]),
      ]),
      svg("rect", { x: 1, y: 1, width: 42, height: 30, rx: 3, class: "pane" }),
      svg("g", { "clip-path": "url(#fg-in)" }, [
        yeti,
        svg("g", { class: "leaf" }, [
          svg("rect", { x: 26, y: 2, width: 40, height: 28, class: "leaf-bg" }),
          svg("rect", { x: 26, y: 2, width: 40, height: 28, fill: "url(#fg-lat)" }),
          svg("rect", { x: 26, y: 2, width: 2, height: 28, class: "stile" }),
        ]),
      ]),
      svg("rect", { x: 1, y: 1, width: 42, height: 30, rx: 3, class: "frame" }),
    ]);
  };

  // Mukta and Kalam come from the extension's own files, under private family names so no page's CSS can collide with them.
  // The card is built hidden and shown once they load, raced against 150ms: it never flashes system type and never waits on a slow load.
  /** @type {Promise<unknown>[]} */ const loads = [];
  /** @type {FontFace[]} */ const faces = []; // taken back out of the page's font set when the card closes
  try {
    if (typeof FontFace === "function") {
      const LAT = "U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD";
      const DEV = "U+0900-097F,U+1CD0-1CF9,U+200C-200D,U+20A8,U+20B9,U+20F0,U+25CC,U+A830-A839,U+A8E0-A8FF,U+11B00-11B09";
      for (const { family, file, weights } of [
        { family: "FocusGuard Mukta", file: "mukta", weights: ["400", "600", "700"] },
        { family: "FocusGuard Kalam", file: "kalam", weights: ["400"] },
      ]) {
        for (const weight of weights) {
          for (const [subset, unicodeRange] of [["latin", LAT], ["devanagari", DEV]]) {
            const face = new FontFace(family, `url(${chrome.runtime.getURL(`fonts/${file}-${subset}-${weight}-normal.woff2`)})`, { weight, unicodeRange });
            document.fonts.add(face);
            faces.push(face);
            loads.push(face.load().catch(() => {})); // a face that fails leaves the system-ui fallback
          }
        }
      }
    }
  } catch {
    loads.length = 0; // no FontFace, or the extension was reloaded: show the card in the fallback face
  }
  let closed = false;

  const host = el("div");
  host.id = HOST_ID;
  const root = host.attachShadow({ mode: "closed" });
  const style = el("style");
  // Tokens: .impeccable/surfaces/src-app.md (light default, dark via prefers-color-scheme). One type size (16px): rank is weight alone.
  style.textContent = [
    ":host{all:initial}",
    "*{box-sizing:border-box}",
    ".card{--ink:#2B1E17;--ink2:#5A4A40;--surface:#F6F7F1;--field:#FBFBF7;--moss:#4E6B3C;--moss2:#415C32;--on-moss:#FBF6EC;--brass:#C8963E;--pane:#F4E7C8;--leaf:#EBD6A0;--frame:#2B1E17;--line:rgba(43,30,23,.16);--lift:rgba(43,30,23,.32);--hover:rgba(43,30,23,.08);" +
      "position:fixed;right:16px;bottom:16px;z-index:2147483647;width:320px;max-width:calc(100vw - 32px);padding:22px 14px 4px;border-radius:10px;background:var(--surface);color:var(--ink);color-scheme:light dark;" +
      "box-shadow:0 0 0 1px var(--line),0 14px 34px var(--lift);font:400 16px/1.3 'FocusGuard Mukta',system-ui,-apple-system,'Segoe UI',Roboto,'Noto Sans Devanagari','Nirmala UI',sans-serif;text-align:left}",
    "p{margin:0}",
    ".sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}",
    ".tab{position:absolute;left:14px;top:-20px;height:40px;display:flex;align-items:center;gap:8px;padding:0 12px 0 4px;border-radius:10px 10px 0 0;background:var(--surface)}",
    ".tab::before{content:'';position:absolute;inset:0 0 20px;border-radius:10px 10px 0 0;box-shadow:-1px 0 0 var(--line),1px 0 0 var(--line),0 -1px 0 var(--line);pointer-events:none}", // the outline stops at the card's edge
    ".name{font-weight:700}",
    ".mark{display:block;flex:none}.mark .pane{fill:var(--pane)}.mark .frame{fill:none;stroke:var(--frame);stroke-width:2}.mark .leaf-bg{fill:var(--leaf)}.mark .stile{fill:var(--brass)}.mark .lat-line{fill:none;stroke:var(--frame);stroke-width:1.4}",
    ".msg{min-height:40px}",
    ".note{margin-bottom:4px;font-family:'FocusGuard Kalam','Segoe Print','Bradley Hand',system-ui,cursive}", // the user's own words; Kalam ships one weight
    ".sites{margin-top:4px;color:var(--ink2)}",
    ".row,.row2{display:grid;gap:8px;margin-top:6px}",
    ".row{grid-template-columns:1fr 1.1fr 1fr}.row.one{grid-template-columns:1fr}.row2{grid-template-columns:minmax(0,1fr) auto}",
    "button{font:inherit;color:inherit;margin:0;cursor:pointer}",
    ".btn{min-width:44px;min-height:44px;padding:0 8px;border-radius:8px;border:1.5px solid var(--ink);background:transparent;font-weight:700;line-height:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}",
    ".btn:hover{background:var(--hover)}",
    ".btn.primary{background:var(--moss);border-color:var(--moss);color:var(--on-moss)}.btn.primary:hover{background:var(--moss2);border-color:var(--moss2)}",
    "input{min-width:0;min-height:44px;padding:0 12px;border-radius:8px;border:1.5px solid var(--ink);background:var(--field);color:var(--ink);font:inherit;font-family:'FocusGuard Kalam','Segoe Print','Bradley Hand',system-ui,cursive;caret-color:var(--ink)}", // what the user types is their own words
    "input::placeholder{color:var(--ink2);opacity:1}",
    "::selection{background:var(--brass);color:#2B1E17}",
    ".sub{display:flex;align-items:center;gap:16px;margin-top:2px}",
    ".link{position:relative;height:22px;padding:0;border:0;background:none;color:var(--ink2);font-weight:500;text-decoration:underline;text-decoration-thickness:1px;text-underline-offset:3px}",
    ".link::after{content:'';position:absolute;inset:-2px -8px -20px}", // 22px of text, 44px to hit; reaches down, never up into the buttons
    ".link:hover{color:var(--ink)}",
    ".x{position:absolute;top:-4px;right:6px;width:28px;height:28px;padding:0;border:0;border-radius:8px;background:none;display:grid;place-items:center;color:var(--ink2)}",
    ".x::after{content:'';position:absolute;inset:-8px}.x:hover{color:var(--ink);background:var(--hover)}.x svg{display:block}",
    ".why{max-height:30vh;overflow:auto;margin-top:10px;padding:8px 0 10px;border-top:1px solid var(--line);color:var(--ink2)}",
    ".why a{color:var(--ink)}",
    "button:focus-visible,input:focus-visible,a:focus-visible{outline:3px solid var(--ink);outline-offset:2px}",
    "[hidden]{display:none!important}",
    "@media (prefers-color-scheme:dark){.card{--ink:#EFE9DB;--ink2:#C9BFB2;--surface:#2B1E17;--field:#33251D;--moss:#86A86F;--moss2:#97B782;--on-moss:#2B1E17;--brass:#D4A24E;--pane:#3A2C1A;--leaf:#5B4524;--frame:#C9BFB2;--line:rgba(239,233,219,.16);--lift:rgba(0,0,0,.55);--hover:rgba(239,233,219,.1)}}",
    "@media (prefers-reduced-motion:no-preference){.card{animation:fgin .2s ease-out}.leaf{animation:fgleaf .5s cubic-bezier(.3,.7,.2,1) .1s backwards}@keyframes fgin{from{opacity:0}}@keyframes fgleaf{from{transform:translateX(7px)}}}",
  ].join("\n");
  const card = el("div", { class: "card", role: "region", "aria-label": model.label });
  // The live region exists (empty) before its text is inserted, so the announcement is spoken once and not at the page's mercy.
  const live = el("div", { class: "sr", role: "status", "aria-live": "polite", "aria-atomic": "true" });
  root.append(style, card);
  card.append(live);

  /** @type {any} */ let announceTimer = null;
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
  // A fullscreen element lives in the top layer: the card must be inside it to be seen.
  const place = () => (document.fullscreenElement ?? document.documentElement).append(host);
  function close() {
    closed = true;
    clearTimeout(announceTimer);
    for (const face of faces) document.fonts.delete(face);
    window.removeEventListener("pagehide", close);
    document.removeEventListener("fullscreenchange", place);
    host.remove();
  }
  host.__fgClose = close;
  window.addEventListener("pagehide", close);
  document.addEventListener("fullscreenchange", place);
  // Typing in the card must not trigger page shortcuts (YouTube "k", space to pause).
  for (const t of ["keydown", "keyup", "keypress"]) card.addEventListener(t, (/** @type {Event} */ e) => e.stopPropagation());

  const tab = el("div", { class: "tab" });
  tab.append(mark(), el("span", { class: "name" }, model.ui.brand));
  card.append(tab);

  const x = el("button", { type: "button", class: "x", "aria-label": model.ui.dismiss, title: model.ui.dismiss });
  x.append(svg("svg", { width: 14, height: 14, viewBox: "0 0 14 14", "aria-hidden": "true", focusable: "false" }, [path("M3 3l8 8M11 3l-8 8", { fill: "none", stroke: "currentColor", "stroke-width": 2, "stroke-linecap": "round" })]));
  x.addEventListener("click", dismiss);

  /** @type {Record<string, any>} */ const views = {};
  /** @type {any} */ let opener = null;
  /** @type {any} */ let thisIs = null;
  /** @param {string} name */
  const show = (name) => {
    for (const [k, v] of Object.entries(views)) v.hidden = k !== name;
    if (thisIs) thisIs.setAttribute("aria-expanded", String(name === "which" || name === "task"));
  };
  /** Open a panel and put the cursor where the user will type. @param {string} name @param {any} from @param {any} focus */
  const open = (name, from, focus) => {
    if (!opener) opener = from;
    show(name);
    focus.focus();
  };
  const closePanel = () => {
    show("main");
    if (opener) opener.focus();
    opener = null;
  };

  /** @type {any} */ let announce;
  if (model.kind === "welcome") {
    announce = [model.note, model.message].filter(Boolean).join(" ");
    if (model.note) card.append(el("p", { class: "note" }, model.note));
    card.append(el("p", { class: "msg" }, model.message));
    if (model.sites) card.append(el("p", { class: "sites" }, model.sites));
    const row = el("div", { class: "row one" });
    row.append(button(model.ui.got_it, close, { class: "btn primary" }));
    card.append(row, x);
  } else {
    announce = model.message;
    card.append(el("p", { class: "msg" }, model.message));

    const taskInput = el("input", { type: "text", maxlength: "120", "aria-label": model.ui.new_task_placeholder, placeholder: model.ui.new_task_placeholder });
    const noteInput = el("input", { type: "text", maxlength: "280", "aria-label": model.ui.break_note_label, placeholder: model.ui.break_note_placeholder });
    const startTask = () => {
      const title = taskInput.value.trim();
      send("new_task", title ? { title } : {});
    };
    const startBreak = () => {
      const note = noteInput.value.trim();
      send("break", note ? { note } : {});
    };
    /** Enter submits, except while an IME (Nepali, Hindi) is still composing. @param {()=>void} go */
    const onEnter = (go) => (/** @type {KeyboardEvent} */ e) => { if (e.key === "Enter" && !e.isComposing) go(); };
    taskInput.addEventListener("keydown", onEnter(startTask));
    noteInput.addEventListener("keydown", onEnter(startBreak));

    const why = el("p", { class: "why", id: "fg-why" }, `${model.explainer} `);
    why.hidden = true;
    why.append(el("a", { href: model.settingsUrl, target: "_blank", rel: "noopener" }, model.ui.settings));

    const brk = button(model.ui.break, () => open("brk", brk, noteInput), { class: "btn" });
    thisIs = button(model.ui.this_is, () => open("which", thisIs, partOf), { class: "link", "aria-expanded": "false" });
    const whyBtn = button(model.ui.why, () => {
      why.hidden = !why.hidden;
      whyBtn.setAttribute("aria-expanded", String(!why.hidden));
    }, { class: "link", "aria-expanded": "false", "aria-controls": "fg-why" });
    const partOf = button(model.ui.part_of, () => send("related"), { class: "btn" });
    const panelRow = (/** @type {any[]} */ ...kids) => { const r = el("div", { class: "row2" }); r.append(...kids); return r; };
    const cancel = () => { const s = el("div", { class: "sub" }); s.append(button(model.ui.cancel, closePanel, { class: "link" })); return s; };

    const main = el("div");
    const mainRow = el("div", { class: "row" });
    mainRow.append(button(model.ui.back, () => send("back"), { class: "btn primary" }), button(model.ui.extend, () => send("extend", { n: model.extendS }), { class: "btn" }), brk);
    const sub = el("div", { class: "sub" });
    sub.append(thisIs, whyBtn);
    main.append(mainRow, sub);

    const which = el("div");
    which.append(panelRow(partOf, button(model.ui.new_task, () => open("task", opener, taskInput), { class: "btn" })), cancel());
    const task = el("div");
    task.append(panelRow(taskInput, button(model.ui.start, startTask, { class: "btn primary" })), cancel());
    const brkPanel = el("div");
    brkPanel.append(panelRow(noteInput, button(model.ui.start_break, startBreak, { class: "btn primary" })), cancel());
    Object.assign(views, { main, which, task, brk: brkPanel });
    show("main");
    card.append(main, which, task, brkPanel, why, x);
  }
  // Esc only counts while focus is inside the card (this listener is on the card, not the window) and never throws away typed text.
  card.addEventListener("keydown", (/** @type {KeyboardEvent} */ e) => {
    if (e.key !== "Escape") return;
    const t = /** @type {any} */ (e.target);
    if (t && t.tagName === "INPUT" && String(t.value).trim()) return;
    if (opener) closePanel();
    else dismiss();
  });
  place();
  // Placed at once, shown when the type is ready: a dismissal or a newer render during the wait still finds the card.
  const reveal = () => {
    if (closed) return;
    card.hidden = false;
    announceTimer = setTimeout(() => { live.textContent = announce; }, 100);
  };
  if (loads.length) {
    card.hidden = true;
    Promise.race([Promise.all(loads), new Promise((done) => setTimeout(done, 150))]).then(reveal);
  } else reveal();
}

/** Remove the card (hide_nudge). Self-contained like renderCard. */
export function removeCard() {
  const host = /** @type {any} */ (document.getElementById("focusguard-nudge-host"));
  if (!host) return;
  if (host.__fgClose) host.__fgClose();
  else host.remove();
}
