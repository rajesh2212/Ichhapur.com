/* tools/panes.mjs — read what the WebGL pass actually put in each plate's pane.
   The shared render target is deliberately detached from the document, so the
   only pixels visible to the page are the per-plate 2D canvases it was blitted
   into. Reading them answers "is the chip being painted with a statcard's
   pixels" without touching the product file. */
import { connect } from "./glass-lib.mjs";

const c = await connect();
const W = Number(process.argv[2] || 375), H = Number(process.argv[3] || 812);
await c.setViewport(W, H, W < 800);
await c.open(c.BASE + "landing.html?lg-gl=on");
await c.settle();
await c.ev("(function(){document.documentElement.setAttribute('data-glass','refract');" +
  "window.dispatchEvent(new Event('resize'));return 1})()");
await c.sleep(650);
/* The visitor's own strength, set through the page's slider rather than by
   writing the token, so the frame is one a person can actually reach. `LG_LEVEL`
   lets the same plate be shot at 0, 60 and 100 and the three PNGs compared. */
const LEVEL = process.env.LG_LEVEL || "100";
await c.ev("(function(){var r=document.getElementById('glassStrength');" +
  "if(r){r.value=" + LEVEL + ";r.dispatchEvent(new Event('input',{bubbles:true}));}return 1})()");
await c.ev("(function(){var n=document.querySelector('.hero__chip');" +
  "if(n)n.scrollIntoView({block:'center'});return 1})()");
await c.sleep(900);
await c.settle();
await c.sleep(400);

const rows = await c.ev(`(function(){
  var out=[];
  var nodes=document.querySelectorAll('[data-gl-host]');
  for(var i=0;i<nodes.length;i++){
    var n=nodes[i], p=n.__lgPane;
    var q=n.getBoundingClientRect();
    var row={sel:n.className.replace(/\\s+/g,'.'),
      rect:[Math.round(q.left),Math.round(q.top),Math.round(q.width),Math.round(q.height)],
      bg:getComputedStyle(n).backgroundColor, pane:null};
    if(p&&p.__ctx){
      var d=p.__ctx.getImageData(0,0,p.width,p.height).data;
      var sum=[0,0,0,0],cnt=0,mid=null;
      var cx=Math.floor(p.width/2), cy=Math.floor(p.height/2);
      for(var y=0;y<p.height;y++)for(var x=0;x<p.width;x++){
        var k=(y*p.width+x)*4;
        if(d[k+3]<8) continue;
        sum[0]+=d[k];sum[1]+=d[k+1];sum[2]+=d[k+2];sum[3]+=d[k+3];cnt++;
      }
      var m=(cy*p.width+cx)*4;
      mid=[d[m],d[m+1],d[m+2],d[m+3]];
      /* The very corner of the buffer. A plate whose SDF is a rounded rectangle
         has nothing there, so this alpha is the number that separates "a glass
         pill with a lit rim" from "a rectangle the size of the element" — which
         is what the pass drew while scene() was in the wrong unit. */
      var g=(1*p.width+1)*4;
      row.pane={buf:p.width+'x'+p.height,corner:d[g+3],opaque:cnt,
        mean:cnt?[Math.round(sum[0]/cnt),Math.round(sum[1]/cnt),Math.round(sum[2]/cnt),Math.round(sum[3]/cnt)]:null,
        centre:mid};
    }
    out.push(row);
  }
  var imgs=[];
  var list=document.querySelectorAll('.hero__media img, .shot img, .pageshot img');
  for(var j=0;j<list.length;j++){var b=list[j].getBoundingClientRect();
    imgs.push({src:(list[j].currentSrc||'').split('/').pop(),
      rect:[Math.round(b.left),Math.round(b.top),Math.round(b.width),Math.round(b.height)]});}
  return {panes:out, imgs:imgs, dpr:devicePixelRatio,
    inner:[innerWidth,innerHeight],
    gl:document.documentElement.getAttribute('data-glass-gl'),
    s:getComputedStyle(document.documentElement).getPropertyValue('--lg-s').trim()};
})()`);

console.log("viewport " + W + "x" + H + " dpr=" + rows.dpr + " gl=" + rows.gl + " s=" + rows.s);
for (const im of rows.imgs) console.log("  img  " + im.src + " " + JSON.stringify(im.rect));
for (const r of rows.panes) {
  console.log("  host " + r.sel.padEnd(14) + JSON.stringify(r.rect).padEnd(22) + " bg " + r.bg);
  console.log("       pane " + JSON.stringify(r.pane));
}
/* A number says the pane has pixels; a frame says whether they read as glass.
   Pass a filename and this run saves the viewport — never the whole page,
   because the pass only ever drew for the scroll position it is standing at. */
if (process.argv[4]) await c.savePng(process.argv[4], false);
c.close();
