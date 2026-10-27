/* ============================================================================
   ICHHAPUR Market — admin panel
   ----------------------------------------------------------------------------
   Reads and writes the working set through MD (assets/js/market-data.js), the
   same layer the public pages read, which is what makes an edit show up in the
   other open tabs straight away.

   Two rules hold this file together:
     * Nothing is ever interpolated into innerHTML. Every string from the data
       goes out through textContent or .value, so a store name cannot smuggle
       markup into this panel or into the public pages.
     * Nothing leaves the browser. There is no fetch, no key, no endpoint.
   ========================================================================= */
(function () {
  "use strict";

  var MD = window.MD;
  if (!MD) { return; }
  var U = MD.util;

  function $(sel, root) { return (root || document).querySelector(sel); }
  function $all(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  /* ----------------------------------------------------------- trade colours
     One hue per trade, defined in admin.css as .cat-<id>. The hue always sits
     beside the trade written out in words, so it is never the only label, and a
     trade with no CSS class of its own falls back to the :root value. */
  function catClass(id) {
    var known = !!(DATA && DATA.categories) &&
      DATA.categories.some(function (c) { return c.id === id; });
    return "cat-" + (known ? id : "general");
  }

  function paintCat(node, id) {
    if (!node) return;
    (DATA && DATA.categories ? DATA.categories : []).forEach(function (c) {
      node.classList.remove("cat-" + c.id);
    });
    node.classList.remove("cat-none");
    node.classList.add(id ? catClass(id) : "cat-none");
  }

  /* ------------------------------------------------------------------ state */
  var DATA = null;
  var editIndex = -1;        /* -1 while adding, otherwise an index in DATA.stores */
  var photo = null;          /* { data, w, h, kb } for the picture being edited    */
  var dirty = false;
  var lastTrigger = null;    /* the button that opened the form, for focus on close */
  var filters = { q: "", cat: "", status: "" };

  /* ------------------------------------------------------------------ toast */
  var toastTimer = null;
  var firstDraw = true;
  function toast(msg, bad) {
    var t = $("#toast");
    t.textContent = msg;
    t.classList.toggle("is-bad", !!bad);
    t.hidden = false;
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.hidden = true; }, 4200);
  }

  /* ------------------------------------------------------- storage metering */
  function renderMeter() {
    var raw = "";
    try { raw = window.localStorage.getItem(MD.KEY) || ""; } catch (e) { raw = ""; }
    var used = raw.length;
    var pct = Math.round(used / MD.MAX_BYTES * 100);
    var meter = $("#admMeter");
    meter.textContent = used
      ? "Local draft: " + (used / 1024).toFixed(0) + " KB of the " +
        (MD.MAX_BYTES / 1024 / 1024).toFixed(1) + " MB this browser allows (" + pct + "%)."
      : "No local draft yet — the published file is being shown.";
    meter.classList.toggle("is-near", pct > 80 && pct <= 95);
    meter.classList.toggle("is-over", pct > 95);

    var when = $("#admSavedAt");
    if (DATA && DATA.local && DATA.savedAt) {
      var d = new Date(DATA.savedAt);
      when.textContent = "Last saved here " + (isNaN(d) ? DATA.savedAt : d.toLocaleString());
    } else {
      when.textContent = "Nothing has been changed on this browser.";
    }
    $("#btnReset").disabled = !(DATA && DATA.local);
  }

  /* ------------------------------------------------------------ filter chips */
  function fillCategorySelects() {
    var sel = $("#admCat"), form = $("#fCat");
    [sel, form].forEach(function (node) {
      var keep = node.value;
      $all("option", node).forEach(function (o) { if (o.value !== "") node.removeChild(o); });
      DATA.categories.forEach(function (c) {
        var o = el("option", null, c.label);
        o.value = c.id;
        node.appendChild(o);
      });
      if (keep) node.value = keep;
    });
  }

  function matches(store) {
    if (filters.cat && store.category !== filters.cat) return false;
    if (filters.status && (U.needsConfirmation(store) ? "needs-confirmation" : "listed") !== filters.status) return false;
    if (!filters.q) return true;
    var hay = [
      store.name, store.id, U.catLabel(DATA.categories, store.category),
      store.locality, store.addressLine, store.description, store.note,
      (store.keywords || []).join(" ")
    ].filter(Boolean).join(" ").toLowerCase();
    return hay.indexOf(filters.q) > -1;
  }

  /* --------------------------------------------------------------- the list */
  function positionCell(store) {
    if (!store.coordinates) return el("span", "dim", "not placed");
    var km = U.distanceKm(DATA.market.coordinates, store.coordinates);
    return el("span", null, "≈" + U.formatDistance(km) + " away");
  }

  function buildRow(store, i) {
    var tr = el("tr", catClass(store.category));

    var tdImg = el("td", "c-img");
    var img = U.thumb(store, "rowimg");
    if (img) tdImg.appendChild(img);
    else tdImg.appendChild(el("span", "dim", "—"));
    tr.appendChild(tdImg);

    /* a row header, so a screen reader says which shop every following cell belongs to */
    var tdName = el("th");
    tdName.scope = "row";
    tdName.appendChild(el("span", "rowname", store.name || "(no name)"));
    tdName.appendChild(el("span", "rowid", store.id || "(no id)"));
    if (store.photo) tdName.appendChild(el("span", "rowid", "photo attached"));
    tr.appendChild(tdName);

    var tdCat = el("td");
    tdCat.appendChild(el("span", "tag tag--cat", U.catLabel(DATA.categories, store.category)));
    tr.appendChild(tdCat);

    var tdStatus = el("td");
    tdStatus.appendChild(el("span", "tag " + (U.needsConfirmation(store) ? "tag--warn" : "tag--ok"),
      U.needsConfirmation(store) ? "needs check" : "listed"));
    tr.appendChild(tdStatus);

    var tdPos = el("td");
    tdPos.appendChild(positionCell(store));
    tr.appendChild(tdPos);

    tr.appendChild(el("td", "dim", String((store.sources || []).length || "—")));

    var tdActs = el("td");
    var acts = el("div", "rowacts");
    var edit = el("button", "iconbtn", "Edit");
    edit.type = "button";
    edit.setAttribute("aria-label", "Edit " + (store.name || store.id));
    edit.addEventListener("click", function () { openEditor(i); });
    var del = el("button", "iconbtn iconbtn--danger", "Delete");
    del.type = "button";
    del.setAttribute("aria-label", "Delete " + (store.name || store.id));
    del.addEventListener("click", function () { removeStore(i); });
    acts.appendChild(edit);
    acts.appendChild(del);
    tdActs.appendChild(acts);
    tr.appendChild(tdActs);

    return tr;
  }

  function renderList() {
    var body = $("#admRows");
    body.textContent = "";
    var shown = 0;
    DATA.stores.forEach(function (s, i) {
      if (!matches(s)) return;
      body.appendChild(buildRow(s, i));
      shown++;
    });
    $("#admEmpty").hidden = shown !== 0;

    /* the rows come in once, with the list. Every later redraw is a keystroke in
       the filter or a save, and re-animating the table for those reads as flicker. */
    if (firstDraw) {
      firstDraw = false;
      body.classList.add("is-fresh");
      setTimeout(function () { body.classList.remove("is-fresh"); }, 900);
    }

    var total = DATA.stores.length;
    var checks = DATA.stores.filter(U.needsConfirmation).length;
    var txt = shown + " of " + total + " listing" + (total === 1 ? "" : "s") +
      " shown · " + (total - checks) + " publicly listed · " + checks + " need a door check";
    if (DATA.local) txt += " · local draft";
    $("#admCount").textContent = txt;
  }

  function renderAll() {
    fillCategorySelects();
    paintCat($("#admCatField"), $("#admCat").value);
    renderList();
    renderMeter();
  }

  /* ---------------------------------------------------------------- commits */
  function commit(nextStores, why) {
    var res = MD.save({ market: DATA.market, categories: DATA.categories, stores: nextStores });
    if (!res.ok) {
      if (res.error === "full") {
        toast("This browser's storage is full (" + Math.round(res.used / 1024) + " KB). " +
          "Remove a photo or export the data and discard the draft.", true);
      } else {
        toast("The browser refused to save. Private-mode tabs often block local storage.", true);
      }
      return false;
    }
    DATA = MD.get();
    renderAll();
    if (why) toast(why);
    return true;
  }

  function removeStore(i) {
    var store = DATA.stores[i];
    var label = store.name || store.id || "this listing";
    if (!window.confirm("Delete “" + label + "”?\n\n" +
      "It disappears from the guide and the landing page in this browser right away. " +
      "The published file is untouched until you export over it, so “Discard local draft” " +
      "would bring it back.")) return;
    var next = DATA.stores.slice();
    next.splice(i, 1);
    if (editIndex === i) {
      /* the row that opened this form is about to be deleted, so send focus to
         a button that survives the re-render instead */
      lastTrigger = null;
      closeEditor(true);
    } else if (editIndex > i) {
      editIndex--;
    }
    commit(next, "Deleted “" + label + "”.");
  }

  /* ---------------------------------------------------------------- editor */
  var F = {
    name: "#fName", id: "#fId", cat: "#fCat", status: "#fStatus",
    locality: "#fLocality", address: "#fAddress", link: "#fLink",
    lat: "#fLat", lng: "#fLng", posLabel: "#fPosLabel", note: "#fDir",
    desc: "#fDesc", phone: "#fPhone", hours: "#fHours", keys: "#fKeys",
    photoAlt: "#fPhotoAlt"
  };
  function field(name) { return $(F[name]); }
  function val(name) { var n = field(name); return n ? n.value.trim() : ""; }

  function setVal(name, v) { var n = field(name); if (n) n.value = v == null ? "" : v; }

  function markBad(name, bad) {
    var n = field(name);
    if (!n) return;
    var wrap = n.closest ? n.closest(".field") : null;
    if (wrap) wrap.classList.toggle("is-bad", !!bad);
  }

  function clearBad() {
    $all(".field.is-bad").forEach(function (n) { n.classList.remove("is-bad"); });
    $all(".grp.is-bad").forEach(function (n) { n.classList.remove("is-bad"); });
  }

  /* --- sources ------------------------------------------------------------ */
  var srcSeq = 0;

  function srcRow(src) {
    src = src || { label: "", url: "", checked: "" };
    var row = el("div", "src");
    var n = ++srcSeq;

    var fLab = el("div", "field src__label");
    var iLab = el("input");
    iLab.type = "text"; iLab.className = "src__lab"; iLab.autocomplete = "off";
    iLab.id = "srcLab" + n;
    iLab.value = src.label || "";
    iLab.placeholder = "JustDial — Sumitra Medical Store, Ichhapur";
    var l1 = el("label", "field__label", "Where it came from");
    l1.htmlFor = iLab.id;
    fLab.appendChild(l1); fLab.appendChild(iLab);
    row.appendChild(fLab);

    var fUrl = el("div", "field");
    var iUrl = el("input");
    iUrl.type = "url"; iUrl.className = "src__url"; iUrl.autocomplete = "off";
    iUrl.id = "srcUrl" + n;
    iUrl.value = src.url || "";
    iUrl.placeholder = "https://…";
    var l2 = el("label", "field__label", "Link");
    l2.htmlFor = iUrl.id;
    fUrl.appendChild(l2); fUrl.appendChild(iUrl);
    row.appendChild(fUrl);

    var fDate = el("div", "field");
    var iDate = el("input");
    iDate.type = "date"; iDate.className = "src__chk";
    iDate.id = "srcChk" + n;
    iDate.value = src.checked || "";
    var l3 = el("label", "field__label", "Read on");
    l3.htmlFor = iDate.id;
    fDate.appendChild(l3); fDate.appendChild(iDate);
    row.appendChild(fDate);

    var del = el("button", "iconbtn iconbtn--danger src__del", "Remove");
    del.type = "button";
    del.setAttribute("aria-label", "Remove this source");
    del.addEventListener("click", function () {
      row.parentNode.removeChild(row);
      dirty = true;
    });
    row.appendChild(del);

    $all("input", row).forEach(function (i) {
      i.addEventListener("input", function () { dirty = true; });
    });
    return row;
  }

  function readSources() {
    var out = [];
    $all("#srcRows .src").forEach(function (row) {
      var label = $(".src__lab", row).value.trim();
      var url = $(".src__url", row).value.trim();
      var checked = $(".src__chk", row).value;
      if (!label && !url) return;
      out.push({ label: label, url: url, checked: checked || null });
    });
    return out;
  }

  /* --- photo -------------------------------------------------------------- */
  function showPhoto() {
    var img = $("#photoImg"), tag = $("#photoTag");
    if (photo) {
      img.hidden = false;
      img.src = photo.data;
      img.alt = val("photoAlt") || "Photograph attached to this listing";
      tag.textContent = (photo.w ? photo.w + "×" + photo.h + " · " : "") +
        "~" + photo.kb + " KB stored here";
    } else {
      img.removeAttribute("src");
      img.hidden = true;
      img.alt = "";
      var art = U.artFor(val("cat"));
      if (art) {
        img.hidden = false;
        img.src = art;
        img.alt = "";
        tag.textContent = "the trade drawing stands in";
      } else {
        tag.textContent = "no picture";
      }
    }
  }

  function readPhoto(file) {
    if (!file) { photo = null; showPhoto(); return; }
    if (!/^image\//.test(file.type)) {
      $("#photoMsg").textContent = "That is not an image file.";
      return;
    }
    $("#photoMsg").textContent = "Reading the picture…";
    var fr = new FileReader();
    fr.onerror = function () { $("#photoMsg").textContent = "The browser could not read that file."; };
    fr.onload = function () {
      var im = new Image();
      im.onerror = function () { $("#photoMsg").textContent = "That file is not a picture the browser can open."; };
      im.onload = function () {
        /* Down-scale before it is ever stored: a phone photo is 4 MB of text
           once base64'd, and the whole draft has ~3.6 MB to live in. */
        var cap = 1280;
        var scale = Math.min(cap / im.width, cap / im.height, 1);
        var w = Math.max(1, Math.round(im.width * scale));
        var h = Math.max(1, Math.round(im.height * scale));
        var cv = document.createElement("canvas");
        cv.width = w; cv.height = h;
        cv.getContext("2d").drawImage(im, 0, 0, w, h);
        var data;
        try { data = cv.toDataURL("image/jpeg", 0.82); } catch (e) { data = null; }
        if (!data) { $("#photoMsg").textContent = "The browser refused to re-encode that image."; return; }
        photo = { data: data, w: w, h: h, kb: Math.round(data.length * 0.75 / 1024) };
        $("#photoMsg").textContent = "Shrunk from " + im.width + "×" + im.height + " to " + w + "×" + h + ".";
        showPhoto();
        dirty = true;
      };
      im.src = fr.result;
    };
    fr.readAsDataURL(file);
  }

  /* --- open / close ------------------------------------------------------- */
  /* The card wears the trade it is editing — border, photo frame, and the trade
     and status selects — so opening a row and reading the table agree. */
  function paintEditor() {
    var cat = field("cat") ? field("cat").value : "";
    var stat = field("status") ? field("status").value : "";
    paintCat($("#editor"), cat);
    paintCat(field("cat") ? field("cat").closest(".field") : null, cat);
    var statField = field("status") ? field("status").closest(".field") : null;
    if (statField) {
      statField.classList.toggle("is-warn", stat !== "listed");
      statField.classList.toggle("is-ok", stat === "listed");
    }
  }

  function openEditor(index) {
    var store = index < 0 ? U.blankStore() : DATA.stores[index];
    var a = document.activeElement;
    lastTrigger = a && a !== document.body && a.focus ? a : null;
    editIndex = index;
    dirty = false;
    clearBad();
    $("#edErr").hidden = true;
    $("#edSaved").textContent = "";

    setVal("name", store.name);
    setVal("id", store.id);
    field("cat").value = store.category || "general";
    field("status").value = U.needsConfirmation(store) ? "needs-confirmation" : "listed";
    paintEditor();
    setVal("locality", store.locality);
    setVal("address", store.addressLine);
    setVal("link", store.coordinates ? store.coordinates.lat + ", " + store.coordinates.lng : "");
    setVal("lat", store.coordinates ? store.coordinates.lat : "");
    setVal("lng", store.coordinates ? store.coordinates.lng : "");
    setVal("posLabel", store.coordinatesLabel);
    setVal("note", store.note);
    setVal("desc", store.description);
    setVal("phone", store.phone);
    setVal("hours", store.hours);
    setVal("keys", (store.keywords || []).join(", "));
    setVal("photoAlt", store.photoAlt);

    photo = store.photo ? { data: store.photo, w: 0, h: 0, kb: Math.round(store.photo.length * 0.75 / 1024) } : null;
    $("#fPhoto").value = "";
    $("#photoMsg").textContent = "";
    showPhoto();

    var rows = $("#srcRows");
    rows.textContent = "";
    (store.sources || []).forEach(function (s) { rows.appendChild(srcRow(s)); });
    if (!(store.sources || []).length) rows.appendChild(srcRow());

    $("#parseMsg").textContent = "";
    $("#edTitle").textContent = index < 0 ? "Add a store" : store.name || "Edit a listing";
    $("#edSub").textContent = index < 0
      ? "A new listing starts as “needs confirmation”, because nothing has checked it."
      : "Editing listing " + (index + 1) + " of " + DATA.stores.length + ".";
    $("#btnDelete").hidden = index < 0;

    var box = $("#editor");
    box.hidden = false;
    box.scrollIntoView({ block: "start" });
    field("name").focus();
  }

  function closeEditor(skipConfirm) {
    if (!skipConfirm && dirty &&
        !window.confirm("Close without saving? The changes in this form will be lost.")) return;
    $("#editor").hidden = true;
    dirty = false;
    editIndex = -1;
    photo = null;
    /* back to the button that opened the form — unless the list has since been
       redrawn and that row's button no longer exists */
    if (lastTrigger && lastTrigger.isConnected) {
      lastTrigger.focus();
    } else {
      $("#btnAdd").focus();
    }
    lastTrigger = null;
  }

  /* --- validate + read ---------------------------------------------------- */
  function collect() {
    clearBad();
    var problems = [];
    function bad(name, msg) { markBad(name, true); problems.push(msg); }

    var name = val("name");
    if (!name) bad("name", "The store needs a name.");

    var id = U.slug(val("id") || name);
    if (!id) bad("id", "Could not build an address id — give the store a name or type one.");
    var clash = DATA.stores.some(function (s, i) { return i !== editIndex && s.id === id; });
    if (id && clash) bad("id", "Another listing already uses the id “" + id + "”.");

    var lat = val("lat"), lng = val("lng");
    var coordinates = null, coordsBad = false;
    if (lat || lng) {
      var a = parseFloat(lat), b = parseFloat(lng);
      if (isNaN(a) || isNaN(b)) { bad("lat", "Latitude and longitude must both be numbers."); coordsBad = true; }
      else if (a < -90 || a > 90) { bad("lat", "Latitude must be between −90 and 90."); coordsBad = true; }
      else if (b < -180 || b > 180) { bad("lng", "Longitude must be between −180 and 180."); coordsBad = true; }
      else coordinates = { lat: a, lng: b };
      if (!coordsBad) {
        var km = U.distanceKm(DATA.market.coordinates, coordinates);
        if (km != null && km > 60) {
          bad("lat", "That point is " + U.formatDistance(km) + " from the market. " +
            "Check you have not picked a differently named village.");
          coordsBad = true;
        }
      }
    }

    var sources = readSources();
    var srcBad = false;
    sources.forEach(function (s, i) {
      if (!s.label) { problems.push("Source " + (i + 1) + " has no name."); srcBad = true; }
      if (!/^https?:\/\//i.test(s.url || "")) {
        problems.push("Source " + (i + 1) + " needs a link starting with http:// or https://");
        srcBad = true;
      }
    });
    if (srcBad) {
      var groupBox = $("#srcRows").closest(".grp");
      if (groupBox) groupBox.classList.add("is-bad");
    }

    var status = field("status").value;
    if (status === "listed" && !sources.length) {
      bad("status", "A listing can only be “publicly listed” if it names at least one source.");
    }

    var phone = val("phone");
    if (phone && !/^[+0-9][0-9 \-().]{5,19}$/.test(phone)) {
      bad("phone", "That does not look like a telephone number.");
    }

    if (problems.length) {
      var box = $("#edErr");
      box.textContent = "";
      box.appendChild(el("strong", null, "Not saved. " + problems.length +
        (problems.length === 1 ? " thing" : " things") + " to fix:"));
      var ul = el("ul");
      problems.forEach(function (p) { ul.appendChild(el("li", null, p)); });
      box.appendChild(ul);
      box.hidden = false;
      return null;
    }
    $("#edErr").hidden = true;

    var keys = val("keys").split(",").map(function (k) { return k.trim(); }).filter(Boolean);

    return {
      id: id,
      name: name,
      category: field("cat").value,
      status: status,
      locality: val("locality") || null,
      addressLine: val("address") || null,
      coordinates: coordinates,
      coordinatesLabel: coordinates ? (val("posLabel") || "Position entered by hand") : null,
      phone: phone || null,
      hours: val("hours") || null,
      description: val("desc") || null,
      keywords: keys,
      note: val("note") || null,
      sources: sources,
      photo: photo ? photo.data : null,
      photoAlt: val("photoAlt") || null
    };
  }

  function saveForm(ev) {
    if (ev) ev.preventDefault();
    var next = collect();
    if (!next) {
      var firstBad = $(".field.is-bad input, .field.is-bad select, .field.is-bad textarea");
      if (firstBad) firstBad.focus();
      toast("The listing was not saved — see the list above the buttons.", true);
      return;
    }

    var list = DATA.stores.slice();
    if (editIndex < 0) list.push(next);
    else list[editIndex] = next;

    if (!commit(list, null)) return;

    dirty = false;
    editIndex = editIndex < 0 ? list.length - 1 : editIndex;
    $("#edTitle").textContent = next.name;
    $("#btnDelete").hidden = false;
    $("#edSaved").textContent = "Saved. The guide and the landing page in every other tab of " +
      "this browser just re-rendered. Visitors elsewhere still see the published file until you export.";
    toast("Saved “" + next.name + "”.");
  }

  /* ---------------------------------------------------------------- export */
  function download(text) {
    var blob = new Blob([text], { type: "application/json" });
    var url = URL.createObjectURL(blob);
    var a = el("a");
    a.href = url;
    a.download = "ichhapur-stores.json";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
  }

  function openExport() {
    var text = MD.exportJson();
    if (!text) { toast("There is nothing to export yet.", true); return; }
    var box = $("#exportBox");
    var pre = $("#exportText");
    pre.textContent = "";
    pre.hidden = true;
    box.hidden = false;
    $("#btnShow").textContent = "Show the text";
    box.scrollIntoView({ block: "start" });
    toast("Export ready: " + (text.length / 1024).toFixed(0) + " KB.");
  }

  /* ------------------------------------------------------------------ boot */
  function wire() {
    $("#admSearch").addEventListener("input", function () {
      filters.q = this.value.trim().toLowerCase();
      renderList();
    });
    $("#admCat").addEventListener("change", function () {
      filters.cat = this.value;
      paintCat($("#admCatField"), this.value);
      renderList();
    });
    $("#admStatus").addEventListener("change", function () { filters.status = this.value; renderList(); });
    $("#btnClear").addEventListener("click", function () {
      filters = { q: "", cat: "", status: "" };
      $("#admSearch").value = "";
      $("#admCat").value = "";
      $("#admStatus").value = "";
      paintCat($("#admCatField"), "");
      renderList();
    });

    $("#btnAdd").addEventListener("click", function () { openEditor(-1); });
    $("#btnCancel").addEventListener("click", function () { closeEditor(false); });
    $("#btnDelete").addEventListener("click", function () {
      if (editIndex >= 0) removeStore(editIndex);
    });
    $("#edForm").addEventListener("submit", saveForm);
    $("#edForm").addEventListener("input", function () { dirty = true; });

    /* changing the trade re-paints the card and swaps the stand-in drawing */
    ["#fCat", "#fStatus"].forEach(function (sel) {
      $(sel).addEventListener("change", function () {
        paintEditor();
        if (sel === "#fCat") showPhoto();
      });
    });

    $("#btnAddSrc").addEventListener("click", function (ev) {
      ev.preventDefault();
      $("#srcRows").appendChild(srcRow());
      dirty = true;
    });

    $("#btnParse").addEventListener("click", function (ev) {
      ev.preventDefault();
      var msg = $("#parseMsg");
      var got = U.parseMaps(val("link"));
      if (!got) {
        msg.textContent = "No position found in that text.";
        msg.className = "parse is-bad";
        return;
      }
      setVal("lat", got.lat);
      setVal("lng", got.lng);
      var km = U.distanceKm(DATA.market.coordinates, got);
      msg.textContent = "Read " + got.lat + ", " + got.lng + " — about " +
        U.formatDistance(km) + " from the market point.";
      msg.className = "parse is-ok";
      if (!val("posLabel")) {
        setVal("posLabel", "Position taken from the map link pasted above");
      }
      dirty = true;
    });

    $("#fPhoto").addEventListener("change", function () { readPhoto(this.files && this.files[0]); });
    $("#btnPhotoClear").addEventListener("click", function (ev) {
      ev.preventDefault();
      photo = null;
      $("#fPhoto").value = "";
      $("#photoMsg").textContent = "The listing falls back to its trade drawing.";
      showPhoto();
      dirty = true;
    });

    $("#btnExport").addEventListener("click", openExport);
    $("#btnDownload").addEventListener("click", function () {
      var text = MD.exportJson();
      if (text) download(text);
    });
    $("#btnShow").addEventListener("click", function () {
      var pre = $("#exportText");
      if (pre.hidden) {
        pre.textContent = MD.exportJson() || "";
        pre.hidden = false;
        this.textContent = "Hide the text";
      } else {
        pre.hidden = true;
        this.textContent = "Show the text";
      }
    });
    $("#btnCloseExport").addEventListener("click", function () { $("#exportBox").hidden = true; });

    $("#btnReset").addEventListener("click", function () {
      if (!window.confirm("Discard every change made in this browser and go back to the " +
        "published file? Export first if you want to keep them.")) return;
      DATA = MD.reset();
      closeEditor(true);
      renderAll();
      toast("Local draft discarded — the published listings are showing again.");
    });

    window.addEventListener("beforeunload", function (ev) {
      if (!dirty) return;
      ev.returnValue = "";
      return "";
    });

    MD.onChange(function (next) {
      if (!next) return;
      /* another tab saved — refresh the list, but never overwrite an open form */
      DATA = next;
      renderList();
      renderMeter();
      if (!$("#editor").hidden) toast("Another tab just saved. The list refreshed; this form is still yours.");
    });
  }

  function boot() {
    DATA = MD.get();
    if (!DATA) {
      $("#admCount").textContent = "data/stores.js did not load, so there is nothing to edit.";
      $("#admList").hidden = true;
      $("#btnAdd").disabled = true;
      return;
    }
    wire();
    renderAll();

    var params = new URLSearchParams(location.search);
    var open = params.get("edit");
    if (open) {
      var i = DATA.stores.findIndex(function (s) { return s.id === open; });
      if (i > -1) openEditor(i);
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else { boot(); }
})();
