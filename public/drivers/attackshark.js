/**
 * Attack Shark — X11 family (Beken BK3630 + PAW3311)
 *
 * Protocol source: github.com/HarukaYamamoto0/attack-shark-x11-driver
 *   docs/dpi-protocol.md, docs/polling-rate-protocol.md
 *
 * DPI  → feature report 0x04, 56 bytes
 *        [0]=0x04 [1]=0x38 [2]=profile [5]=active-stage mask
 *        [6]=double flags [7]=copy of [6]
 *        [8..15]=DPI X stage 1..8   [16..23]=DPI Y stage 1..8
 *        [24]=current stage  [25..48]=stage colours  [49]=indicator
 *        [50..51]=checksum = sum([3..49]), big-endian
 * Rate → feature report 0x06, 9 bytes
 *        [0]=0x06 [1]=0x09 [2]=0x01 [3]=rate [4]=0xff-rate
 */

const DPI_REPORT = 0x04;
const RATE_REPORT = 0x06;

export const RATES = [
  { raw: 0x01, hz: 1000 }, { raw: 0x02, hz: 500 }, { raw: 0x04, hz: 250 }, { raw: 0x08, hz: 125 },
];

/** Factory template, used when the device will not return its current configuration. */
export const DPI_TEMPLATE = new Uint8Array([
  0x04, 0x38, 0x01, 0x00, 0x01, 0x3f, 0x20, 0x20,
  0x12, 0x25, 0x38, 0x4b, 0x75, 0x81, 0x00, 0x00,   // DPI X: 800 1600 2400 3200 5000 22000
  0x00, 0x00, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00,   // DPI Y
  0x02,                                             // current stage
  0xff, 0x00, 0x00, 0x00, 0xff, 0x00, 0x00, 0x00, 0xff, 0xff, 0xff, 0x00,
  0x00, 0xff, 0xff, 0xff, 0x00, 0xff, 0xff, 0x40, 0x00, 0xff, 0xff, 0xff,
  0x02, 0x0f, 0x68, 0x00, 0x00, 0x00, 0x00,
]);

export const checksum = b => {
  let sum = 0;
  for (let i = 3; i <= 49; i++) sum += b[i];
  return sum & 0xffff;
};

export const MIN_DPI = 50;
export const MAX_DPI = 22000;                       // upstream docs: "supported from 50 up to 22,000"

/**
 * DPI → bytes, per docs/samples/dpi-stage-mask.md.
 *
 * Two independent flags decide how the single value byte is read:
 *   double — bit for this stage in bytes [6]/[7], set when DPI > 12000
 *   high   — byte [16 + stage], set for 10100..12000 and 20100..22000
 *
 * They select the table stride:
 *   double=0 high=0   50 .. 10000    index = (dpi - 50) / 50
 *   double=0 high=1   10100 .. 12000 index = dpi / 100 - 1
 *   double=1 high=0   12100 .. 20000 index = (dpi/2 - 50) / 50
 *   double=1 high=1   20200 .. 22000 index = (dpi/2) / 100 - 1
 *
 * 20100 is a documented firmware anomaly and is encoded literally.
 */
export function dpiToBytes(dpi) {
  const clamped = Math.max(MIN_DPI, Math.min(dpi, MAX_DPI));
  if (clamped === 20100) return { x: 0xeb, y: 1, double: true };

  const double = clamped > 12000;
  const high = (clamped > 10000 && clamped <= 12000) || clamped > 20100;
  const value = double ? clamped / 2 : clamped;
  const index = high ? Math.round(value / 100) - 1 : Math.round((value - 50) / 50);

  return { x: DPI_3311[Math.max(0, index)] ?? 0, y: high ? 1 : 0, double };
}

export function bytesToDpi(x, y, double) {
  if (!x && !y) return 0;
  if (double && y === 1 && x === 0xeb) return 20100;          // the same anomaly, in reverse
  const i = DPI_3311.indexOf(x);
  if (i < 0) return 0;
  const base = y === 1 ? i * 100 + 100 : i * 50 + 50;
  return Math.min(double ? base * 2 : base, MAX_DPI);
}

const send = (dev, buf) => dev.sendFeatureReport(buf[0], buf.subarray(1));

async function receive(dev, reportId) {
  const b = new Uint8Array((await dev.receiveFeatureReport(reportId)).buffer);
  if (b[0] === reportId) return b;                  // report ID was echoed back
  const withId = new Uint8Array(b.length + 1);
  withId[0] = reportId;
  withId.set(b, 1);
  return withId;
}

export const attackShark = {
  async init(dev) {
    if (!dev.collections.some(c => c.usagePage >= 0xff00))
      throw new Error("Configuration interface not found — try picking the other entry for this mouse in the list.");

    const cfg = await receive(dev, DPI_REPORT).catch(() => null);
    const live = cfg && cfg[1] === 0x38;
    return {
      cfg: live ? cfg : DPI_TEMPLATE.slice(),
      warning: live ? null : "Could not read the current settings from this mouse",
      // Writing DPI rewrites the whole 56-byte block. If we never read the real one,
      // saving would replace every DPI stage, stage colour and sensor option with the
      // factory template — so the UI must ask before the first write.
      needsConfirm: !live,
      confirmText:
        "The current settings could not be read from this mouse.\n\n" +
        "Changing DPI will overwrite ALL DPI stages, stage colours and sensor options " +
        "with factory defaults.\n\nContinue?",
    };
  },

  /** Active DPI stage (0..7) */
  stage: s => Math.min(Math.max(s.cfg[24], 1), 8) - 1,

  async readDpi(dev, s) {
    const b = s.cfg, st = this.stage(s);
    const value = bytesToDpi(b[8 + st], b[16 + st], !!(b[6] & (1 << st)));
    return { min: MIN_DPI, max: MAX_DPI, step: 50, value: value || 800 };
  },

  async writeDpi(dev, s, dpi) {
    const b = s.cfg, st = this.stage(s), e = dpiToBytes(dpi);
    b[8 + st] = e.x;
    b[16 + st] = e.y;
    b[6] = e.double ? b[6] | (1 << st) : b[6] & ~(1 << st);
    b[7] = b[6];                                    // ponytail: the docs say [7] mirrors [6]
    const c = checksum(b);
    b[50] = c >> 8;
    b[51] = c & 0xff;

    await send(dev, b);
    const fresh = await receive(dev, DPI_REPORT).catch(() => null);
    if (fresh && fresh[1] === 0x38) s.cfg = fresh;   // if the device answers reads, trust the device
    return (await this.readDpi(dev, s)).value;
  },

  async readRate(dev, s) {
    const b = await receive(dev, RATE_REPORT).catch(() => null);
    return { options: RATES, value: b && b[1] === 0x09 ? b[3] : 0 };
  },

  async writeRate(dev, s, raw) {
    const b = new Uint8Array(9);
    b[0] = RATE_REPORT; b[1] = 0x09; b[2] = 0x01; b[3] = raw; b[4] = 0xff - raw;
    await send(dev, b);
    return (await this.readRate(dev, s)).value || raw;   // if reads are unsupported, show what we wrote
  },
};

/** PAW3311 DPI encoding table (upstream dpi-map.ts) — index × 50 + 50 = DPI */
export const DPI_3311 = [
  1, 2, 3, 4, 5, 6, 8, 9, 10, 11, 12, 14, 15, 16, 17, 18, 19, 21, 22, 23, 24, 25, 27, 28,
  29, 30, 31, 32, 34, 35, 36, 37, 38, 39, 41, 42, 43, 44, 45, 47, 48, 49, 50, 51, 52, 54, 55, 56,
  57, 58, 59, 61, 62, 63, 64, 65, 67, 68, 69, 70, 71, 72, 74, 75, 76, 77, 78, 79, 81, 82, 83, 84,
  85, 87, 88, 89, 90, 91, 92, 94, 95, 96, 97, 98, 99, 101, 102, 103, 104, 105, 107, 108, 109, 110, 111, 112,
  114, 115, 116, 117, 118, 119, 121, 122, 123, 124, 125, 127, 128, 129, 130, 131, 132, 134, 135, 136, 137, 138, 139, 141,
  142, 143, 144, 145, 147, 148, 149, 150, 151, 152, 154, 155, 156, 157, 158, 159, 161, 162, 163, 164, 165, 167, 168, 169,
  170, 171, 172, 174, 175, 176, 177, 178, 179, 181, 182, 183, 184, 185, 187, 188, 189, 190, 191, 192, 194, 195, 196, 197,
  198, 199, 201, 202, 203, 204, 205, 207, 208, 209, 210, 211, 212, 214, 215, 216, 217, 218, 219, 221, 222, 223, 224, 225,
  227, 228, 229, 230, 231, 232, 234, 235, 118, 119, 121, 122, 123, 124, 125, 127, 128, 129, 130, 131, 132, 134, 135, 136,
  137, 138, 139, 141,
];
