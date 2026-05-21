# Bridge Recon — FINDINGS (Lane bridge-recon, coder-1, Tier-0, READ-ONLY)

**Date:** 2026-05-21 (system clock ground-truth `15:24:04Z` at probe time)
**Base SHA:** `5dd02b555` (origin/master since advanced to `cbf5cd704`; bridge source identical in the read regions)
**Method:** purely remote — direct prod Firestore reads (`crcmusiccharts`, default DB) via the firebase MCP plugin (firebase-login creds) + prod MCP read-path probes against `https://www.centralreform.live/api/mcp` (Daniel-handed seed ROOT → dogfood-minted scoped child, revoked after) + read of `bridge/**` source. **Zero `src/` edits, zero console writes, no one touched the studio screen.**

---

## TL;DR

| Question | Answer | Confidence |
|---|---|---|
| Bridge alive + syncing? | **YES** — heartbeat fresh, advancing exactly +60s/min | HIGH (direct evidence) |
| X32 connected? | **YES** — `x32Connected:true`, 32 named channels + 5 buses + 6 matrices fully populated | HIGH (direct evidence) |
| Read-path works (the data the band reads)? | **YES — confirmed end-to-end** (Firestore data live + MCP auth+tool layer probed at prod, §6) | HIGH |
| Bridge **version** determinable remotely? | **NO** — the one remote version field is a hardcoded `"2.0.0"` sentinel decoupled from the real build | HIGH (source-confirmed) |
| Can we tell electron-build vs legacy-pkg remotely? | **NO** — nothing the bridge writes distinguishes them | HIGH |
| Command queue draining (commands applied)? | **YES (inferred)** — `monitor-live/commands/pending` is empty + bridge is alive; direct apply-confirm needs the optional Tier-2 safe-write | MED |

**Bottom line:** the bridge is **healthy, live, and X32-connected right now.** The one thing we genuinely **cannot** establish remotely is **which build is installed (electron vs pkg)** — and that is exactly the question that gates the auto-update ship path. Cheapest closes in §7.

---

## 1. Liveness — the bridge is ALIVE (HIGH confidence)

**Authoritative heartbeat doc: `config/monitor` → `bridge.*`** (NOT `monitor-live/state`; see §5 for why the snapshot copy can mislead).
Written by `ConfigManager.writeHeartbeat()` (`bridge/src/config.ts:165-189`) on a **60s loop** (`bridge/src/index.ts:198` `setInterval(heartbeatLoop, 60_000)`).

`config/monitor.bridge` at probe time:
```
status:        "online"
lastSeen:      2026-05-21T15:24:41.259Z   (updateTime 15:24:41.285Z)
x32Connected:  true
clients:       0          ← see §3 caveat (hardcoded, not a real count)
localIp:       192.168.1.201
version:       "2.0.0"    ← see §4 (NOT the real build version)
```

**Three consecutive `monitor-live/state` samples** (system clock `~15:24Z`):

| sample | `config.bridge.lastSeen` | top-level `updatedAt` |
|---|---|---|
| 1 | 15:22:41.280Z | 15:23:30.639Z |
| 2 | 15:23:41.257Z | 15:23:43.758Z |
| 3 | 15:24:41.259Z | 15:24:43.515Z |

- `lastSeen` advances **exactly +60s** each minute → heartbeat loop firing cleanly. Latest beat was **~23s before** the probe clock → well inside the **120s liveness window** (`config.ts:220` `age < 120_000 && status === "online"`).
- `updatedAt` advances irregularly (13s, then 60s) → consistent with **throttled delta writes** (`STATE_WRITE_INTERVAL = 100ms`, `firestore-transport.ts:46/107-165`) driven by X32 state, not a fixed cadence.

**Extended idle observation (BR-02):** continued sampling to `lastSeen 15:26:41.255Z` (probe clock `15:26:53Z`, ~12s old). Across the full **~4-minute span (15:22:41 → 15:26:41)** the heartbeat held the `:41`/min cadence, `status` stayed `online`, and `x32Connected` stayed `true` — **no flapping, no false-stale**. By design the 60s heartbeat is independent of console activity, so an idle desk cannot push liveness past ~120s; BR-02 false-disconnect is not observable at the Firestore layer here.

**Verdict:** bridge process is running and writing to Firestore. A consumer should treat `bridge.status==="online" && now-lastSeen < 120s` as alive (the bridge's own rule).

---

## 2. X32 connected (HIGH confidence)

`config/monitor.bridge.x32Connected: true`, and `monitor-live/state` carries a **fully-populated live console snapshot**:
- **32 channels**, real names: Kick, Snare, OH, Perc 1/2, David/Jeff/Joey/D Gtr 1-4, Bass, Violin, Mando, Flute, Piano, Sax, Rav Gtr 5, Alan, Misc Vox, Daniel, Leslie, Bass Vox, David Vox, Rabbi Dan, Headset 3, PodiumMic, Bima 1/2, Floor 1/2, Booth, Wall, Spare.
- **5 monitor buses** with full 32-ch send arrays + faders: `MON 1 Inst`, `MON 2 Bass`, `vox wedge`, `Andrea Wedge`, `rabbi wedge`.
- **6 matrices**: Main L, Main R, MP Room, Oneg, Library, ALS (with faders + on/off).

Empty/zeroed name fields would indicate a stale or never-synced X32; instead every slot is named and faders carry real values → the bridge has done a full OSC sync from the desk.

**Network:** bridge host `192.168.1.201`; X32 `192.168.1.78:10023` (`config.x32Address`/`x32Port`). LAN-local, as expected.

**Bus assignments (live):** bus **3 → Daniel Bogard** (`93Xn3DbS0bSNb8zmfzLyfOMX1A13`), bus **4 → David Lazaroff** (`HTks9a8YRiVCQ5lVipUJcBsWjnB3`); buses 1, 2 unassigned (`null`); bus 5 ("rabbi wedge") has mix data but no assignment. `monitorBuses: [1,2,3,4,5]`. This is the array shape BR-04 fixed — both assignments are single-element arrays, the corrected format.

---

## 3. Command-apply path (MED confidence)

- `monitor-live/commands/pending` (an iPad→bridge command **collection**, `firestore-transport.ts:171`) is **empty** at probe time. Healthy: the bridge's `onSnapshot` listener (`listenForCommands`, :170-192) drains + deletes commands, so an empty queue on a live bridge = it's keeping up (no stuck/un-consumed commands).
- **However**, an empty queue + a live listener does **not by itself prove the bridge APPLIES a command to the X32** end-to-end. Proving apply needs either (a) a real fader move, or (b) the **optional Tier-2 safe-write** in the prompt (read a fader's current value via `get_mix`, set it to the *same* value, confirm the command doc is consumed/cleared — no audible change). **Not executed** — awaiting explicit Daniel/supervisor go-ahead. Recommended only if §6's read-path probe is somehow inconclusive.
- **Caveat — `clients` is meaningless:** `bridge.clients` is hardcoded `0` (`index.ts:182,187` always pass `clients: 0`). Since the move to the Firestore bus there is no WebSocket client count; do **not** read `clients:0` as "no iPads connected." It's a dead field.

---

## 4. ★ Version / electron-vs-pkg — the gating question — **NOT remotely determinable** (HIGH confidence)

This is the headline finding and it directly gates the auto-update ship path from `bridge-release-runbook.md`.

**The only remote version signal is `config/monitor.bridge.version = "2.0.0"`.** It is **not trustworthy** as a build identifier:

- It is written as `process.env.BRIDGE_VERSION || "2.0.0"` (`config.ts:178`, mirrored in `index.ts:53`). So it is **either** an env override **or** a **hardcoded fallback** — we can't tell which from outside.
- The bridge's **actual `package.json` version is `3.1.0`** (`bridge/package.json:3`). The reported `"2.0.0"` ≠ `3.1.0`, so on the studio PC `BRIDGE_VERSION` is unset (→ fallback) or pinned to a stale `2.0.0`.
- Crucially it is **decoupled from electron's `app.getVersion()`** — the value electron-updater actually compares against the GitHub `latest.yml`. The heartbeat never reads `app.getVersion()`. So the field tells us **nothing** about whether an auto-update would fire or what's installed.

**Does the heartbeat's mere existence prove the electron build?** No. `writeHeartbeat` lives in `index.ts`/`config.ts`, the **core bridge logic that runs under BOTH** the electron build (`main.ts` → `startBridge()`) **and** a pkg/node-windows build (which would run `index.ts` directly). The electron-updater client is isolated in `main.ts` (Electron main process) and **writes nothing observable to Firestore**. So a heartbeating bridge is consistent with **either** build → we cannot distinguish them remotely.

**Consequence:** we cannot remotely answer "is the studio PC running the electron-builder build (auto-update works) or the legacy pkg/node-windows build (auto-update does NOT work)" — the exact prerequisite the release runbook depends on.

---

## 5. Gotcha: don't trust the `config.bridge` copy inside `monitor-live/state`

`monitor-live/state.config.bridge` is a **stale snapshot** — `writeFullState` (`firestore-transport.ts:75-91`) embeds `config: this.config.getConfig()`, so the bridge block in the state doc only refreshes when a full/delta write happens to carry it, and can lag the canonical `config/monitor`. For liveness/version, **always read `config/monitor` directly** (that is what `checkForRunningInstance` does). In this probe the two happened to agree (both `lastSeen 15:24:41`), but the authoritative source is `config/monitor`.

---

## 6. Step-2 read-path MCP probe — EXECUTED, **PASS** (HIGH confidence)

Daniel handed a seed ROOT `crl_live_*` at fire. Dogfooded per prompt: `tools/list` (read schemas) → `mint_admin_bearer` scoped child → 3 read calls with the **child** → revoked child → confirmed rejection → scrubbed temp. All against `https://www.centralreform.live/api/mcp` (www-direct; apex strips Authorization). Bearer values never written to any tracked file.

| Call | Result | Verdict |
|---|---|---|
| `tools/list` (root) | HTTP 200; 80+ tools incl. `list_monitor_buses`/`get_mix`/`get_matrix` + `set_*` write tools + `mint_admin_bearer`/`list_minted_bearers`/`revoke_minted_bearer` | **PASS** (auth accepted) |
| `mint_admin_bearer({purpose, ttlSec:3600})` (root) | `ok:true`, `tokenId:ztyk3St84N7eawQLQeQR`, `ttlExpiresAt:2026-05-21T16:30:52Z` | **PASS** (child issued) |
| `list_monitor_buses` (child) | 5 buses + 6 matrices; `myAssignedBuses:[3]`, `isPrivileged:true`, `bridge.status:"online"` | **PASS** |
| `get_mix({busIndex:3})` (child) | `"vox wedge"` fader `0.7448680400848389` + 32 named sends (Kick on@0.143, rest off) — **matches raw `monitor-live/state` bus 3 exactly** | **PASS** |
| `get_matrix` (child) | 6 matrices w/ faders+on: Main L/R `0.7654` on, MP Room `0.6149` off, Oneg `0.4936` on, Library `0.6295` off, ALS `0.4770` off — **matches raw state exactly** | **PASS** |
| `revoke_minted_bearer({tokenId})` (root) | `ok:true, revoked:true` | **PASS** |
| child reuse after revoke | `invalid_token` | **PASS** (revocation effective) |

**Conclusion:** the exact read path the monitor surface uses is **live end-to-end** — bearer auth, tool routing, and live X32 console data all functioning at prod. The MCP-returned values are byte-identical to the direct Firestore reads in §1-2, confirming the bridge→Firestore→read-tool chain is coherent and current. (Note: `list_monitor_buses` exposes the **X32 bus names** — bus 3 = "vox wedge" [Daniel], bus 4 = "Andrea Wedge" [David] — these are the live desk labels, distinct from the generic "MON" slot order.)

---

## 7. What we STILL can't know remotely + cheapest way to close it

| Unknown | Why remote-blind | Cheapest close |
|---|---|---|
| **Which build is installed (electron vs pkg)** — gates auto-update | `version` field is a hardcoded sentinel; electron-updater state isn't written to Firestore (§4) | **Office-helper-foolproof:** "Bottom-right of the screen by the clock, click the small **^** arrow. Is there a **CR Bridge** icon? **Right-click** it — does the menu show **'Check for Updates'** and/or **'Install update…'**?" → **YES = electron build** (auto-update capable). If instead there's a **black console/terminal window** (or a Windows *Service* named bridge, no tray icon) → **legacy pkg/node-windows** (no auto-update). |
| **Does a v3.x GitHub release exist** (was `publish` ever run) | `gh` is unauthenticated in this env; release list is public | **Daniel-from-anywhere:** open `https://github.com/RavBogard/sheet-music-app/releases` from any browser — is there a `v3.x` release with `latest.yml`? (Tells us if the publish pipeline ran; does NOT tell us what's installed — pair with the tray check.) |
| **Real running version** | only the `"2.0.0"` sentinel is exposed | Office-helper: tray → **About / version** line, read it aloud. **Permanent fix (recommended below).** |
| **Does the bridge actually APPLY commands to the X32** | empty queue + alive listener is necessary-not-sufficient (§3) | The **optional Tier-2 same-value safe-write** (no audible change) — await explicit go. Or simply observed during the next live service. |

### Recommendations (follow-up lanes — NOT done here)
1. **Wire the heartbeat version to the real build version.** Replace `process.env.BRIDGE_VERSION || "2.0.0"` with electron's `app.getVersion()` (passed from `main.ts` into `index.ts`/`ConfigManager`, with a package.json-read fallback for the non-electron path). Then `config/monitor.bridge.version` becomes a trustworthy remote build identifier and this whole recon answers itself next time. **Low effort, high recon value.**
2. **Optionally emit a `runtime`/`packaged` flag** (e.g. `app.isPackaged` / `"electron" | "pkg"`) in the heartbeat so electron-vs-pkg is directly observable.
3. **Drop or fix the dead `clients` field** (always `0` since the Firestore-bus move) so it stops implying a client count.

---

## Appendix — raw probe references
- `config/monitor` get (authoritative heartbeat) — `bridge.{status:online, lastSeen:15:24:41.259Z, x32Connected:true, version:"2.0.0", clients:0, localIp:192.168.1.201}`; `x32Address:192.168.1.78`, `x32Port:10023`.
- `monitor-live/state` get ×3 — full snapshot; `lastSeen` +60s/sample; `updatedAt` irregular.
- `monitor-live/commands/pending` list → empty `{}`.
- MCP prod probes (`/api/mcp`, www): `tools/list` 200; `mint_admin_bearer`→child `ztyk3St84N7eawQLQeQR`; `list_monitor_buses`/`get_mix(3)`/`get_matrix` all PASS; `revoke_minted_bearer`→`revoked:true`; child post-revoke→`invalid_token`. Bearers not persisted.
- Source: `bridge/src/config.ts:165-227`, `bridge/src/index.ts:53,147-198`, `bridge/src/firestore-transport.ts:35-192`, `bridge/src/main.ts:205-285`, `bridge/package.json:3,16`.
