/* tools/gl-plates.mjs — look at the glass, not at the page.

   The smoke test proves the pass runs and the panes are painted; it cannot say
   whether the result reads as glass. This crops to each plate's own box — plus
   enough of the photograph around it to judge the bend — and writes one PNG per
   plate per strength, so a rim that blows out to white or a backdrop sampled
   from the wrong end of the viewport is visible in the picture rather than
   hidden behind a passing assertion. */
import { connect, BASE } from "./glass-lib.mjs";
import fs from "node:fs";

const c = await connect();
const out = (s) => process.stdout.write(s + "\n");
const VW = 1280, VH = 860;

const PLATES = [
  ["landing.html", ".hero__chip", "chip"],
  ["landing.html", ".shot__note", "note"],
  ["about.html", ".floatcard", "float"],
  ["about.html", ".shot__note", "note2"],
  ["listings.html", ".shot__note", "note3"],
];

async function strength(v) {
  await c.ev(`(function(){var r=document.getElementById('glassStrength');r.value=${v};` +
    `r.dispatchEvent(new Event('input',{bubbles:true}));})()`);
  await c.sleep(450);
}

async function shot(sel, tag, page, pad) {
  /* Centering a plate that is already on screen can make the crop lie: the hero
     chip sits near the top of landing.html, and scrollIntoView can only push it
     *up* under the sticky masthead. Scroll only when the box is not fully in the
     viewport, and report where the plate ended up so the picture is readable. */
  const box = await c.ev(`(function(){var n=document.querySelector(${JSON.stringify(sel)});
    if(!n) return null; var b=n.getBoundingClientRect();
    if(b.top < 4 || b.bottom > innerHeight - 4)
      n.scrollIntoView({block:'center',behavior:'instant'});
    return 1;})()`);
  if (!box) return out(`   ${sel} — absent on ${page}`);
  await c.sleep(500);
  const r = await c.ev(`(function(){var n=document.querySelector(${JSON.stringify(sel)});
    var b=n.getBoundingClientRect();
    var hd=document.querySelector('.masthead, .backbar');
    var clear=1, ov=0;
    if(hd){var h=hd.getBoundingClientRect();
      ov=Math.max(0, Math.min(b.bottom, h.bottom) - Math.max(b.top, h.top));
      clear=ov < 1;}
    return {x:b.x,y:b.y,w:b.width,h:b.height,clear:clear,ov:Math.round(ov),
      /* CDP's screenshot clip is in *page* coordinates; getBoundingClientRect is
         in viewport ones. Forget the scroll offset and the crop lands somewhere
         else in the document entirely — a flat cream band instead of the plate. */
      px:b.x + scrollX, py:b.y + scrollY,
      painted:n.hasAttribute('data-gl-painted'),
      pane:(function(){var p=n.__lgPane; if(!p) return null;
        var x=p.__ctx||p.getContext('2d'); var d=x.getImageData(0,0,p.width,p.height).data;
        var n2=0,rs=0,gs=0,bs=0,i;
        for(i=0;i<d.length;i+=4){ if(d[i+3]>8){n2++;rs+=d[i];gs+=d[i+1];bs+=d[i+2];} }
        return n2?{r:Math.round(rs/n2),g:Math.round(gs/n2),b:Math.round(bs/n2),a:Math.round(n2*100/(p.width*p.height))}:null;})()};})()`);
  const x = Math.max(0, r.px - pad), y = Math.max(0, r.py - pad);
  const w = r.w + pad * 2, h = r.h + pad * 2;
  const png = await c.call("Page.captureScreenshot", {
    format: "png",
    captureBeyondViewport: true,
    clip: { x, y, width: w, height: h, scale: 2 },
  });
  const file = `tools/tiers/gl-${tag}-${current}.png`;
  fs.writeFileSync(file, Buffer.from(png.data, "base64"));
  out(`   ${sel} ${Math.round(r.w)}x${Math.round(r.h)} y=${Math.round(r.y)} clear=${r.clear} overlap=${r.ov}px painted=${r.painted} pane=${JSON.stringify(r.pane)} -> ${file}`);
}

let current = "s100";
await c.setViewport(VW, VH, false);
for (const s of [100, 45]) {
  current = "s" + s;
  out('');
  out('== strength ' + s + '%');
  const pages = [...new Set(PLATES.map((p) => p[0]))];
  for (const page of pages) {
    await c.open(BASE + page + "?lg-gl=on");
    await c.settle();
    await strength(s);
    for (const [p2, sel2, tag2] of PLATES) if (p2 === page) await shot(sel2, tag2, p2, 46);
  }
}
c.close();
