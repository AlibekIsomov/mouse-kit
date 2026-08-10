/**
 * Supported brands and models.
 *
 * Detection is **by vendor ID**, so the `models` list is informational only —
 * no code depends on it. A model that is not listed still works as long as its
 * brand VID matches; the exact name comes from the device itself (`productName`).
 *
 * status:
 *   ready — protocol implemented and verified
 *   beta  — protocol implemented, not yet tested on real hardware
 *   soon  — detected only; connecting sends us a report
 */
export const BRANDS = [
  {
    name: "Logitech / Logitech G", vids: [0x046d], status: "ready",
    note: "Any model that speaks HID++ 2.0 — wired, Lightspeed, Unifying, Bolt",
    models: ["G102 / G203", "G304 / G305", "G402", "G502 Hero", "G502 X", "G603", "G703",
             "G Pro Wireless", "G Pro X Superlight", "G Pro X Superlight 2", "G903",
             "MX Master 3S", "MX Anywhere 3", "M720"],
  },
  {
    name: "Razer", vids: [0x1532], status: "beta",
    note: "OpenRazer protocol — 90-byte feature report, XOR checksum",
    models: ["DeathAdder V3", "Viper V3 Pro", "Basilisk V3", "Naga V2 Pro",
             "Naga V2 HyperSpeed", "Cobra", "Orochi V2"],
  },
  {
    name: "Attack Shark", vids: [0x1d57], status: "beta",
    note: "X11 protocol (Beken BK3630 + PAW3311). DPI may read wrong on models with a different sensor",
    models: ["X11", "X11 Pro", "X11 SE", "X1", "X3", "X3 Pro", "X3 Max", "X6",
             "X8 SE", "X8 Plus", "X8 Pro", "R1", "R11", "R11 Ultra"],
  },
  {
    name: "ATK", vids: [0x373b], status: "beta",
    note: "ATK Hub protocol (COMPX) — DPI is a plain 16-bit value, no sensor table needed",
    // A98 / A98 Ultra deliberately absent — ATK's own catalogue registers those as
    // keyboards (they carry a full key matrix), so they do not belong in a mouse list.
    models: ["A9", "A9 SE", "A9 Plus", "A9 Pro", "A9 Pro Max", "A9 Ultra", "A9 Ultra Max 2.0",
             "A9 Ultimate", "A9 Air", "A9 Mini", "A9 X", "U2 SE", "U2 Plus",
             "Y9 SE", "Y9 Plus", "X1", "X1 Lite", "X1 S", "F1", "F1 Pro Max"],
  },
  {
    name: "VXE", vids: [0x373b, 0x3554], status: "beta",
    note: "Same protocol as ATK",
    models: ["R1", "R1 SE", "R1 Pro", "R1S", "R1S+", "R2", "R2 SE", "V3", "V3 NK", "X3", "Mad R"],
  },
  {
    name: "VGN", vids: [0x3554], status: "beta", note: "ATK protocol is attempted",
    models: ["F1 Pro", "F1 Pro Max", "Dragonfly F1", "Dragonfly F1 Moba"],
  },
  {
    name: "Darmoshark", vids: [0x3554], status: "beta", note: "ATK protocol is attempted",
    models: ["M3", "M3s", "M5", "N3"],
  },
  {
    name: "HyperX", vids: [0x0951, 0x03f0], status: "beta",
    note: "Dart-era and Haste 2 / Saga-era NGenuity protocols — the Haste 2 family cannot be read, " +
      "so defaults are shown until you write. Oldest generation (Surge, FPS Pro, Core) is detected only",
    models: ["Pulsefire Haste", "Pulsefire Haste 2", "Pulsefire Dart", "Pulsefire Saga Pro"],
  },

  // Detected only — protocol not implemented yet
  { name: "Ajazz",     vids: [0x3554], status: "soon", models: ["AJ199", "AJ139", "AJ159"] },
  { name: "Machenike", vids: [0x3554], status: "soon", models: ["M7", "M6", "M8"] },
  {
    name: "Lamzu", vids: [0x3554, 0x30fa], status: "soon",
    models: ["Atlantis", "Atlantis Mini", "Maya", "Maya X", "Thorn", "Inca"],
  },
  {
    name: "Glorious", vids: [0x258a], status: "soon", note: "SinoWealth — documented in libratbag",
    models: ["Model O", "Model D", "Model I"],
  },
  { name: "Redragon",    vids: [0x258a], status: "soon", models: ["M711 Cobra", "M908 Impact", "M810 Pro"] },
  { name: "Pulsar",      vids: [0x3710], status: "soon", models: ["X2", "X2V2", "Xlite V3", "Feinmann F01"] },
  {
    name: "SteelSeries", vids: [0x1038], status: "soon",
    models: ["Rival 3", "Rival 600", "Aerox 3", "Aerox 5", "Prime Wireless"],
  },
  {
    name: "Corsair", vids: [0x1b1c], status: "soon",
    models: ["M65 RGB Ultra", "Sabre RGB Pro", "Katar Pro", "Darkstar"],
  },
  { name: "ROCCAT",        vids: [0x1e7d], status: "soon", models: ["Kone Pro", "Kone XP", "Burst Pro"] },
  { name: "Cooler Master", vids: [0x2516], status: "soon", models: ["MM711", "MM720", "MM712"] },
  { name: "ASUS ROG",      vids: [0x0b05], status: "soon", models: ["Gladius III", "Keris Wireless", "Harpe Ace"] },
  { name: "Endgame Gear",  vids: [0x3367], status: "soon", models: ["XM1r", "OP1 8k", "XM2we"] },
  { name: "Xtrfy",         vids: [0x30fa], status: "soon", models: ["M4", "M42", "MZ1"] },
  { name: "A4Tech / Bloody", vids: [0x09da], status: "soon", models: ["W60 Max"] },
  { name: "Genius",        vids: [0x0458], status: "soon" },
  { name: "Trust",         vids: [0x145f], status: "soon" },
  { name: "Mad Catz",      vids: [0x0738], status: "soon" },
  { name: "Microsoft",     vids: [0x045e], status: "soon" },
  {
    name: "Zowie", vids: [0x1af3], status: "soon", note: "DPI is set with a button — no software",
    models: ["EC2-C", "FK1-B", "S2"],
  },
  { name: "Pixart (OEM)",  vids: [0x093a], status: "soon" },
  { name: "SinoWealth (OEM)", vids: [0x258a], status: "soon" },
  { name: "Sunplus (OEM)", vids: [0x1bcf], status: "soon" },
];

/** VID → brand name. When several brands share a VID their names are joined. */
export function buildVidMap(brands) {
  const map = {};
  for (const b of brands) for (const vid of b.vids) map[vid] = map[vid] ? map[vid] + " / " + b.name : b.name;
  return map;
}

export const VENDORS = buildVidMap(BRANDS);

/** Filter for requestDevice so the picker only lists mice. */
export const VENDOR_FILTERS = Object.keys(VENDORS).map(vid => ({ vendorId: +vid }));

/** Best status among the brands that share a vendor ID: ready > beta > soon. */
export function statusForVendor(vendorId) {
  const sharing = BRANDS.filter(b => b.vids.includes(vendorId));
  if (sharing.some(b => b.status === "ready")) return "ready";
  if (sharing.some(b => b.status === "beta")) return "beta";
  return "soon";
}
