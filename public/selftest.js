/**
 * Pure-logic checks — open /?selftest and read the console.
 * No device needed: only encoding/decoding and table logic are exercised.
 */
import { BRANDS, buildVidMap } from "./devices.js";
import { parseDpiList, ratesFrom8060, ratesFrom8061 } from "./drivers/logitech.js";
import { RAZER_HZ } from "./drivers/razer.js";
import { DPI_TEMPLATE, checksum, dpiToBytes, bytesToDpi, RATES as AS_RATES } from "./drivers/attackshark.js";
import { RATES as ATK_RATES } from "./drivers/atk.js";
import { HYPERX_RATES, GEN2_RATES, dpiStepFor, dpiToCode } from "./drivers/hyperx.js";

let failed = 0;
const eq = (got, want, label) => {
  if (JSON.stringify(got) === JSON.stringify(want)) return;
  failed++;
  console.error("✗", label, "\n  expected:", want, "\n  got:     ", got);
};

/* --- Logitech --- */
eq(parseDpiList([0, 0x01, 0x90, 0x03, 0x20, 0x06, 0x40, 0, 0]), { min: 400, max: 1600, step: 50 }, "dpi list");
eq(parseDpiList([0, 0x00, 0xc8, 0xe0, 0x32, 0x1f, 0x40, 0, 0]), { min: 200, max: 8000, step: 50 }, "dpi step marker");
eq(parseDpiList([0, 0, 0]), null, "empty dpi list");
eq(ratesFrom8060(0b1001), [{ raw: 1, hz: 1000 }, { raw: 4, hz: 250 }], "0x8060 bitmap");
eq(ratesFrom8061(0b1111000).map(r => r.hz), [1000, 2000, 4000, 8000], "0x8061 bitmap");

/* --- Razer --- */
eq(RAZER_HZ.map(hz => 1000 / hz), [1, 2, 4, 8], "razer divisor");

/* --- Attack Shark ---
   Check the encoder against the upstream driver's factory template:
   stages 1..6 must come out as exactly 800/1600/2400/3200/5000/22000 DPI. */
[800, 1600, 2400, 3200, 5000, 22000].forEach((dpi, i) => {
  const want = { x: DPI_TEMPLATE[8 + i], y: DPI_TEMPLATE[16 + i], double: !!(DPI_TEMPLATE[6] & (1 << i)) };
  eq(dpiToBytes(dpi), want, `attack shark encode ${dpi}`);
  eq(bytesToDpi(want.x, want.y, want.double), dpi, `attack shark decode ${dpi}`);
});
eq(checksum(DPI_TEMPLATE), (DPI_TEMPLATE[50] << 8) | DPI_TEMPLATE[51], "attack shark checksum");
eq(AS_RATES.map(r => 0xff - r.raw), [0xfe, 0xfd, 0xfb, 0xf7], "attack shark rate checksum");

/* --- ATK --- */
eq(ATK_RATES.length, 7, "atk rate count");
eq(new Set(ATK_RATES.map(r => r.raw)).size, 7, "atk codes unique");
eq([8000, 1000, 125].map(hz => ATK_RATES.find(r => r.hz === hz).raw), [0x81, 0x01, 0x08], "atk codes");

/* --- HyperX --- */
eq(HYPERX_RATES.map(r => [r.raw, r.hz]), [[0, 125], [1, 250], [2, 500], [3, 1000]], "hyperx rate table");
eq([0x16e2, 0x028e, 0x048e].map(dpiStepFor), [50, 100, 100], "hyperx dpi step per pid");
// hyperx-saga-control protocol-notes.md samples
eq([400, 800, 1600, 3200].map(dpiToCode), [0x07, 0x0f, 0x1f, 0x3f], "hyperx gen2 dpi codes");
eq(GEN2_RATES.map(r => 8000 / r.raw), [125, 250, 500, 1000], "hyperx gen2 rate = 8000/code");

/* --- devices.js --- */
eq(buildVidMap([{ name: "A", vids: [1] }, { name: "B", vids: [1, 2] }]), { 1: "A / B", 2: "B" }, "vid map merge");
eq(BRANDS.every(b => b.name && b.vids?.length && b.status), true, "brand entries complete");

console.log(failed === 0 ? "✓ selftest ok — all checks passed" : `✗ selftest: ${failed} failed`);
