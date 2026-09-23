/*
 * Web Worker: parses a dropped Apple Health export entirely inside the browser.
 * Receives { file }, posts { type: "progress", fraction, phase } and finally
 * { type: "done", result } (the aggregated metrics) or { type: "error", message }.
 */
importScripts("zipstream.js", "aggregate.js");

self.onmessage = async function (e) {
  var file = e.data.file;
  try {
    var exp = await self.HealthZip.openExport(file, file.name);
    self.postMessage({ type: "progress", fraction: 0, phase: "Reading " + exp.name.split("/").pop() });
    var agg = new self.HealthAggregate.Aggregator();
    var lastPost = 0, frac = 0;
    var stream = exp.stream(function (f) { frac = f; })
      .pipeThrough(new TextDecoderStream("utf-8"));
    var reader = stream.getReader();
    for (;;) {
      var r = await reader.read();
      if (r.done) break;
      agg.feed(r.value);
      var now = Date.now();
      if (now - lastPost > 250) {
        lastPost = now;
        self.postMessage({ type: "progress", fraction: frac, phase: "Parsing" });
      }
    }
    self.postMessage({ type: "progress", fraction: 1, phase: "Calculating averages" });
    var result = agg.finish();
    self.postMessage({ type: "done", result: result });
  } catch (err) {
    self.postMessage({ type: "error", message: (err && err.message) || String(err) });
  }
};
