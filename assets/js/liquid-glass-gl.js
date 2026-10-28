/* ============================================================================
   ICHHAPUR Market — liquid-glass-gl.js
   ----------------------------------------------------------------------------
   The WebGL half of the Liquid Glass layer.

   assets/css/liquid-glass.css draws glass with what a stylesheet can draw: a
   fill, a lit edge, a shadow, and — where the browser allows it — an
   feDisplacementMap bent through `backdrop-filter`. That bends a noise field,
   and only in Chromium. This file does the job the way iOS does it: a shader
   that solves the surface of a thick-edged plate, refracts the picture behind
   it with Snell's law, splits that bend into its component wavelengths, and
   adds the Fresnel brightening and the travelling glare a real rim shows.

   Provenance
   ----------
   Ported and adapted from `liquid-glass-studio` by Charles Yin
   (https://github.com/iyinchao/liquid-glass-studio), MIT licensed:

     MIT License — Copyright (c) 2024 Charles Yin
     Permission is hereby granted, free of charge, to any person obtaining a
     copy of this software and associated documentation files (the "Software"),
     to deal in the Software without restriction, including without limitation
     the rights to use, copy, modify, merge, publish, distribute, sublicense,
     and/or sell copies of the Software. THE SOFTWARE IS PROVIDED "AS IS",
     WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED.

   Kept from it: the rounded-rectangle SDF with superellipse corners, the
   smooth-min union that lets two neighbouring plates fuse like one drop, the
   edge factor solved from thetaI/thetaT across the glass thickness, the
   per-channel indices of refraction that give the dispersion, the Fresnel and
   glare terms evaluated in LCH, and the separable Gaussian that feeds them.
   The LCH stack is the studio's, which credits
   https://github.com/Rachmanin0xFF/GLSL-Color-Functions.

   The one thing that could not be kept
   ------------------------------------
   The studio owns its backdrop: it renders a background image into the same
   canvas and refracts that texture. A website's backdrop is the DOM, and no
   browser lets a canvas read the pixels composited behind it. So the backdrop
   is rebuilt rather than captured — every photographic layer the site itself
   paints is uploaded as a texture and drawn into an offscreen buffer at the
   exact screen rectangle it occupies, with its own object-fit crop, its own
   opacity, and the hero's darkening gradients over it. The shader refracts
   that buffer, so the bend is the real photograph in the real place. Where a
   plate has no picture behind it there is nothing for a lens to do, the
   shader is not used there, and the stylesheet's glass stays — same as before.

   Failure is silent by design. No WebGL2, a lost context, a software rasteriser,
   `prefers-reduced-transparency`, `prefers-contrast: more`, or a strength of
   zero and this file does nothing at all; `liquid-glass.css` renders the glass.
   ========================================================================= */
(function (global) {
  "use strict";

  var doc = global.document;
  var html = doc.documentElement;
  var MAX_SHAPES = 20;
  var MAX_SOURCES = 10;
  var BLUR_MAX = 24;

  /* ------------------------------------------------------------- 1. capability */

  var canGL = null;

  function supported() {
    if (canGL !== null) return canGL;
    /* The verification harness runs Chrome without a GPU, where ANGLE answers
       SwiftShader and the probe below correctly says "this machine should not
       pay for a shader". `?lg-gl=on` is how that same build is asked to render
       one anyway; an ordinary visitor never puts it in the address bar. */
    if (/[?&]lg-gl=(on|force)/.test(global.location.search)) { canGL = true; return true; }
    try {
      var c = doc.createElement("canvas");
      var gl = c.getContext("webgl2", { alpha: true });
      if (!gl) { canGL = false; return false; }
      /* A software rasteriser is slower than the CSS it would replace, so a
         machine that gets here without a GPU should keep the stylesheet. */
      var dbg = gl.getExtension("WEBGL_debug_renderer_info");
      var r = dbg ? String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) || "") : "";
      var ext = gl.getExtension("WEBGL_lose_context");
      if (ext) ext.loseContext();
      canGL = !/swiftshader|software|basic render/i.test(r);
    } catch (e) { canGL = false; }
    return canGL;
  }

  /* ------------------------------------------------------------- 2. shaders */

  var VS = [
    "#version 300 es",
    "precision highp float;",
    "in vec2 a_pos;",
    "out vec2 v_uv;",
    "void main(){ v_uv = a_pos * 0.5 + 0.5; gl_Position = vec4(a_pos, 0.0, 1.0); }"
  ].join("\n");

  /* Draws one texture into one screen rectangle. `u_rect` is that rectangle in
     y-down CSS pixels, so a fragment decides whether it is inside and, if so,
     where in the source it came from. One program, every source. */
  var FS_BLIT = [
    "#version 300 es",
    "precision highp float;",
    "in vec2 v_uv;",
    "uniform sampler2D u_tex;",
    "uniform vec2 u_res;",    /* buffer size in device px */
    "uniform vec4 u_rect;",   /* left, top, w, h — device px, y down */
    "uniform vec4 u_crop;",   /* u0, v0, du, dv — source UV, y down */
    "uniform float u_alpha;",
    "out vec4 fragColor;",
    "void main(){",
    "  vec2 px = vec2(v_uv.x, 1.0 - v_uv.y) * u_res;",
    "  vec2 t = (px - u_rect.xy) / u_rect.zw;",
    "  if (t.x < 0.0 || t.x > 1.0 || t.y < 0.0 || t.y > 1.0) discard;",
    "  fragColor = vec4(texture(u_tex, u_crop.xy + t * u_crop.zw).rgb * u_alpha, 1.0);",
    "}"
  ].join("\n");

  var FS_SCRIM = [
    "#version 300 es",
    "precision highp float;",
    "in vec2 v_uv;",
    "uniform vec2 u_res;",
    "uniform vec4 u_rect;",   /* the region to darken — device px, y down */
    "uniform vec4 u_ax;",     /* 0 = across the width, 1 = down the height */
    "uniform float u_lo;",
    "uniform float u_hi;",
    "uniform vec3 u_col;",
    "out vec4 fragColor;",
    "void main(){",
    "  vec2 px = vec2(v_uv.x, 1.0 - v_uv.y) * u_res;",
    "  vec2 t = (px - u_rect.xy) / u_rect.zw;",
    "  float k = mix(t.x, t.y, u_ax.x);",
    "  if (k < 0.0 || k > 1.0) discard;",
    /* the two CSS gradients are linear in alpha across the section */
    "  float a = mix(u_lo, u_hi, clamp(k, 0.0, 1.0));",
    "  fragColor = vec4(mix(vec3(1.0), u_col, a), 1.0);",
    "}"
  ].join("\n");

  function FS_BLUR(vertical) {
    return [
      "#version 300 es",
      "precision highp float;",
      "#define MAXR " + BLUR_MAX,
      "in vec2 v_uv;",
      "uniform sampler2D u_prev;",
      "uniform vec2 u_res;",
      "uniform int u_radius;",
      "uniform float u_w[MAXR + 1];",
      "out vec4 fragColor;",
      "void main(){",
      "  vec2 s = vec2(" + (vertical ? "0.0, 1.0" : "1.0, 0.0") + ") / u_res;",
      "  vec4 c = texture(u_prev, v_uv) * u_w[0];",
      "  for (int i = 1; i <= MAXR; i++) {",
      "    if (i > u_radius) break;",
      "    c += texture(u_prev, v_uv + s * float(i)) * u_w[i];",
      "    c += texture(u_prev, v_uv - s * float(i)) * u_w[i];",
      "  }",
      "  fragColor = c;",
      "}"
    ].join("\n");
  }

  var FS_GLASS = [
    "#version 300 es",
    "precision highp float;",
    "#define PI 3.14159265359",
    "#define MAXS " + MAX_SHAPES,
    "const float N_R = 1.0 - 0.02;",
    "const float N_G = 1.0;",
    "const float N_B = 1.0 + 0.02;",
    "in vec2 v_uv;",
    "uniform sampler2D u_bg;",
    "uniform sampler2D u_blur;",
    "uniform vec2 u_res;",
    "uniform float u_dpr;",
    "uniform int u_count;",
    "uniform vec4 u_shape[MAXS];",   /* left, top, w, h — CSS px, y down */
    "uniform vec4 u_param[MAXS];",   /* radius, roundness, group, merge */
    "uniform float u_thick;",
    "uniform float u_dist;",
    "uniform float u_ior;",
    "uniform float u_disp;",
    "uniform float u_fresRange;",
    "uniform float u_fresHard;",
    "uniform float u_fresFactor;",
    "uniform float u_glareRange;",
    "uniform float u_glareHard;",
    "uniform float u_glareFactor;",
    "uniform float u_glareConv;",
    "uniform vec4 u_base[MAXS];",
    "uniform float u_reveal;",
    "uniform float u_blurMix;",
    "out vec4 fragColor;",

    /* --- sRGB <-> LCH, the studio's colour stack --- */
    "const vec3 D65 = vec3(0.95045592705, 1.0, 1.08905775076);",
    "const mat3 R2X = mat3(0.4124,0.3576,0.1805, 0.2126,0.7152,0.0722, 0.0193,0.1192,0.9505);",
    "const mat3 X2R = mat3(3.2406255,-1.537208,-0.4986286, -0.9689307,1.8757561,0.0415175, 0.0557101,-0.2040211,1.0569959);",
    "float uncomp(float a){ return a > 0.04045 ? pow((a+0.055)/1.055, 2.4) : a/12.92; }",
    "float comp(float a){ return a <= 0.0031308 ? 12.92*a : 1.055*pow(a, 0.41666666666) - 0.055; }",
    "float lf(float x){ return x > 0.00885645167 ? pow(x, 0.333333333) : 7.78703703704*x + 0.13793103448; }",
    "float ilf(float x){ return x > 0.206897 ? x*x*x : 0.12841854934*(x - 0.137931034); }",
    "vec3 SRGB_TO_LCH(vec3 s){",
    "  vec3 w = vec3(uncomp(s.r),uncomp(s.g),uncomp(s.b)) * R2X / D65;",
    "  vec3 f = vec3(lf(w.x), lf(w.y), lf(w.z));",
    "  vec3 lab = vec3(116.0*f.y - 16.0, 500.0*(f.x-f.y), 200.0*(f.y-f.z));",
    "  return vec3(lab.x, sqrt(dot(lab.yz,lab.yz)), atan(lab.z,lab.y)*57.2957795131);",
    "}",
    "vec3 LCH_TO_SRGB(vec3 l){",
    "  float h = l.z * 0.01745329251;",
    "  vec3 lab = vec3(l.x, l.y*cos(h), l.y*sin(h));",
    "  float fy = (lab.x+16.0)/116.0, fx = fy + lab.y/500.0, fz = fy - lab.z/200.0;",
    "  vec3 w = D65 * vec3(ilf(fx), ilf(fy), ilf(fz)) * X2R;",
    "  return vec3(comp(w.r), comp(w.g), comp(w.b));",
    "}",

    /* --- the field: a rounded rect per plate, fused inside a group --- */
    "float superCorner(vec2 p, float r, float n){ p = abs(p); return pow(pow(p.x,n)+pow(p.y,n), 1.0/n) - r; }",
    "float rrSDF(vec2 p, vec2 c, float w, float h, float cr, float n){",
    "  p -= c;",
    "  vec2 d = abs(p) - vec2(w, h) * 0.5;",
    "  float radius = min(cr, min(w, h) * 0.5);",
    "  if (d.x > -radius && d.y > -radius) {",
    "    vec2 cc = sign(p) * (vec2(w, h) * 0.5 - vec2(radius));",
    "    return superCorner(p - cc, radius, n);",
    "  }",
    "  return min(max(d.x, d.y), 0.0) + length(max(d, vec2(0.0)));",
    "}",
    "float smin(float a, float b, float k){",
    "  float h = clamp(0.5 + 0.5*(b-a)/k, 0.0, 1.0);",
    "  return mix(b, a, h) - k*h*(1.0-h);",
    "}",
    /* everything below is in scene space: one unit is the viewport height, the
       origin is the centre, y still runs down.
       This line used to be `(px - u_res) * 0.5 / u_res.y`, a space where one unit
       is *half* the viewport height. Every consumer disagrees with it:
       `aa = 1.2/u_res.y` asks for a 1.2 px feather, `e = 1.0/u_res.y` asks for a
       1 px gradient step, `nmerged = -merged * u_res.y` asks for device pixels,
       and `shortEdge` measures a plate in exactly that unit. So the field got a
       plate's position in one scale and its extents in another, twice as large:
       every plate was drawn at double its own size. Clipped to the pane that
       reads as a solid rectangle — the rounded ends of a pill fall outside the
       canvas, so there is no rim to light and no edge band to bend in, which is
       exactly the part a person calls liquid glass. */
    "vec2 scene(vec2 px){ return (px - u_res * 0.5) / u_res.y; }",
    "float shapeSDF(int i, vec2 p){",
    "  vec4 s = u_shape[i];",
    "  vec4 q = u_param[i];",
    "  vec2 c = scene(vec2(s.x + s.z*0.5, s.y + s.w*0.5) * u_dpr);",
    "  return rrSDF(p, c, s.z*u_dpr/u_res.y, s.w*u_dpr/u_res.y, q.x*u_dpr/u_res.y, max(q.y, 1.0));",
    "}",
    "float sceneSDF(vec2 p, out int hit){",
    "  float best = 1.0e9, d = 1.0e9, cur = -1.0;",
    "  float bd = 1.0e9; int bh = 0;",
    "  for (int i = 0; i < MAXS; i++) {",
    "    if (i >= u_count) break;",
    "    float di = shapeSDF(i, p);",
    "    if (di < bd) { bd = di; bh = i; }",
    "    if (u_param[i].z != cur) {",
    "      if (cur >= 0.0) best = min(best, d);",
    "      cur = u_param[i].z; d = di;",
    "    } else { d = smin(d, di, max(u_param[i].w, 0.001) * u_dpr / u_res.y); }",
    "  }",
    "  if (cur >= 0.0) best = min(best, d);",
    "  hit = bh;",
    "  return best;",
    "}",
    "float safeAsin(float x){ return asin(clamp(x, -1.0, 1.0)); }",
    "float ang(vec2 v){ float a = atan(v.y, v.x); return a < 0.0 ? a + 2.0*PI : a; }",
    "vec3 disp(sampler2D tex, vec2 uv, vec2 off, float k){",
    "  return vec3(",
    "    texture(tex, uv + off * (1.0 - (N_R - 1.0) * k)).r,",
    "    texture(tex, uv + off * (1.0 - (N_G - 1.0) * k)).g,",
    "    texture(tex, uv + off * (1.0 - (N_B - 1.0) * k)).b);",
    "}",
    "void main(){",
    /* the pass is scoped to the union box of the plates, so the pixel's device
       position comes from gl_FragCoord, not the quad's UV — the viewport window
       makes those two disagree. */
    "  vec2 dev = vec2(gl_FragCoord.x, u_res.y - gl_FragCoord.y);",
    "  vec2 uv = dev / u_res;",
    "  vec2 p = scene(dev);",
    "  int hit = 0; int sk = 0;",
    "  float merged = sceneSDF(p, hit);",
    "  float aa = 1.2 / u_res.y;",
    "  if (merged > aa) { fragColor = vec4(0.0); return; }",
    "  float nmerged = -merged * u_res.y;",
    /* every width the JS passes is in CSS px; the field is in device px */
    "  float thick = max(u_thick * u_dpr, 1.0);",
    "  float edgeH = clamp(nmerged / thick, 0.0, 1.0);",
    "",
    "  float xR = 1.0 - edgeH;",
    "  float thetaI = safeAsin(pow(clamp(xR, 0.0, 1.0), 2.0));",
    "  float thetaT = safeAsin(1.0 / u_ior * sin(thetaI));",
    "  float edgeFactor = edgeH >= 1.0 ? 0.0 : -1.0 * tan(thetaT - thetaI);",
    "",
    "  vec2 e = vec2(1.0 / u_res.y, 0.0);",
    "  vec2 grad = vec2(sceneSDF(p + e.xy, sk) - sceneSDF(p - e.xy, sk),",
    "                   sceneSDF(p + e.yx, sk) - sceneSDF(p - e.yx, sk));",
    "  vec2 normal = grad * 1.414213562 * 1000.0;",
    "  float nlen = clamp(length(normal), 0.0, 1.0);",
    "",
    /* the bend: u_dist is how far a rim pixel reaches in CSS px. Turn it into
       device px and then into UV, per axis, so the shift is isotropic. */
    "  float reach = u_dist * u_dpr;",
    "  vec2 shift = -normal * edgeFactor * reach / u_res;",
    /* The sharp buffer was filled by the source blit, whose texels run the other
       way up from the screen; the blurred pair is right way up because the blit
       is what made it. So the two samplers need opposite y. */
    "  vec3 sharp = disp(u_bg, vec2(uv.x, 1.0 - uv.y), vec2(shift.x, -shift.y), u_disp);",
    "  vec3 soft  = disp(u_blur, uv, shift, u_disp);",
    /* thickest at the rim, so that is where the backdrop frosts and bends */
    "  vec3 refr = mix(mix(soft, sharp, u_blurMix), sharp, 1.0 - edgeH);",
    /* the plate's own colour, laid over the bent backdrop at the material's
       own translucency. This is the fill the CSS plate used to be; the CSS one
       stays painted underneath, so a half-transparent pane here is the same
       glass sitting on the same page it replaced. */
    "  vec4 base = u_base[hit];",
    "  vec3 col = mix(refr, base.rgb, base.a);",
    "",
    "  float fres, gg;",
    /* The studio's edge field is written for panels that are a sizeable fraction
       of the viewport, and its falloff distance is fixed: with the constants at
       their shipped values the lit band is ~23 device px wide. This site's plates
       are nothing like that — the hero's location chip is 32 device px tall — so
       on a literal port the whole interior lands inside the band, `fres` and `gg`
       are 1.0 everywhere, and a dark charcoal pill over a night photograph comes
       out the colour of a mirror. The fix is one number, not a re-tune: measure
       the plate's own short edge and shrink the field proportionally when the
       plate is smaller than the reference, so a big panel keeps the studio's
       look exactly and a small one gets a thin, correct rim. It shipped as
       `min(1.0, …)`, which is 1.0 for every plate *under* the reference — a no-op
       for the only plates it was written for, so the mirror came through anyway. */
    "  float shortEdge = min(u_shape[hit].z, u_shape[hit].w) * u_dpr / u_res.y;",
    "  float edgeScale = max(1.0, 0.09 / max(shortEdge, 1.0e-4));",
    "  float m = merged * edgeScale;",
    "  fres = clamp(pow(1.0 + m * u_res.y / 1500.0 *",
    "    pow(500.0 / max(u_fresRange, 1.0), 2.0) + u_fresHard, 5.0), 0.0, 1.0);",
    "  vec3 fl = SRGB_TO_LCH(mix(vec3(1.0), base.rgb, base.a * 0.5));",
    "  fl.x = clamp(fl.x + 20.0 * fres * u_fresFactor, 0.0, 100.0);",
    "  col = mix(col, LCH_TO_SRGB(fl), fres * u_fresFactor * 0.7 * nlen);",
    "",
    "  gg = clamp(pow(1.0 + m * u_res.y / 1500.0 *",
    "    pow(500.0 / max(u_glareRange, 1.0), 2.0) + u_glareHard, 5.0), 0.0, 1.0);",
    "  float ga = (ang(normalize(normal + vec2(1.0e-6))) - PI / 4.0) * 2.0;",
    "  bool far = (ga > PI * 1.5 && ga < PI * 3.5) || ga < -PI * 0.5;",
    "  float glare = (0.5 + sin(ga) * 0.5) * (far ? 0.84 : 1.2) * u_glareFactor;",
    "  glare = clamp(pow(glare, 0.1 + u_glareConv * 2.0), 0.0, 1.0);",
    "  vec3 gL = SRGB_TO_LCH(mix(refr, base.rgb, base.a * 0.5));",
    "  gL.x = clamp(gL.x + 150.0 * glare * gg, 0.0, 120.0);",
    "  gL.y += 30.0 * glare * gg;",
    "  col = mix(col, LCH_TO_SRGB(gL), glare * gg * nlen);",
    "",
    /* the slider's 0 is this pass contributing nothing, which leaves the CSS
       plate exactly as it was; 100 is the whole material. Everything else in
       between is one number, so the glass cannot drift out of step with it. */
    "  float a = (1.0 - smoothstep(-aa, aa, merged)) * u_reveal;",
    "  fragColor = vec4(col * a, a);",   /* premultiplied: the canvas is premultiplied */
    "}"
  ].join("\n");

  /* ------------------------------------------------------------- 3. helpers */

  function compile(gl, type, src) {
    var s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      var m = gl.getShaderInfoLog(s);
      gl.deleteShader(s);
      throw new Error(m);
    }
    return s;
  }
  function link(gl, vsSrc, fsSrc) {
    var p = gl.createProgram();
    gl.attachShader(p, compile(gl, gl.VERTEX_SHADER, vsSrc));
    gl.attachShader(p, compile(gl, gl.FRAGMENT_SHADER, fsSrc));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
    var u = {};
    var n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS), i;
    for (i = 0; i < n; i++) {
      var info = gl.getActiveUniform(p, i);
      u[info.name.replace(/\[0\]$/, "")] = gl.getUniformLocation(p, info.name);
    }
    return { p: p, u: u };
  }
  function target(gl, w, h) {
    var tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    var fb = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return { tex: tex, fb: fb, w: w, h: h };
  }
  function drop(gl, t) {
    if (!t) return;
    gl.deleteTexture(t.tex);
    gl.deleteFramebuffer(t.fb);
  }

  /* object-fit: cover / contain + object-position, as a UV window. */
  function cropOf(natW, natH, boxW, boxH, fit, pos) {
    if (!natW || !natH || !boxW || !boxH) return [0, 0, 1, 1];
    var sr = natW / natH, br = boxW / boxH;
    var du, dv;
    if (fit === "contain") {
      if (br > sr) { dv = 1; du = br / sr; } else { du = 1; dv = sr / br; }
    } else if (fit === "fill" || !fit) {
      du = 1; dv = 1;
    } else {
      if (br > sr) { du = 1; dv = sr / br; } else { dv = 1; du = br / sr; }
    }
    var parts = String(pos || "50% 50%").split(/\s+/);
    function off(v, span) {
      if (v === "left" || v === "top") return 0;
      if (v === "right" || v === "bottom") return 1 - span;
      if (v && v.indexOf("%") > -1) return (parseFloat(v) / 100) * (1 - span);
      return 0.5 * (1 - span);
    }
    return [off(parts[0], du), off(parts[1] === undefined ? parts[0] : parts[1], dv), du, dv];
  }

  /* rgb()/rgba() off a computed style, straight to 0..1. The shader's texture
     samples are sRGB-encoded, so the plate colour goes in the same way — no
     conversion, or the fill would sit brighter than the page it replaced. */
  function parseColor(str, out) {
    var m = /rgba?\(([^)]+)\)/.exec(String(str || ""));
    if (!m) return false;
    var p = m[1].split(/[\s,\/]+/).filter(function (s) { return s.length; });
    var r = parseFloat(p[0]), g = parseFloat(p[1]), b = parseFloat(p[2]);
    if (isNaN(r) || isNaN(g) || isNaN(b)) return false;
    if (r > 1 || g > 1 || b > 1) { r /= 255; g /= 255; b /= 255; }
    out[0] = Math.max(0, Math.min(1, r));
    out[1] = Math.max(0, Math.min(1, g));
    out[2] = Math.max(0, Math.min(1, b));
    out[3] = p.length > 3 ? Math.max(0, Math.min(1, parseFloat(p[3]))) : 1;
    return true;
  }

  /* ------------------------------------------------------------- 4. the GL */

  function create() {
    /* Never attached to the document. It is a render target whose regions are
       copied into the per-plate panes, and a canvas in the tree would have to
       be z-indexed between a photograph and the words on top of it — which a
       <dialog>, a sticky bar and a hero's own stacking context make impossible
       to do without rewriting the page. Detached, it simply cannot cover
       anything. */
    var canvas = doc.createElement("canvas");
    var gl = canvas.getContext("webgl2", {
      alpha: true, premultipliedAlpha: true, antialias: false,
      depth: false, stencil: false, powerPreference: "low-power"
    });
    if (!gl) return null;

    var prBlit = link(gl, VS, FS_BLIT);
    var prScrim = link(gl, VS, FS_SCRIM);
    var prH = link(gl, VS, FS_BLUR(false));
    var prV = link(gl, VS, FS_BLUR(true));
    var prGlass = link(gl, VS, FS_GLASS);

    var vbo = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    var vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);

    var bg = null, bufA = null, bufB = null;
    var W = 0, H = 0, DPR = 1;
    var texCache = {};
    var weights = new Float32Array(BLUR_MAX + 1);
    var shapeData = new Float32Array(MAX_SHAPES * 4);
    var paramData = new Float32Array(MAX_SHAPES * 4);
    var baseData = new Float32Array(MAX_SHAPES * 4);
    var strength = 1;
    var live = false, raf = 0, panes = [], frameId = 0;

    function gauss(sigma, radius) {
      var sum = 0, i;
      for (i = 0; i <= radius; i++) {
        weights[i] = Math.exp(-(i * i) / (2 * sigma * sigma));
        sum += i === 0 ? weights[i] : weights[i] * 2;
      }
      for (i = 0; i <= radius; i++) weights[i] /= sum;
    }

    function textureFor(img) {
      var key = img.currentSrc || img.src || "";
      if (!key || !img.naturalWidth) return null;
      var t = texCache[key];
      if (t && t.stamp === img.src + "@" + img.naturalWidth && img.complete) return t.tex;
      if (!img.complete) return t ? t.tex : null;
      if (!t) { t = { tex: gl.createTexture() }; texCache[key] = t; }
      t.stamp = img.src + "@" + img.naturalWidth;
      gl.bindTexture(gl.TEXTURE_2D, t.tex);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
      try {
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, img);
      } catch (e) { return null; }
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      return t.tex;
    }

    function resize() {
      var vw = global.innerWidth, vh = global.innerHeight;
      var dpr = Math.min(global.devicePixelRatio || 1, 2);
      var w = Math.max(1, Math.round(vw * dpr)), h = Math.max(1, Math.round(vh * dpr));
      /* Two megapixels per pass is where a full-screen blur stops paying for
         itself on a phone; above that the buffer, not the maths, is the cost. */
      var budget = 2400000;
      if (w * h > budget) {
        var k = Math.sqrt(budget / (w * h));
        w = Math.max(1, Math.round(w * k));
        h = Math.max(1, Math.round(h * k));
        dpr *= k;
      }
      if (w === W && h === H) return false;
      W = w; H = h; DPR = dpr;
      canvas.width = w; canvas.height = h;
      drop(gl, bg); drop(gl, bufA); drop(gl, bufB);
      bg = target(gl, w, h);
      bufA = target(gl, Math.max(1, w >> 1), Math.max(1, h >> 1));
      bufB = target(gl, Math.max(1, w >> 1), Math.max(1, h >> 1));
      return true;
    }

    function visible(node, min) {
      if (!node || !node.isConnected) return null;
      var s = global.getComputedStyle(node);
      if (s.display === "none" || s.visibility === "hidden") return null;
      var op = parseFloat(s.opacity);
      if (op < 0.05) return null;
      var r = node.getBoundingClientRect();
      if (r.width < (min || 24) || r.height < (min || 24)) return null;
      if (r.bottom < 0 || r.top > global.innerHeight || r.right < 0 || r.left > global.innerWidth) return null;
      return { r: r, s: s, op: op };
    }

    function fullscreen(prog) {
      gl.useProgram(prog.p);
      gl.bindVertexArray(vao);
      gl.uniform2f(prog.u.u_res, W, H);
    }

    function drawBackdrop() {
      gl.bindFramebuffer(gl.FRAMEBUFFER, bg.fb);
      gl.viewport(0, 0, W, H);
      gl.disable(gl.BLEND);
      /* the page's own cream ground, so a plate over nothing tints cream */
      gl.clearColor(0.968, 0.953, 0.937, 1);
      gl.clear(gl.COLOR_BUFFER_BIT);

      var i, nodes, hit, n = 0;
      for (i = 0; i < SOURCES.length && n < MAX_SOURCES; i++) {
        nodes = doc.querySelectorAll(SOURCES[i]);
        for (var j = 0; j < nodes.length && n < MAX_SOURCES; j++) {
          hit = visible(nodes[j], 40);
          if (!hit) continue;
          var tex = textureFor(nodes[j]);
          if (!tex) continue;
          var crop = cropOf(nodes[j].naturalWidth, nodes[j].naturalHeight,
            hit.r.width, hit.r.height, hit.s.objectFit, hit.s.objectPosition);
          fullscreen(prBlit);
          gl.enable(gl.BLEND);
          gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
          gl.activeTexture(gl.TEXTURE0);
          gl.bindTexture(gl.TEXTURE_2D, tex);
          gl.uniform1i(prBlit.u.u_tex, 0);
          gl.uniform4f(prBlit.u.u_rect, hit.r.left * DPR, hit.r.top * DPR, hit.r.width * DPR, hit.r.height * DPR);
          gl.uniform4f(prBlit.u.u_crop, crop[0], crop[1], crop[2], crop[3]);
          gl.uniform1f(prBlit.u.u_alpha, hit.op);
          gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
          n++;
        }
      }
      drawScrims();
      gl.bindVertexArray(null);
    }

    /* .hero::after lays two charcoal gradients over the photograph. They are
       part of what the glass sits on, so the buffer has to carry them too or
       the plate reads brighter than the picture behind it. */
    function drawScrims() {
      var host = doc.querySelector(".hero");
      var hit = visible(host, 40);
      if (!hit) return;
      var rect = [hit.r.left * DPR, hit.r.top * DPR, hit.r.width * DPR, hit.r.height * DPR];
      gl.bindVertexArray(vao);
      gl.useProgram(prScrim.p);
      gl.uniform2f(prScrim.u.u_res, W, H);
      gl.uniform3f(prScrim.u.u_col, 0.106, 0.102, 0.094);
      gl.uniform4f(prScrim.u.u_rect, rect[0], rect[1], rect[2], rect[3]);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ZERO, gl.SRC_COLOR);   /* multiply: the plate darkens with the photo */
      /* across: the CSS ramp is .94 at the left falling to .16 at three quarters */
      gl.uniform4f(prScrim.u.u_ax, 0, 0, 0, 0);
      gl.uniform1f(prScrim.u.u_lo, 0.94);
      gl.uniform1f(prScrim.u.u_hi, 0.20);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      /* down: .86 at the bottom, .22 at the top */
      gl.uniform4f(prScrim.u.u_ax, 1, 0, 0, 0);
      gl.uniform1f(prScrim.u.u_lo, 0.22);
      gl.uniform1f(prScrim.u.u_hi, 0.86);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      gl.bindVertexArray(null);
    }

    function blurPass(radiusPx) {
      var radius = Math.max(1, Math.min(BLUR_MAX, Math.round(radiusPx / 2)));
      gl.disable(gl.BLEND);
      gl.bindVertexArray(vao);

      gl.bindFramebuffer(gl.FRAMEBUFFER, bufA.fb);
      gl.viewport(0, 0, bufA.w, bufA.h);
      fullscreen(prBlit);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, bg.tex);
      gl.uniform1i(prBlit.u.u_tex, 0);
      gl.uniform4f(prBlit.u.u_rect, 0, 0, W, H);
      gl.uniform4f(prBlit.u.u_crop, 0, 0, 1, 1);
      gl.uniform1f(prBlit.u.u_alpha, 1);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

      gauss(Math.max(0.8, radiusPx / 3), radius);

      gl.bindFramebuffer(gl.FRAMEBUFFER, bufB.fb);
      gl.viewport(0, 0, bufB.w, bufB.h);
      gl.useProgram(prH.p);
      gl.bindVertexArray(vao);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, bufA.tex);
      gl.uniform1i(prH.u.u_prev, 0);
      gl.uniform2f(prH.u.u_res, bufB.w, bufB.h);
      gl.uniform1i(prH.u.u_radius, radius);
      gl.uniform1fv(prH.u.u_w, weights);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

      gl.bindFramebuffer(gl.FRAMEBUFFER, bufA.fb);
      gl.viewport(0, 0, bufA.w, bufA.h);
      gl.useProgram(prV.p);
      gl.bindVertexArray(vao);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, bufB.tex);
      gl.uniform1i(prV.u.u_prev, 0);
      gl.uniform2f(prV.u.u_res, bufA.w, bufA.h);
      gl.uniform1i(prV.u.u_radius, radius);
      gl.uniform1fv(prV.u.u_w, weights);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

      gl.bindVertexArray(null);
      return bufA;
    }

    /* Plates the shader paints. Only surfaces whose backdrop this file can
       actually rebuild: a photograph, the hero's scrims, the cream ground.
       Chrome is deliberately not here. A sticky bar floats over live text, and
       WebGL cannot read the composited page — the bent image would show cream
       where a heading just slid under the bar, and the words would vanish.
       Those plates keep the SVG displacement lens in liquid-glass.css, which
       bends the real backdrop through backdrop-filter and is driven by the same
       slider. `fill` is the material's own opacity when the page's CSS gives the
       plate a solid colour, which would otherwise look like no glass at all. */
    var HOSTS = [
      /* `min` is a floor on the plate's own fill. The float card is the one
         shader plate a person reads — a heading, a coordinate, a caveat — and
         at the CSS plate's own .7 the bent illustration underneath pulled its
         two small lines to 4.39:1, just under AA. The chip and the caption are
         one short line each and pass at their own fill, so the floor is here
         rather than global: the surface you read from keeps more of itself.

         `.statcard` (the three hero counters) is deliberately NOT here, even
         though it is light glass over a photograph and looks like the best
         candidate on the page. Measured with tools/panes.mjs: as soon as the
         three white cards join the plate list, the dark `.hero__chip` sharing
         the frame comes out of the pass at rgb(236,234,233) instead of
         rgb(51,50,47) — its ivory "PIN 756127" text lands on a white pill at
         1.08:1, and at 375 that is what a person on a phone sees. The uniforms
         for the chip are identical in both runs (same rect, same charcoal base,
         same window box), so the mis-colouring is in the shared backdrop
         buffer, not in the plate table, and it is a bug to fix rather than a
         value to tune. Until then the cards keep the stylesheet's frost, fill
         and rim, which `--lg-s` drives like everything else. */
      { sel: ".floatcard", fill: 0.7, min: 0.84 },
      { sel: ".hero__chip", fill: 0.76 },
      { sel: ".shot__note", fill: 0.76 }
    ];
    var SOURCES = [".hero__media img", ".pageshot img", ".shot img", "img[data-glass-bg]"];

    var rgb = [0, 0, 0, 1];

    /* One pane per plate: a canvas that sits inside the host, above its own
       background and below its content. That is the only way a WebGL layer can
       live under a heading without touching the page's stacking order — and it
       travels with the element wherever it lands, including a dialog's top
       layer, which a page-wide overlay canvas could never reach. */
    function paneFor(node) {
      var p = node.__lgPane;
      if (p && p.parentNode === node) return p;
      p = doc.createElement("canvas");
      p.className = "lg-gl-pane";
      p.setAttribute("aria-hidden", "true");
      node.insertBefore(p, node.firstChild);
      node.__lgPane = p;
      if (global.getComputedStyle(node).position === "static") node.style.position = "relative";
      node.setAttribute("data-gl-host", "1");
      return p;
    }

    function dropPane(node) {
      var p = node.__lgPane;
      if (p && p.parentNode) p.parentNode.removeChild(p);
      node.__lgPane = null;
      node.removeAttribute("data-gl-host");
      node.removeAttribute("data-gl-painted");
      node.style.position = "";
    }

    /* A plate over a flat page has nothing to bend — the shader would spend a
       whole pass repainting cream, and the result would look like the CSS it
       replaced. So a host only gets a pane where one of the registered picture
       layers actually sits underneath it. Everywhere else the frost, the fill
       and the SVG lens stay in charge, which is the honest material for a card
       in the middle of a page rather than a claim of refraction with nothing
       refracted. This is also what keeps index.html and admin.html reporting
       `idle` instead of painting glass over a colour. */
    function overPicture(r) {
      var i, j, nodes, n, b;
      for (i = 0; i < SOURCES.length; i++) {
        nodes = doc.querySelectorAll(SOURCES[i]);
        for (j = 0; j < nodes.length; j++) {
          n = nodes[j];
          if (!n.complete || !n.naturalWidth || !n.getBoundingClientRect) continue;
          b = n.getBoundingClientRect();
          if (b.width < 8 || b.height < 8) continue;
          if (b.right > r.left && b.left < r.right &&
            b.bottom > r.top && b.top < r.bottom) return true;
        }
      }
      return false;
    }

    function collect() {
      frameId++;
      var found = [], i, j, nodes, hit;
      for (i = 0; i < HOSTS.length; i++) {
        nodes = doc.querySelectorAll(HOSTS[i].sel);
        for (j = 0; j < nodes.length; j++) {
          hit = visible(nodes[j]);
          if (hit && overPicture(hit.r)) {
            found.push({ host: i, node: nodes[j], r: hit.r, s: hit.s, a: hit.r.width * hit.r.height });
          }
        }
      }
      found.sort(function (x, y) { return y.a - x.a; });
      var n = Math.min(found.length, MAX_SHAPES);
      found.length = n;
      var group = 0, lastHost = -1;
      for (i = 0; i < n; i++) {
        var f = found[i], h = HOSTS[f.host];
        if (h.merge) { if (f.host !== lastHost) group++; }
        else group = 100 + i;
        lastHost = f.host;
        shapeData[i * 4] = f.r.left;
        shapeData[i * 4 + 1] = f.r.top;
        shapeData[i * 4 + 2] = f.r.width;
        shapeData[i * 4 + 3] = f.r.height;
        var rad = parseFloat(f.s.borderTopLeftRadius);
        paramData[i * 4] = (isNaN(rad) ? 12 : rad) + 3;
        paramData[i * 4 + 1] = 2.4;
        paramData[i * 4 + 2] = group;
        paramData[i * 4 + 3] = h.merge || 0;
        var a = 0.72;
        if (parseColor(f.s.backgroundColor, rgb)) a = rgb[3] > 0.985 ? (h.fill || 0.72) : rgb[3];
        if (h.min && a < h.min) a = h.min;
        baseData[i * 4] = rgb[0]; baseData[i * 4 + 1] = rgb[1];
        baseData[i * 4 + 2] = rgb[2]; baseData[i * 4 + 3] = a;
        f.pane = paneFor(found[i].node);
        f.pane.__stamp = frameId;
        found[i].node.setAttribute("data-gl-painted", "1");
      }
      /* a plate that scrolled away keeps no stale glass behind it */
      for (i = 0; i < panes.length;) {
        var nd = panes[i];
        if (nd.__lgPane && nd.__lgPane.__stamp === frameId && nd.isConnected) { i++; continue; }
        if (nd.__lgPane) dropPane(nd);
        panes.splice(i, 1);
      }
      for (i = 0; i < n; i++) if (panes.indexOf(found[i].node) < 0) panes.push(found[i].node);
      return found;
    }

    /* device px per CSS px, after the buffer budget in resize() */
    function scale() { return { x: W / (global.innerWidth || 1), y: H / (global.innerHeight || 1) }; }

    function blit(found) {
      var sc = scale(), i;
      for (i = 0; i < found.length; i++) {
        var f = found[i], pane = f.pane;
        var pw = Math.max(1, Math.round(f.r.width * sc.x));
        var ph = Math.max(1, Math.round(f.r.height * sc.y));
        if (pane.width !== pw || pane.height !== ph) { pane.width = pw; pane.height = ph; }
        var ctx = pane.__ctx || (pane.__ctx = pane.getContext("2d"));
        if (!ctx) continue;
        ctx.globalCompositeOperation = "copy";
        ctx.drawImage(canvas,
          Math.round(f.r.left * sc.x), Math.round(f.r.top * sc.y), pw, ph,
          0, 0, pw, ph);
      }
    }

    function frame() {
      raf = 0;
      if (!live) return;
      resize();
      var found = collect();
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.disable(gl.SCISSOR_TEST);
      gl.viewport(0, 0, W, H);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      if (!found.length) { html.setAttribute("data-glass-gl", "idle"); return; }

      var s = strength;
      drawBackdrop();
      var blurred = blurPass(3 + 30 * s);

      /* The plates are scattered across the page; the pass is limited to their
         union box instead of the whole viewport. On a phone that is the
         difference between an idle frame and one you can feel. */
      var sc = scale();
      var x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity, i;
      for (i = 0; i < found.length; i++) {
        var r = found[i].r;
        if (r.left < x0) x0 = r.left;
        if (r.top < y0) y0 = r.top;
        if (r.left + r.width > x1) x1 = r.left + r.width;
        if (r.top + r.height > y1) y1 = r.top + r.height;
      }
      var bx = Math.max(0, Math.floor(x0 * sc.x) - 2);
      var by = Math.max(0, Math.floor((global.innerHeight - y1) * sc.y) - 2);
      var bw = Math.min(W - bx, Math.ceil((x1 - x0) * sc.x) + 4);
      var bh = Math.min(H - by, Math.ceil((y1 - y0) * sc.y) + 4);
      if (bw < 1 || bh < 1) return;

      gl.enable(gl.SCISSOR_TEST);
      gl.scissor(bx, by, bw, bh);
      gl.viewport(bx, by, bw, bh);
      /* blurPass leaves the half-scale blur buffer bound. Without this the glass
         would render into it and the canvas would stay the clear colour — a
         transparent page of glass and not one pixel of it painted. */
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      gl.useProgram(prGlass.p);
      gl.bindVertexArray(vao);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, bg.tex); gl.uniform1i(prGlass.u.u_bg, 0);
      gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, blurred.tex); gl.uniform1i(prGlass.u.u_blur, 1);
      gl.uniform2f(prGlass.u.u_res, W, H);
      gl.uniform1f(prGlass.u.u_dpr, DPR);
      gl.uniform1i(prGlass.u.u_count, found.length);
      gl.uniform4fv(prGlass.u.u_shape, shapeData);
      gl.uniform4fv(prGlass.u.u_param, paramData);
      gl.uniform4fv(prGlass.u.u_base, baseData);
      gl.uniform1f(prGlass.u.u_reveal, s);
      gl.uniform1f(prGlass.u.u_thick, 10 + 26 * s);
      gl.uniform1f(prGlass.u.u_dist, 2 + 20 * s);
      gl.uniform1f(prGlass.u.u_ior, 1.45 + 0.35 * s);
      gl.uniform1f(prGlass.u.u_disp, 0.5 + 2.0 * s);
      gl.uniform1f(prGlass.u.u_fresRange, 120 - 70 * s);
      gl.uniform1f(prGlass.u.u_fresHard, 0.30 + 0.22 * s);
      gl.uniform1f(prGlass.u.u_fresFactor, 0.22 + 0.5 * s);
      gl.uniform1f(prGlass.u.u_glareRange, 110 - 60 * s);
      gl.uniform1f(prGlass.u.u_glareHard, 0.26 + 0.2 * s);
      gl.uniform1f(prGlass.u.u_glareFactor, 0.18 + 0.55 * s);
      gl.uniform1f(prGlass.u.u_glareConv, 0.30 + 0.35 * s);
      gl.uniform1f(prGlass.u.u_blurMix, 0.30 + 0.5 * s);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      gl.disable(gl.SCISSOR_TEST);
      gl.bindVertexArray(null);
      blit(found);
      html.setAttribute("data-glass-gl", "live");
    }

    function request() {
      if (raf || !live) return;
      raf = global.requestAnimationFrame(frame);
    }

    function onResize() { W = 0; request(); }

    /* Coming back to the tab has to resume the pass on its own. The first cut of
       this asked whether a tier attribute still said "gl", which is a value no
       tier on either site has ever held, so a visitor who switched tabs and came
       back got CSS glass until they happened to move the slider. `mounted` is the
       only honest question: this file was told to run and has not been told to
       stop. */
    var mounted = false;

    function onVisibility() {
      if (doc.hidden) { live = false; return; }
      if (mounted) { live = true; request(); }
    }

    var ro = null;

    /* The pass is a snapshot of the page, so it has to be retaken when the page
       changes underneath it, and neither scroll nor resize says that. Three
       things do: a photograph that finishes loading after the plate over it was
       already drawn, which is the ordinary case on a phone where the grid is
       lazy; a control that re-renders its plates, so the nodes carrying panes
       are brand new; and a plate the page closes up, whose pane must go.
       Everything lands on `request`, which is a coalesced no-op when a frame is
       already queued, and the attribute list deliberately excludes the `data-gl-*`
       names this file writes itself, so observing cannot feed on observing. */
    var mo = null;

    function onImageLoad(e) {
      var t = e.target;
      if (t && t.tagName === "IMG") request();
    }

    /* A plate's fill is read from the stylesheet at frame time, so a value that is
       still animating is read wrong and then kept: switch the tier, and the frame
       scheduled by the attribute change sees the colour the plate is *leaving*,
       not the one it settles on — measured on the Housing Baazaar port, where that
       left a pill holding the previous theme's glass for the rest of the visit.
       `transitionend` is the moment the number being read stops moving. Capture
       phase because a plate is anywhere in the tree, and `request` coalesces the
       burst a multi-property transition makes; a hover that ends costs one idle
       frame, which is what it is worth. */
    function onTransitionEnd() { request(); }

    function mount() {
      if (!doc.body) return false;
      live = true;
      mounted = true;
      global.addEventListener("scroll", request, true);
      global.addEventListener("resize", onResize);
      global.addEventListener("load", onImageLoad, true);
      global.addEventListener("transitionend", onTransitionEnd, true);
      doc.addEventListener("visibilitychange", onVisibility);
      if (global.ResizeObserver && !ro) {
        ro = new ResizeObserver(function () { request(); });
      }
      if (ro) {
        var i, nodes;
        for (i = 0; i < HOSTS.length; i++) {
          nodes = doc.querySelectorAll(HOSTS[i].sel);
          for (var j = 0; j < nodes.length; j++) ro.observe(nodes[j]);
        }
      }
      if (global.MutationObserver && !mo) {
        mo = new MutationObserver(request);
        mo.observe(doc.body, {
          childList: true,
          subtree: true,
          attributes: true,
          attributeFilter: ["class", "aria-pressed", "aria-selected", "hidden", "disabled", "src"]
        });
        /* `<html>` sits above the subtree that was just watched, and it is where
           both numbers this pass reads are written: `data-glass` for the tier and
           the inline `--lg-s` for the strength. The strength has its own callback,
           but a plate's fill comes out of the stylesheet at the moment the frame
           runs, so the pass that repaints when the root changes is the pass that
           cannot be left holding a previous state. */
        mo.observe(html, {
          attributes: true,
          attributeFilter: ["data-glass", "style"]
        });
      }
      request();
      return true;
    }

    function unmount() {
      live = false;
      mounted = false;
      if (raf) { global.cancelAnimationFrame(raf); raf = 0; }
      global.removeEventListener("scroll", request, true);
      global.removeEventListener("resize", onResize);
      global.removeEventListener("load", onImageLoad, true);
      global.removeEventListener("transitionend", onTransitionEnd, true);
      doc.removeEventListener("visibilitychange", onVisibility);
      if (ro) { ro.disconnect(); }
      if (mo) { mo.disconnect(); mo = null; }
      html.removeAttribute("data-glass-gl");
      for (var i = 0; i < panes.length; i++) dropPane(panes[i]);
      panes.length = 0;
    }

    /* A driver that takes the context away mid-visit must not leave the page
       with transparent plates: the stylesheet takes the glass back and the
       layer elects a tier again without this file. */
    canvas.addEventListener("webglcontextlost", function (e) {
      e.preventDefault();
      unmount();
      if (global.LgGL) { global.LgGL.broken = true; global.LgGL.failed(); }
    });

    return {
      mount: mount, unmount: unmount, invalidate: request,
      setStrength: function (v) { strength = Math.max(0, Math.min(1, v)); request(); },
      isLive: function () { return live; }
    };
  }

  /* ------------------------------------------------------- 5. public surface */

  var renderer = null;

  global.LgGL = {
    supported: supported,
    broken: false,
    /* set by liquid-glass.js so a lost context can ask for a new tier */
    onFailed: null,
    failed: function () { if (this.onFailed) this.onFailed(); },
    ensure: function () {
      if (this.broken) return null;
      if (!renderer) {
        try { renderer = create(); } catch (e) {
          /* the shader's own words are the only way a compile failure on a card
             nobody has here can ever be read; harmless to keep, never painted */
          renderer = null;
          this.broken = true;
          this.error = (e && e.message) || String(e);
        }
      }
      if (!renderer) this.broken = true;
      return renderer;
    },
    start: function (s) {
      var r = this.ensure();
      if (!r) return false;
      var ok = r.mount();
      if (ok) r.setStrength(typeof s === "number" ? s : 1);
      return ok;
    },
    stop: function () { if (renderer) renderer.unmount(); },
    strength: function (v) { if (renderer) renderer.setStrength(v); },
    invalidate: function () { if (renderer) renderer.invalidate(); }
  };
})(window);
