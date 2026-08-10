/**
 * HyperX — NGenuity protocol, Pulsefire Dart and newer (Haste family).
 *
 * 64-byte packets on the vendor collection (usage page 0xff00 wireless, 0xff13
 * wired, 0xff90 on the Haste), sent as output reports with no report ID. A read
 * command is answered with an input report whose first byte echoes the command;
 * write commands are not acknowledged, so every write is verified by reading back.
 *
 * Reconstructed from two independent sources that agree on every byte used here:
 *   github.com/santeri3700/hyperx_pulsefire_dart_reverse_engineering  protocol/index.md
 *   github.com/libratbag/libratbag  PR #1786 (driver-hyperx.c)
 *
 * Reads:
 *   [0x53]        DPI state    → active profile at [4], enabled bitmask at [5]
 *   [0x50, 0x03]  settings     → five u16-LE DPI values at [10..19] (in hardware
 *                                steps), report-rate index at [63]
 * Writes:
 *   [0xd3, 0x02, profile, 0x02, lo, hi]  DPI of one profile, value = dpi / step
 *   [0xd0, 0x00, 0x00, 0x01, idx]        report-rate index (see HYPERX_RATES)
 *   [0xde]                               persist the config to onboard flash
 *
 * The hardware stores DPI in steps: 50 DPI per unit on the Dart family (santeri3700,
 * "divide desired DPI by 50"), 100 on the Haste Wireless (libratbag device file:
 * 200..16000 in 100-DPI increments). Per-PID table below, default 50.
 */

/** Haste Wireless PIDs (libratbag hyperx-pulsefire-haste-wireless.device). */
const STEP_100_PIDS = [0x028e, 0x048e];
export const dpiStepFor = pid => (STEP_100_PIDS.includes(pid) ? 100 : 50);

export const HYPERX_RATES = [125, 250, 500, 1000].map((hz, i) => ({ raw: i, hz }));

/*
 * Generation 2 — Pulsefire Haste 2 / Saga family (usage page 0xff90).
 *
 * Seen on "HyperX Pulsefire Haste 2" 0x03f0:0x0b97. A completely different scheme:
 * numbered reports where an even report ID is a request and ID+1 is its response
 * (0x50 battery query → 0x51 reply). Documented by the NGenuity captures in
 * github.com/notwaterbtl/hyperx-saga-control (docs/protocol-notes.md, protocol.py):
 *
 *   [0x50, 0x02]                     battery query — the only documented read,
 *                                    reply 0x51: [0x02, percent, charging, °C, 0, mV lo, mV hi]
 *   [0x32, 0x01, save, 0x00, rate, 0x0f, stage, then 4 × (code lo, code hi, r, g, b)]
 *                                    the whole config: report rate, active stage and
 *                                    all four DPI stages (+ their LED colours) at once
 *   [0x50, 0x01, 0x14, 0x01] then [0x36, 0x01, 0, 0, 0, 0, 0, 0x02]   commit to flash
 *
 * DPI code = dpi/50 − 1 (400 → 0x07, 3200 → 0x3f). Rate code = 8000/Hz (1000 → 0x08).
 * There is no way to read the current settings — NGenuity itself keeps them
 * client-side — so this driver works like the Attack Shark fallback: defaults are
 * shown, the user confirms before the first write, and writes return what was sent.
 */

/**
 * code = 8000 / Hz. 125..4000 are documented in hyperx-saga-control; 8000 = 0x01
 * follows the same formula and matches the Haste 2's advertised 8K mode (which may
 * need a firmware update through NGENUITY on older units). Recovery from a rate the
 * firmware cannot do is one click — the write is independent of the current state.
 */
export const GEN2_RATES = [
  { raw: 0x40, hz: 125 }, { raw: 0x20, hz: 250 }, { raw: 0x10, hz: 500 }, { raw: 0x08, hz: 1000 },
  { raw: 0x04, hz: 2000 }, { raw: 0x02, hz: 4000 }, { raw: 0x01, hz: 8000 },
];
export const dpiToCode = dpi => Math.round(dpi / 50) - 1;

const isGen2 = dev =>
  dev.collections.some(c => (c.outputReports ?? []).some(r => r.reportId === 0x32));

/** Payloads are 63 bytes — WebHID passes the report ID separately. */
const gen2Send = (dev, reportId, bytes) => {
  const p = new Uint8Array(63);
  bytes.forEach((v, i) => { p[i] = v; });
  return dev.sendReport(reportId, p);
};

/** The single config packet: everything travels together, built from cached state. */
function gen2WriteConfig(dev, s) {
  const bytes = [0x01, 0x01, 0x00, s.rateCode, 0x0f, s.stage];
  for (const dpi of s.dpis) {
    const code = dpiToCode(dpi);
    bytes.push(code & 0xff, code >> 8, 0xff, 0xff, 0xff);   // stage colour resets to white
  }
  return gen2Send(dev, 0x32, bytes)
    .then(() => gen2Send(dev, 0x50, [0x01, 0x14, 0x01]))    // commit sequence
    .then(() => gen2Send(dev, 0x36, [0x01, 0, 0, 0, 0, 0, 0x02]));
}

const gen2 = {
  async init(dev) {
    // Battery query — the only documented read. Wireless models answer on report
    // 0x51; the wired Haste 2 (0x0b97) has no battery and stays silent, so a
    // timeout is expected there and must not fail init. The 0xff90 collection with
    // its even/odd report table is already a solid fingerprint for this family,
    // and a failed send (interface rejected the write) still throws.
    const battery = await new Promise((resolve, rejectFn) => {
      const finish = (fn, arg) => { clearTimeout(timer); dev.removeEventListener("inputreport", onReport); fn(arg); };
      const timer = setTimeout(() => finish(resolve, null), 1000);
      const onReport = e => {
        const b = new Uint8Array(e.data.buffer);
        if (e.reportId !== 0x51) {                      // capture material for unseen variants
          console.log(`[mousekit] hyperx gen2: report 0x${e.reportId.toString(16)} during probe`,
            Array.from(b.slice(0, 12)));
          return;
        }
        finish(resolve, b[1]);
      };
      dev.addEventListener("inputreport", onReport);
      gen2Send(dev, 0x50, [0x02]).catch(err => finish(rejectFn, err));
    });

    return {
      gen: 2, battery,
      dpis: [400, 800, 1600, 3200], stage: 1, rateCode: 0x08,   // NGenuity factory defaults
      needsConfirm: true,
      confirmText: "This model does not report its current settings. Saving will overwrite " +
        "all four DPI stages, their colours and the report rate with the values shown.",
      warning: "This HyperX generation cannot be read — the values shown are defaults, not " +
        "what is currently on the mouse.",
    };
  },

  async readDpi(dev, s) {
    return { min: 100, max: 26000, step: 50, value: s.dpis[s.stage] };
  },

  async writeDpi(dev, s, dpi) {
    s.dpis[s.stage] = dpi;
    await gen2WriteConfig(dev, s);
    return dpi;                       // nothing to read back on this generation
  },

  async readRate(dev, s) {
    return { options: GEN2_RATES, value: s.rateCode };
  },

  async writeRate(dev, s, raw) {
    s.rateCode = raw;
    await gen2WriteConfig(dev, s);
    return raw;
  },
};

/** Send one 64-byte packet; with `reply` wait for the input report echoing cmd[0]. */
function send(dev, cmd, { reply = false } = {}) {
  const buf = new Uint8Array(64);
  cmd.forEach((v, i) => { buf[i] = v; });
  if (!reply) return dev.sendReport(0x00, buf);

  return new Promise((resolve, rejectFn) => {
    const finish = (fn, arg) => { clearTimeout(timer); dev.removeEventListener("inputreport", onReport); fn(arg); };
    const timer = setTimeout(() =>
      finish(rejectFn, new Error("no response (timeout) — a sleeping wireless mouse wakes up when moved")), 1000);

    const onReport = e => {
      const b = new Uint8Array(e.data.buffer);
      if (b[0] !== cmd[0]) return;                        // reply to a different command
      finish(resolve, b);
    };
    dev.addEventListener("inputreport", onReport);
    dev.sendReport(0x00, buf).catch(err => finish(rejectFn, err));
  });
}

/** Both read commands together: everything the UI needs, nothing written. */
async function readState(dev) {
  const state = await send(dev, [0x53], { reply: true });
  const settings = await send(dev, [0x50, 0x03], { reply: true });
  const steps = [];
  for (let i = 0; i < 5; i++) steps.push(settings[10 + 2 * i] | (settings[11 + 2 * i] << 8));
  return { profile: state[4], steps, rateIdx: settings[63], cfg: settings };
}

export const hyperx = {
  async init(dev) {
    if (!dev.collections.some(c => c.usagePage >= 0xff00))
      throw new Error("HyperX configuration interface not found — try picking the other HyperX entry in the list.");

    if (isGen2(dev)) return gen2.init(dev);

    // Read-only probe: 0x0951/0x03f0 also cover non-mouse HyperX/HP devices, and the
    // older Pulsefire generation (Surge, FPS Pro, Core) speaks a different protocol.
    // Nothing that fails to echo these reads is ever written to.
    const s = await readState(dev);
    // Heartbeat [0x51]: battery % at [4], charging at [5] (santeri3700). Wired → silence.
    const hb = await send(dev, [0x51], { reply: true }).catch(() => null);
    return { step: dpiStepFor(dev.productId), cfg: s.cfg, battery: hb ? hb[4] : null };
  },

  async readDpi(dev, s) {
    if (s.gen === 2) return gen2.readDpi(dev, s);
    const { profile, steps } = await readState(dev);
    // min = 2 units on both documented models (Dart 100 @ step 50, Haste 200 @ step 100)
    return { min: s.step * 2, max: 16000, step: s.step, value: steps[profile] * s.step };
  },

  async writeDpi(dev, s, dpi) {
    if (s.gen === 2) return gen2.writeDpi(dev, s, dpi);
    const { profile } = await readState(dev);             // the DPI button may have moved it
    const units = Math.round(dpi / s.step);
    await send(dev, [0xd3, 0x02, profile, 0x02, units & 0xff, units >> 8]);
    await send(dev, [0xde]);
    return (await this.readDpi(dev, s)).value;
  },

  async readRate(dev, s) {
    if (s.gen === 2) return gen2.readRate(dev, s);
    const { rateIdx } = await readState(dev);
    return { options: HYPERX_RATES, value: rateIdx };
  },

  async writeRate(dev, s, raw) {
    if (s.gen === 2) return gen2.writeRate(dev, s, raw);
    await send(dev, [0xd0, 0x00, 0x00, 0x01, raw]);
    await send(dev, [0xde]);
    return (await this.readRate(dev, s)).value;
  },

  rateNote: s => (s.gen === 2
    ? "This model does not report its settings — shown values are what was last written here. " +
      "2000–8000 Hz need up-to-date firmware (NGENUITY update); if tracking misbehaves after " +
      "picking one, click 1000 Hz to recover."
    : ""),
};
