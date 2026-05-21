# FINDINGS — bridge-setup-code-mismatch (coder-1, Tier-0 READ-ONLY)

**Date:** 2026-05-21
**Lane:** bridge-setup-code-mismatch
**Type:** Tier-0 investigation, docs-only (zero src/, zero bridge/ edits)
**Verification posture:** ALL claims read against **origin/master @ 62a287f06**
(the SHA v10.0.0 was built from). The canonical `sheet-music-app/` cwd is
parked on a stale WIP branch (`fix/b1-error-envelope-sweep @ 3e1d9b4fd`) whose
working tree diverges from master by 173 lines in `main.ts` and 48 in
`route.ts`, so it was NOT trusted — every code reference below was pulled via
`git show origin/master:<path>`. `bridge/ui/index.html` is byte-identical to
master (no diff), so its working-tree read is authoritative.

---

## TL;DR

The studio bridge outage was caused by **Bug #1**, not the setup-code length.
Two genuine product bugs + one likely config drift:

1. **Bug #1 — CREDENTIAL DISCOVERY IS `exeDir`-ONLY (root cause of the outage,
   HIGH).** The bridge looks for `service-account-key.json` only in its own exe
   directory (and in `bridge-config.json`, which *also* lives in the exe dir).
   When v10.0.0 installed to a **new folder**, the new `exeDir` had neither file
   → bridge fell back to the setup screen even though the saved JSON still
   existed in the **old** install folder. Any reinstall to a different path
   re-orphans the credentials. The setup IPC handler also *writes* creds back to
   `exeDir` only, so even a successful re-credential is lost on the next path
   change.

2. **Bug #2 — SETUP-CODE INPUT CAPPED AT 6 CHARS (MED; re-credential path
   broken).** `bridge/ui/index.html` setup input is `maxlength="6"` (labeled
   "6-Digit Code", placeholder "123456") but the app generates a **10-char
   alphanumeric** code. The user physically cannot type the full code → the
   redemption endpoint rejects the truncated 6-char value with HTTP 400 "Invalid
   code format". This is the second reason re-crediting failed.

3. **Drift #3 — DEFAULT `appUrl` POINTS AT THE WRONG HOST (LOW–MED; verify).**
   The setup input defaults to `https://centralreform.firebaseapp.com`, but the
   Next.js app that actually serves `/api/bridge/setup-code` is at
   `https://www.centralreform.live` (Vercel). A user who accepts the default may
   hit a host that doesn't serve the API. User-editable, so not a hard blocker,
   but a wrong default invites failed setups.

**Interim workaround (confirmed correct by code):** drop the saved JSON as
`service-account-key.json` into the **current** (new) install folder + restart.
`main.ts` startup probes exactly that path (`exeDir/service-account-key.json`)
and starts the bridge when found — bypassing both the broken UI and the setup
code entirely. This is why Daniel's JSON-drop restores the bridge. It makes
Bugs #2/#3 **non-urgent**, but Bug #1 will recur on every future reinstall until
fixed.

---

## Bug #1 — Credential discovery is anchored to `exeDir` (root cause)

### Evidence (`bridge/src/main.ts` @ origin/master)

Startup credential resolution (`startBackgroundBridge`):

```
343  const isPackaged = app.isPackaged;
344  const exeDir = isPackaged ? path.dirname(process.execPath) : path.join(__dirname, '..');
...
351  const configFile = path.join(exeDir, "bridge-config.json");   // config ALSO in exeDir
352  let keyPathFromConfig: string | null = null;
353  if (fs.existsSync(configFile)) {
355    const cfg = JSON.parse(fs.readFileSync(configFile, 'utf8'));
358    if (cfg.keyPath) keyPathFromConfig = cfg.keyPath;
        ...
     }
365  const possibleKeys = [
366    keyPathFromConfig,                                  // sourced from exeDir/bridge-config.json
367    path.join(exeDir, "service-account-key.json"),
368    path.join(exeDir, "serviceAccountKey.json"),
369    path.join(exeDir, "firebase-key.json")
     ].filter(Boolean) as string[];
372  const foundKey = possibleKeys.find(p => fs.existsSync(p));
373  if (foundKey) { ...; await startBridge(); }
374  else {
379    console.error("Please provide a setup code ... or place 'service-account-key.json' in the installation folder manually.");
380    mainWindow?.webContents.send('require-setup');     // <-- shows setup overlay
     }
```

The IPC handler that the setup overlay calls writes the downloaded key **back to
`exeDir`** as well:

```
400  ipcMain.handle('submit-setup-code', async (_event, { appUrl, code }) => {
417    const exeDir = isPackaged ? path.dirname(process.execPath) : path.join(__dirname, '..');
419    const keyPath = path.join(exeDir, "service-account-key.json");
420    fs.writeFileSync(keyPath, JSON.stringify(data.credentials, null, 2));
422    const configPath = path.join(exeDir, "bridge-config.json");
428    fs.writeFileSync(configPath, JSON.stringify(cfg, null, 2));
430    process.env.FIREBASE_SA_KEY_PATH = keyPath;
     ...
```

### Why this caused the outage

- **Every** credential candidate resolves under `exeDir` (the install folder),
  or under `bridge-config.json` which itself lives in `exeDir`. There is **no
  install-path-independent location** in the search list (no
  `app.getPath('userData')`, no `%APPDATA%`, no `%PROGRAMDATA%`, no registry).
- v10.0.0 installed to a **different directory** than the prior 3.1.0/pkg build
  (electron-builder NSIS default install path differs from the old packaging),
  so the new `exeDir` was empty of creds. `foundKey` was `undefined` →
  `require-setup` fired → bridge showed the setup screen, **with the real JSON
  still sitting safely in the old folder**. This matches the corrected
  diagnosis in the lane prompt and the `[[project_bridge_update_ops]]` memory
  ("cred is `service-account-key.json` in the exe dir ONLY → reinstall to a new
  path orphans it").
- Because the IPC write-back also targets `exeDir`, even a *successful*
  re-credential persists only in the current install folder → the **next**
  reinstall to a new path orphans it again. The bug is self-perpetuating across
  updates.

### Proposed fix (bridge/** → needs a build; do NOT ship without go)

Read **and** write credentials at a stable, install-independent location, with
exeDir kept as a fallback + one-time self-migration:

- Introduce `const credDir = app.getPath('userData')` (Windows resolves to
  `%APPDATA%\CentralReform Bridge` — survives reinstall and path change for the
  single studio operator). `app.getPath('userData')` is keyed by the app `name`,
  not the install path, so it is stable across NSIS reinstalls.
- **Startup search order:** env override (`FIREBASE_SA_KEY_PATH`) →
  `credDir/service-account-key.json` → existing exeDir candidates (legacy /
  manual JSON-drop) → `bridge-config.json.keyPath`. Move `bridge-config.json` to
  `credDir` too (read both locations during the transition).
- **Self-migration:** if a key is found in `exeDir` but not in `credDir`, copy it
  to `credDir` on startup so the *next* reinstall is non-destructive. This also
  auto-rescues the current JSON-drop installs once v10.0.1 runs.
- **IPC write target:** `submit-setup-code` writes the downloaded key + config to
  `credDir`, not `exeDir`.
- Keep the manual JSON-drop-into-exeDir path working (it is the emergency
  recovery valve) — it just becomes the fallback, not the only home.

Net effect: a future stalled-update-then-manual-reinstall (see auto-update note
below) no longer takes the bridge down.

---

## Bug #2 — Setup-code input maxlength=6 vs 10-char alphanumeric code

### Evidence

App generator — `src/app/api/bridge/setup-code/route.ts` @ origin/master:

```
20  const CODE_LENGTH = 10
22  function generateCode(): string {
23    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789" // No 0/O/1/I confusion
26    for (let i = 0; i < CODE_LENGTH; i++) { code += chars[bytes[i] % chars.length] }
    }
...
78  if (!code || code.length !== CODE_LENGTH) {        // redemption REQUIRES exactly 10
79    return NextResponse.json({ error: "Invalid code format" }, { status: 400 })
    }
76  const code = url.searchParams.get("code")?.toUpperCase().trim()   // server uppercases
```

Bridge UI — `bridge/ui/index.html` (byte-identical to master):

```
265  <p>Connect this bridge to your CentralReform cloud account via a 6-digit setup code.</p>
274  <label>6-Digit Code</label>
275  <input type="text" id="setup-code" placeholder="123456" maxlength="6"
276        style="letter-spacing: 2px; text-align: center; font-size: 18px;" />
```

### Root cause

- The **sole hard blocker is `maxlength="6"`** — it physically truncates input to
  6 characters, so a 10-char code can never be fully entered. The redemption
  endpoint then sees a 6-char `code` and returns 400 (`code.length !== 10`).
- The input is `type="text"` with **no `pattern`** and no numeric restriction, so
  alphanumeric characters *can* be typed — the charset itself is not blocked,
  only the length. The "6-digit" / "123456" copy + label are **misleading but
  cosmetic**; they reflect an older 6-digit-numeric code design the app route has
  since outgrown.

### Submit path is clean (no secondary truncation)

- `submitSetup()` (index.html:359-360) reads `setupCodeBtn.value.trim()` — no
  truncation, no `.toUpperCase()` (server handles case at route.ts:76).
- IPC `submit-setup-code` (main.ts:399) builds
  `${appUrl}/api/bridge/setup-code?code=${encodeURIComponent(code)}` — passes the
  value through unmodified. So once `maxlength` is fixed the full code flows
  end-to-end.

### Proposed fix (minimal, bridge/** → needs a build)

Load-bearing change is one attribute; the rest is cosmetic-but-recommended:

```html
<!-- line 265 copy -->
<p>Connect this bridge to your CentralReform cloud account via a 10-character setup code.</p>
<!-- line 274-276 -->
<label>Setup Code</label>
<input type="text" id="setup-code" placeholder="ABCD234XYZ" maxlength="10"
       autocapitalize="characters" spellcheck="false"
       style="letter-spacing: 2px; text-align: center; font-size: 18px; text-transform: uppercase;" />
```

Notes:
- `maxlength="10"` is the only change that *fixes* the bug. Everything else is
  UX polish (`text-transform` is display-only; the real value isn't uppercased by
  CSS, but the server already uppercases at route.ts:76, and the charset is all
  uppercase letters + digits 2-9, so case never breaks redemption).
- Optionally uppercase in JS for honesty: `const code = setupCodeBtn.value.trim().toUpperCase();`

---

## Drift #3 — Default `appUrl` host mismatch (verify)

### Evidence

```
bridge/ui/index.html:269-270
  <input type="url" id="setup-url" placeholder="https://..."
         value="https://centralreform.firebaseapp.com" />
```

Canonical production host that serves the API (origin/master):
- `scripts/backfill-heal-metadata.ts:24` → `const MCP_ENDPOINT = "https://www.centralreform.live/api/mcp"`
- every `e2e/*.spec.ts` → `PLAYWRIGHT_BASE_URL=https://www.centralreform.live`

The only `firebaseapp.com` reference in app code is `src/proxy.ts:48`, a CSP
`frame-src` allowance for Firebase **Auth** popups — not the app host.

### Assessment

The default appUrl `centralreform.firebaseapp.com` (Firebase Hosting) is almost
certainly NOT where the Next.js route `/api/bridge/setup-code` is served
(that's the Vercel deployment at `www.centralreform.live`). If Firebase Hosting
does not rewrite `/api/**` to the Vercel app, the setup-code POST/GET 404s even
with a correct 10-char code. **Verify** whether `firebaseapp.com` proxies the API
(Daniel/supervisor can confirm in seconds). Field is user-editable, so a wrong
default only bites users who accept it — but it should default to the host that
actually works.

**Proposed:** default `value="https://www.centralreform.live"` (pending Daniel's
confirmation of the studio-reachable host).

---

## Drift history — undatable from this clone (honest limitation)

`git log` on both `route.ts` and `bridge/ui/index.html` returns a **single
commit** (`3fadb63a4`), and `git rev-parse --is-shallow-repository` → `true`
with `.git/shallow` present. Per `[[feedback_auditor_shallow_clone_check_before_panic]]`,
the lone commit is the **shallow-clone boundary**, NOT the real introduction —
the true drift timeline predates the clone depth and cannot be dated here. `-S`
pickaxe for both `CODE_LENGTH = 10` and `maxlength="6"` also bottoms out at the
same boundary commit, and there is no prior `CODE_LENGTH = 6` in reachable
history.

The **drift is nonetheless certain from content**: the UI is authored against a
6-digit-numeric scheme ("6-digit", "123456", `maxlength="6"`) while the app route
emits a 10-char alphanumeric code whose charset deliberately excludes 0/O/1/I
(i.e. designed for transcription of *letters + digits*). The two are
structurally incompatible regardless of when they diverged; the UI was simply
never updated when the route moved to 10-char alphanumeric.

---

## Auto-update SmartScreen / relaunch stall — note for the next release

The lane prompt asks whether v10.0.1 should also address the auto-update stall
that forced the manual reinstall (which, via Bug #1, orphaned the creds). This
was **not reproduced in this read-only pass**; flagging the most likely
candidates so the next release installs cleanly:

- **Bug #1 is the higher-leverage fix here.** A durable, install-path-independent
  credential location means *any* future reinstall — whether auto-update works or
  Daniel runs the installer by hand — is non-destructive. Ship Bug #1 and the
  outage class is closed even if the auto-update path stays imperfect.
- **SmartScreen on a low-reputation signed binary:** v10.0.0 was signtool-signed
  (master-tip `9d221e3bf`), but a freshly-signed (non-EV / low-reputation) cert
  still trips SmartScreen on first installs, which can read as a "stall" if the
  prompt is off-screen or unattended. `[[project_bridge_update_ops]]` already
  notes "tray auto-update stalls → run the installer directly." Confirm whether
  the stall was a SmartScreen prompt vs an electron-updater relaunch failure
  before investing in a code fix.
- **electron-updater relaunch on NSIS:** the BR-03 deferred-install logic
  (`autoInstallOnAppQuit = true` + idle-install watch, main.ts checkForUpdates)
  is sound; verify the v10.0.0→v10.0.1 delta actually applies via the tray
  "Install update" on a controlled test before relying on it in production.
- **Recommendation:** before any future release, do a controlled tray-update
  test studio-side; ship Bug #1 regardless so manual reinstalls stop being
  destructive.

---

## Recommended v10.0.1 fix bundle (PROPOSAL — needs explicit supervisor + Daniel go)

Bundle all three into one bridge release so the studio only updates once:

1. **Bug #1 (HIGH):** durable credential location (userData read+write + exeDir
   fallback + self-migration). *This is the one that stops the outage recurring.*
2. **Bug #2 (MED):** `maxlength="6"` → `"10"` + label/placeholder/copy refresh.
3. **Drift #3 (LOW–MED):** default appUrl → `www.centralreform.live` (after host
   confirmation).

**Release caveat:** all three touch `bridge/**` → require a new electron build +
GitHub release (v10.0.1) — the **same release path that just caused the outage**.
Do NOT build/publish without explicit go. The JSON-drop workaround keeps the
bridge live in the meantime, so this is non-urgent. When greenlit, follow
`[[project_bridge_release_build]]` (tsconfig must exclude `src/__tests__`; `gh`
asset names hyphen-renamed to match `latest.yml` url) and do a controlled
tray-update test before trusting auto-update.

---

## Files referenced (read-only, origin/master @ 62a287f06)

- `bridge/src/main.ts` — startup cred discovery (343-380), submit-setup-code IPC (400-430)
- `bridge/ui/index.html` — setup overlay (262-282), submitSetup() (358-385)
- `src/app/api/bridge/setup-code/route.ts` — CODE_LENGTH=10 (20), generateCode (22-30), redemption length check (78)
- `src/proxy.ts:48` — firebaseapp.com is CSP frame-src only (not the API host)
- `scripts/backfill-heal-metadata.ts:24` — canonical API host www.centralreform.live
