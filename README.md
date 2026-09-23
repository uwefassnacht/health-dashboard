# Health dashboard on Cloudflare

A longevity dashboard and a weight chart built from an Apple Health export, hosted on Cloudflare Workers (free tier).

## How it works

1. You open the dashboard and drop `export.zip` (from the iPhone Health app) onto the page.
2. **The browser does all the heavy lifting.** A Web Worker reads the zip's central directory, streams the main `export.xml` through the browser's native decompressor, and parses it with a streaming, line-by-line parser. The multi-GB file is never loaded into memory as a whole. The worker computes only what the dashboard shows: daily values, 30-day and 365-day rolling averages, the seasonal profile and sleep timing.
3. **Only that small result** (a JSON file of about 0.7 MB) is uploaded to the Worker, which stores it in Workers KV. Since each export is a full re-export (not incremental), a new upload deletes the previous one — only the current snapshot is ever kept.
4. When you open the dashboard from any device, it loads the latest stored JSON and renders it.

The raw export never leaves your machine. The Worker never parses the uploaded JSON. It only checks the header and the size, so every request stays well under the free plan's 10 ms CPU limit.

```
public/                     static site (Workers Static Assets)
  index.html                longevity dashboard
  weight.html               weight chart
  css/app.css               app bar, upload dialog
  js/app.js                 loads data from the API, history, upload flow
  js/longevity.js           longevity charts, overview and advice
  js/weight.js              weight chart
  js/parser-worker.js       Web Worker that parses the dropped export
  js/zipstream.js           streaming zip reader (ZIP64-capable)
  js/aggregate.js           metrics calculation (same logic as the old Python builder)
src/worker.js               JSON API on Workers KV
tools/parse-export.mjs      same parser from the command line (Node 22+)
wrangler.jsonc              Cloudflare configuration
```

## Deploy (about 5 minutes)

You need a free Cloudflare account and Node.js 20 or newer.

```bash
npm install                                   # installs wrangler locally
npx wrangler login                            # opens the browser to authorise
npx wrangler kv namespace create METRICS      # prints an id
```

Paste the printed id into `wrangler.jsonc` in place of `REPLACE_WITH_YOUR_KV_NAMESPACE_ID`, then run:

```bash
npx wrangler deploy
```

Wrangler prints the URL, for example `https://health-dashboard.<your-subdomain>.workers.dev`. Open it and drop your `export.zip`. To use your own domain, add it under *Workers & Pages → health-dashboard → Settings → Domains & Routes*.

This repo is connected to Cloudflare's Git integration (*Workers & Pages → health-dashboard → Settings → Builds*), so pushing to `main` redeploys automatically — the manual `wrangler deploy` above is only needed for the first deploy or for testing locally.

### Optional: protect uploads

Without a key, anyone who knows the URL can view the dashboard and upload data. To require a key for uploads and deletions:

```bash
npx wrangler secret put UPLOAD_KEY
```

The dashboard asks for the key the first time you upload, then remembers it in that browser. Viewing stays open.

## Updating the data

Click **Update data**, then drop the new `export.zip`. Parsing a 1.5 GB export takes about 10–30 seconds in a current browser. The page then switches to the new snapshot. **Download JSON** saves the current metrics file, and dropping such a JSON file onto the upload dialog re-uploads it, which is useful as a backup or restore.

Supported browsers: current Chrome, Edge, Firefox (113+) and Safari (16.4+). The parser needs the native `DecompressionStream("deflate-raw")`.

## Local development

```bash
npm run dev          # wrangler dev on http://localhost:8787, with a local KV store
```

Command-line parsing gives the same result as the browser:

```bash
node tools/parse-export.mjs path/to/export.zip metrics.json
curl -X POST -H 'content-type: application/json' --data-binary @metrics.json https://<your-url>/api/snapshots
```

## API

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/snapshots` | the current upload, if any (id, export date, upload time, size) |
| GET | `/api/snapshots/latest` | the current metrics JSON |
| GET | `/api/snapshots/<id>` | the current upload, if the id matches |
| POST | `/api/snapshots` | replace the stored snapshot with a new metrics JSON |
| DELETE | `/api/snapshots/<id>` | remove the current upload |

## Free-tier budget

Workers KV free tier: 100,000 reads a day, 1,000 writes a day, 1 GB of storage. Only one snapshot is ever stored (about 0.7 MB), so storage is a non-issue. Each upload uses a few writes; each page view uses 1–2 reads.

## Personal settings

Near the top of `public/js/longevity.js`, `var PERSONAL = { naturalWaking: true };` tailors the sleep advice to someone who wakes without an alarm and tends to wake early. The metric texts, targets and study links are in the `PANELS` object in the same file.

## Privacy

The stored JSON contains only dates and daily numbers: no names, device or app names, date of birth, locations or workout routes. The export's source names (which include the owner's name, for example in "…'s Apple Watch") are only used inside the browser to prefer Apple Watch readings, and they are never stored.
