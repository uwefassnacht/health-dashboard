/* Rendering code for the longevity page. Called by app.js with the loaded metrics. */
window.renderLongevity = function (HEALTH) {
  "use strict";
  var DAY_MS = 86400000;
  var MONTHS_DE = ["Jan","Feb","Mär","Apr","Mai","Jun","Jul","Aug","Sep","Okt","Nov","Dez"];

  // ---------- formatting ----------
  function pad2(n) { return n < 10 ? "0" + n : String(n); }
  function dayToDate(d) { return new Date(d * DAY_MS); }
  function fmtDay(d) { var x = dayToDate(d); return pad2(x.getUTCDate()) + "." + pad2(x.getUTCMonth() + 1) + "." + x.getUTCFullYear(); }
  function fmtDDMM(d) { var x = dayToDate(d); return pad2(x.getUTCDate()) + "." + pad2(x.getUTCMonth() + 1) + "."; }
  function fmtMonYear(d) { var x = dayToDate(d); return MONTHS_DE[x.getUTCMonth()] + " " + x.getUTCFullYear(); }
  function num(v, dec) { return v.toLocaleString("de-DE", { minimumFractionDigits: dec, maximumFractionDigits: dec }); }
  function hm(hours) {
    var mins = Math.round(Math.abs(hours) * 60);
    var h = Math.floor(mins / 60), m = mins % 60;
    return h > 0 ? h + " h " + pad2(m) + " min" : m + " min";
  }
  function isoToDay(iso) { var p = iso.split("-"); return Math.round(Date.UTC(+p[0], +p[1] - 1, +p[2]) / DAY_MS); }

  var MINUS = "−";
  function signed(delta, body) { return (delta > 0 ? "+" : delta < 0 ? MINUS : "±") + body; }

  // ---------- metric definitions ----------
  // better: "up" | "down" | [lo, hi] target range. band: changes smaller than this count as "stable".
  // ---------- personal settings (edit here) ----------
  // naturalWaking: you wake up without an alarm, fall asleep easily but tend to wake early.
  // The sleep advice is tailored to that (no "set an alarm" tips, focus on protecting the end of the night).
  var PERSONAL = { naturalWaking: true };

  var PANELS = {
    vo2: {
      title: "VO₂ max", unit: "mL/kg/min", dec: 1, better: "up", band: 0.5,
      rawLabel: "Daily estimate",
      why: "Cardiorespiratory fitness is among the strongest predictors of all-cause mortality. In a study of 122,000 adults, higher fitness was linked to lower mortality with no observed upper limit of benefit.",
      ref: ["Mandsager et al., JAMA Network Open 2018", "https://pubmed.ncbi.nlm.nih.gov/30646252/"]
    },
    hrr: {
      title: "Cardio recovery", unit: "bpm drop after 1 min", dec: 1, better: "up", band: 1.5,
      rawLabel: "Measurement",
      why: "How far your heart rate falls in the first minute after exercise ends — a marker of autonomic (vagal) health. A drop of 12 bpm or less was associated with markedly higher mortality. Higher is better.",
      ref: ["Cole et al., NEJM 1999", "https://pubmed.ncbi.nlm.nih.gov/10536127/"],
      target: [12, null, "above 12 bpm"]
    },
    rhr: {
      title: "Resting heart rate", unit: "bpm", dec: 1, better: "down", band: 1,
      rawLabel: "Daily value",
      why: "A lower resting heart rate generally reflects better cardiovascular fitness. In pooled cohort data, each 10 bpm higher resting heart rate was associated with roughly 9% higher all-cause mortality.",
      ref: ["Zhang et al., CMAJ 2016 (meta-analysis)", "https://pubmed.ncbi.nlm.nih.gov/26598376/"]
    },
    hrv: {
      title: "Heart rate variability (HRV)", unit: "ms, SDNN", dec: 1, better: "up", band: 2,
      rawLabel: "Daily average",
      why: "Reflects the balance of your autonomic nervous system; low HRV is associated with higher cardiovascular risk. Absolute values vary a lot between people — compare against your own baseline (the yearly average).",
      ref: ["Hillebrand et al., Europace 2013 (meta-analysis)", "https://pubmed.ncbi.nlm.nih.gov/23370966/"]
    },
    sleep: {
      title: "Sleep duration", unit: "hours asleep", dec: 2, better: [7, 9], band: 0.1, kind: "hours",
      rawLabel: "Night",
      why: "Both short (under 7 h) and long (over 9 h) habitual sleep are associated with higher mortality; 7–9 hours is the recommended range for adults.",
      ref: ["Cappuccio et al., Sleep 2010 (meta-analysis)", "https://pubmed.ncbi.nlm.nih.gov/20469800/"],
      target: [7, 9, "7–9 h"]
    },
    sleeprest: {
      title: "Deep + REM sleep", unit: "hours per night", dec: 2, better: "up", band: 0.1, kind: "hours",
      rawLabel: "Night",
      why: "The restorative sleep stages. In two cohorts of middle-aged and older adults, every 5% less REM sleep was associated with a 13–17% higher mortality rate. Stage data is only available for nights tracked by a device that records stages.",
      ref: ["Leary et al., JAMA Neurology 2020", "https://pubmed.ncbi.nlm.nih.gov/32628261/"]
    },
    steps: {
      title: "Daily steps", unit: "steps", dec: 0, better: "up", band: 300,
      rawLabel: "Day",
      why: "More daily steps are associated with progressively lower mortality. For adults 60 and older the benefit levelled off around 6,000–8,000 steps a day, for younger adults around 8,000–10,000.",
      ref: ["Paluch et al., Lancet Public Health 2022 (15 cohorts)", "https://pubmed.ncbi.nlm.nih.gov/35247352/"],
      target: [8000, null, "8,000+"]
    },
    exercise: {
      title: "Exercise minutes", unit: "min per day", dec: 0, better: "up", band: 3,
      rawLabel: "Day",
      why: "WHO recommends 150–300 minutes of moderate (or 75–150 of vigorous) activity per week — about 22–43 Apple Exercise minutes per day. Benefits continue beyond the minimum.",
      ref: ["WHO guidelines on physical activity 2020", "https://www.who.int/publications/i/item/9789240015128"],
      target: [22, null, "22+ min"]
    },
    walkspeed: {
      title: "Walking speed", unit: "km/h", dec: 2, better: "up", band: 0.08,
      rawLabel: "Daily average",
      why: "Gait speed predicts survival in older adults; speeds of 1.0 m/s (3.6 km/h) or faster were associated with better-than-expected life expectancy. Measured passively by the iPhone while you walk.",
      ref: ["Studenski et al., JAMA 2011", "https://pubmed.ncbi.nlm.nih.gov/21205966/"],
      target: [3.6, null, "3.6+ km/h"]
    },
    strength: {
      title: "Strength training", unit: "sessions per 30 days", dec: 1, better: "up", band: 0.5,
      rawLabel: null, r30Label: "Sessions in the last 30 days", r365Label: "Average per 30 days (last 365 days)",
      why: "Muscle-strengthening activity is associated with lower all-cause mortality independent of aerobic exercise, and preserves the muscle mass and strength that decline with age. WHO recommends it on 2 or more days per week (about 8–9 sessions per 30 days).",
      ref: ["Momma et al., Br J Sports Med 2022 (meta-analysis)", "https://pubmed.ncbi.nlm.nih.gov/35228201/"],
      target: [8.6, null, "2× per week"]
    },
    bpsys: {
      title: "Blood pressure – systolic", unit: "mmHg", dec: 0, better: "down", band: 2,
      rawLabel: "Daily average",
      why: "High blood pressure is the leading modifiable risk factor for cardiovascular disease and death. Normal is below 120/80 mmHg.",
      ref: ["AHA/ACC blood pressure categories", "https://www.heart.org/en/health-topics/high-blood-pressure/understanding-blood-pressure-readings"],
      target: [null, 120, "below 120"]
    },
    bpdia: {
      title: "Blood pressure – diastolic", unit: "mmHg", dec: 0, better: "down", band: 1.5,
      rawLabel: "Daily average",
      why: "The lower number of a blood pressure reading. Normal is below 80 mmHg.",
      ref: ["AHA/ACC blood pressure categories", "https://www.heart.org/en/health-topics/high-blood-pressure/understanding-blood-pressure-readings"],
      target: [null, 80, "below 80"]
    },
    bodyfat: {
      title: "Body fat", unit: "%", dec: 1, better: "down", band: 0.3,
      rawLabel: "Daily reading",
      why: "Body composition says more than weight alone: excess fat mass raises cardiometabolic risk, while keeping muscle protects function with age. Smart-scale estimates are noisy — watch the rolling averages rather than single readings.",
      ref: null
    }
  };

  var SECTIONS = [
    { title: "Cardiorespiratory fitness", keys: ["vo2", "hrr", "rhr", "hrv"] },
    { title: "Sleep", keys: ["sleep", "sleeprest"] },
    { title: "Activity & physical function", keys: ["steps", "exercise", "walkspeed", "strength"] },
    { title: "Blood pressure & body composition", keys: ["bpsys", "bpdia", "bodyfat"] }
  ];

  function fmtVal(cfg, v) {
    if (v == null || isNaN(v)) return "–";
    if (cfg.kind === "hours") return hm(v);
    return num(v, cfg.dec) + (cfg.unit === "%" ? " %" : "");
  }
  function fmtValUnit(cfg, v) {
    if (v == null || isNaN(v)) return "–";
    if (cfg.kind === "hours") return hm(v);
    var short = { "mL/kg/min": " mL/kg/min", "bpm drop after 1 min": " bpm", "bpm": " bpm", "ms, SDNN": " ms",
                  "steps": "", "min per day": " min", "km/h": " km/h", "sessions per 30 days": "", "mmHg": " mmHg", "%": " %" }[cfg.unit];
    return num(v, cfg.dec) + (short == null ? "" : short);
  }
  function fmtDelta(cfg, d) {
    if (d == null || isNaN(d)) return "–";
    if (cfg.kind === "hours") return signed(d, hm(d));
    return signed(d, fmtValUnit(cfg, Math.abs(d)));
  }
  function fmtAxis(cfg, v, step) {
    var dec = Math.abs(step - Math.round(step)) < 1e-9 ? 0
            : Math.abs(step * 10 - Math.round(step * 10)) < 1e-9 ? 1 : 2;
    return num(v, dec) + (cfg.kind === "hours" ? " h" : "");
  }

  // ---------- status ----------
  function dist(x, range) { return x < range[0] ? range[0] - x : x > range[1] ? x - range[1] : 0; }
  function status(cfg, now, prev) {
    if (now == null || prev == null) return null;
    var d = now - prev;
    if (Array.isArray(cfg.better)) {
      var dn = dist(now, cfg.better), dp = dist(prev, cfg.better);
      if (dn === 0 && dp === 0) return { cls: "neutral", icon: "●", text: "in range" };
      if (Math.abs(dn - dp) < cfg.band) return { cls: "neutral", icon: "●", text: "stable" };
      return dn < dp ? { cls: "good", icon: d > 0 ? "▲" : "▼", text: "improving" }
                     : { cls: "bad", icon: d > 0 ? "▲" : "▼", text: "worsening" };
    }
    if (Math.abs(d) < cfg.band) return { cls: "neutral", icon: "●", text: "stable" };
    var good = cfg.better === "up" ? d > 0 : d < 0;
    return { cls: good ? "good" : "bad", icon: d > 0 ? "▲" : "▼", text: good ? "improving" : "worsening" };
  }
  function chipEl(st) {
    var s = document.createElement("span");
    if (!st) return s;
    s.className = "chip " + st.cls;
    s.textContent = st.icon + " " + st.text;
    return s;
  }
  function betterText(cfg) {
    if (Array.isArray(cfg.better)) return "in " + cfg.target[2];
    return cfg.better === "up" ? "higher" : "lower";
  }

  // ---------- helpers ----------
  function lowerBound(arr, target) {
    var lo = 0, hi = arr.length;
    while (lo < hi) { var mid = (lo + hi) >> 1; if (arr[mid] < target) lo = mid + 1; else hi = mid; }
    return lo;
  }
  function nearestIndex(arr, target) {
    if (!arr.length) return -1;
    var i = lowerBound(arr, target);
    if (i >= arr.length) return arr.length - 1;
    if (i > 0 && Math.abs(arr[i - 1] - target) <= Math.abs(arr[i] - target)) return i - 1;
    return i;
  }
  function valueNear(t, vals, target, tol) {
    var i = nearestIndex(t, target);
    if (i < 0 || Math.abs(t[i] - target) > tol) return null;
    return vals[i];
  }
  function niceStep(range, maxTicks) {
    var raw = range / maxTicks;
    var mag = Math.pow(10, Math.floor(Math.log10(raw)));
    var steps = [1, 2, 2.5, 5, 10];
    for (var i = 0; i < steps.length; i++) if (steps[i] * mag >= raw) return steps[i] * mag;
    return 10 * mag;
  }

  var exportDay = HEALTH.exportDate ? isoToDay(HEALTH.exportDate) : null;

  // ---------- summary per metric ----------
  function summarize(key) {
    var cfg = PANELS[key], p = HEALTH.panels[key];
    if (!p || !p.t.length) return null;
    var L = p.t.length - 1, tl = p.t[L];
    var now30 = p.r30[L], now365 = p.r365[L];
    var prev30 = valueNear(p.t, p.r30, tl - 30, 10);
    var prev365 = (tl - p.t[0] >= 365) ? valueNear(p.t, p.r365, tl - 365, 30) : null;
    var count30 = L + 1 - lowerBound(p.t, tl - 29);
    return {
      lastDay: tl, stale: exportDay != null && exportDay - tl > 45, count30: count30,
      now30: now30, prev30: prev30, st30: status(cfg, now30, prev30),
      now365: now365, prev365: prev365, st365: status(cfg, now365, prev365)
    };
  }

  // ---------- header ----------
  document.getElementById("subtitle").textContent =
    "Apple Health export of " + (exportDay != null ? fmtDay(exportDay) : "–") +
    " · monthly (30-day) and yearly (365-day) rolling averages · drag on any chart to zoom";

  // ---------- overview table ----------
  var ovBody = document.querySelector("#overview tbody");
  SECTIONS.forEach(function (sec) {
    var gr = document.createElement("tr");
    gr.className = "group";
    var gtd = document.createElement("td");
    gtd.colSpan = 6;
    gtd.textContent = sec.title;
    gr.appendChild(gtd);
    ovBody.appendChild(gr);
    sec.keys.forEach(function (key) {
      var cfg = PANELS[key], s = summarize(key);
      var tr = document.createElement("tr");
      var tdM = document.createElement("td");
      tdM.className = "metric";
      var a = document.createElement("a");
      a.href = "#panel-" + key;
      a.textContent = cfg.title;
      tdM.appendChild(a);
      var u = document.createElement("span");
      u.className = "unit";
      u.textContent = cfg.kind === "hours" ? "" : cfg.unit;
      tdM.appendChild(u);
      tr.appendChild(tdM);

      function cell(text, st) {
        var td = document.createElement("td");
        var w = document.createElement("span");
        w.className = "d";
        var t = document.createElement("span");
        t.textContent = text;
        w.appendChild(t);
        if (st) w.appendChild(chipEl(st));
        td.appendChild(w);
        return td;
      }
      if (!s) {
        tr.appendChild(cell("no data")); tr.appendChild(cell("")); tr.appendChild(cell("")); tr.appendChild(cell(""));
      } else {
        tr.appendChild(cell(fmtVal(cfg, s.now30)));
        tr.appendChild(cell(s.prev30 == null ? "–" : fmtDelta(cfg, s.now30 - s.prev30), s.st30));
        tr.appendChild(cell(fmtVal(cfg, s.now365)));
        tr.appendChild(cell(s.prev365 == null ? "not enough history" : fmtDelta(cfg, s.now365 - s.prev365), s.st365));
      }
      var tdB = document.createElement("td");
      tdB.className = "better";
      tdB.textContent = betterText(cfg);
      tr.appendChild(tdB);
      ovBody.appendChild(tr);
    });
  });

  // ---------- advice: what to work on now ----------
  (function buildAdvice() {
    svgNS = "http://www.w3.org/2000/svg";
    var MONTHS_EN = ["January","February","March","April","May","June","July","August","September","October","November","December"];
    var S = {};
    Object.keys(PANELS).forEach(function (k) { S[k] = summarize(k); });
    var now = exportDay != null ? exportDay : Math.round(Date.now() / DAY_MS);
    var mNow = dayToDate(now).getUTCMonth();

    function mean(a) { return a.length ? a.reduce(function (x, y) { return x + y; }, 0) / a.length : null; }
    function sdev(a) { var m = mean(a); return a.length > 1 ? Math.sqrt(mean(a.map(function (x) { return (x - m) * (x - m); }))) : null; }
    function clock(mins) {
      var m = Math.round(((mins % 1440) + 1440) % 1440);
      return pad2(Math.floor(m / 60)) + ":" + pad2(m % 60);
    }
    function monthList(idx) {
      if (!idx.length) return "";
      var names = idx.map(function (i) { return MONTHS_EN[i]; });
      return names.length === 1 ? names[0] : names.slice(0, -1).join(", ") + " and " + names[names.length - 1];
    }
    function monthRange(idx) {
      // idx: calendar months (0-11), possibly wrapping over the year end; return "November to February"
      if (!idx.length) return "";
      var set = {}; idx.forEach(function (i) { set[i] = true; });
      var start = idx[0];
      for (var k = 0; k < 12; k++) { var c = (idx[0] - k + 12) % 12; if (set[c]) start = c; else break; }
      var end = start;
      for (k = 0; k < 12; k++) { var c2 = (start + k) % 12; if (set[c2]) end = c2; else break; }
      return start === end ? MONTHS_EN[start] : MONTHS_EN[start] + " to " + MONTHS_EN[end];
    }
    function V(key, v) { return fmtValUnit(PANELS[key], v); }
    function D(key, d) { return fmtDelta(PANELS[key], d); }

    // --- seasonality (e-bike riding and exercise minutes by calendar month) ---
    var seas = HEALTH.seasonal || {};
    var cyc = seas.cyclingKm ? seas.cyclingKm.months : null;
    var exm = seas.exerciseMin ? seas.exerciseMin.months : null;
    var season = null;
    if (cyc) {
      var vals = cyc.filter(function (v) { return v != null; });
      var peak = Math.max.apply(null, vals);
      if (vals.length >= 10 && peak >= 50) {
        var low = [], high = [];
        cyc.forEach(function (v, i) {
          if (v == null) return;
          if (v < 0.25 * peak) low.push(i);
          if (v >= 0.5 * peak) high.push(i);
        });
        var upcoming = [0, 1, 2, 3].map(function (k) { return (mNow + k) % 12; })
          .filter(function (i) { return low.indexOf(i) >= 0; });
        var inHigh = high.indexOf(mNow) >= 0;
        season = {
          peak: peak, peakMonth: cyc.indexOf(peak), low: low, high: high, upcoming: upcoming, inHigh: inHigh,
          lowKm: mean(low.map(function (i) { return cyc[i]; })),
          exLow: exm ? mean(low.map(function (i) { return exm[i]; }).filter(function (v) { return v != null; })) : null,
          exHigh: exm ? mean(high.map(function (i) { return exm[i]; }).filter(function (v) { return v != null; })) : null,
          years: seas.cyclingKm.years ? Math.max.apply(null, seas.cyclingKm.years) : null
        };
      }
    }

    // --- sleep timing over the last 30 nights ---
    var timing = null, stt = HEALTH.sleepTiming;
    if (stt && stt.t.length) {
      var lastT = stt.t[stt.t.length - 1], on = [], wk = [];
      for (var i = stt.t.length - 1; i >= 0 && stt.t[i] > lastT - 30; i--) { on.push(stt.onset[i]); wk.push(stt.wake[i]); }
      if (on.length >= 10) timing = { onset: mean(on), onsetSD: sdev(on), wake: mean(wk), wakeSD: sdev(wk), n: on.length };
    }

    var items = [], keep = [];
    var L = {
      gen100: ["Generation 100 trial (BMJ 2020)", "https://pubmed.ncbi.nlm.nih.gov/33028588/"],
      ntnu: ["Norwegian 4×4 intervals – NTNU", "https://www.ntnu.edu/cerg/generation100"],
      ebike: ["Health benefits of e-bikes (review, 2018)", "https://pmc.ncbi.nlm.nih.gov/articles/PMC6249962/"],
      who: ["WHO physical activity guidelines", "https://www.who.int/publications/i/item/9789240015128"],
      mandsager: ["Fitness and mortality (JAMA Netw Open 2018)", "https://pubmed.ncbi.nlm.nih.gov/30646252/"],
      aasm: ["Healthy sleep habits – AASM", "https://sleepeducation.org/healthy-sleep/healthy-sleep-habits/"],
      windred: ["Sleep regularity and mortality (Sleep 2024)", "https://pubmed.ncbi.nlm.nih.gov/37738616/"],
      lack: ["Evening light for early waking (Lack & Wright 1993)", "https://pubmed.ncbi.nlm.nih.gov/8378685/"],
      aasmCircadian: ["AASM guideline on circadian sleep timing (2015)", "https://pmc.ncbi.nlm.nih.gov/articles/PMC4582061/"],
      ebrahim: ["Alcohol and sleep (review, 2013)", "https://onlinelibrary.wiley.com/doi/10.1111/acer.12006"],
      cdcSleep: ["About sleep – CDC", "https://www.cdc.gov/sleep/about/index.html"],
      momma: ["Strength training and mortality (BJSM 2022)", "https://pubmed.ncbi.nlm.nih.gov/35228201/"],
      protage: ["Protein for older adults (PROT-AGE)", "https://pubmed.ncbi.nlm.nih.gov/23867520/"],
      ahaHome: ["Home BP monitoring – AHA", "https://www.heart.org/en/health-topics/high-blood-pressure/understanding-blood-pressure-readings/monitoring-your-blood-pressure-at-home"],
      ahaSmbp: ["AHA/AMA statement on home BP (2020)", "https://www.ahajournals.org/doi/10.1161/CIR.0000000000000803"],
      dash: ["DASH eating plan – NHLBI", "https://www.nhlbi.nih.gov/education/dash-eating-plan"],
      dashNejm: ["DASH-Sodium trial (NEJM 2001)", "https://www.nejm.org/doi/full/10.1056/NEJM200101043440101"],
      ding: ["Daily steps and health (Lancet Public Health 2025)", "https://www.thelancet.com/journals/lanpub/article/PIIS2468-2667(25)00164-1/fulltext"],
      paluch: ["Daily steps and mortality (Lancet Public Health 2022)", "https://pubmed.ncbi.nlm.nih.gov/35247352/"],
      studenski: ["Gait speed and survival (JAMA 2011)", "https://pubmed.ncbi.nlm.nih.gov/21205966/"]
    };

    // 1. Cardiorespiratory fitness, with the e-bike season in mind
    (function () {
      var vo2 = S.vo2, hrr = S.hrr, ex = S.exercise;
      var winterAhead = season && season.upcoming.length > 0;
      var vo2Bad = vo2 && vo2.st365 && vo2.st365.cls === "bad";
      var score = winterAhead ? 90 : vo2Bad ? 75 : (ex && ex.now30 < 22 ? 70 : 30);
      if (winterAhead && vo2Bad) score += 5;
      var why = [];
      if (winterAhead) {
        why.push("Your e-bike riding is seasonal: about **" + num(season.peak, 0) + " km** a month in " + MONTHS_EN[season.peakMonth] +
          ", but only **" + num(season.lowKm, 0) + " km** a month from " + monthRange(season.low) + ".");
        if (season.exLow != null && season.exHigh != null)
          why.push("In those months your exercise minutes drop from about **" + num(season.exHigh, 0) + "** to **" + num(season.exLow, 0) + " min a day**.");
      }
      if (vo2) why.push("VO₂ max is **" + V("vo2", vo2.now30) + "** (monthly avg); the yearly avg is " + V("vo2", vo2.now365) +
        (vo2.prev365 != null ? ", " + D("vo2", vo2.now365 - vo2.prev365) + " vs. a year earlier." : "."));
      if (hrr && hrr.st30 && hrr.st30.cls === "good") why.push("Cardio recovery is improving (" + V("hrr", hrr.now30) + ") — the aerobic base you built this summer is worth protecting.");
      if (score < 35) {
        keep.push("**Cardio fitness:** VO₂ max " + (vo2 ? V("vo2", vo2.now30) : "–") + ", exercise " + (ex ? V("exercise", ex.now30) : "–") + " a day — keep your current training.");
        return;
      }
      items.push({
        score: score,
        title: winterAhead ? "Keep your cardio fitness through the winter" : "Build cardiorespiratory fitness",
        tags: winterAhead ? ["Seasonal", "Highest-impact lever"] : ["Highest-impact lever"],
        why: why,
        seasonChart: winterAhead,
        actions: [
          "Replace the summer commute with indoor or all-weather endurance training at a similar volume: **at least 150 minutes a week of moderate effort** (you can talk but not sing) — e.g. an indoor bike trainer, rowing machine, brisk walks, swimming or cross-country skiing. WHO recommends 150–300 minutes, and more brings additional benefit.",
          "Add **one interval session a week — the Norwegian 4×4**: 10 minutes warm-up, then 4 × 4 minutes at 85–95% of your maximum heart rate with 3 minutes of easy pedalling or walking in between. This protocol was used in the 5-year Generation 100 trial in 70–77-year-olds, where the interval group gained the most fitness and had the lowest mortality (a trend, not statistically significant).",
          "Keep riding the e-bike on dry winter days and **turn the assist level down** — e-bike riding reaches moderate intensity and can improve fitness, especially with less motor support.",
          "Goal for the winter: keep the **monthly VO₂ max average within about 1 point** of your current level and exercise minutes above 22 a day."
        ],
        season: winterAhead ? "From " + monthRange(season.low) + " the e-bike commute mostly disappears. Plan the replacement now — e.g. fixed slots for an indoor bike or rowing session on your former commuting days." : null,
        caution: "If you are new to high-intensity intervals or have any heart symptoms, check with your doctor before starting them.",
        links: [L.gen100, L.ntnu, L.ebike, L.who]
      });
    })();

    // 2. Sleep: duration, regularity and (for natural early risers) protecting the end of the night
    (function () {
      var sl = S.sleep;
      if (!sl) return;
      var natural = PERSONAL.naturalWaking;
      var short365 = sl.now365 < 7, short30 = sl.now30 < 7;
      var deficit = Math.max(0, 7 - sl.now365) * 60;          // minutes below 7 h (yearly avg)
      var irregular = timing && timing.onsetSD > 45;

      // seasonal sleep profile over the last two years: bedtime, natural wake time and duration per calendar month
      var prof = null;
      if (stt && stt.t.length) {
        var durBy = {}, sp = HEALTH.panels.sleep;
        for (var j = 0; j < sp.t.length; j++) durBy[sp.t[j]] = sp.raw[j];
        var acc = [];
        for (var m = 0; m < 12; m++) acc.push({ on: [], wk: [], du: [] });
        for (var k = 0; k < stt.t.length; k++) {
          if (stt.t[k] < now - 730) continue;
          var mm = dayToDate(stt.t[k]).getUTCMonth();
          acc[mm].on.push(stt.onset[k]); acc[mm].wk.push(stt.wake[k]);
          if (durBy[stt.t[k]] != null) acc[mm].du.push(durBy[stt.t[k]]);
        }
        var months = [];
        acc.forEach(function (a, i) { if (a.wk.length >= 15) months.push({ m: i, on: mean(a.on), wk: mean(a.wk), du: mean(a.du) }); });
        if (months.length >= 9) {
          var byWake = months.slice().sort(function (a, b) { return a.wk - b.wk; });
          var early = byWake.slice(0, 3), late = byWake.slice(-3);
          var shortest = months.slice().sort(function (a, b) { return a.du - b.du; }).slice(0, 3);
          var ms = function (arr) { return arr.map(function (x) { return x.m; }).sort(function (a, b) { return a - b; }); };
          prof = {
            early: ms(early), late: ms(late), shortest: ms(shortest),
            earlyWake: mean(early.map(function (x) { return x.wk; })), lateWake: mean(late.map(function (x) { return x.wk; })),
            earlyOnset: mean(early.map(function (x) { return x.on; })), lateOnset: mean(late.map(function (x) { return x.on; })),
            shortDur: mean(shortest.map(function (x) { return x.du; }))
          };
          prof.followsDaylight = prof.lateWake - prof.earlyWake >= 45;
        }
      }

      var score;
      if (natural) score = !short365 ? (irregular ? 45 : 25) : deficit >= 30 ? 75 : 55 + (short30 ? 5 : 0);
      else score = short365 ? 80 + (short30 ? 8 : 0) + (irregular ? 5 : 0) : short30 ? 70 : irregular ? 55 : 25;
      if (score < 35) {
        keep.push("**Sleep:** " + V("sleep", sl.now30) + " a night on average and a regular schedule — keep it that way.");
        return;
      }

      var why = [];
      why.push("Your yearly sleep average is **" + V("sleep", sl.now365) + "** a night" +
        (sl.prev365 != null ? " (" + D("sleep", sl.now365 - sl.prev365) + " vs. a year earlier)" : "") +
        (short365 ? (deficit < 20 ? " — only about " + num(deficit, 0) + " minutes short of 7 hours." : " — below the 7-hour minimum.") : "."));
      if (natural) {
        why.push("You wake without an alarm and fall asleep easily, so how long you sleep depends mostly on when you wake up.");
        if (prof && prof.followsDaylight) {
          why.push("Your data shows your waking follows daylight: around **" + clock(prof.earlyWake) + "** in " + monthList(prof.early) +
            ", but around **" + clock(prof.lateWake) + "** in " + monthList(prof.late) + ". Your shortest nights are in " + monthList(prof.shortest) +
            " (" + hm(prof.shortDur) + ").");
        }
      } else if (timing) {
        why.push("You typically fall asleep around **" + clock(timing.onset) + "** (±" + num(timing.onsetSD, 0) +
          " min) and wake around **" + clock(timing.wake) + "** (±" + num(timing.wakeSD, 0) + " min).");
      }

      var actions;
      if (natural) {
        actions = [
          "**Don’t simply go to bed earlier" + (prof && prof.followsDaylight ? " in the light months" : "") + ".** When you wake early by yourself, an earlier bedtime tends to shift the whole night earlier rather than make it longer. If you feel rested during the day, a few minutes under 7 hours is not a worry — aim for small, steady gains.",
          "**Keep the bedroom dark until you want to wake**" + (prof && prof.followsDaylight ? " — especially in " + monthList(prof.early) + ", when dawn wakes you earliest" : "") +
            ": blackout blinds or a comfortable eye mask protect the last sleep cycle of the night.",
          "**Bright light in the evening, dim light early in the morning.** Spend time outdoors or in bright light in the late afternoon and evening (the evening e-bike ride home helps in summer); if you wake very early, keep lights low and screens off for the first hour. In studies of older adults who woke too early, evening bright light shifted the body clock later and lengthened sleep.",
          "**Keep alcohol well away from bedtime.** It makes you drowsy at first but fragments the second half of the night — exactly the part you lose.",
          "**Keep your bedtime steady** within about 30–60 minutes night to night. Your wake time shifting with the seasons is natural; a regular schedule matters more than an exact duration — in 60,000 UK Biobank participants, sleep regularity predicted mortality more strongly than sleep duration.",
          "If you regularly wake well before you’d like and can’t get back to sleep, or feel tired during the day, mention it to your doctor: early-morning waking can be a form of insomnia (CBT-I is the first-line treatment) and is also worth checking for sleep apnoea."
        ];
      } else {
        actions = [
          "Pick **one wake-up time for all 7 days** and count back about 8 hours for lights-out — to be asleep 7+ hours you need roughly 7½–8 hours in bed.",
          "Keep bed and wake times within **about 30–60 minutes** night to night, weekends included. In 60,000 UK Biobank participants, sleep regularity predicted mortality more strongly than sleep duration.",
          "Get daylight soon after waking, no caffeine after early afternoon, keep alcohol away from bedtime, and keep the bedroom cool, dark and quiet.",
          "If you often lie awake for more than 30 minutes or wake too early despite all this, ask your doctor about **CBT-I**, the first-line treatment for insomnia."
        ];
      }

      var seasonText = null;
      if (natural && prof && prof.followsDaylight) {
        var ahead = [1, 2, 3].map(function (k) { return (mNow + k) % 12; });
        var lateAhead = ahead.some(function (x) { return prof.late.indexOf(x) >= 0; });
        seasonText = lateAhead
          ? "In the coming dark months you usually fall asleep around " + clock(prof.lateOnset) + " and sleep until about " + clock(prof.lateWake) +
            ". Then the late bedtime, not early waking, is what limits your sleep — so in winter keeping your summer bedtime (around " + clock(Math.round(prof.earlyOnset / 15) * 15) + ") and getting daylight in the morning are the levers — the opposite of summer."
          : "In the light months you wake around " + clock(prof.earlyWake) + " — darken the bedroom and get your bright light in the evening rather than first thing in the morning.";
      } else if (!natural) {
        seasonText = "Winter mornings are dark — go outside or use a bright light soon after waking to keep your body clock anchored.";
      }

      items.push({
        score: score,
        title: natural ? "Protect the end of your night" : (short365 ? "Get to a steady 7+ hours of sleep" : "Make your sleep more regular"),
        tags: natural ? ["Sleep", "Seasonal"] : (irregular ? ["Duration", "Regularity"] : ["Duration"]),
        why: why,
        actions: actions,
        season: seasonText,
        links: natural ? [L.lack, L.aasmCircadian, L.ebrahim, L.windred] : [L.aasm, L.windred, L.cdcSleep]
      });
    })();

    // 3. Strength training
    (function () {
      var st = S.strength;
      if (!st) return;
      var TARGET = 8.6;
      var score = st.now30 < TARGET ? 70 + (st.st30 && st.st30.cls === "bad" ? 5 : 0) : st.now365 < TARGET ? 55 : 25;
      var w = HEALTH.latestWeightKg;
      if (score < 35) {
        keep.push("**Strength training:** " + num(st.now30, 0) + " sessions in the last 30 days — above the WHO minimum, keep going.");
        return;
      }
      var why = ["**" + num(st.now30, 0) + " sessions** in the last 30 days" +
        (st.prev30 != null ? " (" + D("strength", st.now30 - st.prev30) + " vs. the month before)" : "") +
        "; over the past year you averaged " + num(st.now365, 1) + " per 30 days. The WHO minimum is 2 days a week (about 8–9 per 30 days)."];
      items.push({
        score: score,
        title: "Lock in two to three strength sessions a week",
        tags: ["Muscle & function"],
        why: why,
        actions: [
          "Train **2–3 times a week** and cover all major muscle groups (legs, hips, back, chest, shoulders, arms, core). In the 2022 meta-analysis the lowest mortality was seen at **about 30–60 minutes of strength training per week**.",
          "Make it progressive: **2–3 sets of 6–12 repetitions** per exercise, close to failure, and add weight when the top of the rep range becomes easy.",
          "Prioritise legs and hips (squats, lunges, step-ups, deadlifts) — their strength and power decline markedly with age and underpin walking speed and balance.",
          "Support it with protein: experts recommend **1.0–1.2 g per kg body weight a day** for older adults and more for those who train" +
            (w ? " — at " + num(w, 1) + " kg that is roughly " + num(w * 1.0, 0) + "–" + num(w * 1.2, 0) + " g a day, spread over 3–4 meals." : ".")
        ],
        season: season && season.upcoming.length ? "Strength training doesn’t depend on the weather — winter is a good time to add a third weekly session while the e-bike stands still." : null,
        links: [L.momma, L.protage, L.who]
      });
    })();

    // 4. Blood pressure
    (function () {
      var sys = S.bpsys, dia = S.bpdia;
      if (!sys || !dia) return;
      var n = sys.count30;
      var s = sys.now30, d = dia.now30;
      var cat = (s >= 130 || d >= 80) ? "stage1" : s >= 120 ? "elevated" : "normal";
      var fewReadings = n < 6 || sys.stale;
      var score = cat === "stage1" ? 85 : cat === "elevated" ? (fewReadings ? 65 : 60) : (fewReadings ? 40 : 20);
      if (score < 35) {
        keep.push("**Blood pressure:** " + num(s, 0) + "/" + num(d, 0) + " mmHg on average — in the normal range.");
        return;
      }
      var catText = cat === "stage1" ? "in the range the AHA classifies as **stage 1 hypertension** (130–139 / 80–89)"
                  : cat === "elevated" ? "in the AHA **“elevated”** category (systolic 120–129, diastolic below 80)"
                  : "in the normal range";
      var why = [];
      why.push((sys.stale ? "Your last readings are from " + fmtDay(sys.lastDay) + ". " : "") +
        "The last 30 days contain only **" + n + (n === 1 ? " reading" : " readings") + "**: " + num(s, 0) + "/" + num(d, 0) + " mmHg, " + catText + ".");
      why.push("Your yearly average is " + num(sys.now365, 0) + "/" + num(dia.now365, 0) + " mmHg. A few readings can’t show a trend — blood pressure varies a lot from reading to reading.");
      items.push({
        score: score,
        title: cat === "stage1" ? "Check your blood pressure with your doctor" : "Measure your blood pressure properly for a week",
        tags: ["Cardiovascular risk"],
        why: why,
        actions: [
          "Measure for **7 days: 2 readings in the morning** (before coffee, breakfast and medication) **and 2 in the evening**, 1 minute apart, after 5 minutes of seated rest — back supported, feet flat, cuff on the bare upper arm at heart level.",
          "Repeat a 7-day block **every 1–3 months**, so the monthly average in this dashboard reflects your real level.",
          "If your home average is **130/80 mmHg or higher**, discuss it with your doctor.",
          "What lowers it: less salt (under about 5 g salt a day), a **DASH-style diet** rich in vegetables, fruit, pulses and low-fat dairy, less alcohol and regular aerobic exercise. In the DASH-Sodium trial, the DASH diet combined with low salt lowered systolic pressure by about 9 mmHg on average."
        ],
        season: season && season.upcoming.length ? "Blood pressure tends to be a little higher in the cold months — another reason to measure a week in winter as well as in summer." : null,
        links: [L.ahaHome, L.ahaSmbp, L.dash, L.dashNejm]
      });
    })();

    // 5. Steps
    (function () {
      var sp = S.steps;
      if (!sp) return;
      var score = sp.now365 < 7000 ? 70 : sp.now30 < 7000 ? 55 : 20;
      if (score < 35) {
        keep.push("**Daily steps:** " + V("steps", sp.now30) + " a day (yearly avg " + V("steps", sp.now365) + ") — above the 7,000–8,000 steps where the benefit starts to level off. [Evidence]<" + L.ding[1] + ">");
        return;
      }
      items.push({
        score: score, title: "Walk more every day", tags: ["Activity"],
        why: ["Your monthly average is **" + V("steps", sp.now30) + " steps** a day (yearly " + V("steps", sp.now365) + ")."],
        actions: [
          "Aim for **7,000–8,000 steps a day** or more; mortality keeps falling with more steps and levels off around 6,000–8,000 for adults 60+.",
          "Build walking into the day: walking meetings, getting off a stop early, a 20-minute walk after dinner."
        ],
        links: [L.ding, L.paluch]
      });
    })();

    // 6. Resting heart rate and HRV (they follow fitness, sleep, alcohol and stress)
    (function () {
      var rhr = S.rhr, hrv = S.hrv;
      var bad = (rhr && rhr.st365 && rhr.st365.cls === "bad") || (hrv && hrv.st365 && hrv.st365.cls === "bad") ||
                (rhr && rhr.st30 && rhr.st30.cls === "bad" && hrv && hrv.st30 && hrv.st30.cls === "bad");
      var txt = "resting heart rate " + (rhr ? V("rhr", rhr.now30) : "–") + ", HRV " + (hrv ? V("hrv", hrv.now30) : "–");
      if (!bad) {
        keep.push("**Resting heart rate & HRV:** " + txt + " — stable or improving. They follow fitness, sleep, alcohol and stress, so the priorities above will carry them along.");
        return;
      }
      items.push({
        score: 45, title: "Support recovery (resting heart rate / HRV trending the wrong way)", tags: ["Recovery"],
        why: ["Your " + txt + " (monthly averages) are moving in the wrong direction compared with your own baseline."],
        actions: [
          "Look for the usual drivers first: short or irregular sleep, alcohol (especially in the evening), illness, and hard training without enough easy days.",
          "Keep most endurance sessions easy (conversational) and schedule a lighter week after 3–4 harder ones.",
          "If resting heart rate rises persistently without an obvious reason, mention it to your doctor."
        ],
        links: [L.aasm]
      });
    })();

    // 7. Body composition and walking speed
    (function () {
      var bf = S.bodyfat, ws = S.walkspeed;
      if (bf) {
        if (bf.st365 && bf.st365.cls === "bad") {
          items.push({
            score: 45, title: "Bring body fat back down", tags: ["Body composition"],
            why: ["Body fat is **" + V("bodyfat", bf.now30) + "** (monthly avg), " + D("bodyfat", bf.now365 - bf.prev365) + " vs. a year earlier (yearly avg)."],
            actions: [
              "Combine the strength training above with enough protein — losing fat while keeping muscle is the goal, not just a lower weight.",
              "Mostly unprocessed food, plenty of vegetables and fibre, few sugary drinks and little alcohol; a small, sustainable calorie deficit rather than a strict diet."
            ],
            links: [L.protage]
          });
        } else {
          keep.push("**Body fat:** " + V("bodyfat", bf.now30) + (bf.prev365 != null ? ", yearly avg " + D("bodyfat", bf.now365 - bf.prev365) + " vs. last year" : "") + " — keep combining activity, strength training and protein.");
        }
      }
      if (ws) {
        if (ws.now30 < 3.6) {
          items.push({
            score: 50, title: "Pick up your walking pace", tags: ["Physical function"],
            why: ["Your walking speed is **" + V("walkspeed", ws.now30) + "** — below the 3.6 km/h (1.0 m/s) associated with better-than-expected survival."],
            actions: ["Include some brisk walking every day and leg strength work (see strength training)."],
            links: [L.studenski]
          });
        } else {
          keep.push("**Walking speed:** " + V("walkspeed", ws.now30) + " — above the 3.6 km/h threshold linked to better survival.");
        }
      }
    })();

    items.sort(function (a, b) { return b.score - a.score; });

    // --- render ---
    document.getElementById("adviceSub").textContent =
      "Prioritised from your current data and the time of year (" + MONTHS_EN[mNow] + " " + dayToDate(now).getUTCFullYear() +
      ") · recalculated every time the dashboard is rebuilt";
    var host = document.getElementById("advice");

    function rich(el, text) {
      // **bold** and [label]<url> markup; everything else is plain text
      var re = /\*\*([^*]+)\*\*|\[([^\]]+)\]<([^>]+)>/g, last = 0, m;
      while ((m = re.exec(text))) {
        if (m.index > last) el.appendChild(document.createTextNode(text.slice(last, m.index)));
        if (m[1] != null) { var b = document.createElement("b"); b.textContent = m[1]; el.appendChild(b); }
        else { var a = document.createElement("a"); a.href = m[3]; a.target = "_blank"; a.rel = "noopener"; a.textContent = m[2]; el.appendChild(a); }
        last = re.lastIndex;
      }
      if (last < text.length) el.appendChild(document.createTextNode(text.slice(last)));
      return el;
    }

    function seasonChart() {
      var box = document.createElement("div");
      box.className = "season-chart";
      var cap = document.createElement("div");
      cap.className = "cap";
      cap.textContent = "Your average e-bike distance per calendar month (km, Apple Watch data" +
        (season.years ? ", " + season.years + (season.years === 1 ? " year" : " years") : "") + ")";
      box.appendChild(cap);
      var Wc = 680, Hc = 150, top = 18, bottom = 22, bw = 30, slot = Wc / 12;
      var svg = svgEl("svg", { viewBox: "0 0 " + Wc + " " + Hc, role: "img" });
      svg.setAttribute("aria-label", "Average e-bike kilometres per month");
      var maxV = season.peak;
      cyc.forEach(function (v, i) {
        var x = i * slot + (slot - bw) / 2;
        var h = v == null ? 0 : (v / maxV) * (Hc - top - bottom);
        var y = Hc - bottom - h;
        if (h > 0) {
          var r = Math.min(4, h);
          var d = "M" + x + "," + (Hc - bottom) + " L" + x + "," + (y + r) + " Q" + x + "," + y + " " + (x + r) + "," + y +
                  " L" + (x + bw - r) + "," + y + " Q" + (x + bw) + "," + y + " " + (x + bw) + "," + (y + r) + " L" + (x + bw) + "," + (Hc - bottom) + " Z";
          var p = svgEl("path", { d: d, class: "bar" + (i === mNow ? " now" : "") });
          var tt = svgEl("title", {}); tt.textContent = MONTHS_EN[i] + ": " + (v == null ? "no data" : num(v, 0) + " km");
          p.appendChild(tt);
          svg.appendChild(p);
        }
        var lab = svgEl("text", { x: i * slot + slot / 2, y: Hc - 6, "text-anchor": "middle" });
        lab.textContent = MONTHS_EN[i].slice(0, 3) + (i === mNow ? " ▲" : "");
        svg.appendChild(lab);
        if (v != null && (i === season.peakMonth || i === mNow)) {
          var vl = svgEl("text", { class: "val", x: i * slot + slot / 2, y: y - 5, "text-anchor": "middle" });
          vl.textContent = num(v, 0) + " km";
          svg.appendChild(vl);
        }
      });
      svg.appendChild(svgEl("line", { x1: 0, x2: Wc, y1: Hc - bottom, y2: Hc - bottom, class: "baseline" }));
      box.appendChild(svg);
      return box;
    }

    items.forEach(function (it, idx) {
      var card = document.createElement("div");
      card.className = "card advice-item";
      var badge = document.createElement("div");
      badge.className = "prio";
      badge.textContent = String(idx + 1);
      card.appendChild(badge);
      var body = document.createElement("div");
      var h3 = document.createElement("h3");
      h3.appendChild(document.createTextNode(it.title));
      (it.tags || []).forEach(function (t) { var s = document.createElement("span"); s.className = "tag"; s.textContent = t; h3.appendChild(s); });
      body.appendChild(h3);
      var why = document.createElement("p");
      why.className = "why";
      rich(why, it.why.join(" "));
      body.appendChild(why);
      if (it.seasonChart && season) body.appendChild(seasonChart());
      var h4 = document.createElement("h4"); h4.textContent = "What to do"; body.appendChild(h4);
      var ul = document.createElement("ul");
      it.actions.forEach(function (a) { var li = document.createElement("li"); rich(li, a); ul.appendChild(li); });
      body.appendChild(ul);
      if (it.season) { var se = document.createElement("p"); se.className = "season"; rich(se, "**Seasonal:** " + it.season); body.appendChild(se); }
      if (it.caution) { var ca = document.createElement("p"); ca.className = "caution"; ca.textContent = it.caution; body.appendChild(ca); }
      var links = document.createElement("p");
      links.className = "links";
      var lbl = document.createElement("span"); lbl.className = "lbl"; lbl.textContent = "Learn more:"; links.appendChild(lbl);
      it.links.forEach(function (l) {
        var a = document.createElement("a"); a.href = l[1]; a.target = "_blank"; a.rel = "noopener"; a.textContent = l[0] + " ↗";
        links.appendChild(a);
      });
      body.appendChild(links);
      card.appendChild(body);
      host.appendChild(card);
    });

    if (keep.length) {
      var kc = document.createElement("div");
      kc.className = "card keep";
      var kh = document.createElement("h3"); kh.textContent = "Going well — keep doing what you’re doing"; kc.appendChild(kh);
      var kul = document.createElement("ul");
      keep.forEach(function (k) { var li = document.createElement("li"); rich(li, k); kul.appendChild(li); });
      kc.appendChild(kul);
      host.appendChild(kc);
    }
    var note = document.createElement("p");
    note.className = "advice-note";
    note.textContent = "General, evidence-based guidance generated from your data — not a substitute for medical advice. Talk to your doctor before major changes, especially to exercise intensity or if you have symptoms.";
    host.appendChild(note);
  })();

  // ---------- global range filter ----------
  var RANGES = [["All", null], ["5 years", 1826], ["2 years", 730], ["1 year", 365], ["6 months", 182], ["90 days", 90]];
  var currentRange = null;
  var charts = [];
  var filterRow = document.getElementById("filterRow");
  RANGES.forEach(function (r, i) {
    var b = document.createElement("button");
    b.type = "button";
    b.className = "range-btn" + (i === 0 ? " active" : "");
    b.textContent = r[0];
    b.addEventListener("click", function () {
      currentRange = r[1];
      Array.prototype.forEach.call(filterRow.querySelectorAll(".range-btn"), function (x) { x.classList.remove("active"); });
      b.classList.add("active");
      charts.forEach(function (c) { c.resetToRange(); });
    });
    filterRow.appendChild(b);
  });

  // ---------- chart factory ----------
  var svgNS = "http://www.w3.org/2000/svg";
  function svgEl(tag, attrs) {
    var el = document.createElementNS(svgNS, tag);
    for (var k in attrs) el.setAttribute(k, attrs[k]);
    return el;
  }
  var clipCounter = 0;

  function makeChart(key, container) {
    var cfg = PANELS[key], p = HEALTH.panels[key];
    var W = 1280, H = 300;
    var M = { top: 14, right: 20, bottom: 30, left: 62 };
    var plotW = W - M.left - M.right, plotH = H - M.top - M.bottom;
    var t = p.t;
    var n = t.length;
    var endDay = Math.max(t[n - 1], exportDay || t[n - 1]);
    var sparse = n < 400;

    var series = [];
    if (p.raw) series.push({ id: "raw", label: cfg.rawLabel || "Daily value", color: "var(--series-1)", vals: p.raw, gap: 45, visible: true });
    series.push({ id: "r30", label: cfg.r30Label || "Monthly avg (30-day rolling)", color: "var(--series-2)", vals: p.r30, gap: 45, visible: true });
    series.push({ id: "r365", label: cfg.r365Label || "Yearly avg (365-day rolling)", color: "var(--series-3)", vals: p.r365, gap: 180, visible: true });

    // controls
    var controls = document.createElement("div");
    controls.className = "chart-controls";
    var legend = document.createElement("div");
    legend.className = "legend";
    series.forEach(function (s) {
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "legend-item";
      var sw = document.createElement("span");
      sw.className = "swatch";
      sw.style.background = s.color;
      var lab = document.createElement("span");
      lab.textContent = s.label;
      btn.appendChild(sw); btn.appendChild(lab);
      btn.addEventListener("click", function () {
        s.visible = !s.visible;
        btn.classList.toggle("dim", !s.visible);
        redraw();
      });
      legend.appendChild(btn);
    });
    var right = document.createElement("div");
    right.className = "ctrl-right";
    var hint = document.createElement("span");
    hint.className = "zoom-hint";
    hint.textContent = "Drag to zoom";
    var resetBtn = document.createElement("button");
    resetBtn.type = "button";
    resetBtn.className = "zoom-reset";
    resetBtn.textContent = "↺ Reset zoom";
    right.appendChild(hint); right.appendChild(resetBtn);
    controls.appendChild(legend); controls.appendChild(right);
    container.appendChild(controls);

    var svg = svgEl("svg", { class: "chart", viewBox: "0 0 " + W + " " + H, preserveAspectRatio: "xMidYMid meet", tabindex: "0", role: "img" });
    svg.setAttribute("aria-label", cfg.title + " over time with monthly and yearly rolling averages");
    container.appendChild(svg);

    var tooltip = document.createElement("div");
    tooltip.className = "tooltip";
    var ttDate = document.createElement("div");
    ttDate.className = "t-date";
    var ttRows = document.createElement("div");
    tooltip.appendChild(ttDate); tooltip.appendChild(ttRows);
    container.appendChild(tooltip);

    var clipId = "clip" + (++clipCounter);
    var domain0, domain1, zoomed = false;
    var xScale, yScale, chLine, hit, selRect;

    function rangeDomain() {
      var d0 = t[0], d1 = endDay;
      if (currentRange != null) d0 = Math.max(t[0], endDay - currentRange);
      if (d1 - d0 < 7) d0 = d1 - 7;
      return [d0, d1];
    }

    function redraw() {
      while (svg.firstChild) svg.removeChild(svg.firstChild);

      var lo = lowerBound(t, domain0), hi = lowerBound(t, domain1 + 1) - 1;
      var vMin = Infinity, vMax = -Infinity;
      series.forEach(function (s) {
        if (!s.visible) return;
        for (var i = Math.max(0, lo); i <= hi && i < n; i++) {
          var v = s.vals[i];
          if (v < vMin) vMin = v;
          if (v > vMax) vMax = v;
        }
      });
      var hasData = isFinite(vMin);
      if (!hasData) { vMin = 0; vMax = 1; }
      if (cfg.target && hasData) {
        // keep target thresholds in view when they are close to the data
        [cfg.target[0], cfg.target[1]].forEach(function (x) {
          if (x == null) return;
          var span = Math.max(vMax - vMin, 1e-9);
          if (x < vMin && vMin - x < span * 0.35) vMin = x;
          if (x > vMax && x - vMax < span * 0.35) vMax = x;
        });
      }
      var range = vMax - vMin || Math.abs(vMax) * 0.1 || 1;
      var step = niceStep(range * 1.2, 6);
      var yMin = Math.floor((vMin - range * 0.08) / step) * step;
      var yMax = Math.ceil((vMax + range * 0.08) / step) * step;
      if (yMin < 0 && vMin >= 0) yMin = 0;

      xScale = function (d) { return M.left + ((d - domain0) / (domain1 - domain0)) * plotW; };
      yScale = function (v) { return M.top + (1 - (v - yMin) / (yMax - yMin)) * plotH; };

      var defs = svgEl("defs", {});
      var clip = svgEl("clipPath", { id: clipId });
      clip.appendChild(svgEl("rect", { x: M.left, y: M.top, width: plotW, height: plotH }));
      defs.appendChild(clip);
      svg.appendChild(defs);

      // target: a band for a two-sided range, a threshold line for a one-sided target
      if (cfg.target) {
        var tA = cfg.target[0], tB = cfg.target[1];
        if (tA != null && tB != null) {
          var bLo = Math.max(yMin, tA), bHi = Math.min(yMax, tB);
          if (bHi > bLo) {
            svg.appendChild(svgEl("rect", { class: "target-band", x: M.left, width: plotW, y: yScale(bHi), height: yScale(bLo) - yScale(bHi) }));
            var tl = svgEl("text", { class: "target-label", x: M.left + 8, y: yScale(bHi) + 13, "text-anchor": "start" });
            tl.textContent = "Target: " + cfg.target[2];
            svg.appendChild(tl);
          }
        } else {
          var th = tA != null ? tA : tB;
          if (th >= yMin && th <= yMax) {
            var ty = yScale(th);
            svg.appendChild(svgEl("line", { class: "target-line", x1: M.left, x2: W - M.right, y1: ty, y2: ty }));
            var tl2 = svgEl("text", { class: "target-label", x: M.left + 8, y: tA != null ? ty - 5 : ty + 13, "text-anchor": "start" });
            tl2.textContent = "Target: " + cfg.target[2];
            svg.appendChild(tl2);
          }
        }
      }

      for (var yv = yMin; yv <= yMax + step * 0.001; yv += step) {
        var y = yScale(yv);
        svg.appendChild(svgEl("line", { class: "gridline", x1: M.left, x2: W - M.right, y1: y, y2: y }));
        var tx = svgEl("text", { class: "axis", x: M.left - 8, y: y + 4, "text-anchor": "end" });
        tx.textContent = fmtAxis(cfg, yv, step);
        svg.appendChild(tx);
      }

      buildXTicks(domain0, domain1).forEach(function (tk) {
        var x = xScale(tk.d);
        svg.appendChild(svgEl("line", { class: "gridline", x1: x, x2: x, y1: M.top, y2: H - M.bottom }));
        var xt = svgEl("text", { class: "axis", x: x, y: H - M.bottom + 17, "text-anchor": "middle" });
        xt.textContent = tk.label;
        svg.appendChild(xt);
      });
      svg.appendChild(svgEl("line", { class: "baseline", x1: M.left, x2: W - M.right, y1: H - M.bottom, y2: H - M.bottom }));

      var g = svgEl("g", { "clip-path": "url(#" + clipId + ")" });
      series.forEach(function (s) {
        if (!s.visible) return;
        if (s.id === "raw" && sparse) {
          for (var i = 0; i < n; i++) {
            if (t[i] < domain0 - 1 || t[i] > domain1 + 1) continue;
            g.appendChild(svgEl("circle", { class: "dot-raw", cx: xScale(t[i]), cy: yScale(s.vals[i]), r: 3 }));
          }
        } else {
          g.appendChild(svgEl("path", { class: "line-" + s.id, d: pathFor(s) }));
        }
      });
      svg.appendChild(g);

      if (!hasData) {
        var et = svgEl("text", { class: "empty-note", x: M.left + plotW / 2, y: M.top + plotH / 2, "text-anchor": "middle" });
        et.textContent = "No data in this period";
        svg.appendChild(et);
      }

      chLine = svgEl("line", { class: "crosshair-line", y1: M.top, y2: H - M.bottom });
      svg.appendChild(chLine);
      series.forEach(function (s) {
        s.dot = svgEl("circle", { class: "crosshair-dot", r: 4, fill: s.color });
        svg.appendChild(s.dot);
      });
      selRect = svgEl("rect", { class: "selection-rect", y: M.top, height: plotH, x: M.left, width: 0 });
      svg.appendChild(selRect);
      hit = svgEl("rect", { class: "hit-layer", x: M.left, y: M.top, width: plotW, height: plotH });
      svg.appendChild(hit);
      attach();

      resetBtn.classList.toggle("show", zoomed);
    }

    function pathFor(s) {
      var d = "", prevT = null;
      for (var i = 0; i < n; i++) {
        var x = xScale(t[i]), y = yScale(s.vals[i]);
        var brk = prevT == null || t[i] - prevT > s.gap;
        d += (brk ? "M" : "L") + x.toFixed(1) + "," + y.toFixed(1);
        prevT = t[i];
      }
      return d;
    }

    function clientToDay(clientX) {
      var r = svg.getBoundingClientRect();
      var sx = (clientX - r.left) / r.width * W;
      var d = domain0 + ((sx - M.left) / plotW) * (domain1 - domain0);
      return Math.max(domain0, Math.min(domain1, d));
    }

    function showAt(day) {
      var i = nearestIndex(t, day);
      if (i < 0 || t[i] < domain0 - 1 || t[i] > domain1 + 1) { hide(); return; }
      var x = xScale(t[i]);
      chLine.setAttribute("x1", x); chLine.setAttribute("x2", x);
      chLine.style.opacity = 1;
      while (ttRows.firstChild) ttRows.removeChild(ttRows.firstChild);
      ttDate.textContent = fmtDay(t[i]);
      series.forEach(function (s) {
        if (!s.visible) { s.dot.style.opacity = 0; return; }
        s.dot.setAttribute("cx", x); s.dot.setAttribute("cy", yScale(s.vals[i]));
        s.dot.style.opacity = 1;
        var row = document.createElement("div"); row.className = "t-row";
        var k = document.createElement("span"); k.className = "t-key"; k.style.background = s.color;
        var nm = document.createElement("span"); nm.className = "t-name"; nm.textContent = s.label;
        var v = document.createElement("span"); v.className = "t-val"; v.textContent = fmtValUnit(cfg, s.vals[i]);
        row.appendChild(k); row.appendChild(nm); row.appendChild(v);
        ttRows.appendChild(row);
      });
      var r = svg.getBoundingClientRect(), cr = container.getBoundingClientRect();
      tooltip.style.left = Math.max(120, Math.min(cr.width - 120, r.left - cr.left + x * (r.width / W))) + "px";
      tooltip.style.top = (r.top - cr.top + 4) + "px";
      tooltip.style.opacity = 1;
    }
    function hide() {
      if (chLine) chLine.style.opacity = 0;
      series.forEach(function (s) { if (s.dot) s.dot.style.opacity = 0; });
      tooltip.style.opacity = 0;
    }

    var dragging = false, dragStart = null, focusIdx = n - 1;
    function attach() {
      hit.addEventListener("pointerdown", function (e) {
        dragging = true; dragStart = e.clientX;
        try { hit.setPointerCapture(e.pointerId); } catch (err) {}
      });
      hit.addEventListener("pointermove", function (e) {
        if (dragging) {
          var r = svg.getBoundingClientRect(), sc = r.width / W;
          var a = (dragStart - r.left) / sc, b = (e.clientX - r.left) / sc;
          var l = Math.max(M.left, Math.min(a, b)), h = Math.min(W - M.right, Math.max(a, b));
          selRect.setAttribute("x", l); selRect.setAttribute("width", Math.max(0, h - l));
          selRect.style.display = "block";
          hide();
        } else {
          showAt(clientToDay(e.clientX));
        }
      });
      hit.addEventListener("pointerup", function (e) {
        if (!dragging) return;
        dragging = false;
        selRect.style.display = "none";
        var a = clientToDay(dragStart), b = clientToDay(e.clientX);
        if (Math.abs(b - a) >= 3) {
          domain0 = Math.min(a, b); domain1 = Math.max(a, b); zoomed = true;
          redraw();
        }
      });
      hit.addEventListener("pointerleave", function () { if (!dragging) hide(); });
      hit.addEventListener("dblclick", function () { if (zoomed) resetToRange(); });
    }

    svg.addEventListener("keydown", function (e) {
      if (e.key === "ArrowLeft") { focusIdx = Math.max(0, focusIdx - 1); showAt(t[focusIdx]); e.preventDefault(); }
      else if (e.key === "ArrowRight") { focusIdx = Math.min(n - 1, focusIdx + 1); showAt(t[focusIdx]); e.preventDefault(); }
      else if (e.key === "Escape") hide();
    });
    svg.addEventListener("focus", function () { showAt(t[focusIdx]); });
    svg.addEventListener("blur", hide);

    function resetToRange() {
      var d = rangeDomain();
      domain0 = d[0]; domain1 = d[1]; zoomed = false;
      redraw();
    }
    resetBtn.addEventListener("click", resetToRange);

    resetToRange();
    return { resetToRange: resetToRange };
  }

  function buildXTicks(d0, d1) {
    var span = d1 - d0, ticks = [];
    var dd0 = dayToDate(d0);
    if (span > 720) {
      var y0 = dd0.getUTCFullYear(), y1 = dayToDate(d1).getUTCFullYear();
      var st = (y1 - y0) > 12 ? 2 : 1;
      for (var y = y0; y <= y1; y += st) {
        var d = Math.round(Date.UTC(y, 0, 1) / DAY_MS);
        if (d >= d0 && d <= d1) ticks.push({ d: d, label: String(y) });
      }
    } else if (span > 100) {
      var months = span / 30.4, stm = months > 20 ? 3 : months > 9 ? 2 : 1;
      var cy = dd0.getUTCFullYear(), cm = dd0.getUTCMonth();
      for (;;) {
        var dm = Math.round(Date.UTC(cy, cm, 1) / DAY_MS);
        if (dm > d1) break;
        if (dm >= d0) ticks.push({ d: dm, label: fmtMonYear(dm) });
        cm += stm; if (cm > 11) { cy += Math.floor(cm / 12); cm = cm % 12; }
      }
    } else {
      var sd = span > 40 ? 7 : span > 14 ? 3 : span > 7 ? 2 : 1;
      for (var x = Math.ceil(d0); x <= d1; x += sd) ticks.push({ d: x, label: fmtDDMM(x) });
    }
    return ticks;
  }

  // ---------- panels ----------
  var sectionsEl = document.getElementById("sections");
  SECTIONS.forEach(function (sec) {
    var h2 = document.createElement("h2");
    h2.className = "section";
    h2.textContent = sec.title;
    sectionsEl.appendChild(h2);

    sec.keys.forEach(function (key) {
      var cfg = PANELS[key], p = HEALTH.panels[key], s = summarize(key);
      var panel = document.createElement("div");
      panel.className = "card panel";
      panel.id = "panel-" + key;

      var head = document.createElement("div");
      head.className = "panel-head";
      var titleBox = document.createElement("div");
      titleBox.className = "panel-title";
      var h3 = document.createElement("h3");
      h3.textContent = cfg.title;
      var unit = document.createElement("span");
      unit.className = "unit";
      unit.textContent = cfg.unit;
      h3.appendChild(unit);
      titleBox.appendChild(h3);
      var why = document.createElement("p");
      why.className = "why";
      why.textContent = cfg.why;
      titleBox.appendChild(why);
      if (cfg.ref) {
        var ref = document.createElement("p");
        ref.className = "ref";
        ref.appendChild(document.createTextNode("Evidence: "));
        var ra = document.createElement("a");
        ra.href = cfg.ref[1]; ra.target = "_blank"; ra.rel = "noopener";
        ra.textContent = cfg.ref[0];
        ref.appendChild(ra);
        titleBox.appendChild(ref);
      }
      head.appendChild(titleBox);

      var tiles = document.createElement("div");
      tiles.className = "tiles";
      function tile(label, valueText, st, sub) {
        var el = document.createElement("div"); el.className = "tile";
        var l = document.createElement("div"); l.className = "label"; l.textContent = label;
        var v = document.createElement("div"); v.className = "value";
        var vt = document.createElement("span"); vt.textContent = valueText;
        v.appendChild(vt);
        if (st) v.appendChild(chipEl(st));
        var sb = document.createElement("div"); sb.className = "sub"; sb.textContent = sub;
        el.appendChild(l); el.appendChild(v); el.appendChild(sb);
        tiles.appendChild(el);
      }
      if (s) {
        tile("Monthly avg (30 days)", fmtValUnit(cfg, s.now30), null,
             (s.stale ? "last reading " : "as of ") + fmtDay(s.lastDay) +
             (p.raw && s.count30 < 15 ? " · " + s.count30 + (s.count30 === 1 ? " reading" : " readings") : ""));
        tile("Monthly avg vs. last month",
             s.prev30 == null ? "–" : fmtDelta(cfg, s.now30 - s.prev30), s.st30,
             s.prev30 == null ? "no data a month earlier" : "previous month: " + fmtValUnit(cfg, s.prev30));
        tile("Yearly avg vs. last year",
             s.prev365 == null ? "–" : fmtDelta(cfg, s.now365 - s.prev365), s.st365,
             s.prev365 == null ? "yearly avg " + fmtValUnit(cfg, s.now365) + " · less than a year of data"
                               : "yearly avg " + fmtValUnit(cfg, s.now365) + " · previous: " + fmtValUnit(cfg, s.prev365));
      } else {
        tile("No data", "–", null, "not found in this export");
      }
      head.appendChild(tiles);
      panel.appendChild(head);
      sectionsEl.appendChild(panel);

      if (p && p.t.length) {
        charts.push(makeChart(key, panel));
        var note = document.createElement("div");
        note.className = "data-note";
        note.textContent = "Data from " + fmtDay(p.t[0]) + " to " + fmtDay(p.t[p.t.length - 1]) +
          (p.raw ? " · " + p.t.length.toLocaleString("de-DE") + " days with readings" : "");
        panel.appendChild(note);
      }
    });
  });
};
