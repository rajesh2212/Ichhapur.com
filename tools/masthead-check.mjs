/* tools/masthead-check.mjs — the glass controls must never push anything where
   nobody can reach it.

   Why this exists as a measurement and not a review: `.dk-frame` is
   `overflow-x: clip`, so a header that runs past the viewport does NOT grow a
   scrollbar — it silently cuts the round search button off and the page reports
   `scrollWidth === innerWidth`, which looks like a pass. So this checks the
   furthest right painted edge of the header against the viewport, not the
   document's scroll width.

   What it deliberately permits: one extra row. At 1317 px and below the brand,
   the six nav links and the call to action already fill the bar, so the switch
   and the strength slider take a line of their own underneath — measured, not
   assumed, at every width below. That is a header two lines taller than the
   same page with the controls removed, which is the pass's own documented
   trade ("a control nobody can reach is worse than a header one line taller").
   What is never permitted is the *rest* of the bar absorbing the cost: the
   links gaining a line, the pill narrowing, or any part of the header painted
   past the viewport. Those three are asserted individually. */
import { connect, BASE } from "./glass-lib.mjs";

const c = await connect();
const out = (s) => process.stdout.write(s + "\n");

const WIDTHS = [1720, 1600, 1520, 1470, 1318, 1280, 1120, 1024, 999, 940, 900, 860, 700, 390];

const PAGES = ["landing.html", "listings.html", "about.html"];

const HIDE = "#glassSwitch,.lg-switch,.lg-level{display:none!important}";

const PROBE = `(function(){
  function box(n){ var b = n.getBoundingClientRect(); return [Math.round(b.width), Math.round(b.height)]; }
  var head = document.getElementById('masthead'), nav = document.getElementById('mastnav'),
    ul = document.querySelector('.mastnav ul'), opt = document.querySelector('.mastnav__opt'),
    tail = document.querySelector('.masthead__tail'), pill = document.querySelector('.masthead__tail .pill'),
    row = document.querySelector('.roundrow'), burger = document.querySelector('.burger');
  if (!head || !nav || !tail || !row) return { missing: true };
  var ys = [].slice.call(nav.children).map(function(k){ return Math.round(k.getBoundingClientRect().y); });
  var clipped = getComputedStyle(document.querySelector('.lg-switch__text')).position === 'absolute';
  var drawer = getComputedStyle(burger).display !== 'none';
  /* the furthest right edge of anything the header paints, skipping the mobile
     drawer, which is off-screen by design until it is opened */
  var edge = 0, who = '';
  [].slice.call(head.querySelectorAll('*')).forEach(function(n){
    if (n.closest('.mastnav') && drawer) return;
    var st = getComputedStyle(n);
    if (st.display === 'none' || st.visibility === 'hidden') return;
    var r = n.getBoundingClientRect();
    if (!r.width && !r.height) return;
    if (r.right > edge) { edge = r.right; who = (n.id || String(n.className).split(' ')[0] || n.tagName); }
  });
  return {
    iw: innerWidth,
    edge: Math.round(edge), who: who,
    past: Math.round(edge - innerWidth),
    headH: Math.round(head.getBoundingClientRect().height),
    ulLines: ys.length > 1 && ys[1] > ys[0] + 20 ? 2 : 1,
    opt: box(opt), ul: box(ul), pill: box(pill),
    clipped: clipped, drawer: drawer,
    headSW: head.scrollWidth
  };
})()`;

const BASELINE = {};
let failures = 0;

async function withControls(on) {
  await c.ev(`(function(){var o=document.getElementById('masthead-baseline');if(o)o.remove();` +
    (on ? "" : `var s=document.createElement('style');s.id='masthead-baseline';s.textContent=${JSON.stringify(HIDE)};document.head.appendChild(s);`) +
    `})()`);
  await c.sleep(140);
}

for (const page of PAGES) {
  out('');
  out('#### ' + page);
  for (const w of WIDTHS) {
    await c.setViewport(w, 860, w < 500);
    await c.open(BASE + page + "?lg-gl=on");
    await c.settle();
    /* The same page, the same width, with the controls taken away. That is the
       shape they have to fit into, and it has to be measured here rather than
       read off a wide screen: at 900px the site's own six nav links already
       break onto two lines and the header is 89px, so "71px everywhere" would
       blame the slider for something the page does on its own. */
    await withControls(false);
    const b = await c.ev(PROBE);
    await withControls(true);
    const r = await c.ev(PROBE);
    if (r.missing) { out(`${w}  HEADER MISSING`); failures++; continue; }
    const bad = [];
    const grown = r.headH - b.headH;
    if (r.past > 0) bad.push("OFF-SCREEN +" + r.past + " by ." + r.who);
    if (r.ul[1] > b.ul[1] + 4) bad.push("nav links squeezed " + b.ul[1] + "->" + r.ul[1] + "px tall");
    /* one row of the controls' own is the sanctioned cost; anything past that has
       to be something being squeezed out of the first row, and that is a failure */
    if (grown > 30 && !(r.ulLines === 2 && grown <= 56)) bad.push("grew " + grown + "px over this width's own baseline");
    if (r.pill[0] < b.pill[0]) bad.push("call to action squeezed " + b.pill[0] + "->" + r.pill[0]);
    if (b.headSW > r.iw) bad.push("nav overflowed the bar (baseline " + b.headSW + ")");
    if (bad.length) failures++;
    out(`${String(r.iw).padStart(4)}  head ${String(b.headH).padStart(3)} -> ${String(r.headH).padStart(3)}px` +
      ` (${String(grown).padStart(3)})  glass ${String(r.opt[0]).padStart(3)}x${r.opt[1]} on ${r.ulLines} line(s)` +
      `  ul ${String(r.ul[0]).padStart(3)}x${String(r.ul[1]).padStart(2)}  pill ${b.pill[0]}x${b.pill[1]} -> ${r.pill[0]}x${r.pill[1]}` +
      `  edge +${r.past}${r.drawer ? "  [drawer]" : ""}` +
      (bad.length ? "   FAIL: " + bad.join(", ") : "   ok"));
  }
}

out('');
out(failures ? `RESULT: ${failures} failure(s).` : "RESULT: nothing off-screen, links and call to action unsqueezed at any width.");
c.close();
process.exitCode = failures ? 1 : 0;
