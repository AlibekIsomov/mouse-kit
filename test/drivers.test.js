/**
 * Razer, Attack Shark and ATK — byte-level tests against a mock device.
 *
 * Ground truth:
 *   Razer        openrazer/driver/razercommon.c (checksum = XOR of bytes 2..87),
 *                razerchromacommon.c (class 0x04 / id 0x05 = set DPI, VARSTORE = 0x01)
 *   Attack Shark HarukaYamamoto0/attack-shark-x11-driver docs/*.md
 *   ATK          hub.atk.pro bundle (COMPX): report 8, 64-byte packet, [0] = command
 *   HyperX       santeri3700/hyperx_pulsefire_dart_reverse_engineering protocol/index.md,
 *                libratbag PR #1786 (driver-hyperx.c)
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createMockDevice, pad } from "./mock-hid.js";
import { mockRazer, mockAttackShark, mockAtk, mockAtkNearlink, mockHyperX, mockHyperXGen2 } from "./mocks.js";
import { razer } from "../public/drivers/razer.js";
import { attackShark, DPI_TEMPLATE, checksum, dpiToBytes, bytesToDpi } from "../public/drivers/attackshark.js";
import { atk, eePacket, eeDpiEncode, eeDpiDecode } from "../public/drivers/atk.js";
import { hyperx } from "../public/drivers/hyperx.js";

/* ============================ Razer ============================ */

const xorCrc = bytes => bytes.slice(2, 88).reduce((a, b) => a ^ b, 0);

test("razer: packet is 90 bytes with a valid XOR checksum", async () => {
  const { dev } = mockRazer();
  await razer.init(dev);
  for (const packet of dev.sent) {
    assert.equal(packet.reportId, 0x00, "razer uses feature report 0");
    assert.equal(packet.bytes.length, 90);
    assert.equal(packet.bytes[88], xorCrc(packet.bytes), "checksum byte [88] is wrong");
  }
});

test("razer: setDpi writes VARSTORE and the DPI on both axes", async () => {
  const { dev, stored } = mockRazer();
  const state = await razer.init(dev);
  dev.sent.length = 0;

  assert.equal(await razer.writeDpi(dev, state, 1600), 1600);
  assert.equal(stored.dpi, 1600);

  const set = dev.sent.find(s => s.bytes[6] === 0x04 && s.bytes[7] === 0x05);
  assert.ok(set, "no set-DPI packet");
  assert.equal(set.bytes[5], 0x07, "dataSize must be 7");
  // args: [varstore, dpiX hi, dpiX lo, dpiY hi, dpiY lo, 0, 0]
  assert.deepEqual(set.bytes.slice(8, 15), [0x01, 0x06, 0x40, 0x06, 0x40, 0x00, 0x00]);
});

test("razer: report rate divisors are 1000/Hz", async () => {
  const { dev, stored } = mockRazer({ rate: 1 });
  const state = await razer.init(dev);
  const rate = await razer.readRate(dev, state);

  assert.deepEqual(rate.options.map(o => [o.hz, o.raw]), [[1000, 1], [500, 2], [250, 4], [125, 8]]);
  assert.equal(await razer.writeRate(dev, state, 8), 8);
  assert.equal(stored.rate, 8);
});

test("razer: a device that reports 'not supported' (0x05) throws instead of retrying blindly", async () => {
  const dev = createMockDevice({ onFeatureRead: () => pad([0x05], 90) });
  await assert.rejects(() => razer.init(dev), /did not respond/);
});

/* ========================= Attack Shark ========================= */

test("attack shark: the factory template's own checksum is correct", () => {
  assert.equal(checksum(DPI_TEMPLATE), (DPI_TEMPLATE[50] << 8) | DPI_TEMPLATE[51]);
});

/**
 * Every row of docs/samples/dpi-stage-mask.md, which was captured from the real
 * device. `high` is byte [16 + stage]; `double` is the stage bit in bytes [6]/[7].
 * These rows are what proves the four different table strides are all correct.
 */
test("attack shark: DPI encoding matches every captured sample", () => {
  const samples = [
    // dpi,    x,    high, double
    [50, 0x01, 0, 0],
    [800, 0x12, 0, 0],
    [5000, 0x75, 0, 0],
    [10000, 0xeb, 0, 0],
    [10100, 0x76, 1, 0],
    [12000, 0x8d, 1, 0],
    [12100, 0x8e, 0, 1],
    [20000, 0xeb, 0, 1],
    [20100, 0xeb, 1, 1],
    [21000, 0x7b, 1, 1],
    [22000, 0x81, 1, 1],
  ];

  for (const [dpi, x, high, double] of samples) {
    assert.deepEqual(dpiToBytes(dpi), { x, y: high, double: !!double }, `encode ${dpi}`);
    assert.equal(bytesToDpi(x, high, !!double), dpi, `decode ${dpi}`);
  }
});

test("attack shark: 20000 and 20100 share a value byte but stay distinguishable", () => {
  // Both encode to 0xeb with the double flag; only the high flag separates them.
  assert.equal(bytesToDpi(0xeb, 0, true), 20000);
  assert.equal(bytesToDpi(0xeb, 1, true), 20100);
});

test("attack shark: DPI is clamped to the documented 50..22000 range", () => {
  assert.equal(bytesToDpi(...Object.values(dpiToBytes(0))), 50);
  assert.equal(bytesToDpi(...Object.values(dpiToBytes(99999))), 22000);
});

test("attack shark: writing DPI keeps the block valid and recomputes the checksum", async () => {
  const { dev } = mockAttackShark();
  const state = await attackShark.init(dev);
  dev.sent.length = 0;

  await attackShark.writeDpi(dev, state, 1600);

  const write = dev.sent.find(s => s.kind === "feature" && s.reportId === 0x04);
  assert.ok(write, "no DPI block written");
  assert.equal(write.bytes.length, 55, "payload is 56 bytes minus the report ID");

  const block = [0x04, ...write.bytes];
  assert.equal(block[1], 0x38, "length byte must stay 0x38");
  assert.equal(checksum(block), (block[50] << 8) | block[51], "checksum was not recomputed");
  assert.equal(block[7], block[6], "byte [7] must mirror byte [6]");
});

test("attack shark: only the active stage changes, the rest of the block is untouched", async () => {
  const { dev } = mockAttackShark();
  const state = await attackShark.init(dev);
  const before = Array.from(DPI_TEMPLATE);
  const stage = attackShark.stage(state);                              // template says stage index 1

  await attackShark.writeDpi(dev, state, 1600);
  const block = [0x04, ...dev.sent.find(s => s.kind === "feature" && s.reportId === 0x04).bytes];

  for (let i = 0; i < 56; i++) {
    const mutable = [6, 7, 50, 51, 8 + stage, 16 + stage].includes(i);
    if (!mutable) assert.equal(block[i], before[i], `byte [${i}] must not change`);
  }
});

test("attack shark: report rate packet matches the documented capture", async () => {
  const { dev } = mockAttackShark();
  const state = await attackShark.init(dev);
  dev.sent.length = 0;

  await attackShark.writeRate(dev, state, 0x01);                       // 1000 Hz
  const write = dev.sent.find(s => s.kind === "feature" && s.reportId === 0x06);
  // Upstream capture: 06 09 01 01 fe 00 00 00 00  (report ID stripped by WebHID)
  assert.deepEqual(write.bytes, [0x09, 0x01, 0x01, 0xfe, 0x00, 0x00, 0x00, 0x00]);
});

test("attack shark: an unreadable device asks for confirmation before writing", async () => {
  const { dev } = mockAttackShark({ live: false });
  const state = await attackShark.init(dev);
  assert.equal(state.needsConfirm, true, "must flag that the real config was never read");
  assert.match(state.confirmText, /overwrite/i);
});

/* ============================ HyperX ============================ */

test("hyperx: packets are 64-byte output reports with no report id", async () => {
  const { dev } = mockHyperX();
  await hyperx.init(dev);
  for (const packet of dev.sent) {
    assert.equal(packet.kind, "output");
    assert.equal(packet.reportId, 0x00);
    assert.equal(packet.bytes.length, 64);
  }
});

test("hyperx: setDpi matches the documented sample — 16000 DPI is 320 steps, little-endian", async () => {
  const { dev, stored } = mockHyperX();
  const state = await hyperx.init(dev);
  dev.sent.length = 0;

  // santeri3700 protocol/index.md: 16000 ÷ 50 = 320 → transmitted as 0x40 0x01
  assert.equal(await hyperx.writeDpi(dev, state, 16000), 16000);
  assert.equal(stored.dpiSteps[1], 320, "active profile 1 must hold the new value");

  const set = dev.sent.find(s => s.bytes[0] === 0xd3);
  // [0]=cmd [1]=set-value mode [2]=profile [3]=2 bytes follow [4..5]=steps LE
  assert.deepEqual(set.bytes.slice(0, 6), [0xd3, 0x02, 0x01, 0x02, 0x40, 0x01]);
  assert.ok(stored.saves > 0, "0xde must persist the change to flash");
});

test("hyperx: the Haste Wireless PIDs use 100-DPI hardware steps", async () => {
  const { dev, stored } = mockHyperX({ productId: 0x028e });
  const state = await hyperx.init(dev);
  assert.equal(state.step, 100, "libratbag device file: 200..16000 in 100-DPI increments");

  assert.equal(await hyperx.writeDpi(dev, state, 1600), 1600);
  assert.equal(stored.dpiSteps[1], 16, "1600 DPI must be sent as 16 units, not 32");
});

test("hyperx: report rate is an index into 125/250/500/1000", async () => {
  const { dev, stored } = mockHyperX({ rate: 3 });
  const state = await hyperx.init(dev);
  const rate = await hyperx.readRate(dev, state);
  assert.deepEqual(rate.options.map(o => [o.raw, o.hz]), [[0, 125], [1, 250], [2, 500], [3, 1000]]);
  assert.equal(rate.value, 3);

  dev.sent.length = 0;
  assert.equal(await hyperx.writeRate(dev, state, 0), 0);
  assert.equal(stored.rate, 0);
  const set = dev.sent.find(s => s.bytes[0] === 0xd0);
  assert.deepEqual(set.bytes.slice(0, 5), [0xd0, 0x00, 0x00, 0x01, 0x00]);
});

test("hyperx: the written profile comes from the device's 0x53 state, not a hard-coded 0", async () => {
  const { dev, stored } = mockHyperX({ profile: 3 });
  const state = await hyperx.init(dev);

  await hyperx.writeDpi(dev, state, 2400);
  assert.equal(stored.dpiSteps[3], 48, "profile 3 must be the one written");
  assert.equal(stored.dpiSteps[1], 16, "profile 1 must be left alone");
});

test("hyperx: a silent device is rejected before any write", async () => {
  const dev = createMockDevice({ onOutput: () => null });
  await assert.rejects(() => hyperx.init(dev), /no response/);
  assert.ok(dev.sent.every(s => s.bytes[0] === 0x53), "only the read-only probe may be sent");
});

test("hyperx gen2: the Haste 2 report map selects the 0xff90 protocol and probes with the battery query", async () => {
  const { dev } = mockHyperXGen2({ battery: 0x63 });
  const state = await hyperx.init(dev);
  assert.equal(state.gen, 2);
  assert.equal(state.battery, 0x63, "battery must come from the 0x51 reply");
  assert.equal(state.needsConfirm, true, "settings cannot be read — the user must confirm the first write");
  assert.deepEqual(dev.sent.map(s => s.reportId), [0x50], "only the read-only battery query may be sent");
});

test("hyperx gen2: writeDpi sends the documented 0x32 packet and the commit sequence", async () => {
  const { dev, stored } = mockHyperXGen2();
  const state = await hyperx.init(dev);
  dev.sent.length = 0;

  assert.equal(await hyperx.writeDpi(dev, state, 1600), 1600);

  const config = stored.configs.at(-1);
  // [0]=0x01 [1]=save [2]=0 [3]=rate code [4]=stage mask [5]=active stage
  assert.deepEqual(Array.from(config.slice(0, 6)), [0x01, 0x01, 0x00, 0x08, 0x0f, 0x01]);
  // protocol-notes.md samples: 400→0x07, 1600→0x1f, 3200→0x3f (dpi/50 − 1, little-endian)
  assert.deepEqual(Array.from(config.slice(6, 8)), [0x07, 0x00], "stage 0 stays 400");
  assert.deepEqual(Array.from(config.slice(11, 13)), [0x1f, 0x00], "active stage 1 becomes 1600");
  assert.deepEqual(Array.from(config.slice(21, 23)), [0x3f, 0x00], "stage 3 stays 3200");
  assert.equal(stored.commits, 1, "the 0x36 commit must follow");

  const ids = new Set(dev.sent.map(s => s.reportId));
  assert.deepEqual([...ids].sort((a, b) => a - b), [0x32, 0x36, 0x50], "only config, commit and its 0x50 prefix");
});

test("hyperx gen2: the wired Haste 2 has no battery — a silent probe still connects, read-only", async () => {
  const { dev, stored } = mockHyperXGen2({ mute: true });
  const state = await hyperx.init(dev);

  assert.equal(state.gen, 2, "the 0xff90 report map is the fingerprint, not the battery reply");
  assert.equal(state.battery, null);
  assert.equal(state.needsConfirm, true);
  assert.deepEqual(dev.sent.map(s => s.reportId), [0x50], "only the read-only battery query was sent");

  // Writes are fire-and-forget on this generation, so they still work after consent.
  assert.equal(await hyperx.writeDpi(dev, state, 1600), 1600);
  assert.equal(stored.commits, 1);
});

test("hyperx gen2: report rate codes are 8000/Hz and travel in the same config packet", async () => {
  const { dev, stored } = mockHyperXGen2();
  const state = await hyperx.init(dev);
  const rate = await hyperx.readRate(dev, state);
  assert.deepEqual(rate.options.map(o => [o.hz, o.raw]),
    [[125, 0x40], [250, 0x20], [500, 0x10], [1000, 0x08], [2000, 0x04], [4000, 0x02], [8000, 0x01]]);
  for (const o of rate.options) assert.equal(o.raw * o.hz, 8000, "every code obeys code = 8000/Hz");

  assert.equal(await hyperx.writeRate(dev, state, 0x40), 0x40);
  assert.equal(stored.configs.at(-1)[3], 0x40, "rate code sits at payload byte [3]");
});

/* ============================= ATK ============================= */

test("atk: packets are 64 bytes on feature report 8", async () => {
  const { dev } = mockAtk();
  await atk.init(dev);
  for (const packet of dev.sent) {
    assert.equal(packet.reportId, 8);
    assert.equal(packet.bytes.length, 64);
  }
});

test("atk: setDpi sends a plain little-endian 16-bit value", async () => {
  const { dev, stored } = mockAtk();
  const state = await atk.init(dev);
  dev.sent.length = 0;

  assert.equal(await atk.writeDpi(dev, state, 1600), 1600);
  assert.equal(stored.dpi[0], 1600);

  const set = dev.sent.find(s => s.bytes[0] === 0x26);
  // [0]=cmd [1]=0 [2]=stage [3]=dpi lo [4]=dpi hi
  assert.deepEqual(set.bytes.slice(0, 5), [0x26, 0x00, 0x00, 0x40, 0x06]);
});

test("atk: 8000 Hz is code 0x81", async () => {
  const { dev, stored } = mockAtk();
  const state = await atk.init(dev);
  const rate = await atk.readRate(dev, state);
  assert.equal(rate.options.find(o => o.hz === 8000).raw, 0x81);

  assert.equal(await atk.writeRate(dev, state, 0x81), 0x81);
  assert.equal(stored.rate, 0x81);
});

test("atk: the current rate is read from GetConfigData, not a nonexistent get-rate opcode", async () => {
  const { dev } = mockAtk({ rate: 0x02 });                  // 500 Hz
  const state = await atk.init(dev);
  dev.sent.length = 0;

  const rate = await atk.readRate(dev, state);
  assert.equal(rate.value, 0x02, "current rate must be reported");
  assert.ok(dev.sent.some(s => s.bytes[0] === 0x82), "GetConfigData was not used");
  assert.ok(!dev.sent.some(s => s.bytes[0] === 0xa0), "0xa0 is not a real command in the vendor driver");
});

test("atk: the active DPI stage comes from the device, not a hard-coded 0", async () => {
  const { dev, stored } = mockAtk({ stage: 3 });
  const state = await atk.init(dev);
  assert.equal(state.stage, 3, "init must adopt the device's active stage");

  await atk.writeDpi(dev, state, 3200);
  assert.equal(stored.dpi[3], 3200, "stage 3 must be the one written");
  assert.equal(stored.dpi[0], 1600, "stage 0 must be left alone");
});

test("atk nearlink: 16-byte EEPROM packets on output report 8, with the 0x55 checksum", async () => {
  const { dev } = mockAtkNearlink();
  const state = await atk.init(dev);
  assert.equal(state.proto, "ee", "the report map must select the EEPROM platform");

  await atk.readDpi(dev, state);
  for (const packet of dev.sent) {
    assert.equal(packet.kind, "output", "this platform has no feature report 8");
    assert.equal(packet.reportId, 8);
    assert.equal(packet.bytes.length, 16);
    const sum = 8 + packet.bytes.slice(0, 15).reduce((a, b) => a + b, 0);
    assert.equal(packet.bytes[15], (0x55 - sum) & 0xff, "checksum byte [15]");
  }

  // MouseInfo query, byte for byte: GetEEPROM(0x08) at 0x0000, 6 bytes.
  assert.deepEqual(Array.from(eePacket(0x08, 0x0000, 6)),
    [0x08, 0, 0, 0, 6, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0x3f]);
});

test("atk nearlink: DPI entries round-trip through the firmware's own decode", () => {
  // 1600 DPI → steps 31: x = 31, ex = 0 (below the 12 850 block), crc = 0x55−62 = 0x17.
  // ex must be 0 here — the nonzero ex of atk-hub-rs's encoder is what corrupted a
  // real A9 SE's DPI pair in the field.
  assert.deepEqual(eeDpiEncode(1600), [31, 31, 0, 0x17]);
  assert.deepEqual(eeDpiEncode(26000).slice(0, 3), [7, 7, 0x88], "26000 sits in the third block");
  for (const dpi of [50, 400, 800, 1600, 3200, 12800, 12850, 26000])
    assert.equal(eeDpiDecode(...[eeDpiEncode(dpi)[0], eeDpiEncode(dpi)[2]]), dpi, `round-trip ${dpi}`);
  // The firmware decode exposes the old buggy encoding instead of hiding it.
  assert.equal(eeDpiDecode(31, 8), 3100, "a mis-encoded 1600 reads back as 3100 → rollback fires");
});

test("atk nearlink: writeDpi rewrites only the active preset's 4-byte slot", async () => {
  const { dev, eeprom } = mockAtkNearlink({ dpi: 1600, active: 3 });
  const state = await atk.init(dev);

  assert.equal(await atk.writeDpi(dev, state, 3200), 3200, "read back through the mock EEPROM");
  // preset 3 lives in pair block 0x14, second slot (bytes 4..7)
  assert.deepEqual([...eeprom.slice(0x14 + 4, 0x14 + 8)], eeDpiEncode(3200), "active slot updated");
  assert.deepEqual([...eeprom.slice(0x14, 0x14 + 4)], eeDpiEncode(1600), "sibling slot untouched");
});

test("atk nearlink: report rate keeps the other info bytes, and risky rates are not offered", async () => {
  const { dev, eeprom } = mockAtkNearlink({ rate: 0x01, active: 2 });
  const state = await atk.init(dev);

  const rate = await atk.readRate(dev, state);
  assert.equal(rate.value, 0x01);
  // The EEPROM accepts any code blindly — a 2000/4000/8000 write without the 8K
  // dongle breaks tracking (field report from an A9 SE), so they must not appear.
  assert.deepEqual(rate.options.map(o => o.hz), [1000, 500, 250, 125], "only universally safe rates");

  assert.equal(await atk.writeRate(dev, state, 0x08), 0x08);      // 125 Hz
  assert.deepEqual([...eeprom.slice(0, 6)], [0x08, 0x4d, 8, 0x4d, 2, 0x53],
    "value+complement pairs, profile count and active profile preserved");
});

test("atk nearlink: the 4K dongle unlocks 2000/4000 but keeps 8000 hidden", async () => {
  const { dev } = mockAtkNearlink({ connType: 1 });               // Dongle4K
  const state = await atk.init(dev);
  assert.equal(state.maxHz, 4000, "ceiling comes from the DownLoadData handshake");

  const rate = await atk.readRate(dev, state);
  assert.deepEqual(rate.options.map(o => o.hz), [4000, 2000, 1000, 500, 250, 125]);
});

test("atk nearlink: an 8K dongle offers the full ladder, a silent handshake stays at 1000", async () => {
  const eightK = mockAtkNearlink({ connType: 5 });                // Dongle8K
  const s8 = await atk.init(eightK.dev);
  assert.equal((await atk.readRate(eightK.dev, s8)).options[0].hz, 8000);

  // A device that never answers the handshake must fall back to the safe ceiling.
  const shy = mockAtkNearlink();
  const origOnOutput = shy.dev.sendReport;                        // mock replies via sendReport
  shy.dev.sendReport = async (id, data) =>
    data[0] === 0x01 ? undefined : origOnOutput.call(shy.dev, id, data);
  const sShy = await atk.init(shy.dev);
  assert.equal(sShy.maxHz, 1000, "no handshake answer → 1000 Hz ceiling");
});

test("atk nearlink: a mouse stuck at 8000 Hz still shows it and can climb back down", async () => {
  const { dev, eeprom } = mockAtkNearlink({ rate: 0x40 });        // 8K code already in EEPROM
  const state = await atk.init(dev);

  const rate = await atk.readRate(dev, state);
  assert.equal(rate.value, 0x40, "the stuck value must be visible");
  assert.equal(rate.options[0].hz, 8000, "current state is shown so the UI can mark it");
  assert.deepEqual(rate.options.slice(1).map(o => o.hz), [1000, 500, 250, 125]);

  assert.equal(await atk.writeRate(dev, state, 0x01), 0x01, "recovery write to 1000 Hz");
  assert.equal(eeprom[0], 0x01);
});

test("atk: a device that does not echo the probe is rejected before any write", async () => {
  const dev = createMockDevice({ onFeatureRead: () => pad([0x00], 64) });
  await assert.rejects(() => atk.init(dev), /did not respond|no reply|got no reply/i);
  assert.ok(dev.sent.every(s => s.bytes[0] === 0x80), "only the read-only probe may be sent");
});
