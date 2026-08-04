/**
 * Logitech — HID++ 2.0
 *
 * Short report 0x10 (6 bytes), long report 0x11 (19 bytes).
 * Packet: [deviceIndex, featureIndex, address, ...params]
 *
 * The third byte is an *address*: (functionIndex << 4) | softwareId.
 * The ADDR_* constants below are already shifted — matching libratbag's CMD_*
 * values — so they are only OR'd with the software id, never shifted again:
 *
 *     libratbag/src/hidpp20.c:  msg->msg.address |= DEVICE_SW_ID;
 *
 * deviceIndex: 0xff = wired / direct, 1..6 = devices paired to a receiver.
 * Feature indices are not fixed — they are looked up through root (0x0000).
 */

const SW_ID = 0x0a;                       // software id (1..15, must not be 0)
const F_DPI = 0x2201;                     // Adjustable DPI
const F_RATE = 0x8060;                    // Adjustable Report Rate
const F_RATE_EXT = 0x8061;                // Extended Adjustable Report Rate (8K mice)

// Function addresses, already in (functionIndex << 4) form.
export const ADDR = {
  ROOT_GET_FEATURE: 0x00,
  ROOT_GET_PROTOCOL: 0x10,
  DPI_GET_LIST: 0x10,
  DPI_GET: 0x20,
  DPI_SET: 0x30,
  RATE_GET_LIST: 0x00,
  RATE_GET: 0x10,
  RATE_SET: 0x20,
  RATE_EXT_GET_LIST: 0x10,
  RATE_EXT_GET: 0x20,
  RATE_EXT_SET: 0x30,
};

function hidpp(dev, { index, feature, addr, params = [], long = false }) {
  const reportId = long ? 0x11 : 0x10;
  const buf = new Uint8Array(long ? 19 : 6);
  buf[0] = index;
  buf[1] = feature;
  buf[2] = addr | SW_ID;
  params.forEach((p, i) => { buf[3 + i] = p; });

  return new Promise((resolve, reject) => {
    const finish = (fn, arg) => { clearTimeout(timer); dev.removeEventListener("inputreport", onReport); fn(arg); };
    const timer = setTimeout(() => finish(reject, new Error("no response (timeout)")), 1000);

    const onReport = e => {
      const b = new Uint8Array(e.data.buffer);
      if (b[0] !== index) return;
      if (e.reportId === 0xff && b[1] === feature) return finish(reject, new Error("HID++ error " + b[3]));
      if (b[1] === 0x8f) return finish(reject, new Error("HID++ 1.0 error " + b[4]));
      if (e.reportId !== 0x10 && e.reportId !== 0x11) return;
      if (b[1] !== feature || b[2] !== (addr | SW_ID)) return;   // reply to a different command
      finish(resolve, b.slice(3));
    };

    dev.addEventListener("inputreport", onReport);
    dev.sendReport(reportId, buf).catch(err => finish(reject, err));
  });
}

/** Root fn 0x00 → feature index. 0 means the device does not have that feature. */
const featureIndex = (dev, index, id) =>
  hidpp(dev, { index, feature: 0x00, addr: ADDR.ROOT_GET_FEATURE, params: [id >> 8, id & 0xff] })
    .then(r => r[0]).catch(() => 0);

/**
 * Reply to 0x2201 fn 0x10: [sensorIdx, u16, u16, ...].
 * 0xE0xx marks a step size, 0x0000 ends the list.
 */
export function parseDpiList(payload) {
  const values = [];
  let step = 0;
  for (let i = 1; i + 1 < payload.length; i += 2) {
    const v = (payload[i] << 8) | payload[i + 1];
    if (v === 0) break;
    if ((v & 0xe000) === 0xe000) step = v & 0x1fff;
    else values.push(v);
  }
  if (!values.length) return null;
  return { min: Math.min(...values), max: Math.max(...values), step: step || 50 };
}

/** 0x8060 bitmap: bit i → (i + 1) ms */
export function ratesFrom8060(bitmap) {
  const out = [];
  for (let i = 0; i < 8; i++) if (bitmap & (1 << i)) out.push({ raw: i + 1, hz: Math.round(1000 / (i + 1)) });
  return out;
}

/** 0x8061 bitmap: bit i → EXT_HZ[i] */
export const EXT_HZ = [125, 250, 500, 1000, 2000, 4000, 8000];
export const ratesFrom8061 = bitmap =>
  EXT_HZ.map((hz, i) => ({ raw: i, hz })).filter(r => bitmap & (1 << r.raw));

export const logitech = {
  async init(dev) {
    if (!dev.collections.some(c => c.usagePage >= 0xff00))
      throw new Error("This mouse has no HID++ (vendor) interface — a plain office mouse has a fixed DPI.");

    // Look for an index that actually exposes DPI / report rate, not merely one that answers:
    // a receiver can have several devices paired to it.
    let pinged = false;
    for (const index of [0xff, 1, 2, 3, 4, 5, 6]) {
      const alive = await hidpp(dev, { index, feature: 0x00, addr: ADDR.ROOT_GET_PROTOCOL, params: [0, 0, 0x5a] })
        .catch(() => null);
      if (!alive) continue;
      pinged = true;

      const dpiF = await featureIndex(dev, index, F_DPI);
      const rrF = await featureIndex(dev, index, F_RATE);
      const rrExtF = rrF ? 0 : await featureIndex(dev, index, F_RATE_EXT);
      if (dpiF || rrF || rrExtF) return { index, dpiF, rrF, rrExtF, connType: 0 };
    }

    throw new Error(pinged
      ? "HID++ responded, but this model has no DPI / report-rate feature (0x2201, 0x8060 and 0x8061 are all missing)."
      : "HID++ did not respond. If the mouse is connected through a Unifying/Bolt receiver, pick the receiver in the list.");
  },

  async readDpi(dev, s) {
    if (!s.dpiF) return null;
    const list = parseDpiList(await hidpp(dev, {
      index: s.index, feature: s.dpiF, addr: ADDR.DPI_GET_LIST, params: [0], long: true,
    }));
    const current = await hidpp(dev, { index: s.index, feature: s.dpiF, addr: ADDR.DPI_GET, params: [0] });
    return list && { ...list, value: (current[1] << 8) | current[2] };
  },

  async writeDpi(dev, s, dpi) {
    // parameters[0] = sensor index, parameters[1..2] = DPI big-endian (libratbag hidpp20.c)
    await hidpp(dev, {
      index: s.index, feature: s.dpiF, addr: ADDR.DPI_SET,
      params: [0, dpi >> 8, dpi & 0xff], long: true,
    });
    return (await this.readDpi(dev, s)).value;              // always read back to confirm
  },

  async readRate(dev, s) {
    if (s.rrF) {
      const bitmap = (await hidpp(dev, { index: s.index, feature: s.rrF, addr: ADDR.RATE_GET_LIST }))[0];
      const current = (await hidpp(dev, { index: s.index, feature: s.rrF, addr: ADDR.RATE_GET }))[0];
      return { options: ratesFrom8060(bitmap), value: current };
    }
    if (!s.rrExtF) return null;

    // ponytail: the byte layout of 0x8061 is undocumented — try connType 0 and 1;
    // the result is read back after every write anyway.
    for (const connType of [0, 1]) {
      const r = await hidpp(dev, {
        index: s.index, feature: s.rrExtF, addr: ADDR.RATE_EXT_GET_LIST, params: [connType],
      }).catch(() => null);
      if (!r) continue;
      const options = ratesFrom8061(r[0]).length ? ratesFrom8061(r[0]) : ratesFrom8061(r[1]);
      if (!options.length) continue;
      s.connType = connType;
      const current = (await hidpp(dev, {
        index: s.index, feature: s.rrExtF, addr: ADDR.RATE_EXT_GET, params: [connType],
      }))[0];
      return { options, value: current };
    }
    return null;
  },

  async writeRate(dev, s, raw) {
    if (s.rrF) await hidpp(dev, { index: s.index, feature: s.rrF, addr: ADDR.RATE_SET, params: [raw] });
    else await hidpp(dev, { index: s.index, feature: s.rrExtF, addr: ADDR.RATE_EXT_SET, params: [s.connType, raw] });
    return (await this.readRate(dev, s)).value;
  },

  rateNote: s => (s.rrExtF ? "In wireless mode the maximum rate depends on the receiver." : ""),
};
