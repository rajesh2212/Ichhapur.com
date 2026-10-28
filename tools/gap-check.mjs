/* tools/gap-check.mjs — is there an empty band between the hero and what follows?

   A screenshot says "there is a gap"; this says how many pixels of it are
   actually nothing — the distance from the last painted box inside the hero to
   the first painted box of the next section, measured at both widths. */
import { connect, BASE, sleep } from "./glass-lib.mjs";
import fs from "node:fs";

const log = (line) => fs.writeSync(1, line + "\n");

const MEASURE = `(function(){
  var hero = document.querySelector(".hero");
  if (!hero) return { none: true };
  var next = hero.nextElementSibling;
  var hr = hero.getBoundingClientRect();
  var nr = next ? next.getBoundingClientRect() : null;

  /* the lowest painted thing inside the hero: its own boxes, not its wrapper */
  function deepestBottom(root) {
    var low = root.getBoundingClientRect().bottom;
    var kids = root.querySelectorAll("*");
    for (var i = 0; i < kids.length; i++) {
      var k = kids[i];
      var s = getComputedStyle(k);
      if (s.display === "none" || s.visibility === "hidden") continue;
      if (s.position === "absolute" || s.position === "fixed") continue;
      var t = k.getBoundingClientRect();
      if (!t.height) continue;
      if (t.bottom > low && t.bottom < root.getBoundingClientRect().bottom + 4) low = t.bottom;
    }
    return low;
  }
  function firstTop(root) {
    var kids = root.querySelectorAll("h1,h2,h3,p,ul,.band__head,.eyebrow,section>div");
    var top = root.getBoundingClientRect().top;
    for (var i = 0; i < kids.length; i++) {
      var t = kids[i].getBoundingClientRect();
      if (t.height && t.top > top - 1) return t.top;
    }
    return top;
  }

  var inside = deepestBottom(hero);
  var hs = getComputedStyle(hero);
  var ns = next ? getComputedStyle(next) : null;
  var nTop = next ? firstTop(next) : null;

  return {
    scrollY: Math.round(window.scrollY),
    heroBottom: Math.round(hr.bottom),
    heroPadBottom: hs.paddingBottom,
    heroMarginBottom: hs.marginBottom,
    nextTag: next ? (next.className || next.tagName) : null,
    nextMarginTop: ns ? ns.marginTop : null,
    nextPadTop: ns ? ns.paddingTop : null,
    lastPaintedInHero: Math.round(inside),
    firstPaintedInNext: nTop === null ? null : Math.round(nTop),
    emptyBand: nTop === null ? null : Math.round(nTop - inside),
    docH: document.documentElement.scrollHeight,
    vw: window.innerWidth
  };
})()`;

const c = await connect();
for (const [w, h, mob] of [[1280, 900, false], [390, 780, true]]) {
  await c.setViewport(w, h, mob);
  for (const page of ["landing.html", "index.html"]) {
    await c.open(BASE + page);
    await c.settle();
    const m = await c.ev(MEASURE);
    log(`${w}px ${page.padEnd(14)} ${JSON.stringify(m)}`);
  }
  /* and after scrolling so the sticky chrome stops standing in the way */
  await c.open(BASE + "landing.html");
  await c.settle();
  await c.ev("(function(){document.querySelector('.hero').scrollIntoView();window.scrollBy(0,420);return 1})()");
  await sleep(400);
  log(`${w}px scrolled        ${JSON.stringify(await c.ev(MEASURE))}`);
  await c.savePng(`tools/tiers/gap-${w}.png`, false);
}
await c.close();
log("done");
