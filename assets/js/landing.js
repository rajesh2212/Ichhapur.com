/* ============================================================================
   ICHHAPUR Market — the dark pages (Home, About, What's here, Listings,
   Sources, Contact)
   ----------------------------------------------------------------------------
   One file serves all six: every renderer looks for the element it fills and
   returns when that element is not on the page. So a page only needs the
   markup it wants and this script stays honest about what it found.

   Everything visible is computed from the directory data, so the pages cannot
   drift out of step with the listings. When the admin panel saves, the
   `storage` event re-renders the page in place.

   The header, back bar and footer come from site-nav.js.

   No dependencies. Text goes in through textContent only, never innerHTML, so
   an edited listing cannot inject markup.
   ========================================================================= */
(function () {
  "use strict";

  var $ = function (s, r) { return (r || document).querySelector(s); };

  function tag(name, cls, text) {
    var n = document.createElement(name);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  var SVG_NS = "http://www.w3.org/2000/svg";
  function icon(paths, size) {
    var s = document.createElementNS(SVG_NS, "svg");
    s.setAttribute("width", size || 22);
    s.setAttribute("height", size || 22);
    s.setAttribute("viewBox", "0 0 24 24");
    s.setAttribute("aria-hidden", "true");
    s.setAttribute("focusable", "false");
    s.setAttribute("fill", "none");
    s.setAttribute("stroke", "currentColor");
    s.setAttribute("stroke-width", "1.6");
    s.setAttribute("stroke-linecap", "round");
    s.setAttribute("stroke-linejoin", "round");
    (Array.isArray(paths) ? paths : [paths]).forEach(function (d) {
      var p = document.createElementNS(SVG_NS, "path");
      p.setAttribute("d", d);
      s.appendChild(p);
    });
    return s;
  }

  var ICONS = {
    medicines: ["M9 3h6", "M8 3v3.6L5.4 15A4 4 0 0 0 9.2 21h5.6a4 4 0 0 0 3.8-6L16 6.6V3", "M6.6 13h10.8"],
    mobile: ["M7 2h10a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1z", "M10 19h4"],
    general: ["M4 8h16v12a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1z", "M4 8l2-5h12l2 5", "M9 13h6"],
    market: ["M3 9h18l-1.4 10.4a1 1 0 0 1-1 .6H5.4a1 1 0 0 1-1-.6z", "M8 9V6a4 4 0 0 1 8 0v3"],
    service: ["M3 7h13v9H3z", "M16 10h3.4L21 13v3h-5", "M6.5 19a1.8 1.8 0 1 0 0-3.6 1.8 1.8 0 0 0 0 3.6z", "M17.5 19a1.8 1.8 0 1 0 0-3.6 1.8 1.8 0 0 0 0 3.6z"],
    map: ["M9 3 3 5.5v15L9 18l6 3 6-2.5v-15L15 6z", "M9 3v15", "M15 6v15"],
    source: ["M6 3h9l4 4v14H6z", "M14 3v5h5", "M9 13h7", "M9 17h5"],
    check: ["M4 12.5 9.5 18 20 6.5"],
    pin: ["M12 21s7-6.4 7-11.6A7 7 0 0 0 5 9.4C5 14.6 12 21 12 21z", "M12 12.2a2.6 2.6 0 1 0 0-5.2 2.6 2.6 0 0 0 0 5.2z"],
    pencil: ["M4 20h4L20 8l-4-4L4 16z", "M14 6l4 4"]
  };

  var U = window.MD && window.MD.util;

  /* This page is dark, so the trade drawings must be the dark set. The guide
     keeps the light ones; the data layer holds both paths. */
  if (U) {
    U.useTradeArt({
      medicines: "assets/img/dark/medicines.svg",
      mobile: "assets/img/dark/mobile.svg",
      general: "assets/img/dark/general.svg",
      market: "assets/img/dark/market.svg",
      service: "assets/img/dark/service.svg"
    });
  }

  /* ------------------------------------------------------------- state */
  var DATA = null;
  var STORES = [];
  var CATS = [];
  var MARKET = null;
  var quotes = [];
  var qIndex = 0;

  function guideUrl(params, hash) {
    var qs = "";
    if (params) {
      var parts = [];
      for (var k in params) if (params[k]) parts.push(encodeURIComponent(k) + "=" + encodeURIComponent(params[k]));
      if (parts.length) qs = "?" + parts.join("&");
    }
    return "index.html" + qs + (hash ? "#" + hash : "");
  }

  function countFor(catId) {
    return STORES.filter(function (s) { return s.category === catId; }).length;
  }

  function decorate() {
    STORES.forEach(function (s) {
      s._km = s.coordinates ? U.distanceKm(MARKET.coordinates, s.coordinates) : null;
      s._dist = s._km == null ? null : U.formatDistance(s._km);
    });
  }

  /* ---------------------------------------------------------- hero facts */
  function renderHero() {
    var host = $("#statCards");
    if (!host) return;
    var listed = STORES.filter(function (s) { return !U.needsConfirmation(s); });
    var pending = STORES.length - listed.length;
    var nearest = listed.filter(function (s) { return s._km != null; })
      .sort(function (a, b) { return a._km - b._km; })[0];

    var cards = [
      { n: String(STORES.length), l: "listings published", s: "Each one names the public source it came from." },
      { n: String(pending), l: "still need a door check", s: "Shown with the badge “Listing needs confirmation”." },
      nearest
        ? { n: "≈" + nearest._dist, l: "nearest placed listing", s: "Straight-line from the market point supplied by the owner." }
        : { n: "—", l: "no placed listing yet", s: "Nothing in the data carries a map position." }
    ];

    host.textContent = "";
    cards.forEach(function (c) {
      var li = tag("li", "statcard");
      li.appendChild(tag("b", null, c.n));
      li.appendChild(tag("span", null, c.l));
      li.appendChild(tag("span", null, c.s));
      host.appendChild(li);
    });

    var chip = $("#heroChip");
    if (chip) chip.textContent = "PIN " + MARKET.pin + " · " + MARKET.country;

    if ($("#floatCoords")) {
      $("#floatCoords").textContent =
        MARKET.coordinates.lat.toFixed(4) + ", " + MARKET.coordinates.lng.toFixed(4);
    }
  }

  function renderTicker() {
    var track = $("#tickerTrack");
    if (!track) return;
    var listed = STORES.filter(function (s) { return !U.needsConfirmation(s); }).length;
    var facts = [
      STORES.length + " listings",
      CATS.length + " trades",
      listed + " corroborated by more than one source",
      "PIN " + MARKET.pin,
      MARKET.localityLine,
      "Market point supplied by the owner",
      "No shop here has been checked at the door",
      "No ordering, no payments, no reviews"
    ];

    track.textContent = "";
    /* duplicated so the marquee loops without a visible seam; the copy is
       hidden from assistive tech because the first row already reads out */
    for (var pass = 0; pass < 2; pass++) {
      var row = tag("div", "ticker__row", null);
      if (pass) row.setAttribute("aria-hidden", "true");
      facts.forEach(function (f, i) {
        row.appendChild(tag("span", null, f));
        if (i < facts.length - 1) row.appendChild(tag("i", null, "◆"));
      });
      track.appendChild(row);
    }
  }

  /* --------------------------------------------------------- home page cards */
  /* Home is the hero plus one card per page, so every card footer says something
     the data actually supports rather than a marketing line. */
  function renderHomeCards() {
    var host = $("#homeCards");
    if (!host) return;
    host.textContent = "";

    var listed = STORES.filter(function (s) { return !U.needsConfirmation(s); });
    var placed = STORES.filter(function (s) { return s.coordinates; }).length;
    var srcCount = STORES.reduce(function (n, s) { return n + ((s.sources && s.sources.length) || 0); }, 0);
    var phone = MARKET.contact && MARKET.contact.phone;

    var cards = [
      {
        i: "check", h: "About this guide",
        b: "How the listings were gathered, what counts as a source, and what is admitted when a shop has not been checked.",
        f: STORES.length + " listings, " + listed.length + " publicly listed", href: "about.html"
      },
      {
        i: "market", h: "What's here",
        b: "The trades the guide can name at this market, with the count listed under each one.",
        f: CATS.length + " trades", href: "whats-here.html"
      },
      {
        i: "pin", h: "Listings",
        b: "The listings a public source puts on a map, ordered by straight-line distance from the market point.",
        f: placed + " of " + STORES.length + " have a position", href: "listings.html"
      },
      {
        i: "source", h: "Sources",
        b: "The wording the directories themselves use, quoted with the link and the date it was read.",
        f: srcCount + " source " + (srcCount === 1 ? "link" : "links"), href: "sources.html"
      },
      {
        i: "pencil", h: "Contact",
        b: "Add a shop or report a mistake. What the page knows about reaching the market, and what it will not invent.",
        f: "Telephone " + (phone ? "published" : "not published"), href: "contact.html"
      },
      {
        i: "map", h: "The guide itself",
        b: "Every listing, the search, the map of the area and the form for corrections.",
        f: "Open index.html", href: "index.html#stores"
      }
    ];

    cards.forEach(function (c) {
      host.appendChild(tradeCard(
        c.i, c.h, c.b, c.f, c.href,
        "Go to the " + c.h.toLowerCase() + " page"
      ));
    });
  }

  /* ------------------------------------------------------------- trades */
  function tradeCard(iconKey, heading, blurb, footLabel, href, ariaLabel) {
    var li = tag("li", "tcard");
    var link = tag("a", "tcard__link");
    link.href = href;
    link.setAttribute("aria-label", ariaLabel);

    var ico = tag("span", "tcard__ico");
    ico.appendChild(icon(ICONS[iconKey] || ICONS.general));
    link.appendChild(ico);
    link.appendChild(tag("h3", null, heading));
    link.appendChild(tag("p", null, blurb));

    var foot = tag("span", "tcard__foot");
    foot.appendChild(tag("span", null, footLabel));
    var arrow = tag("span", "tcard__arrow", "→");
    arrow.setAttribute("aria-hidden", "true");
    foot.appendChild(arrow);
    link.appendChild(foot);

    li.appendChild(link);
    return li;
  }

  function renderTrades() {
    var host = $("#tradeGrid");
    if (!host) return;
    host.textContent = "";

    var any = false;
    CATS.forEach(function (c) {
      var n = countFor(c.id);
      if (!n) return;
      any = true;
      host.appendChild(tradeCard(
        c.id,
        c.label,
        TRADE_BLURBS[c.id] || "Listed in the guide under this trade.",
        n === 1 ? "1 listing" : n + " listings",
        guideUrl({ cat: c.id }, "stores"),
        "See the " + c.label.toLowerCase() + " listings in the guide"
      ));
    });

    /* the extra tile is the map itself, which is a real service of this site */
    host.appendChild(tradeCard(
      "map",
      "Directions and the map",
      "A map-app route to the market point, and a lazy-loaded map of the area.",
      "Open the guide",
      guideUrl(null, "location"),
      "Open the map and directions section of the guide"
    ));

    var err = $("#tradeError");
    if (err) err.hidden = any;
  }

  var TRADE_BLURBS = {
    medicines: "Chemists and medicine counters a public directory places at this market.",
    mobile: "Phone and accessory shops, including the airtime and repair counters.",
    general: "Departmental and daily-goods stores — the general trade of the market.",
    market: "The market areas themselves, and neighbouring hubs that share the PIN.",
    service: "Post office and public services listed against the market location."
  };

  /* ----------------------------------------------------------- listings */
  function renderListings() {
    var host = $("#listingGrid");
    if (!host) return;
    host.textContent = "";

    var placed = STORES.filter(function (s) { return s.coordinates; })
      .sort(function (a, b) { return a._km - b._km; }).slice(0, 4);

    var note = $("#listingNote");
    if (note) {
      note.textContent = placed.length
        ? placed.length + " of " + STORES.length + " listings carry a map position published by a source. " +
          "The rest are in the guide without a distance until someone checks them at the shopfront. " +
          "Distances are straight-line, not walking."
        : "No listing carries a map position yet, so nothing can be ordered by distance.";
    }

    if (!placed.length) {
      host.appendChild(tag("li", "band__sad", "Nothing in the data has coordinates yet."));
      return;
    }

    placed.forEach(function (s) {
      var needs = U.needsConfirmation(s);
      var li = tag("li", "lcard");
      var a = tag("a");
      a.href = guideUrl({ open: s.id }, "stores");

      var img = U.thumb(s, "lcard__img");
      if (img) { img.loading = "lazy"; a.appendChild(img); }

      a.appendChild(tag("h3", null, s.name));

      var meta = tag("p", "lcard__meta");
      meta.appendChild(tag("span", null, U.catLabel(CATS, s.category)));
      if (s._dist) meta.appendChild(tag("span", "lcard__dist", "≈" + s._dist));
      a.appendChild(meta);

      a.appendChild(tag("span",
        "lcard__flag " + (needs ? "lcard__flag--warn" : "lcard__flag--ok"),
        needs ? "Needs confirmation" : "Publicly listed"));

      li.appendChild(a);
      host.appendChild(li);
    });
  }

  /* ------------------------------------------------------------- feature */
  function renderFeature() {
    var pool = STORES.filter(function (s) { return s.sources && s.sources.length; });
    if (!pool.length) return;

    /* the best-documented listing = most sources, then nearest */
    var best = pool.slice().sort(function (a, b) {
      var d = b.sources.length - a.sources.length;
      if (d) return d;
      return (a._km == null ? Infinity : a._km) - (b._km == null ? Infinity : b._km);
    })[0];

    var t = $("#featTitle");
    if (t) t.textContent = best.name + ".";
    var body = $("#featBody");
    if (body) body.textContent = best.description || "";

    var facts = $("#featFacts");
    if (facts) {
      facts.textContent = "";
      var rows = [
        ["Trade", U.catLabel(CATS, best.category)],
        ["Locality", best.locality],
        ["Position", best.coordinates
          ? (best.coordinatesLabel || "Published by a source") + " · ≈" + (best._dist || "—") + " from the market point"
          : "No map position published"],
        ["Sources", best.sources.length + " listed, read " +
          (best.sources[0].checked || "date not recorded")],
        ["Status", U.needsConfirmation(best) ? "Needs confirmation at the shopfront" : "Publicly listed near the market"]
      ];
      if (best.note) rows.push(["Unresolved", best.note]);
      rows.forEach(function (r) {
        var row = tag("div");
        row.appendChild(tag("dt", null, r[0]));
        row.appendChild(tag("dd", null, r[1]));
        facts.appendChild(row);
      });
    }

    var link = $("#featLink");
    if (link) link.href = guideUrl({ open: best.id }, "stores");

    var img = $("#featImg");
    if (img) {
      var made = U.thumb(best, "shot__img");
      if (made) {
        made.loading = "lazy";
        img.parentNode.replaceChild(made, img);
        made.id = "featImg";
      }
    }
    var cap = $("#featCap");
    if (cap) {
      cap.textContent = best.photo
        ? "Photograph supplied for this listing."
        : "A drawing of the trade — not a photograph of " + best.name + ".";
    }
  }

  /* -------------------------------------------------------------- quotes */
  function buildQuotes() {
    quotes = STORES.filter(function (s) { return s.sources && s.sources.length && (s.description || s.note); });
  }

  function renderQuote() {
    var text = $("#qText");
    if (!text || !quotes.length) return;
    var s = quotes[qIndex];
    var src = s.sources[0];

    text.textContent = "“" + (s.description || s.note) + "”";

    $("#qWho").textContent = s.name;
    $("#qMeta").textContent = U.catLabel(CATS, s.category) +
      (s._dist ? " · ≈" + s._dist + " from the market point" : "");

    var old = $(".quote__src");
    if (old) old.parentNode.removeChild(old);
    var line = tag("p", "quote__src");
    line.appendChild(document.createTextNode("Source: "));
    var a = tag("a", null, src.label || "public listing");
    if (src.url) { a.href = src.url; a.target = "_blank"; a.rel = "noopener noreferrer"; }
    line.appendChild(a);
    line.appendChild(document.createTextNode(" · read " + (src.checked || "date not recorded")));
    if (s.sources.length > 1) {
      line.appendChild(document.createTextNode(" · " + (s.sources.length - 1) + " more source listed in the guide"));
    }
    $("#quote").appendChild(line);

    $("#qCount").textContent = (qIndex + 1) + " of " + quotes.length + " listings, quoted as published";
  }

  function wireQuotes() {
    var prev = $("#qPrev"), next = $("#qNext");
    if (!prev || !next) return;
    function go(delta) {
      if (quotes.length < 2) { prev.disabled = next.disabled = true; return; }
      qIndex = (qIndex + delta + quotes.length) % quotes.length;
      renderQuote();
    }
    prev.addEventListener("click", function () { go(-1); });
    next.addEventListener("click", function () { go(1); });
    document.addEventListener("keydown", function (e) {
      if (!$("#sources") || !$("#sources").contains(document.activeElement)) return;
      if (e.key === "ArrowLeft") go(-1);
      if (e.key === "ArrowRight") go(1);
    });
  }

  /* --------------------------------------------------------------- about */
  function renderAbout() {
    var host = $("#aboutFeats");
    if (!host) return;
    var srcCount = STORES.reduce(function (n, s) { return n + ((s.sources && s.sources.length) || 0); }, 0);
    var items = [
      { i: "source", b: "Every listing names its source", s: srcCount + " source links are recorded with the date each was read." },
      { i: "check", b: "Unconfirmed is said out loud", s: STORES.filter(U.needsConfirmation).length + " listings carry the badge instead of a guess." },
      { i: "pencil", b: "Corrections change the site", s: "What a visitor reports is what gets fixed — see the research notes." }
    ];
    host.textContent = "";
    items.forEach(function (it) {
      var li = tag("li", "feat");
      var ico = tag("span", "feat__ico");
      ico.appendChild(icon(ICONS[it.i], 24));
      li.appendChild(ico);
      li.appendChild(tag("b", null, it.b));
      li.appendChild(tag("span", null, it.s));
      host.appendChild(li);
    });
  }

  /* ------------------------------------------------------- what's here page */
  function renderHere() {
    var dir = $("#hereDirections");
    var loc = $("#hereLocality");
    var co = $("#hereCoords");
    if (!dir && !loc && !co) return;

    if (dir) dir.href = U.mapsDirUrl(MARKET.coordinates);
    if (loc) loc.textContent = MARKET.localityLine + " — PIN " + MARKET.pin;
    if (co) {
      co.textContent = MARKET.coordinates.lat + ", " + MARKET.coordinates.lng;
      co.appendChild(tag("small", null,
        MARKET.coordinatesSourceLabel + ". Public directories disagree by about 7 km."));
    }
  }

  /* -------------------------------------------------------------- sources */
  function renderSources() {
    var host = $("#sourceList");
    if (!host) return;
    host.textContent = "";

    var withSrc = STORES.filter(function (s) { return s.sources && s.sources.length; });
    if (!withSrc.length) {
      host.appendChild(tag("li", "band__sad", "No listing in the file carries a source yet."));
      return;
    }

    withSrc.forEach(function (s) {
      var li = tag("li", "srcrow");
      li.appendChild(tag("h3", "srcrow__name", s.name));

      var meta = tag("p", "srcrow__meta");
      meta.appendChild(tag("span", null, U.catLabel(CATS, s.category)));
      if (s._dist) meta.appendChild(tag("span", null, "≈" + s._dist + " from the market point"));
      if (U.needsConfirmation(s)) meta.appendChild(tag("span", "srcrow__warn", "Needs confirmation"));
      li.appendChild(meta);

      var links = tag("ul", "srcrow__links");
      s.sources.forEach(function (src) {
        var one = tag("li");
        var a = tag("a", null, src.label || "public listing");
        if (src.url) { a.href = src.url; a.target = "_blank"; a.rel = "noopener noreferrer"; }
        one.appendChild(a);
        one.appendChild(tag("span", "srcrow__date",
          src.checked ? "read " + src.checked : "date not recorded"));
        links.appendChild(one);
      });
      li.appendChild(links);
      host.appendChild(li);
    });
  }

  /* -------------------------------------------------------------- contact */
  function renderAddress() {
    var host = $("#addrBlock");
    if (!host) return;
    host.textContent = "";
    var rows = [
      ["Where", MARKET.localityLine + " — PIN " + MARKET.pin, null],
      ["Market point", MARKET.coordinates.lat + ", " + MARKET.coordinates.lng,
        MARKET.coordinatesSourceLabel + ". Public directories disagree by about 7 km; see the research notes."],
      ["Telephone", MARKET.contact && MARKET.contact.phone ? MARKET.contact.phone : "Not published",
        MARKET.contact && MARKET.contact.phone ? null : "The owner has not supplied one, so none is invented here."],
      ["Email", MARKET.contact && MARKET.contact.email ? MARKET.contact.email : "Not published",
        MARKET.contact && MARKET.contact.email ? null : "The form on the guide is front-end only until a channel exists."]
    ];
    rows.forEach(function (r) {
      var row = tag("div");
      row.appendChild(tag("dt", null, r[0]));
      var dd = tag("dd", null, r[1]);
      if (r[2]) dd.appendChild(tag("small", null, r[2]));
      row.appendChild(dd);
      host.appendChild(row);
    });
  }

  function renderStatus() {
    var el = $("#footStatus");
    if (!el) return;
    if (DATA.local) {
      el.textContent = "Showing a local draft saved in this browser" +
        (DATA.savedAt ? " (" + new Date(DATA.savedAt).toLocaleString() + ")" : "") +
        ". Visitors on other devices still see the published file. Not deployed.";
      el.classList.add("is-local");
    } else {
      el.textContent = "Showing the published listings file. Not deployed — no hosting or form service is connected.";
      el.classList.remove("is-local");
    }
  }

  /* -------------------------------------------------------------- reveal */
  function reveal() {
    var reduce = false;
    try { reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches; } catch (e) { /* old */ }
    var items = Array.prototype.slice.call(document.querySelectorAll("[data-reveal]"));
    if (reduce || !("IntersectionObserver" in window)) {
      items.forEach(function (n) { n.classList.add("is-in"); });
      return;
    }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (!en.isIntersecting) return;
        en.target.classList.add("is-in");
        io.unobserve(en.target);
      });
    }, { rootMargin: "0px 0px -8% 0px", threshold: .08 });
    items.forEach(function (n) { io.observe(n); });
  }

  /* ---------------------------------------------------------------- data */
  function loadAll() {
    DATA = window.MD.get();
    if (!DATA) {
      document.querySelectorAll(".statcards, .navcards, .tradegrid, .lgrid, .quoter").forEach(function (n) {
        n.textContent = "";
        n.appendChild(tag("p", "band__sad", "The listings file did not load."));
      });
      return false;
    }
    MARKET = DATA.market;
    CATS = DATA.categories;
    STORES = DATA.stores;
    decorate();
    renderHero();
    renderTicker();
    renderHomeCards();
    renderAbout();
    renderTrades();
    renderListings();
    renderFeature();
    renderHere();
    buildQuotes();
    renderQuote();
    renderSources();
    renderAddress();
    renderStatus();
    return true;
  }

  function boot() {
    wireQuotes();
    /* render first — an empty grid has no height for the observer to catch */
    loadAll();
    reveal();

    window.MD.onChange(function () {
      /* the admin panel saved on this machine — re-render in place */
      qIndex = 0;
      loadAll();
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
