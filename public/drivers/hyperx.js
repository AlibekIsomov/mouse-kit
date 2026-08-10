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

    // Read-only probe: 0x0951/0x03f0 also cover non-mouse HyperX/HP devices, and the
    // older Pulsefire generation (Surge, FPS Pro, Core) speaks a different protocol.
    // Nothing that fails to echo these reads is ever written to.
    const s = await readState(dev);
    return { step: dpiStepFor(dev.productId), cfg: s.cfg };
  },

  async readDpi(dev, s) {
    const { profile, steps } = await readState(dev);
    // min = 2 units on both documented models (Dart 100 @ step 50, Haste 200 @ step 100)
    return { min: s.step * 2, max: 16000, step: s.step, value: steps[profile] * s.step };
  },

  async writeDpi(dev, s, dpi) {
    const { profile } = await readState(dev);             // the DPI button may have moved it
    const units = Math.round(dpi / s.step);
    await send(dev, [0xd3, 0x02, profile, 0x02, units & 0xff, units >> 8]);
    await send(dev, [0xde]);
    return (await this.readDpi(dev, s)).value;
  },

  async readRate(dev) {
    const { rateIdx } = await readState(dev);
    return { options: HYPERX_RATES, value: rateIdx };
  },

  async writeRate(dev, s, raw) {
    await send(dev, [0xd0, 0x00, 0x00, 0x01, raw]);
    await send(dev, [0xde]);
    return (await this.readRate(dev, s)).value;
  },
};
