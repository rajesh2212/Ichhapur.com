/* ============================================================================
   ICHHAPUR Market — site audit
   ----------------------------------------------------------------------------
   Scores every page of the site at phone and desktop width and prints one
   weighted percentage plus the list of things that failed.

   Nine checks, each with its own weight:
     contrast      computed foreground/background, WCAG AA, large text 3:1
     pixel         the same text re-measured against the pixels really painted
                   behind it, read out of a full-page screenshot
     overflow      nothing wider than the viewport
     console       runtime errors and failed requests
     links         every anchor resolves, every local asset really loads
     alt           every image has alt text (or an explicit empty decorative alt)
     meta          title, description, canonical, icons, theme-color, share cards
     imgs          every image loads and declares its box (no layout shift)
     motion        prefers-reduced-motion actually stops the animations

   The CSS walk alone cannot see a photograph or a canvas: it reports the solid
   layers behind an element, which for glass over a picture is the pessimistic
   case rather than the truth. So every visible text box is measured twice — once
   from computed styles, then again from a screenshot taken with the glyphs made
   transparent, where the pixels inside the text's own box are the backdrop. The
   second number is the one a reader actually gets, and it is what catches copy
   dropped on a bright part of an image. Decorative text inside aria-hidden is
   outside WCAG 1.4.3, so it is counted and shown, not scored.

   Reuses the same CDP harness as tools/make-images.mjs: headless Chrome, no npm
   install, no test framework. Requires the local preview server on port 4173.

   Run:  node tools/site-audit.mjs [--json path] [page.html ...]
   ========================================================================= */
import { spawn, execSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname).replace(/^\//, ""), "..");
const CHROME = process.env.CHROME || "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const BASE = process.env.ICHH_BASE || "http://127.0.0.1:4173/";
const PROFILE = path.join(os.tmpdir(), "ichh-audit-" + Date.now());
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* Sixteen passes take minutes and the report only prints at the end, so a stall
   anywhere in the middle is invisible. AUDIT_PROGRESS=tools/audit-progress.log
   writes one line per step, as it happens, with the seconds since the start. */
const PROGRESS = process.env.AUDIT_PROGRESS ? path.resolve(ROOT, process.env.AUDIT_PROGRESS) : null;
const T0 = Date.now();
const stage = (msg) => {
  if (PROGRESS) fs.appendFileSync(PROGRESS, Math.round((Date.now() - T0) / 1000) + "s " + msg + "\n");
};

const ALL_PAGES = [
  "index.html", "landing.html", "listings.html", "whats-here.html",
  "about.html", "sources.html", "contact.html", "admin.html",
];
/* the admin panel is a tool, not a shareable page: no social preview bar */
const NO_SHARE = new Set(["admin.html"]);
const WIDTHS = [{ w: 375, h: 812 }, { w: 1200, h: 900 }];

const WEIGHTS = {
  contrast: 20, pixel: 14, overflow: 12, console: 10, links: 12,
  alt: 10, meta: 16, imgs: 8, motion: 12,
};

const argv = process.argv.slice(2);
const jsonAt = argv.indexOf("--json");
const jsonPath = jsonAt >= 0 ? argv[jsonAt + 1] : null;
if (jsonAt >= 0) argv.splice(jsonAt, 2);
const MOTION = argv.includes("--motion");
if (MOTION) argv.splice(argv.indexOf("--motion"), 1);
const PAGES = argv.length ? argv : ALL_PAGES;
const pad = (s, n) => String(s).length > n ? String(s).slice(0, n - 1) + "…" : String(s).padEnd(n);

/* -------------------------------------------------------------------------- */
/* headless chrome over CDP                                                    */
/* -------------------------------------------------------------------------- */
const chrome = spawn(CHROME, ["--headless=new", "--no-sandbox", "--disable-gpu",
  ...(MOTION ? [] : ["--force-prefers-reduced-motion"]), "--disable-dev-shm-usage", "--hide-scrollbars",
  "--remote-debugging-port=0", "--user-data-dir=" + PROFILE, "about:blank"],
  { stdio: "ignore", detached: true });

/* Detached means the browser outlives this script — including when the script is
   killed half-way, which is how one interrupted run left 85 headless Chromes
   competing for the CPU. Close the whole process tree and delete the profile it
   made (they reach 100 MB a run), on every way out of here. */
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
    if (fs.existsSync(f)) { const t = fs.readFileSync(f, "utf8").trim().split("\n"); if (t[0]) return parseInt(t[0], 10); }
    await sleep(250);
  }
  throw new Error("chrome did not report a port");
}

const port = await waitPort();
const ver = await (await fetch("http://127.0.0.1:" + port + "/json/version")).json();
const ws = await new Promise((res, rej) => { const w = new WebSocket(ver.webSocketDebuggerUrl); w.onopen = () => res(w); w.onerror = rej; });

let seq = 0; const pending = new Map(); const events = [];
ws.onmessage = (e) => {
  const m = JSON.parse(String(e.data));
  if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.reject(new Error(m.error.message)) : p.resolve(m.result); }
  else if (m.method) events.push(m);
};
const send = (method, params, sessionId) => {
  const id = ++seq;
  ws.send(JSON.stringify(Object.assign({ id, method }, params ? { params } : {}, sessionId ? { sessionId } : {})));
  return new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
};
const waitFor = (method, sessionId, ms) => new Promise((resolve) => {
  const check = () => { for (let i = 0; i < events.length; i++) { const e = events[i];
    if (e.method === method && (!sessionId || e.sessionId === sessionId)) { events.splice(i, 1); resolve(true); return true; } } return false; };
  if (check()) return;
  const t = setInterval(() => { if (check()) { clearInterval(t); clearTimeout(c); } }, 40);
  const c = setTimeout(() => { clearInterval(t); resolve(false); }, ms || 20000);
});
const clearEvents = () => { events.length = 0; };

const { targetId } = await send("Target.createTarget", { url: "about:blank" });
const { sessionId } = await send("Target.attachToTarget", { targetId, flatten: true });
await send("Page.enable", {}, sessionId);
await send("Runtime.enable", {}, sessionId);
await send("Log.enable", {}, sessionId);
/* The guide's opening signboard is a one-time 3D animation that ends by removing
   itself — which reflows the page while the audit is looking at it. Mark it seen
   before any page script runs, on every navigation, so the measured page is the
   settled page a returning visitor gets. (The in-page write below stays as the
   fallback for a profile where this injection is unavailable.) */
await send("Page.addScriptToEvaluateOnNewDocument", {
  source: "try { localStorage.setItem('ichhapur.intro.seen', '1'); } catch (e) {}" }, sessionId);

const ev = async (expr) => {
  const r = await send("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true }, sessionId);
  if (r.exceptionDetails) throw new Error(expr.slice(0, 70) + " -> " + JSON.stringify(r.exceptionDetails).slice(0, 300));
  return r.result && r.result.value;
};

/* -------------------------------------------------------------------------- */
/* the in-page probe                                                           */
/* -------------------------------------------------------------------------- */
const PROBE = `(async () => {
  const rgbv = (s) => { const m = /rgba?\\(([^)]+)\\)/.exec(s || ""); if (!m) return null;
    const p = m[1].split(/[,\\/ ]+/).filter(Boolean).map(Number);
    /* getComputedStyle always normalises the alpha to a 0-1 decimal */
    return { c: p.slice(0, 3), a: p.length > 3 ? Math.min(1, Math.max(0, p[3])) : 1 }; };
  const chan = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
  const lum = (c) => 0.2126 * chan(c[0]) + 0.7152 * chan(c[1]) + 0.0722 * chan(c[2]);
  const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };

  /* background-image is a comma list, top layer first; the stops inside a
     gradient are commas too, so split on depth 0 only */
  function splitLayers(bi) {
    const out = []; let d = 0, cur = "";
    for (const ch of bi) {
      if (ch === "(") d++; else if (ch === ")") d--;
      if (ch === "," && d === 0) { out.push(cur); cur = ""; } else cur += ch;
    }
    out.push(cur);
    return out.map((s) => s.trim()).filter(Boolean);
  }
  const stopsOf = (layer) => (layer.match(/rgba?\\([^)]*\\)/g) || []).map(rgbv).filter(Boolean);

  /* Build the paint stack from the element up to the root. Each element gives its
     background-colour and then its topmost gradient, because an image paints over
     the colour. Gradients branch — one candidate per stop — since the reader can
     land on the worst half of a two-tone band. A photo in the stack makes the
     result unmeasurable unless an opaque gradient is painted over it. */
  function behind(el) {
    const stack = []; let photoAt = -1, gradAt = -1, n = el, depth = 0;
    while (n) {
      const cs = getComputedStyle(n);
      const b = rgbv(cs.backgroundColor);
      const paints = [];
      let g = null;
      const bi = cs.backgroundImage;
      if (bi && bi !== "none") {
        const ly = splitLayers(bi);
        if (ly.some((l) => l.includes("url(") || l.includes("image("))) photoAt = depth;
        const gl = ly.find((l) => /^(linear|radial|conic)-gradient/.test(l));
        if (gl) {
          const st = stopsOf(gl);
          if (st.length) { g = st; if (gradAt < 0 && st.every((s) => s.a === 1)) gradAt = depth; }
        }
      }
      if (b && b.a > 0) paints.push({ col: b });
      if (g) paints.push({ grad: g });
      stack.push({ paints });
      if (b && b.a === 1) break;
      n = n.parentElement; depth++;
    }
    let cands = [[255, 255, 255]];
    for (let i = stack.length - 1; i >= 0; i--) {
      for (const p of stack[i].paints) {
        if (p.col) {
          const l = p.col;
          cands = cands.map((c) => c.map((v, k) => Math.round(l.c[k] * l.a + v * (1 - l.a))));
        } else {
          const branched = [];
          for (const s of p.grad) for (const c of cands) branched.push(c.map((v, k) => Math.round(s.c[k] * s.a + v * (1 - s.a))));
          if (branched.length) cands = branched.slice(0, 12);
        }
      }
    }
    const covered = gradAt >= 0 && gradAt <= photoAt;
    return { cands, unknown: photoAt >= 0 && !covered };
  }

  /* only elements holding their own text node: a parent that merely wraps
     coloured children would otherwise be counted twice */
  const ownText = (el) => [...el.childNodes]
    .filter((n) => n.nodeType === 3).map((n) => n.nodeValue).join("").trim();

  /* the ink area of the element's own text, not its border-box: a pill carries a
     white arrow disc next to the label, and that disc is not a background any
     letter stands on */
  function textRect(el) {
    const tn = [...el.childNodes].filter((n) => n.nodeType === 3 && n.nodeValue.trim());
    if (!tn.length) return null;
    const rg = document.createRange();
    rg.setStart(tn[0], 0); rg.setEnd(tn[tn.length - 1], tn[tn.length - 1].nodeValue.length);
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const q of rg.getClientRects()) {
      if (q.width < 1 || q.height < 1) continue;
      x0 = Math.min(x0, q.left); y0 = Math.min(y0, q.top);
      x1 = Math.max(x1, q.right); y1 = Math.max(y1, q.bottom);
    }
    if (x0 === Infinity) return null;
    return { left: x0, top: y0, right: x1, bottom: y1, width: x1 - x0, height: y1 - y0 };
  }

  const fails = [];
  const boxes = [];
  let pass = 0, tested = 0, untestable = 0, decor = 0;
  const body = document.body;
  const all = body ? [body, ...body.querySelectorAll("*")] : [];
  for (const el of all) {
    if (el.tagName === "SCRIPT" || el.tagName === "STYLE" || el.tagName === "NOSCRIPT") continue;
    const sample = ownText(el);
    if (!sample) continue;
    const cs = getComputedStyle(el);
    if (cs.display === "none" || cs.visibility === "hidden" || parseFloat(cs.opacity) < 0.15) continue;
    const r = el.getBoundingClientRect();
    if (r.width <= 1 || r.height <= 1) continue;                       /* visually hidden helper */
    if (/inset\\(50%\\)/.test(cs.clipPath || "")) continue;
    /* measured at scroll-top, so anything above or left of the origin is parked
       off-screen (the skip link waits there until it takes focus) */
    if (r.bottom <= 0 || r.right <= 0) continue;
    tested++;
    const sel = el.tagName.toLowerCase() + (el.id ? "#" + el.id : "") + (el.className ? "." + String(el.className).trim().split(/\\s+/).join(".") : "");
    /* pure decoration hidden from assistive tech is outside WCAG 1.4.3; it is
       counted here so the number stays visible instead of quietly passing */
    if (el.closest('[aria-hidden="true"]')) { decor++; tested--; continue; }
    /* every visible text box is handed to the pixel pass, which measures the real
       backdrop painted behind it — this CSS walk cannot see an <img> painted underneath */
    const t = textRect(el) || r;
    if (t.bottom <= 0 || t.right <= 0 || t.width < 2 || t.height < 2) continue;
    /* A line box is taller than the letters in it, so on a tight pill the text
       rect can reach the element's own 1px ring — and a border is not a
       background any letter stands on. Keep the sample inside the box. */
    const sx = Math.max(t.left, r.left + 2), sy = Math.max(t.top, r.top + 2);
    const sxt = Math.min(t.right, r.right - 2), syb = Math.min(t.bottom, r.bottom - 2);
    const sw = sxt - sx, sh = syb - sy;
    const bx = sw >= 2 && sh >= 2 ? { l: sx, t: sy, w: sw, h: sh } : t;
    /* tag the element so a later pass can come back to this exact node — the
       pixel failures are printed with the box's geometry (element rect, text
       rect, border, pseudo-elements) because a number that contradicts the CSS
       is only worth arguing with once. */
    el.setAttribute("data-audit-idx", String(boxes.length));
    boxes.push({
      idx: boxes.length,
      sel, sample: sample.slice(0, 40), color: cs.color,
      x: Math.max(0, Math.round(bx.l + window.scrollX)), y: Math.max(0, Math.round(bx.t + window.scrollY)),
      w: Math.round(bx.w), h: Math.round(bx.h),
      need: ((parseFloat(cs.fontSize) || 16) >= 24 || ((parseFloat(cs.fontSize) || 16) >= 18.66 && (parseFloat(cs.fontWeight) || 400) >= 700)) ? 3 : 4.5,
    });
    const px = parseFloat(cs.fontSize) || 16;
    const wt = parseFloat(cs.fontWeight) || 400;
    const need = (px >= 24 || (px >= 18.66 && wt >= 700)) ? 3 : 4.5;
    const f = rgbv(cs.color); if (!f) continue;
    const { cands, unknown } = behind(el);
    if (unknown) { untestable++; continue; }
    let got = Infinity, bg = cands[0];
    for (const c of cands) {
      const fg = f.c.map((v, i) => Math.round(v * f.a + c[i] * (1 - f.a)));
      const x = ratio(fg, c);
      if (x < got) { got = x; bg = c; }
    }
    if (got + 0.005 >= need) pass++;
    else fails.push({ sel, need, got: +got.toFixed(2), px: +px.toFixed(1), fg: cs.color, bg: "rgb(" + bg.join(",") + ")", sample });
  }

  /* how many of those boxes have a picture under them — the cases where the CSS
     walk could not have answered, and the pixel pass is the only measurement */
  const picRects = [];
  for (const im of document.images) { const q = im.getBoundingClientRect(); picRects.push([q.left + window.scrollX, q.top + window.scrollY, q.right + window.scrollX, q.bottom + window.scrollY]); }
  for (const el of all) {
    const bi = getComputedStyle(el).backgroundImage;
    if (!bi || bi === "none" || bi.indexOf("url(") < 0) continue;
    const q = el.getBoundingClientRect();
    if (q.width > 1 && q.height > 1) picRects.push([q.left + window.scrollX, q.top + window.scrollY, q.right + window.scrollX, q.bottom + window.scrollY]);
  }
  const overPic = boxes.filter((b) => picRects.some((p) =>
    b.x < p[2] && b.x + b.w > p[0] && b.y < p[3] && b.y + b.h > p[1])).length;

  /* --- overflow ------------------------------------------------------- */
  const docW = document.documentElement.scrollWidth;
  const wide = [];
  if (docW > window.innerWidth + 1) {
    for (const el of all) {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.right > window.innerWidth + 1 && getComputedStyle(el).position !== "fixed")
        wide.push({ sel: el.tagName.toLowerCase() + (el.className ? "." + String(el.className).trim().split(/\\s+/).slice(0, 2).join(".") : ""), right: Math.round(r.right) });
    }
    wide.sort((a, b) => b.right - a.right);
  }

  /* --- images --------------------------------------------------------- */
  const imgs = [...document.images];
  const imgInfo = [];
  /* a link whose only content is an image has nothing else for a screen reader
     to announce, so that image may not be marked decorative */
  const hasAltText = (a, im) => [...a.children].some((c) => c !== im && (c.textContent || "").trim().length > 1);
  for (const im of imgs) {
    const box = im.getBoundingClientRect();
    if (box.width === 0 && box.height === 0) continue;                  /* collapsed: not on screen */
    const cs = getComputedStyle(im);
    const link = im.closest("a");
    imgInfo.push({
      src: im.currentSrc || im.src,
      alt: im.getAttribute("alt"),
      lone: !!link && !hasAltText(link, im),
      loaded: im.complete && im.naturalWidth > 0,
      declared: (im.hasAttribute("width") && im.hasAttribute("height")) || (cs.aspectRatio && cs.aspectRatio !== "auto"),
      w: im.getAttribute("width"), h: im.getAttribute("height"),
      cls: String(im.className || "").trim().split(" ")[0],
    });
  }

  /* --- links ---------------------------------------------------------- */
  const anchors = [], external = [], local = [], crossHash = [];
  for (const a of document.querySelectorAll("a[href]")) {
    const href = a.getAttribute("href");
    if (href === null || href === "") continue;
    if (/^(mailto:|tel:|javascript:)/i.test(href)) continue;
    if (href.startsWith("#")) { if (href.length > 1) anchors.push({ href, ok: !!document.getElementById(href.slice(1)), text: a.textContent.trim().slice(0, 26) }); continue; }
    let u; try { u = new URL(href, location.href); } catch (e) { continue; }
    if (u.origin !== location.origin) { external.push(u.href); continue; }
    local.push(u.href.split("#")[0]);
    /* an anchor into another page has to be checked against that page, not this one */
    if (u.hash) crossHash.push({ href, id: u.hash.slice(1), url: u.href, text: a.textContent.trim().slice(0, 26) });
  }
  for (const im of imgs) { if (!im.src) continue; try { const u = new URL(im.src, location.href); if (u.origin === location.origin && !u.href.startsWith("data:")) local.push(u.href); } catch (e) {} }
  for (const s of document.querySelectorAll("script[src],link[href]")) {
    try { const u = new URL(s.href || s.src, location.href); if (u.origin === location.origin) local.push(u.href); } catch (e) {}
  }
  const uniq = [...new Set(local)];
  const dead = [];
  const htmlCache = new Map();
  await Promise.all(uniq.map(async (u) => {
    try {
      const head = await fetch(u, { method: "HEAD" });
      if (!head.ok) { dead.push(u.replace(location.origin, "") + " -> " + head.status); return; }
      const isPage = new URL(u).pathname.endsWith(".html");
      if (isPage) htmlCache.set(u, await (await fetch(u)).text());
    }
    catch (e) { dead.push(u + " -> fetch failed"); }
  }));
  const parsed = new Map();
  for (const c of crossHash) {
    const file = c.url.split("#")[0];
    if (!parsed.has(file)) parsed.set(file, new DOMParser().parseFromString(htmlCache.get(file) || "", "text/html"));
    anchors.push({ href: c.href, ok: !!parsed.get(file).getElementById(c.id), text: c.text });
  }

  /* --- metadata ------------------------------------------------------ */
  const meta = (k) => { const m = document.querySelector('meta[property="' + k + '"],meta[name="' + k + '"]'); return m && m.content ? m.content : ""; };
  const md = {
    title: (document.title || "").trim(),
    desc: meta("description"),
    canonical: (document.querySelector('link[rel="canonical"]') || {}).href || "",
    icon: [...document.querySelectorAll('link[rel~="icon"]')].length,
    apple: [...document.querySelectorAll('link[rel="apple-touch-icon"]')].length,
    theme: meta("theme-color"),
    robots: meta("robots"),
    "og:title": meta("og:title"), "og:description": meta("og:description"),
    "og:type": meta("og:type"), "og:image": meta("og:image"),
    "og:site_name": meta("og:site_name"), "og:locale": meta("og:locale"),
    "twitter:card": meta("twitter:card"), "twitter:image": meta("twitter:image"),
  };
  /* a share card pointing at a file that is not there is worse than none */
  for (const key of ["og:image", "twitter:image"]) {
    if (!md[key]) continue;
    try {
      const u = new URL(md[key], location.href);
      if (u.origin !== location.origin) continue;
      const res = await fetch(u, { method: "HEAD" });
      if (!res.ok) dead.push(key + " -> " + u.pathname + " " + res.status);
    } catch (e) { dead.push(key + " -> unparseable url"); }
  }

  /* --- motion -------------------------------------------------------- */
  const running = [];
  if (document.getAnimations) {
    for (const a of document.getAnimations()) {
      if (String(a.constructor.name) !== "CSSAnimation") continue;
      if (a.playState !== "running") continue;
      const t = a.effect && a.effect.target; if (!t) continue;
      const cs = getComputedStyle(t);
      if (cs.display === "none" || cs.visibility === "hidden") continue;
      running.push(cs.animationName + " on " + t.tagName.toLowerCase() + (String(t.className).trim() ? "." + String(t.className).trim().split(/\\s+/)[0] : ""));
    }
  }
  const guard = {};
  const anim = {};
  const files = [];
  for (const sheet of document.styleSheets) {
    let href = sheet.href; if (!href) continue;
    const file = href.replace(location.origin, "");
    if (files.includes(file)) continue; files.push(file);
    let has = false, moves = false;
    try {
      for (const rule of sheet.cssRules || []) {
        if (rule.conditionText && /prefers-reduced-motion/.test(rule.conditionText)) has = true;
        /* A sheet only owes a reduced-motion block if it moves something: a
           keyframes at-rule, or a rule that names animation/transition. The
           four-rule WebGL stylesheet bends pixels and animates nothing, and
           counting it as unguarded punished the honest answer — the alternative
           was pasting an empty @media block into a file with no motion in it. */
        if (rule.type === 7) moves = true;
        const st = rule.style;
        if (st && (st.getPropertyValue("animation-name") || st.getPropertyValue("transition-property"))) moves = true;
      }
    } catch (e) { has = null; }
    guard[file] = has;
    anim[file] = moves;
  }

  const uniqAnchors = [...new Map(anchors.map((a) => [a.href, a])).values()];

  return {
    url: location.href, width: window.innerWidth,
    contrast: { tested, pass, fails: fails.slice(0, 12), failCount: fails.length, untestable, decor, overPic },
    overflow: { docW, wide: wide.slice(0, 8) },
    alt: imgInfo.map((i) => ({ src: i.src.replace(location.origin + "/", ""), alt: i.alt, cls: i.cls, loaded: i.loaded, declared: i.declared, w: i.w, h: i.h })),
    anchors: uniqAnchors, external: [...new Set(external)], dead: [...new Set(dead)],
    boxes,
    meta: md,
    motion: { running: [...new Set(running)], guard, anim },
  };
})()`;

/* -------------------------------------------------------------------------- */
/* --motion: the inverse question. The scored run forces reduced motion, which  */
/* proves the site can stand still; this pass runs with motion allowed and      */
/* asks whether the entrance animations actually play, and — the part that     */
/* bites when a stagger is wired wrong — whether anything is left invisible.    */
/* -------------------------------------------------------------------------- */
if (MOTION) {
  const STUCK = `(async () => {
    const vis = (el) => { const r = el.getBoundingClientRect(); return r.width > 4 && r.height > 4; };
    const out = [];
    for (const el of document.querySelectorAll('[data-reveal], [data-reveal] > *')) {
      if (!vis(el)) continue;
      if (parseFloat(getComputedStyle(el).opacity) < .05) out.push(el.tagName.toLowerCase() + '.' + String(el.className).trim().split(/\\s+/)[0]);
    }
    return out;
  })()`;
  /* keyframes only — a running transition would say "something moved", not that
     the entrance layer is wired up */
  const RUNNING = `document.getAnimations().filter(a => a.playState === 'running' && a.animationName)
      .map(a => a.animationName)`;
  console.log("\nICHHAPUR motion pass — reduced motion NOT forced, entrance animations expected\n");
  let bad = 0;
  for (const page of PAGES) {
    await send("Emulation.setDeviceMetricsOverride", { width: 375, height: 812, deviceScaleFactor: 1, mobile: true }, sessionId);
    await send("Page.navigate", { url: BASE + page }, sessionId);
    await waitFor("Page.loadEventFired", sessionId, 25000);
    await ev("(async()=>{try{await document.fonts.ready}catch(e){}return 1})()");
    await ev("(async()=>{localStorage.setItem('ichhapur.intro.seen','1');return 1})()");
    /* what is playing at load, before anything scrolls */
    const atLoad = await ev(RUNNING);
    await sleep(500);
    /* jump to the middle and sample straight away, while the reveals are in flight */
    const mid = await ev("(async()=>{const H=document.documentElement.scrollHeight;" +
      "window.scrollTo({top:Math.round(H*0.45),behavior:'instant'});await new Promise(r=>setTimeout(r,90));" +
      "return " + RUNNING + "})()");
    const names = [...new Set([].concat(atLoad || [], mid || []))];
    /* then walk the whole page and let every animation finish */
    await ev("(async()=>{const H=document.documentElement.scrollHeight;" +
      "for(let y=0;y<=H;y+=650){window.scrollTo({top:y,behavior:'instant'});await new Promise(r=>setTimeout(r,70));}" +
      "return 1})()");
    await sleep(1600);
    const stuck = await ev(STUCK);
    const still = await ev(RUNNING);
    if (stuck.length) bad++;
    console.log("  " + pad(page, 18) + pad("keyframes " + (names.length ? "yes" : "no"), 15) +
      pad("stuck " + stuck.length, 11) + pad("left open " + still.length, 14) +
      names.slice(0, 5).join(", ") + (stuck.length ? "   <- " + [...new Set(stuck)].slice(0, 6).join(", ") : ""));
  }
  console.log("\n  " + (bad ? bad + " page(s) left content invisible after the reveal walk."
    : "nothing is left invisible; every revealed group finished at full opacity.") + "\n");
  ws.close();
  chrome.kill("SIGKILL");
  process.exit(bad ? 1 : 0);
}

/* -------------------------------------------------------------------------- */
/* drive it                                                                    */
/* -------------------------------------------------------------------------- */
const results = [];
const noise = [];

for (const page of PAGES) {
  for (const vw of WIDTHS) {
    const tag = page + "@" + vw.w;
    stage("navigate " + tag);
    clearEvents();
    await send("Emulation.setDeviceMetricsOverride", { width: vw.w, height: vw.h, deviceScaleFactor: 1, mobile: vw.w < 500 }, sessionId);
    await send("Page.navigate", { url: BASE + page }, sessionId);
    await waitFor("Page.loadEventFired", sessionId, 25000);
    stage("fonts " + tag);
    await ev("(async()=>{try{await document.fonts.ready}catch(e){}return 1})()");
    /* the guide plays a one-time 3D intro; sit it out so the audit sees the page */
    await ev("(async()=>{localStorage.setItem('ichhapur.intro.seen','1');return 1})()");
    await sleep(400);
    /* walk the whole page so every IntersectionObserver reveal has fired */
    await ev(`(async()=>{const H=document.documentElement.scrollHeight;
      for(let y=0;y<=H;y+=${Math.round(vw.h * 0.8)}){window.scrollTo({top:y,behavior:'instant'});await new Promise(r=>setTimeout(r,60));}
      window.scrollTo({top:0,behavior:'instant'});await new Promise(r=>setTimeout(r,250));return 1})()`);
    await sleep(250);
    /* A picture that arrives after its box has been measured moves every box
       below it, and the pixel pass then reads colour from the wrong place — the
       same page reported two different failures minutes apart until this was
       pinned down. Wait for the lazy ones, then let the layout settle. Bounded,
       because one stalled request must not stall the whole run. */
    stage("settle " + tag);
    await ev(`(async()=>{for(let k=0;k<2;k++){
      const q=[...document.images].filter((i)=>!i.complete||!i.naturalHeight);
      if(!q.length)break;
      await Promise.race([Promise.all(q.map((i)=>i.decode().catch(()=>0))),
        new Promise(r=>setTimeout(r,4000))]);}
      await new Promise(r=>setTimeout(r,200));return 1})()`);

    /* --- pixel pass ----------------------------------------------------
       Make every glyph transparent, screenshot the whole page, then read the
       colour that is actually painted behind each text box. The CSS walk above
       cannot see a photograph or a canvas, so this is the ground truth — and it
       catches translucent glass over a picture, which the walk can only guess at.
       deviceScaleFactor is 1, so page pixels and CSS pixels are the same grid.

       The order matters. The boxes the pixel pass reads are only true for the
       layout the screenshot captured, and this page keeps moving after load: the
       one-time intro settles, a late picture lands, a reveal finishes. A box
       measured 12 px above where its pill finally came to rest samples the ring
       of the element above it and reports a background no letter ever stood on
       (that is what flagged `.badge--warn` at 3.44:1 while the CSS walk, the
       clip and the computed colour all said 6:1). So: put the page on its
       resting state, wait for the geometry to stop changing, shoot, then
       measure — and re-do it if anything moved while the shutter was open.

       Resting state is not the same as "paused". Pausing alone stopped a
       nav-link colour transition at 7% alpha and the audit reported ivory text
       on ivory — a frame no reader ever sees. `finish()` lands each one-shot
       transition and entrance animation on the state it was heading to;
       infinite loops (the ticker, the signboard rope) have no end state, so
       they are paused afterwards. Everything is played back on when done. */
    const FREEZE = `(() => {
      const list = document.getAnimations();
      let finished = 0, paused = 0;
      for (const a of list) { try { a.finish(); finished++; } catch (e) {} }
      for (const a of document.getAnimations()) { try { a.pause(); paused++; } catch (e) {} }
      return finished + " finished, " + paused + " paused";
    })()`;
    const HIDE = "(() => { const st = document.createElement('style'); st.id = 'auditHide';" +
      "st.textContent = '*,*::before,*::after{color:transparent !important;-webkit-text-fill-color:transparent !important;text-shadow:none !important}';" +
      "document.head.appendChild(st); return 1 })()";
    const SHOW = "(() => { const s = document.getElementById('auditHide'); if (s) s.remove(); return 1 })()";
    stage("freeze " + tag + " " + (await ev(FREEZE)));
    const SIG = `(() => {
      const parts = [document.documentElement.scrollHeight, document.body.scrollHeight, window.scrollY];
      const all = document.body ? [...document.body.querySelectorAll("*")] : [];
      let h = 2166136261;
      for (let i = 0; i < all.length; i++) {
        const e = all[i];
        if (e.tagName === "SCRIPT" || e.tagName === "STYLE") continue;
        const r = e.getBoundingClientRect();
        const s = Math.round(r.top) + "," + Math.round(r.left) + "," + Math.round(r.width) + "," + Math.round(r.height);
        for (let k = 0; k < s.length; k++) { h ^= s.charCodeAt(k); h = Math.imul(h, 16777619); }
      }
      return parts.join("|") + "|" + (h >>> 0).toString(36);
    })()`;
    let sig = null;
    for (let k = 0; k < 8; k++) {
      const s = await ev(SIG);
      if (s === sig) break;
      sig = s;
      await sleep(450);
    }
    await ev(HIDE);
    /* the hide style starts a colour transition of its own on anything that
       animates `color` — snap that to its end too, or the shot catches glyphs
       that are only half-transparent */
    await ev(FREEZE);
    let shot, r;
    for (let round = 0; round < 3; round++) {
      shot = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: true }, sessionId);
      stage("shot " + tag + " " + Math.round(shot.data.length / 1024) + "KB");
      await ev(SHOW);
      /* the colour has to come all the way back before it is read, or the walk
         measures the return transition instead of the ink */
      await ev(FREEZE);
      r = await ev(PROBE);
      if ((await ev(SIG)) === sig) break;
      stage("re-shoot " + tag + " (layout still moving)");
      /* name the mover: an element that never comes to rest is a defect worth
         seeing, and a page that shifts between two reads only explains itself */
      stage("  moved " + tag + " " + (await ev(`(() => {
        const all = document.body ? [...document.body.querySelectorAll("*")] : [];
        const prev = window.__sigRects || {}, cur = {}, out = [];
        for (const e of all) {
          if (e.tagName === "SCRIPT" || e.tagName === "STYLE") continue;
          const r = e.getBoundingClientRect();
          const k = e.tagName.toLowerCase() + "." + String(e.getAttribute("class") || "").slice(0, 26) + "#" + (e.id || "");
          const v = Math.round(r.top) + "," + Math.round(r.left) + "," + Math.round(r.width) + "," + Math.round(r.height);
          if (prev[k] !== undefined && prev[k] !== v && out.length < 4) out.push(k + ": " + prev[k] + " -> " + v);
          cur[k] = v;
        }
        window.__sigRects = cur;
        return out.join(" | ") || "(first read)";
      })()`)));
      sig = await ev(SIG);
      await ev(HIDE);
      await ev(FREEZE);
    }
    await ev(SHOW);
    await ev(FREEZE);
    r.pixel = await ev(PIXEL(shot.data, r.boxes));
    stage("pixels " + tag + " " + ((r.pixel && r.pixel.out) || []).length + " boxes");
    /* Not resumed on purpose: the page is left with its one-shot animations on
       their end state and its loops frozen, which is what the clip screenshots
       below want to show. The next pass navigates, so nothing carries over. */

    /* AUDIT_CLIP=tools/dir — save the neighbourhood of each pixel failure, so a
       number that contradicts what the CSS says can be looked at instead of
       argued with. */
    if (process.env.AUDIT_CLIP && r.pixel.out) {
      const ch = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
      const lu = (c) => 0.2126 * ch(c[0]) + 0.7152 * ch(c[1]) + 0.0722 * ch(c[2]);
      const cmp = (a, b) => { const x = lu(a), y = lu(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
      const fails = [];
      for (const s of r.pixel.out) {
        const b = r.boxes[s.i];
        const m = /rgba?\(([^)]+)\)/.exec(b.color); if (!m) continue;
        const p = m[1].split(/[,/ ]+/).filter(Boolean).map(Number);
        const tc = p.slice(0, 3), ta = p.length > 3 ? Math.min(1, p[3]) : 1;
        let worst = Infinity;
        for (const bg of s.s) worst = Math.min(worst, cmp(tc.map((v, k) => Math.round(v * ta + bg[k] * (1 - ta))), bg));
        if (worst + 0.005 < b.need) fails.push([b, worst]);
      }
      for (let i = 0; i < Math.min(fails.length, 6); i++) {
        const b = fails[i][0];
        if (i === 0) {
          /* what colours are actually in the sampled box, counted */
          const hist = await ev(`(async () => {
            const img = new Image(); img.src = "data:image/png;base64,${shot.data}"; await img.decode();
            const c = document.createElement("canvas"); c.width = img.naturalWidth; c.height = img.naturalHeight;
            const x = c.getContext("2d", { willReadFrequently: true }); x.drawImage(img, 0, 0);
            const d = x.getImageData(${b.x}, ${b.y}, ${b.w}, ${b.h}).data;
            const t = {};
            for (let p = 0; p < d.length; p += 4) { const k = d[p] + "," + d[p + 1] + "," + d[p + 2];
              t[k] = (t[k] || 0) + 1; }
            const ch = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
            const lu = (c) => 0.2126 * ch(c[0]) + 0.7152 * ch(c[1]) + 0.0722 * ch(c[2]);
            const rows = [];
            for (let yy = 0; yy < ${b.h}; yy++) {
              let dark = null, dl = Infinity, cnt = {};
              for (let xx = 0; xx < ${b.w}; xx++) { const o = (yy * ${b.w} + xx) * 4;
                const c3 = [d[o], d[o + 1], d[o + 2]]; const k = c3.join(",");
                cnt[k] = (cnt[k] || 0) + 1;
                const l = lu(c3); if (l < dl) { dl = l; dark = c3; } }
              const top = Object.entries(cnt).sort((m, n) => n[1] - m[1])[0];
              rows.push(yy + ":" + (${b.y} + yy) + " " + top[0] + "x" + top[1] + (dark.join(",") !== top[0] ? " dark " + dark.join(",") : ""));
            }
            return rows;
          })()`);
          console.log("  hist " + page + "@" + vw.w + " box " + b.x + "," + b.y + " " + b.w + "x" + b.h +
            " " + JSON.stringify(hist));
        }
        const c = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: true,
          clip: { x: Math.max(0, b.x - 26), y: Math.max(0, b.y - 20), width: b.w + 52, height: b.h + 40, scale: 2 } }, sessionId);
        const f = path.join(process.env.AUDIT_CLIP, page.replace(".html", "") + "-" + vw.w + "-clip" + i + ".png");
        fs.mkdirSync(path.dirname(f), { recursive: true });
        fs.writeFileSync(f, Buffer.from(c.data, "base64"));
        console.log("  clip -> " + f + "  box " + b.x + "," + b.y + " " + b.w + "x" + b.h);
        /* the box in the report is a *clamped text rect*, not the element: print
           the element rect, the raw text rects and the ring so an unexplained
           row of colour can be matched to the CSS that painted it. */
        const geom = await ev(`(() => {
          const el = document.querySelector('[data-audit-idx="${b.idx}"]');
          if (!el) return "element gone";
          const rr = el.getBoundingClientRect();
          const cs = getComputedStyle(el);
          const tn = [...el.childNodes].filter((n) => n.nodeType === 3 && n.nodeValue.trim());
          let tr = [];
          if (tn.length) { const rg = document.createRange();
            rg.setStart(tn[0], 0); rg.setEnd(tn[tn.length - 1], tn[tn.length - 1].nodeValue.length);
            tr = [...rg.getClientRects()].map((q) => [Math.round(q.top + scrollY), Math.round(q.bottom + scrollY), Math.round(q.left + scrollX), Math.round(q.width)]); }
          const p = (pe) => { const s = getComputedStyle(el, pe); return s.content === "none" ? "none"
            : [s.position, s.top, s.bottom, s.height, s.backgroundColor, s.backgroundImage.slice(0, 40), s.borderTopWidth].join(" "); };
          const sib = [...el.parentElement.children].map((q) => q.tagName.toLowerCase() + "." + String(q.className).split(" ")[0]
            + "@" + Math.round(q.getBoundingClientRect().top + scrollY) + "+" + Math.round(q.getBoundingClientRect().height));
          return JSON.stringify({
            box: [${b.y}, ${b.h}, ${b.x}, ${b.w}],
            el: [Math.round(rr.top + scrollY), Math.round(rr.bottom + scrollY), Math.round(rr.left + scrollX), Math.round(rr.width), Math.round(rr.height)],
            text: tr,
            font: [cs.fontSize, cs.lineHeight, cs.paddingTop, cs.paddingBottom, cs.borderTopWidth, cs.borderTopColor, cs.backgroundColor, cs.display, cs.alignItems],
            before: p("::before"), after: p("::after"),
            parent: el.parentElement.tagName.toLowerCase() + "." + String(el.parentElement.className).split(" ")[0] + " " + sib.join(" | "),
            clipTop: ${Math.max(0, b.y - 20)}, clipH: ${b.h + 40}, scale: 2
          }, null, 1);
        })()`);
        console.log("  geom " + page + "@" + vw.w + " " + String(geom).replace(/\n/g, ""));
      }
      await ev("document.querySelectorAll('[data-audit-idx]').forEach(function (e) { e.removeAttribute('data-audit-idx'); }); return 1");
    }

    const logs = events.filter((e) => e.method === "Log.entryAdded").map((e) => e.params.entry);
    const errors = logs.filter((l) => l.level === "error" && l.source !== "network")
      .map((l) => (l.text || "").slice(0, 160));
    const netFail = logs.filter((l) => l.source === "network").map((l) => (l.url || l.text || "").replace(location_origin_safe(), "").slice(0, 120));

    r.page = page;
    r.console = { errors: [...new Set(errors)], netFail: [...new Set(netFail)] };
    results.push(r);
    if (errors.length || netFail.length) noise.push(page + "@" + vw.w + ": " + [...new Set(errors.concat(netFail))].join(" | "));
  }
}
function location_origin_safe() { return BASE.replace(/\/$/, ""); }

/* -------------------------------------------------------------------------- */
/* the pixel pass: read what is really painted behind each text box            */
/* -------------------------------------------------------------------------- */
/* declared as a function so the page loop above can reach it: this string is the
   probe that runs inside the browser, not node code */
function PIXEL(b64, boxes) { return `(async () => {
  const img = new Image();
  img.src = "data:image/png;base64,${b64}";
  await img.decode();
  const c = document.createElement("canvas");
  c.width = img.naturalWidth; c.height = img.naturalHeight;
  const x = c.getContext("2d", { willReadFrequently: true });
  x.drawImage(img, 0, 0);
  const L = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
  const list = ${JSON.stringify(boxes)};
  const out = [];
  for (let i = 0; i < list.length; i++) {
    const b = list[i];
    /* sample where the glyphs actually sit. The border-box of a pill or badge
       reaches into the page behind it — the rounded caps and the 1px ring are
       not a background any letter stands on, but at ~9% of a small box's pixels
       they land exactly on the 92nd percentile. */
    const ix = Math.min(Math.round(b.h / 2), Math.round(b.w * 0.25));
    const iy = Math.min(3, Math.round(b.h * 0.15));
    let bx = b.x + ix, by = b.y + iy;
    let w = b.w - 2 * ix, h = b.h - 2 * iy;
    if (w < 6 || h < 6) { bx = b.x; by = b.y; w = b.w; h = b.h; }     /* tiny: take the whole box */
    w = Math.min(w, c.width - bx); h = Math.min(h, c.height - by);
    if (w < 3 || h < 3) continue;
    const d = x.getImageData(bx, by, w, h).data;
    const px = [];
    for (let p = 0; p < d.length; p += 8) {                        /* every other pixel */
      if (d[p + 3] === 0) continue;
      px.push({ p: [d[p], d[p + 1], d[p + 2]], l: 0.2126 * L(d[p]) + 0.7152 * L(d[p + 1]) + 0.0722 * L(d[p + 2]) });
    }
    if (px.length < 8) continue;
    px.sort((m, n) => m.l - n.l);
    const at = (q) => px[Math.min(px.length - 1, Math.floor(px.length * q))].p;
    /* median plus both tails: the worst of the three is what a reader can hit */
    out.push({ i, s: [at(0.5), at(0.08), at(0.92)] });
  }
  return { w: c.width, h: c.height, out };
})()`; }

const chan = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
const luma = (c) => 0.2126 * chan(c[0]) + 0.7152 * chan(c[1]) + 0.0722 * chan(c[2]);
const contrast = (a, b) => { const x = luma(a), y = luma(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };

function pixelScore(r) {
  const fails = []; let pass = 0, tested = 0;
  for (const s of (r.pixel && r.pixel.out) || []) {
    const b = r.boxes[s.i];
    const m = /rgba?\(([^)]+)\)/.exec(b.color); if (!m) continue;
    const p = m[1].split(/[,/ ]+/).filter(Boolean).map(Number);
    const tc = p.slice(0, 3), ta = p.length > 3 ? Math.min(1, p[3]) : 1;
    tested++;
    let worst = Infinity, wb = null, wf = null;
    for (const bg of s.s) {
      const fg = tc.map((v, k) => Math.round(v * ta + bg[k] * (1 - ta)));
      const x = contrast(fg, bg);
      if (x < worst) { worst = x; wb = bg; wf = fg; }
    }
    if (worst + 0.005 >= b.need) pass++;
    else fails.push({ sel: b.sel, got: +worst.toFixed(2), need: b.need, sample: b.sample,
      at: b.x + "," + b.y + " " + b.w + "x" + b.h,
      fg: "rgb(" + wf.join(",") + ")", bg: "rgb(" + wb.join(",") + ")" });
  }
  return { tested, pass, failCount: fails.length, fails: fails.slice(0, 10) };
}

/* -------------------------------------------------------------------------- */
/* score                                                                       */
/* -------------------------------------------------------------------------- */
function scorePage(r) {
  const needShare = !NO_SHARE.has(r.page);
  const parts = {};
  const pct = (ok, total) => total ? ok / total : 1;

  const c = r.contrast;
  parts.contrast = pct(c.pass, c.tested);
  r.pixels = pixelScore(r);
  parts.pixel = r.pixels.tested ? pct(r.pixels.pass, r.pixels.tested) : 1;

  parts.overflow = r.overflow.wide.length ? 0 : 1;

  parts.console = r.console.errors.length + r.console.netFail.length ? 0 : 1;

  const badLinks = r.anchors.filter((a) => !a.ok).length + r.dead.length;
  const linkUniverse = Math.max(1, r.anchors.length + r.alt.length);
  parts.links = badLinks === 0 ? 1 : Math.max(0, 1 - badLinks / linkUniverse);

  const badAlt = r.alt.filter((i) => i.alt === null || (i.lone && !i.alt));
  parts.alt = pct(r.alt.length - badAlt.length, r.alt.length);
  r.altProblems = badAlt.map((i) => i.src + " (" + i.cls + ")" + (i.alt === null ? " no alt attribute" : " decorative alt inside a link that has no other text"));

  const req = ["title", "desc", "canonical", "icon", "apple", "theme"];
  if (needShare) req.push("og:title", "og:description", "og:type", "og:image", "og:site_name", "og:locale", "twitter:card", "twitter:image");
  let got = 0;
  const missing = [];
  for (const k of req) {
    const v = r.meta[k];
    const ok = k === "icon" || k === "apple" ? Number(v) > 0 : !!v;
    if (ok) got++; else missing.push(k);
  }
  parts.meta = pct(got, req.length);
  r.metaMissing = missing;

  const notLoaded = r.alt.filter((i) => !i.loaded);
  const notDeclared = r.alt.filter((i) => !i.declared);
  parts.imgs = pct(r.alt.length - notLoaded.length - notDeclared.length, r.alt.length);
  r.imgProblems = { notLoaded: notLoaded.map((i) => i.src), notDeclared: notDeclared.map((i) => i.src + " (" + i.cls + ")") };

  /* Only the sheets that move something are asked for a guard — see the probe. */
  const guardFiles = Object.entries(r.motion.guard).filter(([f]) => r.motion.anim[f]);
  const guarded = guardFiles.filter(([, v]) => v === true).length;
  const unreadable = guardFiles.filter(([, v]) => v === null).length;
  const running = r.motion.running.length;
  /* under forced reduced motion nothing may still be animating; a stylesheet
     without a guard block loses its share of the weight */
  let m = 1;
  if (running) m -= Math.min(0.7, running * 0.2);
  if (guardFiles.length) m *= guarded / (guardFiles.length - unreadable || 1);
  parts.motion = Math.max(0, m);
  r.motionMissing = guardFiles.filter(([, v]) => v === false).map(([k]) => k);

  r.parts = parts;
  let num = 0, den = 0;
  for (const k of Object.keys(WEIGHTS)) { num += WEIGHTS[k] * parts[k]; den += WEIGHTS[k]; }
  return num / den;
}

for (const r of results) r.score = scorePage(r);

const byPage = new Map();
for (const r of results) {
  if (!byPage.has(r.page)) byPage.set(r.page, []);
  byPage.get(r.page).push(r);
}

console.log("\nICHHAPUR site audit — " + BASE.replace(/https?:\/\//, "") + " reduced motion forced on\n");
console.log("  " + pad("page", 18) + pad("375", 8) + pad("1200", 8) + pad("AA css", 11) + pad("AA pixels", 11) + pad("over img", 10) + pad("meta", 8) + pad("motion", 9) + "imgs");

const rows = [];
for (const page of PAGES) {
  const list = byPage.get(page) || [];
  const at = (w) => list.find((r) => r.width === w);
  const a = at(375), b = at(1200);
  const s = (list.reduce((n, r) => n + r.score, 0) / (list.length || 1));
  rows.push({ page, s, a, b });
  const f = (r, k) => r ? (r.parts[k] * 100).toFixed(0) + "%" : "-";
  const c = a ? a.contrast.pass + "/" + a.contrast.tested : "-";
  const q = a ? a.pixels.pass + "/" + a.pixels.tested : "-";
  const u = a ? a.contrast.overPic : "-";
  console.log("  " + pad(page, 18) + pad(a ? (a.score * 100).toFixed(1) + "%" : "-", 8) +
    pad(b ? (b.score * 100).toFixed(1) + "%" : "-", 8) +
    pad(c, 11) + pad(q, 11) + pad(u, 10) + pad(a ? f(a, "meta") : "-", 8) + pad(a ? f(a, "motion") : "-", 9) + f(a, "imgs"));
}

const overall = results.reduce((n, r) => n + r.score, 0) / results.length;
const nb = results.reduce((n, r) => n + r.boxes.length, 0);
const op = results.reduce((n, r) => n + r.contrast.overPic, 0);
const un = results.reduce((n, r) => n + r.contrast.untestable, 0);
const dc = results.reduce((n, r) => n + r.contrast.decor, 0);
console.log("\n  weighted overall: " + (overall * 100).toFixed(1) + "%   (target 90%)");
console.log("  contrast: " + nb + " text boxes measured twice, " + op + " of them over a picture where only the pixel pass can answer");
console.log("  the CSS walk gave up on " + un + " box(es); " + dc + " decorative box(es) counted but outside WCAG 1.4.3\n");

/* --- what to fix ---------------------------------------------------- */
const problems = [];
for (const r of results) {
  const tag = r.page + "@" + r.width;
  if (r.contrast.fails.length) problems.push([tag + " contrast", r.contrast.fails.map((x) => x.sel + " " + x.got + ":1 need " + x.need + " [" + x.sample + "] fg " + x.fg + " on " + x.bg).slice(0, 6)]);
  if (r.contrast.failCount > r.contrast.fails.length) problems.push([tag + " contrast more", ["+" + (r.contrast.failCount - r.contrast.fails.length) + " further failures"]]);
  /* the pixel pass reads the real rendered backdrop, so it also catches text over
     a photograph that the CSS walk had to mark untestable */
  if (r.pixels.failCount) problems.push([tag + " contrast (rendered pixels)", r.pixels.fails.map((x) => x.sel + " " + x.got + ":1 need " + x.need + " [" + x.sample + "] fg " + x.fg + " on " + x.bg + " @" + x.at)]);
  if (r.pixels.failCount > r.pixels.fails.length) problems.push([tag + " contrast (pixels) more", ["+" + (r.pixels.failCount - r.pixels.fails.length) + " further failures"]]);
  if (r.overflow.wide.length) problems.push([tag + " overflow", ["scrollWidth " + r.overflow.docW, ...r.overflow.wide.map((x) => x.sel + " right " + x.right)]]);
  if (r.console.errors.length) problems.push([tag + " console", r.console.errors]);
  if (r.console.netFail.length) problems.push([tag + " network", r.console.netFail]);
  const badA = [...new Map(r.anchors.filter((a) => !a.ok).map((a) => [a.href, a])).values()];
  if (badA.length) problems.push([tag + " dead anchors", badA.map((a) => a.href + " (" + a.text + ")")]);
  if (r.dead.length) problems.push([tag + " dead assets", r.dead]);
  const noAlt = r.altProblems;
  if (noAlt.length) problems.push([tag + " alt text", noAlt]);
  if (r.metaMissing.length) problems.push([tag + " metadata", r.metaMissing]);
  if (r.imgProblems.notLoaded.length) problems.push([tag + " images not loading", r.imgProblems.notLoaded]);
  if (r.imgProblems.notDeclared.length) problems.push([tag + " undeclared size", r.imgProblems.notDeclared]);
  if (r.motion.running.length) problems.push([tag + " animates under reduced motion", r.motion.running]);
  if (r.motionMissing.length) problems.push([tag + " no reduced-motion guard", r.motionMissing]);
}
if (problems.length) {
  console.log("  needs work:\n");
  for (const [k, list] of problems) {
    console.log("  " + k);
    for (const l of list) console.log("      - " + l);
  }
  console.log("");
} else console.log("  nothing flagged.\n");

if (jsonPath) {
  fs.writeFileSync(path.resolve(ROOT, jsonPath), JSON.stringify({ overall, weights: WEIGHTS, results }, null, 2));
  console.log("  json -> " + jsonPath + "\n");
}

ws.close();
chrome.kill("SIGKILL");
process.exit(overall >= 0.9 ? 0 : 1);
