/*
 * Shared shell for the dashboard pages: app bar, loading the stored metrics from the
 * Worker API, history, and the "Update data" flow (drop export.zip -> parse locally in a
 * Web Worker -> upload only the aggregated JSON).
 *
 * Usage on a page:  HealthApp.init({ page: "longevity", render: function (data) { ... } });
 */
(function () {
  "use strict";

  var API = "api/snapshots";
  var LOCAL_KEY = "health-dashboard-local-snapshot";
  var KEY_STORE = "health-dashboard-upload-key";
  var state = { data: null, meta: null, page: null };

  function $(sel, root) { return (root || document).querySelector(sel); }
  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }
  function pad2(n) { return n < 10 ? "0" + n : String(n); }
  function fmtDate(iso) { // "2026-09-22" -> "22.09.2026"
    if (!iso) return "–";
    var p = iso.slice(0, 10).split("-");
    return p[2] + "." + p[1] + "." + p[0];
  }
  function fmtDateTime(iso) {
    if (!iso) return "–";
    var d = new Date(iso);
    return pad2(d.getDate()) + "." + pad2(d.getMonth() + 1) + "." + d.getFullYear() + " " + pad2(d.getHours()) + ":" + pad2(d.getMinutes());
  }
  function params() { return new URLSearchParams(location.search); }
  function safeGet(k) { try { return sessionStorage.getItem(k); } catch (e) { return null; } }
  function safeSet(k, v) { try { sessionStorage.setItem(k, v); return true; } catch (e) { return false; } }
  function keyGet() { try { return localStorage.getItem(KEY_STORE); } catch (e) { return null; } }
  function keySet(v) { try { localStorage.setItem(KEY_STORE, v); } catch (e) {} }

  // ---------- app bar ----------
  function buildBar() {
    var bar = $("#appbar");
    bar.className = "appbar";
    var left = el("div", "appbar-left");
    left.appendChild(el("span", "brand", "Health dashboard"));
    var nav = el("nav", "appnav");
    [["longevity", "Longevity", "./"], ["weight", "Weight", "weight.html"]].forEach(function (n) {
      var a = el("a", n[0] === state.page ? "active" : "", n[1]);
      a.href = n[2] + location.search.replace(/([?&])local=1/, "$1");
      nav.appendChild(a);
    });
    left.appendChild(nav);
    bar.appendChild(left);

    var right = el("div", "appbar-right");
    var status = el("span", "data-status");
    status.id = "dataStatus";
    right.appendChild(status);
    var hist = el("select", "history");
    hist.id = "historySelect";
    hist.title = "Show an earlier upload";
    hist.hidden = true;
    hist.addEventListener("change", function () {
      var v = hist.value;
      location.href = location.pathname + (v === "latest" ? "" : "?snapshot=" + encodeURIComponent(v));
    });
    right.appendChild(hist);
    var dl = el("button", "btn ghost", "Download JSON");
    dl.type = "button";
    dl.id = "downloadBtn";
    dl.hidden = true;
    dl.addEventListener("click", downloadJson);
    right.appendChild(dl);
    var up = el("button", "btn primary", "Update data");
    up.type = "button";
    up.addEventListener("click", function () { openUpload(); });
    right.appendChild(up);
    bar.appendChild(right);
  }

  function setStatus(text, warn) {
    var s = $("#dataStatus");
    s.textContent = text;
    s.classList.toggle("warn", !!warn);
  }

  function downloadJson() {
    if (!state.data) return;
    var blob = new Blob([JSON.stringify(state.data)], { type: "application/json" });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "health-metrics-" + (state.data.exportDate || "export") + ".json";
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  }

  // ---------- loading ----------
  async function fetchJson(url) {
    var r = await fetch(url, { cache: "no-store" });
    if (r.status === 404) return { missing: true };
    if (!r.ok) throw new Error("Server returned " + r.status);
    var ct = r.headers.get("content-type") || "";
    if (ct.indexOf("json") < 0) throw new Error("No API at this address");
    return { data: await r.json(), id: r.headers.get("x-snapshot-id"), uploadedAt: r.headers.get("x-uploaded-at") };
  }

  async function loadHistory(currentId) {
    try {
      var r = await fetch(API, { cache: "no-store" });
      if (!r.ok) return;
      var list = await r.json();
      if (!Array.isArray(list) || list.length < 2) return;
      var sel = $("#historySelect");
      sel.innerHTML = "";
      list.forEach(function (it, i) {
        var o = el("option", null, (i === 0 ? "Latest: " : "") + "export " + fmtDate(it.exportDate) + " · uploaded " + fmtDateTime(it.uploadedAt || it.id));
        o.value = i === 0 ? "latest" : it.id;
        if ((currentId && it.id === currentId && i > 0)) o.selected = true;
        sel.appendChild(o);
      });
      sel.hidden = false;
      if (!state.meta.local) $("#dataStatus").hidden = true;   // the selector already shows export + upload date
    } catch (e) { /* history is optional */ }
  }

  function show(data, meta) {
    state.data = data;
    state.meta = meta || {};
    $("#downloadBtn").hidden = false;
    var dash = $("#dashboard");
    dash.hidden = false;
    var empty = $("#emptyState");
    if (empty) empty.remove();
    var txt = "Export of " + fmtDate(data.exportDate);
    if (state.meta.local) txt += " · shown locally, not saved";
    else if (state.meta.uploadedAt) txt += " · uploaded " + fmtDateTime(state.meta.uploadedAt);
    setStatus(txt, !!state.meta.local);
    state.render(data);
  }

  function showEmpty(reason) {
    $("#dashboard").hidden = true;
    var box = $("#emptyState") || el("div", "empty-state");
    box.id = "emptyState";
    box.innerHTML = "";
    box.appendChild(el("h2", null, "No data yet"));
    box.appendChild(el("p", null, reason || "Drop your Apple Health export.zip here to build the dashboard."));
    box.appendChild(buildDropZone());
    box.appendChild(privacyNote());
    $("#dashboard").parentNode.insertBefore(box, $("#dashboard"));
    setStatus("No data");
  }

  async function load() {
    var p = params();
    if (p.get("local") === "1") {
      var raw = safeGet(LOCAL_KEY);
      if (raw) {
        var parsed = JSON.parse(raw);
        return show(parsed.data, { local: true, reason: parsed.reason });
      }
    }
    var snap = p.get("snapshot");
    try {
      var res = await fetchJson(API + "/" + (snap ? encodeURIComponent(snap) : "latest"));
      if (res.missing) return showEmpty(snap ? "That snapshot doesn’t exist (any more)." : null);
      show(res.data, { id: res.id, uploadedAt: res.uploadedAt });
      loadHistory(snap);
    } catch (e) {
      showEmpty("The data server isn’t reachable (" + e.message + "). You can still drop an export here — it will be shown locally without being saved.");
    }
  }

  // ---------- upload flow ----------
  function privacyNote() {
    return el("p", "privacy",
      "Your export is processed entirely in this browser. Only the aggregated daily numbers the dashboard shows (a few hundred KB) are uploaded — never the raw export.");
  }

  function buildDropZone() {
    var zone = el("label", "dropzone");
    var input = el("input");
    input.type = "file";
    input.accept = ".zip,.xml,.json,application/zip,text/xml,application/json";
    input.hidden = true;
    zone.appendChild(input);
    zone.appendChild(el("span", "dz-title", "Drop export.zip here"));
    zone.appendChild(el("span", "dz-sub", "or click to choose it · Health app → profile → Export All Health Data"));
    input.addEventListener("change", function () { if (input.files[0]) startParse(input.files[0]); });
    ["dragenter", "dragover"].forEach(function (ev) {
      zone.addEventListener(ev, function (e) { e.preventDefault(); zone.classList.add("over"); });
    });
    ["dragleave", "drop"].forEach(function (ev) {
      zone.addEventListener(ev, function (e) { e.preventDefault(); zone.classList.remove("over"); });
    });
    zone.addEventListener("drop", function (e) {
      var f = e.dataTransfer && e.dataTransfer.files[0];
      if (f) startParse(f);
    });
    return zone;
  }

  var modal;
  function openUpload() {
    if (!modal) {
      modal = el("div", "modal-backdrop");
      var box = el("div", "modal");
      var close = el("button", "modal-close", "×");
      close.type = "button";
      close.setAttribute("aria-label", "Close");
      close.addEventListener("click", closeUpload);
      box.appendChild(close);
      box.appendChild(el("h2", null, "Update data"));
      box.appendChild(el("p", null, "Drop a new Apple Health export. The dashboard keeps every upload, so you can look back at earlier versions."));
      var body = el("div", "modal-body");
      body.id = "uploadBody";
      box.appendChild(body);
      modal.appendChild(box);
      modal.addEventListener("click", function (e) { if (e.target === modal) closeUpload(); });
      document.body.appendChild(modal);
    }
    var b = $("#uploadBody");
    b.innerHTML = "";
    b.appendChild(buildDropZone());
    b.appendChild(privacyNote());
    modal.hidden = false;
  }
  function closeUpload() { if (modal && !modal.dataset.busy) modal.hidden = true; }

  function progressUI() {
    var host = modal && !modal.hidden ? $("#uploadBody") : $("#emptyState");
    host.innerHTML = "";
    var wrap = el("div", "progress-wrap");
    var label = el("div", "progress-label", "Opening file…");
    var bar = el("div", "progress");
    var fill = el("div", "progress-fill");
    bar.appendChild(fill);
    wrap.appendChild(label);
    wrap.appendChild(bar);
    host.appendChild(wrap);
    return {
      host: host,
      set: function (frac, text) { fill.style.width = Math.round(frac * 100) + "%"; if (text) label.textContent = text; },
      error: function (msg) {
        host.innerHTML = "";
        host.appendChild(el("p", "error", msg));
        host.appendChild(buildDropZone());
      }
    };
  }

  function startParse(file) {
    if (modal) modal.dataset.busy = "1";
    var ui = progressUI();
    if (/\.json$/i.test(file.name)) {
      // A metrics file saved with "Download JSON" (e.g. a backup) - upload it as is.
      file.text().then(function (txt) {
        var data = JSON.parse(txt);
        if (!data || data.schema !== 1 || !data.panels) throw new Error("not a dashboard metrics file");
        ui.set(0.9, "Uploading\u2026");
        upload(data, ui);
      }).catch(function (e) {
        if (modal) delete modal.dataset.busy;
        ui.error("Couldn\u2019t use this JSON file: " + e.message);
      });
      return;
    }
    var t0 = Date.now();
    var worker = new Worker("js/parser-worker.js");
    worker.onmessage = function (e) {
      var m = e.data;
      if (m.type === "progress") {
        var secs = Math.round((Date.now() - t0) / 1000);
        ui.set(m.fraction * 0.95, m.phase + " … " + Math.round(m.fraction * 100) + "% (" + secs + " s)");
      } else if (m.type === "done") {
        worker.terminate();
        ui.set(0.97, "Uploading the aggregated numbers…");
        upload(m.result, ui);
      } else if (m.type === "error") {
        worker.terminate();
        if (modal) delete modal.dataset.busy;
        ui.error("Couldn’t read the export: " + m.message);
      }
    };
    worker.onerror = function (err) {
      if (modal) delete modal.dataset.busy;
      ui.error("The parser stopped: " + (err.message || "unknown error") + ". Please use a current Chrome, Edge, Firefox or Safari.");
    };
    worker.postMessage({ file: file });
  }

  async function upload(result, ui, retried) {
    var body = JSON.stringify(result);
    try {
      var headers = { "content-type": "application/json" };
      var k = keyGet();
      if (k) headers["x-upload-key"] = k;
      var r = await fetch(API, { method: "POST", headers: headers, body: body });
      if (r.status === 401 && !retried) {
        var entered = window.prompt("This dashboard requires an upload key:");
        if (entered) { keySet(entered); return upload(result, ui, true); }
      }
      var ct = r.headers.get("content-type") || "";
      if (!r.ok || ct.indexOf("json") < 0) throw new Error(r.status === 401 ? "wrong upload key" : "server returned " + r.status);
      var res = await r.json();
      ui.set(1, "Saved.");
      // Open the new snapshot by id (always fresh, even while KV caches "latest" at the edge).
      location.href = location.pathname + "?snapshot=" + encodeURIComponent(res.id);
    } catch (e) {
      var reason = "Not saved to the server (" + e.message + ").";
      if (safeSet(LOCAL_KEY, JSON.stringify({ data: result, reason: reason }))) {
        location.href = location.pathname + "?local=1";
      } else {
        if (modal) { delete modal.dataset.busy; modal.hidden = true; }
        show(result, { local: true });
      }
    }
  }

  window.HealthApp = {
    init: function (opts) {
      state.page = opts.page;
      state.render = opts.render;
      buildBar();
      load();
    }
  };
})();
