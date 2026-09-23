#!/usr/bin/env node
// Command-line version of the in-browser parser (same code), for testing or offline use.
//
//   node tools/parse-export.mjs path/to/export.zip [out.json]
//
// Requires Node 22+ (Blob streams, DecompressionStream "deflate-raw").
import { openAsBlob } from "node:fs";
import { writeFileSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { openExport } = require("../public/js/zipstream.js");
const { Aggregator } = require("../public/js/aggregate.js");

const [, , input, output] = process.argv;
if (!input) {
  console.error("usage: node tools/parse-export.mjs export.zip [out.json]");
  process.exit(1);
}

const t0 = Date.now();
const blob = await openAsBlob(input);
const exp = await openExport(blob, input);
console.error(`Reading ${exp.name}: ${(exp.compressedSize / 1e6).toFixed(0)} MB compressed, ${(exp.uncompressedSize / 1e6).toFixed(0)} MB XML`);
const agg = new Aggregator();
let last = 0;
const reader = exp.stream((f) => {
  const pct = Math.floor(f * 10);
  if (pct > last) { last = pct; console.error(`  ${pct * 10}%  ${((Date.now() - t0) / 1000).toFixed(1)}s`); }
}).pipeThrough(new TextDecoderStream("utf-8")).getReader();
for (;;) {
  const { done, value } = await reader.read();
  if (done) break;
  agg.feed(value);
}
const result = agg.finish();
const json = JSON.stringify(result);
console.error(`Done in ${((Date.now() - t0) / 1000).toFixed(1)}s: ${agg.lines.toLocaleString()} lines, result ${(json.length / 1024).toFixed(0)} KB`);
for (const [k, p] of Object.entries(result.panels)) {
  console.error(`  ${k.padEnd(10)} ${String(p.t.length).padStart(5)} days`);
}
if (output) writeFileSync(output, json);
else process.stdout.write(json);
