/* ==========================================================================
   Opening animation: a hanging market signboard swings in and reveals the
   name ICHHAPUR, then lifts away.

   Guarded three ways so it never stands between a visitor and the page:
     • prefers-reduced-motion  -> not shown at all
     • no preserve-3d / weak device -> flat 2D fade instead of the 3D scene
     • already seen this session  -> not shown again (?intro=play and the
                                     footer link force it)
   Any scroll, wheel, touch, click, or Escape dismisses it immediately.
   The board itself is aria-hidden; the page's real <h1> is in the hero and is
   never covered for assistive tech.
   ========================================================================== */
(function () {
  "use strict";

  var KEY = "ichhapur.intro.seen";
  var HOLD_MS = 720;     /* pause after the settle before lifting away */
  var SWING_MS = 1500;   /* must match sign-swing duration in styles.css */

  var overlay = document.getElementById("intro");
  var skip = document.getElementById("introSkip");
  var params = new URLSearchParams(location.search);

  if (!overlay || !skip) return;

  function reducedMotion() {
    return window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }

  function supports3d() {
    if (window.CSS && CSS.supports) {
      return CSS.supports("transform-style", "preserve-3d") && CSS.supports("perspective", "900px");
    }
    return "perspective" in document.documentElement.style;
  }

  function weakDevice() {
    var cores = navigator.hardwareConcurrency;
    var ram = navigator.deviceMemory;
    return (cores && cores <= 2) || (ram && ram <= 2);
  }

  function alreadySeen() {
    if (params.get("intro") === "play" || params.get("intro") === "replay") return false;
    try { return window.localStorage.getItem(KEY) === "1"; } catch (e) { return false; }
  }

  function play() {
    if (!supports3d() || weakDevice()) overlay.classList.add("is-flat");
    overlay.hidden = false;

    var auto = SWING_MS + HOLD_MS;
    if (overlay.classList.contains("is-flat")) auto = 1300;

    var timer = setTimeout(dismiss, auto);
    skip.addEventListener("click", function () { clearTimeout(timer); dismiss(); });

    ["wheel", "touchstart", "keydown"].forEach(function (ev) {
      overlay.addEventListener(ev, function (e) {
        if (ev === "keydown" && e.key !== "Escape" && e.key !== "Enter" && e.key !== " ") return;
        clearTimeout(timer);
        dismiss();
      }, { passive: true, once: true });
    });

    /* keep the skip control reachable first for keyboard visitors */
    skip.focus({ preventScroll: true });
  }

  function dismiss() {
    if (overlay.classList.contains("is-out")) return;
    overlay.classList.add("is-out");
    try { window.localStorage.setItem(KEY, "1"); } catch (e) { /* private mode: fine */ }
    setTimeout(function () {
      overlay.hidden = true;
      /* hand focus back to the page's own content */
      var h1 = document.querySelector(".hero__title");
      if (h1) {
        h1.setAttribute("tabindex", "-1");
        h1.focus({ preventScroll: true });
      }
    }, 480);
  }

  /* footer "replay" link */
  document.addEventListener("click", function (e) {
    var btn = e.target && e.target.closest ? e.target.closest("#replayIntro") : null;
    if (!btn) return;
    e.preventDefault();
    overlay.classList.remove("is-out", "is-flat");
    if (!supports3d() || weakDevice()) overlay.classList.add("is-flat");
    overlay.hidden = false;
    var auto = overlay.classList.contains("is-flat") ? 1300 : SWING_MS + HOLD_MS;
    setTimeout(dismiss, auto);
    /* restart the keyframes */
    var sign = document.getElementById("introSign");
    if (sign) {
      sign.style.animation = "none";
      void sign.offsetWidth;
      sign.style.animation = "";
    }
    window.scrollTo({ top: 0, behavior: reducedMotion() ? "auto" : "smooth" });
  });

  function start() {
    if (reducedMotion() || alreadySeen()) {
      overlay.hidden = true;
      return;
    }
    play();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start);
  } else {
    start();
  }
})();
