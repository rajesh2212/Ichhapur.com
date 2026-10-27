/* ============================================================================
   ICHHAPUR Market — shared data layer
   ----------------------------------------------------------------------------
   Both public pages and the admin panel read the directory through this file.

   Two sources of truth, merged:
     1. data/stores.js  — the shipped list (window.MARKET_DATA). What visitors
                          see when nothing has been edited locally.
     2. localStorage    — the working list the admin panel writes on this
                          browser only. It is NOT a server: nobody else sees it.

   That split is deliberate. Until the site is hosted with a real database,
   "synchronisation" means: the admin tab saves, and every other tab of this
   browser on this machine re-renders immediately (the `storage` event).
   Nothing reaches a visitor on another device. The admin panel says so.

   Photos are stored as data URLs inside the same localStorage record, which is
   why there is a byte ceiling — browsers cap a site at roughly 5 MB.
   ========================================================================= */
(function (global) {
  "use strict";

  var KEY = "ichhapur.working.v1";
  var MAX_BYTES = 3.6 * 1024 * 1024;

  /* ---------------------------------------------------------------- storage */
  function readRaw() {
    try { return global.localStorage.getItem(KEY); } catch (e) { return null; }
  }

  function parse(raw) {
    if (!raw) return null;
    try {
      var obj = JSON.parse(raw);
      if (!obj || !Array.isArray(obj.stores) || !Array.isArray(obj.categories)) return null;
      return obj;
    } catch (e) { return null; }
  }

  function write(obj) {
    var raw;
    try { raw = JSON.stringify(obj); } catch (e) { return { ok: false, error: "bad" }; }
    if (raw.length > MAX_BYTES) {
      return { ok: false, error: "full", used: raw.length, cap: MAX_BYTES };
    }
    try {
      global.localStorage.setItem(KEY, raw);
    } catch (e) {
      return { ok: false, error: "full", used: raw.length, cap: MAX_BYTES };
    }
    return { ok: true, bytes: raw.length };
  }

  /* -------------------------------------------------------------- base copy */
  var baseCache = null;

  function base() {
    if (baseCache) return baseCache;
    var src = global.MARKET_DATA;
    if (!src || !Array.isArray(src.stores)) return null;
    try { baseCache = JSON.parse(JSON.stringify(src)); } catch (e) { return null; }
    return baseCache;
  }

  /* ------------------------------------------------------------------ merge */
  function get() {
    var local = parse(readRaw());
    if (local) {
      local.local = true;
      return local;
    }
    var b = base();
    if (!b) return null;
    return {
      market: b.market,
      categories: b.categories,
      stores: b.stores,
      savedAt: null,
      local: false
    };
  }

  function save(next) {
    var b = base();
    var record = {
      savedAt: new Date().toISOString(),
      market: (next && next.market) || (b && b.market),
      categories: (next && next.categories) || (b && b.categories),
      stores: (next && next.stores) || []
    };
    var res = write(record);
    if (res.ok) fire();
    return res;
  }

  function reset() {
    try { global.localStorage.removeItem(KEY); } catch (e) { /* nothing to clear */ }
    fire();
    return get();
  }

  function exportJson() {
    var cur = get();
    if (!cur) return null;
    return JSON.stringify({
      exportedAt: new Date().toISOString(),
      market: cur.market,
      categories: cur.categories,
      stores: cur.stores
    }, null, 2);
  }

  /* ------------------------------------------------------------------- sync */
  var listeners = [];

  function onChange(fn) { if (typeof fn === "function") listeners.push(fn); }

  function fire() {
    for (var i = 0; i < listeners.length; i++) {
      try { listeners[i](get()); } catch (e) { /* one bad listener must not stop the rest */ }
    }
  }

  try {
    global.addEventListener("storage", function (e) {
      if (e.key === KEY) fire();
    });
  } catch (e) { /* no addEventListener — the pages still load the data once */ }

  /* ------------------------------------------------------------------ utils */
  var R_EARTH = 6371;

  function distanceKm(a, b) {
    if (!a || !b) return null;
    var rad = function (d) { return d * Math.PI / 180; };
    var dLat = rad(b.lat - a.lat);
    var dLng = rad(b.lng - a.lng);
    var s = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) *
            Math.sin(dLng / 2) * Math.sin(dLng / 2);
    return R_EARTH * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
  }

  function formatDistance(km) {
    if (km == null || isNaN(km)) return null;
    if (km < 1) return Math.round(km * 1000) + " m";
    if (km < 10) return km.toFixed(1) + " km";
    return Math.round(km) + " km";
  }

  function mapsDirUrl(c) {
    if (!c) return null;
    return "https://www.google.com/maps/dir/?api=1&destination=" + c.lat + "," + c.lng;
  }

  function needsConfirmation(store) { return store.status !== "listed"; }

  function catLabel(categories, id) {
    var list = categories || [];
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i].label;
    return "Other";
  }

  /* One drawing per trade. It stands for the *kind* of shop and is never
     presented as a picture of the shop itself. */
  var TRADE_ART = {
    medicines: "assets/img/trade/medicines.svg",
    mobile: "assets/img/trade/mobile.svg",
    general: "assets/img/trade/general.svg",
    market: "assets/img/trade/market.svg",
    service: "assets/img/trade/service.svg"
  };

  function artFor(category) { return TRADE_ART[category] || null; }

  /* A photograph supplied for a listing wins over the stand-in drawing. */
  function thumb(store, cls, lazy) {
    var src = store.photo || artFor(store.category);
    if (!src) return null;
    var img = document.createElement("img");
    img.className = cls + (store.photo ? " " + cls + "--photo" : "");
    img.src = src;
    img.width = 640;
    img.height = 360;
    img.loading = lazy === false ? "eager" : "lazy";
    img.decoding = "async";
    /* The category badge already names the trade, so the drawing is decorative
       for screen readers; a supplied photograph needs its own description. */
    img.alt = store.photo ? (store.photoAlt || store.name) : "";
    return img;
  }

  function slug(text) {
    return String(text || "").toLowerCase()
      .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48);
  }

  /* Owners work from a map link, not from decimal degrees. Pull the marker out
     of the common URL shapes so "paste the shop's map link" is a real option.
     In a Google `data=` string the pair is `!2d<lng>!3d<lat>` — the reverse of
     every other form here, so it gets its own ordered pattern. */
  var NUM = "(-?\\d{1,3}\\.\\d{3,})";
  var MAP_PATTERNS = [
    { re: new RegExp("[?&]destination=" + NUM + "%2C" + NUM), lngFirst: false },
    { re: new RegExp("[?&]destination=" + NUM + "," + NUM), lngFirst: false },
    { re: new RegExp("[?&]query=" + NUM + "," + NUM), lngFirst: false },
    { re: new RegExp("!2d" + NUM + "!3d" + NUM), lngFirst: true },
    { re: new RegExp("[?&]q=" + NUM + "," + NUM), lngFirst: false },
    { re: new RegExp("[?&]ll=" + NUM + "," + NUM), lngFirst: false },
    { re: new RegExp("[?&]mlat=" + NUM + "&mlon=" + NUM), lngFirst: false },
    { re: new RegExp("@(-?\\d+\\.\\d+),(-?\\d+\\.\\d+)"), lngFirst: false }
  ];

  function parseMaps(input) {
    var text = String(input || "").trim();
    if (!text) return null;
    var direct = new RegExp("^" + NUM + "[,\\s]+" + NUM + "$").exec(text);
    if (direct) return { lat: +direct[1], lng: +direct[2] };
    for (var i = 0; i < MAP_PATTERNS.length; i++) {
      var m = MAP_PATTERNS[i].re.exec(text);
      if (!m) continue;
      var a = parseFloat(m[1]), b = parseFloat(m[2]);
      var pair = MAP_PATTERNS[i].lngFirst ? { lat: b, lng: a } : { lat: a, lng: b };
      if (Math.abs(pair.lat) <= 90 && Math.abs(pair.lng) <= 180) return pair;
    }
    return null;
  }

  function blankStore() {
    return {
      id: "", name: "", category: "general", status: "needs-confirmation",
      locality: "", addressLine: "", coordinates: null, coordinatesLabel: null,
      phone: null, hours: null, description: "", keywords: [], note: "",
      sources: [], photo: null, photoAlt: null
    };
  }

  global.MD = {
    KEY: KEY,
    MAX_BYTES: MAX_BYTES,
    get: get,
    save: save,
    reset: reset,
    exportJson: exportJson,
    onChange: onChange,
    base: base,
    util: {
      distanceKm: distanceKm,
      formatDistance: formatDistance,
      mapsDirUrl: mapsDirUrl,
      needsConfirmation: needsConfirmation,
      catLabel: catLabel,
      TRADE_ART: TRADE_ART,
      artFor: artFor,
      thumb: thumb,
      slug: slug,
      parseMaps: parseMaps,
      blankStore: blankStore
    }
  };
})(typeof window !== "undefined" ? window : this);
