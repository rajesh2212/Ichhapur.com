/* tools/gl-pages.mjs — the glass layer, page by page, at both sizes.

   The smoke test proves the renderer runs on one page; this proves the layer is
   actually on the site. Every page is asked the same questions at 1280 and at
   390: which tier the capability probe chose, whether the SVG lens resolved on
   the chrome, and — after a scroll sweep, because the WebGL pass is deliberately
   viewport-scoped and a plate below the fold has not been asked to paint yet —
   how many of the page's registered plates actually painted when they came into
   view. A page that loads the script but never attaches a pane is a failure this
   catches and a single above-the-fold screenshot would not. */
import { connect, BASE } from "./glass-lib.mjs";

const c = await connect();
const out = (s) => process.stdout.write(s + "\n");
const PAGES = ["index.html", "landing.html", "listings.html", "about.html",
  "whats-here.html", "sources.html", "contact.html", "admin.html"];

/* The lens lives on `.lens::before`, so a walk over real elements finds nothing
   and reports a clean pass on a page whose refraction never resolved. Pseudo
   elements are read here because that is where the property actually is. */
const HEAD = `(function(){
  var h=document.documentElement, d=document, bent=0, hosts=0;
  var all=d.querySelectorAll('body *');
  for(var i=0;i<all.length;i++){
    var n=all[i];
    if(n.hasAttribute('data-gl-host')) hosts++;
    var own=getComputedStyle(n).backdropFilter||'';
    var b=getComputedStyle(n,'::before').backdropFilter||'';
    var a=getComputedStyle(n,'::after').backdropFilter||'';
    if(own.indexOf('url(')>-1||b.indexOf('url(')>-1||a.indexOf('url(')>-1) bent++;
  }
  return {tier:h.getAttribute('data-glass'), gl:h.getAttribute('data-glass-gl'),
    s:getComputedStyle(h).getPropertyValue('--lg-s').trim(),
    hosts:hosts, panes:d.querySelectorAll('canvas.lg-gl-pane').length,
    lens:d.querySelectorAll('.lens').length, bent:bent,
    defs:!!d.getElementById('lg-lens'), errs:(window.__lgErrs||[]).slice(0,3)};})()`;

/* Sweep the whole document and remember every plate that ever painted. The
   attribute carries the class list, which is what identifies the plate. */
async function sweep(vh) {
  return c.ev(`(async function(){
    var seen={}, max=0, sleep=function(ms){return new Promise(function(r){setTimeout(r,ms)})};
    var h=document.documentElement.scrollHeight;
    for(var y=0;y<=h;y+=${Math.round(vh * 0.7)}){
      window.scrollTo(0,y);
      await sleep(260);
      var p=document.querySelectorAll('[data-gl-painted]');
      max=Math.max(max,p.length);
      for(var i=0;i<p.length;i++){
        var k=(p[i].className||'').split(/\\s+/)[0];
        seen[k]=(seen[k]||0)+1;
      }
    }
    window.scrollTo(0,0);
    return {plates:Object.keys(seen).sort(), max:max, docH:h};
  })()`);
}

let bad = 0;
/* The harness cannot see the console buffer, so catch on the page instead: this
   runs before any script on every navigation, which is the only way a throw from
   the glass layer itself is visible in the row it belongs to. */
await c.call("Page.addScriptToEvaluateOnNewDocument", { source:
  "window.__lgErrs=[];addEventListener('error',function(e){window.__lgErrs.push(String(e.message))});" +
  "addEventListener('unhandledrejection',function(e){window.__lgErrs.push('promise: '+String(e.reason))});" });
for (const [vw, vh] of [[1280, 900], [390, 780]]) {
  out("");
  out("== " + vw + "x" + vh);
  await c.setViewport(vw, vh, vw < 500);
  for (const page of PAGES) {
    await c.open(BASE + page + "?lg-gl=on");
    await c.settle();
    await c.sleep(400);
    const head = await c.ev(HEAD);
    const sw = await sweep(vh);
    const after = await c.ev(HEAD);
    const fail = [];
    if (!head.tier) fail.push("no tier");
    if (!head.defs) fail.push("no lens defs");
    if (!head.bent) fail.push("lens never resolved");
    if (sw.plates.length === 0 && after.hosts > 0) fail.push("hosted but never painted");
    if (after.errs.length) fail.push(after.errs[0].slice(0, 60));
    if (fail.length) bad++;
    out(`   ${page.padEnd(16)} tier=${(head.tier || "-").padEnd(8)} s=${head.s.padEnd(4)} ` +
      `lens=${head.lens} bending=${String(head.bent).padEnd(3)} ` +
      `painted=[${sw.plates.join(" ")}] max=${sw.max}` +
      `${fail.length ? "   <-- " + fail.join(" | ") : ""}`);
  }
}
out("");
out(bad ? `RESULT: ${bad} page/size combinations need attention.`
  : "RESULT: every page bends through the lens, and every plate painted when it " +
    "came into view.");
c.close();
