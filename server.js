/**
 * Static file server + /api/report → Telegram.
 * No dependencies, node stdlib only.
 *
 * Run:
 *   PORT=8082 TG_BOT_TOKEN=... TG_CHAT_ID=... node server.js
 * Without a token the messages are printed to the console instead.
 *
 * Hardening notes:
 *   - every request handler is wrapped, so a malformed URL cannot kill the process
 *   - /api/report is rate limited per IP and globally
 *   - only ./public is reachable; the resolved path must stay inside it
 *   - strict CSP, nosniff and frame-ancestors 'none' on every response
 */
import http from "node:http";
import https from "node:https";
import fs from "node:fs";
import path from "node:path";
import { validateReport, validateSuggestion } from "./validate.js";

const PORT = process.env.PORT || 8080;
const TOKEN = process.env.TG_BOT_TOKEN;
const CHAT = process.env.TG_CHAT_ID;
const ROOT = path.join(import.meta.dirname, "public");   // only the front-end is web-reachable

const MAX_URL = 2048;
const MAX_BODY = 4096;
const POSTS_PER_IP = 10;            // per minute, per route
const REPORTS_GLOBAL = 60;          // per hour, protects the Telegram chat from a flood
const SUGGESTIONS_GLOBAL = 40;      // per hour

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
};

// Hosts serving product photos. Keep in sync with IMAGE_HOSTS in public/images.js
// and the meta tag in public/index.html. img-src only — an image cannot execute.
const IMAGE_HOSTS = [
  "https://resource.logitech.com",
  "https://medias-p1.phoenix.razer.com",
  "https://bpcdn.atkgear.com",
  "https://cdn.shopify.com",
  "https://www.darmoshark.cc",
  "https://www.gloriousgaming.com",
  "https://images.ctfassets.net",
  "https://media.steelseriescdn.com",
  "https://assets.corsair.com",
  "https://a.storyblok.com",
  "https://www.coolermaster.com",
  "https://dlcdnwebimgs.asus.com",
  "https://img.endgamegear.com",
  "https://cherryxtrfy.com",
  "https://image.benq.com",
  "https://img.bloody.com",
];

const SECURITY_HEADERS = {
  "content-security-policy":
    "default-src 'none'; script-src 'self'; style-src 'self'; " +
    `img-src 'self' data: ${IMAGE_HOSTS.join(" ")}; ` +
    "connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
  "x-content-type-options": "nosniff",
  "referrer-policy": "no-referrer",
  "cross-origin-opener-policy": "same-origin",
  "permissions-policy": "hid=(self), geolocation=(), camera=(), microphone=(), usb=()",
};

/* ---------- rate limiting ---------- */
const ipHits = new Map();           // "route|ip" → { count, resetAt }
const globalHits = { count: 0, resetAt: 0 };
const suggestHits = { count: 0, resetAt: 0 };

function overLimit(bucket, max, windowMs, now) {
  if (now > bucket.resetAt) { bucket.count = 0; bucket.resetAt = now + windowMs; }
  return ++bucket.count > max;
}

/** Per route, so hitting the report limit never blocks someone typing a suggestion. */
function ipOverLimit(route, ip, now) {
  if (ipHits.size > 10_000) ipHits.clear();          // ponytail: crude sweep, fine at this scale
  const key = `${route}|${ip}`;
  let bucket = ipHits.get(key);
  if (!bucket) ipHits.set(key, (bucket = { count: 0, resetAt: 0 }));
  return overLimit(bucket, POSTS_PER_IP, 60_000, now);
}

/* ---------- helpers ---------- */
const escapeHtml = s => String(s).replace(/[<>&]/g, c => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" }[c]));
const hex4 = n => "0x" + n.toString(16).padStart(4, "0");

function send(res, code, body, type = "text/plain; charset=utf-8") {
  if (res.headersSent) return;
  res.writeHead(code, { ...SECURITY_HEADERS, "content-type": type });
  res.end(body);
}

function telegram(text) {
  if (!TOKEN || !CHAT) return console.log("[telegram disabled]\n" + text);

  const body = JSON.stringify({ chat_id: CHAT, text, parse_mode: "HTML" });
  const req = https.request({
    hostname: "api.telegram.org",
    path: `/bot${TOKEN}/sendMessage`,
    method: "POST",
    timeout: 10_000,
    headers: { "content-type": "application/json", "content-length": Buffer.byteLength(body) },
  }, res => {
    res.resume();
    if (res.statusCode !== 200) console.error("telegram http", res.statusCode);
  });
  req.on("timeout", () => req.destroy());
  req.on("error", e => console.error("telegram", e.message));
  req.end(body);
}

function readJson(req, limit = MAX_BODY) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on("data", c => {
      size += c.length;
      if (size > limit) { reject(new Error("body too large")); req.destroy(); return; }
      chunks.push(c);
    });
    req.on("end", () => { try { resolve(JSON.parse(Buffer.concat(chunks))); } catch (e) { reject(e); } });
    req.on("error", reject);
  });
}

/** Reject cross-site POSTs. Browsers also block these via CORS preflight; this covers the rest. */
function sameOrigin(req) {
  const origin = req.headers.origin;
  if (!origin) return true;                          // same-origin fetches usually omit it
  try {
    return new URL(origin).host === req.headers.host;
  } catch { return false; }
}

/* ---------- routes ---------- */

/** Shared gate for both POST endpoints. Returns an error string, or null when fine. */
function guardPost(req, route) {
  if (!sameOrigin(req)) return "cross-site request";
  if (!String(req.headers["content-type"] || "").startsWith("application/json"))
    return "expected application/json";
  if (ipOverLimit(route, req.socket.remoteAddress || "?", Date.now())) return "too many requests";
  return null;
}

/** Report about an unsupported device — sent automatically when one is connected. */
async function handleReport(req, res) {
  const denied = guardPost(req, "report");
  if (denied) return send(res, denied === "too many requests" ? 429 : 403, denied);

  let body;
  try { body = await readJson(req); } catch { return send(res, 400, "bad json"); }

  const checked = validateReport(body);
  if (!checked.ok) return send(res, 400, checked.error);
  const d = checked.value;

  // ponytail: no dedupe while the beta drivers are being verified in the field —
  // every attempt is data. The per-IP and global-hourly caps still hold the line;
  // bring back a `vid:pid:outcome` dedupe set if the chat gets noisy.
  if (!overLimit(globalHits, REPORTS_GLOBAL, 3600_000, Date.now())) {
    telegram([
      d.outcome === "connected" ? "✅ <b>Mouse connected</b>" : "🖱 <b>New unsupported mouse</b>",
      `Name: <code>${escapeHtml(d.productName || "—")}</code>`,
      `Brand: ${escapeHtml(d.brand || "unknown")}`,
      `VID/PID: <code>${hex4(d.vendorId)} / ${hex4(d.productId)}</code>`,
      `Collections: <code>${escapeHtml(d.collections || "—")}</code>`,
      `HID: <code>${escapeHtml(d.hid || "—")}</code>`,
      `Reason: ${escapeHtml(d.reason || "—")}`,
      `UA: <code>${escapeHtml(d.ua || "—")}</code>`,
      d.logs ? `Logs:\n<pre>${escapeHtml(d.logs)}</pre>` : "",
    ].filter(Boolean).join("\n"));
  }
  send(res, 200, '{"ok":true}', MIME[".json"]);
}

/** "Please add this model" — typed by a person, so it is rate limited harder. */
async function handleSuggest(req, res) {
  const denied = guardPost(req, "suggest");
  if (denied) return send(res, denied === "too many requests" ? 429 : 403, denied);

  let body;
  try { body = await readJson(req); } catch { return send(res, 400, "bad json"); }

  const checked = validateSuggestion(body);
  if (!checked.ok) return send(res, 400, checked.error);

  // A filled honeypot means a bot: answer normally so it learns nothing, forward nothing.
  if (!checked.spam && !overLimit(suggestHits, SUGGESTIONS_GLOBAL, 3600_000, Date.now())) {
    const s = checked.value;
    telegram([
      "✉️ <b>Model requested</b>",
      `Brand: <b>${escapeHtml(s.brand)}</b>`,
      `Model: <b>${escapeHtml(s.model)}</b>`,
      s.link ? `Link: ${escapeHtml(s.link)}` : null,
      s.note ? `Note: ${escapeHtml(s.note)}` : null,
      s.contact ? `Contact: <code>${escapeHtml(s.contact)}</code>` : null,
    ].filter(Boolean).join("\n"));
  }
  send(res, 200, '{"ok":true}', MIME[".json"]);
}

/** Static file. The resolved path must stay inside ROOT. */
function handleStatic(req, res) {
  let urlPath;
  try {
    urlPath = decodeURIComponent(new URL(req.url, "http://x").pathname);   // throws on malformed %-escapes
  } catch {
    return send(res, 400, "bad request");
  }
  if (urlPath.includes("\0")) return send(res, 400, "bad request");

  const file = path.join(ROOT, urlPath === "/" ? "index.html" : urlPath);
  if (path.relative(ROOT, file).startsWith("..") || path.isAbsolute(path.relative(ROOT, file)))
    return send(res, 403, "forbidden");

  fs.readFile(file, (err, data) => {
    if (err) return send(res, 404, "not found");
    // Without this the browser reuses stale CSS/JS and edits appear to do nothing.
    res.setHeader("cache-control", "no-cache");
    send(res, 200, data, MIME[path.extname(file)] || "application/octet-stream");
  });
}

const server = http.createServer((req, res) => {
  try {
    if (!req.url || req.url.length > MAX_URL) return send(res, 414, "uri too long");
    const fail = name => e => { console.error(name, e.message); send(res, 500, "error"); };
    if (req.method === "POST" && req.url === "/api/report")
      return handleReport(req, res).catch(fail("report"));
    if (req.method === "POST" && req.url === "/api/suggest")
      return handleSuggest(req, res).catch(fail("suggest"));
    if (req.method === "GET" || req.method === "HEAD") return handleStatic(req, res);
    send(res, 405, "method not allowed");
  } catch (e) {
    console.error("request", e.message);
    send(res, 500, "error");
  }
});

server.headersTimeout = 10_000;
server.requestTimeout = 20_000;

// Last resort: a single bad request must never take the server down.
// ponytail: swallowing these is normally unwise, but this process holds no state worth protecting.
process.on("uncaughtException", e => console.error("uncaught", e));
process.on("unhandledRejection", e => console.error("unhandled", e));

server.listen(PORT, () => {
  console.log(`http://localhost:${PORT}  (telegram: ${TOKEN && CHAT ? "on" : "off"})`);
});
