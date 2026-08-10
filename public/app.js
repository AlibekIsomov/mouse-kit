import { BRANDS, VENDORS, VENDOR_FILTERS, statusForVendor } from "./devices.js";
import { DRIVERS } from "./drivers/index.js";
import { needsWriteConsent, consentText, verifyWrite, makeSnapshot, snapshotFilename } from "./safety.js";
import { imageFor, MOUSE_SVG, brandBadge } from "./images.js";

const $ = id => document.getElementById(id);
const log = (...a) => console.log("[mousekit]", ...a);

// A silent failure here turns into a blank page — surface it instead.
window.addEventListener("error", e => log("uncaught error:", e.error ?? e.message));
window.addEventListener("unhandledrejection", e => {
  log("unhandled rejection:", e.reason);
  toast("Unexpected error: " + (e.reason?.message ?? e.reason), true);
});
const show = (id, on = true) => $(id)?.classList.toggle("hide", !on);
const hex4 = n => "0x" + n.toString(16).padStart(4, "0");

/** Full HID shape of one interface: usage pages and every report ID it accepts. */
const hidDetail = d => d.collections.map(c => ({
  usagePage: hex4(c.usagePage),
  usage: hex4(c.usage),
  in: (c.inputReports ?? []).map(r => r.reportId),
  out: (c.outputReports ?? []).map(r => r.reportId),
  feat: (c.featureReports ?? []).map(r => r.reportId),
}));
const esc = s => String(s).replace(/[<>&]/g, c => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" }[c]));

let toastTimer;
function toast(msg, bad = false) {
  const el = $("toast");
  if (!el) return;
  el.textContent = msg;
  el.className = "toast show" + (bad ? " err" : "");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (el.className = "toast"), 3200);
}

/* ---------- state ---------- */
let device = null, driver = null, state = null;
let snapshot = null;        // how the mouse was when we found it
let writeEnabled = false;   // false until a "ready" driver or the user opts in

let brandFilter = "supported"; // "supported", "all", "soon"
let brandSearchQuery = "";

function reset() {
  ["v-device-panel", "v-device", "v-safety", "v-dpi", "v-rate", "v-soon", "v-suggest", "demo-banner"].forEach(id => show(id, false));
  show("v-connect"); show("v-brands");
  if ($("conn")) $("conn").textContent = "";
  if (device?.opened) device.close();
  device = driver = state = snapshot = null;
  writeEnabled = false;
  isDemoMode = false;
}

/* ---------- connecting ---------- */
async function connect(showAll) {
  let picked;
  try {
    picked = await navigator.hid.requestDevice({ filters: showAll ? [] : VENDOR_FILTERS });
  } catch (e) { log("requestDevice failed:", e); return toast(e.message, true); }
  if (!picked.length) return log("picker closed without a selection");

  log("picked:", picked.map(d => ({ name: d.productName, vid: hex4(d.vendorId), pid: hex4(d.productId), hid: hidDetail(d) })));

  // One physical mouse exposes several HID interfaces; the settings usually live on
  // a vendor collection (usagePage 0xff00+), but WHICH vendor interface differs per
  // dongle — so probe every granted interface until one answers, vendor pages first.
  const isVendor = d => d.collections.some(c => c.usagePage >= 0xff00);
  const candidates = [...picked].sort((a, b) => isVendor(b) - isVendor(a));
  device = candidates[0];
  renderDevice();

  driver = DRIVERS[device.vendorId];
  if (!driver) return unsupported("No protocol has been written for this brand yet.");
  log("driver found for", VENDORS[device.vendorId]);

  state = null;
  let firstError = null;                 // vendor interfaces are probed first, so the
  for (const candidate of candidates) {  // first error is the informative one to report
    try {
      await candidate.open();
      log("probing interface:", hidDetail(candidate));
      state = await driver.init(candidate);
      device = candidate;
      log("init ok:", state);
      break;
    } catch (e) {
      firstError ??= e;
      log("interface failed:", e.message);
      if (candidate.opened) await candidate.close().catch(() => {});
    }
  }
  if (!state) return unsupported(firstError?.message ?? "No interface answered.");
  if (state.warning) toast(state.warning, true);

  await loadDpi();
  await loadRate();

  const nothing = $("v-dpi").classList.contains("hide") && $("v-rate").classList.contains("hide");
  log("dpi visible:", !$("v-dpi").classList.contains("hide"), "rate visible:", !$("v-rate").classList.contains("hide"));
  if (nothing) return unsupported("The device answered, but returned no DPI or report-rate values.");

  await takeSnapshot();
  renderSafety();
  toast("Connected ✓");
  log("connected ✓");
}

/* ---------- safety ---------- */

/** Read everything we can before touching anything, so the original is always recoverable. */
async function takeSnapshot() {
  const dpi = await driver.readDpi(device, state).catch(() => null);
  const rate = await driver.readRate(device, state).catch(() => null);
  snapshot = makeSnapshot({ device, dpi, rate, raw: state.cfg });
}

function renderSafety() {
  const status = statusForVendor(device.vendorId);
  writeEnabled = !needsWriteConsent(status);

  show("safety-why", !writeEnabled);
  if (!writeEnabled) $("safety-why").textContent = consentText(VENDORS[device.vendorId] || "this", status);
  show("safety-consent", !writeEnabled);
  $("safety-enable").checked = writeEnabled;

  $("safety-state").textContent = writeEnabled
    ? "Verified protocol — changes are applied and read back."
    : "Read-only. Turn on the switch above to allow changes.";

  show("btn-restore", false);
  show("v-safety");
  setControlsEnabled(writeEnabled);
}

function setControlsEnabled(on) {
  $("dpi-range").disabled = !on;
  [...$("rate-seg").children].forEach(b => (b.disabled = !on));
}

$("safety-enable").onchange = e => {
  writeEnabled = e.target.checked;
  setControlsEnabled(writeEnabled);
  $("safety-state").textContent = writeEnabled
    ? "Changes allowed. Every write is read back and undone if the mouse disagrees."
    : "Read-only. Turn on the switch above to allow changes.";
};

$("btn-backup").onclick = () => {
  const blob = new Blob([JSON.stringify(snapshot, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = snapshotFilename(device);
  a.click();
  URL.revokeObjectURL(a.href);
  toast("Backup saved ✓");
};

$("btn-restore").onclick = async () => {
  if (!snapshot) return;
  try {
    if (snapshot.dpi) await driver.writeDpi(device, state, snapshot.dpi);
    if (snapshot.reportRateRaw) await driver.writeRate(device, state, snapshot.reportRateRaw);
    await loadDpi();
    await loadRate();
    setControlsEnabled(writeEnabled);
    show("btn-restore", false);
    toast("Original settings restored ✓");
  } catch (e) {
    toast("Could not restore: " + e.message, true);
  }
};

/* ---------- product shots ---------- */

/** A photo if we have a verified one, otherwise the drawn silhouette. Same box either way. */
function shotHtml(brand, model) {
  const url = imageFor(brand, model);
  return url
    ? `<img loading="lazy" alt="${esc(model)}" src="${esc(url)}">`
    : MOUSE_SVG;
}

/** A photo that fails to load falls back to the silhouette. Inline handlers are CSP-blocked. */
function armShotFallbacks(root) {
  root.querySelectorAll(".shot img").forEach(img =>
    img.addEventListener("error", () => { img.closest(".shot").innerHTML = MOUSE_SVG; }, { once: true }));
}

function renderDevice() {
  const brand = VENDORS[device.vendorId] || "Unknown brand";
  if ($("conn")) $("conn").textContent = "● " + brand;
  if ($("dev-brand-tag")) $("dev-brand-tag").textContent = brand.toUpperCase();
  if ($("dev-name-title")) $("dev-name-title").textContent = device.productName || brand;

  $("dev-shot").innerHTML = shotHtml(brand, device.productName || "");
  armShotFallbacks($("dev-shot").parentElement);
  $("dev-rows").innerHTML = [
    ["Name", device.productName || "—"],
    ["Brand", brand],
    ["Vendor ID", hex4(device.vendorId)],
    ["Product ID", hex4(device.productId)],
  ].map(([k, v]) => `<div class="row"><span>${k}</span><span>${esc(v)}</span></div>`).join("");
  show("v-connect", false); show("v-brands", false);
  show("v-device-panel", true); show("v-device", true);
}

/**
 * A driver may report that it could not read the device's real configuration.
 * Writing then replaces settings we never saw, so ask once before the first write.
 */
function writeAllowed() {
  if (isDemoMode) return true;
  if (!writeEnabled) {
    toast("Read-only — turn on “Allow changes” first", true);
    return false;
  }
  if (!state.needsConfirm || state.confirmed) return true;
  if (!confirm(state.confirmText || "The current settings could not be read. Overwrite them?")) return false;
  state.confirmed = true;
  $("dpi-warn").classList.add("hide");
  return true;
}

/* ---------- DPI ---------- */
async function loadDpi() {
  const dpi = await driver.readDpi(device, state).catch(() => null);
  if (!dpi) return;

  const range = $("dpi-range");
  Object.assign(range, { min: dpi.min, max: dpi.max, step: dpi.step, value: dpi.value, disabled: false });
  $("dpi-val").textContent = dpi.value;
  $("dpi-min").textContent = dpi.min;
  $("dpi-max").textContent = dpi.max;
  show("v-dpi");

  if (state.needsConfirm) {
    $("dpi-warn").textContent =
      "Current settings could not be read — saving will reset the other DPI stages to factory defaults.";
    show("dpi-warn");
  }

  range.oninput = () => {
    $("dpi-val").textContent = range.value;
    const presetGroup = $("dpi-presets-group");
    if (presetGroup) {
      presetGroup.querySelectorAll(".preset-btn").forEach(b => {
        b.classList.toggle("active", b.dataset.dpi === range.value);
      });
    }
  };
  range.onchange = async () => {
    const wanted = Math.min(Math.max(+range.value, dpi.min), dpi.max);   // never send out-of-range values
    if (!writeAllowed()) { range.value = dpi.value; $("dpi-val").textContent = dpi.value; return; }

    const previous = dpi.value;
    range.disabled = true;
    try {
      let got = await driver.writeDpi(device, state, wanted);
      const check = verifyWrite({ requested: wanted, got, step: dpi.step, label: "DPI" });

      if (check.rollback) {
        got = await driver.writeDpi(device, state, previous).catch(() => got);
        toast(check.message, true);
      } else {
        toast(got + " DPI ✓" + (check.message ? " — " + check.message : ""));
        show("btn-restore", got !== snapshot?.dpi);
      }
      range.value = got;
      dpi.value = got;
      $("dpi-val").textContent = got;
    } catch (e) {
      toast("Could not set DPI: " + e.message, true);
      range.value = previous;
      $("dpi-val").textContent = previous;
    }
    range.disabled = false;
  };
}

/* ---------- report rate ---------- */
async function loadRate() {
  const rate = await driver.readRate(device, state).catch(() => null);
  if (!rate || !rate.options.length) return;

  const seg = $("rate-seg");
  seg.innerHTML = "";
  const mark = value => [...seg.children]
    .forEach((btn, i) => btn.setAttribute("aria-pressed", String(rate.options[i].raw === value)));

  for (const option of rate.options) {
    const btn = document.createElement("button");
    btn.textContent = option.hz + " Hz";
    btn.onclick = async () => {
      if (!writeAllowed()) return;
      const previous = rate.value;
      [...seg.children].forEach(b => (b.disabled = true));
      try {
        let got = await driver.writeRate(device, state, option.raw);
        if (got !== option.raw) {                       // the mouse refused or picked another rate
          got = await driver.writeRate(device, state, previous).catch(() => got);
          toast(`Asked for ${option.hz} Hz but the mouse reports ` +
                `${rate.options.find(o => o.raw === got)?.hz ?? "?"} Hz — restoring the previous rate.`, true);
        } else {
          toast(option.hz + " Hz ✓");
          show("btn-restore", got !== snapshot?.reportRateRaw);
        }
        rate.value = got;
        mark(got);
      } catch (e) {
        toast("Could not apply: " + e.message, true);
        mark(previous);
      }
      [...seg.children].forEach(b => (b.disabled = false));
    };
    seg.appendChild(btn);
  }
  mark(rate.value);

  $("rate-note").textContent = driver.rateNote?.(state) ?? "";
  show("v-rate");
}

/* ---------- unsupported device ---------- */
function unsupported(why) {
  log("unsupported:", why, { vid: hex4(device.vendorId), pid: hex4(device.productId), name: device.productName });
  show("v-device-panel", false);
  show("v-soon");
  $("soon-brand").textContent = (device.productName || VENDORS[device.vendorId] || "This device") + " — not ready yet";
  $("soon-why").textContent = why;
  $("soon-diag").textContent = JSON.stringify({
    vid: hex4(device.vendorId),
    pid: hex4(device.productId),
    name: device.productName,
    collections: hidDetail(device),
  }, null, 1);
  report(why);
}

/** The Telegram message is sent from the server only — the bot token must never reach the browser. */
async function report(why) {
  try {
    const res = await fetch("/api/report", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        vendorId: device.vendorId,
        productId: device.productId,
        productName: String(device.productName || "").slice(0, 120),
        brand: VENDORS[device.vendorId] || null,
        reason: String(why).slice(0, 200),
        collections: device.collections.map(c => hex4(c.usagePage) + ":" + hex4(c.usage)).join(" ").slice(0, 200),
        // The full report-ID map is what makes an unseen model debuggable without the hardware.
        hid: JSON.stringify(hidDetail(device)).slice(0, 800),
        ua: navigator.userAgent.slice(0, 200),
      }),
    });
    $("soon-msg").textContent = res.ok
      ? "We received the details of your device — this model is now on the list."
      : "Could not send the details, but the model has been noted.";
  } catch {
    $("soon-msg").textContent = "Could not send the details (no connection to the server).";
  }
}

/* ---------- brand list ---------- */
const toSlug = name => String(name).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

function renderBrands() {
  const chip = b => `<span class="chip ${b.status}" data-brand="${toSlug(b.name)}">${esc(b.name)}</span>`;
  
  const supportedCount = BRANDS.filter(b => b.status !== "soon").length;
  
  // Update Tab Labels & Active States
  if ($("tab-supported")) $("tab-supported").textContent = `Supported (${supportedCount})`;
  if ($("tab-all")) $("tab-all").textContent = `All ${BRANDS.length} Brands`;
  if ($("brand-count-badge")) $("brand-count-badge").textContent = `${BRANDS.length} Brands`;

  $("tab-supported")?.classList.toggle("active", brandFilter === "supported");
  $("tab-all")?.classList.toggle("active", brandFilter === "all");

  // Determine which brands to display
  let filtered = BRANDS;
  if (brandFilter === "supported") {
    filtered = BRANDS.filter(b => b.status !== "soon");
  }

  // Apply search query filter if present
  if (brandSearchQuery) {
    const q = brandSearchQuery.toLowerCase();
    filtered = filtered.filter(b => 
      b.name.toLowerCase().includes(q) || 
      (b.models && b.models.some(m => m.toLowerCase().includes(q)))
    );
  }

  $("brand-chips").innerHTML = filtered.map(chip).join("");
  if ($("brand-rest")) $("brand-rest").classList.add("hide"); // kept for DOM compatibility

  // Model list: render all matching brands in filtered set
  const brandListEl = $("brand-list");
  if (brandListEl) {
    brandListEl.innerHTML = filtered.map(b => {
      const slug = toSlug(b.name);
      const hasModels = b.models && b.models.length > 0;
      const modelGridHtml = hasModels
        ? `<div class="model-grid">${b.models.map(m => `
            <div class="model-card" data-brand="${esc(b.name)}" data-model="${esc(m)}">
              <div class="shot">${shotHtml(b.name, m)}</div>
              <div class="name">${esc(m)}</div>
            </div>`).join("")}</div>`
        : `<div class="brand-note">VID ${b.vids.map(hex4).join(", ")} — All models supported for hardware detection</div>`;

      return `
        <div class="brand" data-brand="${slug}">
          <div class="brand-head">
            <span class="brand-logo">${esc(brandBadge(b.name).initials)}</span>
            ${esc(b.name)}
            <span class="brand-status ${b.status}"></span>
          </div>
          ${b.note ? `<div class="brand-note">${esc(b.note)}</div>` : ""}
          ${modelGridHtml}
        </div>`;
    }).join("");

    // Set badge colors via CSSOM to avoid CSP style-src inline attribute restrictions
    brandListEl.querySelectorAll(".brand-logo").forEach((el, i) => {
      if (filtered[i]) {
        el.style.setProperty("--logo", brandBadge(filtered[i].name).colour);
      }
    });

    armShotFallbacks(brandListEl);
  }
}

// Delegate model-card click to open interactive demo for that mouse
if ($("brand-list")) {
  $("brand-list").onclick = e => {
    const card = e.target.closest(".model-card");
    if (!card) return;
    const b = card.getAttribute("data-brand");
    const m = card.getAttribute("data-model");
    if (b && m) launchDemoForModel(b, m);
  };
}

// Bind brand filter tabs & search input
if ($("tab-supported")) $("tab-supported").onclick = () => { brandFilter = "supported"; renderBrands(); };
if ($("tab-all")) $("tab-all").onclick = () => { brandFilter = "all"; renderBrands(); };

if ($("brand-search")) {
  $("brand-search").oninput = e => {
    brandSearchQuery = e.target.value.trim();
    renderBrands();
  };
}

// Navbar link smooth navigation
if ($("nav-brands")) {
  $("nav-brands").onclick = e => {
    e.preventDefault();
    if (!device) {
      show("v-connect", true);
      show("v-brands", true);
      show("v-device-panel", false);
      $("v-brands").scrollIntoView({ behavior: "smooth" });
    } else {
      show("v-device-panel", true);
      $("v-device-panel").scrollIntoView({ behavior: "smooth" });
    }
    show("v-suggest", false);
    $("nav-brands").classList.add("active");
    $("nav-suggest")?.classList.remove("active");
  };
}

if ($("nav-suggest")) {
  $("nav-suggest").onclick = e => {
    e.preventDefault();
    show("v-suggest", true);
    $("nav-suggest").classList.add("active");
    $("nav-brands")?.classList.remove("active");
    $("v-suggest").scrollIntoView({ behavior: "smooth" });
  };
}

/* ---------- Interactive Demo Mode ---------- */
let isDemoMode = false;

function launchDemoForModel(brandName = "Attack Shark", modelName = "R11") {
  isDemoMode = true;
  const cleanBrand = brandName.split("/")[0].trim();
  device = {
    vendorId: 0x362d,
    productId: 0x0001,
    productName: `${cleanBrand} ${modelName}`,
    collections: []
  };

  if ($("conn")) $("conn").textContent = "● " + cleanBrand;
  if ($("dev-brand-tag")) $("dev-brand-tag").textContent = cleanBrand.toUpperCase();
  if ($("dev-name-title")) $("dev-name-title").textContent = `${cleanBrand} ${modelName}`;
  if ($("sidebar-dev-title")) $("sidebar-dev-title").textContent = `${cleanBrand} ${modelName}`;
  if ($("sidebar-dev-sub")) $("sidebar-dev-sub").textContent = `${cleanBrand} · Connected`;
  if ($("dev-model-sub")) $("dev-model-sub").textContent = `${cleanBrand.toUpperCase()} ${modelName.toUpperCase()}`;

  $("dev-shot").innerHTML = shotHtml(brandName, modelName);
  armShotFallbacks($("dev-shot").parentElement);

  // Set Demo Specs Stack
  if ($("spec-battery-val")) $("spec-battery-val").textContent = "92%";
  if ($("spec-battery-fill")) $("spec-battery-fill").style.width = "92%";
  if ($("spec-fw-val")) $("spec-fw-val").textContent = "v1.2.4";
  if ($("spec-conn-val")) $("spec-conn-val").textContent = "Wireless (2.4 GHz)";

  // Setup DPI Demo
  const range = $("dpi-range");
  if (range) {
    range.min = 100;
    range.max = 3200;
    range.step = 100;
    range.value = 1600;
    range.disabled = false;

    range.oninput = () => {
      if ($("dpi-val")) $("dpi-val").textContent = range.value;
      const presetGroup = $("dpi-presets-group");
      if (presetGroup) {
        presetGroup.querySelectorAll(".preset-btn").forEach(b => {
          b.classList.toggle("active", b.dataset.dpi === range.value);
        });
      }
    };

    range.onchange = () => {
      toast(range.value + " DPI — demo only, nothing was written to a device", true);
    };
  }
  if ($("dpi-val")) $("dpi-val").textContent = 1600;
  if ($("dpi-min")) $("dpi-min").textContent = 100;
  if ($("dpi-max")) $("dpi-max").textContent = 3200;
  show("v-dpi", true);

  // Setup Polling Rate Demo
  const seg = $("rate-seg");
  if (seg) {
    seg.innerHTML = "";
    [125, 250, 500, 1000, 2000, 4000].forEach(hz => {
      const btn = document.createElement("button");
      btn.textContent = hz + " Hz";
      if (hz === 1000) btn.setAttribute("aria-pressed", "true");
      btn.onclick = () => {
        [...seg.children].forEach(b => b.setAttribute("aria-pressed", "false"));
        btn.setAttribute("aria-pressed", "true");
        toast(hz + " Hz — demo only, nothing was written to a device", true);
      };
      seg.appendChild(btn);
    });
  }
  show("v-rate", true);
  show("v-safety", true);

  show("v-connect", false);
  show("v-brands", false);
  show("demo-banner", true);
  show("v-device-panel", true);
  show("v-device", true);
  $("v-device-panel").scrollIntoView({ behavior: "smooth" });
  toast(`Loaded Demo: ${cleanBrand} ${modelName} ✓`);
}

function launchDemo() {
  launchDemoForModel("Attack Shark", "R11");
}

// Preset DPI Buttons Click Handler
const presetGroup = $("dpi-presets-group");
if (presetGroup) {
  presetGroup.addEventListener("click", e => {
    const btn = e.target.closest("button[data-dpi]");
    if (!btn) return;
    const range = $("dpi-range");
    if (range) {
      range.value = btn.dataset.dpi;
      if ($("dpi-val")) $("dpi-val").textContent = btn.dataset.dpi;
      // Run the real write path — it toasts the actual outcome (written, snapped,
      // rolled back or failed). A bare "selected ✓" here would claim a write that
      // never happened.
      range.dispatchEvent(new Event("change"));
    }
    presetGroup.querySelectorAll(".preset-btn").forEach(b => b.classList.toggle("active", b === btn));
  });
}

// Back to Home Button
if ($("btn-back-home")) {
  $("btn-back-home").onclick = () => reset();
}

// Demo Launch Triggers
if ($("nav-demo")) $("nav-demo").onclick = () => launchDemo();
if ($("btn-demo-hero")) $("btn-demo-hero").onclick = () => launchDemo();

/* ---------- "add my model" request ---------- */
$("btn-suggest").onclick = async () => {
  const field = id => $(id).value.trim();
  const brand = field("sg-brand");
  const model = field("sg-model");
  const state = $("sg-state");

  // Friendliness only — the server validates everything again and trusts none of this.
  if (brand.length < 2 || !model) {
    state.textContent = "Please fill in both the brand and the model.";
    return;
  }

  const button = $("btn-suggest");
  button.disabled = true;
  state.textContent = "Sending…";
  try {
    const res = await fetch("/api/suggest", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        brand, model,
        link: field("sg-link"),
        contact: field("sg-contact"),
        website: field("sg-website"),      // honeypot — a person leaves this empty
      }),
    });
    if (res.ok) {
      state.textContent = "Thank you — your request has been sent.";
      ["sg-brand", "sg-model", "sg-link", "sg-contact"].forEach(id => ($(id).value = ""));
    } else {
      state.textContent = res.status === 429
        ? "Too many requests just now — please try again in a minute."
        : "Could not send: " + (await res.text());
    }
  } catch {
    state.textContent = "Could not reach the server.";
  }
  button.disabled = false;
};

/* ---------- boot ---------- */
renderBrands();
$("btn-connect").onclick = () => connect(false);
$("btn-all").onclick = () => connect(true);
$("btn-other").onclick = reset;
$("btn-other2").onclick = reset;

if (navigator.hid) { show("v-connect"); show("v-brands"); } else show("v-nosupport");
navigator.hid?.addEventListener("disconnect", e => {
  if (e.device === device) { toast("Device disconnected", true); reset(); }
});

if (location.search.includes("selftest")) import("./selftest.js");
