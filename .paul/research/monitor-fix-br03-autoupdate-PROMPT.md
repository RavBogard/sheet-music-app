# Lane monitor-fix-br03 — BR-03: gate bridge auto-update so it can't restart mid-service · Tier 1

You are **coder-4**. The monitor audit found a real outage risk: the bridge's `electron-updater` is
`autoDownload=true` and **auto-installs + relaunches ~3s after ANY GitHub release**, with no
maintenance-window guard. A release published during a Friday-evening / Shabbat-morning service
([[project_shul_cadence]]) freezes **every** musician's monitor mix mid-service. There is already a
manual `install-update` IPC handler (`main.ts:342`) to build on.

Daniel has **authorized touching `bridge/`** for this work.

> NOTE: this lane was added by supervisor to fill coder-4 per Daniel's "coders 1-4." It's the
> highest-value disjoint item both audit lanes flagged. If Daniel says drop it, stand down.

## Read first
- `C:/Users/dsbog/CentralReform.live/sheet-music-app/.coord/research/monitor-audit-SYNTHESIS.md`
- `.paul/research/monitor-audit-lane1-bridge-FINDINGS.md` — **BR-03** (root cause + the existing
  `install-update` IPC at `main.ts:342`). (BR-02/BR-10 are context only, NOT in scope.)

## §1 Worktree
```bash
cd C:/Users/dsbog/CentralReform.live/
git fetch origin
git worktree add ../sheet-music-app-monitor-fix-br03 -b feat/monitor-fix-br03-autoupdate c2c45b6f4
cd ../sheet-music-app-monitor-fix-br03
```
ACK; create `.coord/status/coder-4.md`; **claim `bridge/src/main.ts`**.

## §2 Scope (EDIT — `bridge/src/main.ts` only)
`checkForUpdates` / the `autoUpdater` handlers (~167-212, esp. ~171-195): stop the unconditional
auto-quit+relaunch. Pick the **simplest robust** approach:
- Keep pre-**download** (fine), but do NOT `quitAndInstall(true, true)` automatically. Instead
  surface "Update ready — install now?" via the **existing `install-update` IPC** (`main.ts:342`)
  + a tray menu item, so the install/relaunch happens on an explicit human action; **or**
- Suppress auto-install while the X32 is connected + commands are flowing (gate on
  `getBridgeStatus().x32Connected`), deferring install to idle / next manual quit.
Notify in the UI/tray that an update is pending. **Only gate the INSTALL/RELAUNCH timing — do not
disable update downloads.**

## §3 Guard rails / seam
- `bridge/src/main.ts` ONLY. Do NOT touch `config.ts`/`types.ts` (coder-1) or
  `firestore-transport.ts` (coder-2). Claim `main.ts`.
- Electron auto-update is hard to unit-test — if a clean test isn't feasible, document the behavior
  change + a manual verification procedure in your SHIP-NOTICE (don't force a brittle test).

## §4 Ship
Build the bridge (`npm run build` in `bridge/`). Tier-1 (ops) → standard auditor verify. Push FF →
`master-tip.md` → SHIP-NOTICE (`from coder-4`) → agents.md → archive → release claims.
