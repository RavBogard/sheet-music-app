# Bridge Release / Auto-Update Runbook

**Lane:** bridge-release-research (coder-1) · **Base SHA:** `1ad242468` · **Tier-0 READ-ONLY research**
**Date:** 2026-05-21 · **Bridge version on disk:** `3.1.0` (`bridge/package.json`)

---

## TL;DR verdict

**You almost certainly do NOT need to rebuild + manually reinstall on the studio PC for every change** — *provided the studio PC is already running the modern Electron build of the bridge.* The bridge ships with `electron-updater` wired to GitHub releases, so the supported avenue is:

> **bump version → `npm run dist` → publish a GitHub release (with `latest.yml`) → the running bridge downloads it → install it via the tray's "Install update" item (or a reboot).**

**One feasibility gate (needs a live check on the studio PC):** auto-update only works if the *installed* exe is the **electron-builder** build (the one with `electron-updater` baked in). The repo's `README.md`/`SETUP_GUIDE.md` still describe an **older `pkg` single-exe** model that has **no** updater. If the studio PC is still on that old exe, you must do **one** manual install of the Electron build first; after that, all future updates auto-flow. See **§5 Verdict** + **§6 FACTS vs INFERENCES**.

---

## §1 What the code actually does (ground truth at `1ad242468`)

| Piece | Reality |
|---|---|
| Build tool | **electron-builder 26.8.1** (`devDependency`). `dist` script = `tsc && npx electron-builder --win`. |
| App shape | A real **Electron app** (`electron ^40.6.0`, `main: dist/main.js`), runs in the system tray, GUI dashboard at `ui/index.html`. |
| Updater | **`electron-updater ^6.3.9`** driven from `bridge/src/main.ts`. |
| Target | Windows **NSIS** one-click installer (`build.win.target: nsis`, `oneClick: true`, `perMachine: false`, `include: build/installer.nsh`). |
| Publish provider | **GitHub** — `owner: RavBogard`, `repo: sheet-music-app` (`build.publish`). |
| Auto-start | The packaged app sets a Windows **login item** (`app.setLoginItemSettings`, `main.ts:36`) — NOT a node-windows service. |

> ⚠️ **Doc drift (real finding).** `bridge/README.md` "Building the Installer EXE" describes `npm run build-exe` with **pkg** → `dist/CentralReform-Bridge.exe`, and `SETUP_GUIDE.md` describes a `node-windows` service + `--setup`/`--uninstall` flags. **None of that matches the current code:** there is no `build-exe` script, no pkg dep, no `scripts/` dir, and `src/` no longer has `launcher.ts`/`ws-server.ts` (it now has `main.ts` + `firestore-transport.ts`). Do not follow those sections for releases. The hyphenated name `CentralReform-Bridge.exe` in the docs + `installer.nsh` is a leftover from the pkg era (see §4 gotcha).

---

## §2 End-to-end ship procedure (the runbook)

Assumes coder-2's bridge code fixes (BR-02/BR-01/BR-05) have already landed on `master`.

### Step 0 — (one-time only) make sure the studio PC runs the Electron build
If the studio PC is still on the old pkg `CentralReform-Bridge.exe`, do a single manual install of the Electron build (Steps 1–2 below, then hand-install the produced installer once). Verify by checking that the bridge lives in the **system tray** with a "Check for Updates" right-click item — that item only exists in the Electron build. **After this one install, Steps 3+ auto-update forever.**

### Step 1 — Bump the version (mandatory)
Edit `bridge/package.json` `"version"`: `3.1.0` → next (e.g. `3.1.1` for fixes, `3.2.0` for features). `electron-updater` only installs a release whose version is **strictly newer** than the running app, so this bump is what makes the running bridge see the release at all. Commit it with the code fixes.

### Step 2 — Build the artifacts
```powershell
cd bridge
npm install        # REQUIRED on a clean checkout — node_modules is not committed; pulls electron ~40.6.0
npm run dist       # = tsc && npx electron-builder --win
```
Output lands in **`bridge/release/`**:
- `CentralReform Bridge Setup <version>.exe`  ← the NSIS installer (default name `${productName} Setup ${version}.exe`)
- `latest.yml`                                 ← **the update feed `electron-updater` reads — REQUIRED**
- `CentralReform Bridge Setup <version>.exe.blockmap` ← differential-download map
- `win-unpacked/`                             ← raw app dir (not distributed)

> `builder_debug.txt` in the repo confirms a full `electron-builder --win` run has succeeded on this machine before (electron 40.6.0, win x64, nsis, `win-unpacked` produced). That log reflects an *older* nsis config (`oneClick:false`); the current `package.json` (`oneClick:true`) is authoritative.

### Step 3 — Publish the GitHub release
Pick ONE:

**Path A — let electron-builder publish (recommended; never forgets `latest.yml`):**
```powershell
$env:GH_TOKEN = "<github PAT with 'repo' scope>"
cd bridge
npx electron-builder --win --publish always
```
This builds AND creates/updates the GitHub release on `RavBogard/sheet-music-app`, tags it `v<version>`, and uploads the exe + `latest.yml` + `.blockmap` automatically.
> ⚠️ electron-builder's GitHub releases are created as a **draft** by default. **You must publish the draft** (un-draft it on the GitHub Releases page) or the studio bridge won't see it.

**Path B — manual release (no token):**
1. `npm run dist` (Step 2).
2. On GitHub → `RavBogard/sheet-music-app` → Releases → **Draft a new release** → tag `v<version>`.
3. **Upload all three** `bridge/release/` files: the Setup `.exe`, **`latest.yml`**, and the `.exe.blockmap`. *(Forgetting `latest.yml` is the #1 way to silently break auto-update.)*
4. **Publish** the release (not draft).

### Step 4 — Land it on the studio PC (the BR-03 install — see §3)
The studio PC must be **online**. Then either:
- **Fastest:** right-click the tray icon → **"Check for Updates"** → it downloads → right-click again → **"Install update v<version> (restart now)"**. Do this during a non-service window.
- **Hands-off:** do nothing — it auto-installs after the X32 has been idle 30 min, or on the next PC reboot (§3).

---

## §3 ★ The BR-03 install interaction (the important part)

coder-4's BR-03 fix (shipped `e41adbd30`) made **install non-automatic** so a release published mid-service can't force-quit the bridge and freeze every musician's monitor mix. The bridge still **downloads** eagerly (`autoUpdater.autoDownload = true`) but **defers the install**. Trace (`bridge/src/main.ts`):

- `checkForUpdates()` is called **on startup** (`ready-to-show`, `main.ts:71`) and from the tray **"Check for Updates"** item (`main.ts:139`). **It is NOT on a timer/interval.** → A bridge that has been running for days will **not** notice a new release until it restarts or you click "Check for Updates".
- On `update-downloaded` (`main.ts:272`): sets `pendingUpdateVersion`, sends `update-pending` to the renderer, **adds a tray item "Install update v<x> (restart now)"** (`refreshTrayMenu`), and starts the idle watch. **It does not install yet.**
- A downloaded update installs only when **one** of these fires:
  1. **Idle auto-install** — the X32 has been *continuously* disconnected for **30 minutes** (`IDLE_MINUTES_BEFORE_AUTO_INSTALL`, counted minute-by-minute, reset if `x32Connected` flaps true to dodge the BR-02 false-disconnect). Then `quitAndInstall(true, true)` (`main.ts:219`).
  2. **Human explicit** — tray **"Install update v<x> (restart now)"** → `installPendingUpdate()` → `quitAndInstall`. (Same path is exposed as the `install-update` IPC for the dashboard.)
  3. **Next app quit** — `autoInstallOnAppQuit = true` (`main.ts:256`): installs whenever the app quits (PC reboot/shutdown, or tray → Quit).

**So it will NOT download-and-sit forever** — it lands on the next idle window, the next reboot, or instantly via the tray item.

> ⚠️ **Studio-PC nuance:** the 30-min idle gate keys on **X32 disconnected**. If the studio X32 is powered/connected 24/7, the idle auto-install **never triggers** — the update will then land only on the **next reboot** or when you click the tray **"Install update"**. For a predictable ship, plan to click the tray item (or reboot the PC) after publishing.
>
> ⚠️ **Dashboard button not wired (real finding):** `main.ts` sends `update-pending` and listens for the `install-update` IPC, but `ui/index.html` only handles `log`/`status`/`require-setup` — it never renders an "install" button or invokes `install-update`. **The working manual-install UI is the TRAY menu item, not the dashboard window.** (Non-blocking; flag for coder-2 if a dashboard button is wanted.)

---

## §4 Prereqs & gotchas

- **`GH_TOKEN`** (Path A only): a GitHub Personal Access Token with **`repo`** scope, exported in the shell before `--publish always`.
- **electron-builder GitHub releases default to DRAFT** — must be published, or the bridge won't see them.
- **`latest.yml` is mandatory** for `electron-updater`. Path A attaches it automatically; Path B requires you to upload it (plus the `.blockmap`) by hand.
- **Version bump is mandatory** — same-or-lower version = "update-not-available".
- **Unsigned build → SmartScreen.** No code-signing cert is configured (`builder_debug.txt` shows the winCodeSign cache step exiting non-zero / skipped; `SETUP_GUIDE.md` documents the "Windows protected your PC → More info → Run anyway" prompt). This affects the **first manual install** on a clean PC only; `electron-updater`'s `quitAndInstall` on an already-installed app does not re-trigger that prompt.
- **Studio PC must be online** to poll GitHub and download.
- **`npm install` first** on any clean checkout — `node_modules` (incl. the ~Electron download) is not committed.
- **NSIS `installer.nsh` name mismatch (minor, INFERENCE):** `build/installer.nsh` `customInit` kills `CentralReform-Bridge.exe` / `CentralReformBridge.exe`, but `productName: "CentralReform Bridge"` produces **`CentralReform Bridge.exe`** (with a space) — the kill commands don't match the real exe name. For `electron-updater`'s `quitAndInstall` this is moot (the running process exits itself first). It could matter only for a **manual over-install while the bridge is running** (locked-exe replace failure). Worth a follow-up cleanup but not a blocker for the auto-update path.

---

## §5 Verdict (Daniel's question)

**"Do we have to rebuild + manually reinstall, or push through the built-in auto-update avenue?"**

- **Steady state: NO manual reinstall.** Once the studio PC runs the Electron build, every future ship is `bump version → npm run dist → publish a (non-draft) GitHub release with latest.yml → tray "Check for Updates" → tray "Install update"` (or just wait for the next reboot / 30-min X32-idle window). That is the recommended end-to-end procedure (§2).
- **One precondition / first-run caveat:** this is the **first** ship through the gated avenue. It works **iff** the installed studio exe is the electron-builder build (has the tray "Check for Updates" item + `electron-updater`). If it's still the legacy **pkg** exe, do **one** manual install of the Electron build, then auto-update takes over permanently.
- **Recommended publish mechanism:** **Path A** (`electron-builder --publish always` with `GH_TOKEN`) — it can't forget `latest.yml`. Path B is fine for a token-averse solo maintainer as long as `latest.yml` + `.blockmap` are uploaded and the release is published out of draft.

---

## §6 FACTS vs INFERENCES

**FACTS (read from config/code at `1ad242468`):**
- `dist` = `tsc && npx electron-builder --win`; `electron-updater ^6.3.9`; `publish: github RavBogard/sheet-music-app`; version `3.1.0`. (`package.json`)
- BR-03 deferred-install logic is present and behaves as in §3. (`src/main.ts`)
- `checkForUpdates()` is startup + tray only, never on an interval. (`src/main.ts`)
- Dashboard `ui/index.html` does not wire `update-pending`/`install-update`; tray item is the manual path. (`ui/index.html`, `src/main.ts`)
- A successful `electron-builder --win` run has happened on this machine. (`builder_debug.txt`)
- No code-signing configured → unsigned → SmartScreen on first manual install. (`builder_debug.txt`, `SETUP_GUIDE.md`)
- README/SETUP_GUIDE describe the superseded pkg/node-windows model. (`README.md`, `SETUP_GUIDE.md` vs `package.json`/`src/`)
- `node_modules` is not committed; `npm install` required on a clean checkout. (clean worktree had no `node_modules`)

**INFERENCES / NEEDS A LIVE TEST (I read config + code; I did not run a real publish or touch the studio PC):**
- **Whether the studio PC currently runs the Electron build vs the legacy pkg exe.** This is the single biggest unknown and gates the whole auto-path. *Live check:* right-click the studio tray icon — if it has "Check for Updates", it's the Electron build.
- **Whether any GitHub release already exists on `RavBogard/sheet-music-app` for the bridge.** `gh` was unauthenticated in this environment (401), so I could not enumerate releases. Local git tags are all **app**-version tags (`v1.x`–`v2.2`); there is **no `v3.x` tag**, which *suggests* the bridge has never been published through electron-builder's GitHub avenue — but a shallow clone may not show every tag, and a release can exist without a local tag. *Live check:* open `https://github.com/RavBogard/sheet-music-app/releases`.
- **Exact produced artifact filenames** (default `${productName} Setup ${version}.exe`) — confirm against the real `bridge/release/` listing after a build; the historical `builder_debug.txt` predates the current `oneClick:true` nsis config.
- **The installer.nsh exe-name mismatch impact** — only manifests on a manual over-install of a running bridge; unverified.

---

*Seam: coder-2 owns the bridge CODE fixes (BR-02/BR-01/BR-05) and any dashboard install-button wiring. This lane is docs-only.*
