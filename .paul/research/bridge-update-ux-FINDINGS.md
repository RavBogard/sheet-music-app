# FINDINGS — bridge-update-ux (coder-4, Tier-0 READ-ONLY)

**Date:** 2026-05-23
**Lane:** bridge-update-ux-research
**Type:** Tier-0 investigation, docs-only (ZERO src/, ZERO bridge/ edits, NO release)
**Owner of the FIX:** coder-1 (bridge single-owner) — a SEPARATE, Daniel-gated future bridge release. This document is research only.

## Verification posture (read this first)

- **All code claims read against `origin/master @ e9b900caa` via a dedicated worktree** (`sheet-music-app-bridge-update-ux-research/`). The canonical `sheet-music-app/` cwd is parked on a stale WIP branch (`fix/b1-error-envelope-sweep`) whose working-tree `bridge/` is **v3.1.0 with the pre-durable-cred `exeDir`-only code** — it was NOT trusted (per the standing never-validate-from-cwd rule). Reading the cwd would have produced an entirely wrong report.
- **Deployed reality verified live** via Firebase MCP read of `config/monitor` (`crcmusiccharts`), 2026-05-23T~01:40Z:

  ```
  bridge.version       = "10.0.2"          ← app.getVersion() wiring is WORKING (not the "2.0.0" sentinel)
  bridge.lastSeen      = 2026-05-23T00:27:33Z   (fresh, ~1h old)
  bridge.x32Connected  = true              ← mixer connected RIGHT NOW
  bridge.localIp       = 192.168.1.201
  bridge.status        = "online"
  bridgeLease.ownerId  = "ProductionDSKTP-21588-bd70d922"   ← single-writer lease held
  ```

**The single most important fact this surfaces:** the studio PC is **already running v10.0.2**, which means the durable-credential fix (shipped v10.0.1) and the `app.getVersion()` heartbeat (shipped v10.0.2) are **both deployed and live**. This reframes all three pains — none of them is "the fix isn't written," they are "the fix isn't complete / hasn't crossed its one-time transition / isn't surfaced locally." Details below.

---

## TL;DR per pain

| Pain | Root cause | Status | Recommended fix |
|---|---|---|---|
| **1. Auto-update unreliable** | (a) `checkForUpdates()` runs ONCE at startup, no periodic re-check; (b) BR-03 defers install to 30-min X32-idle / quit / manual, none of which fire on a tray-resident, X32-connected, rarely-quit PC; (c) the only human install path is a tray item — the dashboard has NO update UI; (d) installer is non-EV/low-reputation signed → SmartScreen can stall an unattended `quitAndInstall`. | **REAL, open.** This is the genuine remaining product gap. | **Human-driven in-app updater**: `autoDownload=false` + dashboard **Check → Download (progress) → Install & Restart** buttons; periodic *notify-only* background check; keep `autoInstallOnAppQuit` as backstop. EV cert only if Daniel wants true *silent unattended* updates. |
| **2. Creds don't survive update** | Durable-cred fix (userData-first read+write+self-migrate) **IS in master and IS deployed (v10.0.2)**. Daniel still pastes because of a **one-time transition cost**: every update so far crossed the boundary where `userData` wasn't yet populated, and the NSIS uninstall wipes the `exeDir` key *before* the new build can migrate it. | **Forward-fixed; needs proof on next update.** | Mostly DONE. PROVE on the v10.0.2→next update (no paste needed). Add a startup cred-source log line for remote confirmation. Set `BRIDGE_SA_*` in Vercel to shrink blast radius (no bridge build needed). |
| **3. Version not visible** | `index.html` shows the version **nowhere** (header, tray tooltip, no version IPC). The REMOTE half is already solved (heartbeat shows "10.0.2"); only the LOCAL window is blind. The `update-pending` IPC main.ts sends (line 305) has **no UI handler** so it's dropped. | **Local-UI gap, open. Small fix.** | Send `app.getVersion()` to the renderer; show `v10.0.2` in the header + an update-status line; set tray tooltip to include the version. Bundle with the Pain-1 updater UI. |

---

## Pain 1 — Auto-update is unreliable (REAL, the main open gap)

### Root causes (file:line @ origin/master)

**(a) The update check runs exactly once, at startup — no periodic re-check.**
`bridge/src/main.ts:96` calls `checkForUpdates()` from the window's `ready-to-show` handler, and nowhere else except the manual tray "Check for Updates" item (`main.ts:164-166`). There is **no `setInterval` re-check.** The bridge is explicitly designed to run unattended for long stretches — auto-start on Windows login (`main.ts:61-69`), minimize-to-tray instead of quit (`main.ts:99-106`), single-instance lock (`main.ts:47`). So a release published *while the bridge is running* (the normal case — it runs for days) is **never detected** until someone restarts the app or clicks the tray item. From the operator's seat this reads as "auto-update doesn't work."

**(b) Even a downloaded update is deferred indefinitely (BR-03).**
`checkForUpdates()` sets `autoDownload = true` (`main.ts:279`) so the update *downloads* eagerly, but BR-03 deliberately **defers the install** (`main.ts:213-326`). On `update-downloaded` it sets `pendingUpdateVersion`, refreshes the tray, and starts `startIdleInstallWatch()` (`main.ts:298-308`). The pending update then installs only when **one** of these fires:
- the X32 has been **continuously disconnected for 30 minutes** (`IDLE_MINUTES_BEFORE_AUTO_INSTALL = 30`, `main.ts:229`; watch loop `main.ts:251-275`) — but the live doc shows `x32Connected: true`, and any flap resets the counter (`main.ts:264-265`), so on a desk that stays powered the 30-min window may rarely accumulate;
- a human clicks **tray "Install update vX"** (`main.ts:171-176`) or the dashboard `install-update` IPC (`main.ts:497-500`); or
- the **app quits** (`autoInstallOnAppQuit = true`, `main.ts:282`) — but it almost never quits (minimize-to-tray + login auto-start).

Net: the protective BR-03 logic that (correctly) stops updates from interrupting a live service ALSO means the update sits "pending" essentially forever unattended. **This is the design tension at the heart of the pain.**

**(c) The human install path is hidden.**
The only surface for the pending update is the **tray context menu** item (`main.ts:171-176`). The dashboard window has **no update UI at all** — `bridge/ui/index.html` has zero handlers for `update-pending` / `update-available` / `download-progress` (verified by grep: no matches). main.ts even *sends* `'update-pending'` to the renderer (`main.ts:305`) but the renderer **drops it**. So unless Daniel knows to right-click the tray dot and read the menu, there is no signal an update is ready.

**(d) SmartScreen on a low-reputation signed installer can stall the relaunch.**
`bridge/package.json` `build` block has **no `win` code-signing config**, and there is **no `electron-builder.{yml,json}`** in the repo (glob empty) — signing is env-driven (`CSC_*`/`WIN_CSC_*`) at build time. The cert is **non-EV / low-reputation** (helper doc `bridge-update-helper-steps.md:60-62, 121` instructs the operator to click "More info → Run anyway"; prior findings `bridge-setup-code-mismatch-FINDINGS.md:280-285`). When electron-updater's `quitAndInstall` relaunches the NSIS installer, a low-rep cert can trigger a SmartScreen interstitial; if the app has already quit and no one is at the keyboard, the install stalls and the bridge does **not** come back up. This is the **2026-05-21 outage class** that drove Daniel to the manual-installer helper doc in the first place.

> NSIS specifics that are NOT the problem: `oneClick: true` + `perMachine: false` (`package.json:44-45`) means a per-user install with **no UAC elevation prompt**, so elevation is not the stall cause. `installer.nsh` `customInit` only does `net stop`/`sc delete`/`taskkill` — it does not interpose a prompt.

### Recommended fix — make the in-app path trustworthy, then retire the manual helper

Switch from silent-auto to an **explicit, visible, human-driven** flow (this is exactly what Daniel asked for — "a Check for update / Download / Install & Restart button with visible progress"):

1. `autoUpdater.autoDownload = false`. Add dashboard buttons wired to electron-updater's manual API: `checkForUpdates()` → on `update-available` show "Update vX available — Download"; `downloadUpdate()` with a **progress bar** fed by the `download-progress` event; on `update-downloaded` show **"Install & Restart now"** → `quitAndInstall`.
2. Keep a **periodic background check** (e.g. every 6h) that only **notifies** (badge / status line) — never auto-installs. Closes gap (a) without reintroducing the mid-service-restart risk.
3. Keep `autoInstallOnAppQuit = true` as a silent backstop, and keep the BR-03 idle-install watch as a secondary safety net.
4. Because a human is physically present for every service ([[project_shul_cadence]]), an **attended "Run anyway"** is acceptable and reliable — so an EV cert is *optional*.

**Trade-offs / alternatives for the SmartScreen stall:**
- **EV code-signing cert** — eliminates the SmartScreen warning entirely and enables true *silent unattended* updates. Cost ≈ $200–400/yr + hardware token/HSM (eKYC). Best if Daniel wants zero-touch updates.
- **Keep standard cert + human-driven in-app flow** (recommended near-term) — free, and reliable precisely because the operator is present to approve. The in-app progress UI also makes a stalled download *visible* instead of silent.
- **Build reputation on the standard cert over time** — happens slowly with download volume; not dependable for a single low-volume app.

Retire `bridge-update-helper-steps.md` (the manual direct-installer workaround) only AFTER a controlled studio test proves the in-app flow completes end-to-end.

---

## Pain 2 — Credentials don't survive an update (forward-fixed; PROVE on next update)

### Root cause: a one-time transition cost, not a broken fix

The durable-credential fix is present in master AND deployed (live v10.0.2):
- `getCredDir()` = `app.getPath('userData')` (`bridge/src/main.ts:31-38`) — `%APPDATA%\CentralReform Bridge`, keyed by app name, **install-path-independent**.
- Startup search order: env override → config `keyPath` → **userData key** → exeDir legacy keys (`main.ts:396-405`).
- **Self-migration**: if a key is found outside userData and userData has none, copy it in (`main.ts:410-424`).
- Re-cred (setup-code) IPC writes the downloaded key to **userData** (`main.ts:466-482`).

So why does Daniel STILL paste on every update? Because **every update so far has crossed the boundary where `userData` was not yet populated**, and the migrate can only run if it *finds* a key:

1. Pre-userData builds (incl. **v10.0.0** — the 3.1.0→10.0.0 jump that changed the install dir and triggered the original 2026-05-21 outage) never wrote `userData`.
2. An electron-builder NSIS update **uninstalls the old version first, wiping the install dir (`exeDir`) including any `service-account-key.json` there**, *before* the new build runs.
3. The new (userData-capable) build therefore starts with `userData` empty AND `exeDir` empty → `MISSING CREDENTIALS` → `require-setup` (`main.ts:427-431`) → Daniel pastes the JSON into `exeDir` → on that run the migrate copies it into `userData` (`main.ts:413-423`).
4. **From that point on, `userData` holds the key** and the *next* update preserves it with no paste.

The implication: the FIRST update onto a userData-capable build always costs one paste; only the SECOND update is clean. **v10.0.2 is the build now running.** If the key was pasted during this install (it must have been — the bridge is online with `x32Connected:true`), `userData` is now populated, and the **v10.0.2 → next** update should be the **first one that needs no paste**. The fix is sound; it simply hasn't been *observed across a clean update yet*.

### Why the durable path is genuinely robust (sub-confirmations)

- `userData` (`%APPDATA%\…`, Roaming) is **not** touched by the NSIS uninstall — the uninstaller removes the install dir under `%LOCALAPPDATA%\Programs`, and `installer.nsh` only stops/kills processes. So userData survives reinstalls.
- `appId` (`com.centralreform.bridge`) and `productName` (`CentralReform Bridge`) are constant across 10.0.0/10.0.1/10.0.2 → the userData path is stable.
- **Going forward `exeDir` is ALSO stable**: `oneClick:true` + `perMachine:false` + `allowToChangeInstallationDirectory:false` (`package.json:44-46`) pin a fixed per-user path, so the original "new install dir orphans the key" trigger (the 3.1.0→10.0.0 packaging change) cannot recur. Double safety.
- The **re-cred path is now functional** (it was broken at the time of the outage): `index.html` setup input is `maxlength="10"` (`:275`), copy says "10-character" (`:265`), default URL is `https://www.centralreform.live` (`:271`); the route requires exactly 10 chars (`route.ts:20,78`). Prior Bug #2 (maxlength=6) and Drift #3 (wrong default host) are FIXED in master.

### CRIT-003 status — partially shipped server-side

`src/app/api/bridge/setup-code/route.ts:144-201` already implements **CRIT-003 (a) scoped bridge credential**: if `BRIDGE_SA_CLIENT_EMAIL` + `BRIDGE_SA_PRIVATE_KEY` are set in Vercel env it vends a **least-privilege** SA (Firestore-only); otherwise it falls back to the full `FIREBASE_*` admin credential **with a loud warning** (`route.ts:178-184`). A `scoped` boolean is returned for confirmation (`route.ts:201`). The deeper "no JSON on disk at all" model (a `BRIDGE_SECRET` exchanged at runtime for a short-lived token) is **not** implemented and, given that durable userData now works, is likely overkill.

### Recommended fix

1. **PROVE the durable path** on the v10.0.2→next update: confirm no paste is required AND the heartbeat `bridge.version` advances. Add a one-line startup log — `"Found Firebase credentials at: <path>"` already exists (`main.ts:408`); promote a userData-vs-exeDir signal into the heartbeat (e.g. `bridge.credSource`) so persistence can be confirmed **remotely** without physical access.
2. **Set `BRIDGE_SA_*` in Vercel** to vend the least-privilege SA (shrinks blast radius; **no bridge build required** — pure env change). Confirm via the returned `scoped:true`.
3. The no-JSON-on-disk `BRIDGE_SECRET` model: present as **optional, not recommended near-term** — durable userData + scoped SA covers the actual risk.

---

## Pain 3 — Running version is not visible locally (small fix)

### Root cause

`bridge/ui/index.html` shows the version **nowhere**: the header is a static `<h1>CentralReform Bridge</h1>` (`:237`) with only an X32 status badge; there is no version IPC handler (grep for `app.getVersion`/`BRIDGE_VERSION`/`update-*` → no matches). The tray tooltip is the static string `'CentralReform Bridge'` (`main.ts:200`). main.ts never sends the version to the renderer.

The **remote** half is already solved: `main.ts:341-347` sets `process.env.BRIDGE_VERSION = app.getVersion()` early, and `config.ts:163` publishes it in the heartbeat — confirmed live (`bridge.version:"10.0.2"`). The historical hardcoded `"2.0.0"` sentinel still exists as the *fallback default* (`config.ts:163`, `index.ts:72`) but is correctly overridden at runtime, so it is currently harmless — though it should be removed to prevent future confusion.

### Recommended fix (small, bundle into the Pain-1 release)

- `main.ts`: on `ready-to-show`, send `app.getVersion()` to the renderer (or set `mainWindow.setTitle(\`CentralReform Bridge v${app.getVersion()}\`)`); set tray tooltip to `CentralReform Bridge v${app.getVersion()}` (`main.ts:200`).
- `index.html`: render `v10.0.2` in the header, and add an **update-status line** by wiring the existing/added events (`update-available` / `download-progress` / `update-downloaded` / the already-sent `update-pending`) into the UI — this doubles as the Pain-1 updater surface.
- Optionally drop the `"2.0.0"` sentinel in favor of always reading the real version.

---

## Phased, Daniel-gated implementation plan (for the FIX lane — coder-1)

> v10.0.2 is **confirmed installed** (live heartbeat), so the "wait until v10.0.2 lands before stacking another release" precondition is **met**. Still: ONE release, single-owner coder-1, Daniel-gated.

**Phase 0 — no build, do now if Daniel approves:**
- Set `BRIDGE_SA_CLIENT_EMAIL` + `BRIDGE_SA_PRIVATE_KEY` (+ optional `BRIDGE_SA_PRIVATE_KEY_ID`) in Vercel (CRIT-003 blast-radius). Verify `scoped:true` on next redemption.
- Watch the **v10.0.2 → next** update to confirm the cred-persistence claim (Pain 2) holds with no paste.

**Phase 1 — the FIX bridge release (bundle all three into ONE build):**
- Pain 3 (lowest risk, daily value): version in header + tray tooltip + update-status line.
- Pain 1: human-driven updater (`autoDownload=false`; Check/Download-with-progress/Install&Restart in the dashboard; periodic notify-only check; keep `autoInstallOnAppQuit` backstop).
- Pain 2: add `bridge.credSource` to the heartbeat for remote persistence confirmation; (optional) remove the `2.0.0` sentinel.
- Build/publish per [[project_bridge_release_build]]: tsconfig must exclude `src/__tests__`; `gh` release asset names hyphen-renamed to match `latest.yml` URL. Do a **controlled studio tray-update test** before trusting the new flow; retire `bridge-update-helper-steps.md` only after it passes.

**Phase 2 — console/cost decision, no code:**
- EV code-signing cert IF Daniel wants true *silent unattended* updates (otherwise the attended in-app flow suffices).

## Open questions only Daniel can answer

1. **EV cert?** Pay ≈$200–400/yr + token for an EV cert to kill SmartScreen and enable silent updates — or accept an **attended** "Run anyway" with the in-app flow (free; fine because someone is at the studio for services)?
2. **Update model:** acceptable for updates to be **human-driven** (operator clicks "Install & Restart" at the desk), or do you want fully **unattended silent** auto-update (requires the EV cert in #1)?
3. **CRIT-003 scoped SA:** provision `BRIDGE_SA_*` in Vercel now (least-privilege bridge identity), or keep vending the full `FIREBASE_*` admin credential?
4. **Deeper CRIT-003:** adopt the no-JSON-on-disk `BRIDGE_SECRET` → short-lived-token model, or is durable userData + scoped SA sufficient? (Recommendation: **sufficient** — don't build the deeper model.)

## Definition of done

FINDINGS written; every claim verified against `bridge/**` @ origin/master e9b900caa (via worktree, not the stale cwd) + the **live deployed v10.0.2** heartbeat. Recommended way forward is a single Daniel-gated coder-1 bridge release (Phase 1) preceded by a free Vercel env change (Phase 0). **NO bridge/ changes, NO release made in this lane.**

## Files referenced (read-only, origin/master @ e9b900caa)

- `bridge/src/main.ts` — cred dir helpers (28-43), update check/defer (96, 213-326), startup cred resolution + self-migrate (368-424), setup-code IPC write-to-userData (466-482), install IPC (497-500), tray tooltip (200), update-pending send w/ no UI handler (305).
- `bridge/src/config.ts` — heartbeat publishes `BRIDGE_VERSION || "2.0.0"` (163); bus-assignment array normalization (113-122); single-writer lease (228-270).
- `bridge/src/index.ts` — version banner default "2.0.0" (72); lease/heartbeat loop (43-44, 183-266).
- `bridge/ui/index.html` — no version display (237), setup overlay maxlength=10 + 10-char copy + correct default host (265, 271, 275), no update/version IPC (grep: none).
- `bridge/package.json` — version 10.0.2 (2), NSIS oneClick/perMachine:false/fixed-dir (43-52), no win signing config (28-58).
- `bridge/build/installer.nsh` — customInit net-stop/taskkill only (1-13).
- `src/app/api/bridge/setup-code/route.ts` — CODE_LENGTH=10 (20), redemption requires exactly 10 (78), CRIT-003 scoped-SA vend/fallback (144-201).
- Live: Firebase MCP `config/monitor` → `bridge.version:"10.0.2"`, `lastSeen 2026-05-23T00:27:33Z`, `x32Connected:true`.
- Prior art: `.paul/research/bridge-setup-code-mismatch-FINDINGS.md`; `.paul/research/bridge-update-helper-steps.md`. Memory: [[project_bridge_update_ops]], [[project_bridge_release_build]], [[project_bridge_state_freshness_diagnostic]].
