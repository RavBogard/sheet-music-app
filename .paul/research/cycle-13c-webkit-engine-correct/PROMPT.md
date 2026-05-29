# Cycle-13c Cowork — Real-WebKit engine-correct re-verify (offline + stickiness matrix)

> **Drafted 2026-05-29 against deployed surface at origin/master `952edac4c3`** — every
> route / component / hook / route-handler / MCP tool name / e2e spec / harness helper /
> SHA cited below was verified via `git ls-tree` + `git show <rev>:<path>` against that
> SHA per `[[feedback_cowork_prompt_verify_before_write]]` (verify-every-ref pass count
> in the lane SHIP-NOTICE). **Re-confirm at run-time** via `git log -1 origin/master`
> and note any drift inline in §A of the REPORT.
>
> **This axis (cycle-13, axis C of 4):** the band runs Perform mode on **6× standard
> 11" iPads — real Safari/WebKit at 820×1180 portrait** (`[[project_band_ipad_hardware]]`).
> Cycle-12 run-2 (`.paul/research/cycle-12-saturday-readiness/REPORT-run2-harness-grade.md`)
> *intended* to probe that engine — the supervisor pre-ran `npx playwright install webkit`
> — but the cowork sandbox lacked the WebKit system shared libraries and had no
> `sudo`/`apt`, so the WebKit browser **could not launch** and every probe silently fell
> back to **Chromium-with-an-iPad-UA at 1180×820**. The run was honest about it (§A header
> note + §F items #5/#6), but the consequence stands: **the engine-specific behaviors on
> the surface the band actually uses are UN-PROBED.** This axis closes **FU-c12-9** by
> re-expressing the same offline + stickiness matrix as **real-WebKit probes** with an
> environment that **FAILS LOUD if real WebKit is not the engine** — never silently
> substitutes again.
>
> **Read first:** `.coord/cycle-13-CHARTER.md` (shared frame: anchor moments, anti-patterns,
> binding constraints). This PROMPT is axis C only — **disjoint from 13a/13b/13d; no
> cross-axis synthesis.**

---

## §0 — What this axis breaks vs the cycle-12 PARENT (required disclosure)

The PARENT is cycle-12 (`.paul/research/cycle-12-saturday-readiness/PROMPT.md` + its two
REPORTs). This axis intentionally departs from it on these points:

1. **The engine is the finding axis, not the surface.** Cycle-12 graded *what* survives
   offline/reload. This axis re-grades the SAME cells but asks a different question:
   **does the verdict hold on real WebKit, or was it a Chromium artifact?** A cell that
   PASSED on the Chromium substitute and FAILS on WebKit is the highest-value finding
   this axis can produce — it is a bug the band feels that no prior cycle could see.

2. **Fail-loud-on-substitution is a HARD-BLOCK boot gate** (§1). The PARENT had no engine
   assertion (it couldn't — it didn't know it was on Chromium until post-run forensics).
   This axis refuses to produce a single matrix verdict until it has **proven** the engine
   is WebKit. No silent fallback. If real WebKit can't launch, the run emits a BLOCKER and
   stops — a NOT-RUN matrix is a better outcome than a Chromium-mislabeled-as-WebKit matrix.

3. **In-app gesture, not full-nav, for the offline next-track cell (closes FU-c12-8).**
   Cycle-12 run-2 §E Cells 4+5 were PARTIAL because the probe used `location.href` full-nav,
   which structurally fails offline on ANY engine (the HTML request aborts) and therefore
   measured the probe mechanic, not the app. This axis swaps that primitive for the **real
   in-app next-track control** — the "Next song" button in `SongNavigation.tsx` — so the
   cell measures the React-state + IndexedDB-chart path the musician actually triggers.

4. **No service-day framing.** Per `[[feedback_no_saturday_framing]]` (BINDING): this axis
   does not anchor on a specific service date, downbeat, or "ship-by" gate. The band uses
   these iPads every week; the engine-correctness question is permanent, not deadline-shaped.
   Frame findings around the musician's hands on the real device, never around a calendar.

**Anti-patterns broken** (charter §3 — this axis breaks ≥3): **AP-1** (every cell ties to an
anchor moment + a musician-felt cost, not a DOM measurement), **AP-5** (first-person
musician POV on the divergence cells), **AP-7** (multi-state: real-WebKit portrait +
landscape + a Chromium control-lane so divergence is *measured*, not asserted). Also
breaks the PARENT's own structural vulnerability to **AP-2** by staying narrow (one engine
question, one matrix) rather than roaming.

---

## §1 — Environment & engine-correctness (the load-bearing section)

This axis exists because the engine was wrong last time. Solve that first; everything
else is the PARENT's matrix re-run.

### §1.1 — The root cause (verified)

`cycle-4/harness/install-harness.sh` already runs:

```bash
npx --yes playwright install chromium firefox webkit --with-deps
```

`--with-deps` is *supposed* to `apt-get install` the WebKit system libraries
(`libevent-2.1.so.7`, `libenchant-2-2`, `libsecret-1-0`, `libGLESv2`, et al.). But
`--with-deps` shells out to `apt` as **root** — and the cowork sandbox runs unprivileged
with no `sudo`/`apt`. So the browser binary downloads, the dep install silently no-ops,
and `webkit.launch()` later throws `Host system is missing dependencies to run browsers`.
Cycle-12 run-2 caught the throw and fell back to the `chromium` project rather than
aborting. **That fallback is the bug this axis forbids.**

### §1.2 — Engine-provisioning options (RUN-ER: pick the first that works, document which)

The cowork RUN needs an environment where real WebKit launches. Evaluate in order:

- **(a) PREFERRED — Microsoft Playwright Docker image.** Run the cowork harness inside
  `mcr.microsoft.com/playwright:v<matching-version>-jammy` (or `-noble`). The image ships
  every browser **with its system libs already baked in** as root layers — no `apt` at
  run-time. This is the cleanest "real WebKit" path. Match the image tag to the
  `playwright` version `install-harness.sh` pulls (read `package.json` / the installed
  `playwright` version at run-time; do NOT hard-code a version that may drift). Mount the
  warm worktree (FU-c12-5) into the container; run `npm ci` + the probes inside it.
- **(b) Host-level dep install via a privileged warm-worktree (depends on FU-c12-5).** If
  the FU-c12-5 warm-worktree productization can run `npx playwright install webkit
  --with-deps` (or a hand-rolled `apt-get install <the 4 libs>`) **as root once at
  worktree-warm time**, the libs persist for the cowork run. Only viable if the warm step
  has privilege; the cowork run itself does not.
- **(c) LAST RESORT — explicit, fail-loud engine-substitution caveat.** If neither (a) nor
  (b) is available at run-time, the run does **NOT** silently substitute. It emits a
  BLOCKER to the supervisor inbox, marks the entire matrix **NOT-RUN — real WebKit
  unavailable**, and stops. (Optionally it MAY run the Chromium control-lane alone and
  label every cell `⊘ engine-unavailable — Chromium-only control, NOT a WebKit verdict`.)
  The whole point of axis C is to avoid (c)'s silent form; the loud form is acceptable
  data ("we still can't get WebKit") but is NOT a verdict on the band's engine.

**Phase-3 prerequisites (flag both to supervisor BEFORE the run):** this axis's RUN needs
(i) a **harness-warm worktree** per `[[feedback_cowork_harness_warm_worktree]]` + FU-c12-5
(`npm ci` + Playwright installed pre-staged), AND (ii) **real-WebKit system libs** per
(a)/(b) above. A bare-checkout or lib-less sandbox forces outcome (c). Do not start the
run until both are confirmed.

### §1.3 — Engine assertion (HARD-BLOCK boot gate — runs BEFORE any matrix cell)

Prove the engine is WebKit three independent ways; ALL must pass or the run BLOCKS:

```js
import { webkit, devices } from "@playwright/test";

// 1. Launch must succeed on the WebKit browserType itself (not a project alias).
//    If this throws "missing dependencies", that IS the §1.1 failure — emit BLOCKER, stop.
const browser = await webkit.launch();        // NOT chromium.launch()
if (browser.browserType().name() !== "webkit") {
  throw new Error("ENGINE-BLOCK: browserType is not webkit");
}

// 2. Open the band's real viewport and assert the runtime UA is WebKit, NOT Chromium.
const context = await browser.newContext({
  ...devices["iPad Pro 11"],
  viewport: { width: 820, height: 1180 },     // the real band portrait (playwright.config.ts ipad-webkit)
});
const page = await context.newPage();
await page.goto(`${baseUrl}/perform`, { waitUntil: "domcontentloaded" });
const ua = await page.evaluate(() => navigator.userAgent);
//   Real WebKit UA contains "AppleWebKit/…(KHTML, like Gecko) Version/… Safari/…"
//   and CRUCIALLY does NOT contain "Chrome/" or "Chromium/".
if (/Chrome\/|Chromium\//.test(ua) || !/AppleWebKit\//.test(ua) || !/\bSafari\//.test(ua)) {
  throw new Error(`ENGINE-BLOCK: UA is not real WebKit Safari: ${ua}`);
}

// 3. A WebKit-only DOM signature: GPUITextScaling-free, and the WebKit-specific
//    `navigator.standalone` exists on Safari (undefined on Chromium). Belt-and-braces.
const isWebKitDom = await page.evaluate(() =>
  typeof navigator.standalone !== "undefined" || /Apple/.test(navigator.vendor)
);
if (!isWebKitDom) throw new Error("ENGINE-BLOCK: DOM signature is not WebKit");

// Log the proven engine into §A of the REPORT verbatim:
//   "Engine proven: WebKit — UA=<ua>; browserType=webkit; vendor=<navigator.vendor>"
```

Record the proven engine + the exact UA string in the REPORT §A header. If the run had
to use a Chromium control-lane for contrast (§4), label that lane's UA separately and
NEVER let a Chromium verdict masquerade as a WebKit one.

### §1.4 — Boot pre-flight (after §1.3 passes; HARD-BLOCK on failure → BLOCKER, stop)

1. `git rev-parse --is-shallow-repository` → `false` (shallow boundary lies about ancestry,
   `[[feedback_supervisor_verify_commit_diff_not_subject]]`). If `true`, `git fetch --unshallow origin`.
2. `git log -1 origin/master` → expected `952edac4c3` or later; if advanced, re-run the
   verify-every-ref preamble against the new tip and note drift in §A.
3. `GET https://www.centralreform.live/perform` → 200, paints `PublicSetlistListing`.
4. `BEARER=$(node scripts/supervisor-prod-bearer.mjs)` (reads `SUPERVISOR_PROD_BEARER` from
   gitignored `.env.local`, `[[feedback_supervisor_bearer_persistence]]`); assert
   `BEARER` starts `crl_live_` and is ~30+ chars. **Never** write the bearer to any file
   under `sheet-music-app/`; redact as `***redacted***` in the REPORT.
5. (Optional) `MCP_ADMIN_TEST_SESSION_SECRET` in env. If set, the Daniel/admin identity
   (§2.3) is mintable via `roleGate.as('admin')`; if unset, mark every admin cell
   `⊘ skipped — secret unset` and run with the two musician identities only.
6. `list_setlists({})` (admin bearer) returns ≥1 row including the real B'nei Mitzvah
   reference setlist `cd2010f4-8bb0-4f54-ba2d-8a79d83729a6` (read-only reference — confirm
   it exists at run-time; **NEVER mutate this id**).

### §1.5 — Sandbox: clone the reference setlist to a `c13c-webkit`-prefixed fixture

> Verified against `src/lib/mcp/tools/clone-setlist.ts` at `952edac4c3`: arg shape is
> `{sourceSetlistId, newName?, newEventDate?, copyServiceNotes?}`; the clone auto-stamps
> `isTest:true` when `newName` matches `TEST_SETLIST_NAME_PATTERN` (`/^\[(TEST|CYCLE\d+-|CF\d+-)/i`)
> OR the caller uid is test-shaped. `[CYCLE13C-...]` matches the regex. (Re-confirm the arg
> shape at run-time with `git show origin/master:src/lib/mcp/tools/clone-setlist.ts`.)

```js
const clone = await mcp.call("clone_setlist", {
  sourceSetlistId: "cd2010f4-8bb0-4f54-ba2d-8a79d83729a6",
  newName: "[CYCLE13C-webkit] real-WebKit engine-correct probe",
  copyServiceNotes: false,
});
const fixtureSetlistId = clone.setlistId;
const cloneShape = await mcp.call("get_setlist", { id: fixtureSetlistId });
// Assert cloneShape.isTest === true (bracketed name matches the regex). If not →
// supervisor BLOCKER + stop (the probe MUST NOT mutate or publicly leak real data).
```

Capture `cloneShape`: trackCount, songCount, and every track's `{id, type, position,
title, key, fileId}`. This is your reference shape for the 20-track sweep. Every write
probe hits the clone, NEVER `cd2010f4`. Per the err-public invariant
(`[[feedback_err_public_not_gated]]`) the clone WILL appear on the public `/perform`
landing UNLESS `isTest:true` — which the name guarantees. Confirm before continuing.

### §1.6 — Identity provisioning (per `[[feedback_sandbox_test_isolation]]`)

Create-side kwarg is `uidPrefix`; cleanup-side kwarg is `prefix` (same value, different
name — `src/lib/mcp/tools/test-tokens.ts`). **NEVER** call `cleanup_all_test_data` without
`prefix` (sweeps sibling cowork instances per `[[feedback_self_inclusion_test_fixtures]]`).
Use `uidPrefix: "c13c-webkit"` (lowercase, single hyphens, ≤32 chars — passes the
`test-tokens.ts` regex).

```js
const aviva = await mcp.call("create_test_account", { role: "musician",   uidPrefix: "c13c-webkit" });
const david = await mcp.call("create_test_account", { role: "band_leader", uidPrefix: "c13c-webkit" });
// Daniel/admin — only if MCP_ADMIN_TEST_SESSION_SECRET is set, via roleGate.as('admin')
// (routes through the secret-gated /api/auth/admin-test-session; header is
// `x-admin-test-secret` — NOT the long name. Verified roles.ts + run-2 §0 correction.)
```

Hydrate each identity into a **WebKit** Playwright context with Web-SDK auth via
`mintSession({ baseUrl, bearer, uid, firebaseAuth })` (`cycle-4/harness/lib/probe.mjs`,
`mintSession` at line 70; `firebaseAuth` optional → `signInWithCustomToken`). META-003
caveat: a bare `/api/auth/test-session` cookie hydrates the session but NOT the Firebase
Web-SDK listeners — pass `firebaseAuth` or the offline IndexedDB / Firestore-cache cells
will read empty and the matrix lies. Per `[[feedback_cowork_real_harness]]`, `mintSession`
needs `NEXT_PUBLIC_PROBE_HARNESS_AUTH=1` on the deployed build to fully hydrate; if the
target build lacks it, mark the authed cells `⊘ web-sdk-unhydrated` and run the cells that
are uid-agnostic (most offline cells are — see §3 note) anonymously against the clone URL.

### §1.7 — Contexts: real WebKit, both orientations

Per `playwright.config.ts` projects `ipad-webkit` (820×1180) + `ipad-webkit-landscape`
(1180×820). Primary is **portrait** (the music-stand orientation); landscape is the cheap
second axis. Open contexts off the **WebKit** browser proven in §1.3 — never reuse a
Chromium context for a WebKit verdict.

```js
async function openIpadContext({ orientation = "portrait" } = {}) {
  return await browser.newContext({   // browser === webkit instance from §1.3
    ...devices[orientation === "landscape" ? "iPad Pro 11 landscape" : "iPad Pro 11"],
    viewport: orientation === "landscape" ? { width: 1180, height: 820 } : { width: 820, height: 1180 },
    serviceWorkers: "allow",   // REQUIRED — the SW shell-cache cell (§3 cell SW) needs it
  });
}
```

---

## §2 — Scope (the matrix, re-expressed as engine probes)

Same anchor moments as the PARENT — **A1 setup-prep · A2 between-songs · A4 sanctuary
edge**; **A3 mid-service change is OWNED BY axis 13a, OUT here.** Same bug-classes
(stickiness, fresh-tablet, auth-divergence). The re-expression: each cell carries an
**engine-divergence-risk** tag (HIGH / CONTROL) so the RUN spends its 75 min on the cells
that can actually diverge.

### §2.1 — Divergence-risk ranking (the design judgment — `/ui-ux-pro-max` lens)

| # | Cell | Anchor | Engine-divergence risk | Why WebKit may differ from the Chromium substitute |
|---|------|--------|------------------------|----------------------------------------------------|
| **WL** | Wake-lock feedback pill (`KeepAwakeToggle` `lastError` `'hidden'`/`'denied'`) | A2/A4 | **HIGH** | iOS Safari's Screen Wake Lock API (16.4+) auto-releases on `visibilitychange→hidden` with different timing + rejects with `NotAllowedError` under different transient-activation rules than Chromium. `use-wake-lock.ts:100` classifies `hiddenAtRequest` BEFORE the try and maps `NotAllowedError`→`hidden`/`denied` (lines 124-126). Run-2 validated this by **monkey-patching** `navigator.wakeLock.request` on Chromium — on real WebKit the **native** rejection + auto-release path is what the musician hits, and it is the prime suspect. |
| **OFF** | Already-loaded chart readable when network drops (react-pdf via `blob:` URL) | A4 | **HIGH** | The `goOffline` primitive (`e2e/helpers/gestures.ts:57`) aborts http(s) but leaves `blob:` intact **specifically because** `context.setOffline(true)` breaks `blob:` fetches on **ipad-webkit** — the helper's own comment (`gestures.ts:50-56`) is empirical WebKit evidence. The blob: lifetime + offline read is the single most engine-dependent cell; a Chromium substitute provably cannot validate it. |
| **SW** | `/perform`-shell-cache SW survives offline RELOAD (`467e788ed5`) | A4 | **HIGH** | `public/perform-shell-sw.js` is a hand-rolled NetworkFirst SW registered by `registerPerformShellSW()` (`src/components/performance/perform-shell-sw-register.ts`, mounted `src/app/perform/layout.tsx:151`). iOS WebKit's SW + Cache API differs from Chromium: aggressive 7-day + storage-pressure eviction, different activation/`clients.claim` timing, and **iOS overscroll pull-to-refresh** can trigger the very reload the SW must survive. The FIX (`467e788ed5`, closing F-C12-R2-009) was NEVER exercised on real WebKit. **This is the headline cell: did the fix actually fix it on the band's engine?** |
| **NEXT** | Offline next-track via the **in-app** "Next song" control (closes FU-c12-8) | A2 | MED | `SongNavigation.tsx` renders `aria-label="Next song"` / `"Previous song"` → `useMusicStore` `nextSong()`/`prevSong()` → `queueIndex` → `PDFOverlay` `onNavigate` (`PDFOverlay.tsx:159`). The React-state path likely survives offline on both engines, but the blob: chart-bytes read on the new track couples to cell OFF. **Use the real button, not `location.href`.** |
| **URL** | Active-track-in-URL stickiness across 20 tracks (`595153b192`) | A2 | CONTROL | `history.replaceState` + `useState` seed (`SetlistPerformClient.tsx:99-131`). Engine-agnostic JS; expected PASS on both. iOS bfcache + rapid `replaceState` is a minor watch-item. Run to confirm engine-agnosticism + as the Chromium-vs-WebKit control. |
| **TR** | Transpose `+N` indicator persistence across track jumps (`fd9e5c8439`) | A2 | CONTROL | `PerformanceToolbar.tsx` `signedOffset`/`buttonLabel` + `use-musician-transposition.ts`. React state + CSS pill; render-only divergence risk. Control cell. |
| **SEC** | Section-divider URL bare-path fallback (`ee576ae0ae`) | A2 | CONTROL | `SetlistPerformClient.tsx` section special-case. Engine-agnostic; control. |

**The run's time budget concentrates on WL + OFF + SW (the HIGH cells).** NEXT is MED.
URL/TR/SEC are CONTROL cells: run them once each on WebKit + once on the Chromium control
lane; if a CONTROL cell diverges, that itself is a surprising finding worth promoting.

### §2.2 — The Chromium control lane (so divergence is MEASURED, not asserted — AP-7)

For each HIGH cell, run the identical probe twice: once on the §1.3 WebKit browser, once
on a `chromium` context at the same 820×1180 + iPad UA (the exact substitute run-2 used).
A cell is a **DIVERGENCE finding** iff `verdict(WebKit) !== verdict(Chromium)`. A cell that
FAILS on both is a real bug but NOT engine-specific (note it; it's not this axis's headline).
A cell that PASSES on Chromium and FAILS on WebKit is the **axis-C jackpot** — a band-felt
bug invisible to every prior cycle. Record both columns in §E.

### §2.3 — Three identities (charter multi-state; AP-7)

- **Aviva** — `musician`, signed-in band member; the read-side weekly-flow path.
- **David** — `band_leader`; broader listing scope + writes to the clone (no `cd2010f4` writes).
- **Daniel** — `admin` via `roleGate.as('admin')`, CONDITIONAL on `MCP_ADMIN_TEST_SESSION_SECRET`.

Honesty note carried from run-2 §B principle #1: the offline chart-overlay cells (WL/OFF/SW)
are **uid-agnostic** (IDB chart cache keyed on `fileId`, wake-lock state is React-local, SW
is browser-global). Persona divergence lives one layer up at the listing page + write-back
paths. Run the persona axis where it carries information (auth-divergence at the listing /
`list_setlists` scope) and name it **"control"** on the uid-agnostic offline cells rather
than running 3 redundant identical cells.

---

## §3 — Walkthrough plan (~75 min budget — single-thread per `[[feedback_cowork_real_harness]]`)

| Phase | Time | Vehicle |
|-------|------|---------|
| §1 engine assertion + boot + clone + identity mint | ~12 min | `webkit.launch()` proof + MCP calls + WebKit context setup |
| **§3.A — WL: wake-lock on real WebKit (HIGH)** | ~15 min | native `navigator.wakeLock` + `visibilitychange` + denied path, WebKit vs Chromium control |
| **§3.B — OFF: offline blob: chart readability (HIGH)** | ~12 min | `waitChartCached` → `goOffline` → pan/scroll, WebKit vs Chromium control |
| **§3.C — SW: shell-cache offline RELOAD (HIGH, headline)** | ~15 min | online load → `goOffline` → `page.reload()` → assert chart paints from SW cache, WebKit vs Chromium control |
| **§3.D — NEXT + URL + TR + SEC (MED/CONTROL)** | ~12 min | in-app "Next song" offline; 20-track URL sweep; transpose 4-sample; section fallback |
| Cleanup + REPORT write | ~9 min | `cleanup_all_test_data({prefix:"c13c-webkit"})` + §A–§G |

### §3.A — WL (wake-lock, ~15 min) — HIGH

Discovery: find the toggle via `getByRole('button', { name: /keep screen on/i })`
(`KeepAwakeToggle.tsx:97,110` aria-label "Keep screen on"). Confirm `aria-pressed="false"`
+ `navigator.wakeLock` present. Then on **real WebKit** (no monkey-patch — that's the whole
point):

1. **Hidden path:** drive `document.visibilityState → 'hidden'` + dispatch `visibilitychange`,
   then click the toggle. Expected pill copy: `"Tab not focused — tap chart to retry"`
   (`ERROR_COPY.hidden`, `KeepAwakeToggle.tsx:69`). On WebKit the request may reject
   *natively* — capture whether the verdict is `'hidden'` (per `hiddenAtRequest`) or
   diverges.
2. **Acquire + auto-release:** acquire the lock with the tab visible (expect
   `aria-pressed="true"`, label `"Screen lock on — tap to release"`), then hide the tab and
   restore it. WebKit auto-releases on hide; assert whether the pill / `aria-pressed`
   reflects re-acquisition correctly or strands a stale "on" state.
3. **Denied path:** if WebKit rejects without transient activation, capture
   `"Wake-lock blocked — tap again to retry"` (`ERROR_COPY.denied`, line 70).

Run the SAME 3 sub-probes on the Chromium control context. **Divergence finding** if the
pill copy, `aria-pressed` end-state, or auto-release timing differs.

### §3.B — OFF (offline blob: chart, ~12 min) — HIGH

1. Open `/perform/setlist/<fixtureSetlistId>/track/<song-trackId>` on WebKit; let the chart
   paint; `await waitChartCached(page, fileId)` (`gestures.ts:79`) to confirm the bytes
   landed in the `crc-offline` IDB store.
2. `await goOffline(page)` (`gestures.ts:57` route-abort — NOT `setOffline`).
3. Pan / scroll / page-turn the already-rendered chart. **Pass:** chart stays readable, no
   white-screen, no error overlay (the blob: read survives offline).
4. Chromium control: identical. **Divergence finding** if the blob: chart survives on one
   engine and blanks on the other (the `gestures.ts:50-56` note predicts WebKit is the
   fragile one — confirm or refute on the real engine).

### §3.C — SW (shell-cache offline RELOAD, ~15 min) — HEADLINE

1. Confirm the SW registered: `await page.evaluate(() => navigator.serviceWorker.getRegistrations())`
   includes a registration scoped to `/perform/` from `/perform-shell-sw.js` (NOT the root
   `/sw.js` tombstone — verify `curl -s https://www.centralreform.live/sw.js | head -3`
   still shows the tombstone and `/perform-shell-sw.js` is the live one). Wait for
   `activated` state.
2. Online: open `/perform/setlist/<fixtureSetlistId>/track/<trackId>`; let it fully load
   (HTML + `_next/static` chunks now in the `perform-shell-v*` cache).
3. `await goOffline(page)`; then `await page.reload()`.
4. **Pass:** the perform shell HTML + chunks serve from the SW cache; the page paints (chart
   bytes then load from the `crc-offline` IDB store). **Fail:** `net::ERR_FAILED` / browser
   offline page — i.e. the `467e788ed5` fix does NOT hold on WebKit.
5. **iOS overscroll-reload variant:** simulate the pull-to-refresh gesture (or a second
   `reload()`) to confirm the SW survives the iOS-native reload trigger, not just a
   programmatic one.
6. Chromium control: identical. **The headline divergence finding** is "SW reload PASSES on
   Chromium, FAILS on WebKit" — that means F-C12-R2-009 is only fixed on the engine the
   band doesn't use. Capture SW registration state, cache names, and the reload network
   trace on both engines.

### §3.D — NEXT + URL + TR + SEC (~12 min) — MED/CONTROL

- **NEXT (closes FU-c12-8):** open a song track on WebKit; `await waitChartCached`;
  `goOffline`; click `getByRole('button', { name: 'Next song' })` (`SongNavigation.tsx:53`);
  assert the next track's chart paints from IDB within ~6s and the URL advances via
  `replaceState`. This measures the real in-app path, not a full-nav. Compare WebKit vs
  Chromium.
- **URL (control):** sweep all 20 cloned tracks — `goto(/perform/setlist/<id>/track/<trackId>)`
  → reload → assert URL preserved (songs) / bare-path fallback (sections, per `ee576ae0ae`).
  Confirm engine-agnosticism; flag any WebKit-only `replaceState`/bfcache surprise.
- **TR (control):** transpose `+N` on a head track; jump to 3 others; assert the toolbar
  `+N` pill is per-track (`fd9e5c8439`). Render-only WebKit check.
- **SEC (control):** open the 4 section dividers; assert bare-path fallback (`ee576ae0ae`).

---

## §4 — Boot order (the cowork instance's runbook)

1. Read this PROMPT end-to-end + `.coord/cycle-13-CHARTER.md`.
2. Read `cycle-4/harness/README.md` (the `npm run stress` reality + `mintSession`).
3. **§1.2 confirm the engine environment** (Docker image / privileged warm-worktree). If
   neither is available → BLOCKER, stop (outcome (c)).
4. **§1.3 engine assertion HARD-BLOCK** — prove WebKit 3 ways or stop.
5. §1.4 boot pre-flight; §1.5 clone; §1.6 identities; §1.7 contexts.
6. Run §3.A→§3.D in order, time-boxed; each HIGH cell paired with its Chromium control.
7. §6 cleanup.
8. Write the REPORT per §5.

---

## §5 — Output shape (the deliverable)

Write to **`.paul/research/cycle-13c-webkit-engine-correct/REPORT.md`** (ONE file; optional
`findings.jsonl` grep mirror at §H).

```markdown
# Cycle-13c Real-WebKit engine-correct — REPORT

**Run date:** YYYY-MM-DDTHH:MMZ
**Wall-clock:** ~75 min single-thread
**Master SHA at run:** <git log -1 origin/master>  (expected `952edac4c3` ± drift)
**ENGINE PROVEN:** WebKit — UA=<full UA string>; browserType=webkit; vendor=<navigator.vendor>
  [or "NOT-RUN — real WebKit unavailable: <reason>" if outcome (c)]
**Chromium control lane UA:** <UA>  (for the divergence columns)
**Provisioning path used:** (a) Docker mcr.microsoft.com/playwright | (b) privileged warm-worktree | (c) NOT-RUN
**Personas exercised:** Aviva (musician) + David (band_leader) + Daniel (admin) [or which skipped + why]
**Reference setlist (read-only):** cd2010f4-8bb0-4f54-ba2d-8a79d83729a6
**Fixture clone (write target):** <fixtureSetlistId> — `[CYCLE13C-webkit]`; isTest:true verified
**Anchor coverage:** A1 ✓  A2 ✓  A3 OUT (axis 13a)  A4 ✓
**Engine-divergence headline:** <one line — e.g. "SW reload diverges: PASS Chromium / FAIL WebKit (F-C13C-001)"; or "zero divergence — all cells engine-agnostic">
**Cleanup state:** clean | partial — list orphans

## §A — Engine-correctness verdict (≤200 words)
Did real WebKit launch (the whole point)? Which provisioning path worked? Then: for the
3 HIGH cells, did the band's engine behave like the Chromium substitute, or diverge? What
is the single biggest WebKit-only behavior a musician on the real iPad would feel that no
prior (Chromium-substituted) cycle could see? If zero divergence — say so plainly; that is
a strong, reassuring result that retires the engine-substitution caveat.

## §B — WHAT-WE-LEARNED (≥3 design principles)
Designer-actionable insight about engine-correctness, NOT bug counts. (e.g. "the offline
blob: read is the one cell that MUST run on WebKit — every other cell is engine-agnostic
and the substitute was fine.")

## §C — Findings (hybrid shape: narrative | matrix | heuristic, per PARENT §1)
Each `F-C13C-NNN`. A DIVERGENCE finding states both engine verdicts explicitly. Target 4–10.

## §D — Cycle-11/12 SHA regression matrix, ON REAL WEBKIT
| Fix SHA | Cell | WebKit verdict | Chromium-control verdict | Divergence? | Note |
(`595153b192` URL · `fd9e5c8439` transpose + wake-lock · `467e788ed5` SW · `ee576ae0ae` section · plus OFF/NEXT)

## §E — Engine-divergence matrix (the axis-C core)
| Cell | Risk | WebKit | Chromium control | Divergence finding | Musician-felt cost |
| WL — wake-lock pill | HIGH | … | … | … | … |
| OFF — offline blob: chart | HIGH | … | … | … | … |
| SW — shell-cache reload | HIGH | … | … | … | … |
| NEXT — in-app offline next-track | MED | … | … | … | … |
| URL / TR / SEC | CONTROL | … | … | … | … |

## §F — Out-of-axis-C parking lot
Non-engine findings, A3-class (→13a), MCP-authoring (→13b), bond/picker (→13d). Note, don't promote.

## §G — Cleanup state
## §H — findings.jsonl (grep mirror, secondary)
```

### HANDOFF-COMPLETE message body (for `.coord/inbox/supervisor.md`)

```
from cycle-13c-webkit-engine-correct
HANDOFF-COMPLETE
engine-proven: WebKit <UA> via path (a)|(b)  [or NOT-RUN — real WebKit unavailable: <reason>]
engine-divergence headline: <one line>
anchors-covered: A1 ✓  A2 ✓  A3 OUT(13a)  A4 ✓
HIGH cells: WL <verdict±divergence> · OFF <…> · SW <…>
divergence findings (≤5 IDs + one-line each):
  F-C13C-NNN  <engine-divergence one-line>
cleanup: clean | partial — orphans
report: .paul/research/cycle-13c-webkit-engine-correct/REPORT.md
```

---

## §6 — Cleanup (end-of-run) — MANDATORY before HANDOFF-COMPLETE

```js
await mcp.call("delete_setlist", { id: fixtureSetlistId, force: true });
// for each secondary clone created during the run:
await mcp.call("delete_setlist", { id: secondaryCloneId, force: true });
await mcp.call("cleanup_all_test_data", { prefix: "c13c-webkit" });  // NEVER without prefix
await mcp.call("list_test_accounts", {});                            // → none matching c13c-webkit
await mcp.call("list_setlists", {});                                 // → no [CYCLE13C-webkit] rows
```

If any verify step fails → list orphans under §G; Daniel sweeps.

---

## §7 — Operational rules + hard out-of-scope

**Operational (binding):**
- ⛔ No writes to real `cd2010f4`. Every write hits the `[CYCLE13C-webkit]` clone.
- ⛔ No bearer / secret in any file under `sheet-music-app/` — redact `***redacted***`.
- ⛔ NEVER `cleanup_all_test_data` without `prefix`.
- ⛔ NEVER silently substitute Chromium for WebKit (§1.3). A Chromium run is a *control
  lane* with its own labeled column, never a WebKit verdict.
- ⛔ No `/monitor` / X32 writes — out of axis-C scope.
- ✅ Err public, never propose gating data from musicians (`[[feedback_err_public_not_gated]]`).
- ✅ No service-day / downbeat / Saturday framing (`[[feedback_no_saturday_framing]]`).

**Hard out-of-scope (do NOT probe):**
- Repo-root `mcp/`, `bridge/`, `SetlistGrid.tsx`, `src/lib/mcp/errors.ts`,
  `src/lib/mcp/error-envelopes.ts` (do-not-touch zones per `CODER.md`).
- A3 mid-service change (axis 13a). MCP authoring round-trip (axis 13b). Bond hygiene +
  chart-bind picker (axis 13d). Fresh-tablet cold-load (cycle-11 M3 covered).

---

## §8 — Success criterion (auditor checks before ACCEPT)

The cowork RUN "ran successfully" iff:
- §1.3 engine assertion PASSED and §A records the proven WebKit UA — OR the run cleanly
  emitted outcome (c) BLOCKER ("real WebKit unavailable") and stopped without faking verdicts.
- The 3 HIGH cells (WL/OFF/SW) each have a WebKit verdict AND a Chromium-control verdict
  (no `?` cells), so divergence is measured.
- §D regression matrix has a WebKit verdict per row.
- §A verdict is decisive about engine-divergence (headline divergence line or explicit "zero").
- §B has ≥3 design principles.
- Cleanup §6 verified empty (or §G lists orphans).
- HANDOFF-COMPLETE landed in supervisor inbox.

**Auditor verification (Tier-0 doc for THIS prompt-design lane; Tier-1 for the eventual RUN):**
verify-every-ref pass against the cut SHA; the §1.3 fail-loud gate is present and correct;
the HIGH/CONTROL divergence ranking is defensible.

---

## §9 — Sign-off

The cowork instance signs the supervisor inbox HANDOFF-COMPLETE `from
cycle-13c-webkit-engine-correct`. The auditor reads the REPORT against (a) verify-every-ref
(b) engine-proven-or-cleanly-blocked (c) 3 HIGH cells dual-verdict (d) §A decisive (e)
cleanup.

Go.

— from coder-4 (lane `cycle-13c-webkit-engine-correct-PROMPT-design`)
