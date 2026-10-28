/* tools/glass-probe.mjs — print what the glass layer actually did on a page.
   node tools/glass-probe.mjs [page.html] [selector ...]                      */
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname).replace(/^\//, ""), "..");
const CHROME = process.env.CHROME || "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const BASE = process.env.ICHH_BASE || "http://127.0.0.1:4173/";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const args = process.argv.slice(2);
const page = args.length ? args[0] : "admin.html";
const sels = ["html", "#btnAdd", ".shot__note", ".about__card", ".masthead"].concat(args.slice(1));

const PROFILE = fs.mkdtempSync(path.join(os.tmpdir(), "ichh-probe-"));
const chrome = spawn(CHROME, ["--headless=new", "--no-sandbox", "--disable-gpu",
  "--disable-dev-shm-usage", "--hide-scrollbars", "--remote-debugging-port=0",
  "--user-data-dir=" + PROFILE, "about:blank"], { stdio: "ignore", detached: true });

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
const { targetId } = await send("Target.createTarget", { url: "about:blank" });
const { sessionId } = await send("Target.attachToTarget", { targetId, flatten: true });
await send("Page.enable", {}, sessionId);
await send("Runtime.enable", {}, sessionId);
const ev = async (expr) => {
  const r = await send("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true }, sessionId);
  if (r.exceptionDetails) throw new Error(expr.slice(0, 70) + " -> " + JSON.stringify(r.exceptionDetails).slice(0, 300));
  return r.result && r.result.value;
};

await send("Emulation.setDeviceMetricsOverride", { width: 1200, height: 900, deviceScaleFactor: 1, mobile: false }, sessionId);
await send("Page.navigate", { url: BASE + page }, sessionId);
await waitFor("Page.loadEventFired", sessionId, 25000);
await sleep(1200);

const out = await ev(`(() => {
  const sels = ${JSON.stringify(sels)};
  const rows = [];
  for (const sel of sels) {
    const n = document.querySelector(sel);
    if (!n) { rows.push({ sel, missing: true }); continue; }
    const c = getComputedStyle(n);
    rows.push({
      sel,
      cls: String(n.className).slice(0, 70),
      bg: c.backgroundColor,
      bgImg: c.backgroundImage.slice(0, 60),
      color: c.color,
      bf: (c.backdropFilter || c.webkitBackdropFilter || "none").slice(0, 60),
      pos: c.position,
      disp: c.display,
      xform: c.transform,
      offs: [c.top, c.right, c.bottom, c.left].join("/"),
      marg: [c.marginTop, c.marginRight, c.marginBottom, c.marginLeft].join("/"),
      alignSelf: c.alignSelf,
      z: c.zIndex,
      pad: [c.paddingTop, c.paddingRight, c.paddingBottom, c.paddingLeft].join("/"),
      cssH: c.height, minH: c.minHeight, wrap: c.flexWrap, align: c.alignItems, gap: c.gap,
      w: Math.round(n.getBoundingClientRect().width),
      h: Math.round(n.getBoundingClientRect().height),
      x: Math.round(n.getBoundingClientRect().left),
      y: Math.round(n.getBoundingClientRect().top),
      parent: n.parentElement ? n.parentElement.className || n.parentElement.tagName.toLowerCase() : "",
      pPos: n.parentElement ? getComputedStyle(n.parentElement).position : "",
      pWrap: n.parentElement ? getComputedStyle(n.parentElement).flexWrap : "",
      pH: n.parentElement ? Math.round(n.parentElement.getBoundingClientRect().height) : 0
    });
  }
  return {
    mode: document.documentElement.getAttribute("data-glass"),
    live: document.documentElement.classList.contains("is-lg-live"),
    innerWidth: window.innerWidth,
    mqMobile: matchMedia("(max-width: 899px)").matches,
    ulDir: getComputedStyle(document.querySelector(".mastnav ul")).flexDirection,
    navDisplay: getComputedStyle(document.querySelector(".mastnav")).display,
    burger: getComputedStyle(document.querySelector(".burger")).display,
    navCount: document.querySelectorAll(".mastnav").length,
    lens: document.querySelectorAll(".lens").length,
    rims: document.querySelectorAll(".lg-rim").length,
    thumbs: document.querySelectorAll(".lg-thumb").length,
    segs: document.querySelectorAll(".lg-seg").length,
    segChecked: Array.prototype.map.call(document.querySelectorAll(".lg-seg__opt"), (b) => b.textContent + "=" + b.getAttribute("aria-checked")).join(","),
    sw: !!document.getElementById("glassSwitch"),
    swChecked: (document.getElementById("glassSwitch") || {}).checked,
    defs: !!document.getElementById("lg-lens"),
    scrollW: document.documentElement.scrollWidth,
    rows
  };
})()`);

console.log(JSON.stringify(out, null, 2));

/* The same measurements with the glass stylesheet switched off, so a rule that
   broke something can be told apart from one that merely restyled it. */
const ab = await ev(`(() => {
  const link = document.querySelector('link[href*="liquid-glass"]');
  const sels = ${JSON.stringify(sels)};
  const snap = () => {
    const out = {};
    for (const sel of sels) {
      const n = document.querySelector(sel);
      if (!n) continue;
      const c = getComputedStyle(n);
      const r = n.getBoundingClientRect();
      out[sel] = { bg: c.backgroundColor, color: c.color, pos: c.position,
                   bf: (c.backdropFilter || "none").slice(0, 42),
                   w: Math.round(r.width), h: Math.round(r.height) };
    }
    return out;
  };
  const withGlass = snap();
  link.disabled = true;
  void document.body.offsetHeight;
  const without = snap();
  link.disabled = false;
  return { withGlass, without };
})()`);
console.log(JSON.stringify(ab, null, 2));

/* And a picture, because a number cannot show what a person sees. */
if (process.env.GLASS_SHOT) {
  /* the guide plays a one-time 3D intro; sit it out so the shot is the page */
  await ev("(async()=>{localStorage.setItem('ichhapur.intro.seen','1');return 1})()");
  await send("Page.navigate", { url: BASE + page }, sessionId);
  await waitFor("Page.loadEventFired", sessionId, 25000);
  await sleep(1200);
  const focus = process.env.GLASS_SHOT_SEL;
  if (focus) await ev(`(async()=>{const n=document.querySelector(${JSON.stringify(focus)});
    if(n)n.scrollIntoView({block:"center"});return 1})()`);
  await sleep(400);
  await send("Emulation.setDeviceMetricsOverride", { width: 1200, height: 900, deviceScaleFactor: 1, mobile: false }, sessionId);
  await sleep(300);
  const shot = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false }, sessionId);
  fs.writeFileSync(process.env.GLASS_SHOT, Buffer.from(shot.data, "base64"));

  /* Read back the pixels really painted inside a box — the same trick the audit's
     pixel pass uses — so "what is behind this text" is a measurement, not a guess.
     Every match is measured: two boxes with the same class can stand on two very
     different backdrops, and only the worst one is what the audit reports. */
  if (focus) {
    const pick = async (label, b64) => {
      const r = await ev(`(async () => {
        const img = new Image(); img.src = "data:image/png;base64,${b64}"; await img.decode();
        const c = document.createElement("canvas"); c.width = img.naturalWidth; c.height = img.naturalHeight;
        const x = c.getContext("2d", { willReadFrequently: true }); x.drawImage(img, 0, 0);
        const L = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
        const list = Array.prototype.slice.call(document.querySelectorAll(${JSON.stringify(focus)}));
        return list.map((n, i) => {
          const b = n.getBoundingClientRect();
          const ix = Math.round(Math.min(12, b.width * 0.25));
          const bx = Math.round(b.left + scrollX) + ix, by = Math.round(b.top + scrollY) + 3;
          const bw = Math.max(3, Math.round(b.width) - 2 * ix);
          const bh = Math.max(3, Math.round(b.height) - 6);
          if (bx < 0 || by < 0 || bx + bw > c.width || by + bh > c.height) return { i, offscreen: true };
          const d = x.getImageData(bx, by, bw, bh).data;
          const px = [];
          for (let p = 0; p < d.length; p += 8) { if (!d[p + 3]) continue;
            px.push({ p: [d[p], d[p + 1], d[p + 2]], l: 0.2126 * L(d[p]) + 0.7152 * L(d[p + 1]) + 0.0722 * L(d[p + 2]) }); }
          px.sort((m, q) => m.l - q.l);
          const at = (q) => px[Math.min(px.length - 1, Math.floor(px.length * q))].p;
          return { i, y: Math.round(b.top + scrollY), dark: at(0.08), med: at(0.5), light: at(0.92) };
        });
      })()`);
      console.log("pixels " + label + " " + focus + ": " + JSON.stringify(r));
    };
    /* the audit reads its backdrop from a screenshot whose glyphs are invisible;
       do the same, or the darkest pixel in the box is the text itself */
    await ev("(async()=>{const s=document.createElement('style');s.id='lg-no-glyph';" +
      "s.textContent='*,*::before,*::after{color:transparent !important;-webkit-text-fill-color:transparent !important;text-shadow:none !important}';" +
      "document.head.appendChild(s);return 1})()");
    const wide = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: true }, sessionId);
    await pick("glass", wide.data);
    await ev(`(() => { const l = document.querySelector('link[href*="liquid-glass"]');
      l.disabled = true; void document.body.offsetHeight; return 1 })()`);
    await sleep(200);
    const base = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: true }, sessionId);
    await pick("base ", base.data);
    await ev("(() => { const l = document.querySelector('link[href*=\"liquid-glass\"]'); l.disabled = false;" +
      " const s = document.getElementById('lg-no-glyph'); if (s) s.remove(); return 1 })()");
  }

  await send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true }, sessionId);
  await sleep(300);
  const m = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false }, sessionId);
  fs.writeFileSync(process.env.GLASS_SHOT.replace(/\.png$/, "-mobile.png"), Buffer.from(m.data, "base64"));
  console.log("shot -> " + process.env.GLASS_SHOT);
}

try { process.kill(chrome.pid, "SIGKILL"); } catch (e) {}
ws.close();
