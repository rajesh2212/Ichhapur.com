/*  liquid-glass.js — the behaviour half of the Liquid Glass layer.
 *
 *  assets/css/liquid-glass.css holds every colour, edge and shadow. This file
 *  does the four things CSS cannot:
 *
 *    1. works out how much of the effect this browser can really render and
 *       writes the answer on <html data-glass>, before the first paint;
 *    2. supplies the two SVG filters that bend the backdrop behind the chrome;
 *    3. slides a glass bead under the active choice in the filter rows;
 *    4. turns the two status dropdowns into segmented glass controls that
 *       still drive the same <select> the rest of the admin page reads.
 *
 *  No dependencies, no build step, no WebGL. The refraction is an
 *  feDisplacementMap filter applied through backdrop-filter, which the
 *  browser's own compositor renders — see the tiers at the top of the CSS.
 *  Written in ES5 because the rest of the site is.
 */
(function (global) {
  "use strict";

  var doc = global.document;
  var html = doc.documentElement;
  var SVG = "http://www.w3.org/2000/svg";
  var KEY = "ichhapur.glass";
  var INSET = 3;     /* the bead is drawn this much wider than the choice it holds */
  var SETTLE = 470;  /* ms, matched to --lg-t x 1.35 in the CSS */

  function el(name, cls, text) {
    var n = doc.createElement(name);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }
  function all(selector, ctx) {
    return (ctx || doc).querySelectorAll(selector);
  }
  function each(list, fn) {
    for (var i = 0; i < list.length; i++) fn(list[i], i);
  }
  function own(container, cls) {
    var kids = container.children;
    for (var i = 0; i < kids.length; i++) {
      if (kids[i].classList && kids[i].classList.contains(cls)) return kids[i];
    }
    return null;
  }

  /* ========================================================== 1. the tier == */

  var bfProp = (function () {
    var probe = doc.createElement("div");
    var names = ["backdropFilter", "WebkitBackdropFilter"];
    for (var i = 0; i < names.length; i++) {
      if (!(names[i] in probe.style)) continue;
      probe.style[names[i]] = "blur(2px) saturate(150%)";
      if (probe.style[names[i]] !== "") return names[i];
    }
    return null;
  })();

  /* A detached element still parses its own inline style, so a value that comes
     back out unchanged is a value this browser accepts. That is the only honest
     way to ask "will you bend a backdrop through an SVG filter reference":
     Chromium says yes, WebKit and Firefox do not, and none of them can be
     trusted from a user-agent string. */
  function parses(value) {
    if (!bfProp) return false;
    var probe = doc.createElement("div");
    probe.style[bfProp] = value;
    return probe.style[bfProp] !== "";
  }

  function prefers(query) {
    return !!(global.matchMedia && global.matchMedia(query).matches);
  }

  function elect() {
    return (!bfProp || prefers("(prefers-reduced-transparency: reduce)") || prefers("(prefers-contrast: more)"))
      ? "solid"
      : (parses("url(#lg-lens) blur(6px) saturate(180%)") ? "refract" : "frost");
  }
  var TIER = elect();

  function readStore() {
    try { return global.localStorage.getItem(KEY); } catch (e) { return null; }
  }
  function writeStore(value) {
    try {
      if (value === null) global.localStorage.removeItem(KEY);
      else global.localStorage.setItem(KEY, value);
    } catch (e) { /* storage blocked: the switch still works for this visit */ }
  }

  var mode = readStore() === "off" ? "off" : TIER;

  /* ==================================================== 1b. the strength ==== */
  /* One number, held on the root as `--lg-s` in 0..1, is the only place the
     strength of the glass is written. The stylesheet multiplies its blur, its
     saturation and every panel's translucency by it; the SVG lens is re-scaled
     from it; the WebGL shader takes it as `u_reveal` and as the span of every
     one of its own terms. Nothing reads the slider's own style, so nothing can
     disagree with it.

     1 is what the material was tuned and measured at, so the default is 1 and
     the whole control range is 100 down to 0 — the top of the slider is the
     design, the bottom is the plain page. 0 is not a lie either: the blur terms
     go to zero, the fills close back to their opaque values, the lens scale goes
     to nothing and the shader reveals nothing, which leaves the plates exactly as
     liquid-glass.css drew them before any of this existed. */
  var SKEY = "ichhapur.glass.strength";
  var S_DEFAULT = 100;
  var S_MIN = 0, S_MAX = 100;

  function readStrength() {
    var v;
    try { v = parseInt(global.localStorage.getItem(SKEY), 10); } catch (e) { return S_DEFAULT; }
    if (isNaN(v)) return S_DEFAULT;
    return Math.max(S_MIN, Math.min(S_MAX, v));
  }
  function writeStrength(v) {
    try {
      if (v === S_DEFAULT) global.localStorage.removeItem(SKEY);
      else global.localStorage.setItem(SKEY, String(v));
    } catch (e) { /* storage blocked: the slider still works for this visit */ }
  }

  var strength = readStrength();

  function syncControls() {
    var range = doc.getElementById("glassStrength");
    if (range) {
      if (String(range.value) !== String(strength)) range.value = strength;
      /* the filled part of the track is the level, not the thumb alone */
      range.style.setProperty("--lg-level-p", strength + "%");
      var off = mode === "off";
      if (range.disabled !== off) range.disabled = off;
      var out = doc.getElementById("glassStrengthValue");
      if (out && out.textContent !== strength + "%") out.textContent = strength + "%";
    }
    var sw = doc.getElementById("glassSwitch");
    if (sw && sw.checked !== (mode !== "off")) sw.checked = mode !== "off";
  }

  function applyStrength(v) {
    strength = Math.max(S_MIN, Math.min(S_MAX, Math.round(v)));
    html.style.setProperty("--lg-s", String(strength / 100));
    /* the lens is bent by how far the displacement map drags, and the studio's
       own number for a wide sweep is roughly half of the tight one */
    if (defs) {
      var k = strength / 100;
      if (defs.__lens) defs.__lens.setAttribute("scale", (2 + 24 * k).toFixed(2));
      if (defs.__wide) defs.__wide.setAttribute("scale", (1 + 12 * k).toFixed(2));
    }
    if (global.LgGL) global.LgGL.strength(strength / 100);
    syncControls();
    writeStrength(strength);
  }

  /* ================================================== 1c. mode and the GL ==== */

  /* The WebGL layer is an addition to a tier, never a replacement for one: the
     CSS material still has to be chosen from what this browser can do on its
     own, because the shader only covers the plates whose backdrop it can
     rebuild. So `refract` and `frost` both get it, `solid` never does (that mode
     is a person asking for no transparency), and a lost context falls back to
     whichever of those was already elected. */
  function syncGL() {
    var G = global.LgGL;
    if (!G) return;
    /* Forced colours hides the pane in the stylesheet, so mounting the renderer
       there would spend a real WebGL pass painting something the display scheme
       then throws away. It stands down instead, like a browser with no WebGL2. */
    var want = (mode === "refract" || mode === "frost") && !prefers("(forced-colors: active)");
    if (want && !G.broken && G.supported && G.supported()) {
      if (G.start(strength / 100)) return;
    }
    G.stop();
  }

  function setMode(next) {
    mode = next;
    html.setAttribute("data-glass", next);
    var sw = doc.getElementById("glassSwitch");
    if (sw) {
      var on = next !== "off";
      if (sw.checked !== on) sw.checked = on;
    }
    if (next === "refract") injectDefs();
    syncGL();
  }

  setMode(mode); /* synchronous, in <head>, so nothing paints in the wrong tier */
  html.style.setProperty("--lg-s", String(strength / 100));

  /* ======================================================= 2. the filters == */

  function svgNode(name, attrs) {
    var n = doc.createElementNS(SVG, name);
    for (var k in attrs) {
      if (Object.prototype.hasOwnProperty.call(attrs, k)) n.setAttribute(k, attrs[k]);
    }
    return n;
  }

  /* Turbulence is the slope field, a small blur stops it reading as grain, and
     the displacement map drags the backdrop sideways along it. sRGB matters: in
     linearRGB the neutral midpoint drifts off grey and the band shifts colour. */
  function lensFilter(id, frequency, soften, shift) {
    var f = svgNode("filter", { id: id, "color-interpolation-filters": "sRGB" });
    f.appendChild(svgNode("feTurbulence", {
      type: "fractalNoise",
      baseFrequency: frequency,
      numOctaves: "1",
      seed: "17",
      result: "wave"
    }));
    f.appendChild(svgNode("feGaussianBlur", { "in": "wave", stdDeviation: soften, result: "slope" }));
    f.appendChild(svgNode("feDisplacementMap", {
      "in": "SourceGraphic",
      in2: "slope",
      scale: shift,
      xChannelSelector: "R",
      yChannelSelector: "G"
    }));
    return f;
  }

  var defs = null;
  function injectDefs() {
    if (defs || !doc.body) return;
    defs = el("div", "lg-defs");
    defs.setAttribute("aria-hidden", "true");
    /* tight and strong for the short edge of a card, loose and gentle for the
       long sweep of a bar, where a busy wave would sit under the page title */
    var lens = lensFilter("lg-lens", "0.014 0.02", 1.6, 26);
    var wide = lensFilter("lg-lens-wide", "0.006 0.011", 2.4, 13);
    /* the last primitive in a lens is the displacement map, and `scale` on it is
       how far the backdrop is dragged. The slider owns that number. */
    defs.__lens = lens.lastChild;
    defs.__wide = wide.lastChild;
    defs.appendChild(lens);
    defs.appendChild(wide);
    doc.body.appendChild(defs);
    applyStrength(strength);
  }

  /* ======================================================== 3. the bead ===== */

  /* Only --lg-to, width, top and height are written. The slide happens on the
     compositor (transform) while the bead still grows to fit a wider or
     narrower label. `animate` is false for a first seating and for a resize: a
     bead that slides in from the left edge on load, or chases the window, is a
     glitch people notice. */
  function seat(thumb, active, animate) {
    watchBox(thumb.parentNode);
    if (active) watchBox(active);
    if (!active || !active.offsetWidth || !active.offsetHeight) {
      thumb.__at = "";
      if (thumb.style.opacity !== "0") thumb.style.opacity = "0";
      return;
    }
    var x = Math.round(active.offsetLeft - INSET);
    var w = Math.round(active.offsetWidth + INSET * 2);
    var t = Math.round(active.offsetTop - INSET);
    var h = Math.round(active.offsetHeight + INSET * 2);
    var at = x + ":" + w + ":" + t + ":" + h;
    if (at === thumb.__at) {
      if (thumb.style.opacity === "0") thumb.style.opacity = "";
      return;
    }
    var first = thumb.__at === undefined || thumb.__at === "";
    thumb.__at = at;
    thumb.style.opacity = "";

    function write() {
      thumb.style.setProperty("--lg-to", "translateX(" + x + "px)");
      thumb.style.width = w + "px";
      thumb.style.top = t + "px";
      thumb.style.height = h + "px";
    }

    if (first || !animate) {
      if (thumb.classList.contains("is-moving")) thumb.classList.remove("is-moving");
      thumb.style.transition = "none";
      write();
      void thumb.offsetWidth; /* flush, so seating this is not itself a transition */
      thumb.style.transition = "";
    } else {
      write();
      thumb.classList.add("is-moving");
      if (thumb.__timer) global.clearTimeout(thumb.__timer);
      thumb.__timer = global.setTimeout(function () {
        thumb.classList.remove("is-moving");
        thumb.__timer = 0;
      }, SETTLE);
    }
  }

  /* A choice's box is not settled on the frame it is chosen. The site paints the
     checked label bolder, which makes it wider, and Blink finishes that `:has()`
     re-layout only after the change handler has already run — so measured inside
     the click, the label is still the width it had a moment ago. The bead then
     slid to the old box, arrived, and slid again for the 4px it had missed: a
     two-stage move anyone can see. Watching the box of each host and each choice
     makes the bead follow the real geometry whenever it changes, and catches the
     two cases no event covers either — a control that was `display:none` when it
     was built, and a webfont or an image that lands later. seat() is idempotent,
     so the extra pass writes nothing once the box has stopped moving. */
  var boxes = global.ResizeObserver ? new ResizeObserver(function () { schedule(false); }) : null;
  function watchBox(node) {
    if (boxes && node && !node.__lgBoxed) {
      node.__lgBoxed = true;
      boxes.observe(node);
    }
  }

  var ROWS = [    {
      selector: ".chips__row",
      active: function (row) { return row.querySelector('.filter-chip[aria-pressed="true"]'); }
    },
    {
      selector: ".radio-row",
      active: function (row) {
        var inputs = all('input[type="radio"]', row);
        for (var i = 0; i < inputs.length; i++) {
          /* the site wraps each radio in its label, so the box the bead has to
             cover is the label, not the row's direct child */
          if (inputs[i].checked) return inputs[i].closest("label") || inputs[i].parentNode;
        }
        return null;
      }
    }
  ];

  function beadRows(animate) {
    each(ROWS, function (spec) {
      each(all(spec.selector), function (row) {
        var thumb = own(row, "lg-thumb");
        if (!thumb) {
          thumb = el("span", "lg-thumb");
          thumb.setAttribute("aria-hidden", "true");
          row.insertBefore(thumb, row.firstChild);
        }
        seat(thumb, spec.active(row), animate);
      });
    });
  }

  /* ================================================== 4. segmented controls = */

  /* A <select> becomes a radiogroup, but the select keeps holding the value —
     the admin table, the export and the saved draft all read it. So the group
     writes to the select and dispatches the change the page already listens
     for, and the select's own `value` setter is wrapped so that a script
     writing to it (the discard button does) still moves the bead. The
     prototype's setter is called, never replaced, so the select itself is
     untouched; `internal` keeps our own writes from echoing back as an
     outside change and killing the slide. */
  function watchSetter(proto, node, prop, notify) {
    var desc = Object.getOwnPropertyDescriptor(proto, prop);
    if (!desc || typeof desc.set !== "function") return;
    try {
      Object.defineProperty(node, prop, {
        configurable: true,
        get: function () { return desc.get.call(this); },
        set: function (v) { desc.set.call(this, v); notify(); }
      });
    } catch (e) { /* nothing we can do; the group still works by pointing */ }
  }

  function buildSegment(select) {
    if (!select || select.__lgSeg) return;
    var count = select.options.length;
    /* Two or three choices are a segment. A trade list of a dozen is a
       dropdown, and dressing it as a segment would only make it harder to use. */
    if (count < 2 || count > 3) return;
    select.__lgSeg = true;

    var internal = false;
    var wrap = el("div", "lg-seg-wrap");
    select.parentNode.insertBefore(wrap, select);
    wrap.appendChild(select);

    var seg = el("div", "lg-seg");
    seg.setAttribute("role", "radiogroup");

    var label = select.id ? doc.querySelector('label[for="' + select.id + '"]') : null;
    if (label && !label.id) label.id = select.id + "-lg-name";
    if (label) seg.setAttribute("aria-labelledby", label.id);
    else seg.setAttribute("aria-label", select.getAttribute("aria-label") || "Choice");
    var described = select.getAttribute("aria-describedby");
    if (described) seg.setAttribute("aria-describedby", described);

    var thumb = el("span", "lg-thumb");
    thumb.setAttribute("aria-hidden", "true");
    seg.appendChild(thumb);

    var opts = [];
    var i;
    for (i = 0; i < count; i++) {
      var b = el("button", "lg-seg__opt", select.options[i].textContent);
      b.type = "button";
      b.setAttribute("role", "radio");
      b.setAttribute("aria-checked", "false");
      b.setAttribute("data-value", select.options[i].value);
      b.tabIndex = -1;
      seg.appendChild(b);
      opts.push(b);
    }
    wrap.appendChild(seg);

    function indexOf(value) {
      for (var k = 0; k < opts.length; k++) {
        if (opts[k].getAttribute("data-value") === value) return k;
      }
      return -1;
    }

    function sync(animate) {
      var chosen = indexOf(select.value);
      if (chosen < 0) chosen = 0;
      for (var k = 0; k < opts.length; k++) {
        opts[k].setAttribute("aria-checked", k === chosen ? "true" : "false");
        opts[k].tabIndex = k === chosen ? 0 : -1;
      }
      seat(thumb, opts[chosen], animate);
      if (seg.scrollWidth > seg.clientWidth + 1) {
        var left = opts[chosen].offsetLeft - (seg.clientWidth - opts[chosen].offsetWidth) / 2;
        seg.scrollLeft = Math.max(0, Math.min(left, seg.scrollWidth - seg.clientWidth));
      }
    }

    function choose(value) {
      if (select.value === value) { sync(false); return; }
      internal = true;
      select.value = value;
      sync(true);
      select.dispatchEvent(new global.Event("change", { bubbles: true }));
      internal = false;
    }

    each(opts, function (b) {
      b.addEventListener("click", function () {
        choose(b.getAttribute("data-value"));
        b.focus();
      });
    });

    seg.addEventListener("keydown", function (e) {
      var k = e.key;
      var from = -1;
      for (var q = 0; q < opts.length; q++) if (opts[q] === doc.activeElement) from = q;
      if (from < 0) from = indexOf(select.value);
      if (from < 0) from = 0;
      var next = -1;
      if (k === "ArrowRight" || k === "ArrowDown") next = (from + 1) % opts.length;
      else if (k === "ArrowLeft" || k === "ArrowUp") next = (from - 1 + opts.length) % opts.length;
      else if (k === "Home") next = 0;
      else if (k === "End") next = opts.length - 1;
      if (next < 0) return;
      e.preventDefault();
      opts[next].focus();
      choose(opts[next].getAttribute("data-value"));
    });

    /* The field's label used to focus the dropdown; now it opens the group. */
    if (label) {
      label.addEventListener("click", function (e) {
        e.preventDefault();
        var c = indexOf(select.value);
        opts[c < 0 ? 0 : c].focus();
      });
    }

    watchSetter(global.HTMLSelectElement.prototype, select, "value", function () {
      if (!internal) sync(false);
    });
    /* Left on the select so the layout pass below can re-measure this group:
       the editor sheet is hidden when the page builds it, so the first seating
       has nothing to measure and bails. Opening the sheet has to seat it. */
    select.__lgSegSync = sync;
    sync(false);
  }

  function segments() {
    /* buildSegment returns straight away for a group it already made, so this
       pass would otherwise never re-measure one. A row that was hidden at build
       time and has just become visible has a bead that was never written — the
       editor's status control would open with no selection showing at all until
       the first click. Re-seating is idempotent (seat() writes nothing when the
       box is unchanged) and never animated from here: opening a sheet is not a
       gesture on the control inside it, and a bead that slides across while the
       panel rises reads as a glitch, not as fluid. */
    each([doc.getElementById("admStatus"), doc.getElementById("fStatus")], function (select) {
      if (!select) return;
      buildSegment(select);
      if (select.__lgSegSync) select.__lgSegSync(false);
    });
  }

  /* ========================================================= 5. the switch == */

  function wireSwitch() {
    var sw = doc.getElementById("glassSwitch");
    if (sw && !sw.__lgWire) {
      sw.__lgWire = true;
      sw.checked = mode !== "off";
      sw.addEventListener("change", function () {
        if (sw.checked) { writeStore(null); setMode(TIER); }
        else { writeStore("off"); setMode("off"); }
        apply(false);
      });
    }

    var range = doc.getElementById("glassStrength");
    if (range && !range.__lgWire) {
      range.__lgWire = true;
      /* `input`, not `change`: a slider that only lands on release is a slider
         you cannot see working. This is the whole point of the control. */
      range.addEventListener("input", function () { applyStrength(parseFloat(range.value)); });
      range.addEventListener("change", function () { applyStrength(parseFloat(range.value)); });
    }

    var reset = doc.getElementById("glassReset");
    if (reset && !reset.__lgWire) {
      reset.__lgWire = true;
      reset.addEventListener("click", function () {
        applyStrength(S_DEFAULT);
        if (mode === "off") { writeStore(null); setMode(TIER); apply(false); }
      });
    }

    applyStrength(strength);
  }

  /* ================================================= 6. surfaces and timing = */

  /* Only these surfaces float over something worth bending: the masthead and
     the back bar sit above scrolling content, the store sheet dims the whole
     page behind it, the float card sits on a photograph, and the drawer covers
     the guide. A card in the middle of a cream page has nothing behind it, so
     it is glass by edge, depth and fill alone — which is the truth, not a
     shortcut. */
  var LENS = [
    [".masthead", "lens lens--bar"],
    [".backbar", "lens lens--bar"],
    [".mastnav", "lens"],
    [".sheet__head", "lens lens--bar"],
    [".floatcard", "lens"]
  ];

  function markSurfaces() {
    each(LENS, function (pair) {
      each(all(pair[0]), function (node) {
        if (node.classList.contains("lens")) return;
        var classes = pair[1].split(" ");
        for (var i = 0; i < classes.length; i++) node.classList.add(classes[i]);
      });
    });

    /* A stat card frosts its own backdrop already. Sampling it again would
       blur a blur, and twice-blurred colour has nothing left to bend, so this
       band is drawn light instead — see .lg-rim in the CSS. */
    each(all(".statcard"), function (card) {
      if (own(card, "lg-rim")) return;
      card.classList.add("lg-rim-host");
      var rim = el("span", "lg-rim");
      rim.setAttribute("aria-hidden", "true");
      card.insertBefore(rim, card.firstChild);
    });
  }

  function apply(animate) {
    if (mode === "refract") injectDefs();
    markSurfaces();
    beadRows(animate);
    segments();
    wireSwitch();
    syncGL();
    if (!html.classList.contains("is-lg-live")) html.classList.add("is-lg-live");
  }

  var queued = false;
  var wantAnimate = false;
  var writing = false;
  var lateChange = false;

  /* Everything is one coalesced pass per frame, and it is idempotent: a row
     that is already seated writes nothing, so nothing here can feed on itself. */
  function schedule(animate) {
    if (animate) wantAnimate = true;
    if (queued) return;
    queued = true;
    function run() {
      queued = false;
      var flag = wantAnimate;
      wantAnimate = false;
      writing = true;
      apply(flag);
      global.setTimeout(function () {
        writing = false;
        /* A change that arrived while this pass was running is not ours to throw
           away: the guide's click handler sets aria-pressed in the same breath as
           a re-render, and if the record landed mid-pass the bead would have been
           left on the chip the row used to show — which is exactly the one-in-five
           click this used to miss. One more pass, and it converges: the second
           apply writes nothing new, so no third record is made. */
        if (lateChange) { lateChange = false; schedule(true); }
      }, 0);
    }
    if (global.requestAnimationFrame) global.requestAnimationFrame(run);
    else global.setTimeout(run, 16);
  }

  /* The guide's chips and the admin table are rebuilt by their own scripts, and
     the bead has to survive that — a row wiped and refilled mid-filter would
     otherwise lose it. A pointer click is the animated case; a resize is not. */
  function watchDom() {
    if (!global.MutationObserver || !doc.body) return;
    var mo = new MutationObserver(function (records) {
      for (var i = 0; i < records.length; i++) {
        var t = records[i].target;
        if (t.nodeType === 1 && t.closest && t.closest(".lg-defs, .lg-thumb, .lg-rim, .lg-seg")) continue;
        if (writing) { lateChange = true; return; }
        schedule(true);
        return;
      }
    });
    mo.observe(doc.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["class", "hidden", "disabled", "aria-pressed", "open"]
    });
  }

  /* A radio's `checked` is set directly by the report form's kind buttons, and
     setting it in code fires no event — the bead would sit still while the
     choice moved. */
  function watchRadios() {
    each(all('.radio-row input[type="radio"]'), function (input) {
      if (input.__lgWatch) return;
      input.__lgWatch = true;
      watchSetter(global.HTMLInputElement.prototype, input, "checked", function () { schedule(false); });
      input.addEventListener("change", function () { schedule(true); });
    });
  }

  /* The tier is elected from the operating system's own settings, and a person
     can change those with this page open — every browser fires these queries.
     Honouring the new value without a reload is the whole point of the media
     feature; a switch flipped in System Settings that leaves WebGL glass
     refracting on the screen is a promise broken. If the store says the person
     turned the effect off themselves, that choice outranks the re-election. */
  function watchPrefs() {
    if (!global.matchMedia) return;
    each(["(prefers-reduced-transparency: reduce)", "(prefers-contrast: more)",
      "(forced-colors: active)"], function (q) {
      var mq;
      try { mq = global.matchMedia(q); } catch (e) { return; }
      if (!mq || !mq.addEventListener) return;
      mq.addEventListener("change", function () {
        TIER = elect();
        if (mode !== "off") setMode(TIER);
        else syncGL(); /* the tier is unchanged, but whether the renderer may run is not */
      });
    });
  }

  function start() {
    /* A driver that takes the context away mid-visit is not an error the person
       sees: the panes come down, the CSS glass underneath is already there, and
       nothing is asked to try again. */
    if (global.LgGL) global.LgGL.onFailed = function () { syncGL(); };
    watchRadios();
    watchPrefs();
    apply(false);
    watchDom();
    global.addEventListener("resize", function () { schedule(false); });
    global.addEventListener("load", function () { schedule(false); });
  }

  if (doc.readyState === "loading") {
    doc.addEventListener("DOMContentLoaded", function () { global.setTimeout(start, 0); });
  } else {
    global.setTimeout(start, 0);
  }
})(window);
