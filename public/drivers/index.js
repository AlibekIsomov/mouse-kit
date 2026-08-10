/**
 * Driver registry: VID → driver.
 *
 * Every driver fulfils this contract:
 *
 *   init(dev)                 → state         throws if unsupported;
 *                                             an optional `warning` field is surfaced in the UI
 *   readDpi(dev, state)       → { min, max, step, value } | null
 *   writeDpi(dev, state, dpi) → new DPI       (read back from the device)
 *   readRate(dev, state)      → { options: [{ raw, hz }], value } | null
 *   writeRate(dev, state, raw)→ new raw       (read back from the device)
 *   rateNote?(state)          → note text     (optional)
 *
 * Every write is followed by a read, so the number on screen is the value that is
 * actually on the device.
 *
 * To add a brand: write drivers/<brand>.js and add one line to the table below.
 */
import { logitech } from "./logitech.js";
import { razer } from "./razer.js";
import { attackShark } from "./attackshark.js";
import { atk } from "./atk.js";
import { hyperx } from "./hyperx.js";

export const DRIVERS = {
  0x046d: logitech,     // Logitech / Logitech G
  0x1532: razer,        // Razer
  0x1d57: attackShark,  // Attack Shark (X11 family)
  0x373b: atk,          // ATK, VXE
  0x3554: atk,          // VXE, VGN, Darmoshark (init() probes before writing anything)
  0x0951: hyperx,       // HyperX (Kingston era)
  0x03f0: hyperx,       // HyperX (HP era — init() probes before writing anything)
};
