/**
 * Razer — 90-byte feature report (OpenRazer protocol)
 *
 * [0]      status          in a reply: 0x02 = success, 0x05 = not supported by this model
 * [1]      transactionId   varies per model — discovered automatically in init()
 * [2..3]   remainingPackets
 * [4]      protocolType
 * [5]      dataSize
 * [6]      commandClass
 * [7]      commandId
 * [8..87]  arguments
 * [88]     checksum = XOR of bytes [2..87]
 * [89]     reserved
 */

const sleep = ms => new Promise(r => setTimeout(r, ms));

const TRANSACTION_IDS = [0x1f, 0x3f, 0xff, 0x08];
const VARSTORE = 0x01;                              // persist the setting to onboard memory

/** divisor = 1000 / Hz */
export const RAZER_HZ = [1000, 500, 250, 125];

async function command(dev, tid, cls, id, size, args = []) {
  const p = new Uint8Array(90);
  p[1] = tid; p[5] = size; p[6] = cls; p[7] = id;
  args.forEach((v, i) => { p[8 + i] = v; });

  let crc = 0;
  for (let i = 2; i < 88; i++) crc ^= p[i];
  p[88] = crc;

  await dev.sendFeatureReport(0x00, p);
  await sleep(40);                                  // ponytail: fixed wait; some models are slower

  const r = new Uint8Array((await dev.receiveFeatureReport(0x00)).buffer);
  const withId = r.length === 91;                   // some platforms echo the report ID back
  const status = r[withId ? 1 : 0];
  if (status !== 0x02)
    throw new Error("Razer status " + status + (status === 0x05 ? " (not supported by this model)" : ""));
  const argsOffset = withId ? 9 : 8;
  return r.slice(argsOffset, argsOffset + 80);
}

export const razer = {
  async init(dev) {
    if (!dev.collections.some(c => c.usagePage >= 0xff00))
      throw new Error("Razer configuration interface not found — try picking the other Razer entry in the list.");

    for (const tid of TRANSACTION_IDS) {
      const r = await command(dev, tid, 0x00, 0x81, 0x02).catch(() => null);   // firmware version
      if (r) return { tid, firmware: r[0] + "." + r[1] };
    }
    throw new Error("Razer did not respond (no working transaction ID).");
  },

  async readDpi(dev, s) {
    const r = await command(dev, s.tid, 0x04, 0x85, 0x02, [VARSTORE, 0x00]);
    // ponytail: the command that reports the sensor limit is model-specific, so we offer a wide
    // range. The device clamps it, and we read back after writing to show the real value.
    return { min: 100, max: 26000, step: 50, value: (r[1] << 8) | r[2] };
  },

  async writeDpi(dev, s, dpi) {
    await command(dev, s.tid, 0x04, 0x05, 0x07, [VARSTORE, dpi >> 8, dpi & 0xff, dpi >> 8, dpi & 0xff, 0, 0]);
    return (await this.readDpi(dev, s)).value;
  },

  async readRate(dev, s) {
    const r = await command(dev, s.tid, 0x00, 0x85, 0x01, [0x00]);
    return { options: RAZER_HZ.map(hz => ({ raw: 1000 / hz, hz })), value: r[0] };
  },

  async writeRate(dev, s, raw) {
    await command(dev, s.tid, 0x00, 0x05, 0x01, [raw]);
    return (await this.readRate(dev, s)).value;
  },
};
