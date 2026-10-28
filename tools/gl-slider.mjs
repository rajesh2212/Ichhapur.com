/* tools/gl-slider.mjs — the Glass Effect slider, end to end.

   The brief's complaint about this control was that it changed only its own
   label. That is now a testable sentence, so this is the harness that answers
   it: one keyboard interaction on the range, and five independent surfaces that
   must move with it — the `--lg-s` custom property, the resolved backdrop-filter
   on the masthead, the SVG lens `scale`, the WebGL pane's own alpha, and the
   stored value. Then the three behaviours a person expects and no screenshot can
   show: the number survives a navigation to another page, Reset returns to the
   default rather than to zero, and the control is operable and visible by
   keyboard alone.

   Strengths are set with real arrow keys, not by writing `value` and dispatching
   `input`, because a slider that only works when scripted is the bug this file
   exists to catch. */
import { connect, BASE } from "./glass-lib.mjs";

const c = await connect();
const out = (s) => process.stdout.write(s + "\n");
let bad = 0;

const KEYS = { ArrowRight: 39, ArrowLeft: 37, Home: 36, End: 35 };
async function key(k) {
  const code = KEYS[k];
  await c.call("Input.dispatchKeyEvent", { type: "rawKeyDown", key: k, code: "Key" + k,
    windowsVirtualKeyCode: code, nativeVirtualKeyCode: code });
  await c.call("Input.dispatchKeyEvent", { type: "keyUp", key: k, code: "Key" + k,
    windowsVirtualKeyCode: code, nativeVirtualKeyCode: code });
  await c.sleep(90);
}

/* Everything the slider is supposed to reach, read in one pass. The blur is the
   browser's resolved value, not the token text, so a calc() that never
   substituted shows up here as a failure rather than as a passing string. */
const READ = `(function(){
  var h=document.documentElement, d=document;
  var r=d.getElementById('glassStrength');
  var chip=d.querySelector('.hero__chip');
  var pane=chip&&chip.__lgPane;
  var alpha=0;
  if(pane&&getComputedStyle(pane).display!=='none'){
    var x=pane.__ctx||pane.getContext('2d');
    var g=x.getImageData(0,0,pane.width,pane.height).data;
    for(var i=3;i<g.length;i+=4) alpha=Math.max(alpha,g[i]);
  }
  var lens=d.querySelector('#lg-lens feDisplacementMap');
  var mast=getComputedStyle(d.querySelector('.masthead'));
  return {v:r?+r.value:null, disabled:r?r.disabled:null,
    label:(d.getElementById('glassStrengthValue')||{}).textContent,
    s:getComputedStyle(h).getPropertyValue('--lg-s').trim(),
    tier:h.getAttribute('data-glass'), gl:h.getAttribute('data-glass-gl'),
    blur:(mast.backdropFilter||mast.webkitBackdropFilter||'none').replace(/saturate\\([^)]*\\)/,'').trim(),
    lens:lens?+lens.getAttribute('scale'):null, alpha:alpha,
    store:(function(){try{return localStorage.getItem('ichhapur.glass.strength')}catch(e){return 'x'}})(),
    focus:d.activeElement===r?'range':String((d.activeElement||{}).id||d.activeElement)};})()`;

function check(name, ok, detail) {
  out(`   ${ok ? "ok  " : "FAIL"} ${name}${detail === undefined ? "" : "   " + detail}`);
  if (!ok) bad++;
}

/* Read the page with the plate in view. The pass is viewport-scoped on purpose,
   so a card below the fold has not been asked to paint yet and its alpha reads
   zero — which, measured blind, looks exactly like a slider that does nothing. */
async function read(sel) {
  await c.ev("(function(){var n=document.querySelector(" + JSON.stringify(sel) + ");" +
    "if(n)n.scrollIntoView({block:'center'});return 1})()");
  await c.sleep(250);
  await c.settle();
  await c.sleep(250);
  return c.ev(READ.replace(".hero__chip", sel));
}

/* Whether a focus ring EXISTS is a cascade question; whether one is DRAWN is a
   pixel question, and Chrome does not reliably expose the slider thumb's shadow
   DOM through getComputedStyle — the read above reports "thumb none" while the
   ring is plainly on screen. So frame the same rectangle twice, with keyboard
   focus on the range and with it taken away, and require the image to change.
   Everything is paused first so focus is the only difference between frames. */
async function ringFrames() {
  const b = await c.ev("(function(){var r=document.getElementById('glassStrength');" +
    "if(!r)return null;var q=r.getBoundingClientRect();" +
    "return {x:q.left+window.scrollX,y:q.top+window.scrollY,w:q.width,h:q.height};})()");
  if (!b || b.w < 4 || b.h < 4) return { err: "the range has no box to photograph" };
  const pad = 10;
  async function frame() {
    const shot = await c.call("Page.captureScreenshot", {
      format: "png", captureBeyondViewport: true,
      clip: { x: b.x - pad, y: b.y - pad, width: b.w + pad * 2, height: b.h + pad * 2, scale: 2 },
    });
    return shot.data;
  }
  /* A modifier key, not an arrow: :focus-visible is what a keyboard user gets, and
     the reliable way to trip it here is a real keydown on the element. Shift moves
     no value, so the two frames differ in focus and in nothing else. */
  async function shift() {
    await c.call("Input.dispatchKeyEvent", { type: "rawKeyDown", key: "Shift", code: "ShiftLeft",
      windowsVirtualKeyCode: 16, nativeVirtualKeyCode: 16 });
    await c.call("Input.dispatchKeyEvent", { type: "keyUp", key: "Shift", code: "ShiftLeft",
      windowsVirtualKeyCode: 16, nativeVirtualKeyCode: 16 });
  }
  await c.ev("(function(){document.getAnimations().forEach(function(a){try{a.pause()}catch(e){}});return 1})()");
  await c.sleep(200);
  await c.ev("(function(){var r=document.getElementById('glassStrength');r.blur();return 1})()");
  await c.sleep(200);
  const off = await frame();
  await c.ev("(function(){document.getElementById('glassStrength').focus();return 1})()");
  await shift();
  await c.sleep(250);
  const on = await frame();
  const now = await c.ev("(function(){var r=document.getElementById('glassStrength');" +
    "return {v:+r.value,f:document.activeElement===r};})()");
  await c.ev("(function(){document.getAnimations().forEach(function(a){try{a.play()}catch(e){}});return 1})()");
  return { changed: off !== on, v: now.v, focused: now.f };
}

await c.setViewport(1280, 900, false);
await c.open(BASE + "landing.html?lg-gl=on");
await c.settle();
await c.sleep(400);

out("");
out("== the keyboard moves the glass, not just the label");
await c.ev("(function(){window.scrollTo(0,0);document.getElementById('glassStrength').focus();return 1})()");
await key("End");
await c.sleep(500);
const at100 = await read(".hero__chip");
check("End puts the range at 100", at100.v === 100 && at100.label === "100%", `${at100.v} / ${at100.label}`);
check("focus stays on the range", at100.focus === "range", at100.focus);
const drawn = await ringFrames();
check("and the ring is actually drawn: the slider box changes with keyboard focus",
  !drawn.err && drawn.changed && drawn.focused,
  drawn.err || (drawn.changed ? "value stays " + drawn.v : "identical pixels focused and blurred"));

for (let i = 0; i < 8; i++) await key("ArrowLeft");
await c.sleep(600);
const at60 = await read(".hero__chip");
check("eight ArrowLeft steps land on 60", at60.v === 60, String(at60.v));
check("--lg-s follows", at60.s === "0.6", at60.s);
/* Compared against the same property at 100 rather than against a number typed
   into this file, so the check says "the slider scales the frost" and keeps
   passing if the design ever moves the full-strength blur. */
const full = parseFloat((at100.blur.match(/blur\(([\d.]+)px\)/) || [0, 0])[1]);
const now = parseFloat((at60.blur.match(/blur\(([\d.]+)px\)/) || [0, 0])[1]);
check("the chrome blur is 60% of its own full value", full > 0 && Math.abs(now - full * 0.6) < 0.15,
  `${now}px of ${full}px`);
check("the SVG lens bends less", at60.lens !== null && at60.lens < at100.lens, `${at60.lens} was ${at100.lens}`);
check("the WebGL pane thins with it", at60.alpha > 0 && at60.alpha < 255, String(at60.alpha));
check("the value is stored", at60.store === "60", at60.store);

out("");
out("== the same number on the next page, without a reload in between");
await c.open(BASE + "about.html?lg-gl=on");
await c.settle();
await c.sleep(400);
const onAbout = await read(".floatcard");
check("the range reads what the last page wrote", onAbout.v === 60, String(onAbout.v));
check("the label is right at first paint", onAbout.label === "60%", onAbout.label);
check("--lg-s is 0.6 here too", onAbout.s === "0.6", onAbout.s);
check("the plate on this page paints at that strength", onAbout.alpha > 0 && onAbout.alpha < 255, String(onAbout.alpha));

out("");
out("== Reset restores the default, not zero");
await c.ev("(function(){document.getElementById('glassReset').click();return 1})()");
await c.sleep(600);
const afterReset = await read(".floatcard");
check("the range is back at 100", afterReset.v === 100, String(afterReset.v));
check("--lg-s is back at 1", afterReset.s === "1", afterReset.s);
check("the pane is painting at full again", afterReset.alpha === 255, String(afterReset.alpha));
/* The store keeps only a deviation: at the default there is nothing to remember,
   and leaving "100" behind would mean a later change of the default could never
   reach this person. */
check("the stored deviation is gone", afterReset.store === null, String(afterReset.store));

out("");
out("== the switch, which is the same number taken to zero");
await c.ev("(function(){var s=document.getElementById('glassSwitch');s.click();return 1})()");
await c.sleep(600);
const off = await read(".floatcard");
check("the tier is off", off.tier === "off", off.tier);
check("the renderer stood down", !off.gl || off.gl === "none", String(off.gl));
check("no pane is left painting", off.alpha === 0, String(off.alpha));
check("the slider is disabled alongside it", off.disabled === true, String(off.disabled));
await c.ev("(function(){document.getElementById('glassSwitch').click();return 1})()");
await c.sleep(600);
const back = await read(".floatcard");
check("switching back on returns the stored strength", back.v === 100 && back.alpha === 255,
  `${back.v} alpha=${back.alpha}`);

out("");
out("== the hero counters, the biggest glass on the page and the last thing written as a literal");
/* `.statcard` shipped with `background: rgba(255,255,255,.72)` and
   `backdrop-filter: blur(18px)` typed straight into landing.css, so the slider
   could move every other surface and leave these three closed. Read the
   browser's resolved fill and frost, not the token text: a calc() that never
   substituted shows up here as a number that does not move. */
const CARD = "(function(){var n=document.querySelector('.statcard');" +
  "var s=getComputedStyle(n);var bf=s.backdropFilter||s.webkitBackdropFilter||'none';" +
  "var m=/blur\\(\\s*([\\d.]+)px/.exec(bf);" +
  "var a=/rgba?\\(([^)]*)\\)/.exec(s.backgroundColor);" +
  "var p=a?a[1].split(/[,\\s/]+/).filter(Boolean).map(Number):[];" +
  "return {blur:m?+m[1]:0,alpha:p.length>3?p[3]:1,tier:document.documentElement.getAttribute('data-glass')};})()";
async function cardAt(v) {
  await c.ev("(function(){var r=document.getElementById('glassStrength');" +
    "r.disabled=false;r.value=" + v + ";r.dispatchEvent(new Event('input',{bubbles:true}));return 1})()");
  await c.sleep(450);
  return c.ev(CARD);
}
/* The counters only exist on the landing page and the cross-page check above
   left the run on about.html, so go back before reading them. */
await c.open(BASE + "landing.html?lg-gl=on");
await c.settle();
await c.sleep(500);
const cardFull = await cardAt(100);
const cardMid = await cardAt(55);
const cardNil = await cardAt(0);
out("   100% " + JSON.stringify(cardFull) + "\n   55%  " + JSON.stringify(cardMid) +
  "\n   0%   " + JSON.stringify(cardNil));
check("the counters frost at the full 18px", cardFull.blur === 18, String(cardFull.blur));
check("and their fill is the measured .72", Math.abs(cardFull.alpha - 0.72) < 0.01, String(cardFull.alpha));
check("at 55% the frost is 55% of itself", Math.abs(cardMid.blur - 18 * 0.55) < 0.15, String(cardMid.blur));
check("at 55% the fill closes toward opaque",
  cardMid.alpha > cardFull.alpha && cardMid.alpha < 1, String(cardMid.alpha));
check("at 0% they are a solid plate with no frost",
  cardNil.blur === 0 && cardNil.alpha >= 0.95, `${cardNil.blur} / ${cardNil.alpha} / ${cardNil.tier}`);
await c.ev("(function(){var r=document.getElementById('glassStrength');" +
  "r.value=100;r.dispatchEvent(new Event('input',{bubbles:true}));return 1})()");
await c.sleep(450);

out("");
out(bad ? `RESULT: ${bad} control check(s) failed.`
  : "RESULT: one number drives the frost, the lens, the shader and the store — " +
    "and it survives a page change, a Reset and a switch.");
c.close();
