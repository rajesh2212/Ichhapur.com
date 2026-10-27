/* ============================================================================
   ICHHAPUR Market — admin sync check
   ----------------------------------------------------------------------------
   Answers one question with evidence: when the owner edits a listing in
   admin.html, does every other page of this site pick it up — and how far does
   that reach?

   It opens eight tabs of one headless Chrome (the admin panel plus all seven
   public pages), edits the first listing through the real UI — click Edit,
   type into the Summary field, click Save — and then measures what each tab
   does without being reloaded. Then it checks the export, a full reload, and
   the discard-draft path.

   The last two checks are the honest half. The save makes zero network requests
   and the shipped data file is untouched, so nothing left this machine: "every
   tab of this browser" is the real scope, not "every customer's website". The
   script prints that in numbers instead of letting anyone guess.

   Same CDP harness as tools/site-audit.mjs — headless Chrome, no npm.
   Needs the local preview server on 4173.

   Run:  node tools/sync-check.mjs
   ========================================================================= */
import { spawn } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname).replace(/^\//, ""), "..");
const CHROME = process.env.CHROME || "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const BASE = process.env.ICHH_BASE || "http://127.0.0.1:4173/";
const PROFILE = path.join(os.tmpdir(), "ichh-sync-" + Date.now());
const DATA_FILE = path.join(ROOT, "data", "stores.js");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const pad = (s, n) => (String(s).length > n ? String(s).slice(0, n - 1) + "…" : String(s).padEnd(n));

const PUBLIC = ["index.html", "landing.html", "listings.html", "whats-here.html",
  "about.html", "sources.html", "contact.html"];
const MARKER = "Sync check — typed into the admin panel on this browser, then discarded.";
const q = (s) => JSON.stringify(String(s));

/* -------------------------------------------------------------------------- */
/* headless chrome, many sessions                                              */
/* -------------------------------------------------------------------------- */
const chrome = spawn(CHROME, ["--headless=new", "--no-sandbox", "--disable-gpu",
  "--force-prefers-reduced-motion", "--disable-dev-shm-usage", "--hide-scrollbars",
  "--remote-debugging-port=0", "--user-data-dir=" + PROFILE, "about:blank"],
  { stdio: "ignore", detached: true });

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
  w.onopen = () => res(w);
  w.onerror = rej;
});

let seq = 0;
const pending = new Map();
const buckets = new Map();      /* sessionId -> events belonging to that tab */
const accepts = new Map();      /* sessionId -> auto-accept confirm() or not */

ws.onmessage = (e) => {
  const m = JSON.parse(String(e.data));
  if (m.id && pending.has(m.id)) {
    const p = pending.get(m.id);
    pending.delete(m.id);
    m.error ? p.reject(new Error(m.error.message)) : p.resolve(m.result);
    return;
  }
  if (!m.method) return;
  const b = buckets.get(m.sessionId);
  if (b) b.push(m);
  if (m.method === "Page.javascriptDialogOpening") {
    send("Page.handleJavaScriptDialog", { accept: accepts.get(m.sessionId) !== false }, m.sessionId)
      .catch(() => {});
  }
};

const send = (method, params, sessionId) => {
  const id = ++seq;
  ws.send(JSON.stringify(Object.assign({ id, method }, params ? { params } : {}, sessionId ? { sessionId } : {})));
  return new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
};

/* first unconsumed event of this type in this tab, and it is removed */
function take(sessionId, method) {
  const b = buckets.get(sessionId) || [];
  for (let i = 0; i < b.length; i++) {
    if (b[i].method === method) { const e = b[i]; b.splice(i, 1); return e; }
  }
  return null;
}
const has = (sessionId, method) => (buckets.get(sessionId) || []).some((e) => e.method === method);

async function waitFor(sessionId, method, ms) {
  const deadline = Date.now() + (ms || 25000);
  while (Date.now() < deadline) {
    const e = take(sessionId, method);
    if (e) return e;
    await sleep(40);
  }
  return null;
}

async function openTab(name, url, opt) {
  const o = opt || {};
  const { targetId } = await send("Target.createTarget", Object.assign({ url: "about:blank" },
    o.browserContextId ? { browserContextId: o.browserContextId } : {}));
  const { sessionId } = await send("Target.attachToTarget", { targetId, flatten: true });
  buckets.set(sessionId, []);
  accepts.set(sessionId, o.acceptDialogs !== false);
  await send("Page.enable", {}, sessionId);
  await send("Runtime.enable", {}, sessionId);
  await send("Network.enable", {}, sessionId);
  await send("Emulation.setDeviceMetricsOverride",
    { width: 1200, height: 900, deviceScaleFactor: 1, mobile: false }, sessionId);
  await send("Page.navigate", { url }, sessionId);
  if (!(await waitFor(sessionId, "Page.loadEventFired"))) throw new Error(name + " never finished loading");
  const tab = {
    name, url, sessionId, targetId,
    eval: async (expr) => {
      const r = await send("Runtime.evaluate",
        { expression: expr, returnByValue: true, awaitPromise: true }, sessionId);
      if (r.exceptionDetails) {
        throw new Error(name + ": " + (r.exceptionDetails.exception && r.exceptionDetails.exception.description
          || r.exceptionDetails.text || "thrown").split("\n")[0].slice(0, 200));
      }
      return r.result && r.result.value;
    },
    click: (sel) => tab.eval("(() => { const n = document.querySelector(" + q(sel) + ");" +
      " if (!n) throw new Error('missing " + sel + "');" +
      " if (n.disabled) throw new Error('disabled " + sel + "');" +
      " n.click(); return 1 })()"),
    reload: async () => {
      await send("Page.navigate", { url: tab.url }, sessionId);
      if (!(await waitFor(sessionId, "Page.loadEventFired"))) throw new Error(name + " reload hung");
      await mark(tab);
    },
    requests: () => (buckets.get(sessionId) || [])
      .filter((e) => e.method === "Network.requestWillBeSent")
      .map((e) => e.params.request.url),
  };
  await mark(tab);
  return tab;
}

/* the intro curtain would cover the guide, and every tab gets a marker proving
   its JS context was never torn down between the save and the re-render */
async function mark(tab) {
  await tab.eval("(() => { try { localStorage.setItem('ichhapur.intro.seen','1'); } catch (e) {}" +
    " window.__nonce = 'alive'; return 1 })()");
}

/* one probe for every tab. The guide flags a draft with its own #draftNote,
   the other six pages with the footer line — both are read here. */
let editIdx = 0;
const PROBE = `(() => {
  const d = window.MD.get();
  const st = document.getElementById('footStatus');
  const note = document.getElementById('draftNote');
  return {
    local: !!d.local, savedAt: d.savedAt || null, count: d.stores.length,
    desc: d.stores[EDIT_INDEX] ? d.stores[EDIT_INDEX].description : null,
    status: st ? st.textContent : '(no footer line)',
    note: note ? (note.hidden ? 'hidden' : 'shown') : 'none',
    marker: document.body.innerText.indexOf(${q(MARKER)}) > -1,
    nonce: window.__nonce || null,
  };
})()`;
const probeExpr = () => PROBE.replace(/EDIT_INDEX/g, String(editIdx));
/* a page says it is on a draft either in the footer line (six pages) or in
   the guide's own note (index.html) */
const flagsDraft = (x) => /local draft/i.test(x.status) || x.note === "shown";
const flagsPublished = (x) => /published listings file/i.test(x.status) || x.note === "hidden";

/* waits for the tab's own data to show the draft, returns how long it took */
const UNTIL_DRAFT = `(() => { try { localStorage.setItem('ichhapur.intro.seen','1'); } catch (e) {}
  window.__nonce = 'alive';
  const t0 = performance.now();
  return new Promise(function (resolve) {
    (function poll() {
      const d = window.MD.get();
      if (d.local) { resolve(Math.round(performance.now() - t0)); return; }
      if (performance.now() - t0 > 6000) { resolve(-1); return; }
      setTimeout(poll, 50);
    })();
  }); })()`;

const UNTIL_PUBLISHED = `(() => { try { localStorage.setItem('ichhapur.intro.seen','1'); } catch (e) {}
  window.__nonce = 'alive';
  const t0 = performance.now();
  return new Promise(function (resolve) {
    (function poll() {
      if (!window.MD.get().local) { resolve(Math.round(performance.now() - t0)); return; }
      if (performance.now() - t0 > 6000) { resolve(-1); return; }
      setTimeout(poll, 50);
    })();
  }); })()`;

/* -------------------------------------------------------------------------- */
/* checks                                                                      */
/* -------------------------------------------------------------------------- */
const checks = [];
const record = (label, pass, detail) => {
  checks.push({ label, pass, detail });
  console.log("  " + (pass === null ? "--  " : pass ? "PASS  " : "FAIL  ") + pad(label, 46) + (detail || ""));
};
const anyFail = () => checks.some((c) => c.pass === false);

const storesHash = () => crypto.createHash("sha256").update(fs.readFileSync(DATA_FILE)).digest("hex").slice(0, 12);

console.log("\nICHHAPUR sync check — one browser, eight tabs, the admin UI driven for real\n");

const dataHashBefore = storesHash();
const admin = await openTab("admin.html", BASE + "admin.html");
const tabs = [];
for (const p of PUBLIC) tabs.push(await openTab(p, BASE + p));

/* snapshot what each page prints, before anything is touched */
const firstPaint = new Map();   /* page -> the body text it first showed */
let printedOn = [];             /* pages that really render that summary */
for (const t of tabs) firstPaint.set(t.name, await t.eval("document.body.innerText"));

/* --- 1. everybody starts on the published file ---------------------------- */
{
  const rows = [];
  for (const t of [admin].concat(tabs)) rows.push({ name: t.name, r: await t.eval(probeExpr()) });
  const n = rows[0].r.count;
  const off = rows.filter((x) => x.r.local || x.r.count !== n);
  record("all 8 tabs load the published file", off.length === 0,
    n + " listings, none marked local" + (off.length ? " — off: " + off.map((x) => x.name).join(", ") : ""));

  const notice = await admin.eval("document.querySelector('.notice').innerText");
  record("admin states its own scope", /no server/i.test(notice) && /another phone/i.test(notice),
    "says there is no server and that another phone is not reached");

  /* edit the listing whose summary is really on screen, so the next checks
     measure reach rather than a field most pages never print */
  const descs = await admin.eval("window.MD.base().stores.map(function (s) { return s.description || ''; })");
  let best = -1;
  for (let i = 0; i < descs.length; i++) {
    if (!descs[i]) continue;
    const hits = tabs.filter((t) => firstPaint.get(t.name).indexOf(descs[i]) > -1);
    if (hits.length > best) { best = hits.length; editIdx = i; }
  }
  printedOn = tabs.filter((t) => firstPaint.get(t.name).indexOf(descs[editIdx]) > -1).map((t) => t.name);
  record("picked a listing that is printed on screen", printedOn.length > 0,
    "listing " + (editIdx + 1) + " \u201c" + descs[editIdx].slice(0, 40) + "…\u201d shows as text on " +
      printedOn.length + " page(s): " + printedOn.map((p) => p.replace(".html", "")).join(", "));
}

/* --- 2. edit through the panel's own controls ----------------------------- */
await admin.eval("(() => { const tr = document.querySelectorAll('#admRows tr')[" + editIdx + "];" +
  " if (!tr) throw new Error('row " + editIdx + " is not in the table');" +
  " tr.querySelector('.iconbtn').click(); return 1 })()");
await sleep(300);
const editor = await admin.eval(`(() => { const ed = document.getElementById('editor');
  return { shown: !ed.hidden, name: document.getElementById('fName').value,
           desc: document.getElementById('fDesc').value }; })()`);
record("Edit opened the listing's own form", editor.shown && editor.desc.length > 0, editor.name);

await admin.eval("(() => { const n = document.getElementById('fDesc');" +
  " n.value = " + q(MARKER) + ";" +
  " n.dispatchEvent(new Event('input', { bubbles: true }));" +
  " n.dispatchEvent(new Event('change', { bubbles: true })); return 1 })()");

const reqsBefore = admin.requests().length;
await admin.click("#btnSave");
await sleep(800);
const reqsAfter = admin.requests().length;

const saved = await admin.eval(`(() => { const err = document.getElementById('edErr');
  return { blocked: !err.hidden && err.innerText.trim() !== '', err: err.innerText.trim().slice(0, 160),
           saved: document.getElementById('edSaved').textContent,
           count: document.getElementById('admCount').textContent }; })()`);
record("the form accepted the edit", !saved.blocked, saved.blocked ? saved.err : "no validation trip");
record("panel reports the re-render claim", /every other tab|other tab/i.test(saved.saved),
  saved.saved.slice(0, 96) + "…");
record("admin list says local draft", /local draft/.test(saved.count), saved.count);

/* --- 3. the save touched no network -------------------------------------- */
{
  const made = admin.requests().slice(reqsBefore);
  record("saving sent 0 requests", reqsAfter === reqsBefore,
    reqsAfter - reqsBefore + " new request(s) after the click" + (made.length ? ": " + made.join(", ") : ""));
  const seen = new Set();
  for (const t of [admin].concat(tabs)) {
    for (const u of t.requests()) if (u.indexOf("data:") !== 0) seen.add(u);
  }
  const FONT = ["https://fonts.googleapis.com", "https://fonts.gstatic.com"];
  const foreign = [...seen].filter((u) => u.indexOf(BASE) !== 0);
  const endpoints = foreign.filter((u) => !FONT.some((h) => u.startsWith(h)));
  record("no endpoint receives the edit", endpoints.length === 0,
    foreign.length + " URL(s) outside this origin, all of them the Google Fonts " +
      "stylesheet and its woff2 — no API, no form, no analytics" +
      (endpoints.length ? "; offenders: " + endpoints.slice(0, 3).join(", ") : ""));
}

/* --- 4. every other tab re-renders without a reload ---------------------- */
{
  const out = [];
  for (const t of tabs) {
    const ms = await t.eval(UNTIL_DRAFT);
    out.push(Object.assign({ name: t.name, ms: ms }, await t.eval(probeExpr())));
  }
  const slow = out.filter((x) => x.ms < 0);
  record("all 7 public tabs re-rendered live", slow.length === 0,
    "slowest " + Math.max.apply(null, out.map((x) => Math.max(0, x.ms))) + " ms" +
    (slow.length ? " — stuck: " + slow.map((x) => x.name).join(", ") : ""));
  const reloaded = out.filter((x) => x.nonce !== "alive");
  record("…in the same page context (no reload)", reloaded.length === 0,
    reloaded.length ? reloaded.map((x) => x.name).join(", ") + " lost its marker" : "__nonce survived in all 7");
  const wrong = out.filter((x) => x.desc !== MARKER);
  record("…with the edited text in their data", wrong.length === 0,
    "MD.get().stores[" + editIdx + "].description matches in " + (out.length - wrong.length) + "/" + out.length +
    (wrong.length ? "; off: " + wrong.map((x) => x.name).join(", ") : ""));
  const painted = out.filter((x) => x.marker);
  const missed = printedOn.filter((p) => !painted.some((x) => x.name === p));
  record("…and painted where that summary is printed", printedOn.length > 0 && missed.length === 0,
    painted.map((x) => x.name.replace(".html", "")).join(", ") +
      (missed.length ? " — but " + missed.join(", ") + " still shows the old line" : ""));
  const banner = out.filter(flagsDraft);
  record("every page says a local draft is showing", banner.length === out.length,
    banner.length + "/" + out.length + " said so (footer line or the guide's own note)" +
      (banner.length === out.length ? "" : " — silent: " +
        out.filter((x) => !flagsDraft(x)).map((x) => x.name.replace(".html", "")).join(", ")));
}

/* --- 5. the record itself ------------------------------------------------- */
{
  const rec = await tabs[2].eval("(() => { const raw = localStorage.getItem(window.MD.KEY);" +
    " if (!raw) return null; const o = JSON.parse(raw);" +
    " return { bytes: raw.length, keys: Object.keys(o).join(','), savedAt: o.savedAt," +
    " count: o.stores.length, has: o.stores.some(s => s.description === " + q(MARKER) + ") }; })()");
  record("one storage record, shared", !!rec && rec.has && rec.keys === "savedAt,market,categories,stores",
    rec ? rec.bytes + " B under key \u201cichhapur.working.v1\u201d, " + rec.count + " stores" : "nothing written");

  const adminCopy = await admin.eval("JSON.parse(localStorage.getItem(window.MD.KEY)).stores.length");
  const pubCopy = await tabs[0].eval("JSON.parse(localStorage.getItem(window.MD.KEY)).stores.length");
  record("no listing was added or lost", adminCopy === pubCopy, adminCopy + " stores in both tabs");
}

/* --- 6. export is the only way out -------------------------------------- */
{
  await admin.click("#btnExport");
  await sleep(200);
  await admin.click("#btnShow");
  await sleep(200);
  const txt = await admin.eval("document.getElementById('exportText').textContent");
  let parsed = null, err = "";
  try { parsed = JSON.parse(txt); } catch (e) { err = e.message; }
  record("export yields parseable JSON", !!parsed && Array.isArray(parsed.stores),
    err || (txt.length / 1024).toFixed(1) + " KB, " + (parsed ? parsed.stores.length : 0) + " stores," +
      " marker included: " + (parsed ? parsed.stores.some((s) => s.description === MARKER) : "-"));
  const file = await admin.eval("fetch('data/stores.js').then(r => r.text()).then(t => t.indexOf(" +
    q(MARKER) + ") > -1)");
  record("the shipped file is NOT rewritten", file === false,
    "data/stores.js as served still has no draft text — export is a manual paste");
}

/* --- 7. survives a reload, and does not survive the machine -------------- */
{
  await tabs[2].reload();
  const r = await tabs[2].eval(probeExpr());
  record("a reload still shows the draft", r.local && r.desc === MARKER,
    "savedAt " + r.savedAt + " read back from storage");

  /* an isolated browser context is the closest thing here to a second device:
     same URL, same profile process, its own storage */
  const { browserContextId } = await send("Target.createBrowserContext", { disposeOnDetach: true });
  const other = await openTab("other-device", BASE + "index.html", { browserContextId });
  const rr = await other.eval(probeExpr());
  record("…but it stops at this browser", rr.local === false && rr.marker === false,
    "an isolated profile (a stand-in for another device) loads the published file: " +
      rr.count + " listings, local=" + rr.local);
  await send("Target.closeTarget", { targetId: other.targetId });
  await send("Target.disposeBrowserContext", { browserContextId }).catch(() => {});
  buckets.delete(other.sessionId);
  await sleep(200);
}

/* --- 8. discard the draft ------------------------------------------------ */
{
  const dialogsBefore = has(admin.sessionId, "Page.javascriptDialogOpening");
  await admin.click("#btnReset");
  await sleep(400);
  record("discard asks before deleting", has(admin.sessionId, "Page.javascriptDialogOpening") || dialogsBefore,
    "confirm() fired and the harness accepted it");
  const gone = await tabs[2].eval("!localStorage.getItem(window.MD.KEY)");
  record("the storage record is gone", gone === true, "ichhapur.working.v1 removed");

  const back = [];
  for (const t of tabs) {
    const ms = await t.eval(UNTIL_PUBLISHED);
    back.push(Object.assign({ name: t.name, ms: ms }, await t.eval(probeExpr())));
  }
  const stuck = back.filter((x) => x.ms < 0 || x.local || x.marker);
  record("all 7 public pages reverted live", stuck.length === 0,
    stuck.length ? "still on the draft: " + stuck.map((x) => x.name).join(", ")
      : "published text restored in " + Math.max.apply(null, back.map((x) => Math.max(0, x.ms))) + " ms");
  const banner = back.filter(flagsPublished);
  record("every page stops claiming a draft", banner.length === back.length,
    banner.length + "/" + back.length + " read \u201cShowing the published listings file\u201d" +
      (banner.length === back.length ? "" : " — still: " +
        back.filter((x) => !flagsPublished(x)).map((x) => x.name.replace(".html", "")).join(", ")));
}

record("data/stores.js never changed on disk", dataHashBefore === storesHash(),
  "sha256 " + dataHashBefore + " both times");

/* -------------------------------------------------------------------------- */
console.log("\n  " + checks.filter((c) => c.pass).length + " of " + checks.length + " checks passed\n");
if (anyFail()) console.log("  failing: " + checks.filter((c) => c.pass === false).map((c) => c.label).join("; ") + "\n");

try { fs.rmSync(PROFILE, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 }); } catch (e) { /* temp dir */ }
ws.close();
chrome.kill("SIGKILL");
process.exit(anyFail() ? 1 : 0);
