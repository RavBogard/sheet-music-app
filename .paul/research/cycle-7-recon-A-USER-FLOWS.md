# Cycle-7 Recon — Agent A — Real-User-Flow Reconnaissance

**Author:** recon-agent-A
**Date:** 2026-05-19
**Sibling agents:** B (cowork capabilities), C (protocol critique)
**Working tree:** `sheet-music-app/` @ master tip (read-only)
**Source citations:** `[[memory-slug]]` references `MEMORY.md` index entries; file paths are Windows-absolute per `[[feedback_absolute_paths_for_paste_targets]]`.

---

## §1 — Friday-night critical path (answers Q1)

Tuesday-MCP-authoring → Friday-bima-chart in 6 boundary hops:

1. **Daniel authors via Claude Desktop → MCP** (`C:\Users\dsbog\centralreform.live\sheet-music-app\src\app\api\mcp\route.ts`). Tool sequence: `list_setlists` → `clone_setlist_from_template` (Lane 2 ship) → `add_track_to_setlist` → `assign_musician` → `suggest_band` (C6C-009 500 pre-Lane-1) → `generate_gig_packet` (C6C-008 shortcut-drop pre-Lane-1) → `publish_setlist`. Trusted-leader rate-limit bypass per `[[feedback_admin_rate_limit_bypass]]`.

2. **MCP → Firestore (admin SDK).** Tool handlers write `setlists/*`, `scheduling_assignments/*`, `library_index` mutations. Atomic-guard contract per `[[feedback_upload_atomicity]]`. Dedup at 0.85 strict per `[[feedback_dedup_force_override]]`.

3. **publish_setlist fan-out.** Triggers in-app notification + FCM push (`api\push\send\route.ts`) + Resend email + Twilio SMS. Default recipient derivation post-C5C-005 excludes `test-*` users. Verifies via `api\webhooks\resend\route.ts`.

4. **iPad cold-launch Friday 5:30pm.** Musician taps push deeplink. `/login` (`src\app\login\page.tsx`) → Firebase Auth → `api\auth\session\route.ts` cookie. Token refresh path: `api\auth\refresh-session\route.ts` (60+ hours since last sign-in).

5. **Setlist view `/perform/setlist/[id]`** (`src\app\perform\setlist\[id]\page.tsx`). Public-by-design per `[[feedback_setlist_public_policy]]`. Logic-Pro track rows per `[[feedback_no_cover_art]]`. Track tap → chart-binder picker → `library_index` lookup → fileId.

6. **Chart fetch + PDF render.** `api\library\file\[id]\route.ts` (Storage backend for `upload-*`, Drive for legacy per `[[project_file_storage]]`). react-pdf v10 with unconditional workerSrc override per `[[feedback_react_pdf_worker]]`. `PerformanceToolbar` (full) drives transpose/annotate/zoom/metronome.

**Weakest links a synthetic cowork test would NOT trip:**

- **iPadOS Safari (PRIMARY).** Playwright/Chromium on Linux sandbox — never touches iPadOS gesture-bar overlap, Safari worker-init timing, IndexedDB quota under multi-tab, viewport `maximum-scale=5` (C6B-012 POLISH), or react-pdf cold-start fingerprint on Mobile Safari.
- **Network reality.** Shul wi-fi is congested. Cowork has lab-grade network; no probe of "PDF chunk download stalls at 50% then resumes 12s later".
- **Push-notification roundtrip.** publish_setlist returns `{ok}`; cowork stops. No iPad-side validation that APNS delivers, deeplink resolves to `/perform/setlist/<id>`, auth survives the 60h gap.
- **Stale Claude Desktop tool cache.** When MCP ships a new tool mid-session, Daniel must reconnect to pick it up. Cycle-6 Lane 2 ship would surface this on real-Daniel Tuesday morning.
- **Cross-tab concurrency.** If a musician opens `/monitor` (IEM mix) concurrently with `/perform`, WebSocket state collides with chart browse. Untested.
- **`api\setlists\notify-updated\route.ts` live-edit path.** Unique value-prop over paper. Zero cycle has exercised the "edit-while-service-is-happening" path.

## §2 — David weekly-flow gap (answers Q2)

Cycle-6 Instance C ran synthetic-David per `[[project_david_band_leader]]`: `create_test_account({role:'band_leader', uidPrefix:'6C'})` + Web-SDK signInWithCustomToken on Playwright.

**Got RIGHT:**
- Surfaced the 6-tool template-MCP gap (C6C-001..C6C-006) → drives Lane 2 cycle-6-fixes scope.
- Confirmed gig-packet shortcut regression C6C-008 (drives Lane 1).
- Confirmed `suggest_band` 500 C6C-009 (drives Lane 1).
- Validated trusted-leader gate works for band_leader.

**Got WRONG (or didn't probe) vs an actual David session:**

1. **Steering by tool catalog, not English intent.** Instance C asked "is `list_templates` registered?". Real David asks "what does Randy's typical Shabbat morning look like?". The interesting failure mode is whether Claude Desktop intuits the tool from the English. Synthetic agent KNEW the tool name; real David doesn't. Untestable in cowork by construction.
2. **No multi-turn iteration drift.** Real David: clone-edit-clone-edit until happy (per memory: 90% same week-to-week, tweaks a few songs). Cycle-6 ran each tool once and asserted shape. Optimistic-concurrency / last-write-wins / partial-batch-failure under 5-turn iteration: untested.
3. **No frustration loop.** When `suggest_band` 500'd, synthetic stopped + filed. Real David retries with different phrasing, then texts Daniel. Time-to-Daniel-text is the meaningful UX metric; cowork can't measure.
4. **No fallback to `/manage/templates`.** Given the template-MCP gap, real David's likely fallback is the in-app authoring UI at `src\app\(main)\manage\templates\page.tsx`. Synthetic never opened that surface — it's been rotting in Daniel's MCP-first blind spot per `[[user_mcp_is_primary_author_workflow]]`.
5. **No Hebrew-title typo tolerance.** Daniel knows transliterations. David might type "Lechu Nranina" / "L'chu N'ran'na" / "Lechu Nranena". Auto-suggest tolerance untested under cognitive load. Instance D probed RTL synthetically; the live-typing variant is different.
6. **No Claude Desktop tool-cache invalidation probe.** If Lane 2 ships Tuesday and David hits at 9am Wednesday, does the new template MCP surface even show up without explicit reconnect?

## §3 — Under-probed routes (answers Q3)

`Glob src\app\**\page.tsx` × cycle-1-6 instance profiles:

**Zero coverage / actual blind spots (verdict (c)):**

- **`src\app\(main)\audio\page.tsx`.** Never probed. Cross-refs `api\recordings\*` (`upload`, `file\[id]`). Likely rehearsal-recording playback. Stakes: medium — Randy probably uses for arrangement review.
- **`src\app\qr\[code]\page.tsx`** + `api\auth\qr\route.ts`. QR device-pairing. Untouched. **HIGH** stakes if iPads onboard this way (Daniel: confirm — open Q).
- **`src\app\(main)\schedule\page.tsx`** + 8 `api\scheduling\*` endpoints (suggest, suggest-band, assign, unassign, respond, remind, calendar-feed, history). Untouched in cowork UI side; `suggest_band` broke in cycle-6 cleanly because no human had hit this UI in weeks.
- **`src\app\(main)\monitor\page.tsx`** + `\monitor\admin\page.tsx`. IEM mixer (`[[project_mixer_feature]]`). Load-bearing during live services. UI side never cowork-probed; MCP exposure is a separate planned phase deferred in `MEMORY.md` deferred-issues.
- **`src\app\perform\[fileId]\page.tsx`** (single-chart deep-link, distinct from setlist view). Untouched. Push deeplinks may target this.
- **`src\app\(main)\manage\templates\page.tsx`.** Template authoring UI. Persistence at `src\lib\template-firebase.ts`; 16 hardcoded liturgical templates at `src\lib\liturgical-templates.ts`. Lane 2 (cycle-6-fixes) ships MCP tools that wrap this — but the UI itself remains David's likely fallback.
- **`src\app\(main)\settings\page.tsx`** + `api\mcp\tokens\*`. Bearer rotation lives here. 5 burned bearers from cycle-6 dispatch (TRIAGE). Daniel hits this every cowork dispatch; revoke-UX friction never measured.
- **`api\recordings\upload\route.ts`** + `\file\[id]\route.ts`. Untouched.
- **`src\app\(main)\page.tsx`** authed landing. Glanced at, never asserted-on.

**Verdict (a) low-stakes:** `unauthorized`, `auth-error` (one-time error landings).

**Verdict (b) admin-only and intentionally skipped:** `(main)\admin`, `(main)\manage`, `api\admin\*` (migrations, set-role, set-upload-permission, set-sound-engineer, delete-user), `api\cron\*` (sync, scheduling-reminder, backup, enrich, drive-sync, admin-consistency). Per `MEMORY.md`: "Admin panels left unstyled (out of scope)".

## §4 — Structural blind spots of synthetic cowork (answers Q4)

Per `[[feedback_cowork_real_harness]]`: ~75min in-sandbox Playwright at `cycle-4\harness\`, CFC+chrome.debugger doesn't work, `/api/auth/test-session` gives session cookie but no Web-SDK auth state.

10 plausible real-user failure modes synthetic structurally cannot trigger:

1. **iPadOS Safari z-index vs system gesture bar on `PerformanceToolbar`.** Chromium-on-Linux never renders Safari's bottom-safe-area conflict zone. Human-iPad shadow catches in one tap.
2. **react-pdf v10 worker cold-init under Safari + IndexedDB cache eviction after 4 idle days.** workerSrc override per `[[feedback_react_pdf_worker]]` is unconditional, but Mobile Safari has different worker timing than Chromium.
3. **APNS push delivery + deeplink + auth-state-survives-cold-launch roundtrip.** publish_setlist asserts `{ok}`; real iPad receipt, deeplink resolution, auth persistence across 60h: invisible to cowork.
4. **Stale Claude Desktop tool cache after MCP redeploy.** Lane 2 ships → Daniel's session caches old tool list → silent "tool not found" until restart.
5. **Twilio SMS deliverability to carrier-dropped numbers.** publish_setlist response shape asserts `recipients`; actual SMS receipt invisible.
6. **Concurrent Daniel+David `add_track_to_setlist` on same setlistId.** Last-write-wins data loss path: MCP write atomicity contract per `[[feedback_upload_atomicity]]` covers chart upload but not setlist-track append. Cycle-6 burned 4 bearers but never overlapped.
7. **Real-camera OMR via `api\ai\omr\route.ts`.** Synthetic uses pre-rendered chord-chart PDFs. Phone-photo of a fading paper chart at shul: never probed.
8. **PDF print on the shul's old Brother laser.** Gig-packet PDF generates and downloads in cowork; doesn't print. Font subsetting failures, Hebrew glyph dropout, non-A4 paper-size scaling: invisible.
9. **Offline service worker scope during live service.** Wi-fi blips → can the iPad keep rendering charts already loaded? Untested. THE Friday-night failure mode.
10. **Annotation persistence across signout / device-swap.** `PerformanceToolbar` annotations storage layer (per-device IndexedDB? server-synced? per-user?). Untested. Musician swaps iPads, loses last week's fingering notes.

## §5 — Hidden-dependency rot inventory (answers Q5)

Per `[[user_mcp_is_primary_author_workflow]]` (2026-05-15 pivot), Daniel has stopped touching in-app authoring. Surfaces decaying without Daniel-driven friction:

- **`src\app\(main)\library\page.tsx` + `UploadDialog` + `ScraperModal`.** Upload paths: `api\library\upload`, `charts\scrape`, `drive\save`, `setlists\import\extract-document` + `\resolve` + `\commit-document` + `\execute`, plus OMR. **HIGH rot risk** — 8+ endpoints, no Daniel-driven heat for weeks. David / Randy fallback path if MCP misses.
- **`src\app\(main)\setlists\[id]\page.tsx` setlist editor.** SetlistGrid.tsx in CODER.md do-not-touch zone. Drag/drop, vocal-lead picker, reorder UX untested by Daniel for 2+ weeks. (Note: `[[feedback_terminology]]` — "Vocal Lead" not "Lead".)
- **`src\app\(main)\manage\templates\page.tsx`.** Lane 2 ships MCP wrapper; UI rots in parallel.
- **`src\app\(main)\(root)\page.tsx`.** Authed landing — Daniel sees but doesn't act on. Real-user heatmap unknown.
- **`src\app\(main)\settings\page.tsx`** MCP token UI. 5 burned bearers/cycle = high-frequency Daniel touch. Revoke UX at N=5 untested.
- **`src\app\perform\[fileId]\page.tsx`.** Single-chart deeplink — author loop bypasses entirely.
- **`PerformanceBottomBar`.** Per `MEMORY.md`: "kept but no longer used in PDFOverlay". Explicit code-rot signal. Cycle-7 confirms safe-to-delete OR finds a forgotten consumer.
- **`api\drive\save\route.ts` + `api\drive\health\route.ts`.** Daniel uses `import_chart_from_drive` MCP wrapper; these UI-side endpoints potentially orphaned.

Cycle-7 should probe these even though Daniel doesn't use them — David's natural post-green shadow will hit them first.

## §6 — Recommended cycle-7 mission ask (answers Q6)

Six ranked journeys. Each ~1 paragraph "day-in-the-life" + load-bearing assertion.

**J1. Friday-evening band-member iPad cold-launch — HIGHEST PRIORITY**

*Day in the life:* 5:30pm Friday. Musician arrives shul. Opens iPad mini last used 7 days ago. Taps Wednesday's push notification. App cold-launches → `/perform/setlist/<id>`. Auth still valid (no re-login prompt). Taps track 1 ("Lechu Nranina"). Chart renders. Transposes C → D. Annotates. Plays.

*Load-bearing assertion:* Tap-to-first-chord ≤ 5s; `PerformanceToolbar` visible ABOVE iPad gesture bar at all viewport orientations; transpose without flash; last-Friday annotations persist; works under shul wi-fi congestion.

*Why this for cycle-7:* Cycles 1-6 never touched real iPadOS. This is THE production failure mode. Requires human-shadow probe (Daniel + a real iPad mini).

**J2. David weekly authoring under post-Lane-2 template MCP**

*Day in the life:* Tuesday 9am. David opens Claude Desktop. "I need a Shabbat morning service for Saturday. Use Randy's usual." Claude steers to `list_templates` → `clone_setlist_from_template`. David: "Swap track 3 for something more upbeat than 'Yedid Nefesh' — maybe Carlebach-ish." Claude calls `update_setlist_track` after `list_library` filtered by Carlebach. Iterates 3-5 turns. Publishes via `publish_setlist`.

*Load-bearing assertion:* English intent → published setlist in ≤ 8 LLM turns, zero tool-not-found, zero rate-limit (band_leader trusted-leader bypass holds), zero "I need to confirm with Daniel" deflections, zero stale-tool-cache surprises.

*Why this for cycle-7:* Validates Lane 2 ship under realistic multi-turn pressure, not the single-shot tool-shape probes cycle-6 ran. Closest synthetic proxy to David's post-green natural shadow.

**J3. Multi-author concurrent setlist edit (Daniel + David, same setlistId)**

*Day in the life:* Friday 2pm. Both Daniel and David open Claude Desktop. Both call `add_track_to_setlist` on Saturday's setlist within 5 seconds of each other. One is adding "Halleluyah" at position 4; the other is adding "Adon Olam" at position 9.

*Load-bearing assertion:* Both tracks land in final setlist. If a position conflict occurs, ONE caller surfaces an error (rich envelope per REG-001/002 contract); silent overwrite of the other's track is BLOCKS-GREEN.

*Why this for cycle-7:* Cycle-6 burned 4 bearers but never overlapped writes. As David ramps into authoring, this becomes routine.

**J4. iPad library page deep-probe (silent rot canary)**

*Day in the life:* Wednesday rehearsal, 7pm. Band-member opens `/library` on iPad. Searches "Adon Olam". Filters to "Shabbat morning". Opens one chart. Tries to annotate.

*Load-bearing assertion:* Library page render ≤ 2s; search returns ≥ 1 result; chart opens; annotation toolbar visible; alphabetical sort + pagination per `list_library` Lane (C5).

*Why this for cycle-7:* `/library` has rotted in Daniel's MCP-first blind spot. David / Randy probably hit it occasionally. Cheap to probe; high signal if broken.

**J5. Push-notification → deeplink → auth-still-valid roundtrip**

*Day in the life:* Daniel publishes Wednesday 2pm. Musician's iPad receives APNS push. Tap-deferred to Friday 5:30pm (~63h gap). Tap opens directly to `/perform/setlist/<id>`. No re-login.

*Load-bearing assertion:* Push delivered (Twilio / APNS receipt log) + deeplink resolves to correct setlist + auth cookie survives the gap.

*Why this for cycle-7:* Synthetic cowork structurally cannot test this. Requires real iPad + ≥ 60h time gap OR Daniel-shadow with synthetic-clock-skip.

**J6. Daniel emergency mid-service edit**

*Day in the life:* Service is live. Randy decides to swap closing song. Daniel pulls iPhone, opens Claude Desktop, types "swap closing song to 'Esa Einai' on tonight's setlist". Claude: `update_setlist_track`. Musicians' iPads ostensibly pull via `api\setlists\notify-updated\route.ts` Firestore listener.

*Load-bearing assertion:* End-to-end edit → iPad refresh ≤ 30s; iPad reflects new track without manual refresh; chart auto-pre-fetches.

*Why this for cycle-7:* The "live edit" path is the unique value-prop over paper. Zero cycle has tested it. If it's silently broken (no listener wired), the system is functionally paper-equivalent during services.

## §7 — Open questions for Daniel

1. **Is `src\app\qr\[code]\page.tsx` + `api\auth\qr\route.ts` the actual iPad onboarding flow, or vestigial?** Sets J1 sub-priority (do we probe onboarding from scratch or assume already-paired?).
2. **Should cycle-7 probe `/monitor` UI even though MCP exposure is a separate planned phase per `[[project_mixer_feature]]`?** UI side has zero cycle coverage; MCP-monitor lane is deferred.
3. **Are you willing to be the human-shadow with a real iPad mini for J1 + J5?** Or defer to David's post-green natural shadow ~1 week post-cycle-6-fixes-ship per `[[project_david_band_leader]]`?
4. **For J6 (live edit propagation): is `api\setlists\notify-updated\route.ts` actually wired to a Firestore listener that pushes to iPads, or does the band-member iPad still require manual refresh?** Pre-recon code-path verification recommendation: ask Agent B to confirm shape before cycle-7 dispatch.
5. **Should Lane 5 unauth-edge findings (`/accessibility` 404, `/login` bundle 2.5×, `/perform` no-SSR) be re-probed in cycle-7?** Or is auditor-deployed-surface validation under the new `[[feedback_auditor_deployed_surface_verification]]` discipline sufficient single-pass?
6. **For the J4 library rot canary — is the in-app `UploadDialog`/`ScraperModal` officially "out-of-scope for cycle-7" because David also authors via MCP, or still in-scope because Randy might fallback there?** Affects scope cap for the library probe.

---

from recon-agent-A
