/* tools/gl-smoke.mjs — first light for the WebGL glass layer.

   It answers one question, and answers it plainly: did the shader compile, did
   it run, and is there real painted glass sitting inside the plates it claims to
   cover? Everything it prints is measured out of the page, not from the renderer
  's own word. */
import { connect, BASE } from "./glass-lib.mjs";

const c = await connect();
const out = (s) => process.stdout.write(s + "\n");

await c.call("Page.addScriptToEvaluateOnNewDocument", {
  source: "window.__errs=[];addEventListener('error',function(e){window.__errs.push(String(e.message))});" +
    "addEventListener('unhandledrejection',function(e){window.__errs.push('promise: '+String(e.reason))});",
});

async function probe(url, w, h) {
  await c.setViewport(w, h, false);
  await c.open(url);
  await c.settle();
  await c.sleep(400);
  return c.ev(`(function(){
    var G = window.LgGL || {};
    var root = document.documentElement;
    var hosts = [].slice.call(document.querySelectorAll('[data-gl-host]'));
    var panes = hosts.map(function(n){
      var p = n.__lgPane;
      if (!p) return { host: n.className, pane: false };
      var ctx = p.__ctx || p.getContext('2d');
      var d = ctx.getImageData(0, 0, p.width, p.height).data;
      var painted = 0, sumA = 0, i;
      for (i = 3; i < d.length; i += 4) { if (d[i] > 8) { painted++; sumA += d[i]; } }
      return {
        host: n.className.split(' ')[0],
        box: Math.round(p.width) + 'x' + Math.round(p.height),
        filled: Math.round(100 * painted / (p.width * p.height)),
        meanAlpha: painted ? Math.round(sumA / painted) : 0
      };
    });
    var lens = document.querySelector('#lg-lens feDisplacementMap');
    return {
      tier: root.getAttribute('data-glass'),
      gl: root.getAttribute('data-glass-gl'),
      s: getComputedStyle(root).getPropertyValue('--lg-s').trim(),
      supported: typeof G.supported === 'function' ? G.supported() : null,
      broken: !!G.broken,
      glError: G.error || null,
      lensScale: lens ? lens.getAttribute('scale') : null,
      range: (function(){ var r = document.getElementById('glassStrength'); return r ? r.value + '/disabled=' + r.disabled : 'none'; })(),
      hosts: panes,
      errs: (window.__errs || []).slice(0, 6)
    };
  })()`);
}

function show(label, r) {
  out('');
  out('== ' + label);
  out('   tier=' + r.tier + '  gl=' + r.gl + '  --lg-s=' + r.s +
      '  supported=' + r.supported + '  broken=' + r.broken);
  if (r.glError) out('   shader error: ' + r.glError);
  out('   lens scale=' + r.lensScale + '   range=' + r.range);
  r.hosts.forEach((h) => out('   plate ' + JSON.stringify(h)));
  if (!r.hosts.length) out('   (no plates on screen)');
  if (r.errs.length) out('   page errors: ' + r.errs.join(' | '));
}

show('landing 1280 desktop', await probe(BASE + 'landing.html?lg-gl=on', 1280, 860));
show('about 1280 desktop', await probe(BASE + 'about.html?lg-gl=on', 1280, 860));

/* the same page at three strengths, to prove the slider is the glass and not a
   label: the reveal term, the lens and the panel's own translucency all move */
async function at(v) {
  await c.ev(`(function(){var r=document.getElementById('glassStrength');r.value=${v};` +
    `r.dispatchEvent(new Event('input',{bubbles:true}));})()`);
  await c.sleep(500);
  /* Read what the browser resolved, not the token text: --lg-blur is a calc() of
     --lg-s, and only the used value proves the substitution actually ran. */
  return c.ev(`(function(){var root=document.documentElement;
    var s=getComputedStyle(root).getPropertyValue('--lg-s').trim();
    var chip=document.querySelector('.hero__chip');
    var pane=chip&&chip.__lgPane;
    var a=null;
    if(pane){var x=pane.__ctx||pane.getContext('2d');
      var d=x.getImageData(0,0,pane.width,pane.height).data;var n=0,t=0,i;
      for(i=3;i<d.length;i+=4){if(d[i]>8){n++;t+=d[i];}}
      a=n?Math.round(t/n):0;}
    var lens=document.querySelector('#lg-lens feDisplacementMap');
    var mast=document.querySelector('.masthead');
    return {s:s,
      chromeBlur:(getComputedStyle(mast).backdropFilter||'').replace(/saturate\\([^)]*\\)/,''),
      panelFill:getComputedStyle(document.querySelector('.floatcard')||mast).backgroundColor,
      lens:lens?lens.getAttribute('scale'):null, meanAlpha:a,
      store:(function(){try{return localStorage.getItem('ichhapur.glass.strength')}catch(e){return 'x'}})()};
  })()`);
}

await c.open(BASE + 'landing.html?lg-gl=on');
await c.settle();
await c.sleep(400);
for (const v of [0, 45, 100]) out('   s=' + v + '% -> ' + JSON.stringify(await at(v)));

/* Scrolled plates. The hero chip is on screen at load, so the two plates that
   live further down — a listing's floating price card and a photograph's
   caption — are the ones that prove the pass follows the page rather than
   running once. `frame()` is scheduled on scroll, so each plate is scrolled to
   the middle, given two frames, and then its own pane pixels are read. */
async function scrolled(url, sel) {
  await c.setViewport(1280, 860, false);
  await c.open(BASE + url + '?lg-gl=on');
  await c.settle();
  await c.sleep(300);
  const before = await c.ev(`(function(){var n=document.querySelector(${JSON.stringify(sel)});
    if(!n) return 'absent';
    var r=n.getBoundingClientRect();
    return {onScreen:(r.bottom>0&&r.top<innerHeight)};})()`);
  if (before === 'absent') return '  ' + sel + ' — not on this page';
  await c.ev(`(function(){var n=document.querySelector(${JSON.stringify(sel)});
    n.scrollIntoView({block:'center',behavior:'instant'});})()`);
  await c.sleep(600);
  const after = await c.ev(`(function(){var n=document.querySelector(${JSON.stringify(sel)});
    var p=n&&n.__lgPane; if(!p) return {pane:false, painted:n&&n.hasAttribute('data-gl-painted')};
    var x=p.__ctx||p.getContext('2d');
    var d=x.getImageData(0,0,p.width,p.height).data; var n2=0,t=0,i;
    for(i=3;i<d.length;i+=4){ if(d[i]>8){n2++;t+=d[i];} }
    var r=n.getBoundingClientRect();
    return {pane:true, box:Math.round(p.width)+'x'+Math.round(p.height),
      filled:Math.round(100*n2/(p.width*p.height)), meanAlpha:n2?Math.round(t/n2):0,
      inView:(r.bottom>0&&r.top<innerHeight), gl:document.documentElement.getAttribute('data-glass-gl')};})()`);
  return '  ' + sel + ' before=' + JSON.stringify(before) + ' after=' + JSON.stringify(after);
}

out('');
out('== scrolled plates');
out(await scrolled('about.html', '.floatcard'));
out(await scrolled('about.html', '.shot__note'));
out(await scrolled('listings.html', '.shot__note'));
out(await scrolled('contact.html', '.shot__note'));

await c.open(BASE + 'landing.html?lg-gl=on');
await c.settle();
await c.sleep(400);
await c.savePng('tools/tiers/gl-landing-1280.png', false);
await c.savePng('tools/tiers/gl-landing-full.png', true);
out('');
out('wrote tools/tiers/gl-landing-1280.png and gl-landing-full.png');
c.close();
