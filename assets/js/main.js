/* ==========================================================================
   ICHHAPUR market guide — page behaviour
   Directory render + search + filters, store detail sheet, lazy map,
   directions links, and the front-end-only suggestion form.
   No dependencies. All text is inserted via textContent, never innerHTML,
   so edited store data cannot inject markup.
   ========================================================================== */
(function () {
  "use strict";

  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };

  function tag(name, className, text) {
    var n = document.createElement(name);
    if (className) n.className = className;
    if (text != null) n.textContent = text;
    return n;
  }

  /* ---------- geometry ---------- */
  var R_EARTH = 6371;
  function radians(d) { return d * Math.PI / 180; }

  function distanceKm(a, b) {
    if (!a || !b) return null;
    var dLat = radians(b.lat - a.lat);
    var dLng = radians(b.lng - a.lng);
    var s = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(radians(a.lat)) * Math.cos(radians(b.lat)) *
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
    return "https://www.google.com/maps/dir/?api=1&destination=" + c.lat + "," + c.lng;
  }

  /* The masthead and its mobile menu belong to site-nav.js — the same six-item
     navigation is on every page, so nothing is wired to it here. */

  /* ==========================================================================
     Directory
     ========================================================================== */
  var MARKET = null;
  var STORES = [];
  var CATS = [];
  var state = { q: "", category: "all", hideUnconfirmed: false };

  var grid = $("#storeGrid");
  var countLine = $("#result-count");
  var emptyState = $("#emptyState");
  var errorState = $("#errorState");
  var chipsRow = $("#categoryChips .chips__row");
  var searchInput = $("#store-search");
  var hideToggle = $("#hideUnconfirmed");

  function catLabel(id) {
    var c = CATS.filter(function (x) { return x.id === id; })[0];
    return c ? c.label : "Other";
  }

  function needsConfirmation(store) { return store.status !== "listed"; }

  /* Card artwork comes from the shared data layer, so a photograph attached in
     the admin panel shows up here too. It stands for the *kind* of shop and is
     never presented as a picture of the shop itself. */
  function thumbFor(store) {
    return window.MD ? window.MD.util.thumb(store, "card__thumb") : null;
  }

  function haystack(store) {
    return [
      store.name, catLabel(store.category), store.locality, store.addressLine,
      store.description, (store.keywords || []).join(" ")
    ].filter(Boolean).join(" ").toLowerCase();
  }

  function matches(store) {
    if (state.category !== "all" && store.category !== state.category) return false;
    if (state.hideUnconfirmed && needsConfirmation(store)) return false;
    if (!state.q) return true;
    var hay = haystack(store);
    return state.q.split(/\s+/).filter(Boolean).every(function (term) {
      return hay.indexOf(term) !== -1;
    });
  }

  function sortStores(a, b) {
    var an = needsConfirmation(a) ? 1 : 0, bn = needsConfirmation(b) ? 1 : 0;
    if (an !== bn) return an - bn;
    var da = a._km == null ? Infinity : a._km;
    var db = b._km == null ? Infinity : b._km;
    if (da !== db) return da - db;
    return a.name.localeCompare(b.name);
  }

  function buildCard(store) {
    var card = tag("article", "card" + (needsConfirmation(store) ? " card--needs" : ""));
    card.dataset.id = store.id;

    var thumb = thumbFor(store);
    if (thumb) card.appendChild(thumb);

    var badges = tag("p", "badges");
    badges.appendChild(tag("span", "badge badge--cat", catLabel(store.category)));
    if (needsConfirmation(store)) {
      badges.appendChild(tag("span", "badge badge--warn", "Listing needs confirmation"));
    } else {
      badges.appendChild(tag("span", "badge badge--ok", "Publicly listed near the market"));
    }
    if (store._dist) badges.appendChild(tag("span", "badge badge--dist", "≈" + store._dist + " from the pin"));
    card.appendChild(badges);

    card.appendChild(tag("h3", "card__name", store.name));

    var loc = tag("p", "card__loc");
    loc.appendChild(tag("b", null, store.locality));
    loc.appendChild(document.createTextNode(store.addressLine || ""));
    card.appendChild(loc);

    if (store.description) card.appendChild(tag("p", "card__desc", store.description));

    var actions = tag("div", "card__actions");
    var details = tag("button", "btn btn--quiet btn--sm", "Store details");
    details.type = "button";
    details.dataset.open = store.id;
    actions.appendChild(details);

    if (store.coordinates) {
      var dir = tag("a", "btn btn--primary btn--sm");
      dir.href = mapsDirUrl(store.coordinates);
      dir.target = "_blank";
      dir.rel = "noopener";
      dir.appendChild(document.createTextNode("Directions"));
      dir.appendChild(tag("span", "sr-only", " to " + store.name + " — opens a map app in a new tab"));
      actions.appendChild(dir);
    } else {
      var noLoc = tag("p", "card__loc");
      noLoc.style.fontSize = ".84rem";
      noLoc.textContent = "No usable map position yet, so no directions.";
      actions.appendChild(noLoc);
    }

    var fix = tag("button", "btn btn--quiet btn--sm", "Report a correction");
    fix.type = "button";
    fix.dataset.suggest = "correction";
    fix.dataset.store = store.name;
    actions.appendChild(fix);

    card.appendChild(actions);
    return card;
  }

  function render() {
    if (!grid) return;
    var results = STORES.filter(matches).sort(sortStores);

    grid.textContent = "";
    grid.setAttribute("aria-busy", "false");

    if (results.length) {
      results.forEach(function (s) { grid.appendChild(buildCard(s)); });
      grid.hidden = false;
    } else {
      grid.hidden = true;
    }

    if (emptyState) {
      emptyState.hidden = results.length > 0;
      var msg = $("#emptyMessage");
      if (msg && !results.length) {
        if (state.q) {
          msg.textContent = "Nothing matches “" + state.q + "”. Try a shorter word, a different spelling, or a shop name.";
        } else if (state.hideUnconfirmed) {
          msg.textContent = "Every listing in this selection still needs confirming. Turn that filter off to see them.";
        } else if (state.category !== "all") {
          msg.textContent = "No store is listed in that category yet. You can suggest one.";
        } else {
          msg.textContent = "The directory has no listings yet.";
        }
      }
    }

    if (countLine) {
      countLine.textContent = "";
      if (!STORES.length) {
        countLine.textContent = "No listings are published yet.";
      } else {
        var strong = tag("strong", null, String(results.length));
        countLine.appendChild(strong);
        countLine.appendChild(document.createTextNode(
          results.length === STORES.length
            ? " of " + STORES.length + " listings shown"
            : " of " + STORES.length + " listings match your filters"
        ));
        var unconf = results.filter(needsConfirmation).length;
        if (unconf) {
          countLine.appendChild(document.createTextNode(
            " · " + unconf + (unconf === 1 ? " listing still needs" : " listings still need") + " confirmation"));
        }
      }
    }
  }

  function buildChips() {
    if (!chipsRow) return;
    chipsRow.textContent = "";
    var all = tag("button", "filter-chip", "All");
    all.type = "button";
    all.setAttribute("aria-pressed", "true");
    all.dataset.cat = "all";
    all.appendChild(tag("span", "n", String(STORES.length)));
    chipsRow.appendChild(all);

    CATS.forEach(function (c) {
      var n = STORES.filter(function (s) { return s.category === c.id; }).length;
      if (!n) return; /* only categories actually present in the directory */
      var b = tag("button", "filter-chip", c.label);
      b.type = "button";
      b.setAttribute("aria-pressed", "false");
      b.dataset.cat = c.id;
      b.appendChild(tag("span", "n", String(n)));
      chipsRow.appendChild(b);
    });

    /* the row is rebuilt on every data change; the handler is attached once */
    if (chipsRow._wired) return;
    chipsRow.addEventListener("click", function (e) {
      var btn = e.target.closest ? e.target.closest(".filter-chip") : null;
      if (!btn) return;
      state.category = btn.dataset.cat;
      $$(".filter-chip", chipsRow).forEach(function (x) {
        x.setAttribute("aria-pressed", x === btn ? "true" : "false");
      });
      render();
    }, false);
    chipsRow._wired = true;
  }

  var debounce;
  if (searchInput) {
    searchInput.addEventListener("input", function () {
      clearTimeout(debounce);
      debounce = setTimeout(function () {
        state.q = searchInput.value.trim().toLowerCase();
        render();
      }, 130);
    });
    /* native search-cancel (the ✕) fires change, not input, in some browsers */
    searchInput.addEventListener("search", function () {
      state.q = searchInput.value.trim().toLowerCase();
      render();
    });
  }

  if (hideToggle) {
    hideToggle.addEventListener("change", function () {
      state.hideUnconfirmed = hideToggle.checked;
      render();
    });
  }

  function clearFilters(focusSearch) {
    state.q = ""; state.category = "all"; state.hideUnconfirmed = false;
    if (searchInput) searchInput.value = "";
    if (hideToggle) hideToggle.checked = false;
    $$(".filter-chip", chipsRow).forEach(function (x) {
      x.setAttribute("aria-pressed", x.dataset.cat === "all" ? "true" : "false");
    });
    render();
    if (focusSearch && searchInput) searchInput.focus();
  }

  $$("#clearFilters, #emptyClear").forEach(function (b) {
    if (b) b.addEventListener("click", function () { clearFilters(true); });
  });

  /* ==========================================================================
     Store detail sheet
     ========================================================================== */
  var dialog = $("#storeDialog");
  var lastFocused = null;

  function factRow(label, value, note) {
    var d = tag("div");
    d.appendChild(tag("dt", null, label));
    var dd = tag("dd", null, value);
    if (note) dd.appendChild(tag("small", null, note));
    d.appendChild(dd);
    return d;
  }

  function openStore(id, trigger) {
    var store = STORES.filter(function (s) { return s.id === id; })[0];
    if (!store || !dialog) return;

    $("#dlgCategory").textContent = catLabel(store.category);
    $("#dlgTitle").textContent = store.name;

    var badges = $("#dlgBadges");
    badges.textContent = "";
    badges.appendChild(tag("span",
      needsConfirmation(store) ? "badge badge--warn" : "badge badge--ok",
      needsConfirmation(store) ? "Listing needs confirmation" : "Publicly listed near the market"));
    if (store._dist) badges.appendChild(tag("span", "badge badge--dist", "≈" + store._dist + " from the pin"));

    var facts = $("#dlgFacts");
    facts.textContent = "";
    facts.appendChild(factRow("Locality", store.locality));
    if (store.addressLine) facts.appendChild(factRow("Address as listed", store.addressLine));
    if (store._dist) {
      facts.appendChild(factRow("Distance from the market pin", store._dist,
        "Straight-line distance, measured from the coordinates on this site."));
    }
    if (store.hours) facts.appendChild(factRow("Hours", store.hours, "Taken from a public listing — unverified. Please check before relying on it."));
    if (store.phone) facts.appendChild(factRow("Telephone", store.phone, "Published by a directory, not confirmed by us."));
    if (store.coordinates) {
      facts.appendChild(factRow("Map position", store.coordinates.lat + ", " + store.coordinates.lng,
        store.coordinatesLabel || ""));
    } else {
      facts.appendChild(factRow("Map position", "Not established",
        "No usable coordinates, so this listing has no directions link."));
    }
    if (store.description) facts.appendChild(factRow("Summary", store.description));

    var noteWrap = $("#dlgNoteWrap");
    if (store.note) {
      noteWrap.hidden = false;
      $("#dlgNote").textContent = store.note;
    } else {
      noteWrap.hidden = true;
    }

    var actions = $("#dlgActions");
    actions.textContent = "";
    if (store.coordinates) {
      var dir = tag("a", "btn btn--primary", "Get directions");
      dir.href = mapsDirUrl(store.coordinates);
      dir.target = "_blank"; dir.rel = "noopener";
      actions.appendChild(dir);
    }
    var mkt = tag("a", "btn btn--outline", "Directions to the market pin");
    mkt.href = mapsDirUrl(MARKET.market.coordinates);
    mkt.target = "_blank"; mkt.rel = "noopener";
    actions.appendChild(mkt);

    var fix = tag("button", "btn btn--quiet", "Report a correction");
    fix.type = "button";
    fix.dataset.suggest = "correction";
    fix.dataset.store = store.name;
    actions.appendChild(fix);

    var srcList = $("#dlgSources");
    srcList.textContent = "";
    (store.sources || []).forEach(function (src) {
      var li = tag("li");
      li.appendChild(document.createTextNode((src.label || "Public source")));
      if (src.url) {
        li.appendChild(document.createTextNode(" — "));
        var a = tag("a", null, src.url.replace(/^https?:\/\//, "").slice(0, 58));
        a.href = src.url; a.target = "_blank"; a.rel = "noopener";
        li.appendChild(a);
      }
      if (src.checked) li.appendChild(document.createTextNode(" · checked " + src.checked));
      srcList.appendChild(li);
    });
    if (!(store.sources || []).length) {
      srcList.appendChild(tag("li", null, "No source recorded yet — treat this entry as unverified."));
    }

    lastFocused = trigger || document.activeElement;
    if (typeof dialog.showModal === "function") dialog.showModal();
    else { dialog.setAttribute("open", ""); }
  }

  function closeDialog() {
    if (!dialog) return;
    if (typeof dialog.close === "function" && dialog.open) dialog.close();
    else dialog.removeAttribute("open");
    if (lastFocused) lastFocused.focus();
  }

  if (dialog) {
    var dClose = $("#dlgClose");
    if (dClose) dClose.addEventListener("click", closeDialog);
    dialog.addEventListener("cancel", function () { if (lastFocused) lastFocused.focus(); });
    dialog.addEventListener("click", function (e) {
      if (e.target === dialog) closeDialog();
    });
  }

  /* ==========================================================================
     Suggestion form — front-end only until the owner wires a channel
     ========================================================================== */
  var form = $("#suggestForm");

  function fillCategorySelect() {
    var sel = $("#f-category");
    if (!sel) return;
    CATS.forEach(function (c) {
      var o = document.createElement("option");
      o.value = c.id; o.textContent = c.label;
      sel.appendChild(o);
    });
  }

  function setKind(kind, storeName) {
    var radio = form && form.querySelector('input[name="kind"][value="' + kind + '"]');
    if (radio) radio.checked = true;
    if (storeName) {
      var f = $("#f-store");
      if (f) f.value = storeName;
    }
  }

  function goToForm(kind, storeName) {
    if (!form) return;
    setKind(kind, storeName);
    if (dialog && dialog.open) closeDialog();
    var target = $("#contact");
    if (target) target.scrollIntoView({ behavior: prefersReduced() ? "auto" : "smooth", block: "start" });
    var details = $("#f-details");
    if (details) {
      if (storeName) details.placeholder = "About “" + storeName + "”: what should we change?";
      setTimeout(function () { details.focus({ preventScroll: true }); }, prefersReduced() ? 60 : 480);
    }
  }

  function prefersReduced() {
    return window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }

  document.addEventListener("click", function (e) {
    var t = e.target && e.target.closest ? e.target : null;
    if (!t) return;
    var opener = t.closest("[data-open]");
    if (opener) { openStore(opener.dataset.open, opener); return; }
    var suggest = t.closest("[data-suggest]");
    if (suggest) {
      goToForm(suggest.dataset.suggest, suggest.dataset.store || "");
      return;
    }
  });

  function fieldError(id, on) {
    var input = $(id);
    if (!input) return;
    var field = input.closest(".field");
    var err = input.getAttribute("aria-describedby");
    var errNode = err ? document.getElementById(err.split(" ").filter(function (x) { return /^e-/.test(x); })[0]) : null;
    if (field) field.classList.toggle("field--invalid", on);
    input.setAttribute("aria-invalid", on ? "true" : "false");
    if (errNode) errNode.hidden = !on;
  }

  function buildPayload(values) {
    var lines = [
      "ICHHAPUR market guide — " + (values.kind === "correction" ? "correction" : "new store suggestion"),
      "",
      "Store or place: " + values.store,
      "Category: " + (values.category ? catLabel(values.category) : "not specified"),
      "Locality / landmark: " + (values.area || "not specified"),
      "",
      "Details:",
      values.details,
      "",
      "From: " + (values.name || "(not given)"),
      "Reply to: " + (values.reply || "(not given)"),
      "Sent from page: " + location.href,
      "Date: " + new Date().toISOString().slice(0, 10)
    ];
    return lines.join("\n");
  }

  if (form) {
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var data = new FormData(form);
      var values = {
        kind: data.get("kind") || "missing",
        store: (data.get("store") || "").toString().trim(),
        category: (data.get("category") || "").toString(),
        area: (data.get("area") || "").toString().trim(),
        details: (data.get("details") || "").toString().trim(),
        name: (data.get("name") || "").toString().trim(),
        reply: (data.get("reply") || "").toString().trim()
      };

      var bad = [];
      if (values.store.length < 2) { fieldError("#f-store", true); bad.push("#f-store"); }
      else fieldError("#f-store", false);
      if (values.details.length < 5) { fieldError("#f-details", true); bad.push("#f-details"); }
      else fieldError("#f-details", false);

      var formErr = $("#formErr");
      if (bad.length) {
        if (formErr) formErr.hidden = false;
        var first = $(bad[0]);
        if (first) first.focus();
        return;
      }
      if (formErr) formErr.hidden = true;

      $("#formPayload").value = buildPayload(values);
      var result = $("#formResult");
      result.hidden = false;
      var lead = $("#sendLead");
      var channel = MARKET && MARKET.market.contact;
      if (channel && (channel.email || channel.phone)) {
        lead.textContent = "Submission is not connected to a server yet, so this has not been sent. " +
          "Copy it and send it to " + (channel.email || channel.phone) + ".";
      } else {
        lead.textContent = "";
        lead.appendChild(tag("strong", null, "Submission is not connected yet"));
        lead.appendChild(document.createTextNode(
          ", so this has not been sent anywhere. Copy it below and send it to the website team by whatever channel they publish."));
      }
      result.focus({ preventScroll: true });
    });

    var reset = $("#resetForm");
    if (reset) {
      reset.addEventListener("click", function () {
        form.reset();
        $("#formResult").hidden = true;
        fieldError("#f-store", false);
        fieldError("#f-details", false);
        $("#f-store").focus();
      });
    }
  }

  /* ---------- clipboard with a fallback for insecure origins ---------- */
  function copyText(text) {
    if (navigator.clipboard && window.isSecureContext) {
      return navigator.clipboard.writeText(text).then(function () { return true; }, function () { return legacyCopy(text); });
    }
    return Promise.resolve(legacyCopy(text));
  }

  function legacyCopy(text) {
    try {
      var ta = document.createElement("textarea");
      ta.value = text;
      ta.setAttribute("readonly", "");
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      var ok = document.execCommand("copy");
      document.body.removeChild(ta);
      return ok;
    } catch (err) { return false; }
  }

  var copyBtn = $("#copyMessage");
  if (copyBtn) {
    copyBtn.addEventListener("click", function () {
      var payload = $("#formPayload").value;
      copyText(payload).then(function (ok) {
        var msg = $("#copyMsg");
        msg.textContent = ok
          ? "Copied. Now paste it into an email or message to the website team."
          : "Your browser blocked copying. Select the text above and copy it manually.";
        msg.style.color = ok ? "" : "#9c1f1f";
      });
    });
  }

  /* ==========================================================================
     Location: coordinates + lazy map
     ========================================================================== */
  function wireCoordCopy() {
    var btn = $("#copyCoords");
    var node = $("#coordText");
    if (!btn || !node || !MARKET) return;
    var text = MARKET.market.coordinates.lat + ", " + MARKET.market.coordinates.lng;
    node.textContent = text;
    btn.addEventListener("click", function () {
      copyText(text).then(function (ok) {
        $("#copyCoordsMsg").textContent = ok ? "Coordinates copied." : "Copying was blocked — select them and copy manually.";
      });
    });
  }

  function loadMap() {
    var frame = $("#mapFrame");
    if (!frame || !MARKET) return;
    var c = MARKET.market.coordinates;
    var dLat = 0.011, dLng = 0.016;
    var bbox = (c.lng - dLng) + "," + (c.lat - dLat) + "," + (c.lng + dLng) + "," + (c.lat + dLat);
    var url = "https://www.openstreetmap.org/export/embed.html?bbox=" + encodeURIComponent(bbox) +
              "&layer=mapnik&marker=" + c.lat + "," + c.lng;

    var iframe = tag("iframe");
    iframe.src = url;
    iframe.loading = "lazy";
    iframe.referrerPolicy = "no-referrer-when-downgrade";
    iframe.title = "Map showing the market location at " + c.lat + ", " + c.lng + ", Ichhapur, Bhadrak, Odisha";

    var status = $("#mapStatus");
    var done = false;
    iframe.addEventListener("load", function () {
      done = true;
      if (status) status.hidden = true;
    });
    frame.appendChild(iframe);

    setTimeout(function () {
      if (done || !status) return;
      status.textContent = "";
      status.appendChild(tag("p", null, "The embedded map did not load — you may be offline, or the map service is unreachable."));
      var a = tag("a", "btn btn--outline btn--sm", "Open this location on OpenStreetMap");
      a.href = "https://www.openstreetmap.org/?mlat=" + c.lat + "&mlon=" + c.lng + "#map=15/" + c.lat + "/" + c.lng;
      a.target = "_blank"; a.rel = "noopener";
      status.appendChild(a);
    }, 12000);
  }

  if ("IntersectionObserver" in window) {
    var seen = false;
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting && !seen) { seen = true; loadMap(); io.disconnect(); }
      });
    }, { rootMargin: "200px" });
    io.observe($("#mapFrame"));
  } else {
    window.addEventListener("load", loadMap);
  }

  /* ==========================================================================
     Boot
     ========================================================================== */
  /* ==========================================================================
     Deep links from the overview page
       ?q=term  ?cat=id  ?confirmed=1  ?open=storeId  ?kind=missing|correction
     ========================================================================== */
  function readDeepLink() {
    var p;
    try { p = new URLSearchParams(location.search); } catch (e) { return null; }
    var d = {
      q: (p.get("q") || "").trim(),
      cat: p.get("cat") || "",
      confirmed: p.get("confirmed") === "1",
      open: p.get("open") || "",
      kind: p.get("kind") || "",
      store: (p.get("store") || "").trim()
    };
    if (!(d.q || d.cat || d.confirmed || d.open || d.kind)) return null;
    return d;
  }

  function applyDeepLink() {
    var d = readDeepLink();
    if (!d) return null;

    if (d.q) {
      state.q = d.q.toLowerCase();
      if (searchInput) searchInput.value = d.q;
    }
    if (d.cat && CATS.some(function (c) { return c.id === d.cat; })) state.category = d.cat;
    if (d.confirmed) {
      state.hideUnconfirmed = true;
      if (hideToggle) hideToggle.checked = true;
    }
    if (chipsRow) {
      $$(".filter-chip", chipsRow).forEach(function (x) {
        x.setAttribute("aria-pressed", x.dataset.cat === state.category ? "true" : "false");
      });
    }
    if (d.kind === "missing" || d.kind === "correction") setKind(d.kind, d.store);
    return d;
  }

  function landOnDeepLink(d) {
    var wantsForm = (d.kind === "missing" || d.kind === "correction");
    var target = $(wantsForm ? "#contact" : "#stores");
    if (target && target.scrollIntoView) {
      target.scrollIntoView({ behavior: prefersReduced() ? "auto" : "smooth", block: "start" });
    }
    if (d.open) {
      var s = STORES.filter(function (x) { return String(x.id) === d.open; })[0];
      if (s) whenIntroIdle(function () { openStore(s.id, null); });
    }
  }

  /* the welcome overlay owns the screen for a couple of seconds; a deep link to
     a single listing should not fight it */
  function whenIntroIdle(fn) {
    var intro = document.getElementById("intro");
    if (!intro || intro.hidden) { fn(); return; }
    var tries = 0;
    var timer = setInterval(function () {
      if (intro.hidden || ++tries > 70) { clearInterval(timer); fn(); }
    }, 120);
  }

  function applyData(data) {
    MARKET = data;
    CATS = data.categories || [];
    var pin = data.market.coordinates;
    STORES = data.stores.map(function (s) {
      var km = distanceKm(pin, s.coordinates);
      return Object.assign({}, s, { _km: km, _dist: formatDistance(km) });
    });

    var heroCount = $("#heroCount");
    if (heroCount) {
      var conf = STORES.filter(function (s) { return !needsConfirmation(s); }).length;
      heroCount.textContent =
        STORES.length + " listings are published so far (" + conf + " placed near the market pin by a public source); " +
        "they are gathered from public directories and are still being confirmed, one shop at a time.";
    }

    var draft = $("#draftNote");
    if (draft) draft.hidden = !data.local;
  }

  function boot() {
    var y = $("#year");
    if (y) y.textContent = String(new Date().getFullYear());

    var data = window.MD ? window.MD.get() : window.MARKET_DATA;
    if (!data || !data.market || !Array.isArray(data.stores)) {
      if (grid) grid.hidden = true;
      if (countLine) countLine.textContent = "The directory did not load.";
      if (errorState) errorState.hidden = false;
      var retry = $("#retryLoad");
      if (retry) retry.addEventListener("click", function () { location.reload(); });
      return;
    }

    applyData(data);
    if (errorState) errorState.hidden = true;

    buildChips();
    fillCategorySelect();
    wireCoordCopy();

    /* render on the next frame so the skeletons are what the visitor sees first */
    requestAnimationFrame(function () {
      setTimeout(function () {
        var deep = applyDeepLink();
        render();
        if (deep) landOnDeepLink(deep);
      }, 60);
    });

    if (window.MD) {
      /* the admin panel saved on this browser — redraw the directory in place */
      window.MD.onChange(function (next) {
        if (!next || !next.market || !Array.isArray(next.stores)) return;
        applyData(next);
        buildChips();
        render();
      });
    }
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
