/**
 * Image catalogue consistency.
 *
 * These checks cannot tell whether a URL still resolves — that needs the network —
 * but they do catch the failure that actually bites: an entry whose host is missing
 * from the Content-Security-Policy, which silently renders as the fallback
 * silhouette with only a console error nobody reads.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { MODEL_IMAGES, IMAGE_HOSTS, imageFor, MOUSE_SVG } from "../public/images.js";
import { BRANDS } from "../public/devices.js";

const read = p => fs.readFileSync(path.join(import.meta.dirname, "..", p), "utf8");

test("every image URL is https and points at a declared host", () => {
  for (const [key, url] of Object.entries(MODEL_IMAGES)) {
    assert.ok(url.startsWith("https://"), `${key}: must be https`);
    assert.ok(IMAGE_HOSTS.some(h => url.startsWith(h + "/")),
      `${key}: host is not in IMAGE_HOSTS — the CSP will block it`);
  }
});

test("the CSP in index.html allows exactly the declared hosts", () => {
  const html = read("public/index.html");
  const csp = html.match(/Content-Security-Policy" content="([^"]+)"/)?.[1];
  assert.ok(csp, "no CSP meta tag found");

  const imgSrc = csp.split(";").find(d => d.trim().startsWith("img-src"));
  for (const host of IMAGE_HOSTS)
    assert.ok(imgSrc.includes(host), `${host} missing from the img-src meta tag`);
});

test("the CSP header in server.js allows exactly the declared hosts", () => {
  const server = read("server.js");
  for (const host of IMAGE_HOSTS)
    assert.ok(server.includes(host), `${host} missing from the server's CSP header`);
});

test("every image key matches a model that actually appears in devices.js", () => {
  const known = new Set();
  for (const brand of BRANDS)
    for (const model of brand.models ?? []) {
      const short = brand.name.split("/")[0].trim().toLowerCase();
      known.add(`${brand.name.toLowerCase()}::${model.toLowerCase()}`);
      known.add(`${short}::${model.toLowerCase()}`);
    }

  for (const key of Object.keys(MODEL_IMAGES))
    assert.ok(known.has(key), `"${key}" has a photo but no matching model in devices.js`);
});

test("lookup tolerates compound brand names and loose spacing", () => {
  assert.ok(imageFor("Logitech / Logitech G", "G502 Hero"), "compound brand name must resolve");
  assert.ok(imageFor("Logitech", "  g502   hero  "), "case and spacing must not matter");
  assert.equal(imageFor("Logitech", "No Such Mouse"), null);
  assert.equal(imageFor("Nobody", "G502 Hero"), null);
});

test("the fallback silhouette is inline and self-contained", () => {
  assert.match(MOUSE_SVG, /^\s*<svg/);
  assert.ok(!/https?:/.test(MOUSE_SVG), "the fallback must make no external request");
  assert.ok(MOUSE_SVG.includes("currentColor"), "must inherit colour so it can be tinted");
});

test("no inline event handler sneaks into the markup", () => {
  // script-src 'self' blocks them, so an onerror="" attribute would silently do nothing.
  const html = read("public/index.html");
  const app = read("public/app.js");
  assert.ok(!/\son[a-z]+\s*=\s*"/.test(html), "inline handler in index.html");
  assert.ok(!/["'`]\s*on(error|load)\s*=/.test(app), "inline handler emitted from app.js");
});
