/**
 * Logitech HID++ 2.0 — byte-level tests against a mock device.
 *
 * Ground truth: libratbag/src/hidpp20.c
 *   const int DEVICE_SW_ID = 0x8;  msg->msg.address |= DEVICE_SW_ID;
 *   CMD_ROOT_GET_FEATURE                 0x00
 *   CMD_ROOT_GET_PROTOCOL_VERSION        0x10
 *   CMD_ADJUSTABLE_DPI_GET_SENSOR_COUNT  0x00
 *   CMD_ADJUSTABLE_DPI_GET_SENSOR_DPI_LIST 0x10
 *   CMD_ADJUSTABLE_DPI_GET_SENSOR_DPI    0x20
 *   CMD_ADJUSTABLE_DPI_SET_SENSOR_DPI    0x30
 *   CMD_ADJUSTABLE_REPORT_RATE_GET_REPORT_RATE_LIST 0x00
 *   CMD_ADJUSTABLE_REPORT_RATE_GET_REPORT_RATE      0x10
 *   CMD_ADJUSTABLE_REPORT_RATE_SET_REPORT_RATE      0x20
 *
 * The CMD_* values are already (functionIndex << 4); the software id is only
 * OR'd in. Shifting them a second time collapses every address to 0x0a — i.e.
 * "get sensor count" — so a DPI write would silently become a read. The first
 * test below is the regression guard for exactly that.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createMockDevice } from "./mock-hid.js";
import { mockLogitech, DPI_FEATURE, RATE_FEATURE } from "./mocks.js";
import { logitech, ADDR } from "../public/drivers/logitech.js";

const SW_ID = 0x0a;
const outputs = dev => dev.sent.filter(s => s.kind === "output");
const addressesOf = dev => outputs(dev).map(s => s.bytes[2]);

test("address byte is CMD | swId, never shifted twice", async () => {
  const { dev } = mockLogitech();
  const state = await logitech.init(dev);
  await logitech.writeDpi(dev, state, 1600);

  const setPackets = outputs(dev).filter(s => s.bytes[1] === DPI_FEATURE && s.bytes[2] === 0x3a);
  assert.equal(setPackets.length, 1, "exactly one SET_SENSOR_DPI must be sent");

  // The bug signature: every address collapsing to 0x0a (function 0 = get sensor count).
  const distinct = new Set(addressesOf(dev));
  assert.ok(distinct.size > 1, "all addresses collapsed to one value — the <<4 bug is back");
  assert.ok(!addressesOf(dev).every(a => a === 0x0a), "every address became 0x0a");
});

test("setSensorDpi puts the exact documented bytes on the wire", async () => {
  const { dev } = mockLogitech();
  const state = await logitech.init(dev);
  dev.sent.length = 0;
  await logitech.writeDpi(dev, state, 1600);

  const set = outputs(dev).find(s => s.bytes[2] === (ADDR.DPI_SET | SW_ID));
  assert.ok(set, "no SET_SENSOR_DPI packet");
  assert.equal(set.reportId, 0x11, "SET_SENSOR_DPI uses the long report");
  assert.equal(set.bytes.length, 19, "long report payload is 19 bytes");
  // [deviceIndex, featureIndex, address, sensorIndex, dpiHi, dpiLo]
  assert.deepEqual(set.bytes.slice(0, 6), [0xff, DPI_FEATURE, 0x3a, 0x00, 0x06, 0x40]);
});

test("DPI round-trips through the device, not through local state", async () => {
  const { dev, stored } = mockLogitech({ dpi: 800 });
  const state = await logitech.init(dev);

  assert.equal((await logitech.readDpi(dev, state)).value, 800);
  assert.equal(await logitech.writeDpi(dev, state, 1600), 1600);
  assert.equal(stored.dpi, 1600, "the mock device actually received the new value");
});

test("DPI list is parsed from the device, not hard-coded", async () => {
  const { dev } = mockLogitech();
  const state = await logitech.init(dev);
  const dpi = await logitech.readDpi(dev, state);
  assert.deepEqual({ min: dpi.min, max: dpi.max, step: dpi.step }, { min: 400, max: 1600, step: 50 });
});

test("report rate: bitmap 0b1001 offers 1000 Hz and 250 Hz", async () => {
  const { dev, stored } = mockLogitech({ rate: 1 });
  const state = await logitech.init(dev);
  const rate = await logitech.readRate(dev, state);

  assert.deepEqual(rate.options, [{ raw: 1, hz: 1000 }, { raw: 4, hz: 250 }]);
  assert.equal(rate.value, 1);

  assert.equal(await logitech.writeRate(dev, state, 4), 4);
  assert.equal(stored.rate, 4, "the mock device actually received the new rate");
});

test("setReportRate uses the short report and address 0x2a", async () => {
  const { dev } = mockLogitech();
  const state = await logitech.init(dev);
  dev.sent.length = 0;
  await logitech.writeRate(dev, state, 1);

  const set = outputs(dev).find(s => s.bytes[1] === RATE_FEATURE && s.bytes[2] === (ADDR.RATE_SET | SW_ID));
  assert.ok(set, "no SET_REPORT_RATE packet");
  assert.equal(set.reportId, 0x10);
  assert.deepEqual(set.bytes.slice(0, 4), [0xff, RATE_FEATURE, 0x2a, 0x01]);
});

test("a device without HID++ is rejected before anything is written", async () => {
  const dev = createMockDevice({ collections: [{ usagePage: 0x0001, usage: 0x02 }] });
  await assert.rejects(() => logitech.init(dev), /HID\+\+/);
  assert.equal(dev.sent.length, 0, "nothing must be sent to a non-HID++ device");
});

test("a silent device is reported, not written to", async () => {
  const dev = createMockDevice({ onOutput: () => null });
  await assert.rejects(() => logitech.init(dev), /did not respond/);
  assert.ok(dev.sent.every(s => s.bytes[1] === 0x00), "only root pings may be sent while probing");
});
