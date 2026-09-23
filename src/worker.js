/**
 * Cloudflare Worker for the health dashboard.
 *
 * Static files (the dashboard pages and the in-browser parser) are served from ./public
 * by Workers Static Assets. This Worker only handles the small JSON API:
 *
 *   GET    /api/snapshots           list of stored snapshots (newest first)
 *   GET    /api/snapshots/latest    the most recent aggregated metrics JSON
 *   GET    /api/snapshots/:id       one specific snapshot
 *   POST   /api/snapshots           store a new snapshot (body = aggregated metrics JSON)
 *   DELETE /api/snapshots/:id       remove a snapshot
 *
 * Storage: Workers KV (binding METRICS). Each upload is kept under "snap:<ISO timestamp>"
 * so you have a history; "latest" holds a copy of the newest one.
 *
 * The raw Apple Health export never reaches this Worker - the browser parses it locally
 * and only uploads the aggregated numbers (a few hundred KB).
 *
 * Free-tier friendly: the Worker never parses the (large) JSON body - it only checks its
 * header and size - so each request stays far below the 10 ms CPU limit.
 *
 * Optional: set a secret UPLOAD_KEY (wrangler secret put UPLOAD_KEY) to require the
 * header "X-Upload-Key" for POST and DELETE. Without it, anyone who knows the URL can upload.
 */

const MAX_BYTES = 10 * 1024 * 1024; // 10 MB - far above a real snapshot (~0.7 MB)
const JSON_HEADERS = { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" };

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (!url.pathname.startsWith("/api/")) {
      return env.ASSETS.fetch(request);
    }
    try {
      return await handleApi(request, env, url);
    } catch (err) {
      return json({ error: "Internal error", detail: String(err && err.message || err) }, 500);
    }
  },
};

async function handleApi(request, env, url) {
  if (!env.METRICS) return json({ error: "KV namespace METRICS is not bound. See README." }, 500);
  const parts = url.pathname.replace(/\/+$/, "").split("/").slice(2); // ["snapshots", id?]
  if (parts[0] !== "snapshots") return json({ error: "Not found" }, 404);
  const id = parts[1] ? decodeURIComponent(parts[1]) : null;

  if (request.method === "GET" && !id) return listSnapshots(env);
  if (request.method === "GET" && id === "latest") return getSnapshot(env, "latest");
  if (request.method === "GET" && id) return getSnapshot(env, "snap:" + id);
  if (request.method === "POST" && !id) return createSnapshot(request, env);
  if (request.method === "DELETE" && id && id !== "latest") return deleteSnapshot(request, env, id);
  return json({ error: "Method not allowed" }, 405);
}

function authorized(request, env) {
  if (!env.UPLOAD_KEY) return true;
  return request.headers.get("x-upload-key") === env.UPLOAD_KEY;
}

async function listSnapshots(env) {
  const items = [];
  let cursor;
  do {
    const page = await env.METRICS.list({ prefix: "snap:", cursor });
    for (const k of page.keys) items.push({ id: k.name.slice(5), ...(k.metadata || {}) });
    cursor = page.list_complete ? undefined : page.cursor;
  } while (cursor);
  items.sort((a, b) => (a.id < b.id ? 1 : -1));
  return json(items);
}

async function getSnapshot(env, key) {
  const { value, metadata } = await env.METRICS.getWithMetadata(key, { type: "stream" });
  if (value === null) return json({ error: "No data yet" }, 404);
  const headers = new Headers(JSON_HEADERS);
  if (metadata && metadata.id) headers.set("x-snapshot-id", metadata.id);
  if (metadata && metadata.uploadedAt) headers.set("x-uploaded-at", metadata.uploadedAt);
  return new Response(value, { headers });
}

async function createSnapshot(request, env) {
  if (!authorized(request, env)) return json({ error: "Upload key required" }, 401);
  const declared = Number(request.headers.get("content-length") || 0);
  if (declared > MAX_BYTES) return json({ error: "Too large" }, 413);
  const body = await request.text();
  if (body.length > MAX_BYTES) return json({ error: "Too large" }, 413);

  // Cheap validation without parsing the whole document: the browser writes "schema"
  // and "exportDate" first, and the document must be a JSON object.
  const head = body.slice(0, 200);
  if (!/^\{"schema":1,/.test(head) || !body.endsWith("}")) {
    return json({ error: "Not a dashboard metrics file (schema 1)" }, 400);
  }
  const m = /"exportDate":"(\d{4}-\d{2}-\d{2})"/.exec(head);
  const exportDate = m ? m[1] : null;

  const id = new Date().toISOString();
  const metadata = { id, uploadedAt: id, exportDate, bytes: body.length };
  await env.METRICS.put("snap:" + id, body, { metadata });
  await env.METRICS.put("latest", body, { metadata });
  return json({ ok: true, id, exportDate }, 201);
}

async function deleteSnapshot(request, env, id) {
  if (!authorized(request, env)) return json({ error: "Upload key required" }, 401);
  await env.METRICS.delete("snap:" + id);
  return json({ ok: true });
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: JSON_HEADERS });
}
