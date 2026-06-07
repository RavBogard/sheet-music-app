# Lane bridge-release-research — coder-1 — Bridge build/release/update pipeline runbook (READ-ONLY)

Daniel is about to ship a cleaned-up bridge (BR-02/BR-01/BR-05 fixes are landing in a sibling lane).
Before he does, he needs a definitive answer to: **"do we have to rebuild the installer and manually
reinstall on the studio PC, or can we push the update through the bridge's built-in auto-update
avenue?"** — and a step-by-step runbook to actually do it. This is a READ-ONLY research lane: produce
a doc, change no code.

## What we already know (verify + complete it)
- `bridge/package.json`: `"dist": "tsc && npx electron-builder --win"`; `build` key configures NSIS
  one-click, output → `bridge/release/`; `publish: { provider: github, owner: RavBogard, repo:
  sheet-music-app }`; client has `electron-updater ^6.3.9`; current `version` is **3.1.0**.
- `bridge/src/main.ts` runs `autoUpdater` (electron-updater) against GitHub releases. **BR-03 (just
  shipped) gated the auto-INSTALL** so it no longer force-quits+relaunches mid-service.
- So the avenue almost certainly exists; your job is to confirm the exact mechanics + the BR-03
  interaction + write the runbook.

## §1 Worktree
```bash
cd C:/Users/dsbog/CentralReform.live/
git fetch origin
git worktree add ../sheet-music-app-bridge-release-research -b feat/bridge-release-research 1ad242468
cd ../sheet-music-app-bridge-release-research
```
ACK; create `.coord/status/coder-1.md`. READ-ONLY — only write is the runbook doc.

## §2 Questions the runbook MUST answer
1. **Build:** confirm `cd bridge && npm install && npm run dist` produces the NSIS installer +
   `latest.yml` + `.blockmap` in `bridge/release/`. What's required (node_modules incl. electron
   download size; `bridge/build/installer.nsh`; any code-signing — note: unsigned ⇒ the "Windows
   protected your PC / Run anyway" SmartScreen prompt per `bridge/SETUP_GUIDE.md`).
2. **Publish:** how electron-builder publishes to GitHub releases given the `publish` config —
   `electron-builder --publish always` (needs a `GH_TOKEN` with repo scope) vs. manually creating a
   GitHub release on `RavBogard/sheet-music-app` and uploading the `release/` artifacts. Document the
   simplest reliable path for a solo maintainer.
3. **Auto-update detection:** how `electron-updater` in `main.ts` checks for updates (on launch? on an
   interval? `checkForUpdates()` call sites) and confirm a **version bump in `bridge/package.json`**
   (3.1.0 → next) is required for the running bridge to see the release as newer.
4. **★ The BR-03 install interaction (most important):** coder-4's BR-03 fix made install
   non-automatic. So after a release is published + the running bridge downloads it — **how does it
   actually INSTALL now?** Trace coder-4's gating in `main.ts` (idle gate? the `install-update` IPC /
   tray action? next manual quit?). Document the exact step to trigger the install on the studio PC.
   This is the FIRST update shipping through the gated path — confirm it will actually land, not just
   download-and-sit.
5. **Verdict:** do we need a manual reinstall at all, or is "publish a release + (trigger install per
   #4)" sufficient? Give the recommended end-to-end procedure.

## §3 Deliverable
`.paul/research/bridge-release-runbook.md`:
- The **end-to-end ship procedure** (version bump → build → publish → how it reaches + installs on the
  studio PC), as a numbered runbook Daniel can follow.
- The **publish-vs-manual-reinstall verdict** + the **BR-03 install-trigger** answer.
- Prereqs/gotchas (GH_TOKEN, unsigned-SmartScreen, electron download, studio PC must be online to poll).
- FACTS vs INFERENCES (you're reading config + code, not running a real publish — flag what needs a
  live test on the studio PC).

## §4 Seam
coder-2 owns the bridge CODE fixes (BR-02/BR-01/BR-05) in a sibling lane — don't touch code; your
runbook just assumes those land before the build. Docs-only commit → FF-push → SHIP-NOTICE
(`from coder-1`). Tier-0 research; supervisor self-verifies.
