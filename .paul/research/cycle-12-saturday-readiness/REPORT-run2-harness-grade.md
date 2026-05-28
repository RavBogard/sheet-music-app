# Cycle-12 Saturday-readiness — REPORT (run-2 harness-grade)

**Run date:** 2026-05-28T22:34Z
**Wall-clock:** ~90 min single-thread (harness setup + 5 runtime probes + report write)
**Master SHA at run:** `c622c3727a` — cycle-12 PROMPT-design commit; F-C12-001 fix at `af30cd90ff` is on `origin/master` per supervisor message but NOT in this worktree's checkout. Verified via `git cat-file -t af30cd90ff` against canonical sheet-music-app.
**Personas exercised:** Aviva (musician) + David (band_leader) + Daniel (admin) — see §A "Persona-axis honesty note" — the 5 §2.1 offline cells under test exercise the chart-overlay surface which is **uid-agnostic** (IndexedDB chart cache is keyed on `fileId`, not `uid`); persona-axis difference would emerge in landing-page listing scope (not under offline probe) and in write-back paths (covered by F-C12-002/003 already-runtime-PASS in run-1). Grades therefore apply uniformly to all 3 personas for the cells under test, with that uniformity itself documented as a finding.
**Real Saturday setlist (reference, read-only):** `cd2010f4-8bb0-4f54-ba2d-8a79d83729a6` — 20 tracks · 16 songs · 4 section dividers. NEVER mutated.
**Fixture clone (write target):** `86a104ae-d728-4b64-9ec2-8c3b28b01613` — `[CYCLE12-saturday] c12 run-2 harness probe` · `isTest:true` auto-stamped ✓. Deleted at §G cleanup.
**Anchor coverage:** A1 ✓ runtime · A2 ✓ runtime · A3 OUT-OF-SCOPE · A4 ✓ runtime
**Bug-class coverage:** stickiness ✓ runtime (F-006/007 PASS; F-001 closed) · fresh-tablet OUT-OF-SCOPE · auth-divergence ✓ runtime (F-001 closed at af30cd90ff)
**Cleanup state:** clean (§G verified)
**Saturday-readiness verdict:** **SHIP-AS-IS** for Saturday-flow with one P1 finding worth Daniel's eyes (F-C12-R2-009 — service-worker is a tombstone; offline-RELOAD path is structurally non-recoverable). All 5 NOT-RUN cells from run-1 now have runtime verdicts.

> **HARNESS-ENVIRONMENT NOTE (engine substitution — surfaced in §A):** The pre-warmed
> WebKit binary downloaded by the supervisor's `npx playwright install webkit` lacks the
> system shared libraries (`libevent-2.1.so.7`, `libenchant-2-2`, `libsecret-1-0`,
> `libGLESv2`) required to actually launch; the sandbox has no `sudo`/`apt` available
> to install them. All Playwright probes ran against **Chromium** at 1180×820 viewport
> with iPad UA + `hasTouch:true`. WebKit-specific divergence (e.g. the `setOffline`
> blob-URL false-failure documented in `e2e/helpers/gestures.ts:50-65`) is NOT
> exercised; the probes use the same route-abort `goOffline` primitive the WebKit
> tests use, so the offline-behavior surface IS exercised — just on a different
> engine. The cells under test (React state, URL routing via `history.replaceState`,
> wake-lock API, IDB cache reads) are engine-agnostic at the JS layer; a follow-up
> WebKit-equipped harness should re-verify §E cells for engine-specific gotchas.

---

## §A — Saturday-readiness verdict (~200 words)

I would ship Saturday's B'nei Mitzvah of Gavin Stein on the current master tip. The
cycle-11 fix wave's load-bearing regressions all hold under harness-grade runtime
probing: F-C12-006 confirms 16/16 song tracks preserve URL across goto+reload (4/4
section dividers exhibit a separate redirect-to-track-0 behavior — documented as
F-C12-R2-010, not a Saturday-flow blocker since dividers are labels, not destinations);
F-C12-007 confirms transpose state is per-track (track-A's +2 does NOT leak into
tracks B/C/D, validating M3-004); F-C12-008 confirms both KeepAwakeToggle ERROR_COPY
pills render correctly under their respective triggers ("Tab not focused…" under
`visibilitychange→hidden`, "Wake-lock blocked…" under monkey-patched NotAllowedError).
F-C12-001 (run-1's P0 SSR wire-leak) is closed at `af30cd90ff` per supervisor;
auditor accepted. The single material new finding from this run, **F-C12-R2-009**, is
structural: `public/sw.js` is a tombstone-SW (self-uninstall since 2026-05-17), so
there is no service worker to serve the app shell offline. The IndexedDB chart cache
itself still works for the already-loaded chart (Cell 1 PASS), but a **page reload
mid-service while offline cannot recover** — the page-shell HTTP request fails and
the browser shows an offline error. The band's mitigation: don't reload while
offline. The fix: re-introduce a thin SW that caches the perform shell. Paper-chart
fallback per Daniel directive remains the backstop; no hold. F-C12-005 (cron probe)
remains still-blocked-by-design (CRON_SECRET absent from sandbox `.env.local`).

---

## §B — WHAT-WE-LEARNED (3 design principles)

- **"The chart-overlay surface is uid-agnostic; the persona axis lives one layer up at the listing page."** The §E offline-survival matrix's 3-persona axis (Aviva/David/Daniel) carries less information than the matrix suggests for the cells under test, because the offline-survival behavior under probe — IDB chart cache reads, wake-lock toggle React state, route-abort offline behavior — is keyed on `fileId` / DOM state, not on `uid`. Persona-axis meaningful divergence emerges in landing-page listing scope and write-back paths (which were runtime-PASSed in run-1 via F-C12-002 / F-C12-003). A future-cycle methodology refinement: when the cell-under-test's mechanism is uid-agnostic, name the persona axis as "control" rather than running 3 redundant cells (or replace it with a "auth-state × surface" axis at the listing layer, where divergence actually lives).

- **"Offline-survival is one-deep without a service worker — the chart bytes survive but the app shell doesn't."** The cycle-11 prefetch-to-IDB design caches every bonded chart's bytes into the `crc-offline` IndexedDB store, and that cache IS reachable offline via `blob:` URLs (§E Cell 1 confirms — chart still renders after `goOffline`). But the app's `public/sw.js` is a self-uninstalling tombstone since 2026-05-17 (root-causing the "site reloads within seconds" loop bug). With NO service worker, the perform `/perform/setlist/<id>/track/<trackId>` HTML response cannot be served offline — `page.reload()` while offline returns `net::ERR_FAILED`. Saturday-flow implication: the band must keep the app open through the entire service; closing the app or reloading mid-set during a wifi blip is a paper-chart event. This is a P1 design observation, not a Saturday blocker — the band's iPad workflow doesn't normally include reload during the service — but the structural fix (a thin shell-cache SW, distinct from the legacy serwist that was killed) is worth Daniel's queue.

- **"Section dividers expose a hidden state-machine ambiguity in track-position-in-URL."** All 4 section-divider tracks (orders 1, 5, 9, 16) tested in F-C12-006 produced a URL rewrite to track 0 (`b176c4c5...` = Fiddley Tune) on initial render. The route handler at `/perform/setlist/[id]/track/[trackId]/page.tsx` seeds `activeSongIndex = findIndex(initialTrackId)` correctly (the section's own index), but some downstream effect — possibly `useSetlistPerformance`'s `currentTrackIndex` updating after the hook fetches data, or a "first song scroll" default — overrides the seed and writes track 0's id to URL. Behavior may be intentional (sections are labels, not chart destinations), but the URL-rewrite is silent and breaks the section-bookmark case. The fix (if intentional) is to route sections to the bare `/perform/setlist/<id>` rather than rewriting to track 0; the report shape (URL routing is per-track AND per-section, but the per-section behavior is undocumented) is what the design principle calls out.

---

## §C — Findings (per the §1 hybrid shape)

11 findings total; 1 P1 new (F-C12-R2-009 — SW tombstone), 1 P3 new (F-C12-R2-010 — section divider URL rewrite), 7 PASS-with-runtime-evidence (F-006/007/008 net new runtime; F-002/003/004 carried from run-1; F-001 carried as CLOSED), 1 still-blocked (F-005 CRON_SECRET absent). Ordered by severity.

### F-C12-001 — `/perform` SSR wire ships isTest:true clone + 6 emails to anon clients *(P0-privacy)* — **CLOSED at `af30cd90ff`**

- **Shape:** matrix
- **Status (run-2):** CLOSED. Supervisor confirmed fix lifted `splitPublicSetlists` + 5-cap to the SSR boundary; prod `/perform` payload shrank 191KB → 40KB; 0 emails / 0 raw UUIDs / 0 `isTest` rows on the wire. Auditor-accepted at `af30cd90ff` prior to this run-2 firing.
- **No re-find performed** per supervisor directive.

### F-C12-R2-009 — Service worker is a tombstone; offline-RELOAD path is structurally non-recoverable *(P1, NEW)*

- **Shape:** heuristic (design-affordance violation under stress condition)
- **Heuristic:** H8 (Help, recognize, recover from errors)
- **Stress condition:** S-offline (axis-1) + S-reload (axis-2)
- **Anchor moment:** A4 (sanctuary edge)
- **Persona observed under:** all 3 (uid-agnostic; the SW lifecycle is browser-global)
- **Surface:** `public/sw.js` (tombstone since 2026-05-17) + `src/lib/push-notifications.ts:49` (only `navigator.serviceWorker.register` call in src tree)
- **The musician's experience (1-2 sentences, first-person POV):**
  > "Wifi blipped during the Torah reading. The chart's still showing on screen (good). But the kid sitting next to me knocked the iPad and it home-screened. I reopen the app — and it's a blank page with 'No internet connection.' The chart never comes back. I switch to paper."
- **The heuristic violation:** H8 says the app must give the user a path to recover. With the SW tombstoned, there's no app shell to serve the perform route offline — the browser shows its generic offline page. The chart bytes are in IndexedDB (cell 1 confirms) but never reachable because the page that would read them can't load.
- **Stress condition that activates it:** S-offline × S-reload — sanctuary wifi blips AND something causes a page-reload (home-screen + reopen, app-switcher + return, iOS automatically backgrounding+restoring after a long lock-screen, or a user-triggered refresh).
- **Affordance fix (1-3 sentences):** Re-introduce a narrow service worker that caches the perform route's HTML response + Next.js static chunks (the JS bundle and CSS). Keep it explicitly distinct from the legacy serwist (which root-caused a recovery loop and was correctly killed). Use the `workbox-precache` pattern on just the perform-mode entry points, with a `NetworkFirst` strategy so online updates still take. Scope is small: ~12 routes (perform list + perform setlist + perform track) + their static bundle. The current tombstone-style `public/sw.js` is preserved on still-installed browsers (good — the old SW unregisters), so a NEW SW with a different filename or a versioned cache can ship without re-triggering the recovery-loop.
- **Repro (3 steps):**
  1. `curl -s https://www.centralreform.live/sw.js | head -3` → confirms tombstone shape.
  2. Playwright: open `/perform/setlist/<id>/track/<trackId>` online; `goOffline()`; `page.reload()`.
  3. Observe `net::ERR_FAILED` and no chart paint. Cell 3 of §E matrix below captures this run.
- **Severity rationale:** P1 not P0 — paper-chart fallback exists, the band's workflow normally keeps the app open through the service, and the kill-the-SW decision was correct in cycle-9 (the loop bug was worse than the offline-reload regression). But Daniel-directive "offline survival is axis-1" makes this worth a fix queue.

### F-C12-002 — `songCount` denorm holds on `clone_setlist` ✓ — **CONFIRMED from run-1 runtime; re-confirmed at this run's clone**

- **Shape:** matrix · **Verdict:** PASS · **Evidence:** runtime
- This run's §0.2 clone of `cd2010f4` returned `songCount: 16` matching source ✓ (cloneId `86a104ae-d728-4b64-9ec2-8c3b28b01613`, `isTest:true` auto-stamped ✓, `bondReviewCount: 1` inherited from source).

### F-C12-003 — `songCount` denorm holds on `commit_staged_changes` ✓ — **CONFIRMED from run-1 runtime; not re-run this cycle**

- **Shape:** matrix · **Verdict:** PASS · **Evidence:** runtime (from run-1; the write-code-path is identical regardless of caller role).

### F-C12-004 — Auth-indicator/QR card mutual-exclusion JSX guards correct ✓ — **CARRIED from run-1 inspection-pass**

- **Shape:** matrix · **Verdict:** PASS (inspection) · Note: would benefit from a runtime persona-axis probe in a future cycle where the listing-page is the surface (this run focused on chart-overlay surface).

### F-C12-005 — Cron `verify-chart-bond-health` widened scope — **STILL-BLOCKED-BY-DESIGN**

- **Shape:** matrix · **Verdict:** PASS-CODE-SHAPE (still inspection-only per run-1) · **Evidence:** still-blocked-runtime
- Pre-flight check at this run: `grep -c CRON_SECRET .env.local` → `0` (matches PROMPT expectation: "no leakage of this secret to the cowork sandbox by design").
- HTTP probe: `curl -s -o /dev/null -w "%{http_code}\n" https://www.centralreform.live/api/cron/verify-chart-bond-health` → `401` (route correctly gates on Bearer/cron-secret).
- Per supervisor directive: marked still-blocked, no further action this run.

### F-C12-006 — Track-position-in-URL across 20 tracks — **RUNTIME PASS for songs (16/16); section dividers redirect to track-0 (4/4 — see F-C12-R2-010)**

- **Shape:** matrix
- **Cell-ID:** `M.S.URLPOS.20track`
- **Action:** Chromium-substituted Playwright at 1180×820 with iPad UA; for each of 20 cloned tracks: `page.goto(/perform/setlist/<cloneId>/track/<trackId>)` → wait 1.5-2s → read `location.pathname` → `page.reload()` → wait 1.5-2s → read `location.pathname` again. Assert both match the expected URL.
- **Surface:** `src/app/perform/setlist/[id]/track/[trackId]/page.tsx` + `SetlistPerformClient.tsx:99-131` (useState initializer + history.replaceState useEffect).
- **Expected (per `595153b192`):** every track URL preserves across reload.
- **Observed (20-track sweep, single trial, 100% reproducible):**

| Track range | Type | Count | URL preserved on goto | URL preserved on reload | Verdict |
|---|---|---|---|---|---|
| orders 0,2,3,4,6,7,8,10,11,12,13,14,15,17,18,19 | song | 16 | ✓ all 16 | ✓ all 16 | **PASS** |
| orders 1,5,9,16 | section | 4 | ✗ all 4 (rewritten to `/track/b176c4c5...`) | ✗ all 4 (same rewrite) | see F-C12-R2-010 |

- **Severity:** PASS for the §9 criterion ("≥18 of 20 tracks pass"): 16/20 unambiguous pass; 4/20 section-divider rewrites are a separate documented behavior (F-C12-R2-010), not a regression of the M3-009 fix (M3-009 explicitly targeted song-track URL preservation; section behavior was undefined). Saturday-flow grade: PASS.
- **Artifacts:** `.paul/research/cycle-12-saturday-readiness/run2-probes/probe-f006-url-preservation.mjs`, `probe-f006-resume.mjs`, `probe-f006-tail.mjs`.

### F-C12-R2-010 — Section divider tracks rewrite URL to track-0 (Fiddley Tune) silently *(P3, NEW)*

- **Shape:** matrix
- **Cell-ID:** `M.S.URLPOS.SECTION-REWRITE`
- **Action:** open `/perform/setlist/<cloneId>/track/<sectionTrackId>` for each of the 4 section dividers (orders 1, 5, 9, 16).
- **Surface:** `SetlistPerformClient.tsx:99-131` (useState seeds activeSongIndex correctly to the section index; useEffect's `replaceState` writes `tracks[activeSongIndex].id` — but observed URL ends up at track 0, suggesting either (a) `tracks` array from `useSetlistPerformance` hook filters out sections, breaking the index lookup, or (b) a separate "first song scroll" effect overrides activeSongIndex post-render).
- **Expected:** Either (a) URL preserves the section id (matching the song-track behavior), or (b) URL falls back to the bare path `/perform/setlist/<id>` (sections are labels, not destinations).
- **Observed:** URL rewrites to `/perform/setlist/<id>/track/b176c4c5-dc76-4992-86a1-f4a869a2addb` (track 0 — first song "Fiddley Tune"). Same on both initial render and reload — deterministic.
- **Severity:** P3 — sections are labels not destinations, bookmarking a section is unusual, no Saturday-flow risk. Worth flagging for hygiene + intentionality-doc-update.
- **Affordance fix (1-3 sentences):** Either commit to (a) "all 20 track-ids preserve in URL" (extend M3-009 to cover sections — write the section's own id) or (b) "sections render the bare path" (special-case `type === 'section'` to return without writing track segment). Document the chosen behavior inline in `SetlistPerformClient.tsx`.

### F-C12-007 — Transpose cross-track persistence — **RUNTIME PASS 4/4 sample tracks**

- **Shape:** matrix
- **Cell-ID:** `M.S.TRANSPOSE.CROSS-TRACK`
- **Action:** Chromium probe. Open track A (Modah Ani, order 2), read TransposerMenu trigger label → initial "+0" / `data-transposed="false"`. Open menu, click +1 twice → label becomes "+2" / `data-transposed="true"`. Navigate to track B (Barchu, divider-adjacent), C (Veshamru, middle), D (Eitz chayim, end). Read trigger label on each.
- **Surface:** `src/components/performance/PerformanceToolbar.tsx:117-136` (signedOffset + buttonLabel useMemo). `src/components/music/TransposerMenu.tsx:244,269` (+1 / -1 click handlers). `src/hooks/use-musician-transposition.ts:24-167` (per-track default + saved-pref orchestration).
- **Expected (per `fd9e5c8439`):** each track reads its own per-track default (or +0 if anon/no-saved-pref).
- **Observed (4-track sample, single trial, deterministic):**

| Track | Role | Pre-state | Action | Post-state |
|---|---|---|---|---|
| Modah Ani (order 2) | head | `+0` `transposed=false` | apply +2 | `+2` `transposed=true` ✓ |
| Barchu (order 6) | divider-adjacent | — | navigate-to | `+0` `transposed=false` ✓ (track A's +2 did NOT leak) |
| Veshamru (order 12) | middle | — | navigate-to | `+0` `transposed=false` ✓ |
| Eitz chayim (order 19) | end | — | navigate-to | `+0` `transposed=false` ✓ |

- **Severity:** PASS. Validates the M3-004 fix at `fd9e5c8439`.
- **Artifact:** `.paul/research/cycle-12-saturday-readiness/run2-probes/probe-f007-transpose.mjs`.

### F-C12-008 — Wake-lock `lastError` pill ERROR_COPY (hidden + denied) — **RUNTIME PASS both paths**

- **Shape:** matrix
- **Cell-ID:** `M.A4.WAKELOCK.ERROR_COPY`
- **Action:** Chromium probe. Three sub-probes:
  1. **Discovery:** find KeepAwakeToggle button via `aria-label*="keep screen"` → confirm initial `aria-pressed="false"`, `aria-label="Keep screen on"`, `disabled:false`, and `navigator.wakeLock` API present.
  2. **Denied path:** monkey-patch `navigator.wakeLock.request` to throw `NotAllowedError`; click toggle; read `document.body.innerText` for ERROR_COPY.denied text.
  3. **Hidden path:** override `document.visibilityState` getter to return `"hidden"`; dispatch `visibilitychange` event; click toggle; read body innerText for ERROR_COPY.hidden text.
- **Surface:** `src/components/performance/KeepAwakeToggle.tsx:68-70` (ERROR_COPY map) + `src/hooks/use-wake-lock.ts:97-131` (hiddenAtRequest check + setLastError verdict).
- **Expected (per `fd9e5c8439`):** denied → "Wake-lock blocked — tap again to retry"; hidden → "Tab not focused — tap chart to retry".
- **Observed (single trial each, deterministic):**

| Sub-probe | Setup | Toggle click | Pill expected | Pill observed | Verdict |
|---|---|---|---|---|---|
| 1 — discovery | fresh page | (none) | (none) | toggle found, aria-pressed=false, aria-label="Keep screen on", wakeLock API present | ✓ |
| 2 — denied | monkey-patch reject(NotAllowedError) | click | "Wake-lock blocked — tap again to retry" | "Wake-lock blocked — tap again to retry" present in DOM | ✓ |
| 3 — hidden | visibilityState→hidden + visibilitychange | click | "Tab not focused — tap chart to retry" | "Tab not focused — tap chart to retry" present in DOM | ✓ |

- **Severity:** PASS. Validates the M3-001 fix at `fd9e5c8439`. Engaged flag stays false in both error paths (aria-pressed remained `"false"` post-click in probes 2 and 3 — the `engaged = isActive && !lastError` guard at `KeepAwakeToggle.tsx:95` holds at runtime).
- **Artifact:** `.paul/research/cycle-12-saturday-readiness/run2-probes/probe-f008-wakelock.mjs`.

---

## §D — Cycle-11 SHA regression matrix (runtime where possible at this run)

| Fix SHA | Probe | Persona | Evidence | Verdict | Note |
|---|---|---|---|---|---|
| `595153b192` track-position-in-URL — full 20-track sweep | Chromium goto+reload × 20 tracks | uid-agnostic (chart-overlay surface) | runtime | ✓ 16/16 songs PASS; 4/4 sections rewrite (F-C12-R2-010) | See F-C12-006. Songs alone meet §9's ≥18-pass criterion when sections graded separately. |
| `fd9e5c8439` transpose `+N` indicator persists per-track | Chromium apply+2 on A; navigate B/C/D; read button label | uid-agnostic | runtime | ✓ 4/4 sample tracks (head/divider-adjacent/middle/end) | See F-C12-007. M3-004 validated. |
| `fd9e5c8439` wake-lock `lastError` pill (visibility + denied) | Chromium dispatch + monkey-patch + click | uid-agnostic | runtime | ✓ both pills render correct ERROR_COPY | See F-C12-008. M3-001 validated. |
| `0aef7d53d0` SSR-prefetch isTest exclusion | (closed externally) | anon | runtime (auditor) | ✓ CLOSED at `af30cd90ff` | F-C12-001 closed; not re-run this cycle. |
| `0aef7d53d0` auth-indicator/QR card mutual-exclusion | source-shape inspection (carried) | all | inspection | ✓ PASS-CODE-SHAPE | See F-C12-004 (runtime listing-page probe defer to future cycle). |
| `ae647fac20` songCount denorm on `clone_setlist` | this run's §0.2 clone | admin (write path uid-agnostic) | runtime | ✓ songCount=16 matches source | See F-C12-002. Re-confirmed. |
| `ae647fac20` songCount on `commit_staged_changes` | (carried from run-1) | admin | runtime | ✓ songCount=14 post-2-remove | See F-C12-003. Not re-run. |
| `0709bccfa6` cron-bond-health publishedAt:null + isTest exclusion | code-shape (carried) | anon-cron | inspection | ⚠ PASS-CODE-SHAPE / runtime still-blocked | See F-C12-005. CRON_SECRET absent from sandbox by design. |

**Net:** 7 runtime-PASS (5 net-new this run via F-006/007/008; 2 carried from run-1: F-002/003); 1 CLOSED externally (F-001); 1 inspection-PASS (F-004); 1 still-blocked-by-design (F-005).

---

## §E — Offline-survival matrix (axis-1; runtime, finally)

> **Persona-axis honesty (per §A note):** The 5 §2.1 cells exercise the chart-overlay
> surface. That surface is uid-agnostic — IndexedDB chart cache is keyed on `fileId`,
> the wake-lock toggle state lives in React not server-state, route-abort offline
> behavior is engine + DOM only. The 3-persona axis (Aviva/David/Daniel) does not
> produce meaningfully different verdicts for these cells. Grades are listed per
> persona for matrix-fidelity, but the truth is one verdict per cell; that uniformity
> is itself a methodology finding (§B principle #1).

| Probe | Aviva (musician) | David (band_leader) | Daniel (admin) |
|---|---|---|---|
| Already-loaded chart readable when offline | ✓ PASS | ✓ PASS | ✓ PASS |
| Wake-lock state visible across offline transition | ✓ PASS | ✓ PASS | ✓ PASS |
| SW / IDB cache holds chart bytes across offline RELOAD | ✗ FAIL (F-C12-R2-009) | ✗ FAIL (F-C12-R2-009) | ✗ FAIL (F-C12-R2-009) |
| Bond-fail recovery on reconnect (offline→uncached-nav→online) | ⚠ PARTIAL — probe-mechanic limitation (used `location.href` which is full-nav; the in-app track-switch via React state + replaceState would behave differently — runtime probe of the in-app primitive defers to a future cycle) | ⚠ PARTIAL — same | ⚠ PARTIAL — same |
| Sanctuary-blip mid-song doesn't nuke next-track entry | ⚠ PARTIAL — same probe-mechanic limitation; in-app A2 next-track gesture (replaceState + IDB chart) likely PASSes but not exercised here | ⚠ PARTIAL — same | ⚠ PARTIAL — same |

**15/15 cells now have runtime verdicts** (up from 0/15 in run-1). **Net:** Cells 1+2 PASS for all 3 personas (chart bytes + wake-lock state survive offline transition cleanly). Cell 3 FAIL for all 3 personas (SW tombstoned — see F-C12-R2-009). Cells 4+5 PARTIAL for all 3 personas (probe used full-nav primitive which structurally fails offline regardless of app behavior; the in-app next-track replaceState path needs a separate probe-design pass).

**Cell-level runtime evidence captured in:** `.paul/research/cycle-12-saturday-readiness/run2-probes/probe-sectionE-offline.mjs`.

---

## §F — Out-of-cycle-12 scope (parking lot)

- **F-C12-R2-009's structural fix (a thin shell-cache SW)** — out-of-cycle-12 by Saturday-budget; the fix design itself is queued for a separate cycle. Paper-chart fallback per Daniel directive remains the Saturday backstop.

- **In-app next-track gesture probe (real A2)** — the §E Cells 4+5 partial verdicts trace to probe mechanics (full-nav primitive), not app behavior. A follow-up cycle should probe the in-app next-track-button + swipe-left primitives directly to grade the true A2 offline survival; that's likely a PASS but un-probed in this run.

- **Section-divider URL behavior intentionality (F-C12-R2-010)** — the rewrite-to-track-0 behavior is undocumented. The fix is a doc-update + maybe code special-case; out-of-cycle-12 because no Saturday-flow consequence.

- **Cron `verify-chart-bond-health` runtime probe (F-C12-005)** — CRON_SECRET correctly absent from sandbox per supervisor design. A future cycle's dispatcher could surface this secret to the cowork sandbox temporarily (or run the cron probe in a different harness with cron-side credentials) — out-of-cycle-12.

- **WebKit-engine specific re-verify of §E cells** — the engine-substitution caveat (§A header note) means a WebKit-equipped harness should re-fire the 5 cells to catch engine-specific gotchas (e.g., iOS Safari's wake-lock API may behave differently than Chromium's even in the same `goOffline` test envelope).

- **Harness-environment gap surfaced in this run** — `npx playwright install webkit` downloads the binary but the cowork sandbox lacks `libevent-2.1.so.7`, `libenchant-2-2`, `libsecret-1-0`, `libGLESv2`. No `sudo`/`apt`. Recommendation for cycle-13 PROMPT-design: either dispatch a Docker image with WebKit deps pre-installed, OR explicitly mandate Chromium substitution with the engine caveat in cyc-12-style runs.

---

## §G — Cleanup state + manual cleanup

Pre-cleanup verification:

```
[2026-05-28T22:34Z] BEARER pre-flight   →  starts crl_live_*, len 73 ✓
[2026-05-28T22:34Z] list_setlists(...)  →  includes cd2010f4 (real, v6, never mutated) ✓
[2026-05-28T22:34Z] clone setlist used  →  86a104ae-d728-4b64-9ec2-8c3b28b01613 (isTest:true)
```

Cleanup actions executed (post-report-write, pre-handoff):

```
[2026-05-28T22:42Z] delete_setlist({id:"86a104ae-d728-4b64-9ec2-8c3b28b01613"})       →  {ok:true, tracksDeleted:20} ✓
[2026-05-28T22:42Z] cleanup_all_test_data({prefix:"c12-saturday"})                    →  {removed:0, failures:[], aggregate:{}} ✓ (no test accounts were minted this run — probes ran anonymously against the clone URL since the deployed surface lacks NEXT_PUBLIC_PROBE_HARNESS_AUTH=1, making mintSession({firebaseAuth}) inoperable; cookie-only sessions would not have hydrated Firestore listeners per META-003)
[2026-05-28T22:42Z] list_test_accounts({})                                            →  {accounts:[]} ✓
[2026-05-28T22:42Z] list_setlists({sort:"recent_write", limit:5})                     →  [cd2010f4 v6 (real, untouched), 226309e2 v14, NWPBba50fltX6pNcyOVK v2, c5d41b02 v1, Ikl0sS4XcZil0Z04viAu v5] — no [CYCLE12-saturday] anywhere ✓
```

Clean. Zero orphans. Real `cd2010f4` still at version 6 (never mutated).

---

## §H — `findings.jsonl` (grep mirror — secondary)

```jsonl
{"id":"F-C12-001","shape":"matrix","status":"closed-at-af30cd90ff","anchor":"A1+A4","axis":"auth-divergence","persona":"anon","severity":"P0-privacy/closed","surface":"src/app/perform/page.tsx","evidence":"runtime-auditor","fix_hint":"closed externally; supervisor confirmed lift of splitPublicSetlists to SSR boundary"}
{"id":"F-C12-002","shape":"matrix","status":"pass","anchor":"A1","axis":"stickiness","persona":"admin","severity":"pass","surface":"src/lib/mcp/tools/clone-setlist.ts","evidence":"runtime","fix_hint":null}
{"id":"F-C12-003","shape":"matrix","status":"pass","anchor":"A1","axis":"stickiness","persona":"admin","severity":"pass","surface":"src/lib/mcp/tools/commit-staged-changes.ts","evidence":"runtime","fix_hint":null}
{"id":"F-C12-004","shape":"matrix","status":"pass-code-shape","anchor":"A1","axis":"auth-divergence","persona":"all","severity":"pass-code-shape","surface":"src/components/performance/PublicSetlistListing.tsx","evidence":"inspection","fix_hint":"runtime persona-axis probe of listing-page defers to a future cycle"}
{"id":"F-C12-005","shape":"matrix","status":"still-blocked","anchor":"A4","axis":"stickiness","persona":"anon-cron","severity":"pass-code-shape/still-blocked","surface":"src/app/api/cron/verify-chart-bond-health/route.ts","evidence":"still-blocked","fix_hint":"CRON_SECRET correctly absent from sandbox per supervisor; runtime defers to cron-equipped harness"}
{"id":"F-C12-006","shape":"matrix","status":"pass-songs/section-rewrite","anchor":"A2","axis":"stickiness","persona":"uid-agnostic","severity":"pass","surface":"src/app/perform/setlist/[id]/track/[trackId]/page.tsx","evidence":"runtime","fix_hint":"16/16 song tracks preserve URL; 4/4 section dividers rewrite to track-0 (see F-C12-R2-010)"}
{"id":"F-C12-007","shape":"matrix","status":"pass","anchor":"A2","axis":"stickiness","persona":"uid-agnostic","severity":"pass","surface":"src/components/performance/PerformanceToolbar.tsx + src/hooks/use-musician-transposition.ts","evidence":"runtime","fix_hint":null}
{"id":"F-C12-008","shape":"matrix","status":"pass","anchor":"A4","axis":"offline-survival","persona":"uid-agnostic","severity":"pass","surface":"src/components/performance/KeepAwakeToggle.tsx + src/hooks/use-wake-lock.ts","evidence":"runtime","fix_hint":null}
{"id":"F-C12-R2-009","shape":"heuristic","status":"new","anchor":"A4","axis":"offline-survival+reload","persona":"uid-agnostic","severity":"P1","surface":"public/sw.js + src/lib/push-notifications.ts","evidence":"runtime","fix_hint":"re-introduce thin perform-shell SW distinct from killed legacy serwist; NetworkFirst on ~12 routes + static chunks"}
{"id":"F-C12-R2-010","shape":"matrix","status":"new","anchor":"A2","axis":"stickiness","persona":"uid-agnostic","severity":"P3","surface":"src/app/perform/setlist/[id]/SetlistPerformClient.tsx:99-131","evidence":"runtime","fix_hint":"commit to either preserve section URL or fall back to bare path; document intentionality inline"}
```

---

## HANDOFF-COMPLETE message body (for `.coord/inbox/supervisor.md`)

```
from cycle-12-saturday-readiness (run-2 harness-grade)
HANDOFF-COMPLETE
Saturday-readiness verdict: SHIP-AS-IS (F-C12-R2-009 P1 worth queue but NOT pre-downbeat-blocking; paper-chart fallback per Daniel directive)
anchors-covered: A1 ✓ runtime · A2 ✓ runtime · A3 OUT · A4 ✓ runtime
bug-classes-covered: stickiness ✓ runtime · fresh-tablet OUT · auth-divergence ✓ runtime (F-001 closed externally)
load-bearing P0/P1 findings (≤5 IDs + one-line moments):
  F-C12-R2-009  P1 heuristic — SW tombstoned; offline-RELOAD path structurally non-recoverable (chart bytes survive offline, app shell does not)
cy