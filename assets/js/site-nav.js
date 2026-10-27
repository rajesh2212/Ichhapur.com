/* ============================================================================
   ICHHAPUR Market — shared header, back bar and footer
   ----------------------------------------------------------------------------
   The same six-item navigation appears on every page, so it is written once
   here and mounted into the page rather than copied into each file. Six copies
   of a nav bar are six chances for one of them to go out of date.

   Every destination is a real link in the markup, so the navigation works
   before this script runs and on a browser with JavaScript switched off. The
   script only adds what cannot be static: which item is the current page, the
   burger button's open/close state, and the back control's "go back the way you
   came" behaviour.

   Nothing is interpolated from the store data into markup. The one value taken
   from the data — the market coordinates for the directions button — goes into
   an href as a number, and falls back to the address already in the page.
   ========================================================================= */
(function (global) {
  "use strict";

  var PAGES = [
    { id: "home",     label: "Home",       href: "landing.html" },
    { id: "about",    label: "About",      href: "about.html" },
    { id: "trades",   label: "What's here", href: "whats-here.html" },
    { id: "listings", label: "Listings",   href: "listings.html" },
    { id: "sources",  label: "Sources",    href: "sources.html" },
    { id: "contact",  label: "Contact",    href: "contact.html" }
  ];

  var SVG_NS = "http://www.w3.org/2000/svg";

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  /* Static path data only — never a string built from the listings. */
  function svg(size, viewBox, paths) {
    var s = document.createElementNS(SVG_NS, "svg");
    s.setAttribute("width", size);
    s.setAttribute("height", size);
    s.setAttribute("viewBox", viewBox);
    s.setAttribute("aria-hidden", "true");
    s.setAttribute("focusable", "false");
    s.setAttribute("fill", "none");
    s.setAttribute("stroke", "currentColor");
    paths.forEach(function (p) {
      var d = document.createElementNS(SVG_NS, "path");
      d.setAttribute("d", p.d);
      if (p.fill) d.setAttribute("fill", p.fill);
      if (p.stroke !== undefined) d.setAttribute("stroke", p.stroke);
      if (p.width) d.setAttribute("stroke-width", p.width);
      if (p.cap) d.setAttribute("stroke-linecap", p.cap);
      if (p.join) d.setAttribute("stroke-linejoin", p.join);
      s.appendChild(d);
    });
    return s;
  }

  var ART = {
    house: "M5 14 16 4l11 10v13a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1z",
    door: "M11 28v-9h10v9",
    search: "m11.5 11.5 4 4",
    compass: "M9 1.8 16.2 9 9 16.2 1.8 9z",
    compassNeedle: "M7 11V8.2h4.2",
    key: "M9.2 9.6 15 15.4M12.4 12.8l1.6-1.6",
    arrow: "M2 8h11M9 4l4 4-4 4",
    back: "M11 3 5 9l6 6"
  };

  function brand(cls, href) {
    var a = el("a", "brand" + (cls ? " " + cls : ""));
    a.href = href;
    var mark = el("span", "brand__mark");
    mark.setAttribute("aria-hidden", "true");
    mark.appendChild(svg(26, "0 0 32 32", [
      { d: ART.house, width: "1.8" },
      { d: ART.door, width: "1.8" }
    ]));
    a.appendChild(mark);
    var words = el("span", "brand__words");
    words.appendChild(el("b", null, "ICHHAPUR"));
    words.appendChild(el("i", null, "market guide"));
    a.appendChild(words);
    return a;
  }

  function roundLink(href, label, paths, id) {
    var a = el("a", "round");
    a.href = href;
    a.setAttribute("aria-label", label);
    if (id) a.id = id;
    var s = svg(17, "0 0 18 18", paths);
    s.setAttribute("stroke-width", "1.7");
    a.appendChild(s);
    return a;
  }

  /* ---------------------------------------------------------- current page */
  function currentPage() {
    var path = (global.location.pathname || "").split("/").pop();
    for (var i = 0; i < PAGES.length; i++) if (PAGES[i].href === path) return PAGES[i];
    /* the guide is the store directory, so it lights up Listings */
    if (path === "index.html" || path === "") {
      return { id: "listings", label: "Listings", href: "index.html" };
    }
    /* the admin panel is a tool, not one of the six pages, so it gets the same
       header and a back control but lights up no nav item */
    if (path === "admin.html") {
      return { id: "admin", label: "Store admin", href: "admin.html" };
    }
    return null;
  }

  /* --------------------------------------------------------------- header */
  function buildHeader(page) {
    var head = el("header", "masthead");
    head.id = "masthead";

    head.appendChild(brand(null, "landing.html#top"));

    var nav = el("nav", "mastnav");
    nav.id = "mastnav";
    nav.setAttribute("aria-label", "Pages of this guide");
    var ul = el("ul");
    PAGES.forEach(function (p) {
      var li = el("li");
      var a = el("a", null, p.label);
      a.href = p.href;
      if (page && page.id === p.id) a.setAttribute("aria-current", "page");
      li.appendChild(a);
      ul.appendChild(li);
    });
    nav.appendChild(ul);
    head.appendChild(nav);

    var tail = el("div", "masthead__tail");
    var pill = el("a", "pill pill--solid");
    pill.href = "index.html#stores";
    pill.appendChild(document.createTextNode("Open the guide"));
    pill.appendChild(svg(15, "0 0 16 16", [{ d: ART.arrow, cap: "round", join: "round", width: "1.7" }]));
    tail.appendChild(pill);

    var row = el("div", "roundrow");
    row.appendChild(roundLink("index.html#stores", "Search the store directory", [
      { d: "M7.5 2.5a5 5 0 1 0 0 10 5 5 0 0 0 0-10z" },
      { d: ART.search, cap: "round" }
    ]));
    row.appendChild(roundLink(
      "https://www.google.com/maps/dir/?api=1&destination=21.045677123140994,86.55692995394432",
      "Get directions to the market location supplied by the owner",
      [{ d: ART.compass }, { d: ART.compassNeedle, cap: "round" }],
      "mastDirections"));
    var admin = roundLink("admin.html", "Open the store admin panel", [
      { d: "M6.6 4.9a3.1 3.1 0 1 0 0 6.2 3.1 3.1 0 0 0 0-6.2z" },
      { d: ART.key, cap: "round" }
    ]);
    row.appendChild(admin);
    tail.appendChild(row);

    var burger = el("button", "burger");
    burger.type = "button";
    burger.id = "mastToggle";
    burger.setAttribute("aria-expanded", "false");
    burger.setAttribute("aria-controls", "mastnav");
    burger.setAttribute("aria-label", "Open the page menu");
    burger.appendChild(el("span"));
    burger.appendChild(el("span"));
    tail.appendChild(burger);

    head.appendChild(tail);
    return head;
  }

  /* ------------------------------------------------------------ back bar */
  function buildBackBar(page) {
    if (!page || page.id === "home") return null;
    var bar = el("div", "backbar");

    var b = el("a", "backbar__btn");
    b.id = "backBtn";
    b.href = "landing.html";           /* the honest fallback destination */
    var s = svg(15, "0 0 14 18", [{ d: ART.back, cap: "round", join: "round", width: "1.8" }]);
    s.setAttribute("aria-hidden", "true");
    b.appendChild(s);
    b.appendChild(el("span", null, "Back"));
    bar.appendChild(b);

    var here = el("p", "backbar__here");
    here.appendChild(document.createTextNode("You are on"));
    here.appendChild(el("b", null, page.label));
    bar.appendChild(here);
    return bar;
  }

  /*
   * Back should undo the last step, not jump to Home, when the visitor clearly
   * came from somewhere on this site. document.referrer is the only signal that
   * survives a fresh load, and it is empty when the page was opened directly or
   * when the sender sent no referrer — so the link's own href stays the fallback.
   */
  function wireBack(page) {
    var btn = document.getElementById("backBtn");
    if (!btn) return;
    var from = "";
    try {
      var ref = document.referrer ? new URL(document.referrer) : null;
      if (ref && ref.host === global.location.host) from = ref.pathname.split("/").pop();
    } catch (e) { from = ""; }
    if (!from || from === page.href) return;
    btn.href = from;
    var label = btn.querySelector("span");
    if (label) label.textContent = "Back to " + labelFor(from);
  }

  function labelFor(path) {
    for (var i = 0; i < PAGES.length; i++) if (PAGES[i].href === path) return PAGES[i].label;
    if (path === "index.html") return "the guide";
    if (path === "admin.html") return "the admin panel";
    return "the previous page";
  }

  /* -------------------------------------------------------------- footer */
  function buildFooter() {
    var foot = el("footer", "dk-foot");
    var home = brand("brand--foot", "landing.html#top");
    home.querySelector(".brand__mark svg").setAttribute("width", "22");
    home.querySelector(".brand__mark svg").setAttribute("height", "22");
    foot.appendChild(home);

    var nav = el("nav", "dk-foot__nav");
    nav.setAttribute("aria-label", "This page and the project");
    [["Method", "index.html#about"], ["Research notes", "docs/research-notes.md"],
     ["Store admin", "admin.html"], ["Open the guide", "index.html#stores"]]
      .forEach(function (r) {
        var a = el("a", null, r[0]);
        a.href = r[1];
        nav.appendChild(a);
      });
    foot.appendChild(nav);

    var status = el("p", "dk-foot__status");
    status.id = "footStatus";
    status.textContent = "Not deployed. No contact channel is connected yet.";
    foot.appendChild(status);
    return foot;
  }

  /* --------------------------------------------------------------- wiring */
  function wire() {
    var head = document.getElementById("masthead");
    var toggle = document.getElementById("mastToggle");
    var nav = document.getElementById("mastnav");
    var back = document.querySelector(".backbar");

    /* the back bar sticks directly under the masthead, and so does the top of
       the mobile menu — both heights come from padding and font size, so they
       are measured rather than guessed. `top` is ignored on the desktop nav,
       which is not positioned. */
    function stickBar() {
      if (!head) return;
      var h = head.offsetHeight + "px";
      if (back) back.style.top = h;
      if (nav) nav.style.top = h;
    }
    stickBar();
    global.addEventListener("resize", stickBar, { passive: true });

    function onScroll() { if (head) head.classList.toggle("is-stuck", global.scrollY > 6); }
    global.addEventListener("scroll", onScroll, { passive: true });
    onScroll();

    if (!toggle || !nav) return;
    function close(refocus) {
      document.body.classList.remove("nav-open");
      toggle.setAttribute("aria-expanded", "false");
      toggle.setAttribute("aria-label", "Open the page menu");
      if (refocus) toggle.focus();
    }
    toggle.addEventListener("click", function () {
      var open = toggle.getAttribute("aria-expanded") === "true";
      if (open) { close(false); return; }
      document.body.classList.add("nav-open");
      toggle.setAttribute("aria-expanded", "true");
      toggle.setAttribute("aria-label", "Close the page menu");
      var first = nav.querySelector("a");
      if (first) first.focus();
    });
    nav.addEventListener("click", function (e) { if (e.target.closest("a")) close(false); });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && document.body.classList.contains("nav-open")) close(true);
    });
  }

  /* The directions button is the one place the chrome touches the data. */
  function pointDirections() {
    var btn = document.getElementById("mastDirections");
    var MD = global.MD;
    if (!btn || !MD || !MD.util) return;
    var data = MD.get();
    if (!data || !data.market) return;
    var url = MD.util.mapsDirUrl(data.market.coordinates);
    if (url) btn.href = url;
  }

  function mount() {
    var page = currentPage();
    var frame = document.querySelector(".dk-frame") || document.body;
    if (!frame || frame.querySelector(".masthead")) return;

    var head = buildHeader(page);
    var back = buildBackBar(page);
    var main = frame.querySelector("main") || frame.firstChild;
    frame.insertBefore(head, main);
    if (back) frame.insertBefore(back, main);
    /* the guide keeps its own footer because it carries the accuracy note and
       the replay control — a page never gets two */
    if (!document.querySelector("footer")) frame.appendChild(buildFooter());

    wire();
    wireBack(page);
    pointDirections();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mount);
  else mount();

  global.SiteNav = { PAGES: PAGES };
})(typeof window !== "undefined" ? window : this);
