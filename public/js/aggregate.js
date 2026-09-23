/*
 * Health export aggregator.
 *
 * Streams the text of an Apple Health export.xml (fed in chunks) and computes the
 * small set of daily metrics the dashboard needs: 30-day and 365-day rolling averages,
 * a seasonal profile, sleep timing and the weight series.
 *
 * Apple writes one element per line, so this is a line-oriented streaming parser:
 * it never holds the whole file in memory and only looks at the record types it needs.
 * Works in a Web Worker (importScripts) and in Node (require) for testing.
 */
(function (root) {
  "use strict";

  var QUANTITY = {
    HKQuantityTypeIdentifierBodyMass: "weight",
    HKQuantityTypeIdentifierBodyFatPercentage: "bodyfat",
    HKQuantityTypeIdentifierRestingHeartRate: "rhr",
    HKQuantityTypeIdentifierHeartRateVariabilitySDNN: "hrv",
    HKQuantityTypeIdentifierVO2Max: "vo2",
    HKQuantityTypeIdentifierHeartRateRecoveryOneMinute: "hrr",
    HKQuantityTypeIdentifierWalkingSpeed: "walkspeed",
    HKQuantityTypeIdentifierStepCount: "steps",
    HKQuantityTypeIdentifierAppleExerciseTime: "exercise",
    HKQuantityTypeIdentifierBloodPressureSystolic: "bpsys",
    HKQuantityTypeIdentifierBloodPressureDiastolic: "bpdia",
    HKQuantityTypeIdentifierDistanceCycling: "cycling"
  };
  var SLEEP_TYPE = "HKCategoryTypeIdentifierSleepAnalysis";
  var ASLEEP = {
    HKCategoryValueSleepAnalysisAsleepCore: 1,
    HKCategoryValueSleepAnalysisAsleepDeep: 2,
    HKCategoryValueSleepAnalysisAsleepREM: 2,
    HKCategoryValueSleepAnalysisAsleepUnspecified: 1,
    HKCategoryValueSleepAnalysisAsleep: 1
  }; // 2 = restorative (deep / REM)
  var STRENGTH = {
    HKWorkoutActivityTypeTraditionalStrengthTraining: 1,
    HKWorkoutActivityTypeFunctionalStrengthTraining: 1
  };
  var FITBIT_SOURCES = { "SyncFit": 1, "Fitbit to Apple Health": 1, "Sync Solver": 1, "Power Sync": 1 };
  // Plausible daily values; anything outside is treated as a sync glitch.
  var PLAUSIBLE = {
    vo2: [10, 90], hrr: [1, 100], rhr: [30, 120], hrv: [1, 300], walkspeed: [1, 10],
    bpsys: [70, 250], bpdia: [40, 150], bodyfat: [3, 60], steps: [1, 60000], exercise: [0, 600], cycling: [0, 300]
  };
  var TOTAL_KEYS = { steps: 1, exercise: 1, cycling: 1 };   // summed per day (others: daily mean)
  var DAY_MS = 86400000;

  function sourcePriority(name) {
    // Lower is better: Apple Watch, then Fitbit-derived, then other apps, phone estimates last.
    if (name.indexOf("Watch") >= 0) return 0;
    if (FITBIT_SOURCES[name]) return 1;
    if (name.indexOf("iPhone") >= 0 || name === "Clock" || name === "Health") return 3;
    return 2;
  }

  var ATTR_RE = /(\w+)="([^"]*)"/g;
  function attrs(line) {
    var a = {}, m;
    ATTR_RE.lastIndex = 0;
    while ((m = ATTR_RE.exec(line))) a[m[1]] = m[2];
    return a;
  }
  // "2026-09-22 03:51:03 +0200" -> ms, treating the local wall-clock time as if it were UTC
  function localMs(ts) {
    return Date.UTC(+ts.slice(0, 4), +ts.slice(5, 7) - 1, +ts.slice(8, 10), +ts.slice(11, 13), +ts.slice(14, 16), +ts.slice(17, 19));
  }
  function isoDay(ms) { return new Date(ms).toISOString().slice(0, 10); }
  function dayIndex(iso) { return Math.round(Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)) / DAY_MS); }
  function round(x, d) { var f = Math.pow(10, d); return Math.round(x * f) / f; }

  function Aggregator() {
    this.q = {};                         // key -> date -> source -> [values]
    for (var t in QUANTITY) this.q[QUANTITY[t]] = {};
    this.weightLast = {};                // date -> [timestamp, value]
    this.sleep = {};                     // night -> source -> {all:[[s,e]], rest:[[s,e]]}
    this.strength = {};                  // date -> count
    this.seen = new Set();               // exact duplicate records (some sync apps write twice)
    this.exportDate = null;
    this.carry = "";
    this.lines = 0;
  }

  Aggregator.prototype.feed = function (text) {
    var s = this.carry + text, pos = 0, nl;
    while ((nl = s.indexOf("\n", pos)) >= 0) {
      this.line(s, pos, nl);
      pos = nl + 1;
    }
    this.carry = s.slice(pos);
  };

  Aggregator.prototype.line = function (s, pos, end) {
    this.lines++;
    if (s.startsWith(" <Record type=\"", pos)) {
      var ts = pos + 15, te = s.indexOf("\"", ts);
      var type = s.slice(ts, te);
      var key = QUANTITY[type];
      if (key) return this.quantity(key, attrs(s.slice(pos, end)));
      if (type === SLEEP_TYPE) return this.sleepRecord(attrs(s.slice(pos, end)));
    } else if (s.startsWith(" <Workout ", pos)) {
      var w = attrs(s.slice(pos, end));
      if (STRENGTH[w.workoutActivityType] && w.startDate) {
        var d = w.startDate.slice(0, 10);
        this.strength[d] = (this.strength[d] || 0) + 1;
      }
    } else if (this.exportDate === null && s.startsWith(" <ExportDate", pos)) {
      var m = /value="([^"]*)"/.exec(s.slice(pos, end));
      if (m) this.exportDate = m[1].slice(0, 10);
    }
  };

  Aggregator.prototype.quantity = function (key, a) {
    var v = parseFloat(a.value);
    if (!isFinite(v) || !a.startDate) return;
    var src = a.sourceName || "";
    if (TOTAL_KEYS[key]) {
      var sig = key + "|" + src + "|" + a.startDate + "|" + a.endDate + "|" + a.value;
      if (this.seen.has(sig)) return;
      this.seen.add(sig);
    }
    var d = a.startDate.slice(0, 10);
    if (key === "weight") {
      var prev = this.weightLast[d];
      if (!prev || a.startDate >= prev[0]) this.weightLast[d] = [a.startDate, v];
      return;
    }
    if (key === "bodyfat") v *= 100;
    if (!TOTAL_KEYS[key]) {
      var r = PLAUSIBLE[key];
      if (v < r[0] || v > r[1]) return;
    }
    var byDay = this.q[key][d] || (this.q[key][d] = {});
    (byDay[src] || (byDay[src] = [])).push(v);
  };

  Aggregator.prototype.sleepRecord = function (a) {
    var kind = ASLEEP[a.value];
    if (!kind || !a.startDate || !a.endDate) return;
    var s = localMs(a.startDate), e = localMs(a.endDate);
    if (!(e > s)) return;
    var night = isoDay(s + 6 * 3600000);   // sleep starting after 18:00 counts for the next day
    var bySrc = this.sleep[night] || (this.sleep[night] = {});
    var src = a.sourceName || "";
    var b = bySrc[src] || (bySrc[src] = { all: [], rest: [] });
    b.all.push([s, e]);
    if (kind === 2) b.rest.push([s, e]);
  };

  // ---------- post-processing ----------
  function dailyMeanByPriority(perDay) {
    var out = {};
    for (var d in perDay) {
      var srcs = perDay[d], best = 9, s;
      for (s in srcs) best = Math.min(best, sourcePriority(s));
      var sum = 0, n = 0;
      for (s in srcs) if (sourcePriority(s) === best) srcs[s].forEach(function (v) { sum += v; n++; });
      out[d] = sum / n;
    }
    return out;
  }
  function dailyTotalMaxSource(perDay) {
    var out = {};
    for (var d in perDay) {
      var best = 0;
      for (var s in perDay[d]) best = Math.max(best, perDay[d][s].reduce(function (x, y) { return x + y; }, 0));
      out[d] = best;
    }
    return out;
  }
  function clean(key, daily) {
    var r = PLAUSIBLE[key], out = {};
    for (var d in daily) if (daily[d] >= r[0] && daily[d] <= r[1]) out[d] = daily[d];
    return out;
  }
  function unionHours(ivs) {
    if (!ivs.length) return 0;
    ivs = ivs.slice().sort(function (a, b) { return a[0] - b[0] || a[1] - b[1]; });
    var total = 0, cs = ivs[0][0], ce = ivs[0][1];
    for (var i = 1; i < ivs.length; i++) {
      if (ivs[i][0] <= ce) { if (ivs[i][1] > ce) ce = ivs[i][1]; }
      else { total += ce - cs; cs = ivs[i][0]; ce = ivs[i][1]; }
    }
    return (total + ce - cs) / 3600000;
  }
  function rolling(ts, vals, windowDays, mode) {
    var out = new Array(ts.length), start = 0, acc = 0;
    for (var i = 0; i < ts.length; i++) {
      acc += vals[i];
      while (ts[start] < ts[i] - (windowDays - 1)) { acc -= vals[start]; start++; }
      out[i] = mode === "sum" ? acc : acc / (i - start + 1);
    }
    return out;
  }
  function seriesFromDaily(daily, dec) {
    var days = Object.keys(daily).sort();
    var ts = days.map(dayIndex), vals = days.map(function (d) { return daily[d]; });
    var r30 = rolling(ts, vals, 30), r365 = rolling(ts, vals, 365);
    var rnd = function (xs) { return xs.map(function (x) { return round(x, dec); }); };
    return { t: ts, raw: rnd(vals), r30: rnd(r30), r365: rnd(r365) };
  }
  function seasonalProfile(daily, mode, covered) {
    var perMonth = {}, d;
    for (d in daily) (perMonth[d.slice(0, 7)] || (perMonth[d.slice(0, 7)] = [])).push(daily[d]);
    var byCal = {};
    var months = mode === "total" ? covered : Object.keys(perMonth);
    months.forEach(function (ym) {
      var vals = perMonth[ym] || [];
      var sum = vals.reduce(function (x, y) { return x + y; }, 0);
      var m = +ym.slice(5, 7);
      if (mode === "mean") { if (vals.length < 10) return; (byCal[m] || (byCal[m] = [])).push(sum / vals.length); }
      else (byCal[m] || (byCal[m] = [])).push(sum);
    });
    var avg = [], years = [];
    for (var m = 1; m <= 12; m++) {
      var a = byCal[m];
      avg.push(a && a.length ? round(a.reduce(function (x, y) { return x + y; }, 0) / a.length, 1) : null);
      years.push(a ? a.length : 0);
    }
    return { months: avg, years: years };
  }

  Aggregator.prototype.finish = function () {
    if (this.carry) { var c = this.carry; this.carry = ""; this.line(c, 0, c.length); }
    var self = this, panels = {};
    [["vo2", 2], ["hrr", 1], ["rhr", 1], ["hrv", 1], ["walkspeed", 2], ["bpsys", 1], ["bpdia", 1], ["bodyfat", 2]]
      .forEach(function (p) { panels[p[0]] = seriesFromDaily(clean(p[0], dailyMeanByPriority(self.q[p[0]])), p[1]); });
    var steps = clean("steps", dailyTotalMaxSource(this.q.steps));
    var exercise = clean("exercise", dailyTotalMaxSource(this.q.exercise));
    var cycling = clean("cycling", dailyTotalMaxSource(this.q.cycling));
    panels.steps = seriesFromDaily(steps, 0);
    panels.exercise = seriesFromDaily(exercise, 1);

    // sleep per night
    var total = {}, rest = {}, timing = {};
    Object.keys(this.sleep).forEach(function (night) {
      var srcs = self.sleep[night], best = 9, s;
      for (s in srcs) best = Math.min(best, sourcePriority(s));
      var all = [], rs = [];
      for (s in srcs) if (sourcePriority(s) === best) { all = all.concat(srcs[s].all); rs = rs.concat(srcs[s].rest); }
      var hours = unionHours(all);
      if (hours < 3 || hours > 14) return;               // partial / broken nights
      total[night] = hours;
      if (rs.length) rest[night] = unionHours(rs);
      var midnight = Date.UTC(+night.slice(0, 4), +night.slice(5, 7) - 1, +night.slice(8, 10));
      var onset = (Math.min.apply(null, all.map(function (x) { return x[0]; })) - midnight) / 60000;
      var wake = (Math.max.apply(null, all.map(function (x) { return x[1]; })) - midnight) / 60000;
      if (onset >= -480 && onset <= 360 && wake >= 0 && wake <= 900) timing[night] = [Math.round(onset), Math.round(wake)];
    });
    panels.sleep = seriesFromDaily(total, 3);
    panels.sleeprest = seriesFromDaily(rest, 3);

    // strength sessions: every day from the first session to the export date counts (0 if none)
    var sd = Object.keys(this.strength).sort();
    if (sd.length) {
      var first = dayIndex(sd[0]), last = dayIndex(this.exportDate || sd[sd.length - 1]);
      var ts = [], vals = [];
      for (var di = first; di <= last; di++) { ts.push(di); vals.push(this.strength[isoDay(di * DAY_MS)] || 0); }
      panels.strength = {
        t: ts, raw: null,
        r30: rolling(ts, vals, 30, "sum").map(function (x) { return round(x, 2); }),
        r365: rolling(ts, vals, 365, "sum").map(function (x) { return round(x * 30 / 365, 2); })
      };
    } else panels.strength = { t: [], raw: null, r30: [], r365: [] };

    // seasonal profile (months in which the watch was recording exercise minutes)
    var exMonths = {};
    Object.keys(exercise).forEach(function (d) { exMonths[d.slice(0, 7)] = (exMonths[d.slice(0, 7)] || 0) + 1; });
    var covered = Object.keys(exMonths).filter(function (ym) { return exMonths[ym] >= 10; });
    var coveredSet = {}; covered.forEach(function (ym) { coveredSet[ym] = 1; });
    var stepsCovered = {};
    Object.keys(steps).forEach(function (d) { if (coveredSet[d.slice(0, 7)]) stepsCovered[d] = steps[d]; });
    var seasonal = {
      cyclingKm: seasonalProfile(cycling, "total", covered),
      exerciseMin: seasonalProfile(exercise, "mean", null),
      steps: seasonalProfile(stepsCovered, "mean", null)
    };

    var tn = Object.keys(timing).sort();
    var sleepTiming = {
      t: tn.map(dayIndex),
      onset: tn.map(function (d) { return timing[d][0]; }),
      wake: tn.map(function (d) { return timing[d][1]; })
    };
    var wd = Object.keys(this.weightLast).sort();
    var weight = wd.map(function (d) { return [d, self.weightLast[d][1]]; });

    // Key order matters: the Worker validates the first bytes without parsing the whole document.
    return {
      schema: 1,
      exportDate: this.exportDate,
      generatedAt: new Date().toISOString(),
      latestWeightKg: weight.length ? weight[weight.length - 1][1] : null,
      panels: panels,
      seasonal: seasonal,
      sleepTiming: sleepTiming,
      weight: weight
    };
  };

  var api = { Aggregator: Aggregator };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.HealthAggregate = api;
})(typeof self !== "undefined" ? self : this);
