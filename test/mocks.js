/**
 * Protocol-aware mock devices, one per driver.
 * Each remembers what was written so tests can assert a real round-trip.
 */
import { createMockDevice, pad } from "./mock-hid.js";
import { ADDR } from "../public/drivers/logitech.js";
import { DPI_TEMPLATE } from "../public/drivers/attackshark.js";

const SW_ID = 0x0a;
export const DPI_FEATURE = 1;
export const RATE_FEATURE = 2;

/** Logitech: answers root, 0x2201 (DPI) and 0x8060 (report rate). */
export function mockLogitech({ dpi = 800, rate = 1 } = {}) {
  const stored = { dpi, rate };

  const dev = createMockDevice({
    vendorId: 0x046d,
    onOutput({ bytes }) {
      const [index, feature, address] = bytes;
      const short = params => ({ reportId: 0x10, bytes: pad([index, feature, address, ...params], 6) });
      const long = params => ({ reportId: 0x11, bytes: pad([index, feature, address, ...params], 19) });

      if (index !== 0xff) return null;                      // only the wired index answers

      if (feature === 0x00) {
        if (address === (ADDR.ROOT_GET_PROTOCOL | SW_ID)) return short([0x04, 0x02, 0x5a]);
        if (address === (ADDR.ROOT_GET_FEATURE | SW_ID)) {
          const id = (bytes[3] << 8) | bytes[4];
          return short([{ 0x2201: DPI_FEATURE, 0x8060: RATE_FEATURE }[id] ?? 0]);
        }
      }
      if (feature === DPI_FEATURE) {
        if (address === (ADDR.DPI_GET_LIST | SW_ID)) return long([0, 0x01, 0x90, 0x03, 0x20, 0x06, 0x40, 0, 0]);
        if (address === (ADDR.DPI_GET | SW_ID)) return short([0, stored.dpi >> 8, stored.dpi & 0xff]);
        if (address === (ADDR.DPI_SET | SW_ID)) {
          stored.dpi = (bytes[4] << 8) | bytes[5];          // params[1..2], big-endian
          return long([0, bytes[4], bytes[5]]);
        }
      }
      if (feature === RATE_FEATURE) {
        if (address === (ADDR.RATE_GET_LIST | SW_ID)) return short([0b0000_1001]);   // 1 ms and 4 ms
        if (address === (ADDR.RATE_GET | SW_ID)) return short([stored.rate]);
        if (address === (ADDR.RATE_SET | SW_ID)) { stored.rate = bytes[3]; return short([bytes[3]]); }
      }
      return null;
    },
  });
  return { dev, stored };
}

/** Razer: 90-byte feature reports, status 0x02 = success. */
export function mockRazer({ dpi = 800, rate = 1 } = {}) {
  const stored = { dpi, rate };
  const dev = createMockDevice({
    vendorId: 0x1532,
    onFeatureRead(reportId, sent) {
      const last = sent.at(-1);
      if (!last) return null;
      const [, tid, , , , , cls, id] = last.bytes;
      const reply = args => pad([0x02, tid, 0, 0, 0, 0, cls, id, ...args], 90);

      if (cls === 0x00 && id === 0x81) return reply([1, 2]);                       // firmware
      if (cls === 0x04 && id === 0x85) return reply([0, stored.dpi >> 8, stored.dpi & 0xff]);
      if (cls === 0x04 && id === 0x05) {
        stored.dpi = (last.bytes[9] << 8) | last.bytes[10];                        // args[1..2]
        return reply([]);
      }
      if (cls === 0x00 && id === 0x85) return reply([stored.rate]);
      if (cls === 0x00 && id === 0x05) { stored.rate = last.bytes[8]; return reply([]); }
      return null;
    },
  });
  return { dev, stored };
}

/** Attack Shark: 56-byte config block on report 0x04, 9-byte rate packet on 0x06. */
export function mockAttackShark({ live = true, rate = 0x01 } = {}) {
  const block = Array.from(DPI_TEMPLATE);
  const stored = { rate };
  const dev = createMockDevice({
    vendorId: 0x1d57,
    onFeatureRead(reportId, sent) {
      const write = sent.filter(s => s.reportId === reportId).at(-1);
      if (reportId === 0x04) {
        if (!live) return null;
        if (write) block.splice(0, 56, 0x04, ...write.bytes);          // device stores what we wrote
        return block;
      }
      if (reportId === 0x06) return pad([0x06, 0x09, 0x01, stored.rate], 9);
      return null;
    },
  });
  const origSend = dev.sendFeatureReport;
  dev.sendFeatureReport = async (id, data) => {
    if (id === 0x06) stored.rate = data[2];                            // [3] of the full packet
    return origSend(id, data);
  };
  return { dev, block, stored };
}

/** ATK / VXE: 64-byte packets on feature report 8, [0] = command. */
export function mockAtk({ dpi = 1600, rate = 0x01, stage = 0 } = {}) {
  const stored = { dpi: [dpi, 0, 0, 0, 0, 0, 0, 0], rate, stage };
  const dev = createMockDevice({
    vendorId: 0x373b,
    onFeatureRead(reportId, sent) {
      const last = sent.filter(s => s.reportId === reportId).at(-1);
      if (!last) return null;
      const cmd = last.bytes[0];
      if (cmd === 0x80) return pad([0x80, 1, 2], 64);
      // GetConfigData: [1] report rate, [2] active DPI stage
      if (cmd === 0x82) return pad([0x82, stored.rate, stored.stage], 64);
      if (cmd === 0xa6) return pad([0xa6, ...stored.dpi.flatMap(d => [d & 0xff, d >> 8])], 64);
      if (cmd === 0x26) {
        stored.dpi[last.bytes[2]] = last.bytes[3] | (last.bytes[4] << 8);
        return pad([0x26], 64);
      }
      if (cmd === 0x20) { stored.rate = last.bytes[3]; return pad([0x20], 64); }
      return null;
    },
  });
  return { dev, stored };
}
