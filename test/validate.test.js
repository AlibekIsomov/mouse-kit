/**
 * Server-side validation for the public API. Everything here runs on untrusted
 * input, so the tests lean on the nasty cases rather than the happy path.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { validateSuggestion, validateReport, LIMITS } from "../validate.js";
import { brandBadge } from "../public/images.js";

/* ---------- suggestions ---------- */

test("a normal suggestion passes and is trimmed", () => {
  const r = validateSuggestion({ brand: "  Pulsar ", model: " X2V2\n", link: "", contact: "" });
  assert.equal(r.ok, true);
  assert.equal(r.spam, false);
  assert.deepEqual(r.value, { brand: "Pulsar", model: "X2V2", link: "", contact: "", note: "" });
});

test("brand and model are required", () => {
  assert.equal(validateSuggestion({ brand: "", model: "X2" }).ok, false);
  assert.equal(validateSuggestion({ brand: "P", model: "X2" }).ok, false, "one letter is not a brand");
  assert.equal(validateSuggestion({ brand: "Pulsar", model: "" }).ok, false);
  assert.equal(validateSuggestion(null).ok, false);
  assert.equal(validateSuggestion("a string").ok, false);
});

test("a filled honeypot is accepted but produces nothing to forward", () => {
  const r = validateSuggestion({ brand: "Pulsar", model: "X2", website: "http://spam.example" });
  assert.equal(r.ok, true, "a bot must not learn that it was detected");
  assert.equal(r.spam, true);
  assert.equal(r.value, null);
});

test("only http(s) links are accepted", () => {
  for (const bad of ["javascript:alert(1)", "data:text/html,<script>", "mailto:a@b.c", "not a url"])
    assert.equal(validateSuggestion({ brand: "Pulsar", model: "X2", link: bad }).ok, false, bad);

  const good = validateSuggestion({ brand: "Pulsar", model: "X2", link: "https://pulsar.gg/x2" });
  assert.equal(good.ok, true);
  assert.equal(good.value.link, "https://pulsar.gg/x2");
});

test("over-long fields are cut, not rejected", () => {
  const r = validateSuggestion({ brand: "P".repeat(500), model: "M".repeat(500), contact: "c".repeat(500) });
  assert.equal(r.ok, true);
  assert.equal(r.value.brand.length, LIMITS.brand);
  assert.equal(r.value.model.length, LIMITS.model);
  assert.equal(r.value.contact.length, LIMITS.contact);
});

test("newlines cannot be smuggled into the Telegram message", () => {
  const r = validateSuggestion({ brand: "Pulsar", model: "X2\n\n<b>Injected</b>\nBrand: fake" });
  assert.ok(!r.value.model.includes("\n"), "line breaks must be collapsed");
});

/* ---------- device reports ---------- */

test("a report needs usable ids", () => {
  assert.equal(validateReport({ vendorId: 0x046d, productId: 0xc08b }).ok, true);
  for (const bad of [-1, 0x10000, 1.5, NaN, "abc", undefined])
    assert.equal(validateReport({ vendorId: bad, productId: 1 }).ok, false, String(bad));
});

test("report text fields are trimmed and capped", () => {
  const r = validateReport({
    vendorId: 1, productId: 2,
    productName: " Some   Mouse \n", reason: "x".repeat(1000),
  });
  assert.equal(r.value.productName, "Some Mouse");
  assert.equal(r.value.reason.length, 200);
});

test("report logs keep their line breaks but are still capped", () => {
  const r = validateReport({
    vendorId: 1, productId: 2,
    outcome: "connected",
    logs: "[mousekit] line one\n[mousekit]   line   two\n" + "x".repeat(5000),
  });
  assert.equal(r.value.outcome, "connected");
  assert.match(r.value.logs, /line one\n\[mousekit\] line two/, "newlines survive, spaces collapse");
  assert.ok(r.value.logs.length <= 2000, "logs are capped");
});

/* ---------- brand badges ---------- */

test("every brand gets a badge of the same shape", () => {
  for (const name of ["Logitech / Logitech G", "ATK", "A4Tech / Bloody", "Pixart (OEM)", "Zowie"]) {
    const badge = brandBadge(name);
    assert.ok(badge.initials.length >= 1 && badge.initials.length <= 2, `${name}: ${badge.initials}`);
    assert.equal(badge.initials, badge.initials.toUpperCase());
    assert.match(badge.colour, /^hsl\(\d+ 42% 52%\)$/, "saturation and lightness must be fixed");
  }
});

test("badge colour is stable for a brand and differs between brands", () => {
  assert.equal(brandBadge("Razer").colour, brandBadge("Razer").colour);
  assert.notEqual(brandBadge("Razer").colour, brandBadge("Corsair").colour);
});
