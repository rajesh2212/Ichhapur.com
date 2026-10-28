/* tools/glass-lib.mjs — the CDP plumbing every glass check shares.

   Qoder's shell reaps background tasks in about a minute, so nothing here keeps
   a server alive: the site has to be running on :4173 already (npm start).
   Chrome is spawned detached and killed by PID on exit, which is why each
   profile is stamped "ichh-" — tools/kill-test-chrome.ps1 finds the leftovers by
   that marker if a run dies half-way. */
import { spawn, execSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const CHROME = process.env.CHROME || "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
export const BASE = process.env.ICHH_BASE || "http://127.0.0.1:4173/";
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function connect() {
  if (!fs.existsSync(CHROME)) throw new Error("no chrome at " + CHROME + " — set CHROME=…");
  const PROFILE = fs.mkdtempSync(path.join(os.tmpdir(), "ichh-glass-"));
  const chrome = spawn(CHROME, ["--headless=new", "--no-sandbox",
    "--disable-dev-shm-usage", "--hide-scrollbars", "--remote-debugging-port=0",
    "--user-data-dir=" + PROFILE, "about:blank"], { stdio: "ignore", detached: true });

  function dispose() {
    try {
      execSync("taskkill /PID " + chrome.pid + " /T /F", { stdio: "ignore" });
    } catch (e) { /* already gone */ }
    try { fs.rmSync(PROFILE, { recursive: true, force: true, maxRetries: 2 }); } catch (e) { /* locked */ }
  }
  process.on("exit", dispose);
  for (const sig of ["SIGINT", "SIGTERM"]) {
    process.on(sig, () => { dispose(); process.exit(130); });
  }

  const portFile = path.join(PROFILE, "DevToolsActivePort");
  let port = 0;
  for (let i = 0; i < 160 && !port; i++) {
    if (fs.existsSync(portFile)) {
      const first = fs.readFileSync(portFile, "utf8").trim().split("\n")[0];
      if (first) port = parseInt(first, 10);
    }
    if (!port) await sleep(250);
  }
  if (!port) { dispose(); throw new Error("chrome did not report a debugging port"); }

  const ver = await (await fetch("http://127.0.0.1:" + port + "/json/version")).json();
  const ws = await new Promise((res, rej) => {
    const w = new WebSocket(ver.webSocketDebuggerUrl);
    w.onopen = () => res(w); w.onerror = (e) => { dispose(); rej(e); };
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
  /* page-target commands need the sessionId back on every message, or they land
     on the browser instead of the tab */
  const { targetId } = await send("Target.createTarget", { url: "about:blank" });
  const { sessionId } = await send("Target.attachToTarget", { targetId, flatten: true });

  function send(method, params, sid) {
    const id = ++seq;
    ws.send(JSON.stringify(Object.assign({ id, method }, params ? { params } : {}, sid ? { sessionId: sid } : {})));
    return new Promise((resolve, reject) => {
      /* A command whose page goes away mid-flight — a redirect, a navigation
         committed while the evaluate was in the wire — never gets an answer at
         all. Without this the whole run sits there silently instead of saying
         which call hung. */
      const timer = setTimeout(() => {
        if (pending.delete(id)) reject(new Error("no reply for " + method + " after 45s"));
      }, 45000);
      pending.set(id, {
        resolve: (v) => { clearTimeout(timer); resolve(v); },
        reject: (e) => { clearTimeout(timer); reject(e); },
      });
    });
  }

  const call = (method, params) => send(method, params, sessionId);

  function waitFor(method, ms) {
    return new Promise((resolve) => {
      const check = () => {
        for (let i = 0; i < events.length; i++) {
          if (events[i].method === method && events[i].sessionId === sessionId) {
            events.splice(i, 1); resolve(true); return true;
          }
        }
        return false;
      };
      if (check()) return;
      const t = setInterval(() => { if (check()) { clearInterval(t); clearTimeout(c); } }, 40);
      const c = setTimeout(() => { clearInterval(t); resolve(false); }, ms || 25000);
    });
  }

  const ev = async (expr) => {
    const r = await call("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) {
      throw new Error(expr.slice(0, 70) + " -> " + JSON.stringify(r.exceptionDetails).slice(0, 300));
    }
    return r.result && r.result.value;
  };

  await call("Page.enable");
  /* Runtime.enable has to be on before any evaluate, or the first one is silent */
  await call("Runtime.enable");

  async function setViewport(width, height, mobile) {
    await call("Emulation.setDeviceMetricsOverride",
      { width, height, deviceScaleFactor: 1, mobile: !!mobile });
  }

  async function emulate(features) {
    if (!features || !features.length) await call("Emulation.setEmulatedMedia", { media: "", features: [] });
    else await call("Emulation.setEmulatedMedia", { features });
  }

  /* A load event left in the buffer from the last page would answer this wait
     before the new page had painted, and the measurement would read the old one. */
  async function open(url) {
    events.length = 0;
    await call("Page.navigate", { url });
    const ok = await waitFor("Page.loadEventFired", 30000);
    await sleep(900);
    return ok;
  }

  /* Looping animations (the hero's slow atmosphere drift) are skipped: waiting
     for one waits forever, and it is not what a still frame is being checked for. */
  async function settle() {
    for (let i = 0; i < 40; i++) {
      const running = await ev("(function(){if(!document.getAnimations)return 0;" +
        "var a=document.getAnimations(),r=0;" +
        "for(var i=0;i<a.length;i++){if(a[i].playState!=='running')continue;" +
        "var t=a[i].effect&&a[i].effect.getTiming?a[i].effect.getTiming():null;" +
        "if(t&&t.iterations===Infinity)continue;r++;}return r})()");
      if (!running) return;
      await sleep(120);
    }
  }

  async function png(beyond) {
    const shot = await call("Page.captureScreenshot",
      { format: "png", captureBeyondViewport: !!beyond });
    return shot.data;
  }

  async function savePng(file, beyond) {
    fs.writeFileSync(file, Buffer.from(await png(beyond), "base64"));
  }

  return {
    BASE, sleep, call, ev, send, sessionId, dispose,
    setViewport, emulate, open, settle, png, savePng,
    close() { try { ws.close(); } catch (e) { /* already closed */ } dispose(); },
  };
}
