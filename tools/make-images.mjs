/* ============================================================================
   ICHHAPUR Market — image build
   ----------------------------------------------------------------------------
   Turns the artwork sources into what the site actually ships:
     * tools/og-card.html  -> assets/img/og.png        (1200x630 preview card)
     * vibe_images/*.png   -> assets/img/illustration/*.webp
     * assets/favicon.svg  -> apple-touch-icon + png favicons
   and prints the byte weight of everything it wrote.

   Re-encoding happens in the browser because that is the only place with a real
   image codec on this machine — there is no ImageMagick and no npm install here.
   The page is loaded from the local preview server (port 4173) so the canvas
   stays same-origin and toDataURL is allowed.

   Run:  node tools/make-images.mjs
   ========================================================================= */
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname).replace(/^\//, ""), "..");
const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const BASE = "http://127.0.0.1:4173/";
const PROFILE = path.join(os.tmpdir(), "ichh-img-" + Date.now());
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* source (served path) -> out (repo path), target width, quality */
const ART = [
  ["vibe_images/art-market-street-wide_1793101295067_4b4b33d0.png", "assets/img/illustration/market-lane-wide.webp", 1400, 0.82],
  ["vibe_images/art-produce-stall_1793101319725_f2888ab7.png", "assets/img/illustration/produce-stall.webp", 900, 0.84],
  ["vibe_images/art-sources-ledger_1793101357716_b6341ae7.png", "assets/img/illustration/source-ledger.webp", 900, 0.84],
  ["vibe_images/art-empty-lane_1793101383226_7202220b.png", "assets/img/illustration/empty-lane.webp", 760, 0.84],
];
const ICONS = [
  ["assets/favicon.svg", "assets/img/icon-180.png", 180],
  ["assets/favicon.svg", "assets/img/icon-32.png", 32],
];

/* The hero art ships in two frames and two codecs, and neither frame is the whole
   picture. The scene arrives with "ICHHAPUR" lettered across its sky, and at the
   hero's own height there is no vertical crop available that would keep the
   storefronts and drop the lettering — so the lettering would land behind the
   page's headline and the stat cards and read as "ICHHAP" cut in half. Both
   frames therefore start at y=340, below the words, and the site's own CSS
   wordmark keeps the name. The full lettered source stays in vibe_images/ if the
   owner ever wants it as a poster.
   WebP with a JPEG behind it, because the fallback is the one that has to load
   when the browser cannot be trusted with the smaller format. */
const HERO_SRC = "vibe_images/art-hero-market-lettered_b310238e.png";
const HERO = [
  { src: HERO_SRC, out: "assets/img/dark/hero-market-lit", w: 1672, q: 0.80,
    crop: { x: 0, y: 340, w: 1672, h: 601 } },
  { src: HERO_SRC, out: "assets/img/dark/hero-market-lit-phone", w: 900, q: 0.80,
    crop: { x: 820, y: 340, w: 852, h: 601 } },
];

fs.mkdirSync(path.join(ROOT, "assets/img/illustration"), { recursive: true });

const chrome = spawn(CHROME, ["--headless=new", "--no-sandbox", "--disable-gpu",
  "--force-prefers-reduced-motion", "--disable-dev-shm-usage", "--hide-scrollbars",
  "--remote-debugging-port=0", "--user-data-dir=" + PROFILE, "about:blank"],
  { stdio: "ignore", detached: true });

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
const waitFor = (method, sessionId) => new Promise((resolve) => {
  const check = () => { for (let i = 0; i < events.length; i++) { const e = events[i];
    if (e.method === method && (!sessionId || e.sessionId === sessionId)) { events.splice(i, 1); resolve(true); return true; } } return false; };
  if (check()) return;
  const t = setInterval(() => { if (check()) { clearInterval(t); clearTimeout(c); } }, 40);
  const c = setTimeout(() => { clearInterval(t); resolve(false); }, 20000);
});
const clear = () => { events.length = 0; };

const { targetId } = await send("Target.createTarget", { url: "about:blank" });
const { sessionId } = await send("Target.attachToTarget", { targetId, flatten: true });
await send("Page.enable", {}, sessionId);
await send("Runtime.enable", {}, sessionId);
const ev = async (expr) => {
  const r = await send("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true }, sessionId);
  if (r.exceptionDetails) throw new Error(expr.slice(0, 80) + " -> " + JSON.stringify(r.exceptionDetails).slice(0, 300));
  return r.result && r.result.value;
};
const load = async (url) => {
  clear();
  await send("Page.navigate", { url }, sessionId);
  await waitFor("Page.loadEventFired", sessionId);
  await ev("(async()=>{try{await document.fonts.ready}catch(e){}return 1})()");
  await sleep(900);
};

/* Draw a served image — or a rectangle of it — into a canvas at a chosen width
   and hand back the bytes. */
const encode = (src, type, w, q, crop) => ev(`(async()=>{
  const img = new Image();
  img.src = ${JSON.stringify(BASE + src)};
  await img.decode();
  const sx = ${crop ? crop.x : 0}, sy = ${crop ? crop.y : 0};
  const sw = ${crop ? crop.w : "img.naturalWidth"}, sh = ${crop ? crop.h : "img.naturalHeight"};
  const h = Math.round(sh * (${w} / sw));
  const c = document.createElement("canvas");
  c.width = ${w}; c.height = h;
  const x = c.getContext("2d");
  x.drawImage(img, sx, sy, sw, sh, 0, 0, c.width, c.height);
  const url = c.toDataURL(${JSON.stringify(type)}, ${q});
  return { url, w: c.width, h, from: sx + "," + sy + " " + sw + "x" + sh + " of " + img.naturalWidth + "x" + img.naturalHeight };
})()`);

function writeData(dataUrl, repoPath) {
  const b64 = dataUrl.slice(dataUrl.indexOf(",") + 1);
  const buf = Buffer.from(b64, "base64");
  fs.writeFileSync(path.join(ROOT, repoPath), buf);
  return buf.length;
}

/* the preview card is screenshotted rather than re-encoded: it is HTML type */
const report = [];
await send("Emulation.setDeviceMetricsOverride", { width: 1200, height: 630, deviceScaleFactor: 1, mobile: false }, sessionId);
await load(BASE + "tools/og-card.html");
const shot = await send("Page.captureScreenshot", { format: "png", clip: { x: 0, y: 0, width: 1200, height: 630, scale: 1 } }, sessionId);
fs.writeFileSync(path.join(ROOT, "assets/img/og.png"), Buffer.from(shot.data, "base64"));
report.push(["assets/img/og.png", "1200x630", Buffer.from(shot.data, "base64").length, "tools/og-card.html"]);

/* tools/og-card.html is a plain HTML document with no scripts, so it doubles as
   the host for the canvas work — the canvas has to live in an HTML document for
   getContext to exist, and it has to be same-origin for toDataURL to be allowed */
await load(BASE + "tools/og-card.html");

for (const [src, out, w, q] of ART) {
  const r = await encode(src, "image/webp", w, q);
  const bytes = writeData(r.url, out);
  report.push([out, r.w + "x" + r.h, bytes, src]);
}

for (const job of HERO) {
  for (const [type, ext] of [["image/webp", "webp"], ["image/jpeg", "jpg"]]) {
    const r = await encode(job.src, type, job.w, job.q, job.crop);
    const out = job.out + "." + ext;
    const bytes = writeData(r.url, out);
    report.push([out, r.w + "x" + r.h, bytes, job.src + (job.crop ? " [crop]" : "")]);
  }
}

for (const [src, out, w] of ICONS) {
  const r = await encode(src, "image/png", w, 1);
  const bytes = writeData(r.url, out);
  report.push([out, r.w + "x" + r.h, bytes, src]);
}

ws.close();
chrome.kill("SIGKILL");

const kb = (n) => (n / 1024).toFixed(0) + " KB";
console.log("\nwrote:");
for (const [out, dims, bytes, src] of report) {
  console.log("  " + out.padEnd(44) + dims.padEnd(11) + (bytes ? kb(bytes) : "").padStart(9) + "   <- " + src);
}
console.log("");
