# Lane: bridge-release-build (coder-1) — Tier 2, OUTWARD-FACING (single owner)

## Context
The studio bridge is running an **old build** → it still has the **BR-04
musician-fader lockout bug** and lacks BR-02/BR-01/BR-03 + the CRIT-003 scoped
credential. Daniel GAVE GO to ship all bridge fixes to the live studio via a
**published GitHub release** the bridge tray can auto-pull. You wrote the runbook +
the recon — you are the **single named owner** of this outward-facing prod op
([[feedback_single_owner_destructive_runs]]).

**Strong evidence the studio IS the electron build** (so tray auto-update should work):
GH release `v3.1` ("Bridge Setup 3.1", 2026-02-23) exists + `bridge/package.json`
version is `3.1.0` + `build.publish` → github `RavBogard/sheet-music-app`. gh CLI is
**authed** (RavBogard, `repo`+`workflow` scopes).

Verified at master (`3492af225`): `bridge/package.json` version `3.1.0`;
`scripts.dist` = `tsc && npx electron-builder --win` (nsis target);
`build.publish` = github RavBogard/sheet-music-app.

## Scope
1. **Version bump** `bridge/package.json` `3.1.0` → **`10.0.0`** (Daniel's "v10.0 to
   be safe" — outranks the installed 3.1.0 so electron-updater is guaranteed to offer
   it). Commit + push to master so the repo matches the release.
2. **Fix the version sentinel** (your recon finding) — the bridge heartbeat reports a
   hardcoded `"2.0.0"` string decoupled from the real version. Make it report
   `app.getVersion()` in the `monitor-live/state` (or status) write, so AFTER this
   update we can confirm `10.0.0` landed **remotely** (closes the recon gap for good).
   bridge/** is authorized (decisions.md 2026-05-21).
3. **Build** — `npm install` in `bridge/` + `npm run dist` → produces nsis `exe` +
   `latest.yml` + `*.blockmap` in `bridge/release/`. **If electron-builder can't run
   cleanly on this box, STOP + report immediately** — we pivot to Daniel building
   locally. Do NOT publish a half-built release.
4. **Publish** a **NON-DRAFT** GitHub release **`v10.0.0`** with all three assets
   (`exe` + `latest.yml` + `blockmap` — `latest.yml` is REQUIRED for electron-updater
   to detect the update). Use `gh release create v10.0.0 --title "Bridge v10.0.0"
   --notes "<fixes>" bridge/release/<exe> bridge/release/latest.yml
   bridge/release/<blockmap>` (gh is authed), or `npx electron-builder --win
   --publish always` with `GH_TOKEN=$(gh auth token)`. Notes summarize: BR-04
   musician-fader fix, BR-02 keepalive, BR-01 auth cache, BR-03 mid-service
   auto-update gate, CRIT-003 scoped-credential (fallback-safe), version-report fix.
5. **Office-helper steps** — NEW `.paul/research/bridge-update-helper-steps.md`:
   foolproof, non-technical, click-by-click. Find the bridge icon in the Windows
   system tray (bottom-right; may be hidden under the `^` "show hidden icons" arrow),
   **right-click → "Check for Updates" → wait → "Install update" / restart**. State
   exactly what each step looks like. Critical: **"if there is NO 'Check for Updates'
   item, STOP and tell us"** (= legacy pkg build → needs a manual install instead).
   Note the dashboard UI does NOT wire an install button → the **tray is the only
   manual path** (your runbook finding).

## Acceptance
- `bridge/package.json` = `10.0.0` on master.
- `gh release view v10.0.0` shows a **NON-DRAFT** release with `exe` + `latest.yml` +
  `blockmap` assets — paste that output in the SHIP-NOTICE `## Repros`.
- Version-sentinel fix is in the build.
- Helper-steps doc written.
- You do NOT install onto the running bridge (no remote path anyway) — publishing only
  STAGES it; the helper's tray click is the deliberate install.

## Hard rules
- **Outward-facing** (public GitHub release) + install hits **LIVE hardware** → you
  are the SINGLE owner; no other agent touches this. Publishing alone does NOT disturb
  the running bridge (it pulls only on the helper's click).
- Bridge version only — do NOT touch the web-app version.
- CRIT-003: the new build vends `BRIDGE_SA_*` if set, else `FIREBASE_*` fallback —
  Daniel hasn't provisioned `BRIDGE_SA_*` yet, so the fallback keeps the bridge working
  (safe). Do NOT gate the release on the SA.
- `errors.ts`/`error-envelopes.ts` read-only. Cut a worktree off current origin/master
  (shallow — confirm); tear down your old `bridge-recon` worktree once the new one is up.
- Tier 2: SHIP-NOTICE → auditor + supervisor (release exists + assets correct + version
  bump on master + sentinel fix).
