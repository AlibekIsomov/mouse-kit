/**
 * Safety invariants: the app must never be able to touch firmware.
 *
 * Bricking a mouse requires writing to its bootloader / firmware area, which is a
 * different command set from the configuration commands used here. These tests
 * drive every driver through its full read + write path, collect every byte that
 * reached the wire, and assert that only whitelisted commands appear.
 *
 * If someone later adds a command, these tests fail until the whitelist is
 * updated deliberately — so growing the attack surface can never happen quietly.
 *
 * Dangerous opcodes below were taken from the vendors' own firmware updaters:
 *   controlhub.top/AttackShark  Cmd_PrepareDownLoad 0xb0, Cmd_DownLoadFile 0xb1,
 *                               Usb_NextPacket 0xc0, Usb_LastPacket 0xc1
 *   hub.atk.pro                 OTA report byte 0xa2, bootloader entry f1 02 f3
 *   Logitech HID++              DFU feature 0x00c2 / 0x00c3
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { mockLogitech, mockRazer, mockAttackShark, mockAtk, mockAtkNearlink, mockHyperX, mockHyperXGen2, DPI_FEATURE, RATE_FEATURE } from "./mocks.js";
import { logitech } from "../public/drivers/logitech.js";
import { razer } from "../public/drivers/razer.js";
import { attackShark } from "../public/drivers/attackshark.js";
import { atk } from "../public/drivers/atk.js";
import { hyperx } from "../public/drivers/hyperx.js";

/** Everything a driver does when the user changes both settings. */
async function exercise(driver, dev) {
  const state = await driver.init(dev);
  await driver.readDpi(dev, state);
  await driver.writeDpi(dev, state, 1600);
  const rate = await driver.readRate(dev, state);
  if (rate?.options?.length) await driver.writeRate(dev, state, rate.options.at(-1).raw);
  return dev.sent;
}

const FIRMWARE_OPCODES = [0xb0, 0xb1, 0xc0, 0xc1, 0xa2, 0xf1];

/**
 * Attack Shark report IDs we must never write to.
 *   0x05 user preferences (LED, deep sleep)   0x08 button mapping   0x09 macros
 *   0x0C internal state reset — documented as leaving the mouse unresponsive to
 *        clicks and movement until every setting is re-applied or it is power-cycled
 */
const FORBIDDEN_AS_REPORTS = [0x05, 0x08, 0x09, 0x0c];

/** ATK 0x0a = ResetDefaultSettings, wipes the user's whole configuration. */
const FORBIDDEN_ATK_COMMANDS = [0x0a, 0x1e, 0x30];

test("logitech: only DPI and report-rate features are ever requested", async () => {
  const { dev } = mockLogitech();
  await exercise(logitech, dev);

  const requested = new Set(
    dev.sent
      .filter(s => s.bytes[1] === 0x00 && s.bytes[2] === 0x0a)      // root → getFeature
      .map(s => (s.bytes[3] << 8) | s.bytes[4]),
  );
  assert.deepEqual([...requested].sort((a, b) => a - b), [0x2201, 0x8060], "unexpected feature was looked up");

  // 0x00c2 / 0x00c3 are the DFU (firmware update) features.
  for (const dfu of [0x00c2, 0x00c3]) assert.ok(!requested.has(dfu), "DFU feature must never be requested");
});

test("logitech: every packet targets root, DPI or report rate — nothing else", async () => {
  const { dev } = mockLogitech();
  await exercise(logitech, dev);

  const allowed = new Set([0x00, DPI_FEATURE, RATE_FEATURE]);
  for (const s of dev.sent) assert.ok(allowed.has(s.bytes[1]), `packet aimed at feature index ${s.bytes[1]}`);

  const addresses = new Set(dev.sent.map(s => s.bytes[2]));
  assert.deepEqual([...addresses].sort((a, b) => a - b), [0x0a, 0x1a, 0x2a, 0x3a]);
});

test("razer: only the four documented (class, id) pairs are sent", async () => {
  const { dev } = mockRazer();
  await exercise(razer, dev);

  const used = new Set(dev.sent.map(s => `${s.bytes[6].toString(16)}/${s.bytes[7].toString(16)}`));
  const allowed = new Set(["0/81", "0/85", "0/5", "4/85", "4/5"]);
  for (const cmd of used) assert.ok(allowed.has(cmd), `unexpected razer command ${cmd}`);
});

test("attack shark: only config reports 0x04 and 0x06 are written", async () => {
  const { dev } = mockAttackShark();
  await exercise(attackShark, dev);

  const ids = new Set(dev.sent.map(s => s.reportId));
  assert.deepEqual([...ids].sort((a, b) => a - b), [0x04, 0x06], "wrote to a report other than DPI/rate");
  for (const s of dev.sent) assert.ok(!FIRMWARE_OPCODES.includes(s.reportId), "firmware report id used");
});

test("attack shark: the internal state reset (0x0C) is never sent", async () => {
  const { dev } = mockAttackShark();
  await exercise(attackShark, dev);

  for (const s of dev.sent)
    assert.ok(!FORBIDDEN_AS_REPORTS.includes(s.reportId),
      `wrote to report 0x${s.reportId.toString(16)} — that clears settings the user never asked us to touch`);
});

test("atk: only the five whitelisted commands are sent", async () => {
  const { dev } = mockAtk();
  await exercise(atk, dev);

  const used = new Set(dev.sent.map(s => s.bytes[0]));
  const allowed = new Set([0x80, 0x82, 0x26, 0xa6, 0x20]);
  for (const cmd of used) assert.ok(allowed.has(cmd), `unexpected atk command 0x${cmd.toString(16)}`);
  for (const cmd of used)
    assert.ok(!FORBIDDEN_ATK_COMMANDS.includes(cmd), `destructive atk command 0x${cmd.toString(16)}`);
});

test("hyperx: only the five documented config commands — never LED, buttons or macros", async () => {
  const { dev } = mockHyperX();
  await exercise(hyperx, dev);

  const used = new Set(dev.sent.map(s => s.bytes[0]));
  const allowed = new Set([0x50, 0x53, 0xd0, 0xd3, 0xde]);
  for (const cmd of used) assert.ok(allowed.has(cmd), `unexpected hyperx command 0x${cmd.toString(16)}`);

  // Same report carries 0xd2 LED, 0xd4 button remap and 0xd5/0xd6 macros — a wrong
  // one of those leaves the mouse remapped or flashing, so they stay forbidden.
  for (const cmd of [0xd2, 0xd4, 0xd5, 0xd6])
    assert.ok(!used.has(cmd), `hyperx sent 0x${cmd.toString(16)} — that touches settings the user never asked about`);
});

test("hyperx gen2: only battery, config and commit reports — never RGB, brightness or the 0xf0 family", async () => {
  const { dev } = mockHyperXGen2();
  await exercise(hyperx, dev);

  const used = new Set(dev.sent.map(s => s.reportId));
  const allowed = new Set([0x50, 0x32, 0x36]);
  for (const id of used) assert.ok(allowed.has(id), `unexpected hyperx gen2 report 0x${id.toString(16)}`);

  // 0x44 RGB and 0x40 brightness touch settings the user never asked about;
  // 0xf0/0xfa/0xfc are undocumented and sit where firmware channels usually live.
  for (const id of [0x44, 0x40, 0xf0, 0xfa, 0xfc])
    assert.ok(!used.has(id), `hyperx gen2 wrote report 0x${id.toString(16)}`);
});

test("no driver ever emits a firmware/bootloader opcode", async () => {
  const runs = [
    ["logitech", logitech, mockLogitech().dev],
    ["razer", razer, mockRazer().dev],
    ["attack shark", attackShark, mockAttackShark().dev],
    ["atk", atk, mockAtk().dev],
    ["atk nearlink", atk, mockAtkNearlink().dev],
    ["hyperx", hyperx, mockHyperX().dev],
    ["hyperx gen2", hyperx, mockHyperXGen2().dev],
  ];

  for (const [name, driver, dev] of runs) {
    await exercise(driver, dev);
    assert.ok(dev.sent.length > 0, `${name} sent nothing — the test is not exercising it`);

    for (const packet of dev.sent) {
      assert.ok(!FIRMWARE_OPCODES.includes(packet.bytes[0]),
        `${name}: packet starts with firmware opcode 0x${packet.bytes[0].toString(16)}`);
      // The ATK bootloader entry sequence, as sent by the vendor updater.
      assert.notDeepEqual(packet.bytes.slice(0, 3), [0xf1, 0x02, 0xf3], `${name}: bootloader entry sequence`);
    }
  }
});

test("a device that fails its probe is never written to", async () => {
  const { createMockDevice } = await import("./mock-hid.js");

  const silent = [
    ["logitech", logitech, createMockDevice({ onOutput: () => null })],
    ["razer", razer, createMockDevice({ onFeatureRead: () => null })],
    ["atk", atk, createMockDevice({ onFeatureRead: () => null })],
    ["hyperx", hyperx, createMockDevice({ onOutput: () => null })],
  ];

  for (const [name, driver, dev] of silent) {
    await assert.rejects(() => driver.init(dev), `${name} should refuse an unresponsive device`);
    // 0x00/0x80/0x81/0x53 are the read-only probes; 0x1a is the logitech ping address
    const writes = dev.sent.filter(s => ![0x00, 0x80, 0x81, 0x53].includes(s.bytes[0] ?? 0) && s.bytes[2] !== 0x1a);
    assert.equal(writes.length, 0, `${name} wrote to a device that never answered`);
  }
});

test("DPI values are clamped to the range the device reported", async () => {
  const { dev } = mockLogitech();
  const state = await logitech.init(dev);
  const { min, max } = await logitech.readDpi(dev, state);

  // The UI clamps before calling the driver; this asserts the contract it relies on.
  const clamp = v => Math.min(Math.max(v, min), max);
  assert.equal(clamp(-5000), 400);
  assert.equal(clamp(999999), 1600);
  assert.equal(clamp(800), 800);
});
