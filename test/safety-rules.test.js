/**
 * The pure safety rules from public/safety.js — the decisions that stand between
 * the UI and the hardware.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { needsWriteConsent, consentText, verifyWrite, makeSnapshot, snapshotFilename } from "../public/safety.js";
import { statusForVendor } from "../public/devices.js";

test("only a verified protocol may write without asking", () => {
  assert.equal(needsWriteConsent("ready"), false);
  assert.equal(needsWriteConsent("beta"), true);
  assert.equal(needsWriteConsent("soon"), true);
});

test("vendor status maps to the strongest brand sharing that ID", () => {
  assert.equal(statusForVendor(0x046d), "ready");     // Logitech
  assert.equal(statusForVendor(0x1d57), "beta");      // Attack Shark
  assert.equal(statusForVendor(0x3554), "beta");      // VXE / VGN / Darmoshark share this
  assert.equal(statusForVendor(0x258a), "soon");      // Glorious — detected only
  assert.equal(statusForVendor(0xdead), "soon");      // unknown vendor
});

test("the consent text promises nothing it cannot keep", () => {
  const text = consentText("Attack Shark", "beta");
  assert.match(text, /not been verified on real hardware/i);
  assert.match(text, /no firmware or bootloader command/i);
  assert.ok(!/safe to write|cannot go wrong|100%/i.test(text), "must not over-promise");
});

test("a value the mouse snaps to its own grid is accepted", () => {
  assert.deepEqual(
    verifyWrite({ requested: 1600, got: 1600, step: 50 }),
    { ok: true, rollback: false, message: "" },
  );
  const snapped = verifyWrite({ requested: 1625, got: 1600, step: 50, label: "DPI" });
  assert.equal(snapped.ok, true);
  assert.equal(snapped.rollback, false);
});

test("a value that lands far away triggers a rollback", () => {
  const wrong = verifyWrite({ requested: 16000, got: 8850, step: 50, label: "DPI" });
  assert.equal(wrong.ok, false);
  assert.equal(wrong.rollback, true);
  assert.match(wrong.message, /restoring the previous DPI/);
});

test("a device that reports nothing back triggers a rollback", () => {
  for (const got of [0, NaN, undefined, -1]) {
    const r = verifyWrite({ requested: 800, got, step: 50 });
    assert.equal(r.rollback, true, `got=${got} must roll back`);
  }
});

test("the snapshot keeps everything needed to put the mouse back", () => {
  const device = { productName: "ATK A9 SE", vendorId: 0x373b, productId: 0x1135 };
  const snap = makeSnapshot({
    device,
    dpi: { value: 1600 },
    rate: { value: 0x01, options: [{ raw: 0x01, hz: 1000 }] },
    raw: new Uint8Array([1, 2, 3]),
  });

  assert.equal(snap.dpi, 1600);
  assert.equal(snap.reportRateRaw, 0x01);
  assert.equal(snap.reportRateHz, 1000);
  assert.deepEqual(snap.raw, [1, 2, 3]);
  assert.deepEqual(snap.device, { name: "ATK A9 SE", vendorId: 0x373b, productId: 0x1135 });
  assert.ok(Date.parse(snap.savedAt) > 0);
});

test("a snapshot of an unreadable device is still valid, just empty", () => {
  const snap = makeSnapshot({ device: { vendorId: 1, productId: 2 }, dpi: null, rate: null });
  assert.equal(snap.dpi, null);
  assert.equal(snap.reportRateRaw, null);
  assert.equal(snap.raw, null);
});

test("the backup filename is safe to write to disk", () => {
  const name = snapshotFilename({ productName: "ATK A9 SE / 2.4G", vendorId: 0x373b, productId: 0x1135 });
  assert.ok(name.endsWith(".json"));
  assert.ok(!/[\\/:*?"<>|]/.test(name), "must contain no path or reserved characters");
});
