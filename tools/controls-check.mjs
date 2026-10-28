/* tools/controls-check.mjs — prove the glass controls actually work.
 *
 *   node tools/controls-check.mjs          # needs the site served on :4173
 *
 * A screenshot can show that a bead is drawn; it cannot show that clicking its
 * row changed the list. This drives the controls the way a person does — a real
 * pointer click, a real ArrowRight, the site's own reset path — and asserts three
 * things each time:
 *
 *   1. the native control underneath holds the new value (a <select>, a radio, a
 *      checkbox), because the rest of the page reads that, not the glass;
 *   2. the page's own reaction happened — rows filtered, editor repainted;
 *   3. the bead or knob physically moved onto the choice that is now selected.
 *
 * It also checks the reverse direction: the site's scripts write to a control in
 * code, which fires no event, so the bead must follow anyway.
 */
import { spawn, execSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const CHROME = process.env.CHROME || "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const BASE = process.env.ICHH_BASE || "http://127.0.0.1:4173/";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const PROFILE = fs.mkdtempSync(path.join(os.tmpdir(), "ichh-controls-"));
/* LG_REDUCED=1 node tools/controls-check.mjs runs the whole suite with the
   system's reduce-motion flag on: the bead then has no glide to travel, so every
   seating assertion has to land on the right box immediately — which is exactly
   what a person with that preference would check by eye. */
const chrome = spawn(CHROME, ["--headless=new", "--no-sandbox", "--disable-gpu",
  "--disable-dev-shm-usage", "--hide-scrollbars", "--remote-debugging-port=0",
  ...(process.env.LG_REDUCED ? ["--force-prefers-reduced-motion"] : []),
  "--user-data-dir=" + PROFILE, "about:blank"], { stdio: "ignore", detached: true });

/* The browser is spawned detached, so it outlives this script — including when
   the script dies half-way. Close the whole tree and the profile it made. */
function dispose() {
  try {
    if (process.platform === "win32") execSync("taskkill /PID " + chrome.pid + " /T /F", { stdio: "ignore" });
    else process.kill(chrome.pid, "SIGKILL");
  } catch (e) { /* already gone */ }
  try { fs.rmSync(PROFILE, { recursive: true, force: true, maxRetries: 2 }); } catch (e) { /* locked */ }
}
process.on("exit", dispose);
for (const sig of ["SIGINT", "SIGTERM"]) process.on(sig, () => { dispose(); process.exit(130); });

async function waitPort() {
  const f = path.join(PROFILE, "DevToolsActivePort");
  for (let i = 0; i < 160; i++) {
    if (fs.existsSync(f)) {
      const t = fs.readFileSync(f, "utf8").trim().split("\n");
      if (t[0]) return parseInt(t[0], 10);
    }
    await sleep(250);
  }
  throw new Error("chrome did not report a port");
}

const port = await waitPort();
const ver = await (await fetch("http://127.0.0.1:" + port + "/json/version")).json();
const ws = await new Promise((res, rej) => {
  const w = new WebSocket(ver.webSocketDebuggerUrl);
  w.onopen = () => res(w); w.onerror = rej;
});
let seq = 0;
const pending = new Map();
const events = [];
ws.onmessage = (e) => {
  const m = JSON.parse(String(e.data));
  if (m.id && pending.has(m.id)) {
    const p = pending.get(m.id); pending.delete(m.id);
    m.error ? p.reject(new Error(m.error.message)) : p.resolve(m.result);
  } else if (m.method) events.push(m);
};
const send = (method, params, sessionId) => {
  const id = ++seq;
  ws.send(JSON.stringify(Object.assign({ id, method }, params ? { params } : {}, sessionId ? { sessionId } : {})));
  return new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
};
const waitFor = (method, sessionId, ms) => new Promise((resolve) => {
  const check = () => {
    for (let i = 0; i < events.length; i++) {
      const e = events[i];
      if (e.method === method && (!sessionId || e.sessionId === sessionId)) { events.splice(i, 1); return true; }
    }
    return false;
  };
  if (check()) return resolve(true);
  const t = setInterval(() => { if (check()) { clearInterval(t); clearTimeout(c); resolve(true); } }, 40);
  const c = setTimeout(() => { clearInterval(t); resolve(false); }, ms || 25000);
});

const { targetId } = await send("Target.createTarget", { url: "about:blank" });
const { sessionId } = await send("Target.attachToTarget", { targetId, flatten: true });
await send("Page.enable", {}, sessionId);
await send("Runtime.enable", {}, sessionId);
const ev = async (expr) => {
  const r = await send("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true }, sessionId);
  if (r.exceptionDetails) throw new Error(expr.slice(0, 60) + " -> " + JSON.stringify(r.exceptionDetails).slice(0, 300));
  return r.result && r.result.value;
};
/* the coordinates a real pointer would land on for one of these elements.
   `behavior: "instant"` matters: the site sets `scroll-behavior: smooth`, so the
   default scroll is still travelling when the rect is read a line later, and the
   click lands hundreds of pixels away from the chip it was meant to hit. */
const centreOf = (expr) => ev(`(() => {
  const n = ${expr};
  if (!n) return null;
  n.scrollIntoView({ block: "center", inline: "nearest", behavior: "instant" });
  const r = n.getBoundingClientRect();
  if (r.width < 1 || r.height < 1) return null;
  return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: Math.round(r.width), h: Math.round(r.height) };
})()`);
async function tap(expr, label) {
  const box = await centreOf(expr);
  if (!box) throw new Error("nothing to click for " + (label || expr));
  await send("Input.dispatchMouseEvent", { type: "mousePressed", x: box.x, y: box.y, button: "left", clickCount: 1 }, sessionId);
  await send("Input.dispatchMouseEvent", { type: "mouseReleased", x: box.x, y: box.y, button: "left", clickCount: 1 }, sessionId);
  await sleep(420);
  return box;
}
const KEYS = { ArrowRight: 39, ArrowLeft: 37, ArrowUp: 38, ArrowDown: 40, Home: 36, End: 35, Tab: 9 };
async function press(k) {
  const code = k === "Tab" ? "Tab" : k;
  await send("Input.dispatchKeyEvent", { type: "keyDown", key: k, code, windowsVirtualKeyCode: KEYS[k], nativeVirtualKey: KEYS[k] }, sessionId);
  await send("Input.dispatchKeyEvent", { type: "keyUp", key: k, code, windowsVirtualKeyCode: KEYS[k], nativeVirtualKey: KEYS[k] }, sessionId);
  await sleep(330);
}
/* In-page helpers, reused as text: what the bead and the group look like now. */
const SEG = (i) => `document.querySelectorAll('.lg-seg')[${i}]`;
const bead = (i) => `(() => {
  const seg = ${SEG(i)};
  if (!seg) return null;
  const t = seg.querySelector('.lg-thumb');
  const r = t.getBoundingClientRect();
  const on = seg.querySelector('.lg-seg__opt[aria-checked="true"]');
  const q = on ? on.getBoundingClientRect() : null;
  return { to: t.style.getPropertyValue('--lg-to'), x: Math.round(r.left), w: Math.round(r.width),
           at: [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)].join(','),
           on: q ? [Math.round(q.left), Math.round(q.top), Math.round(q.width), Math.round(q.height)].join(',') : null,
           moving: t.classList.contains('is-moving'),
           flight: document.getAnimations().filter((a) => a.playState === 'running' && a.effect &&
             (a.effect.target === t || (t.contains && t.contains(a.effect.target))))
             .map((a) => a.transitionProperty || a.animationName || 'anim').join('+') || null,
           centred: q ? Math.abs((r.left + r.width / 2) - (q.left + q.width / 2)) < 4 &&
                       Math.abs(r.width - (q.width + 6)) < 4 : null,
           checked: Array.prototype.map.call(seg.querySelectorAll('.lg-seg__opt'),
             (b) => b.getAttribute('aria-checked')).join(','),
           tabs: Array.prototype.map.call(seg.querySelectorAll('.lg-seg__opt'), (b) => b.tabIndex).join(','),
           named: seg.getAttribute('aria-labelledby') || seg.getAttribute('aria-label') || null,
           described: seg.getAttribute('aria-describedby') || null,
           role: seg.getAttribute('role') };
})()`;
const chipBead = (rowSel) => `(() => {
  const row = document.querySelector(${JSON.stringify(rowSel)});
  if (!row) return null;
  const t = row.querySelector(':scope > .lg-thumb');
  const a = row.querySelector('[aria-pressed="true"], input:checked');
  const anchor = a && a.tagName === 'INPUT' ? a.parentNode : a;
  if (!t || !anchor) return { missing: true };
  const r = t.getBoundingClientRect(), q = anchor.getBoundingClientRect();
  return { x: Math.round(r.left - q.left), abs: Math.round(r.left), w: Math.round(r.width), cw: Math.round(q.width),
           moving: t.classList.contains("is-moving"),
           flight: document.getAnimations().filter((a) => a.playState === "running" && a.effect &&
             a.effect.target === t).map((a) => a.transitionProperty || a.animationName || "anim").join("+") || null,
           seated: Math.abs(r.left - (q.left - 3)) < 4 && Math.abs(r.width - (q.width + 6)) < 4,
           visible: r.width > 0 && r.height > 0 };
})()`;

/* Bead geometry is read once the page has genuinely come to rest.
   NOT with Animation.finish(): a finished transition keeps applying its end
   value from the animation origin, which outranks the inline style the site
   writes next — so forcing the rest state froze the bead on the geometry of the
   move before it, and a control that works measured as one that does not. The
   endless loops (the sheen, a spinner) are ignored; only one-shot motion has to
   stop. */
async function measure(expr) {
  const busy = "(() => { let n = 0; for (const a of document.getAnimations()) {" +
    " if (a.playState !== 'running') continue;" +
    " try { if (a.effect.getTiming().iterations === Infinity) continue; } catch (e) {}" +
    " n++; } return n })()";
  for (let i = 0; i < 24; i++) {
    if ((await ev(busy)) === 0) break;
    await sleep(70);
  }
  await sleep(70);
  return ev(expr);
}

const results = [];function check(name, pass, detail) {
  results.push({ name, pass: !!pass, detail: detail == null ? "" : String(detail) });
  console.log((pass ? "  ok   " : "  FAIL ") + name + (detail == null || detail === "" ? "" : "  — " + detail));
}
const skipIntro = () => ev("(async()=>{localStorage.setItem('ichhapur.intro.seen','1');return 1})()");
async function go(url, width, height) {
  await send("Emulation.setDeviceMetricsOverride",
    { width, height, deviceScaleFactor: 1, mobile: width < 500 }, sessionId);
  await send("Page.navigate", { url }, sessionId);
  await waitFor("Page.loadEventFired", sessionId);
  await sleep(1000);
}

/* ======================================================== admin.html ==== */
if (process.env.BEAD_DUMP) {
  /* BEAD_DUMP=1 node tools/controls-check.mjs — print what every bead and its
     choice actually looks like, then stop. A bead drawn 2 px wide is a border
     box with no inline width, which means seat() never wrote it; this says so
     instead of leaving it to be inferred from a failed centring assertion. */
  for (const p of ["admin.html", "index.html"]) {
    await go(BASE + p, 1200, 900);
    console.log("\n== " + p);
    console.log(await ev(`(() => {
      const out = ["live=" + document.documentElement.classList.contains('is-lg-live') +
        " glass=" + document.documentElement.getAttribute('data-glass')];
      const thumbs = [...document.querySelectorAll('.lg-thumb')];
      thumbs.forEach((t, i) => {
        const host = t.parentElement;
        const r = t.getBoundingClientRect();
        const act = host.querySelector('.lg-seg__opt[aria-checked="true"], [aria-pressed="true"], input:checked');
        const anchor = act ? (act.tagName === 'INPUT' ? act.parentNode : act) : null;
        const q = anchor ? anchor.getBoundingClientRect() : null;
        out.push('#' + i + ' host=' + host.className.replace('lg-thumb', '').trim() +
          ' rect=' + [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)].join(',') +
          ' inline[' + t.getAttribute('style') + ']' +
          ' pos=' + getComputedStyle(t).position + ' boxS=' + getComputedStyle(t).boxSizing +
          ' maxW=' + getComputedStyle(t).maxWidth);
        out.push('    anchor=' + (anchor ? anchor.className + ' rect=' + [Math.round(q.left), Math.round(q.top), Math.round(q.width), Math.round(q.height)].join(',')
          + ' offsetLeft=' + anchor.offsetLeft + ' offsetWidth=' + anchor.offsetWidth + ' offsetTop=' + anchor.offsetTop + ' offsetHeight=' + anchor.offsetHeight
          + ' offsetParent=' + (anchor.offsetParent ? anchor.offsetParent.className : 'null') : 'NONE') +
          ' hostOffsetParent=' + (host.offsetParent ? host.offsetParent.className : 'null'));
      });
      const rr = document.querySelector('.radio-row');
      if (rr) out.push('radio-row html: ' + rr.innerHTML.replace(/\\s+/g, ' ').slice(0, 400));
      return out.join('\\n');
    })()`));
  }
  dispose();
  process.exit(0);
}

console.log("admin.html — the two status selects as segmented glass controls");
await go(BASE + "admin.html", 1200, 900);
await skipIntro();
await go(BASE + "admin.html", 1200, 900);

const start = await ev(`(() => ({
  mode: document.documentElement.getAttribute('data-glass'),
  segs: document.querySelectorAll('.lg-seg').length,
  thumbs: document.querySelectorAll('.lg-seg .lg-thumb').length,
  rows: document.querySelectorAll('#admRows tr').length,
  anyText: Array.prototype.map.call(document.querySelectorAll('#admStatus option'), (o) => o.textContent).join('|'),
  segText: Array.prototype.map.call(document.querySelectorAll('.lg-seg')[0].querySelectorAll('.lg-seg__opt'),
    (b) => b.textContent).join('|'),
  nativeHidden: getComputedStyle(document.querySelector('#admStatus')).display,
  live: document.documentElement.classList.contains('is-lg-live'),
}))()`);
check("tier + live class on a browser that can refract", start.mode !== null && start.live,
  `data-glass=${start.mode}`);
check("both status selects became segments, one bead each", start.segs === 2 && start.thumbs === 2,
  `segs=${start.segs} thumbs=${start.thumbs}`);
check("the segment labels are the select's own option text", start.anyText === start.segText, start.segText);
check("the list is populated before anything is tested", start.rows > 0, `${start.rows} rows`);

const idx = await ev(`(() => {
  const o = ${SEG(0)}.querySelectorAll('.lg-seg__opt');
  for (let i = 1; i < o.length; i++) if (o[i].getAttribute('data-value') !== '') return i;
  return -1;
})()`);
const before = await ev("document.querySelectorAll('#admRows tr').length");
const b0 = await measure(bead(0));
await tap(`${SEG(0)}.querySelectorAll('.lg-seg__opt')[${idx}]`, "status segment option");

const after = await ev(`(() => ({
  value: document.querySelector('#admStatus').value,
  rows: document.querySelectorAll('#admRows tr').length,
  want: ${SEG(0)}.querySelectorAll('.lg-seg__opt')[${idx}].getAttribute('data-value'),
}))()`);
const b1 = await measure(bead(0));
check("a click writes the value into the <select> the page reads",
  after.value !== "" && after.value === after.want, `#admStatus.value="${after.value}"`);
check("the admin table really re-filtered", after.rows !== before, `rows ${before} -> ${after.rows}`);
check("exactly one choice carries aria-checked", b1.checked.split(",").filter((x) => x === "true").length === 1
  && b1.checked.split(",")[idx] === "true", b1.checked);
check("roving tabindex leaves one tabbable choice", b1.tabs.split(",").filter((x) => x === "0").length === 1, b1.tabs);
check("the group is a named radiogroup for a screen reader", b1.role === "radiogroup" && !!b1.named, `${b1.role} / ${b1.named}`);
check("the bead slid and is centred on the new choice", b1.to !== b0.to && b1.centred === true, `${b0.to} -> ${b1.to}`);

/* the keyboard: focus, arrows, wrapping, and focus that is actually visible */
await ev(`(() => { ${SEG(0)}.querySelectorAll('.lg-seg__opt')[${idx}].focus(); return 1 })()`);
const focused = await ev(`(() => {
  const n = document.querySelector('.lg-seg__opt:focus');
  if (!n) return null;
  return { text: n.textContent, role: n.getAttribute('role'), tabs: n.tabIndex };
})()`);
check("a choice takes real keyboard focus", !!focused, focused && `${focused.text} [${focused.role}] tabindex=${focused.tabs}`);
const v0 = await ev("document.querySelector('#admStatus').value");
await press("ArrowRight");
const k1 = await measure(`(() => ({ value: document.querySelector('#admStatus').value,
  rows: document.querySelectorAll('#admRows tr').length, bead: ${bead(0)},
  ring: (() => {
    const n = document.querySelector('.lg-seg__opt:focus');
    if (!n) return 'nothing focused';
    const c = getComputedStyle(n);
    return (c.outlineStyle === 'none' || parseFloat(c.outlineWidth) < 1) ? 'none'
          : c.outlineWidth + ' ' + c.outlineColor + ' offset ' + c.outlineOffset;
  })() }))()`);
/* The ring is read here, after a real key, and not off the .focus() above:
   :focus-visible is deliberately suppressed for a mouse pointer, and the glass
   control should not answer to a click with a ring a keyboard user needs. */
check("ArrowRight moves the choice and re-filters the table",
  k1.value !== v0 && k1.rows !== after.rows, `"${v0}" -> "${k1.value}", rows ${after.rows} -> ${k1.rows}`);
check("the bead follows the keyboard", k1.bead.centred === true, k1.bead.checked);
check("focus is visible on the glass", k1.ring !== "none" && k1.ring !== "nothing focused", k1.ring);
await press("ArrowRight");                    /* one past the end must wrap */
const k2 = await ev(`(() => {
  const seg = ${SEG(0)};
  const o = seg.querySelectorAll('.lg-seg__opt');
  let at = -1;
  for (let i = 0; i < o.length; i++) if (o[i].getAttribute('aria-checked') === 'true') at = i;
  return { at, of: o.length, value: document.querySelector('#admStatus').value,
           focused: seg.contains(document.activeElement) };
})()`);
check("arrow keys wrap the group and keep focus inside it",
  k2.at >= 0 && k2.at < k2.of && k2.focused, JSON.stringify(k2));

/* reverse direction: admin.js clears the select in code (#btnClear does the
   same line), which fires no change event — the bead must still follow */
const emptied = await ev("!document.querySelector('#admEmpty').hidden");
if (emptied) await tap("document.querySelector('#btnClear')", "clear filters");
else await ev("(() => { document.querySelector('#admStatus').value = ''; return 1 })()");
await sleep(420);
const cleared = await measure(bead(0));
check("a value set in code seats the bead back on the first choice",
  /^true,/.test(cleared.checked) && cleared.centred === true && cleared.to !== k1.bead.to,
  (emptied ? "via #btnClear" : "via .value=") + " " + cleared.checked + " " + cleared.to);

/* the editor's segment, driven through the real path: open a record */
await tap("document.querySelector('#btnAdd')", "add a store");
const two = await measure(`(() => ({
  open: !document.querySelector('#editor').hidden,
  value: document.querySelector('#fStatus').value,
  bead: ${bead(1)},
  described: document.querySelector('#fStatus').getAttribute('aria-describedby'),
}))()`);
check("the editor opens with its status segment seated", two.open && two.bead.centred === true,
  `open=${two.open} #fStatus="${two.value}" ${two.bead && two.bead.checked} ` +
  `bead=[${two.bead && two.bead.at}] on=[${two.bead && two.bead.on}] ` +
  `moving=${two.bead && two.bead.moving} flight=${two.bead && two.bead.flight}`);
check("the hint stays attached to the control", two.described === "hStatus" && two.bead.described === "hStatus",
  `aria-describedby=${two.bead.described}`);
const fIdx = await ev(`(() => {
  const o = ${SEG(1)}.querySelectorAll('.lg-seg__opt');
  for (let i = 0; i < o.length; i++) if (o[i].getAttribute('aria-checked') !== 'true') return i;
  return -1;
})()`);
await tap(`${SEG(1)}.querySelectorAll('.lg-seg__opt')[${fIdx}]`, "editor status option");
const f2 = await measure(`(() => ({
  value: document.querySelector('#fStatus').value,
  bead: ${bead(1)},
  field: (document.querySelector('#fStatus').closest('.field').className || ''),
}))()`);
check("the editor status writes and repaints", f2.value !== two.value && /is-ok|is-warn/.test(f2.field),
  `"${two.value}" -> "${f2.value}" on .${f2.field}`);
check("…and its bead slid", f2.bead.to !== two.bead.to && f2.bead.centred === true,
  `${two.bead.to} -> ${f2.bead.to}`);
/* close it, then reopen a real record: openEditor() assigns #fStatus.value in
   code, so this is the site's own no-event case inside the glass control */
await tap("document.querySelector('#btnCancel')", "close editor");
await tap("document.querySelector('#admRows tr .rowacts .iconbtn')", "edit first row");
const rec = await measure(`(() => ({
  open: !document.querySelector('#editor').hidden,
  value: document.querySelector('#fStatus').value,
  bead: ${bead(1)},
}))()`);
check("opening a record puts its status in the select", rec.open && !!rec.value, `#fStatus="${rec.value}"`);
check("…and the glass shows it, bead centred, no click needed", rec.bead.centred === true, rec.bead.checked);
await tap("document.querySelector('#btnCancel')", "close editor");

/* the header's own glass switch: it must change the tier and remember it */
const g0 = await ev(`(() => {
  const sw = document.getElementById('glassSwitch');
  return { exists: !!sw, checked: sw ? sw.checked : null,
           mode: document.documentElement.getAttribute('data-glass'),
           stored: localStorage.getItem('ichhapur.glass') };
})()`);
check("the header offers a working glass switch", g0.exists && g0.checked === true && g0.mode !== "off",
  `mode=${g0.mode} stored=${g0.stored}`);
await tap("document.querySelector('#glassSwitch + .lg-switch__track')", "glass switch");
const g1 = await ev(`(() => ({
  mode: document.documentElement.getAttribute('data-glass'),
  stored: localStorage.getItem('ichhapur.glass'),
  checked: document.getElementById('glassSwitch').checked,
  knob: (() => { const k = document.querySelector('#glassSwitch + .lg-switch__track .lg-switch__knob');
    const t = document.querySelector('#glassSwitch + .lg-switch__track');
    const a = k.getBoundingClientRect(), b = t.getBoundingClientRect();
    return { inset: Math.round(a.left - b.left), w: Math.round(a.width), track: Math.round(b.width) }; })(),
}))()`);
check("turning it off changes the tier and is remembered",
  g1.mode === "off" && g1.stored === "off" && g1.checked === false, `mode=${g1.mode} stored=${g1.stored}`);
check("…and its knob still sits inside its track",
  g1.knob.inset >= 1 && g1.knob.inset + g1.knob.w <= g1.knob.track - 1, JSON.stringify(g1.knob));
await go(BASE + "admin.html", 1200, 900);
const g2 = await ev(`(() => ({ mode: document.documentElement.getAttribute('data-glass'),
  checked: document.getElementById('glassSwitch').checked }))()`);
check("the preference survives a reload", g2.mode === "off" && g2.checked === false, `mode=${g2.mode}`);
await tap("document.querySelector('#glassSwitch + .lg-switch__track')", "glass switch");
const g3 = await ev(`(() => ({ mode: document.documentElement.getAttribute('data-glass'),
  stored: localStorage.getItem('ichhapur.glass') }))()`);
check("turning it on restores this browser's tier and forgets nothing else",
  g3.mode !== "off" && g3.stored === null, `mode=${g3.mode} stored=${g3.stored}`);

/* every glass switch on the page: the knob must travel and stay inside */
const tracks = await ev(`(() => {
  const rows = [];
  document.querySelectorAll('.switch__track, .lg-switch__track').forEach((tr) => {
    const k = tr.querySelector('.switch__knob, .lg-switch__knob');
    if (!k) return;
    const a = tr.getBoundingClientRect(), b = k.getBoundingClientRect();
    rows.push({ cls: String(tr.className), track: Math.round(a.width), knob: Math.round(b.width),
                left: Math.round(b.left - a.left), right: Math.round(a.right - b.right),
                top: Math.round(b.top - a.top), bottom: Math.round(a.bottom - b.bottom) });
  });
  return rows;
})()`);
check("every knob stays inside its track",
  tracks.length > 0 && tracks.every((r) => r.left >= 1 && r.right >= 1), JSON.stringify(tracks));
check("…and is centred in it, not pinned to a corner",
  tracks.every((r) => Math.abs(r.top - r.bottom) <= 1), JSON.stringify(tracks));

/* ======================================================== index.html ==== */
console.log("\nindex.html — the guide's chips, radios and the unconfirmed switch");
await go(BASE + "index.html?no3d=1", 1200, 900);
const guide = await measure(`(() => ({
  intro: (() => { const o = document.querySelector('.intro'); return o ? (o.hidden ? 'hidden' : 'ON SCREEN') : 'none'; })(),
  chipRows: document.querySelectorAll('.chips__row').length,
  chipThumbs: document.querySelectorAll('.chips__row > .lg-thumb').length,
  chips: document.querySelectorAll('.chips__row .filter-chip').length,
  cards: document.querySelectorAll('#stores .card, .section--stores .card').length,
  bead: ${chipBead(".chips__row")},
  pressed: Array.prototype.map.call(document.querySelectorAll('.chips__row .filter-chip'),
    (x) => x.getAttribute('aria-pressed')).join(','),
}))()`);
check("the chip row has one bead per row", guide.chipRows >= 1 && guide.chipThumbs === guide.chipRows,
  `rows=${guide.chipRows} thumbs=${guide.chipThumbs} chips=${guide.chips} intro=${guide.intro}`);
check("the bead is seated on the pressed chip", !!guide.bead && guide.bead.seated === true, JSON.stringify(guide.bead));
check("one chip is pressed to start", guide.pressed.split(",").filter((x) => x === "true").length === 1, guide.pressed);

const cIdx = await ev(`(() => {
  const c = document.querySelectorAll('.chips__row .filter-chip');
  for (let i = 1; i < c.length; i++) if (c[i].getAttribute('aria-pressed') !== 'true') return i;
  return -1;
})()`);
const cBefore = await ev("document.querySelectorAll('#stores .card, .section--stores .card').length");
const cb0 = await measure(chipBead(".chips__row"));
await tap(`document.querySelectorAll('.chips__row .filter-chip')[${cIdx}]`, "category chip");
const cAfter = await measure(`(() => {
  const row = document.querySelector('.chips__row');
  const a = row.querySelector('.filter-chip[aria-pressed="true"]');
  return { pressed: Array.prototype.map.call(row.querySelectorAll('.filter-chip'),
      (x) => x.getAttribute('aria-pressed')).join(','),
    label: a ? a.textContent : null,
    cards: document.querySelectorAll('#stores .card, .section--stores .card').length,
    bead: ${chipBead(".chips__row")},
    msg: (document.querySelector('.filter__result') || {}).textContent || null };
})()`);
check("a click presses exactly one chip", cAfter.pressed.split(",").filter((x) => x === "true").length === 1,
  cAfter.pressed);
check("…and the directory re-filtered", cAfter.cards !== cBefore || !!cAfter.msg,
  `cards ${cBefore} -> ${cAfter.cards} (${cAfter.label}) ${cAfter.msg || ''}`);
check("…and the bead slid onto it", cAfter.bead.seated === true && cAfter.bead.abs !== cb0.abs,
  JSON.stringify(cAfter.bead) + " was at " + cb0.abs);
await tap("document.querySelector('.chips__row .filter-chip[aria-pressed=\"true\"]')", "back to the pressed chip");

/* chips are buttons: they must be reachable and show focus through the glass */
await ev("(() => { document.querySelector('.chips__row .filter-chip').focus(); return 1 })()");
await press("Tab");
const chipRing = await ev(`(() => {
  const n = document.querySelector('.filter-chip:focus');
  if (!n) return 'not focusable';
  const c = getComputedStyle(n);
  return (c.outlineStyle === 'none' || parseFloat(c.outlineWidth) < 1) ? 'none' : c.outlineWidth + ' ' + c.outlineColor;
})()`);
check("chips are keyboard reachable with a visible ring", chipRing !== "none" && chipRing !== "not focusable", chipRing);

/* the "hide unconfirmed" switch is a real checkbox under a glass track */
const s0 = await ev(`(() => {
  const sw = document.getElementById('hideUnconfirmed');
  const tr = sw.parentNode.querySelector('.switch__track');
  const k = tr.querySelector('.switch__knob');
  return { cards: document.querySelectorAll('#stores .card, .section--stores .card').length,
    checked: sw.checked, knobLeft: Math.round(k.getBoundingClientRect().left - tr.getBoundingClientRect().left) };
})()`);
await tap("document.querySelector('#hideUnconfirmed + .switch__track')", "hide unconfirmed");
const s1 = await ev(`(() => {
  const sw = document.getElementById('hideUnconfirmed');
  const tr = sw.parentNode.querySelector('.switch__track');
  const k = tr.querySelector('.switch__knob');
  return { cards: document.querySelectorAll('#stores .card, .section--stores .card').length,
    checked: sw.checked, knobLeft: Math.round(k.getBoundingClientRect().left - tr.getBoundingClientRect().left),
    tint: getComputedStyle(tr).backgroundColor };
})()`);
check("the switch flips the checkbox it is built on", s1.checked !== s0.checked, `checked=${s1.checked}`);
check("…and the list responds", s1.cards !== s0.cards, `cards ${s0.cards} -> ${s1.cards}`);
check("…and the knob travelled and recoloured",
  Math.abs(s1.knobLeft - s0.knobLeft) > 8, `knob ${s0.knobLeft} -> ${s1.knobLeft}px, track ${s1.tint}`);
await tap("document.querySelector('#hideUnconfirmed + .switch__track')", "hide unconfirmed back");

/* the report form's radios: bead seated, click moves it, code moves it too */
const r0 = await measure(`(() => {
  const row = document.querySelector('.radio-row');
  const on = row.querySelector('input:checked');
  return { inputs: row.querySelectorAll('input').length, hasThumb: !!row.querySelector(':scope > .lg-thumb'),
    checked: on ? on.value : null, bead: ${chipBead(".radio-row")} };
})()`);
check("the radio row carries a bead on its checked choice",
  r0.hasThumb && (!r0.bead.missing ? r0.bead.seated === true : r0.checked === null), JSON.stringify(r0));
const rIdx = await ev(`(() => {
  const r = document.querySelectorAll('.radio-row input');
  for (let i = 0; i < r.length; i++) if (!r[i].checked) return i;
  return -1;
})()`);
await tap(`document.querySelectorAll('.radio-row input')[${rIdx}].parentNode`, "a radio label");
const r1 = await measure(`(() => {
  const on = document.querySelector('.radio-row input:checked');
  return { checked: on ? on.value : null, bead: ${chipBead(".radio-row")} };
})()`);
check("clicking a radio moves the input and the bead",
  r1.checked !== r0.checked && r1.bead.seated === true,
  `${r0.checked} -> ${r1.checked} ${JSON.stringify(r1.bead)}`);
const r2 = await measure(`(() => {
  const row = document.querySelector('.radio-row');
  const inputs = row.querySelectorAll('input');
  const last = inputs[inputs.length - 1];
  last.checked = true;                 /* exactly what main.js does for a #report?kind link */
  return new Promise((res) => setTimeout(() => res({ value: last.value, bead: ${chipBead(".radio-row")} }), 500));
})()`);
check("a radio set in code still moves the bead", r2.bead.seated === true, JSON.stringify(r2));

const wide = await ev(`(() => ({
  overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
  lenses: document.querySelectorAll('.lens').length,
  rims: document.querySelectorAll('.lg-rim').length,
  statcards: document.querySelectorAll('.statcard').length,
  mode: document.documentElement.getAttribute('data-glass'),
}))()`);
check("no horizontal overflow at 1200px", wide.overflow <= 1, `${wide.overflow}px`);
/* The sampled band (.lens) goes on surfaces that sit over the page; the drawn
   band (.lg-rim) goes on the cards that frost themselves, because a backdrop
   filter cannot sample its own host. Which of the two a page needs depends on
   which of those surfaces it actually has, so the count is checked against the
   markup rather than against a fixed number. */
check("every surface that floats over content was marked",
  wide.lenses >= 2 && wide.rims === wide.statcards,
  `lens=${wide.lenses} rim=${wide.rims}/${wide.statcards} statcard mode=${wide.mode}`);

/* landing.html owns the .statcard cards, so the drawn band is proved there */
await skipIntro();
await go(BASE + "landing.html?no3d=1", 1200, 900);
const land = await ev(`(() => ({
  statcards: document.querySelectorAll('.statcard').length,
  rims: document.querySelectorAll('.statcard > .lg-rim').length,
  lenses: document.querySelectorAll('.lens').length,
  overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
  mode: document.documentElement.getAttribute('data-glass'),
}))()`);
check("the cards that frost themselves carry a drawn band",
  land.statcards >= 1 && land.rims === land.statcards && land.lenses >= 2,
  `rim=${land.rims}/${land.statcards} lens=${land.lenses} mode=${land.mode}`);
check("no horizontal overflow on landing at 1200px", land.overflow <= 1, `${land.overflow}px`);

await go(BASE + "index.html?no3d=1", 375, 812);
/* below 900px the header nav becomes the drawer: the switch is inside it and is
   only reachable once the burger has opened it, which is the mobile path a real
   visitor takes */
await tap("document.getElementById('mastToggle')", "the menu button");
const mob = await ev(`(() => {
  const sw = document.getElementById('glassSwitch');
  return { bead: ${chipBead(".chips__row")},
    wraps: getComputedStyle(document.querySelector('.chips__row')).flexWrap,
    open: document.body.classList.contains('nav-open'),
    switchVisible: !!sw && sw.getBoundingClientRect().height > 0 &&
                   sw.closest('.mastnav').getBoundingClientRect().height > 0,
    overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    mode: document.documentElement.getAttribute('data-glass') };
})()`);
check("the bead re-seats on a wrapped chip row at 375px", mob.bead.seated === true && mob.bead.visible,
  JSON.stringify(mob.bead) + " wrap=" + mob.wraps);
check("the glass switch is reachable on mobile too", mob.open && mob.switchVisible, `mode=${mob.mode}`);
const mSw0 = await ev("document.documentElement.getAttribute('data-glass')");
await tap("document.querySelector('#glassSwitch + .lg-switch__track')", "the glass switch in the drawer");
const mSw1 = await ev(`(() => ({
  mode: document.documentElement.getAttribute('data-glass'),
  stored: localStorage.getItem('ichhapur.glass'),
  checked: document.getElementById('glassSwitch').checked,
  overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth }))()`);
check("…and it still turns the material off from the drawer",
  mSw1.mode === "off" && mSw1.stored === "off" && mSw1.checked === false,
  `${mSw0} -> ${mSw1.mode}, stored=${mSw1.stored}`);
await tap("document.querySelector('#glassSwitch + .lg-switch__track')", "the glass switch back on");
await tap("document.getElementById('mastToggle')", "close the menu");
const mobEnd = await ev(`(() => ({
  mode: document.documentElement.getAttribute('data-glass'),
  stored: localStorage.getItem('ichhapur.glass'),
  open: document.body.classList.contains('nav-open'),
  overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth }))()`);
check("…and back on, with the drawer closed and nothing remembered",
  mobEnd.mode !== "off" && mobEnd.stored === null && !mobEnd.open, JSON.stringify(mobEnd));
check("no horizontal overflow at 375px", mobEnd.overflow <= 1, `${mobEnd.overflow}px`);

const failed = results.filter((r) => !r.pass);
console.log("\n" + (results.length - failed.length) + "/" + results.length + " control checks passed");
if (failed.length) {
  console.log("FAILED:");
  failed.forEach((f) => console.log("  - " + f.name + (f.detail ? "  — " + f.detail : "")));
}
dispose();
ws.close();
process.exit(failed.length ? 1 : 0);
