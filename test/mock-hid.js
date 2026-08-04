/**
 * Minimal in-memory stand-in for a WebHID `HIDDevice`.
 *
 * It records every byte a driver puts on the wire, so tests can assert the exact
 * packet instead of merely "it did not throw". `bytes` never contains the report
 * ID — same as the real API, where the ID is a separate argument.
 */
export function createMockDevice({
  collections = [{ usagePage: 0xff00, usage: 0x02 }],
  vendorId = 0x0000,
  productId = 0x0000,
  onOutput = () => null,          // ({ reportId, bytes }) → { reportId, bytes } | null
  onFeatureRead = () => null,     // (reportId, sent) → number[] | null
} = {}) {
  const sent = [];
  const listeners = new Set();

  const device = {
    vendorId, productId, collections, sent,
    productName: "Mock Mouse",
    opened: false,

    async open() { device.opened = true; },
    async close() { device.opened = false; },

    addEventListener(type, fn) { if (type === "inputreport") listeners.add(fn); },
    removeEventListener(type, fn) { listeners.delete(fn); },

    async sendReport(reportId, data) {
      sent.push({ kind: "output", reportId, bytes: Array.from(data) });
      const reply = onOutput({ reportId, bytes: Array.from(data) });
      if (!reply) return;
      setTimeout(() => {
        const view = new DataView(Uint8Array.from(reply.bytes).buffer);
        for (const fn of [...listeners]) fn({ reportId: reply.reportId, data: view });
      }, 0);
    },

    async sendFeatureReport(reportId, data) {
      sent.push({ kind: "feature", reportId, bytes: Array.from(data) });
    },

    async receiveFeatureReport(reportId) {
      const reply = onFeatureRead(reportId, sent);
      if (!reply) throw new Error("mock: no feature report " + reportId);
      return new DataView(Uint8Array.from(reply).buffer);
    },
  };
  return device;
}

/** Pad an array with zeroes to an exact length. */
export const pad = (arr, len) => Array.from({ length: len }, (_, i) => arr[i] ?? 0);

/** Every output/feature packet a driver emitted, newest last. */
export const writes = dev => dev.sent.filter(s => s.kind === "feature" || s.kind === "output");
