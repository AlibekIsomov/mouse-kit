/**
 * Safety rules that sit between the UI and the drivers.
 *
 * The drivers only speak protocol; every decision about *whether* a write should
 * happen at all lives here, in pure functions, so it can be tested without a device.
 */

/**
 * Writing is enabled straight away only for a protocol that has been checked
 * against the vendor's own implementation. Anything still marked beta stays
 * read-only until the person in front of the mouse says otherwise.
 */
export function needsWriteConsent(status) {
  return status !== "ready";
}

export function consentText(brand, status) {
  if (status === "beta") {
    return `The ${brand} protocol was reconstructed from the vendor's own driver but has not been ` +
      `verified on real hardware. Reading is safe. Writing sends configuration commands — ` +
      `no firmware or bootloader command is ever sent, so the mouse cannot be re-flashed, ` +
      `but a wrong value may need resetting with the vendor software.`;
  }
  return `No protocol has been written for this device yet.`;
}

/**
 * A device may snap a requested value to its own grid — that is fine. A value that
 * lands far away means we encoded something the firmware read differently, and the
 * safe reaction is to put the old value back rather than leave the mouse in a state
 * the user did not ask for.
 *
 * `step` is the device's own granularity, so the tolerance follows the hardware
 * instead of a guessed percentage.
 */
export function verifyWrite({ requested, got, step = 1, label = "value" }) {
  if (!Number.isFinite(got) || got <= 0)
    return { ok: false, rollback: true, message: `The mouse did not report a ${label} back.` };

  const drift = Math.abs(got - requested);
  if (drift === 0) return { ok: true, rollback: false, message: "" };

  if (drift <= step)
    return { ok: true, rollback: false, message: `Snapped to the nearest ${label} the mouse supports.` };

  return {
    ok: false,
    rollback: true,
    message: `Asked for ${requested} but the mouse reports ${got} — restoring the previous ${label}.`,
  };
}

/** What we keep so the user can always get back to how the mouse arrived. */
export function makeSnapshot({ device, dpi, rate, raw }) {
  return {
    savedAt: new Date().toISOString(),
    device: {
      name: device.productName || null,
      vendorId: device.vendorId,
      productId: device.productId,
    },
    dpi: dpi?.value ?? null,
    reportRateRaw: rate?.value ?? null,
    reportRateHz: rate?.options?.find(o => o.raw === rate.value)?.hz ?? null,
    raw: raw ? Array.from(raw) : null,
  };
}

export const snapshotFilename = device =>
  `mousekit-backup-${(device.productName || "mouse").replace(/[^\w.-]+/g, "-").toLowerCase()}-` +
  `${device.vendorId.toString(16)}-${device.productId.toString(16)}.json`;
