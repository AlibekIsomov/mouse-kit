/**
 * ATK / VXE / VGN / Darmoshark — COMPX platform
 *
 * Protocol extracted from ATK's own web driver (hub.atk.pro).
 * Feature report 8, 64-byte packet, [0] = command. No checksum.
 *
 *   0x80  GetFirmwareVersion   device probe (read-only — safe)
 *   0x82  GetConfigData        current report rate and active DPI stage
 *   0x26  SetDpiValue          [2]=stage  [3]=dpi lo  [4]=dpi hi
 *   0xa6  GetDpiValue          reply: 8 stages, u16 LE, starting at [1]
 *   0x20  SetReportRate        [3]=rate code
 *
 * There is deliberately no "get report rate" command — the vendor's own driver has
 * no such opcode either; the current rate only comes back inside GetConfigData.
 *
 * GetConfigData reply (the vendor packet class reads from baseOffset = 1):
 *   [1] report rate   [2] active DPI stage (0-based)   [3] RGB mode
 *   [4] brightness    [5] speed   [6] colour index   [7] reserved
 *   [8] battery level [9] link status
 *
 * DPI is a plain 16-bit value — no sensor lookup table needed, unlike Attack Shark.
 *
 * Transport: wired mice expose the packet as feature report 8. The Nearlink
 * devices (A9 SE dongle 0x373b:0x10c9, A9 SE wired 0x373b:0x1135) have no feature
 * report 8 — they carry two input/output pairs on the 0xff02 collections, IDs 8
 * and 19, and no public source documents which pipe carries the config. init()
 * probes each pipe with the read-only GetFirmwareVersion and keeps the one that
 * echoes; replies are accepted from either pipe, matched by the command byte.
 */

const REPORT_ID = 8;
const PACKET_SIZE = 64;
const OUTPUT_IDS = [8, 19];

const outputIdsFor = dev =>
  OUTPUT_IDS.filter(id => dev.collections.some(c => (c.outputReports ?? []).some(r => r.reportId === id)));

/** Feature report 8 when the interface has one (or declares nothing, as older
 *  Chrome builds do) — otherwise the Nearlink output-report channels. */
const usesOutputTransport = dev =>
  outputIdsFor(dev).length > 0 &&
  !dev.collections.some(c => (c.featureReports ?? []).some(r => r.reportId === REPORT_ID));

const channels = new WeakMap();     // dev → the output report ID that answered the probe

const CMD = {
  GET_FIRMWARE: 0x80,
  GET_CONFIG: 0x82,
  SET_DPI: 0x26,
  GET_DPI: 0xa6,
  SET_RATE: 0x20,
};

export const RATES = [
  { raw: 0x81, hz: 8000 }, { raw: 0x41, hz: 4000 }, { raw: 0x21, hz: 2000 },
  { raw: 0x01, hz: 1000 }, { raw: 0x02, hz: 500 }, { raw: 0x04, hz: 250 }, { raw: 0x08, hz: 125 },
];

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function command(dev, cmd, fill) {
  const p = new Uint8Array(PACKET_SIZE);
  p[0] = cmd;
  if (fill) fill(p);

  if (usesOutputTransport(dev)) {
    const id = channels.get(dev) ?? outputIdsFor(dev)[0];
    return new Promise((resolve, reject) => {
      const finish = (fn, arg) => { clearTimeout(timer); dev.removeEventListener("inputreport", onReport); fn(arg); };
      const timer = setTimeout(() => finish(reject, new Error("no reply (timeout)")), 1000);
      const onReport = e => {
        const b = new Uint8Array(e.data.buffer);
        if (b[0] !== cmd) {                               // capture material for unseen variants
          if (OUTPUT_IDS.includes(e.reportId))
            console.log(`[mousekit] atk: report ${e.reportId} replied 0x${b[0].toString(16)} to command 0x${cmd.toString(16)}`,
              Array.from(b.slice(0, 12)));
          return;
        }
        finish(resolve, b);
      };
      dev.addEventListener("inputreport", onReport);
      dev.sendReport(id, p).catch(err => finish(reject, err));
    });
  }

  await dev.sendFeatureReport(REPORT_ID, p);
  await sleep(25);

  const b = new Uint8Array((await dev.receiveFeatureReport(REPORT_ID)).buffer);
  return b.length > PACKET_SIZE ? b.subarray(1) : b;    // drop the report ID if it was echoed back
}

/** Current report rate and active DPI stage, or null if the device will not say. */
async function readConfig(dev) {
  const r = await command(dev, CMD.GET_CONFIG).catch(() => null);
  if (!r || r[0] !== CMD.GET_CONFIG) return null;
  return { rate: r[1], stage: Math.min(Math.max(r[2], 0), 7) };   // stage is a 0-based index
}

export const atk = {
  async init(dev) {
    if (!dev.collections.some(c => c.usagePage >= 0xff00))
      throw new Error("Configuration interface not found — try picking the other entry for this mouse in the list.");

    let r = null;
    if (usesOutputTransport(dev)) {
      for (const id of outputIdsFor(dev)) {             // read-only probe on each pipe
        channels.set(dev, id);
        r = await command(dev, CMD.GET_FIRMWARE).catch(() => null);
        if (r && r[0] === CMD.GET_FIRMWARE) break;
        r = null;
      }
    } else {
      r = await command(dev, CMD.GET_FIRMWARE).catch(() => null);
      if (r && r[0] !== CMD.GET_FIRMWARE) r = null;
    }
    if (!r)
      throw new Error("The ATK protocol got no reply — this model may be on a different platform.");

    const config = await readConfig(dev);
    return { stage: config?.stage ?? 0, firmware: r[1] + "." + r[2] };
  },

  async readDpi(dev, s) {
    const r = await command(dev, CMD.GET_DPI);
    const value = r[1 + s.stage * 2] | (r[2 + s.stage * 2] << 8);
    // ponytail: the ceiling is 12000..26000 depending on the model. The device clamps it,
    // and we read back after writing to show the real value.
    return { min: 50, max: 26000, step: 50, value: value || 1600 };
  },

  async writeDpi(dev, s, dpi) {
    await command(dev, CMD.SET_DPI, p => {
      p[2] = s.stage;
      p[3] = dpi & 0xff;
      p[4] = dpi >> 8;
    });
    return (await this.readDpi(dev, s)).value;
  },

  async readRate(dev, s) {
    const config = await readConfig(dev);
    if (config) s.stage = config.stage;               // the DPI button may have moved it
    return { options: RATES, value: config?.rate ?? 0 };
  },

  async writeRate(dev, s, raw) {
    await command(dev, CMD.SET_RATE, p => { p[3] = raw; });
    return (await this.readRate(dev, s)).value || raw;   // if reads are unsupported, show what we wrote
  },
};
