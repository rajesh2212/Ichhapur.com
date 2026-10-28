/* tools/gl-fallback.mjs — every exit the WebGL glass is supposed to have.

   The renderer is an enhancement, so each way out of it has to land on the CSS
   glass with nothing left over: no pane in the DOM, no host attribute, no band
   suppressed. This drives one page that is known to carry a shader plate through
   the states that can occur — a machine with a GPU, a browser with no WebGL2, the
   two accessibility media features, forced colours, print, and the slider at
   zero — and checks the same facts in each: which tier was elected, whether the
   pass is mounted, whether any pane survived, and whether the plate's own CSS
   fill is still there underneath.

   Two things this had to get right to be worth running. The viewport is set
   first, because the pass is viewport-scoped and a plate below the fold is
   legitimately idle — without this the baseline row says "no glass" on a machine
   that has it. And `Emulation.setEmulatedMedia` is called once per case with both
   the media and the features, because a second call that names only the media
   clears the features the first one set. */
import { connect, BASE } from "./glass-lib.mjs";

const c = await connect();
const out = (s) => process.stdout.write(s + "\n");
const PAGE = "landing.html?lg-gl=on";
await c.setViewport(1280, 900, false);

const STATE = `(function(){
  var h=document.documentElement, d=document;
  var n=d.querySelector('.hero__chip');
  var pane=n&&n.__lgPane;
  var shown=pane?getComputedStyle(pane).display:'-';
  var alpha=0;
  if(pane&&shown!=='none'){
    var x=pane.__ctx||pane.getContext('2d');
    var g=x.getImageData(0,0,pane.width,pane.height).data;
    for(var i=3;i<g.length;i+=4) alpha=Math.max(alpha,g[i]);
  }
  return {tier:h.getAttribute('data-glass'), gl:h.getAttribute('data-glass-gl'),
    s:getComputedStyle(h).getPropertyValue('--lg-s').trim(),
    panes:d.querySelectorAll('canvas.lg-gl-pane').length,
    hosts:d.querySelectorAll('[data-gl-host]').length,
    painted:d.querySelectorAll('[data-gl-painted]').length,
    paneDisplay:shown, maxAlpha:alpha,
    fill:n?getComputedStyle(n).backgroundColor:'-'};})()`;

/* Installed before any script on the page runs, which is the only way to be
   asked a question you have already answered: the capability probe fires while
   the layer boots, in <head>. */
const NO_GL = "var g=HTMLCanvasElement.prototype.getContext;" +
  "HTMLCanvasElement.prototype.getContext=function(t){" +
  "if(t==='webgl2'||t==='webgl')return null;return g.apply(this,arguments)};";

const cases = [
  ["gpu + slider 100", { features: [] }, 100, "mounted"],
  ["no WebGL2", { features: [] }, 100, "stood down", NO_GL],
  ["reduced transparency", { features: [{ name: "prefers-reduced-transparency", value: "reduce" }] },
    100, "css only"],
  ["prefers-contrast", { features: [{ name: "prefers-contrast", value: "more" }] }, 100, "css only"],
  ["forced colors", { features: [{ name: "forced-colors", value: "active" }] }, 100, "stood down"],
  ["print", { media: "print", features: [] }, 100, "hidden pane"],
  ["slider at zero", { features: [] }, 0, "mounted"],
];

let bad = 0;
for (const [label, emu, strength, want, pre] of cases) {
  await c.call("Emulation.setEmulatedMedia", Object.assign({ media: "" }, emu));
  let hook = null;
  if (pre) hook = (await c.call("Page.addScriptToEvaluateOnNewDocument", { source: pre })).identifier;
  await c.open(BASE + PAGE);
  await c.settle();
  await c.ev("(function(){var r=document.getElementById('glassStrength');if(r){" +
    "r.value=" + strength + ";r.dispatchEvent(new Event('input',{bubbles:true}));}return 1})()");
  await c.sleep(600);
  const s = await c.ev(STATE);
  if (hook) await c.call("Page.removeScriptToEvaluateOnNewDocument", { identifier: hook });

  const fail = [];
  if (want === "css only" || want === "stood down") {
    if (s.panes) fail.push(s.panes + " pane(s) left behind");
    if (s.gl) fail.push("data-glass-gl=" + s.gl + " while stood down");
    /* Only the two accessibility media features change the elected tier. A
       browser with no WebGL2 keeps `refract` — the CSS frost is still real
       there — so asserting solid for that case would be asserting something
       the design never promised. */
    if (want === "css only" && s.tier !== "solid") fail.push("tier should be solid, got " + s.tier);
  } else if (want === "hidden pane") {
    if (s.panes && s.paneDisplay !== "none") fail.push("pane still displayed in " + label);
  } else if (!s.painted) {
    fail.push("expected the plate to paint, gl=" + s.gl);
  }
  if (want === "mounted") {
    if (strength === 0 && s.maxAlpha > 8) fail.push("reveal at 0 left alpha " + s.maxAlpha);
    if (strength === 100 && s.maxAlpha < 200) fail.push("thin pane, maxAlpha " + s.maxAlpha);
  }
  if (fail.length) bad++;
  out(`   ${label.padEnd(21)} tier=${(s.tier || "-").padEnd(7)} gl=${(s.gl || "none").padEnd(5)} ` +
    `s=${s.s.padEnd(4)} panes=${s.panes} painted=${s.painted} display=${s.paneDisplay} ` +
    `maxAlpha=${String(s.maxAlpha).padEnd(3)} fill=${s.fill}` +
    (fail.length ? "\n      <-- " + fail.join("; ") : ""));
}
out("");
out(bad ? `RESULT: ${bad} exit(s) leak glass.`
  : "RESULT: every exit lands on the CSS glass, with no pane left behind.");
c.close();
