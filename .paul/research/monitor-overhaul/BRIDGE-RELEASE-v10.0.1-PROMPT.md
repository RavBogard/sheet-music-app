# Lane: bridge-release-v10.0.1 (coder-1) — Tier 2, OUTWARD-FACING, single owner, Daniel-gated (GO given)

## Why this lane exists (the window)
Daniel's assistant **Kim is at the studio booth NOW, ~1hr+ window**, able to install a
new bridge build by hand. This is the gated step that lands the **P1-A state-write
root-fix on the live desk**. Live desk RIGHT NOW (verified via Firebase read-only at
dispatch): `config/monitor.bridge` = **v10.0.0**, x32Connected:true, heartbeat fresh;
but `monitor-live/state` is **R3 map-corrupted** (`buses:{"4":{fader:0.99}}`) and
**frozen ~3h** (`updatedAt` 19:55:38Z) — the "green heartbeat, dead writes" trap. The
first full-state `.set()` from a P1-A bridge **auto-heals** that corrupted live state.

**Daniel's decision (this session):** GO — build + install — and **bundle all three fixes
into v10.0.1** (P1-A is already on master; add the two bridge-setup-code-mismatch fixes
so Kim's install is non-destructive).

## Preconditions you MUST confirm before building
1. **origin/master tip carries P1-A.** `git fetch && git log -1 origin/master` should be
   at/after `534fccd86` (current tip `98ce98d6a`). Cut your worktree off the current
   origin/master tip — the build then contains P1-A automatically.
2. **P1-A auditor ACCEPT is the install gate, NOT the build gate.** You may BUILD now in
   parallel with the auditor's P1-A verify. **Do NOT tell Kim to install until the
   supervisor confirms P1-A is auditor-ACCEPTED** (mock/unit: bridge 42/42 + R1-readback
   flip + check:types — fast, no desk needed). Publishing the release only STAGES it.

## Scope — three fixes + version + build + publish + helper
**All in `bridge/**` (your single-owner zone). Read your own FINDINGS first:**
`.paul/research/bridge-setup-code-mismatch-FINDINGS.md` (shipped @ `b24090918`, on master —
in your worktree). It has the exact file:line for Bug#1/Bug#2. **VERIFY every file:line
against the actual source in your worktree before editing — do not trust line numbers from
memory or this prompt** ([[feedback_cowork_prompt_verify_before_write]]).

1. **Bug #1 (HIGH — durable credentials; the de-risk that justifies bundling).** Bridge
   credential discovery is **exeDir-only** (`main.ts` startup probe, ~343-380) and the
   `submit-setup-code` IPC writes creds back to exeDir only (~419-428) → reinstalling to a
   NEW install path orphans `service-account-key.json` (the 5/21 outage). **Fix:** read AND
   write creds at `app.getPath('userData')` first, with the exeDir path as a fallback, and
   **self-migrate** (if a cred is found only in exeDir, copy it into userData on startup).
   This makes ANY future reinstall non-destructive.
2. **Bug #2 (MED — setup-code length).** `bridge/ui/index.html` setup input
   `maxlength="6"` vs the app's 10-char code (`route.ts` CODE_LENGTH=10) — maxlength is the
   sole hard blocker. **Fix:** `maxlength="10"` + refresh the cosmetic "6-Digit Code" copy/
   placeholder to match the 10-char alphanumeric reality.
3. **Drift #3 (LOW — optional, include if low-risk).** Default appUrl
   `centralreform.firebaseapp.com` ≠ canonical `www.centralreform.live`. Align the default
   if it's a clean one-liner; skip + note if it risks anything.
4. **Version bump** `bridge/package.json` `10.0.0` → **`10.0.1`**. Commit + push to master
   so the repo matches the release. (P1-A already reports version via its `bridgeVersion`
   field + `config/monitor` heartbeat — confirm the heartbeat will read `10.0.1` after
   install; no separate hardcoded sentinel should remain.)
5. **Build** — from `bridge/`: `npm install` then `npm run dist` (= `tsc && electron-builder
   --win`, nsis) → `exe` + `latest.yml` + `*.blockmap` in `bridge/release/`.
   **Known gotchas from the v10.0.0 ship ([[project_bridge_release_build]]):**
   (a) **tsconfig must EXCLUDE `bridge/src/__tests__`** or `tsc` fails the dist build;
   (b) when attaching assets with `gh`, the **asset filenames must be hyphen-renamed to
   match the URLs inside `latest.yml`** (electron-updater 404s otherwise).
   **If electron-builder won't run cleanly on this box, STOP + report immediately** — we
   pivot to Daniel building locally. Do NOT publish a half-built release.
6. **Publish** a **NON-DRAFT** GitHub release **`v10.0.1`** (github RavBogard/sheet-music-app;
   `gh` is authed) with all three assets (`exe` + `latest.yml` + `blockmap` — `latest.yml`
   REQUIRED). Notes summarize: P1-A state-write root-fix (R1 query-after-command / R2
   2-tier heartbeat / R3 full-state writes), durable credentials (Bug#1), setup-code length
   (Bug#2).
7. **Kim install helper** — refresh `.paul/research/bridge-update-helper-steps.md` for
   v10.0.1, click-by-click, non-technical. **★ Critical lesson from 5/21: the tray
   auto-update STALLED and took the bridge down.** So the helper's PRIMARY path = **run the
   downloaded installer `.exe` DIRECTLY** (don't rely on tray "Check for Updates"). Include:
   where to download the v10.0.1 exe (GitHub release page), run it, let it install over the
   existing install, **fully quit + relaunch**, and the **cred fallback** (with Bug#1 fixed,
   the existing `service-account-key.json` should be picked up / self-migrated — but keep
   the manual "copy service-account-key.json into the new exe folder" step as a backstop in
   case the user lands on a pre-fix state). **Confirm success remotely:** `config/monitor`
   `bridge.version` → `10.0.1`, fresh `lastSeen`, `x32Connected:true`.

## Acceptance
- `bridge/package.json` = `10.0.1` on master; Bug#1 + Bug#2 fixes in the build.
- `gh release view v10.0.1` shows a **NON-DRAFT** release with `exe` + `latest.yml` +
  `blockmap` — paste that in your SHIP-NOTICE `## Repros`.
- Helper-steps doc refreshed (installer-direct primary path + cred backstop).
- Bridge suite still green (42/42) + check:types after your edits.
- You do NOT install onto the running bridge yourself — publishing STAGES it; Kim's
  installer run is the deliberate install, gated on supervisor's "P1-A ACCEPTED" go.

## Hard rules
- **Outward-facing prod op + hits LIVE hardware** → you are the SINGLE owner; no other
  agent touches `bridge/**`. Publishing alone does not disturb the running bridge.
- Bridge version only — do NOT touch the web-app version.
- `errors.ts`/`error-envelopes.ts` read-only (web-app, not yours anyway).
- Cut a fresh worktree off current origin/master (shallow clone — confirm with
  `git rev-parse --is-shallow-repository`; use `git ls-tree`/content checks, not
  `--is-ancestor`, for any landing verification — Windows ref-path + shallow-boundary
  gotchas).
- Tier 2: **SHIP-NOTICE → inbox/auditor.md** (release exists + assets correct + version on
  master + Bug#1/#2 in build + helper doc) AND a short HEADS-UP → inbox/supervisor.md the
  moment the release is published so the supervisor can green-light Kim's install (once
  P1-A is auditor-ACCEPTED).
- If the build heads anywhere near a state that could disturb the LIVE desk before the
  P1-A ACCEPT, STOP + surface.
