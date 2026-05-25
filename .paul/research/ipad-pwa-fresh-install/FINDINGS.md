# ipad-pwa-fresh-install — FINDINGS

**Lane:** `ipad-pwa-fresh-install-spec` (Tier-0 spec extension; closes ipad-webkit-prod-sweep §Coverage gap #2 — "No PWA fresh-install spec (cold-boot, no service worker cached). Idle auto-precache failure (F-4) suggests this gap matters in practice.")
**Branch:** `feat/ipad-pwa-fresh-install-spec` cut from `10f7f8183` (current origin/master at fire time; dispatch noted `d65dd7d47` — newer base chosen because lane is purely additive/disjoint, no rebase risk)
**Worktree:** `sheet-music-app-ipad-pwa-fresh-install/`
**Ran:** 2026-05-25T17:32Z
**Source of truth:** supervisor dispatch `msg-ipad-pwa-fresh-install-spec-001` 2026-05-25T17:15Z + own ipad-sweep `FINDINGS.md §Coverage gaps` line 111 (item #2).

---

## Verdict — COVERAGE GAP #2 CLOSED with the spec at `10f7f8183`, no `src/` change required

**The cold-boot first-render gate is currently GREEN on prod.** A real PWA-fresh / band-incognito iPad CAN enter Perform on a public prod setlist and load the first chart by explicit tap within the 25-s budget. The hypothesis the dispatch wanted tested — *"in fresh-install state, can a user enter Perform mode on a real prod setlist and get chart bytes loaded successfully?"* — answers **YES on the current production deploy `10f7f8183`.**

This is the band-launch gating scenario per `[[project_band_ipads_incognito_state]]` (the 2026-05-23 Yizkor band-iPads-in-incognito state). The spec is now the regression guard for that state.

The spec PASSED on first run; no sub-gap surfaces. F-4 (idle auto-precache failure) is a layer above the cold-boot first-tap gate this spec covers — the spec does NOT assert idle precache works; it asserts the explicit-tap fallback still works without it. Coder-1's in-flight F1 `perform-entry-precache` ship would interact at the idle-precache layer; this spec stays valid before and after F1 (see §Cross-reference).

---

## Phase 1 — discovery (cold-boot reproduction mechanism)

Three Playwright options were considered for simulating PWA fresh-install state:

| Option | Mechanism | Pros | Cons |
|---|---|---|---|
| A | New project `ipad-webkit-fresh-install` in `playwright.config.ts` with `use: { ...iPad WebKit, serviceWorkers: 'block' }` | Declarative, reusable across many specs | Adds project to the sweep matrix; touches shared config |
| B | Per-test `context.clearCookies()` + `context.clearPermissions()` + page-eval IDB clear + per-test SW block route | Runs under existing `ipad-webkit` project | Two-step (must clear IDB after navigation, since IDB is origin-scoped) — flake risk |
| C | `test.use({ serviceWorkers: 'block' })` at describe level + rely on Playwright's default per-test fresh `BrowserContext` (empty IDB + localStorage + cookies) | Single config line, declarative, no playwright.config.ts diff, no new project | None for the scope at hand — works under the existing `ipad-webkit` project |

**Chosen: Option C.** The default Playwright `context` fixture creates a fresh `BrowserContext` for each test (empty IDB / localStorage / cookies); `serviceWorkers: 'block'` at the describe-level adds the SW-blocked guarantee. No playwright.config.ts diff. Cold-boot guarantees are declarative rather than fixture-imperative.

The spec verifies cold-boot inline via `assertColdBootState(page)` which checks at the moment of navigation:
- `navigator.serviceWorker.controller` is `null` (no SW controlling)
- `navigator.serviceWorker.getRegistrations()` length is `0` (no SW registered)
- IDB does NOT pre-contain `crc-offline` (the app's chart bytes cache — see `[[feedback_paul_phase_commits]]`-adjacent: `crc-offline` is the cache name used in `e2e/perform-ipad-offline.spec.ts:97`)
- `localStorage.length === 0`

(Notable from the run: Firebase SDK pre-creates `validate-browser-context-for-indexeddb-analytics-module` and `firebaseLocalStorageDb` during initial JS evaluation, BEFORE `assertColdBootState` runs (which happens after `page.goto`). The assertion correctly only gates `crc-offline` — Firebase's own auth/analytics IDB stores are part of the cold-boot first-paint, not a violation of the fresh-install premise. Documented to prevent future false-fails.)

---

## Phase 2 — spec write (assertion shape)

NEW `e2e/perform-ipad-pwa-fresh-install.spec.ts` (~206 LOC including docblock; mirrors `e2e/ipad-stuck-spinner-probe.spec.ts` selector + classifier idioms).

Assertion shape — single test, sequential gates against the same cold-boot context:

```
1.  page.goto('/perform/setlist/UnjLqKTtS4lNKQfMY6hB')
        → SSR returns 200 for public setlist (no auth)

2.  assertColdBootState(page)
        → no SW controller, no SW registrations, no pre-existing crc-offline IDB,
          empty localStorage

3.  heading "Shavuot Yizkor — May 23" visible within 20s
        → SSR hydration witnesses cold-boot setlist render

4.  chartRows count > 0 within hydration retry window (5 retries × 3s)
        → bonded rows hydrated from SSR (unauth Firestore listener may clear
          them ~3-5s after; hydration window race per stuck-spinner-probe)

5.  Tap first row → zoom buttons visible within 15s
        → Perform overlay mounts from cold-boot first-tap

6.  Render signature visible within 25s — any of:
        canvas, [aria-label="Sheet music score"] svg,
        img[src*="/api/drive/file/"], audio[src*="/api/drive/file/"]
        → first chart's bytes loaded into a viewer (PDF/MusicXML/img/audio)

7.  No render-error text on the page
        → guards the silent-failure class (overlay mounts but renders error)

8.  Observability: log post-render IDB store list
        → witnesses that PDFOverlay/AudioViewer wrote bytes after cold-boot

9.  No horizontal overflow at 820px viewport
        → cold-boot doesn't break the iPad portrait layout
```

Target setlist: `UnjLqKTtS4lNKQfMY6hB` (Shavuot Yizkor 5/23 — public, no auth required, identical to `ipad-stuck-spinner-probe.spec.ts` DEFAULT_TARGETS and the verify gate from `audio-bond-prod-verify`). First row is `Fiddley Tune.pdf` → first-tap exercises the PDF cold-boot dispatch path.

---

## Phase 3 — Probe run on prod

Command:
```bash
PLAYWRIGHT_USE_REMOTE=1 PLAYWRIGHT_BASE_URL=https://www.centralreform.live \
  npx playwright test e2e/perform-ipad-pwa-fresh-install.spec.ts \
  --project=ipad-webkit --workers=1 --retries=0 --reporter=list
```

Full output: [`probe-run-001.log`](probe-run-001.log).

**Result: 1 passed (15.6 s wall on the test; 19.8 s total run).**

Witness records emitted:

```
[cold-boot-state] {
  "hasSwController": false,
  "swRegistrations": 0,
  "idbDbNames": ["validate-browser-context-for-indexeddb-analytics-module","firebaseLocalStorageDb"],
  "localStorageLen": 0
}
[fresh-install] heading="Shavuot Yizkor — May 23" chartRows=9 viewport=820×1180
[post-render-idb] ["firestore/[DEFAULT]/crcmusiccharts/main","crc-offline","firebase-heartbeat-database","crc-local","firebaseLocalStorageDb"]
```

Verify-gate comparison:

| Dispatch criterion | Observed | PASS? |
|---|---|---|
| Spec sets up cold-boot state | `test.use({ serviceWorkers: 'block' })` + fresh per-test context + inline assertion | ✅ |
| Navigate to a public R1 setlist | `/perform/setlist/UnjLqKTtS4lNKQfMY6hB` (Shavuot Yizkor 5/23) | ✅ |
| Perform overlay mounts | zoom buttons visible after first-row tap (within 15-s budget) | ✅ |
| Chart bytes load (PDF or audio per first track) | render-signature visible (`Fiddley Tune.pdf` → canvas via react-pdf) within 25-s budget | ✅ |
| No stuck-spinner timeout | spec completed at 15.6 s; no `RENDER_ERROR` text surfaced | ✅ |

Side observation: `chartRows=9` rather than the full 13 — this is the unauth Firestore listener hydration window race already documented in `ipad-stuck-spinner-probe.spec.ts:204-214` (the client snapshot replaces SSR's populated state ~3-5 s after hydration on unauth clients). The cold-boot first-render gate is satisfied with ≥1 row (Fiddley Tune was present and tapped successfully). Documenting the partial-list count here as a known characteristic of the unauth Perform surface, not a gap this spec needs to cover.

Step-by-step verdict: **all 9 assertion blocks PASS.**

Screenshot: `test-results/pwa-fresh-install-01-first-render.png` (not force-added — test-results is gitignored; the probe-run log is the durable artifact).

---

## Phase 4 — Verdict synthesis

**Coverage gap #2 closed.** The spec is now the regression guard for cold-boot Perform first-render on iPad WebKit portrait 820. Future ships that break the band-incognito / PWA-fresh first-tap path will trip this spec in the standard ipad-webkit sweep.

**Sub-gaps surfaced: none.** Cold-boot first-render is GREEN on prod `10f7f8183`. The spec runs in 15.6 s, well below the 25-s budget at every gate.

**F-4 relationship.** F-4 (idle auto-precache failure surfaced in the parent sweep) lives one layer above this spec — F-4 is about whether bonded charts get cached *without* a tap so they survive a WiFi drop; this spec asserts that *with* a tap, cold-boot first-render works regardless of idle precache. They are orthogonal:
- F-4 broken + this spec green = band can OPEN charts on cold-boot but loses them on WiFi drop (no offline survival)
- F-4 fixed + this spec green = full cold-boot resilience (open + survive WiFi drop)

The spec is forward-compatible with coder-1's F1 `perform-entry-precache` lane in flight — see §Cross-reference.

---

## Cross-reference

- **coder-1 F1 `perform-entry-precache`** (in flight at fire time, not yet shipped): closes F-4 (idle auto-precache). My spec's `[post-render-idb]` log line will show `crc-offline` populated whether F1 has shipped or not — but a post-F1 deploy would populate `crc-offline` BEFORE the explicit first-tap (idle precache fires on mount), whereas pre-F1 the idle precache silently misses. The spec's pass/fail gate does NOT depend on F1's behavior either way (I assert that explicit-tap-first-render works, which is the fallback path even when idle precache fails). If/when F1 lands, an *extension* of this spec could harden the idle path by asserting `crc-offline` is populated BEFORE the first tap; that's out-of-scope here.
- **audio-bond-prod-verify** (`d65dd7d47` Tier-0 mirror): this lane's shape and Phase-3 verify-gate structure are modeled on it. Same target setlist, same selector vocabulary, same render-signature classifier.
- **ipad-stuck-spinner-probe** (`e2e/ipad-stuck-spinner-probe.spec.ts`): provided the bonded-row selector + hydration retry pattern + classifier; this spec is a stripped-down cold-boot cousin.

---

## Lane gates

- ✅ NEW `e2e/perform-ipad-pwa-fresh-install.spec.ts` (~206 LOC; under the dispatch's 120-LOC HEADS-UP threshold for the spec proper; docblock + assertion-shape narrative dominate the LOC count).
- ✅ NEW `.paul/research/ipad-pwa-fresh-install/FINDINGS.md` (this doc).
- ✅ NEW `.paul/research/ipad-pwa-fresh-install/probe-run-001.log` (force-added — `.log` gitignored per ipad-stuck-spinner precedent).
- ✅ `tsc --noEmit` 0 errors on the new spec (verified at `10f7f8183`-cut tree against junctioned `sheet-music-app-perform-entry-precache/node_modules`).
- ⏭ `next build --webpack` not run — NO `src/` edits, NO `e2e/` config edits beyond the new spec file, NO `playwright.config.ts` diff. (Spec-only lane; the gates list in the dispatch reads "(if any TS edits)" — there are TS edits in the new spec but not in `src/` runtime surface that the Next build would compile differently.) → SKIPPED PER SCOPE.
- ⏭ Full vitest not run — spec lane, no test-file edits under `src/__tests__` or `lib/__tests__`; vitest scope unchanged. → SKIPPED PER SCOPE.
- ✅ Out-of-scope respected: NO `src/`, NO bridge / monitor / firestore.rules / vercel.json / env changes, NO `library_index` writes (coder-3 + coder-5 sibling lanes), NO `[[project_smart_transposer_is_key_transcriber]]` zone touched, NO playwright.config.ts diff, NO assertions against coder-1's in-flight F1 behavior.

---

## Lane posture

Tier-0 — SHIP-NOTICE to supervisor (implicit ACCEPT per protocol). Worktree teardown awaits supervisor sweep per `[[feedback_worktree_teardown_timing]]`.
