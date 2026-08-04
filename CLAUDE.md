# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

MouseKit configures gaming-mouse DPI and report rate from the browser over **WebHID**, with no
vendor software installed. The front-end in `public/` is plain ES modules — no build step, no
bundler, no framework. `server.js` only serves those files and relays two kinds of message to
Telegram; it never touches a device.

## Commands

```bash
npm start                          # serve public/ (PORT env, default 8080)
PORT=8082 npm start                # what is normally used locally
npm test                           # selftest.js + every test/*.test.js

node --test test/logitech.test.js  # one file
node --test --test-name-pattern "setSensorDpi" test/*.test.js
node public/selftest.js            # pure-logic checks only, no mock device
```

Opening `/?selftest` in the browser runs the same pure checks against the real module graph and
prints to the console — useful when a change might break only under the browser's module loader.

WebHID needs HTTPS in production; `localhost` is exempt. Static responses are sent `no-cache`, so
edits appear on a normal reload — if a change seems to have no effect, suspect something else.

## Architecture

### The driver contract

`public/drivers/index.js` maps USB vendor ID → driver and documents the contract every driver
implements: `init`, `readDpi`, `writeDpi`, `readRate`, `writeRate`, optional `rateNote`. Read the
header comment there before touching any driver.

Two invariants hold across all of them:

- **Every write is followed by a read.** `writeDpi`/`writeRate` return what the device reports
  afterwards, not what was asked for. The UI shows that returned value, so a mis-encoded write is
  visible immediately instead of silently wrong.
- **`init` probes with a read-only command and throws if the device does not answer correctly.**
  Nothing is written to a device that failed its probe. `0x3554` in particular is shared by many
  brands, so the probe is what keeps an unrelated device safe.

Adding a brand is one new file in `public/drivers/` plus one line in the registry.

### Data flow between devices.js, images.js and the tests

`public/devices.js` is the single source of truth for brands, vendor IDs, support status and model
names. `public/images.js` keys product photos as `"brand::model"` using **those exact strings**, and
`test/images.test.js` fails if a photo key has no matching model. When renaming a model, both files
move together or the build goes red.

`statusForVendor()` in devices.js drives whether writing is allowed by default — see below.

### Safety layer

`public/safety.js` holds the pure rules; `app.js` wires them up.

- A driver whose brand status is `ready` writes immediately. Anything `beta` opens **read-only**
  until the user ticks a consent box. Only Logitech is `ready`.
- A snapshot of DPI, report rate and (where readable) the raw config block is taken on connect.
  "Download backup" saves it; "Restore original" writes it back.
- `verifyWrite()` compares what was asked for against what the device reports. A value inside the
  device's own step is accepted; anything further away triggers an automatic rollback to the
  previous value.
- `test/safety.test.js` asserts that no driver can emit a firmware or bootloader opcode
  (`0xb0`, `0xb1`, `0xc0`, `0xc1`, `0xa2`, `0xf1`, Attack Shark report `0x0c`, ATK `0x0a`) and that
  each driver's command set matches an explicit whitelist. Adding a command to a driver fails these
  tests until the whitelist is updated deliberately — that is the point.

### Content-Security-Policy

The policy is strict: `default-src 'none'`, `script-src 'self'`, `style-src 'self'`.

- **No inline `style=` attributes and no inline event handlers.** Both are silently dropped. Set
  styles through the CSSOM (`el.style.setProperty(...)`) and attach listeners with
  `addEventListener`. A blocked inline style does not throw — it just renders wrong, which is why
  `test/images.test.js` guards against them.
- Image hosts are listed in **three places** that must agree: `IMAGE_HOSTS` in `public/images.js`,
  the meta tag in `public/index.html`, and `IMAGE_HOSTS` in `server.js`. Tests enforce the sync.
  A host missing from the CSP shows the fallback silhouette instead of the photo, with only a
  console error.

### Server

`server.js` serves `public/` and nothing above it — `server.js` and `package.json` are deliberately
outside the web root. Two POST endpoints relay to Telegram: `/api/report` (automatic, when an
unsupported device is connected) and `/api/suggest` (a person asking for a model to be added).

All request-body validation lives in `validate.js` so it can be tested without starting a listener.
The browser's own checks are for friendliness only; the server re-validates everything. The
suggestion form has a honeypot field — a filled one gets a normal `200` and is forwarded nowhere.

Rate limits are per route per IP plus a global hourly cap, and the whole request handler is wrapped
so a malformed URL cannot take the process down. `X-Forwarded-For` is deliberately **not** trusted;
put real rate limiting in the reverse proxy.

The Telegram bot token comes from `TG_BOT_TOKEN` / `TG_CHAT_ID` env vars and never reaches the
browser. Without them, messages print to the console.

## Protocol traps that have already caused bugs

These were real defects found by comparing against vendor sources. Keep the citations in the code.

- **Logitech HID++**: the third packet byte is an *address*, `(functionIndex << 4) | softwareId`.
  The `ADDR.*` constants in `drivers/logitech.js` are **already shifted** — OR the software id in,
  never shift again. Shifting twice collapses every address to `0x0a`, which turns a DPI write into
  a harmless read, so nothing appears broken except that the mouse never changes.
- **Attack Shark DPI**: two independent flags (the per-stage bit in bytes `[6]`/`[7]`, and the byte
  at `[16 + stage]`) select one of four different table strides. A single-rule encoder is wrong for
  everything between 5100 and 20000 DPI. `test/drivers.test.js` checks every row of the vendor's
  captured sample table.
- **ATK**: there is no "get report rate" opcode — the vendor's own driver has none either. The
  current rate and the active DPI stage both come from `GetConfigData (0x82)`.

## Testing approach

`test/mock-hid.js` is a stand-in `HIDDevice` that records every byte a driver puts on the wire;
`test/mocks.js` adds a protocol-aware responder per brand that remembers what was written. Tests
assert the **exact packet** and that the mock device actually received the value — not merely that
nothing threw. When adding protocol code, cite the upstream source in a comment and encode its
documented sample values as test cases.
