# CRC Music — Marathon Whole-Product Stress Test (2026-05-17)

**Goal:** Find bugs everywhere. The previous bugstomp passes were
narrow (v5 = full MCP, v6 = W-04 + bond parity + iPad subset). This is
the WHOLE PRODUCT: every MCP tool, every web surface, every role,
every auth state, every device class — under realistic and adversarial
conditions. Plus a deliverable on MCP-gap analysis (what tools Daniel
needs but doesn't have).

**You will run for ~6+ hours autonomously.** Daniel won't be available
to answer questions mid-run. Step 1 below is a hard-gated interview
phase — collect EVERYTHING you need before going dark, because the
cost of having to stop and ask is much higher than a thorough 15-min
intake.

**Target:** Production `https://www.centralreform.live` (apex 307s to
www). **MCP endpoint:** `https://www.centralreform.live/api/mcp`.

**Branch tip expected:** `07840c65b` or later. **Tool count expected:**
42.

---

## ⛔ STEP 1 — Mandatory intake interview (do this BEFORE any probing)

You DO NOT have all the credentials and capabilities you need yet.
Stop and ask Daniel for the following in a single batched question
block. Do not start probing until every field is filled in or
explicitly skipped:

### Required intake

1. **Admin/leader MCP bearer token.** A `crl_live_...` value. The
   most recent one (2026-05-16) was rotated after that session.
   Daniel may have a fresh one or may need to mint one via the in-app
   token settings page. Without this, MCP probes can't run.

2. **Test account credentials.** For each non-admin role you'll need
   to test, ask Daniel for:
   - `band_leader` — email + password OR a separate `crl_live_*` token
   - `musician` — email + password OR token
   - `member` — email + password OR token
   - If Daniel doesn't have a dedicated test account for a role, ask
     whether you should skip that role's coverage or whether he wants
     to provision one before you start.

3. **Browser-automation capability.** Confirm what browser-driver
   tools you actually have in this run (Playwright? Chrome DevTools
   Protocol? raw fetch only?). If you can drive a real browser,
   confirm iPad-viewport emulation is available (you'll need 1024×768
   and 820×1180 for the Perform-mode probe). If you can ONLY do raw
   HTTP, tell Daniel up front so he can adjust expectations — the
   iPad UX phase will degrade to API-shape probes only.

4. **Existing/safe production state.** Ask Daniel:
   - Is there a setlist you'd like cowork to use as the canonical
     "real, healthy setlist" for read-side probes? (Otherwise you'll
     pick one yourself via `list_setlists`.)
   - Is there a setlist intentionally left broken (broken bonds,
     missing charts) that you want exercised? (Cowork's v6 used
     `2cef501a` for this.)
   - Any setlist or chart you DO NOT want touched (e.g. live Friday's
     setlist)?

5. **Known pain points.** Daniel mentioned "things sometimes need a
   hard reset (F5)" but doesn't have a specific repro. Ask: any
   surface where this is more common? Any feature he avoids because
   it feels flaky? Any recent prod complaint from David Lazaroff or
   another user?

6. **MCP gap signal.** Ask Daniel to free-form 2-3 things he WISHES
   he could do via MCP but can't today. This seeds the gap-analysis
   deliverable in Phase 11.

7. **Time-budget confirmation.** Confirm Daniel is OK with a ~6+ hr
   run. Confirm whether you should stop early on any CRIT finding to
   surface it, or batch everything into the final report.

8. **Standing rules acknowledgment.** Tell Daniel you understand:
   - No `bridge/**` probing (CRIT-003 deferred, separate workstream)
   - Chart bytes are intentionally public (don't flag accidental
     accessibility as a bug — that's the standing policy)
   - Admin panel styling is intentionally out of scope
   - Any bugstomp-created setlist/chart prefixed `⚠️ BUGSTOMP` for
     the final cleanup sweep
   - You will NOT modify environment variables, Firestore rules,
     production code, or anything outside your test fixtures

### After intake: prepare a brief plan

Once Daniel answers, write a 1-paragraph plan summary back to him:
"I've got X creds, Y can't be tested because Z, I'll spend ~N
minutes on each phase, expect to be done around HH:MM, will surface
CRITs immediately and batch the rest." Get a thumbs-up, then go dark.

---

## Scope

### IN scope

**A. MCP authoring flow (the daily path)**
- All 42 tools — happy path + edge path + adversarial input per tool
- Weekly flow end-to-end: build setlist → add tracks → bond charts →
  verify charts → preview publish → publish → confirm fanout
- W-04 optimistic-concurrency: stale_version envelope across every
  gated path, version-echo in responses (create_setlist /
  bulk_add_tracks / publish_setlist({dryRun}))
- W-01 agentic surface (the 6 tools v6 skipped):
  `propose_setlist_changes`, `commit_staged_changes`, `preview_publish`,
  `flag_bond`, `review_flagged_bonds`, `record_bond_correction`
- Monitor tools (8): list_monitor_buses + get_mix + get_matrix +
  set_send_level + set_send_mute + set_bus_fader + set_matrix_fader +
  set_matrix_mute. Probe each at least once for response shape; don't
  try to mutate live hardware during a service window.
- Chart ingestion: upload_chart + scrape_chart_from_url +
  save_scraped_chart + import_chart_from_drive + delete_chart +
  download_chart + generate_gig_packet
- `wait_for_setlist_change` live-wake retry (v6 left this inconclusive
  — try harder this time, e.g. two real HTTP connections)
- AGENT-GUIDE.md surfaces correctly via the MCP server's
  `serverInfo.instructions` field
- Rate-limit behavior: trusted-leader bypass actually works; non-
  trusted accounts hit the limit at expected thresholds

**B. Browser app — authed band/leader surfaces (laptop viewport)**
- `/library` — search, filter, upload UI (Daniel doesn't use it but
  the band might; verify it still works post-MCP-pivot)
- `/setlists` — list view, click into a setlist, edit metadata
- `/perform/setlist/{id}` — full Perform mode at desktop viewport
- `/monitor` — mixer UI (don't touch live faders during a service;
  probe shape, gates, websocket connect/disconnect)
- `/manage` + `/manage/templates` — admin/band_leader pages
- `/schedule` — roster / scheduling surface
- `/settings` — user settings, MCP token issuance, integrations
- Probe each: page loads cleanly, no console errors on first render,
  data hydrates, navigation between pages doesn't leak state

**C. iPad / tablet — Perform mode**
- Set viewport to 1024×768 (iPad horizontal) and 820×1180 (iPad
  vertical). Test both.
- Open a real setlist via `/perform/setlist/{id}`
- Touch interactions: tap track row, swipe-to-advance, pinch-zoom on
  PDF
- Broken-bond Retry flow (v6 found dedup-reset; verify F-07 fix
  landed at `a80a4669c`)
- Audio-bonded row error message (F-17 — confirm prose matches spec)
- Chord chart text rows (scrape_chart text rendering)
- PDF rendering correctness (workerSrc unconditional fix from
  `3b76279f2` — every chart renders, no "Failed to load PDF" floods)
- Performance on real iPad-class hardware if possible (otherwise
  Lighthouse-throttled CPU 4x in dev tools)
- Offline behavior: cached charts via Dexie IDB still render with
  network cut? (use DevTools "Offline" or Charles)

**D. Public / incognito + auth boundary**
- Hit every authed route while logged out → confirm correct redirect /
  401 / 403 (NOT a leaked partial render)
- Hit `/api/mcp` with no bearer → 401
- Hit `/api/mcp` with a malformed bearer → 401, no info leak
- Hit `/api/drive/file/{fileId}` with no auth, valid-format fileId →
  chart bytes should return (intentional per
  `feedback_chart_access_policy.md`); but invalid fileId should NOT
  enumerate
- OAuth endpoints (`/api/mcp/oauth/*`) — confirm the discovery flow
  works end-to-end for a new MCP client; no half-rendered HTML
  leaking auth state
- Public marketing pages if any (`/`, `/privacy`, `/terms`,
  `/sms-consent`, `/changelog`) — render clean, no auth-state
  pollution

### OUT of scope (don't probe these)

- `bridge/**` and anything that surfaces the bridge — CRIT-003 deferred
  per Daniel 2026-05-14
- 0.85 fuzzy-dedup threshold tuning — `force: true` is the standing
  override (see [[feedback_dedup_force_override]])
- Tightening of `drive/file` auth — chart bytes are intentionally
  fetchable by any holder of a fileId per Daniel 2026-05-15
- Admin panel visual styling — out of scope per project facts
- `/v2/*` redesign surface — active in-flight UI work, separate
  branch / not yet shipped to master (verify by visiting once;
  don't deep-probe)

---

## Standing rules

- **F-05 dryRun is observability** — every `dryRun: true` returns the
  full report (chart-health, audience, etc.) without requiring
  `force`. Refuse-gates fire only on real writes.
- **isError validation envelope** — when an MCP tool fails inputSchema
  validation, response is `result.isError: true` with `content[0].text`
  JSON-parseable to `{error: "Input validation error: ..."}`. The
  `-32602` code does NOT appear on the JSON-RPC envelope (the v5/v6-pt1
  F-02 fixes hunted for it on the wire and shipped two no-op
  wrappers; v6-pt2 `84645abbc` is the correct fix). If you see raw
  `-32602` over the wire, that's a real regression worth flagging.
- **Cleanup** — every bugstomp setlist / chart prefixed `⚠️ BUGSTOMP`.
  Final phase verifies `search_library({query: "BUGSTOMP"})` returns
  `[]` and `list_setlists({limit: 50})` shows no bugstomp residue.
- **Side-effect safety** — no real publish notifications to the band.
  Use `dryRun: true` for publish probes by default; if you absolutely
  must do a real publish, scope `recipients` to ONLY your own uid
  (Daniel confirmed publisher-filter intentionally drops the
  publisher → `recipientCount: 0` is fine and expected).
- **Monitor tools during services** — don't mutate live faders if
  there's any chance someone is in a live IEM mix. Daniel may have
  given you a window; respect it.
- **MCP token holding** — if Daniel hands you a `crl_live_*` token
  during intake, don't log it to disk or commit it anywhere. Hold in
  conversation context only.

---

## Phase plan

You're running ~6+ hrs. Phase durations are guidance; deeper is
fine on any phase that surfaces something.

### Phase 0 — Sanity + identity (~5 min)

- `list_monitor_buses` returns `isPrivileged: true` for the bearer
- Tool count = 42 (check `tools/list`)
- AGENT-GUIDE.md content shows up in MCP `serverInfo.instructions`
- Branch tip matches expected (or note divergence)

### Phase 1 — MCP weekly authoring flow end-to-end (~30 min)

Re-enact Daniel's weekly flow as if it's Friday:
- `list_setlists({from, to})` with this Friday's date — find any
  in-progress setlist or create fresh `⚠️ BUGSTOMP Stress 1`
- `bulk_add_tracks` with ~6-10 song rows + 2-3 header rows
- For each song: `search_library` by title → bond via songId
- `verify_setlist_charts` → expect all-healthy if you picked legit
  songs
- `preview_publish` → `recommendation: 'publish'`
- `publish_setlist({dryRun: true, recipients: [{uid: self}]})` →
  expect `recipientCount: 0` (publisher-filter intentional)
- `wait_for_setlist_change({sinceVersion: pre, timeoutSec: 60})` in
  parallel with an `update_track` → confirm live-wake fires within
  ~1s (v6 couldn't measure this; try harder via two HTTP connections
  or `Promise.all`)

### Phase 2 — Every MCP tool surface probe (~90 min)

Walk all 42 tools. For each:
- **Happy path** with valid args
- **Edge** — empty arrays where allowed, max-length strings, optional
  args omitted vs. supplied
- **Adversarial** — bogus IDs, wrong types, oversized payloads,
  injection attempts in string fields (`</script>`, SQL-shaped
  strings, unicode normalization edge cases)
- **Auth boundary** — probe with non-trusted account where the tool
  should refuse; confirm structured error envelope
- **Rate-limit** — for non-trusted accounts, exceed the limit and
  confirm refusal; for trusted accounts, confirm bypass

Note response shape per tool. Flag any that returns inconsistent
envelopes vs. the rest.

### Phase 3 — W-01 agentic surface (the 6 tools v6 skipped) (~45 min)

Use the brief at `sheet-music-app-mcp/OTHER-CLAUDE-NOTE.md` for the
per-tool concerns checklist. Specifically:
- `propose_setlist_changes` stage isolation across two agents
- `commit_staged_changes` behavior when underlying version bumped
  between stage + commit
- `preview_publish` recommendation cross-product (clean / flagged /
  broken bonds)
- `flag_bond` cross-setlist trackId guard
- `review_flagged_bonds` — current bonded songId excluded from
  alternatives; `contextKey` actually biases ranking
- `record_bond_correction` counter symmetry + N=3 inline aggregation
  into `titleContextHints`

### Phase 4 — Browser app authed surfaces, laptop viewport (~60 min)

Navigate every authed route as each available role:
- /library, /setlists, /perform/setlist/{healthy}, /perform/{fileId},
  /monitor, /manage, /manage/templates, /schedule, /settings
- For each: load cleanly, console-error-free, react-query data
  hydrates, no auth-leak, navigation back doesn't pop stale state
- Test cross-tab: open same setlist in two tabs, edit in one, watch
  the other for live update (depends on library_signals or setlist
  listener)
- Form submissions: setlist metadata edit, track add via UI

### Phase 5 — iPad Perform mode (~45 min)

At iPad viewport (1024×768 + 820×1180):
- Load a healthy setlist's Perform mode
- Tap a track → PDF renders within 2s
- Swipe-to-next-track → state advances cleanly
- Pinch-zoom PDF; transposition controls; annotate (if shipped)
- Broken-bond row → tap → Retry → tap → confirm F-07 dedup persists
  across the remount (v6 fix landed; verify behavior)
- Audio row → confirm F-17 message
- Offline: cache a chart, kill network, reload tab → cached chart
  still renders from Dexie

### Phase 6 — Public / incognito / auth boundary (~30 min)

- Visit `/perform/setlist/{id}` logged out → correct gate
- Visit `/library` logged out → correct gate
- Hit `/api/mcp` with no bearer → 401 with no body leak
- Hit `/api/drive/file/{validFileId}` no auth → expect 200 chart
  bytes (intentional)
- Hit `/api/drive/file/<random-uuid>` → confirm no enumeration
  signal (timing or shape difference between real-and-orphaned vs.
  doesn't-exist)
- Marketing pages render w/ no auth-state pollution

### Phase 7 — Hard-reset hunt (~45 min)

Daniel reports "things sometimes need F5" — no specific repro. Hunt
systematically:
- **State hydration races:** load a page, refresh while data fetch is
  mid-flight, see if final state matches a clean load
- **react-query staleness:** mutate via MCP in another tab, watch if
  the browser tab updates within the configured stale-time, OR if it
  requires F5
- **Listener drift:** open Perform mode, leave for 5+ min, MCP-edit
  the setlist in the background, confirm browser sees the update
  without F5
- **Service-worker cache:** if there's a SW (`sw.js`), confirm it
  doesn't serve stale chart bytes after `delete_chart`
- **Vercel CDN staleness:** `/api/library/list?all=true` cache headers
  were fixed by H-4 (`98094bceb`); confirm still healthy by uploading
  a chart via MCP then checking `/library` within 5s
- **WebSocket reconnect:** /monitor WS — kill connection, expect
  auto-reconnect without F5
- **Auth-state drift:** sign in, sign out in another tab, see what
  the original tab does

Report any state where F5 fixes something that should self-heal.

### Phase 8 — Concurrency + race scenarios (~30 min)

Simulate two agents (yourself + a fake second agent via parallel
HTTP):
- Two `update_track` on the same row simultaneously → confirm
  optimistic-concurrency rejects one (lastSeenVersion mismatch)
- `propose_setlist_changes` from agent A, `commit_staged_changes`
  from agent B with stale version → expect rejection
- `publish_setlist` while `update_track` is in flight → which wins?
  No torn write?
- `bulk_update_tracks({mode: 'atomic'})` with 2 stale rows in a 10-
  row batch → confirm zero writes land + `staleRows[]` correctly
  populated

### Phase 9 — Performance probes (~30 min)

- TTFB on `/api/mcp` tools/list, list_setlists, list_library
- First-paint on Perform mode (Lighthouse if browser available)
- Vercel cold-start: measure latency on a tool that hasn't been
  called in 5+ min
- PDF render time for a 10-page chart
- generate_gig_packet on a 15-track setlist — total elapsed + output
  size
- Sustained throughput: 20 sequential `search_library` calls — any
  rate-limit surprise for trusted-leader

### Phase 10 — MCP-gap analysis deliverable (~45 min)

Write a section in the final report titled **"MCP gap analysis"**
with three subsections:

**a) Missing tools Daniel called out during intake.** Verbatim what
he said, plus your assessment of feasibility / scope / dependency on
existing infrastructure.

**b) Missing tools you noticed while probing.** Things you wished
existed while doing Phase 1's weekly flow re-enactment. Examples to
think about:
- `clone_setlist` (only `bulk_add_tracks` from template approximates)
- Roster / scheduling tools ("who's playing tonight")
- `archive_setlist` if not present
- Bulk delete / bulk re-bond
- Library hygiene: `mark_orphaned_chart`, `bulk_delete_orphans`
- Notification recall ("unpublish")
- Monitor: `set_bus_assignment` (channel→bus routing) — Daniel
  flagged this 2026-05-14 but it's deferred

**c) Existing tools that are clunky.** Things that have a tool but
the agent UX through Claude Desktop is awkward. Examples:
- Tools that require >1 round trip when 1 would do (e.g. did you have
  to call `get_setlist` after `update_track` to know the new
  version? — `version-echo NOTE` fix should have closed this)
- Tools whose descriptions are misleading vs. actual behavior
- Tools whose error messages are technically correct but not
  agent-friendly
- Tools with too-narrow inputSchemas that reject obvious natural-
  language args

For each gap: severity (blocker / nice-to-have / cosmetic), scope
estimate (small / medium / large), and Daniel-flow impact (weekly
authoring / band consumer / monitor / other).

### Phase 11 — Cleanup + final report (~30 min)

- Delete every `⚠️ BUGSTOMP` prefixed setlist via `delete_setlist`
- Confirm `search_library({query: "BUGSTOMP"})` returns `[]`
- Confirm `list_setlists({limit: 50})` shows no residue
- Restore any test fixtures touched
- Write the final report at the **deterministic autonomous-run path**:
  - Report → `C:\Users\dsbog\CentralReform.live\sheet-music-app-mcp\outputs\autonomous-run\cycle-{N}\cowork-report.md`
    (where `{N}` is the cycle number — `1` if you're cycle 1, otherwise
    you'll have been told your cycle number in your launch handoff)
  - **The directory already exists**; do NOT create it elsewhere.
- As the VERY LAST step (after the report is verified on disk), write
  a sentinel flag at
  `C:\Users\dsbog\CentralReform.live\sheet-music-app-mcp\outputs\autonomous-run\cycle-{N}\COWORK-DONE.flag`
  containing a single line with the current ISO timestamp.
  **This flag triggers the autonomous processor to start fixing your
  findings — your report MUST be complete + on disk before you write
  the flag.**
- If any of your findings is severe enough to interrupt Daniel's
  sleep (CRIT-grade: prod data corruption, iPad surface dark, auth
  boundary leak, anything that breaks tomorrow's service), ALSO
  write a `CRIT-WAKE-DANIEL.flag` file in the same dir alongside the
  normal flag. The processor will page Daniel via PushNotification
  on detecting it.

---

## Hard-reset hunt — what to look for

Categories where F5 commonly fixes self-heal-able state:
- React-query cache that didn't invalidate on a mutation (missing
  `invalidateQueries` call)
- Firestore `onSnapshot` listener that disconnected silently
- Service worker serving stale CDN response
- localStorage / sessionStorage out of sync with Firestore
- Auth token expired but UI didn't show signed-out state
- Optimistic UI update that didn't get reconciled with server result
- Browser tab in background → throttled → state diverged from server

For each instance you find: capture (a) what state was visible
before F5, (b) what F5 produced, (c) the elapsed time / interaction
sequence that led there. Reproducibility > rarity — file a LOW even
for one-off if you can't repro, but flag higher if repeatable.

---

## Report shape (same shape as v5/v6 for comparability)

Drop at `sheet-music-app-mcp/outputs/marathon-stress-test-2026-05-17-report.md`.
Top-to-bottom:

1. **Verdict** — one paragraph. Sentinel words: "shippable" / "land
   the CRITs first" / "block release".
2. **Run summary** — start time, end time, surfaces touched, total
   probes attempted, total probes successful, identities used.
3. **Severity-ordered findings table** — ID, severity (CRIT / HIGH /
   MED / LOW / NOTE), one-line, surface, Daniel-flow impact.
4. **Per-finding details** — for each: repro, observed, expected,
   suspected cause, suggested fix, blast radius, screenshots / curl
   transcripts as artifacts.
5. **Per-phase pass/fail table** — every phase, pass or fail or
   skipped, one-line notes.
6. **Hard-reset findings** — even if there are none, say so
   explicitly with what you tried.
7. **MCP-gap analysis** — three subsections per Phase 10.
8. **Performance numbers table** — what you measured.
9. **Surfaces NOT probed (and why)** — out-of-scope items, things
   you tried but couldn't reach, things deferred.
10. **Cleanup confirmation** — bugstomp residue check.
11. **Particularly want to know** — Daniel's question-equivalent.
12. **Artifacts** — list of every chart / setlist created + deleted,
    screenshots taken, raw curl transcripts captured.

### Severity bar

- **CRIT** — anything that breaks (a) Daniel's MCP-first weekly
  authoring flow, (b) the band's iPad Perform mode rendering charts,
  (c) auth boundary (anything leaking PII or letting a non-leader
  publish), or (d) production data corruption. Surface immediately
  if you can interrupt Daniel; otherwise put at the top.
- **HIGH** — wrong/silent data, orphan manufacture, broken-bond reaching
  publish without warning, regression of a v5/v6 fix.
- **MED** — degraded UX that has a workaround, observable but non-
  blocking inconsistency, a missing piece of envelope data.
- **LOW** — cosmetic, edge-case rendering, log spam, copy issues.
- **NOTE** — observations worth flagging that aren't bugs (e.g. "this
  feels slow but I didn't measure", or "this tool's description
  could be tighter").

---

## Particularly want to know (Daniel's questions back to you)

Answer these explicitly in the report:

1. **Is the weekly authoring flow shippable end-to-end without me
   ever touching the browser?** (yes/no + evidence)
2. **Is the iPad Perform mode bulletproof for the band?** (yes/no +
   evidence + screenshot samples)
3. **Are there MCP tools David Lazaroff (2nd band_leader) needs but
   doesn't have?** (this comes out of the gap analysis)
4. **Did any of the v6 fixes regress?** (F-02 isError content
   rewrite, W04 envelope polish, F-07 retry-remount, B-006 orphan
   marks staying applied, B-007 repack + version backfill)
5. **What's the worst CRIT you found?** (one paragraph)
6. **Is there anything you saw that Daniel should know about but
   didn't ask for?** (use the "Discoveries beyond the prompt"
   section freely)

---

## Anti-patterns (don't do these)

- Don't auto-fix anything. This is observation-only. Even an "obvious"
  typo gets reported, not patched.
- Don't probe `bridge/**` even out of curiosity.
- Don't run a real publish to the actual band (only dryRun, or
  publish to self with the publisher-filter-intentional behavior).
- Don't try to discover Daniel's other users' tokens or PII.
- Don't run anything that would fire a real SMS, email, push, or
  notification to a non-bugstomp recipient. (SMS specifically has
  cost and a service-side rate limit.)
- Don't run during a known live service window (Friday eve, Sat
  morning) unless Daniel explicitly says it's OK.

---

**Final note:** Daniel's standing posture is "keep going until it's
right." If a phase reveals deeper issues than the budget allowed,
spend the extra time. Aim for a complete + well-evidenced report
even if it takes longer than the ~6 hr guidance.
