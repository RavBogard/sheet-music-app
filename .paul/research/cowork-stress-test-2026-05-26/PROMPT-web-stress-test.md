# Cowork stress test — Web / iPad surface (centralreform.live)

> **Drafted 2026-05-26 against deployed surface at origin/master `32dca1a6df`.**
> Harness shape: **Hybrid** — Claude-for-Chrome current extension is the PRIMARY
> probe surface (Daniel-pasted access); the in-sandbox Playwright harness at
> `cycle-4/harness/` is the LOAD-BEARING FALLBACK for true-iPad-viewport fidelity
> + probes CFC can't reach (long-press synthesis, offline-network toggle,
> deterministic timing, screenshot capture at 820×1180 WebKit).
>
> Memory `[[feedback_cowork_real_harness]]` flagged "CFC+chrome.debugger DOES NOT
> WORK." That was the 2026-spring shape — Anthropic's current Claude-for-Chrome
> browser extension has evolved and is treated here as a real (if limited)
> harness for navigation + DOM-read + console capture. **If CFC blocks on a
> probe** (touch gestures, viewport override, Firebase Web SDK auth state,
> offline simulation), fall through to Playwright per §"Fallback path" below
> without ceremony.
>
> **Verify-before-write pre-flight per `[[feedback_cowork_prompt_verify_before_write]]`:**
> (1) Routes + components cited below verified via `git ls-tree origin/master`
>     + grep against current source ✓
> (2) MCP tool param shapes (where the PROMPT uses MCP for fixture creation /
>     cleanup) cross-checked against deployed Zod schemas — see
>     `MCP-INVENTORY.md` in this directory ✓
> (3) Memory rules distinguished proposal-shape vs deployment-shape ✓
> (4) SHA-bound claims tied to `32dca1a6df` ✓

---

## You are cowork-Claude

You are a single-thread cowork-Claude test session. Your job is to find bugs in
the deployed centralreform.live web experience, **iPad-priority**. Real wall-clock
budget per `[[feedback_cowork_real_harness]]`: **~75 minutes**. Be focused;
quality-of-evidence beats coverage-breadth.

### Hardware target — the band iPads

Per `[[project_band_ipad_hardware]]`: 6× standard 11" iPads, WebKit, viewport
**820×1180** portrait, `deviceScaleFactor: 2`. Every iPad-priority finding must
note whether you observed it at that viewport — CFC at a desktop window-size
DOES NOT REPLICATE iPad touch ergonomics, scroll containers, or WebKit-specific
PDF.js / blob-URL behavior.

Per `[[project_band_ipads_incognito_state]]` 2026-05-23 — at last service the
band iPads were in **incognito**, so there's no Dexie persistence, no authed
listeners, no offline-cache survival across reload. The fix path is shared
sign-in to `crcmusic@centralreform.org` (band_leader). For this stress test,
probe BOTH modes (incognito + signed-in) and call out divergences.

### Setup

1. **Origin:** `https://www.centralreform.live`
2. **Authentication:**
   - For public probes (Perform-by-link, `/perform/setlist/[id]`,
     `PublicSetlistListing`): no auth needed. The setlist contents are PUBLIC
     BY DESIGN per `[[feedback_setlist_public_policy]]` — don't flag exposure
     as a security finding.
   - For authed probes (Dashboard, Library, Setlist editor, Monitor): Daniel
     will paste a root admin bearer at session start. Mint a band_leader-role
     test account via `create_test_account({ role: "band_leader", uidPrefix: "<your-id>" })`
     and use that account's bearer + `cycle-4/harness/lib/probe.mjs:mintSession`
     for Firebase Web SDK listener wiring (test-session cookie + customToken).
3. **Instance id:** Generate `cowork-web-<NNNN>` (e.g. `cowork-web-20260526a`).
   You'll use this as the `uidPrefix` everywhere.
4. **Cleanup contract:**
   - End-of-run: `cleanup_all_test_data({ prefix: "<your-id>" })` via MCP
     (note: param name is `prefix`, NOT `uidPrefix` — asymmetric API, verified
     against `src/lib/mcp/tools/test-tokens.ts`).
   - If you create setlists / library entries via the UI as your test account,
     they'll be swept by the cleanup-cascade. If you create them as Daniel
     (admin bearer), they will NOT be swept — DON'T do this; always create
     via the test account.

### Out of scope (hard boundaries)

- ⛔ **NO writes to real Daniel/David setlists** through the UI or MCP. All
  authoring probes happen against test-account-owned fixtures.
- ⛔ **NO Monitor writes against the live X32 desk** — even if it appears
  connected. Monitor probes are READ + UI-shape only (panel renders, fader
  affordance present, role-gate banner visible). Toggling a fader against a
  live desk during a service-day window is destructive. Use
  `get_bridge_health` via MCP to check `x32Connected` first; if `true`, AVOID
  the Monitor surface entirely except for unauthorized-access role-gate
  probes (which return early before any X32 write).
- ⛔ **NO modifying configuration documents** (`config/monitor`, `config/storageBackup`).
- ⛔ **NO ratifying bugs against the in-app `UploadDialog` / `ScraperModal`**
  as the canonical authoring path — per `[[user_mcp_is_primary_author_workflow]]`,
  Daniel authors via Claude+MCP, not the in-app UI. Bugs in those surfaces
  are valid bugs (band may use them) but NOT user-blocking for Daniel's
  weekly flow.
- ⛔ **NO source modifications.** This is research/docs only.

---

## Probe categories

> The web surface is large; you will NOT cover every page in 75 min — DON'T try.
> Pick representative flows per category and go DEEP with evidence.

### A — Cold-start performance (~10 min, iPad viewport mandatory)

Per coder-1 `firestore-lazy-import-refactor` `d04f21c4` + coder-2
`bundle-size-test-methodology-fix` `71878fcee7`: /login per-route preload
graph is ~735 KB / 11 chunks at the empirical measurement.

1. **CFC at iPad viewport (resize the browser window to 820×1180 if CFC allows it).**
   Open `https://www.centralreform.live/login` cold (private window or after
   cache clear). Record:
   - Time to first paint
   - Time to interactive
   - Console errors / warnings on cold load
   - Any third-party fetch that exceeds 200 ms
2. **Playwright fallback** (deterministic ipad-webkit project):
   ```
   PLAYWRIGHT_USE_REMOTE=1 \
   PLAYWRIGHT_BASE_URL=https://www.centralreform.live \
   npx playwright test e2e/perform-ipad-real-setlists.spec.ts \
     --project=ipad-webkit
   ```
   to confirm the bundle size doesn't regress under WebKit's exact replay.
3. Navigate to `/dashboard` after login. Capture `console.log` / `console.warn`
   the first 5 sec. Specifically watch for:
   - Firestore listener errors
   - 401/403/404 fetches in DevTools / network panel
   - "Hydration mismatch" warnings (RSC vs client-side render divergence)

**Finding-worthy:** TTI > 5s on iPad cold-load, 4xx on cold-load fetches,
Firestore listener errors, hydration mismatches, console warnings about
"Suspense" or "Cache" misuse, bundle size > 760 KB (current budget per
`src/__tests__/login-full-payload-size.test.ts`).

### B — Perform mode + bonded-chart render sweep (~15 min)

`/perform/setlist/[id]` is the THE iPad band surface. Pick **2 real upcoming
setlists** via `list_setlists({ sort: "recent_event", limit: 4 })` (read-only).
For each:

1. Open `https://www.centralreform.live/perform/setlist/<id>` cold (private
   window). Capture:
   - Time until the first chart renders
   - Number of charts that render successfully (PDF / MusicXML / text /
     image / audio) vs render-error
   - Console errors on each chart-open transition
2. Tap through every track row. For each chart format observed:
   - **PDF:** does it render at native width with the toolbar visible? Does
     pinch-zoom work? Does the WebKit blob-URL race per
     `[[feedback_react_pdf_worker]]` reproduce?
   - **MusicXML:** does SmartScoreViewer render? Does the detected key show
     in the transposer menu (per coder-5 `musicxml-phase2-capo-detected-key`
     ship `b3ef132b0`)? Does transpose-up-2 keep the layout stable (per
     coder-5 `musicxml-build-lane-b-transpose-jank` ship `7d209fa37`)?
   - **Audio:** does AudioViewer mount + play (per coder-2 `audio-viewer-blob-url-fix`
     ship `1e39b7b61` — network URL default, blob: only when offline)?
   - **Text:** does TextScoreViewer render via the IDB-first path (per
     coder-2 `ipad-text-viewer-fetch-fix` ship `651b200db`)?
3. Test the **KeepAwakeToggle** in the Perform header (coder-5
   `ipad-wake-lock-fix` ship `559c6c84d` + coder-1 `ipad-wake-lock-toggle-fix`
   ship `afbc56a7e` — gesture-gated wake lock). Verify the toggle reflects
   state correctly across iPad orientation changes.

**Finding-worthy:** "Failed to load PDF" recurrences, MusicXML scroll-restore
glitches after transpose, audio-spinner stuck, text-viewer 404 on real
fileId, KeepAwakeToggle out-of-sync with sentinel, any console error during
a chart-open transition.

### C — Live Director gesture (~10 min — Playwright fallback mandatory)

CFC can't synthesize a long-press; this category needs Playwright. The
deployed surface is `src/components/performance/LiveDirectorGesture.tsx` +
`src/components/performance/LiveDirectorMenu.tsx`, threaded through
`SetlistRow` / `SetlistView` / `PDFOverlay` / `SetlistPerformClient` per the
coder-5 `live-director-gesture` ship `83c86e6c2`. Only fires on
`isLeader` iPads.

1. As the band_leader test account, open the setlist editor at
   `/setlists/<fixture-id>` on iPad viewport.
2. Run `e2e/live-director-gesture.spec.ts` against your fixture setlist:
   ```
   PLAYWRIGHT_USE_REMOTE=1 \
   PLAYWRIGHT_BASE_URL=https://www.centralreform.live \
   npx playwright test e2e/live-director-gesture.spec.ts \
     --project=ipad-webkit
   ```
3. Manually via Playwright steps:
   - Long-press a song row → menu appears with Change Key / Swap Chart / Insert Song
   - Tap Change Key → key picker; choose Eb → menu closes; row shows new key
   - Long-press again → Swap Chart → picker; bind a different fileId → row updates
   - Race-test: rapid taps WHILE long-press timer is active; verify menu
     doesn't fire AND no orphan touch state lingers.
4. Probe `isLeader` gating: as a NON-leader test account (musician role),
   verify long-press DOES NOT open the menu.

**Finding-worthy:** menu opens for non-leader, menu fires on rapid taps
(timer not gated), key change doesn't propagate to `tracks/{id}.key`,
swap-chart breaks bond, screen-tap during menu doesn't close it.

### D — Library workflow + chart search (~10 min)

1. As band_leader account, navigate to `/library` (or wherever
   `SongChartsLibrary` mounts in current layout).
2. Search via the in-page Input. Probe:
   - Plain string search: "shalom" → expect lyric-or-title matches
   - Hebrew search: "שלום" → expect Hebrew-title matches (Hebrew lyric
     scope active per coder-2 `f4-lyric-search-persistence-mod` ship
     `3355bf194`)
   - Emoji prefix: "⚠️ STRESS <your-id>" → only your fixtures
3. Cross-check with MCP `search_chart_text({ query: "shalom", scope: "lyrics" })`
   — does the UI surface the same hits the MCP does?
4. Open a chart from the library list; verify `library_index` → Storage
   serve path resolves (no 404). Note that the `useContentSearch` /
   `ContentSearchResults` affordance was REMOVED 2026-05-26 by coder-6
   `drop-content-search-affordance` `4290cb778` — don't expect the old
   content-search UI; the unified Input is canonical now.

**Finding-worthy:** Hebrew search returns empty when MCP returns hits
(client/server lyrics-scope divergence), chart 404 on click, search input
debounce too slow on iPad keyboard, scroll position lost on search-clear.

### E — Setlist editing + chart-bind picker (~10 min)

1. As band_leader, create a fixture setlist via the UI Creation Wizard (or
   MCP `create_setlist`). Title: `STRESS <your-id> — <iso>`.
2. Add tracks via the in-app picker AND via `add_track_to_setlist` MCP —
   compare the two paths: do both end up with `mimeType` denormalized on
   the track per `[[project_track_mimetype_gotcha]]`?
3. Use the chart-bind picker on a row: tap-to-bind, search a chart, bind
   it. Verify the row icon flips from un-bonded to bonded.
4. Test the **chart-swap gesture** (the same long-press → Swap Chart path
   from §C but exercised end-to-end with real bytes).
5. Test the **gig-packet print** flow (`generate_gig_packet` MCP +
   in-app print route). Note that post-coder-4 `chord-extractor-fix`
   `548bf81083` + `f4-b-pdf-extractor-serverless-fix-v2` `6d4c37042b`,
   the chord extraction + PDF extraction paths on Vercel-serverless are
   no longer DOMMatrix-crashing.

**Finding-worthy:** picker bind doesn't update row, mimeType asymmetric
across picker vs MCP paths, gig-packet print returns 500, chart-bind
loses the bond on a soft reload.

### F — Authoring flow (chart-text Scraper) (~5-10 min)

Per `[[user_mcp_is_primary_author_workflow]]`, Daniel authors via MCP,
not the in-app Scraper/UploadDialog. But the BAND may use those flows
to upload personal charts. Probe:

1. Open `ScraperModal` (wherever it's wired in the layout). Paste a
   simple chord-chart URL — does it scrape + display the parsed chart?
2. Open `UploadDialog`. Upload a small fixture PDF (mime: application/pdf).
   Confirm the chart appears in `list_library` AND `library_index/<id>`
   is consistent per `[[project_catalog_dual_read_surfaces]]`.
3. Note any difference in UX between MCP authoring (you have the receipts
   from the MCP-stress-test PROMPT) and UI authoring.

**Finding-worthy:** Scraper crashes on a real chord-chart URL, UploadDialog
silently fails (no library row created), UI authoring writes inconsistent
fields vs MCP path.

### G — iPad touch ergonomics (~5-10 min)

Per the UI/UX skill: 44×44 px minimum touch target on iPad. At 820×1180
viewport:

1. Open Perform mode + setlist editor. Walk every tap target. Use
   browser-devtools "show touch target" or measure manually.
2. Specifically audit:
   - Setlist row tap-vs-long-press collision (Live Director gesture)
   - Header back-link + KeepAwakeToggle proximity
   - Monitor popover triggers in `PerformanceToolbar`
   - Chart-bind picker buttons
   - Library list row affordance
3. Test orientation change mid-flow (portrait → landscape → portrait).
   Verify scroll position + open dialogs survive the rotation.

**Finding-worthy:** any tap target < 44×44, accidental triggers from
adjacent targets, modal/sheet that loses content on orientation change,
scroll-position lost on rotation.

### H — Offline behavior (~10 min — Playwright fallback mandatory)

The probe spec exists at `e2e/r1-offline-decisive.spec.ts` (coder-5
offline-perform-fix shipped); reuse it.

1. Sign in (NOT incognito), navigate to Perform mode, OPEN one chart.
2. Toggle network offline via Playwright `page.context().setOffline(true)`.
3. Navigate to a different track row — does the chart render from cache?
4. Reload while offline — does the page survive (precached pdf.js worker
   per the offline-perform-fix)?
5. Reconnect — does the in-flight queue (chart-bind picker, etc.) drain
   cleanly?
6. Repeat the entire sequence in **incognito** — expect degraded behavior
   (no Dexie persistence, no authed listeners). Confirm graceful
   degradation, not crash.

**Finding-worthy:** ANY uncaught exception during the offline transition,
reload-while-offline white-screens (regression of the offline-perform-fix),
queue doesn't drain after reconnect, incognito mode crashes (it should
degrade gracefully).

### I — Monitor surface UI-shape only (~5 min, NO X32 writes)

★ **READ-ONLY for this lane** — no fader writes. Just confirm the UI
mounts correctly. Per coder-5 `monitor-popup-fullbottom-redesign`
(in-flight 2026-05-26) and coder-1 `monitor-master-mute-fix` (in-flight
2026-05-26), this surface is actively evolving — don't flag mid-flight
changes as bugs unless they're obvious.

1. As a band_leader (NOT a musician — they'd hit the role gate via
   `useMonitorAccess`), open `/monitor`. Confirm panel mounts.
2. As a member account, open `/monitor` → expect role-gate banner /
   redirect.
3. As band_leader, open the in-Perform Monitor popover from the
   `PerformanceToolbar` (the `<QuickMonitorPanel />` mount per line 157 of
   `PerformanceToolbar.tsx`). Verify the popover opens.
4. **Do NOT toggle any fader / mute.** Confirm `get_bridge_health`
   `x32Connected` state matches what the UI shows.

**Finding-worthy:** musician got through role gate, popover crashes,
ConnectionIndicator says connected while `get_bridge_health` says false,
fullbottom-redesign breaks toolbar layout.

### J — Accessibility (~5 min)

Run an axe scan against representative pages via the harness's
`cycle-4/harness/lib/runAxe.mjs`:

```
node cycle-4/harness/lib/runAxe.mjs <route>
```

(Or use CFC + the axe-core CDN script in DevTools.)

Pages to scan: `/login`, `/dashboard`, `/library`, `/perform/setlist/<id>`,
`/setlists/<fixture-id>`.

**Finding-worthy:** any `serious` or `critical` violation; SR-blocking
issues (missing aria-label on icon buttons, no focus-visible on tap
targets, color-contrast failures on key flows).

---

## Fallback path — when CFC blocks

If CFC can't reach a probe, use Playwright in-sandbox at `cycle-4/harness/`:

1. From repo root: `bash cycle-4/harness/install-harness.sh` (idempotent;
   installs Playwright + WebKit ~once).
2. Run the relevant existing e2e spec (see `e2e/` for the catalog —
   `perform-ipad-real-setlists.spec.ts`, `perform-ipad-deep.spec.ts`,
   `live-director-gesture.spec.ts`, `r1-offline-decisive.spec.ts`,
   `library-ipad.spec.ts`, `stress-ipad.spec.ts`).
3. Authenticate via `mintSession({ baseUrl, bearer, uid, firebaseAuth })`
   from `cycle-4/harness/lib/probe.mjs`. Don't use `__c7_auth_for_probes__`
   — it's there but per memory `[[feedback_probe_harness_prod_flag]]` it's
   token-gated and not the canonical auth path.

Each Playwright run is one cache-miss; budget accordingly (single targeted
probe is 1-2 min wall-clock, multi-spec run can chew 5-15 min).

---

## Cleanup (end-of-run, ~5 min)

```
1. delete_chart / delete_setlist for any UI-created fixtures owned by your test account
   (the cleanup_all_test_data cascade should catch these, but explicit deletes
   first reduce surface area for the cascade).
2. cleanup_all_test_data({ prefix: "<your-id>" }) via MCP
3. Verify residuals:
   - list_test_accounts() — none matching your prefix
   - search_library({ query: "<your-id>" }) — empty
   - list_setlists({ limit: 20 }) — no fixtures matching your prefix
```

Per `[[feedback_sandbox_test_isolation]]`: ALWAYS pass `prefix`. A
prefix-less cleanup sweeps EVERY `test-` account globally, which would
take out parallel sibling sessions.

---

## Report format

Write findings to `.paul/research/cowork-stress-test-2026-05-26/REPORT-web-stress-test-<your-id>.md`.

```markdown
# Web stress-test report — <your-id>

**Run date:** 2026-05-26T<hh:mm>Z
**Harness mix:** [CFC primary, Playwright fallback used for: <categories>]
**Authed-as:** band_leader (uid: test-<your-id>-band_leader-<hex>)
**Viewport observed:** 820×1180 portrait (iPad) / <other if applicable>
**Master SHA at run:** <captured by hitting /api/health or similar, OR skip>
**Cleanup state:** [clean / partial — list orphans by fileId/setlistId/uid]

## Summary

- Probes executed: <n>
- Findings: <n> (BLOCKER:<n> / HIGH:<n> / MED:<n> / LOW:<n> / INFO:<n>)
- Pages touched: <list>
- Test accounts created: <n>
- Fixture setlists/charts created: <n>

## Findings

### F-001 — <one-line title>
- **SUT:** <page route OR component OR observable behavior>
- **Severity:** BLOCKER | HIGH | MED | LOW | INFO
- **Repro:** <exact steps — viewport, route, gesture sequence, network state>
- **Expected:** <what the inventory + the standing rules predicted>
- **Actual:** <what you observed — screenshot path / console excerpt / network response>
- **Hypothesis:** <where in the codebase you suspect the bug, OR "unclear">

### F-002 — ...
```

**Severity calibration:**
- **BLOCKER** — band can't perform Friday-eve or Shabbat-morning service
  (Perform mode crash, chart 404 on real upcoming setlist, role-gate bypass,
  data loss).
- **HIGH** — Perform-mode degradation that breaks band trust (intermittent
  render fail, offline regression, Live Director gesture broken,
  KeepAwakeToggle silently inactive).
- **MED** — usability friction (slow TTI, search confusion, modal layout
  bug, tap target slightly under 44×44).
- **LOW** — copy / styling / non-critical a11y warning.
- **INFO** — observation worth a follow-up.

---

## What I am NOT being asked to do

- **Not** running the MCP stress test (separate PROMPT — `PROMPT-mcp-stress-test.md`
  in this directory).
- **Not** writing fixes. Find bugs; supervisor will spawn a fix lane.
- **Not** modifying source.
- **Not** filing UI-shape findings against `UploadDialog` / `ScraperModal`
  as "Daniel's authoring blocker" — those are band paths, not Daniel's.
- **Not** flagging setlist contents as a security leak (PUBLIC BY DESIGN).
- **Not** touching the live X32 desk.

Go.
