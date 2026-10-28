/* tools/tier-check.mjs — prove the glass reads correctly in every tier it can run in.
 *
 *   node tools/tier-check.mjs              # needs the site served on :4173
 *
 * site-audit measures the site's resting tier. This one asks the harder question:
 * when the browser cannot refract — no backdrop-filter, a user who asked for less
 * transparency, a high-contrast display, or the switch turned off — does the page
 * still hold up? So it drives every page through all four tiers (refract, frost,
 * solid, off) at desktop and mobile, and in each one:
 *
 *   1. measures the pixels actually painted behind every text box that sits on a
 *      glass surface, and checks them against WCAG AA (same sampling the audit's
 *      pixel pass uses: median plus both tails of the box's own luma spread);
 *   2. counts the translucent plates still left, because solid and off are
 *      supposed to be opaque all the way through;
 *   3. records the computed backdrop-filter, so "this tier really is different"
 *      is a printed value rather than a claim.
 *
 * It then re-runs the pages under prefers-reduced-transparency and
 * prefers-contrast, which is how a fallback tier gets chosen in the first place.
 *
 *   TIER_PAGES=index.html  TIER_SHOTS=tools/tiers  saves one PNG per page/tier.
 */
import { spawn, execSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const CHROME = process.env.CHROME || "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const BASE = process.env.ICHH_BASE || "http://127.0.0.1:4173/";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const ALL_PAGES = ["index.html", "landing.html", "listings.html", "whats-here.html",
  "about.html", "sources.html", "contact.html", "admin.html"];
const PAGES = process.env.TIER_PAGES ? process.env.TIER_PAGES.split(",") : ALL_PAGES;
const TIERS = ["refract", "frost", "solid", "off"];
const SHOTS = process.env.TIER_SHOTS ? path.resolve(process.env.TIER_SHOTS) : null;
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });

const PROFILE = fs.mkdtempSync(path.join(os.tmpdir(), "ichh-tier-"));
const chrome = spawn(CHROME, ["--headless=new", "--no-sandbox", "--disable-gpu",
  "--disable-dev-shm-usage", "--hide-scrollbars", "--remote-debugging-port=0",
  "--user-data-dir=" + PROFILE, "about:blank"], { stdio: "ignore", detached: true });

/* Chrome outlives this script when it is spawned detached — including when the
   script dies half-way, which is exactly when nobody is left to clean up. */
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
/* page-target commands need the sessionId back on every message, or they land on
   the browser instead of the tab */
const send = (method, params, sessionId) => {
  const id = ++seq;
  ws.send(JSON.stringify(Object.assign({ id, method }, params ? { params } : {}, sessionId ? { sessionId } : {})));
  return new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
};
const waitFor = (method, sessionId, ms) => new Promise((resolve) => {
  const check = () => {
    for (let i = 0; i < events.length; i++) {
      const e = events[i];
      if (e.method === method && (!sessionId || e.sessionId === sessionId)) { events.splice(i, 1); resolve(true); return true; }
    }
    return false;
  };
  if (check()) return;
  const t = setInterval(() => { if (check()) { clearInterval(t); clearTimeout(c); } }, 40);
  const c = setTimeout(() => { clearInterval(t); resolve(false); }, ms || 25000);
});

const { targetId } = await send("Target.createTarget", { url: "about:blank" });
const { sessionId } = await send("Target.attachToTarget", { targetId, flatten: true });
await send("Page.enable", {}, sessionId);
await send("Runtime.enable", {}, sessionId);
const ev = async (expr) => {
  const r = await send("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true }, sessionId);
  if (r.exceptionDetails) throw new Error(expr.slice(0, 70) + " -> " + JSON.stringify(r.exceptionDetails).slice(0, 300));
  return r.result && r.result.value;
};

/* ------------------------------------------------------------------ helpers */

/* Everything the glass layer is allowed to touch, in one selector. A text box
   inside any of these is a box standing on a translucent surface. */
const GLASS = [
  ".masthead", ".backbar", ".mastnav", ".sheet__head", ".floatcard",
  ".lg-rim-host", ".lens", ".chips__row", ".radio-row", ".lg-seg",
  ".statcard", ".shot__note", ".hero__chip", ".toast", ".intro__skip",
  ".lg-switch__track", ".switch__track",
].join(",");

const COLLECT = `(function (glassSel) {
  /* getComputedStyle on a descendant reports the child's own display and opacity,
     never its ancestors' — a caption inside a [data-reveal] group the page has not
     lifted yet (opacity 0) reads as "visible" to that test while painting nothing.
     checkVisibility is the only question that walks the ancestors. */
  function painted(el) {
    if (el.checkVisibility) {
      return el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true });
    }
    var p = el;
    while (p && p.nodeType === 1) {
      var s = getComputedStyle(p);
      if (s.display === "none" || s.visibility === "hidden" || parseFloat(s.opacity) < 0.15) return false;
      p = p.parentElement;
    }
    return true;
  }
  function ownText(el) {
    var t = "";
    for (var i = 0; i < el.childNodes.length; i++) {
      var n = el.childNodes[i];
      if (n.nodeType === 3) t += n.nodeValue;
    }
    return t.trim();
  }
  function textRect(el) {
    var tn = [];
    for (var i = 0; i < el.childNodes.length; i++) {
      var n = el.childNodes[i];
      if (n.nodeType === 3 && n.nodeValue.trim()) tn.push(n);
    }
    if (!tn.length) return null;
    var rg = document.createRange();
    rg.setStart(tn[0], 0);
    rg.setEnd(tn[tn.length - 1], tn[tn.length - 1].nodeValue.length);
    var x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    var rects = rg.getClientRects();
    for (var k = 0; k < rects.length; k++) {
      var q = rects[k];
      if (q.width < 1 || q.height < 1) continue;
      x0 = Math.min(x0, q.left); y0 = Math.min(y0, q.top);
      x1 = Math.max(x1, q.right); y1 = Math.max(y1, q.bottom);
    }
    if (x0 === Infinity) return null;
    return { left: x0, top: y0, right: x1, bottom: y1, width: x1 - x0, height: y1 - y0 };
  }
  var boxes = [];
  var hosts = document.querySelectorAll(glassSel);
  var seen = {};
  var transl = [];
  for (var h = 0; h < hosts.length; h++) {
    var host = hosts[h];
    if (!painted(host)) continue;
    var hc = getComputedStyle(host);
    /* the plate itself: alpha under .9 is see-through by design in refract/frost
       and must not survive into solid/off. A host with nothing painted on it is
       not a plate at all, and there are two ways to have nothing: a background
       that is only a gradient (which reports rgba(0,0,0,0) with the paint in
       backgroundImage), and a structural wrapper that carries padding and no
       fill — the admin editor's head and foot. Neither is something a tier is
       supposed to make opaque, so both are counted out before the check. */
    var bg = /rgba?\\(([^)]+)\\)/.exec(hc.backgroundColor);
    var alpha = bg ? (bg[1].split(/[,/ ]+/).filter(Boolean).length > 3
      ? parseFloat(bg[1].split(/[,/ ]+/).filter(Boolean)[3]) : 1) : 1;
    var bf = (hc.backdropFilter || hc.webkitBackdropFilter || "none");
    /* The gradient half of that deserves its own look, because "it is an image"
       is not the same as "it is see-through": the intro overlay paints itself with
       solid hex stops, which is as opaque as a colour. A gradient only lets the
       backdrop through when a stop carries an alpha. */
    var img = hc.backgroundImage || "none";
    var thinStop = false;
    if (img !== "none") {
      var gr = /rgba?\\(([^)]+)\\)/g, gm;
      while ((gm = gr.exec(img))) {
        var gp = gm[1].split(/[,/ ]+/).filter(Boolean);
        if (gp.length > 3 && parseFloat(gp[3]) < 0.9) { thinStop = true; break; }
      }
    }
    var bare = alpha < 0.005 && bf === "none" && (img === "none" || !thinStop);
    if (!bare) transl.push({
      sel: host.tagName.toLowerCase() + (host.id ? "#" + host.id : "") +
           (host.className ? "." + String(host.className).trim().split(/\\s+/).join(".") : ""),
      alpha: +alpha.toFixed(3),
      bf: bf === "none" ? "none" : bf.slice(0, 46)
    });
    var kids = host.querySelectorAll("*");
    var list = [host];
    for (var i = 0; i < kids.length; i++) list.push(kids[i]);
    for (var j = 0; j < list.length; j++) {
      var el = list[j];
      var tag = el.tagName;
      if (tag === "SCRIPT" || tag === "STYLE" || tag === "NOSCRIPT" || tag === "SVG") continue;
      var sample = ownText(el);
      if (!sample) continue;
      if (!painted(el)) continue;
      var cs = getComputedStyle(el);
      if (el.closest('[aria-hidden="true"]')) continue;
      var r = el.getBoundingClientRect();
      if (r.width <= 1 || r.height <= 1) continue;
      if (/inset\\(50%\\)/.test(cs.clipPath || "")) continue;
      var t = textRect(el) || r;
      if (t.bottom <= 0 || t.right <= 0 || t.width < 2 || t.height < 2) continue;
      /* keep the sample off the element's own 1px ring — a border is not a
         background a letter stands on */
      var sx = Math.max(t.left, r.left + 2), sy = Math.max(t.top, r.top + 2);
      var sxt = Math.min(t.right, r.right - 2), syb = Math.min(t.bottom, r.bottom - 2);
      var sw = sxt - sx, sh = syb - sy;
      var bx = (sw >= 2 && sh >= 2) ? { l: sx, t: sy, w: sw, h: sh } : t;
      var key = Math.round(bx.l) + "," + Math.round(bx.t) + "," + Math.round(bx.w);
      if (seen[key]) continue;
      seen[key] = 1;
      var px = parseFloat(cs.fontSize) || 16;
      var wt = parseFloat(cs.fontWeight) || 400;
      el.setAttribute("data-tier-idx", String(boxes.length));
      boxes.push({
        idx: boxes.length,
        sel: tag.toLowerCase() + (el.id ? "#" + el.id : "") +
             (el.className ? "." + String(el.className).trim().split(/\\s+/).join(".") : ""),
        sample: sample.slice(0, 34), color: cs.color,
        x: Math.max(0, Math.round(bx.l + window.scrollX)),
        y: Math.max(0, Math.round(bx.t + window.scrollY)),
        w: Math.round(bx.w), h: Math.round(bx.h),
        need: (px >= 24 || (px >= 18.66 && wt >= 700)) ? 3 : 4.5
      });
    }
  }
  var bar = document.querySelector(".masthead");
  var bc = bar ? getComputedStyle(bar) : null;
  return {
    mode: document.documentElement.getAttribute("data-glass"),
    innerWidth: window.innerWidth,
    scrollW: document.documentElement.scrollWidth,
    barBf: bc ? ((bc.backdropFilter || bc.webkitBackdropFilter || "none").slice(0, 60)) : "no masthead",
    barBg: bc ? bc.backgroundColor : "",
    lens: document.querySelectorAll(".lens").length,
    rims: document.querySelectorAll(".lg-rim").length,
    defs: !!document.getElementById("lg-lens"),
    thumbs: document.querySelectorAll(".lg-thumb").length,
    transl: transl,
    boxes: boxes
  };
`;

/* The same walk limited to the surfaces a pass actually owns — a drawer lying
   over the page would otherwise hand back page text whose pixels are the
   drawer's, and every one of those boxes would read as a contrast failure. */
const collectFor = (glassSel) => COLLECT + `})(${JSON.stringify(glassSel)})`;

/* One frame, glyphs invisible, so the darkest pixel inside a text box belongs to
   the backdrop and not to the letters. */
const NOGLYPH = "(function(){var s=document.createElement('style');s.id='tw-noglyph';" +
  "s.textContent='*,*::before,*::after{color:transparent !important;-webkit-text-fill-color:transparent !important;text-shadow:none !important}';" +
  "document.head.appendChild(s);return 1})()";
const RESTORE = "(function(){var s=document.getElementById('tw-noglyph');if(s)s.remove();return 1})()";

const SCORE = (src, boxes) => `(async () => {
  var img = new Image();
  img.src = ${JSON.stringify(src)};
  await img.decode();
  var c = document.createElement("canvas");
  c.width = img.naturalWidth; c.height = img.naturalHeight;
  var x = c.getContext("2d", { willReadFrequently: true });
  x.drawImage(img, 0, 0);
  var L = function (v) { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
  function chan(v) { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }
  function luma(c) { return 0.2126 * chan(c[0]) + 0.7152 * chan(c[1]) + 0.0722 * chan(c[2]); }
  function contrast(a, b) { var X = luma(a), Y = luma(b); return (Math.max(X, Y) + 0.05) / (Math.min(X, Y) + 0.05); }
  var list = ${JSON.stringify(boxes)};
  var fails = [], tested = 0, skipped = 0;
  for (var i = 0; i < list.length; i++) {
    var b = list[i];
    var ix = Math.min(Math.round(b.h / 2), Math.round(b.w * 0.25));
    var iy = Math.min(3, Math.round(b.h * 0.15));
    var bx = b.x + ix, by = b.y + iy;
    var w = b.w - 2 * ix, h = b.h - 2 * iy;
    if (w < 6 || h < 6) { bx = b.x; by = b.y; w = b.w; h = b.h; }
    w = Math.min(w, c.width - bx); h = Math.min(h, c.height - by);
    if (!(w >= 3 && h >= 3) || bx < 0 || by < 0) { skipped++; continue; }
    var d = x.getImageData(bx, by, w, h).data;
    var px = [];
    for (var p = 0; p < d.length; p += 8) {
      if (d[p + 3] === 0) continue;
      px.push({ p: [d[p], d[p + 1], d[p + 2]], l: 0.2126 * L(d[p]) + 0.7152 * L(d[p + 1]) + 0.0722 * L(d[p + 2]) });
    }
    if (px.length < 8) { skipped++; continue; }
    px.sort(function (m, n) { return m.l - n.l; });
    var at = function (q) { return px[Math.min(px.length - 1, Math.floor(px.length * q))].p; };
    var samples = [at(0.5), at(0.08), at(0.92)];
    var m2 = /rgba?\\(([^)]+)\\)/.exec(b.color);
    if (!m2) { skipped++; continue; }
    var pp = m2[1].split(/[,/ ]+/).filter(Boolean).map(Number);
    var tc = pp.slice(0, 3), ta = pp.length > 3 ? Math.min(1, pp[3]) : 1;
    tested++;
    var worst = Infinity, wb = null;
    for (var s = 0; s < samples.length; s++) {
      var bgv = samples[s];
      var fg = tc.map(function (v, k) { return Math.round(v * ta + bgv[k] * (1 - ta)); });
      var cc = contrast(fg, bgv);
      if (cc < worst) { worst = cc; wb = bgv; }
    }
    if (worst + 0.005 < b.need) {
      fails.push({ sel: b.sel, sample: b.sample, got: +worst.toFixed(2), need: b.need,
        at: b.x + "," + b.y + " " + b.w + "x" + b.h,
        fg: "rgb(" + tc.join(",") + ")", bg: "rgb(" + wb.join(",") + ")" });
    }
  }
  return { tested: tested, skipped: skipped, fails: fails, frame: c.width + "x" + c.height };
})()`;

/* ------------------------------------------------------------------ driving */

async function setViewport(width, height, mobile) {
  await send("Emulation.setDeviceMetricsOverride",
    { width: width, height: height, deviceScaleFactor: 1, mobile: !!mobile }, sessionId);
}

async function clearEmulated() {
  await send("Emulation.setEmulatedMedia", { media: "", features: [] }, sessionId);
}

async function open(url) {
  /* a load event left in the buffer from the last page would answer this wait
     before the new page had painted, and the measurement would read the old one */
  events.length = 0;
  await send("Page.navigate", { url: url }, sessionId);
  await waitFor("Page.loadEventFired", sessionId, 30000);
  await sleep(900);
  await waitIntro(url);
}

/* The hanging signboard is a one-time overlay that lifts itself ~2.2s after it
   arrives. A page measured while it is still up scores the cream page's pixels as
   somebody else's background, so every open waits for it to be gone — except the
   pass that exists to measure the overlay itself.
   The seen-flag has to be written on the site's own origin: this script starts on
   about:blank, which is an opaque origin, and a setItem there does nothing at all. */
const INTRO_SEED = "(function(){try{localStorage.setItem('ichhapur.intro.seen','1')" +
  "}catch(e){}return 1})()";

async function waitIntro(url) {
  if (/[?&]intro=play/.test(String(url))) return;
  for (let i = 0; i < 30; i++) {
    const up = await ev("(function(){var o=document.getElementById('intro');" +
      "return !!(o&&!o.hidden)})()");
    if (!up) return;
    await sleep(200);
  }
}

/* A page settles a beat after the tier changes: the bead re-seats on resize, and
   the band repaints. Reading earlier measures the previous tier. */
async function toTier(tier) {
  await ev(`(function (t) {
    document.documentElement.setAttribute("data-glass", t);
    var sw = document.getElementById("glassSwitch");
    if (sw) sw.checked = (t !== "off");
    window.dispatchEvent(new Event("resize"));
    return t;
  })(${JSON.stringify(tier)})`);
  await sleep(650);
  await settle();
}

/* …and a beat after it loads, because the site fades its own chrome in.
   Without this the PNGs caught the masthead mid-fade — nav links at a quarter of
   their opacity, which reads as a contrast bug in a screenshot and is nothing of
   the sort. Looping animations (the landing ticker) are skipped: waiting for one
   would wait forever, and it is not what the pass is looking at. */
async function settle() {
  for (let i = 0; i < 30; i++) {
    const running = await ev("(function(){if(!document.getAnimations)return 0;" +
      "var a=document.getAnimations(),r=0;" +
      "for(var i=0;i<a.length;i++){if(a[i].playState!=='running')continue;" +
      "var t=a[i].effect&&a[i].effect.getTiming?a[i].effect.getTiming():null;" +
      "if(t&&t.iterations===Infinity)continue;r++;}return r})()");
    if (!running) return;
    await sleep(120);
  }
}

/* One frame, glyphs invisible, so the darkest pixel inside a text box belongs to
   the backdrop and not to the letters. */
async function measure(snap) {
  await ev(NOGLYPH);
  await sleep(120);
  const shot = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: true }, sessionId);
  const score = await pageScore("data:image/png;base64," + shot.data, snap.boxes);
  await ev(RESTORE);
  return score;
}

/* The pass runs in the page — a huge frame crosses the protocol once as a string
   and the per-box sampling costs nothing to send back. */
async function pageScore(src, boxes) {
  return ev(SCORE(src, boxes));
}

async function pageShot(name) {
  if (!SHOTS) return;
  const shot = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false }, sessionId);
  fs.writeFileSync(path.join(SHOTS, name + ".png"), Buffer.from(shot.data, "base64"));
}

const results = [];
const problems = [];

async function runPage(page, width, height, mobile, url, extra, opts) {
  const hosts = (opts && opts.hosts) || GLASS;
  const label = (opts && opts.label) || page;
  await setViewport(width, height, mobile);
  await open(url);
  if (extra) await ev(extra);
  await sleep(400);
  for (const tier of TIERS) {
    const t0 = Date.now();
    await toTier(tier);
    const snap = await ev(collectFor(hosts));
    const score = await measure(snap);
    const thin = snap.transl.filter((t) => t.alpha < 0.9);
    console.log("  · " + label.padEnd(17) + String(width).padEnd(5) + tier.padEnd(8) +
      score.tested + " boxes, " + score.fails.length + " fail, " + thin.length +
      " translucent of " + snap.transl.length + " surfaces, " + ((Date.now() - t0) / 1000).toFixed(1) + "s");
    results.push({
      page: label, width, tier, mode: snap.mode, boxes: score.tested, skipped: score.skipped,
      fails: score.fails.length, thin: thin.length, surfaces: snap.transl.length,
      bf: snap.barBf, scrollW: snap.scrollW, innerWidth: snap.innerWidth,
      lens: snap.lens, rims: snap.rims, defs: snap.defs, thumbs: snap.thumbs,
    });
    for (const f of score.fails) {
      problems.push([label + " @" + width + " " + tier, f.sel + " " + f.got + ":1 need " + f.need +
        " [" + f.sample + "] " + f.fg + " on " + f.bg + " @" + f.at]);
    }
    if ((tier === "solid" || tier === "off") && thin.length) {
      problems.push([label + " @" + width + " " + tier, "translucent plates left: " +
        thin.slice(0, 4).map((t) => t.sel.split(" ")[0] + " a" + t.alpha).join(", ")]);
    }
    if (snap.scrollW > width + 1) {
      problems.push([label + " @" + width + " " + tier, "overflows: scrollWidth " + snap.scrollW]);
    }
    await pageShot(label.replace(/\.html$/, "") + "-" + width + "-" + tier);
  }
}

/* land on the site's origin once so the seen-flag below is a real write */
await setViewport(1200, 900, false);
await open(BASE + "index.html");
await ev(INTRO_SEED);
await clearEmulated();

console.log("tiers: " + TIERS.join(" / ") + "   pages: " + PAGES.join(", "));

/* The general sweep runs a page exactly as it loads. A modal sheet dims the
   whole page behind a scrim and a drawer paints over the content, so measuring
   every box in those states reports the overlay's pixels as somebody else's
   background — those surfaces get their own pass, restricted to their own hosts. */
for (const page of PAGES) {
  /* no query: the intro overlay is handled by the seen-flag + waitIntro(), not a flag the site does not have */
  const q = "";
  await runPage(page, 1200, 900, false, BASE + page + q, null);
  await runPage(page, 375, 812, true, BASE + page + q, null);
}

/* ------------------------------------------- the states glass only shows when */
/* it is asked: the store sheet, the nav drawer, the admin editor and the toast. */

const SHEET_HOSTS = ".sheet__head, .sheet__inner";
const CHROME_HOSTS = ".mastnav, .masthead, .backbar";
const TOAST_HOSTS = ".toast";
/* The admin editor is `hidden` in the markup until a record is opened, so the
   resting-page pass never sees a single line of its text sitting on glass. */
const EDITOR_HOSTS = ".editor, .editor__head, .editor__foot";

const openSheet = "(function(){var d=document.getElementById('storeDialog');" +
  "if(d&&!d.open)d.showModal();return 1})()";
const openEditor = "(function(){var b=document.getElementById('btnAdd');" +
  "if(b)b.click();return !document.getElementById('editor').hidden})()";
const openDrawer = "(function(){document.body.classList.add('nav-open');" +
  "var t=document.getElementById('mastToggle');" +
  "if(t&&t.setAttribute)t.setAttribute('aria-expanded','true');return 1})()";
const showToast = (bad) => "(function(){var t=document.getElementById('toast');" +
  "if(t){t.hidden=false;t.classList.toggle('is-bad'," + JSON.stringify(!!bad) + ");" +
  "t.textContent=" + JSON.stringify(bad ? "The listing was not saved — see the list above the buttons."
    : "Saved “New Market” — 12 columns updated.") + ";}return 1})()";

if (PAGES.includes("index.html")) {
await runPage("index.html", 1200, 900, false, BASE + "index.html", openSheet,
  { label: "sheet-1200", hosts: SHEET_HOSTS });
await runPage("index.html", 375, 812, true, BASE + "index.html", openSheet,
  { label: "sheet-375", hosts: SHEET_HOSTS });
await runPage("index.html", 375, 812, true, BASE + "index.html", openDrawer,
  { label: "drawer-375", hosts: CHROME_HOSTS });
await runPage("index.html", 1200, 900, false, BASE + "index.html", openDrawer,
  { label: "drawer-1200", hosts: CHROME_HOSTS });
}
if (PAGES.includes("admin.html")) {
await runPage("admin.html", 1200, 900, false, BASE + "admin.html", showToast(false),
  { label: "toast-1200", hosts: TOAST_HOSTS });
await runPage("admin.html", 375, 812, true, BASE + "admin.html", showToast(false),
  { label: "toast-375", hosts: TOAST_HOSTS });
await runPage("admin.html", 1200, 900, false, BASE + "admin.html", showToast(true),
  { label: "toast-bad-1200", hosts: TOAST_HOSTS });
await runPage("admin.html", 375, 812, true, BASE + "admin.html", showToast(true),
  { label: "toast-bad-375", hosts: TOAST_HOSTS });
await runPage("admin.html", 1200, 900, false, BASE + "admin.html", openEditor,
  { label: "editor-1200", hosts: EDITOR_HOSTS });
await runPage("admin.html", 375, 812, true, BASE + "admin.html", openEditor,
  { label: "editor-375", hosts: EDITOR_HOSTS });
}

/* The hanging signboard is the one dark surface the public pages carry, and the
   only place its Skip control is ever read — against a charcoal radial, not the
   cream page. It dismisses itself 2.2s after it arrives, so a keeper holds it up
   for the whole four-tier pass. Stripping `is-out` in a MutationObserver rather
   than on a timer matters: the first pass used a 300ms interval, the fade began
   between two ticks, and the refract frame caught the overlay half-dissolved into
   the cream page — a 1.79:1 reading for a control that is never shown that way.
   The observer lives in the document, so the next navigation is rid of it.
   ?intro=play is the site's own force flag. */
const holdIntro = "(function(){var o=document.getElementById('intro');if(!o)return 1;" +
  "function k(){if(o.hidden)o.hidden=false;if(o.classList.contains('is-out'))o.classList.remove('is-out');}" +
  "k();if(window.MutationObserver)new MutationObserver(k).observe(o,{attributes:true});" +
  "setInterval(k,300);return 1})()";

if (PAGES.includes("index.html")) {
await runPage("index.html", 1200, 900, false, BASE + "index.html?intro=play", holdIntro,
  { label: "intro-1200", hosts: "#intro" });
await runPage("index.html", 375, 812, true, BASE + "index.html?intro=play", holdIntro,
  { label: "intro-375", hosts: "#intro" });
}

/* --------------------------------------------------- the fallback questions */

async function fallback(label, features, page) {
  await clearEmulated();
  if (features.length) await send("Emulation.setEmulatedMedia", { features: features }, sessionId);
  await setViewport(1200, 900, false);
  await open(BASE + (page || "index.html"));
  const snap = await ev(collectFor(GLASS));
  const score = await measure(snap);
  const thin = snap.transl.filter((t) => t.alpha < 0.9 &&
    /masthead|backbar|mastnav|lens|rim|chips|radio|lg-seg/.test(t.sel));
  results.push({
    page: (page || "index.html"), width: "mq", tier: label, mode: snap.mode,
    boxes: score.tested, skipped: score.skipped, fails: score.fails.length,
    thin: thin.length, surfaces: snap.transl.length, bf: snap.barBf,
    scrollW: snap.scrollW, innerWidth: snap.innerWidth,
    lens: snap.lens, rims: snap.rims, defs: snap.defs, thumbs: snap.thumbs,
  });
  for (const f of score.fails) {
    problems.push([label + " " + (page || "index.html"), f.sel + " " + f.got + ":1 need " + f.need +
      " [" + f.sample + "] " + f.fg + " on " + f.bg + " @" + f.at]);
  }
  if (snap.mode !== "solid") {
    problems.push([label + " " + (page || "index.html"), "tier should fall back to solid, got " + snap.mode]);
  }
  if (thin.length) {
    problems.push([label + " " + (page || "index.html"), "translucent chrome left: " +
      thin.slice(0, 4).map((t) => t.sel + " a" + t.alpha).join(", ")]);
  }
  await pageShot((page || "index.html").replace(/\.html$/, "") + "-mq-" + label.replace(/[^a-z]+/gi, ""));
}

for (const page of ["index.html", "listings.html", "admin.html"]) {
  await fallback("reduced-transparency", [{ name: "prefers-reduced-transparency", value: "reduce" }], page);
  await fallback("high-contrast", [{ name: "prefers-contrast", value: "more" }], page);
  await fallback("rt+hc", [{ name: "prefers-reduced-transparency", value: "reduce" },
    { name: "prefers-contrast", value: "more" }], page);
}
await clearEmulated();

/* ------------------------------------------------------- the WebGL plates */
/* Everything above measures the stylesheet. On a machine with a GPU the pixels
   behind these three plates are the shader's, not the CSS's, and a letter that
   holds AA on the CSS plate does not automatically hold it on a refracting one.
   Headless Chrome answers the capability probe with SwiftShader and stands the
   pass down — that is the fallback working, not a gap — so `?lg-gl=on` is what
   asks for the real render here, and the scroll is what puts a plate in the
   viewport, because the pass is deliberately viewport-scoped. Sampling is the
   same screenshot-pixel pass the tiers use, so the number is the composited one. */
const GL_PLATES = [
  ["landing.html", ".hero__chip"],
  ["landing.html", ".shot__note"],
  ["about.html", ".floatcard"],
  ["about.html", ".shot__note"],
  ["listings.html", ".shot__note"],
  ["contact.html", ".shot__note"],
];
const setMax = "(function(){var r=document.getElementById('glassStrength');" +
  "if(r){r.value=100;r.dispatchEvent(new Event('input',{bubbles:true}));}return 1})()";
for (const [w, h, mob] of [[1200, 900, false], [375, 812, true]]) {
  await setViewport(w, h, mob);
  let last = "";
  for (const [page, sel] of GL_PLATES) {
    if (page !== last) { await open(BASE + page + "?lg-gl=on"); last = page; }
    await toTier("refract");
    await ev(setMax);
    await ev(`(function(){var n=document.querySelector(${JSON.stringify(sel)});` +
      "if(n)n.scrollIntoView({block:'center'});return 1})()");
    /* Scrolling is what starts this site's reveal transitions, so the wait has to
       be for the animations to end, not a fixed beat. Measured mid-fade the card
       is at `checkVisibility` false and the pass reports a plate with no text on
       it at all — which is why this row came back with three boxes one run and
       none the next. */
    await sleep(250);
    await settle();
    await sleep(250);
    const live = await ev("(function(){var h=document.documentElement;" +
      "var n=document.querySelector(" + JSON.stringify(sel) + ");" +
      "return {gl:h.getAttribute('data-glass-gl'), painted:n?!!n.hasAttribute('data-gl-painted'):false};})()");
    if (!live.painted) {
      /* The pass is on-demand, so a plate that has not been asked to redraw yet
         is not a failure — nudge it with a scroll and wait a full frame before
         deciding. */
      await ev("(function(){window.scrollBy(0,1);return 1})()");
      await sleep(400);
      await ev("(function(){window.scrollBy(0,-1);return 1})()");
      await sleep(400);
      live.painted = await ev("(function(){var n=document.querySelector(" + JSON.stringify(sel) +
        ");return n?!!n.hasAttribute('data-gl-painted'):false})()");
    }
    if (!live.painted) {
      problems.push([page + " gl@" + w, sel + " never painted (data-glass-gl=" + live.gl + ")"]);
      continue;
    }
    const snap = await ev(collectFor(sel));
    const score = await measure(snap);
    console.log("  · gl " + page.replace(".html", "").padEnd(11) + String(w).padEnd(5) +
      sel.padEnd(14) + score.tested + " boxes, " + score.fails.length + " fail");
    /* A plate that yields no text box was not measured — it looks like a pass in
       the totals and proves nothing. The first run of this pass reported zero
       boxes for a card with three lines of text on it, which is the failure mode
       this line exists to refuse. */
    if (!score.tested) problems.push([page + " gl@" + w, sel + " yielded no text box to measure"]);
    results.push({
      page: "gl:" + page, width: w, tier: "gl-100", mode: "refract",
      boxes: score.tested, skipped: score.skipped, fails: score.fails.length,
      thin: 0, surfaces: 0, bf: "webgl2 pane", scrollW: snap.scrollW, innerWidth: snap.innerWidth,
    });
    for (const f of score.fails) {
      problems.push([page + " gl@" + w, sel + " " + f.got + ":1 need " + f.need +
        " [" + f.sample + "] " + f.fg + " on " + f.bg + " @" + f.at]);
    }
    await pageShot("gl-" + page.replace(".html", "") + "-" + w + "-" +
      sel.replace(/[^a-z]/g, ""));
  }
}

/* ---------------------------------------------------------- header widths */
/* The nav carries a visually-hidden label next to the switch; a width where the
   masthead runs out of room is a layout bug the tiers can each expose. */
const overflows = [];
for (const w of [900, 1000, 1120, 1280]) {
  await setViewport(w, 900, false);
  await open(BASE + "index.html");
  for (const tier of TIERS) {
    await toTier(tier);
    const r = await ev(`(function () {
      var bar = document.querySelector(".masthead");
      var tail = document.querySelector(".masthead__tail");
      return { scrollW: document.documentElement.scrollWidth,
               right: Math.round(bar.getBoundingClientRect().right),
               tailRight: Math.round(tail.getBoundingClientRect().right),
               w: bar.getBoundingClientRect().width };
    })()`);
    if (r.scrollW > w + 1 || r.tailRight > w + 1) {
      overflows.push(w + " " + tier + " scrollW " + r.scrollW + " tail right " + r.tailRight);
    }
  }
}
if (overflows.length) problems.push(["masthead widths", overflows.join(" | ")]);

/* ------------------------------------------------------------- the report */

const pad = (s, n) => { s = String(s); return s + " ".repeat(Math.max(0, n - s.length)); };
console.log("\n" + pad("page", 18) + pad("w", 6) + pad("tier", 21) + pad("mode", 8) +
  pad("glass boxes", 12) + pad("fails", 7) + pad("thin", 6) + pad("bf on masthead", 34) + "overflow");
for (const r of results) {
  console.log(pad(r.page, 18) + pad(r.width, 6) + pad(r.tier, 21) + pad(r.mode, 8) +
    pad(r.boxes, 12) + pad(r.fails, 7) + pad(r.thin, 6) + pad(r.bf, 34) +
    (r.scrollW > r.innerWidth + 1 ? "yes " + r.scrollW : "no"));
}

const byTier = {};
for (const r of results) {
  const k = r.tier;
  byTier[k] = byTier[k] || { boxes: 0, fails: 0, thin: 0, skipped: 0 };
  byTier[k].boxes += r.boxes;
  byTier[k].fails += r.fails;
  /* a translucent plate is the design in refract and frost, so counting it there
     would make the column mean nothing */
  if (r.tier !== "refract" && r.tier !== "frost") byTier[k].thin += r.thin;
  byTier[k].skipped += r.skipped;
}
console.log("\nby tier");
for (const k of Object.keys(byTier)) {
  const v = byTier[k];
  console.log("  " + pad(k, 21) + pad(v.boxes, 8) + "boxes " + pad(v.fails, 6) + "fail " +
    pad(v.thin, 6) + "translucent-where-solid " + v.skipped + " off-frame");
}

console.log("\ntier material (index, 1200):");
for (const r of results) {
  if (r.page === "index.html" && r.width === 1200 && r.tier !== "mq") {
    console.log("  " + pad(r.tier, 21) + "bg " + pad(r.mode, 8) + "backdrop-filter " + r.bf);
  }
}

if (problems.length) {
  console.log("\nFLAGGED");
  for (const [where, what] of problems) console.log("  - " + where + ": " + what);
} else {
  console.log("\nnothing flagged: every glass text box holds AA in all four tiers, " +
    "the fallbacks land on solid, and no chrome stays translucent where it should be opaque.");
}
console.log("measurements: " + results.length + " page/tier states, " +
  results.reduce((n, r) => n + r.boxes, 0) + " text boxes on glass, " +
  results.reduce((n, r) => n + r.fails, 0) + " below AA.");

/* Without this the WebSocket keeps the event loop alive after the last line of
   the report: the script looks like it is still measuring, and the headless
   browser it spawned is never killed. */
dispose();
ws.close();
process.exit(problems.length ? 1 : 0);
