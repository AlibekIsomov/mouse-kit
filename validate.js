/**
 * Server-side validation for the public API.
 *
 * Kept in its own module so the rules can be tested without starting a listener,
 * and so it is obvious that nothing from a request body reaches Telegram unchecked.
 * The browser does its own checks for a nicer experience; those are a convenience,
 * never the enforcement.
 */

export const LIMITS = {
  brand: 60,
  model: 60,
  link: 300,
  contact: 120,
  note: 400,
};

const clean = (value, max) => String(value ?? "").replace(/\s+/g, " ").trim().slice(0, max);

/** A link must be absent or a plain http(s) URL — no javascript:, data:, or mailto:. */
function cleanLink(value) {
  const text = clean(value, LIMITS.link);
  if (!text) return { ok: true, value: "" };
  let url;
  try { url = new URL(text); } catch { return { ok: false, error: "link is not a valid URL" }; }
  if (url.protocol !== "http:" && url.protocol !== "https:")
    return { ok: false, error: "link must start with http:// or https://" };
  return { ok: true, value: url.toString().slice(0, LIMITS.link) };
}

/**
 * Validate a "please add this model" submission.
 * Returns { ok, value } or { ok: false, error }. A filled honeypot is reported
 * separately so the caller can accept the request without acting on it.
 */
export function validateSuggestion(body) {
  if (!body || typeof body !== "object") return { ok: false, error: "body must be an object" };
  if (clean(body.website, 50)) return { ok: true, spam: true, value: null };   // honeypot

  const brand = clean(body.brand, LIMITS.brand);
  const model = clean(body.model, LIMITS.model);
  if (brand.length < 2) return { ok: false, error: "brand is required" };
  if (model.length < 1) return { ok: false, error: "model is required" };

  const link = cleanLink(body.link);
  if (!link.ok) return { ok: false, error: link.error };

  return {
    ok: true,
    spam: false,
    value: {
      brand,
      model,
      link: link.value,
      contact: clean(body.contact, LIMITS.contact),
      note: clean(body.note, LIMITS.note),
    },
  };
}

/** Validate the automatic report sent when an unsupported device is connected. */
export function validateReport(body) {
  if (!body || typeof body !== "object") return { ok: false, error: "body must be an object" };

  const vid = Number(body.vendorId);
  const pid = Number(body.productId);
  const usable = id => Number.isInteger(id) && id >= 0 && id <= 0xffff;
  if (!usable(vid) || !usable(pid)) return { ok: false, error: "bad vendor or product id" };

  return {
    ok: true,
    value: {
      vendorId: vid,
      productId: pid,
      productName: clean(body.productName, 120),
      brand: clean(body.brand, 80),
      reason: clean(body.reason, 200),
      collections: clean(body.collections, 200),
      ua: clean(body.ua, 200),
    },
  };
}
