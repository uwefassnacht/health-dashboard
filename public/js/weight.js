/* Rendering code for the weight page. Called by app.js with the loaded metrics. */
window.renderWeight = function (METRICS) {
  "use strict";
  var DATA = METRICS.weight || [];
  var DAY_MS = 86400000;
  var MONTH_ABBR_DE = ["Jan","Feb","Mär","Apr","Mai","Jun","Jul","Aug","Sep","Okt","Nov","Dez"];

  function fmtDateDE(iso) {
    var p = iso.split("-");
    return p[2] + "." + p[1] + "." + p[0];
  }
  function fmtDDMM(t) {
    var d = new Date(t);
    return pad2(d.getUTCDate()) + "." + pad2(d.getUTCMonth() + 1) + ".";
  }
  function fmtMonthYearDE(t) {
    var d = new Date(t);
    return MONTH_ABBR_DE[d.getUTCMonth()] + " " + d.getUTCFullYear();
  }
  function fmtKg(v) {
    return v.toLocaleString("de-DE", { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + " kg";
  }
  function fmtKgSigned(v) {
    var sign = v > 0.001 ? "+" : (v < -0.001 ? "−" : "±");
    return sign + Math.abs(v).toLocaleString("de-DE", { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + " kg";
  }
  function parseISO(iso) {
    var p = iso.split("-");
    return Date.UTC(+p[0], +p[1] - 1, +p[2]);
  }
  function isoFromTime(t) {
    var d = new Date(t);
    return d.getUTCFullYear() + "-" + pad2(d.getUTCMonth() + 1) + "-" + pad2(d.getUTCDate());
  }
  function pad2(n) { return n < 10 ? "0" + n : String(n); }

  var dates = DATA.map(function (d) { return d[0]; });
  var values = DATA.map(function (d) { return d[1]; });
  var times = dates.map(parseISO);
  var n = DATA.length;

  // ---- header / subtitle ----
  document.getElementById("subtitle").textContent =
    "Daily readings from " + fmtDateDE(dates[0]) + " to " + fmtDateDE(dates[n - 1]) + ", with 30-day and 365-day rolling averages (all values in kg)";
  document.getElementById("pointCount").textContent = n.toLocaleString("de-DE");

  // ---- rolling averages, recalculated for every day (trailing N-day window,
  // by calendar time rather than reading count, so gaps in the data don't
  // distort the window; the window shrinks near the start of the series) ----
  function rollingAverage(windowDays) {
    var windowMs = (windowDays - 1) * DAY_MS;
    var result = new Array(n);
    var start = 0, sum = 0;
    for (var i = 0; i < n; i++) {
      sum += values[i];
      while (times[start] < times[i] - windowMs) { sum -= values[start]; start++; }
      result[i] = sum / (i - start + 1);
    }
    return result;
  }
  var monthlyValues = rollingAverage(30);
  var yearlyValues = rollingAverage(365);
  // rolling series share the same x-position as the daily readings
  var monthlyTimes = times, yearlyTimes = times;

  // ---- stats ----
  var current = values[n - 1];
  var currentDate = dates[n - 1];
  var minIdx = 0, maxIdx = 0;
  for (var i = 1; i < n; i++) {
    if (values[i] < values[minIdx]) minIdx = i;
    if (values[i] > values[maxIdx]) maxIdx = i;
  }

  var stats = [
    { label: "Current", value: fmtKg(current), sub: fmtDateDE(currentDate) },
    { label: "All-time low", value: fmtKg(values[minIdx]), sub: fmtDateDE(dates[minIdx]) },
    { label: "All-time high", value: fmtKg(values[maxIdx]), sub: fmtDateDE(dates[maxIdx]) }
  ];

  // compare today's rolling average to the rolling average exactly one
  // window-length ago (e.g. today's 7-day average vs. the 7-day average
  // as of 7 days ago) - two non-overlapping windows, still built from daily data
  function rollingDelta(rollingArr, windowDays) {
    var targetT = times[n - 1] - windowDays * DAY_MS;
    if (targetT < times[0]) return null;
    var idx = nearestIndexIn(times, targetT);
    return { now: rollingArr[n - 1], prev: rollingArr[idx] };
  }

  var mDelta = rollingDelta(monthlyValues, 30);
  if (mDelta) {
    stats.push({
      label: "Monthly avg vs. last month",
      value: fmtKgSigned(mDelta.now - mDelta.prev),
      sub: "previous month: " + fmtKg(mDelta.prev)
    });
  } else {
    stats.push({ label: "Monthly avg vs. last month", value: "–", sub: "not enough data" });
  }

  var yDelta = rollingDelta(yearlyValues, 365);
  if (yDelta) {
    stats.push({
      label: "Yearly avg vs. last year",
      value: fmtKgSigned(yDelta.now - yDelta.prev),
      sub: "previous year: " + fmtKg(yDelta.prev)
    });
  } else {
    stats.push({ label: "Yearly avg vs. last year", value: "–", sub: "not enough data" });
  }

  var statRow = document.getElementById("statRow");
  stats.forEach(function (s) {
    var tile = document.createElement("div");
    tile.className = "stat-tile";
    var lab = document.createElement("div");
    lab.className = "label";
    lab.textContent = s.label;
    var val = document.createElement("div");
    val.className = "value";
    val.textContent = s.value;
    var sub = document.createElement("div");
    sub.className = "sub";
    sub.textContent = s.sub;
    tile.appendChild(lab);
    tile.appendChild(val);
    tile.appendChild(sub);
    statRow.appendChild(tile);
  });

  // ---- chart geometry ----
  var svg = document.getElementById("chart");
  var svgNS = "http://www.w3.org/2000/svg";
  var W = 1280, H = 520;
  var M = { top: 16, right: 20, bottom: 30, left: 54 };
  var plotW = W - M.left - M.right;
  var plotH = H - M.top - M.bottom;
  svg.setAttribute("viewBox", "0 0 " + W + " " + H);
  svg.setAttribute("preserveAspectRatio", "xMidYMid meet");

  var fullT0 = times[0];
  var fullT1 = times[n - 1];
  var domainT0 = fullT0, domainT1 = fullT1;
  var MIN_SPAN_MS = 3 * DAY_MS;

  var xScale, yScale;

  function svgEl(tag, attrs) {
    var el = document.createElementNS(svgNS, tag);
    for (var k in attrs) el.setAttribute(k, attrs[k]);
    return el;
  }

  function lowerBound(arr, target) {
    var lo = 0, hi = arr.length;
    while (lo < hi) { var mid = (lo + hi) >> 1; if (arr[mid] < target) lo = mid + 1; else hi = mid; }
    return lo;
  }
  function nearestIndexIn(arr, targetTime) {
    var lo = 0, hi = arr.length - 1;
    while (lo < hi) {
      var mid = (lo + hi) >> 1;
      if (arr[mid] < targetTime) lo = mid + 1; else hi = mid;
    }
    if (lo > 0 && Math.abs(arr[lo - 1] - targetTime) < Math.abs(arr[lo] - targetTime)) lo -= 1;
    return lo;
  }
  function niceStep(range) {
    var candidates = [0.2, 0.5, 1, 2, 5, 10, 20, 50];
    for (var i = 0; i < candidates.length; i++) {
      if (range / candidates[i] <= 7) return candidates[i];
    }
    return candidates[candidates.length - 1];
  }

  function buildXTicks(dT0, dT1) {
    var spanDays = (dT1 - dT0) / DAY_MS;
    var ticks = [];
    if (spanDays > 720) {
      var startY = new Date(dT0).getUTCFullYear();
      var endY = new Date(dT1).getUTCFullYear();
      var span = endY - startY + 1;
      var step = span > 14 ? 2 : 1;
      for (var yr = startY; yr <= endY; yr += step) {
        var jan1 = Date.UTC(yr, 0, 1);
        if (jan1 >= dT0 && jan1 <= dT1) ticks.push({ t: jan1, label: String(yr) });
      }
    } else if (spanDays > 100) {
      var monthsSpan = spanDays / 30;
      var step2 = monthsSpan > 20 ? 3 : (monthsSpan > 9 ? 2 : 1);
      var d0 = new Date(dT0);
      var cursor = Date.UTC(d0.getUTCFullYear(), d0.getUTCMonth(), 1);
      while (cursor <= dT1) {
        if (cursor >= dT0) ticks.push({ t: cursor, label: fmtMonthYearDE(cursor) });
        var dd = new Date(cursor);
        cursor = Date.UTC(dd.getUTCFullYear(), dd.getUTCMonth() + step2, 1);
      }
    } else if (spanDays > 12) {
      var stepDays = Math.max(2, Math.round(spanDays / 8));
      var cursor2 = Math.floor(dT0 / DAY_MS) * DAY_MS;
      while (cursor2 <= dT1) {
        if (cursor2 >= dT0) ticks.push({ t: cursor2, label: fmtDDMM(cursor2) });
        cursor2 += stepDays * DAY_MS;
      }
    } else {
      var stepDays2 = spanDays > 6 ? 2 : 1;
      var cursor3 = Math.floor(dT0 / DAY_MS) * DAY_MS;
      while (cursor3 <= dT1) {
        if (cursor3 >= dT0) ticks.push({ t: cursor3, label: fmtDDMM(cursor3) });
        cursor3 += stepDays2 * DAY_MS;
      }
    }
    return ticks;
  }

  function pathFrom(times_, values_) {
    var pts = [];
    for (var i = 0; i < times_.length; i++) pts.push(xScale(times_[i]) + "," + yScale(values_[i]));
    return "M" + pts.join(" L");
  }

  var seriesDefs = [
    { key: "daily", label: "Daily readings", color: "var(--series-1)", times: times, values: values, r: 3, visible: true },
    { key: "monthly", label: "30-day rolling avg", color: "var(--series-2)", times: monthlyTimes, values: monthlyValues, r: 4, visible: true },
    { key: "yearly", label: "365-day rolling avg", color: "var(--series-3)", times: yearlyTimes, values: yearlyValues, r: 5, visible: true }
  ];

  var chLine, hit, selectionRect;

  function redraw() {
    while (svg.firstChild) svg.removeChild(svg.firstChild);

    // y-domain: fixed 75-95 kg at the full (un-zoomed) view; auto-fit to the
    // visible data once zoomed in, so a narrow range still reads clearly.
    var yMin, yMax, step;
    var isFullView = (domainT0 === fullT0 && domainT1 === fullT1);
    if (isFullView) {
      yMin = 75; yMax = 95; step = 5;
    } else {
      var lo = lowerBound(times, domainT0);
      var hi = lowerBound(times, domainT1);
      var sliceVals = values.slice(Math.max(0, lo - 1), Math.min(n, hi + 2));
      if (sliceVals.length === 0) sliceVals = values;
      var vMin = Math.min.apply(null, sliceVals);
      var vMax = Math.max.apply(null, sliceVals);
      var range = vMax - vMin || 2;
      step = niceStep(range * 1.3);
      yMin = Math.floor((vMin - range * 0.15) / step) * step;
      yMax = Math.ceil((vMax + range * 0.15) / step) * step;
    }

    xScale = function (t) { return M.left + ((t - domainT0) / (domainT1 - domainT0)) * plotW; };
    yScale = function (v) { return M.top + (1 - (v - yMin) / (yMax - yMin)) * plotH; };

    // defs: clip path for the plot area
    var defs = svgEl("defs", {});
    var clip = svgEl("clipPath", { id: "plotClip" });
    clip.appendChild(svgEl("rect", { x: M.left, y: M.top, width: plotW, height: plotH }));
    defs.appendChild(clip);
    svg.appendChild(defs);

    // y gridlines + ticks
    for (var yv = yMin; yv <= yMax + step * 0.001; yv += step) {
      var y = yScale(yv);
      svg.appendChild(svgEl("line", { class: "gridline", x1: M.left, x2: W - M.right, y1: y, y2: y }));
      var yLabel = Math.abs(yv) < step / 1000 ? "0" : yv.toLocaleString("de-DE", { maximumFractionDigits: 1 });
      var t = svgEl("text", { class: "axis", x: M.left - 8, y: y + 4, "text-anchor": "end" });
      t.textContent = yLabel + " kg";
      svg.appendChild(t);
    }

    // x ticks
    var xTicks = buildXTicks(domainT0, domainT1);
    xTicks.forEach(function (tk) {
      var x = xScale(tk.t);
      svg.appendChild(svgEl("line", { class: "gridline", x1: x, x2: x, y1: M.top, y2: H - M.bottom }));
      var xt = svgEl("text", { class: "axis", x: x, y: H - M.bottom + 16, "text-anchor": "middle" });
      xt.textContent = tk.label;
      svg.appendChild(xt);
    });

    // baseline
    svg.appendChild(svgEl("line", { class: "baseline", x1: M.left, x2: W - M.right, y1: H - M.bottom, y2: H - M.bottom }));

    // series lines, clipped to plot area
    var seriesGroup = svgEl("g", { "clip-path": "url(#plotClip)" });
    seriesDefs.forEach(function (s) {
      var g = svgEl("g", {});
      g.appendChild(svgEl("path", { class: "line-" + s.key, d: pathFrom(s.times, s.values) }));
      g.style.display = s.visible ? "" : "none";
      seriesGroup.appendChild(g);
      s.group = g;
    });
    svg.appendChild(seriesGroup);

    // end dots, also clipped (so an off-screen endpoint just disappears when zoomed away)
    var dotsGroup = svgEl("g", { "clip-path": "url(#plotClip)" });
    seriesDefs.forEach(function (s) {
      var last = s.times.length - 1;
      var dot = svgEl("circle", { class: "end-dot", cx: xScale(s.times[last]), cy: yScale(s.values[last]), r: s.r, fill: s.color });
      dot.style.display = s.visible ? "" : "none";
      dotsGroup.appendChild(dot);
      s.endDot = dot;
    });
    svg.appendChild(dotsGroup);

    // crosshair
    chLine = svgEl("line", { class: "crosshair-line", y1: M.top, y2: H - M.bottom });
    svg.appendChild(chLine);
    seriesDefs.forEach(function (s) {
      s.chDot = svgEl("circle", { class: "crosshair-dot", r: 4, fill: s.color });
      svg.appendChild(s.chDot);
    });

    // selection rectangle (drag-to-zoom)
    selectionRect = svgEl("rect", { class: "selection-rect", y: M.top, height: plotH, x: M.left, width: 0 });
    svg.appendChild(selectionRect);

    // hit layer (topmost)
    hit = svgEl("rect", { class: "hit-layer", x: M.left, y: M.top, width: plotW, height: plotH });
    svg.appendChild(hit);
    attachHitHandlers();

    zoomResetBtn.classList.toggle("show", domainT0 > fullT0 + 1 || domainT1 < fullT1 - 1);
  }

  // ---- legend (toggles series visibility) ----
  var legend = document.getElementById("legend");
  seriesDefs.forEach(function (s) {
    var btn = document.createElement("button");
    btn.className = "legend-item";
    btn.type = "button";
    var sw = document.createElement("span");
    sw.className = "swatch";
    sw.style.background = s.color;
    var lab = document.createElement("span");
    lab.textContent = s.label;
    btn.appendChild(sw);
    btn.appendChild(lab);
    btn.addEventListener("click", function () {
      s.visible = !s.visible;
      btn.classList.toggle("dim", !s.visible);
      s.group.style.display = s.visible ? "" : "none";
      s.endDot.style.display = s.visible ? "" : "none";
      s.chDot.style.display = s.visible ? "" : "none";
    });
    legend.appendChild(btn);
  });

  var tooltip = document.getElementById("tooltip");
  var ttDate = document.getElementById("ttDate");
  var ttRows = document.getElementById("ttRows");
  var chartCard = document.querySelector(".chart-card");
  var zoomResetBtn = document.getElementById("zoomReset");

  function showAt(targetTime) {
    var dIdx = nearestIndexIn(times, targetTime);
    var x = xScale(times[dIdx]);
    chLine.setAttribute("x1", x); chLine.setAttribute("x2", x);
    chLine.style.opacity = 1;

    while (ttRows.firstChild) ttRows.removeChild(ttRows.firstChild);
    ttDate.textContent = fmtDateDE(dates[dIdx]);

    seriesDefs.forEach(function (s) {
      var idx = nearestIndexIn(s.times, times[dIdx]);
      var sx = xScale(s.times[idx]);
      var sy = yScale(s.values[idx]);
      if (s.visible) {
        s.chDot.setAttribute("cx", sx); s.chDot.setAttribute("cy", sy);
        s.chDot.style.opacity = 1;
      } else {
        s.chDot.style.opacity = 0;
      }
      var row = document.createElement("div");
      row.className = "t-row";
      var key = document.createElement("span");
      key.className = "t-key";
      key.style.background = s.color;
      var name = document.createElement("span");
      name.className = "t-name";
      name.textContent = s.label;
      var val = document.createElement("span");
      val.className = "t-val";
      val.textContent = fmtKg(s.values[idx]);
      row.appendChild(key);
      row.appendChild(name);
      row.appendChild(val);
      if (s.visible) ttRows.appendChild(row);
    });

    var rect = svg.getBoundingClientRect();
    var cardRect = chartCard.getBoundingClientRect();
    var scale = rect.width / W;
    var px = rect.left - cardRect.left + x * scale;
    var py = rect.top - cardRect.top - 8;
    tooltip.style.left = px + "px";
    tooltip.style.top = py + "px";
    tooltip.style.opacity = 1;
  }
  function hideCrosshair() {
    if (chLine) chLine.style.opacity = 0;
    seriesDefs.forEach(function (s) { if (s.chDot) s.chDot.style.opacity = 0; });
    tooltip.style.opacity = 0;
  }

  function clientXToTime(clientX) {
    var rect = svg.getBoundingClientRect();
    var xFrac = (clientX - rect.left) / rect.width;
    var svgX = xFrac * W;
    var tt = domainT0 + ((svgX - M.left) / plotW) * (domainT1 - domainT0);
    return Math.max(domainT0, Math.min(domainT1, tt));
  }

  var focusIdx = n - 1;

  var dragging = false;
  var dragStartClientX = null;

  function attachHitHandlers() {
    hit.addEventListener("pointerdown", function (e) {
      dragging = true;
      dragStartClientX = e.clientX;
      selectionRect.setAttribute("width", 0);
      try { hit.setPointerCapture(e.pointerId); } catch (err) {}
    });
    hit.addEventListener("pointermove", function (e) {
      if (dragging) {
        var rect = svg.getBoundingClientRect();
        var scale = rect.width / W;
        var x1 = (dragStartClientX - rect.left) / scale;
        var x2 = (e.clientX - rect.left) / scale;
        var lo2 = Math.max(M.left, Math.min(x1, x2));
        var hi2 = Math.min(W - M.right, Math.max(x1, x2));
        selectionRect.setAttribute("x", lo2);
        selectionRect.setAttribute("width", Math.max(0, hi2 - lo2));
        selectionRect.style.display = "block";
        hideCrosshair();
      } else {
        showAt(clientXToTime(e.clientX));
      }
    });
    hit.addEventListener("pointerup", function (e) {
      if (dragging) {
        dragging = false;
        selectionRect.style.display = "none";
        var startT = clientXToTime(dragStartClientX);
        var endT = clientXToTime(e.clientX);
        var newT0 = Math.min(startT, endT);
        var newT1 = Math.max(startT, endT);
        if (newT1 - newT0 >= MIN_SPAN_MS) {
          domainT0 = newT0;
          domainT1 = newT1;
          var idxHi = lowerBound(times, domainT1);
          focusIdx = Math.max(0, Math.min(n - 1, idxHi));
          redraw();
        }
      }
    });
    hit.addEventListener("pointerleave", function () {
      if (!dragging) hideCrosshair();
    });
    hit.addEventListener("dblclick", function () {
      if (domainT0 !== fullT0 || domainT1 !== fullT1) {
        domainT0 = fullT0; domainT1 = fullT1;
        redraw();
      }
    });
  }

  zoomResetBtn.addEventListener("click", function () {
    domainT0 = fullT0; domainT1 = fullT1;
    redraw();
  });

  svg.addEventListener("keydown", function (e) {
    if (e.key === "ArrowLeft") { focusIdx = Math.max(0, focusIdx - 1); showAt(times[focusIdx]); e.preventDefault(); }
    else if (e.key === "ArrowRight") { focusIdx = Math.min(n - 1, focusIdx + 1); showAt(times[focusIdx]); e.preventDefault(); }
    else if (e.key === "Escape") { hideCrosshair(); }
  });
  svg.addEventListener("focus", function () { showAt(times[focusIdx]); });
  svg.addEventListener("blur", hideCrosshair);

  redraw();

  // ---- yearly table (accessible alternative to hover; based on daily readings) ----
  var byYear = {};
  var order = [];
  for (i = 0; i < n; i++) {
    var yKey = dates[i].slice(0, 4);
    if (!byYear[yKey]) { byYear[yKey] = { sum: 0, count: 0, min: Infinity, max: -Infinity }; order.push(yKey); }
    var b = byYear[yKey];
    b.sum += values[i]; b.count += 1;
    if (values[i] < b.min) b.min = values[i];
    if (values[i] > b.max) b.max = values[i];
  }
  var tbody = document.getElementById("yearlyBody");
  order.forEach(function (yKey) {
    var b = byYear[yKey];
    var tr = document.createElement("tr");
    [yKey, fmtKg(b.sum / b.count), fmtKg(b.min), fmtKg(b.max), String(b.count)].forEach(function (txt) {
      var td = document.createElement("td");
      td.textContent = txt;
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  });

  var toggleBtn = document.getElementById("tableToggle");
  var tableWrap = document.getElementById("tableWrap");
  toggleBtn.addEventListener("click", function () {
    var open = tableWrap.classList.toggle("open");
    toggleBtn.setAttribute("aria-expanded", open ? "true" : "false");
    toggleBtn.textContent = open ? "Hide table" : "View as table (yearly)";
  });

};
