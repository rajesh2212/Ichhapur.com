/* tools/hero-shot.mjs — the landing hero at both widths, one file each. */
import { connect, BASE } from "./glass-lib.mjs";
import fs from "node:fs";

const c = await connect();
for (const [w, h, mob] of [[1280, 900, false], [390, 844, true]]) {
  await c.setViewport(w, h, mob);
  await c.open(BASE + "landing.html");
  await c.sleep(1200);
  const box = await c.ev("(function(){var q=document.querySelector('.hero').getBoundingClientRect();" +
    "return {x:q.left+scrollX,y:q.top+scrollY,w:q.width,h:q.height};})()");
  const shot = await c.call("Page.captureScreenshot", {
    format: "png", captureBeyondViewport: true,
    clip: { x: box.x, y: box.y, width: box.w, height: Math.min(box.h, h), scale: 1 },
  });
  fs.writeFileSync("tools/tiers/hero-" + w + ".png", Buffer.from(shot.data, "base64"));
  const src = await c.ev("(function(){var i=document.querySelector('.hero__media img');" +
    "return i.currentSrc + ' | ' + i.naturalWidth + 'x' + i.naturalHeight + ' | loaded=' + i.complete;})()");
  console.log(w + "px hero " + Math.round(box.h) + " tall  <-  " + src);
}

/* The <picture> is only worth having if the last child still works. Chrome cannot
   be told not to support WebP, so take the same route an old browser takes:
   remove the sources it would never have matched and let the <img> speak. What
   matters is that the JPEG is the same frame at the same aspect — a fallback that
   arrives cropped differently is a second design bug, not a safety net. */
await c.setViewport(1280, 900, false);
await c.open(BASE + "landing.html");
await c.sleep(900);
await c.ev("(function(){" +
  "var m=document.querySelector('.hero__media');" +
  "Array.prototype.forEach.call(m.querySelectorAll('source'),function(s){s.remove()});" +
  "var i=m.querySelector('img');i.removeAttribute('srcset');" +
  "i.src='assets/img/dark/hero-market-lit.jpg';return 1;})()");
await c.sleep(1400);
const fbInfo = await c.ev("(function(){var i=document.querySelector('.hero__media img');" +
  "var q=i.getBoundingClientRect();var s=getComputedStyle(i);" +
  "return {src:i.currentSrc, nat:i.naturalWidth+'x'+i.naturalHeight, ok:i.complete&&i.naturalWidth>0," +
  " box:Math.round(q.width)+'x'+Math.round(q.height), fit:s.objectFit, pos:s.objectPosition};})()");
const shot2 = await c.call("Page.captureScreenshot", {
  format: "png", captureBeyondViewport: true,
  clip: { x: 0, y: 0, width: 1280, height: 741, scale: 1 },
});
fs.writeFileSync("tools/tiers/hero-jpeg-only.png", Buffer.from(shot2.data, "base64"));
console.log("jpeg only    <-  " + JSON.stringify(fbInfo));

/* And the last one: the file is missing altogether. The hero must still be a dark
   surface with readable type, which is what `.hero { background-color }` is for. */
await c.ev("(function(){document.querySelector('.hero__media img')" +
  ".src='assets/img/dark/no-such-file.jpg';return 1})()");
await c.sleep(900);
const shot3 = await c.call("Page.captureScreenshot", {
  format: "png", captureBeyondViewport: true,
  clip: { x: 0, y: 0, width: 1280, height: 741, scale: 1 },
});
fs.writeFileSync("tools/tiers/hero-no-image.png", Buffer.from(shot3.data, "base64"));
const bg = await c.ev("(function(){var h=document.querySelector('.hero');" +
  "var cs=getComputedStyle(h);return cs.backgroundColor+' | img ok='+(" +
  "function(){var i=document.querySelector('.hero__media img');return i.complete&&i.naturalWidth>0})();" +
  "})()");
console.log("no image     <-  " + bg);
c.close();
