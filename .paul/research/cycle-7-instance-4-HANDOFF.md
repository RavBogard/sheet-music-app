# Cycle-7 Instance 4 — HANDOFF (Real-data read-only probe)

**Author:** coder-4
**Role:** PROBE / read-only
**Bearer:** `crl_live_cf81…d1dbf` (admin, from supervisor pool row `ASSIGNMENT=cycle-7-instance-4`; burned in pool file on completion)
**Deployed prod SHA:** `59b25c87a4cd52bd0d1a2826398595ce7eec3c80` (per `/api/version` 2026-05-19T15:35Z; version `7.0.0`)
**Wall-clock:** ~50 min (boot ~5, probes ~30, write-up ~15)
**Tools touched:** `tools/list`, `dump_collection_size`, `list_library`, `search_library`, `reconcile_library({dryRun:true})`, `list_setlists`, `get_setlist`, `verify_setlist_charts`, `get_correction_stats`, `get_ai_config`, `list_review_queue`, `list_service_personnel`, `list_pending_assignments`, `list_musicians`, `list_templates`, GET `/api/version`. Zero write-tool invocations. HARD-STOP discipline held.
**Findings:** 11 (1 HIGH, 4 MED, 4 LOW, 2 INFO). Detail in `cycle-7-instance-4-findings.jsonl`. Artifacts under `cycle-7-instance-4-artifacts/`.

---

## Cardinality table (2026-05-19 baseline snapshot)

Probe 1 (`dump_collection_size`, 2026-05-19T15:31:01–05Z):

| Collection | docCount | estimatedBytes | newestTimestamp |
|---|---:|---:|---|
| `setlists` | 45 | 148 782 | n/a (collection no tracked-ts on this tool) |
| `tracks` | 576 | 222 584 | n/a |
| `library_index` | 568 | 307 496 | n/a |
| `setlistTemplates` | 0 (→2 4 min later via Instance 1) | 0 | n/a |
| `users` | 20 | 13 617 | n/a |
| `scheduling_assignments` | 0 | 0 | n/a |
| `aiEnrichmentCache` | 0 | 0 | n/a |
| `aiCorrectionSignals` | 0 | 0 | n/a |
| `webVitalsObservations` | 261 | 110 027 | 2026-05-18T23:43:16Z |

Supplemental Probe 4 dumps:

| Collection | docCount |
|---|---:|
| `aiEnrichmentRetryQueue` | 0 |
| `aiCorrectionStats` | 0 |
| `aiConfig` | 1 |

---

## Probe 1 — Cardinality snapshot

Captured for 9 + 3 supplemental collections (above). **A1 PASS** — full snapshot taken; no prior cycle baseline exists yet so deltas are establishment-only (this is the new baseline).

Notable shape:
- `tracks / setlists ≈ 576 / 45 = 12.8` average rows per setlist (includes section headers per `list_setlists.description`).
- `library_index = 568` ÷ Drive-id-shape-only reconcile-scanned `286` ≈ **half the library is upload-* shape, half Drive-id shape**. Storage-canonical migration is roughly midway in observable terms.
- `users = 20` vs `list_musicians.count = 10`: roughly half the user base is non-musician (members, ex-musicians, admin-only).

---

## Probe 2 — Library hygiene + orphan drift

`reconcile_library({dryRun:true})` returns:
- scanned: 286
- alreadyHealthy: 231
- driveMirror.count: 0 (no Drive-present-but-Storage-missing rows; storage-canonical mirror is keeping up)
- **orphan.count: 24**

**A2 PASS-with-drift-flag.** Orphan count is **24**, NOT the 272 figure recorded in `[[project_orphan_baseline]]` (2026-05-19 memory entry). Either (a) memory was wrong by an order of magnitude, OR (b) cycle-5-fixes Lane 2 (mirror→orphan escalation @ `5c546920d`) reclassified ~248 rows since the memory note was written. Sampled orphan names include load-bearing songs (`Mizmor L'David`, `Ana B'Koach`, `Yedid Nefesh revised 1-1-26`, `May the Memory - Full Score`, `Lecha Dodi Lincoln's Nigun`, `Stuart's Hora Medley`) — these match the names cycle-3 DATA-001 already flagged for salvage. **`[[project_orphan_baseline]]` memory needs correction; 24 is the live number.**

Sample of 50 active rows via `list_library`:
- mimeType present: **50 / 50** ✅ (backstop coverage 100% in `library_index`; the `[[project_track_mimetype_gotcha]]` problem stays scoped to the chart-binder/picker track-docs surface, not library)
- enrichmentStatus present (non-null): **0 / 50** ⚠
- status mix: 46 active, 4 archived
- fileId prefix: 25 upload-* (MCP/in-app uploads), 25 Drive-id-shape (legacy/Drive importer)
- collection field: present on upload-* rows; `null` on most Drive-id rows
- Legacy Drive-imported rows surface with `uploadedBy: null` + `fileSize: null` + Drive-id `fileId`. Expected per `[[project_file_storage]]`.

---

## Probe 3 — Setlist health

`list_setlists` total: **45** (matches Probe 1 cardinality).

Published-vs-draft posture: **1 / 45 published** (`publishedAt != null`). Only one setlist (`c5d41b02-4888-41b7-a0e7-161250be9665`, eventDate 2026-05-16, trackCount=21) shows a publishedAt timestamp. The MCP `publish_setlist` tool (the 2026-05-15 weekly-flow closer) appears used **exactly once** in production.

`verify_setlist_charts` ran on the 10 highest-trackCount setlists (totals across the sample):

| Metric | Aggregate (10 setlists) |
|---|---:|
| trackCount | 252 |
| okCount | 116 (**46 %**) |
| bondedCount | 139 (55 %) |
| missingCount | 22 (~9 %) |
| needsSyncCount | 0 |
| shortcutUnresolvedCount | 1 |
| phantomBonds | 0 |
| orphanedMarked | 0 |
| unreachableCount | 0 |

Per-setlist breakdown in `artifacts/probe3-verify.txt`. Worst offender: **`tIJ5DlvkeeN1CWAUTUM2` — 16 tracks, only 4 ok, 10 missing** (62 % missing-charts). Six of the ten sampled setlists are ≥10 % missing-charts.

**A3 FAIL.** Sample avg 46 % okCount; A3 target was **≥80 % healthy chart bonds** across sampled published setlists. (Caveat: only 1 setlist is "published" so I substituted the 10 highest-trackCount setlists; result is sample-dependent but the spread is wide.) **Underlying signal is real and not an artifact of header-row dilution** — even bondedCount (which excludes headers) sits at 55 %.

Secondary integrity drift on first sampled setlist:

- `b12a5221-111a-4ffa-b408-350cdbd28190` (`Eitan Shabbat Morning 2/21`): `list_setlists.trackCount = 43` but `get_setlist(...).tracks.length = 0` and `verify_setlist_charts.trackCount = 0`. **The doc-level `trackCount` counter is out of sync with the `tracks/` subcollection for at least this setlist.** Not surfaced by any auditor in cycle-3/4/5/6.

---

## Probe 4 — AI enrichment cache state

| Surface | Value |
|---|---|
| `aiConfig.autoApplyEnabled` | `false` |
| `aiConfig.threshold` | `0.7` |
| `aiConfig.subscriberActive` | `true` |
| `aiConfig.provider` | `gemini` |
| `aiEnrichmentCache` cardinality | **0** |
| `aiEnrichmentRetryQueue` cardinality | **0** |
| `aiCorrectionSignals` cardinality | **0** |
| `aiCorrectionStats` cardinality | **0** |
| `get_correction_stats.totalSignals` | 0 (all action buckets zero) |
| `list_review_queue` | aiReview=0, aiFailed=0, importFailures=0 |
| `list_library` sample `enrichmentStatus` | 50 / 50 `null` |

**A4 PASS** on the literal acceptance bar (`aiEnrichmentRetryQueue ≤ 5` — trivially holds at 0).

**But the broader signal is dormancy.** NEW-3 (`0cf194841`, 2026-05-18T15:00Z) wired the enrichment subscriber. `aiConfig.subscriberActive=true` confirms the registration. Yet ~24 h later **every downstream artifact is empty** — no cache rows, no review-queue entries, no correction signals, no enrichment fields on a 50-row library sample. Two equally-plausible root causes:

  (a) **Zero chart-upload activity since NEW-3 shipped.** No `library.row.created` events → no subscriber invocations. (Probe 2 sample's most-recent uploadedAt is 2026-05-16T13:02, predating NEW-3.) Plausible — Daniel hasn't authored this week yet per project memory.
  (b) **Subscriber registered but not emitting / writing.** Would need a write-side probe to disprove. Out of read-only scope.

**Cannot disambiguate from read-only surface.** Surfacing as MED for cycle-7 TRIAGE: Instance 1's MCP weekly-flow probe (currently running per Probe 7) WILL exercise the upload path and either (a) produce enrichment artifacts that I should re-observe after Instance 1 closes, OR (b) confirm (b)-broken if Instance 1 uploads but enrichment stays at zero.

`[[project_ai_cost_baseline]]` placeholder per A8: **no Gemini spend observable from MCP read surface.** `aiEnrichmentCache=0` + `aiEnrichmentRetryQueue=0` implies zero token calls billed. Until enrichment fires, baseline = **$0 / 24 h window**. Re-snapshot post-Instance-1.

---

## Probe 5 — Scheduling + roster integrity

- `list_musicians`: **10** musicians (5 `musician` role, 3 `admin` role, plus 1 personal+1 work account for Daniel Bogard counted separately by uid). Two rows have `instrumentLabel: null` because `instrument` was free-text ("Guitar", "Drums") instead of the snake_case slug — Itai Forte + Myles Pollack. Cosmetic LOW.
- **David Lazaroff (2nd band_leader per project memory 2026-05-15) is NOT in `list_musicians.musicians[]`.** Either the tool filters out `band_leader` role rows (sees admin + musician only), or David's user doc is missing/different. INFO/MED finding — David is a stated weekly-flow target user.
- `list_service_personnel({})` returns rich-envelope `invalid_argument` requiring `setlistId` or `eventDate`. Tool is on the read whitelist but per-call scope; not a roster snapshot. Functional.
- `list_pending_assignments`: empty (0 assignments).
- `scheduling_assignments` cardinality: 0.

**A5 PASS by vacuity.** Zero assignments → zero orphans. The scheduling feature surface is functionally unused in prod (no real assignments). This may be by-design (musicians-track separate from setlist-track per project context) but `scheduling_assignments=0` deserves a note: if cycle-N has shipped scheduling write code, nobody has called it in prod.

---

## Probe 6 — Real-user CWV telemetry

`webVitalsObservations` cardinality: **261**.

- oldestTimestamp: 2026-05-18T00:41:58Z (≈22 h before P2-017 ship at `cf584729b` 2026-05-18T22:00Z — *interesting*; either timestamps got backfilled, or P2-017 deployed earlier than the master-tip commit hour, or my reading of the ship time is wrong).
- newestTimestamp: 2026-05-18T23:43:16Z.
- **Gap from newestTimestamp → probe time: ~15h 48m of zero new observations.**

`/api/admin/web-vitals/summary` → 404. `/api/admin/webvitals` → 404. **No HTTP read surface exists for querying webVitalsObservations beyond `dump_collection_size`.** Cannot compute p75 LCP/FID/CLS per top-5 routes from the MCP/HTTP layer.

**A6 INCOMPLETE.** Read surface gap. Two distinct findings here:

  (i) Even if a read tool existed, the data has been silent for ~16 h — either client-side write-path quietly broke OR there is genuinely no user traffic during the observation window (overnight CDT Friday → Saturday morning before Shabbat is plausibly quiet for this app).
  (ii) No admin-read MCP tool or HTTP route exists for the collection. Daniel cannot answer "what's prod p75 LCP" without Firestore console.

Severity MED for both — (i) needs a 24–48h re-probe to disambiguate quiet-period from broken-writer; (ii) is a missing-surface gap with a clear fix path.

---

## Probe 7 — Lane 2 template adoption

`list_templates` returns 2 rows at probe time (2026-05-19T15:35Z):

| templateId | name | templateType | owner | updatedAt |
|---|---|---|---|---|
| `d059ce84-…b098` | `c7i1-Shabbat morning quick variant` | shabbat-morning | `test-c7i1-band_leader-db04aebb` | 2026-05-19T15:35:08Z |
| `fb3d9b08-…ce36d` | `c7i1-Randys-Shabbat-Morning-Usual` | shabbat-morning | `test-c7i1-band_leader-db04aebb` | 2026-05-19T15:31:04Z |

**Both rows are Cycle-7 Instance 1's in-flight test fixtures** (uidPrefix `c7i1` confirms; updatedAt sits ~4–8 min into my probe window).

**A7 mixed verdict:**
- **Lane 2 template MCP CRUD pack works deployed.** Instance 1's `create_template` calls are landing as Firestore rows visible to `list_templates`.
- **Zero non-test user-created templates exist.** Daniel + David's "this is the starting-point conversation pattern" templates per `[[feedback_mcp_template_management]]` are **not yet authored**. The Probe 1 cardinality `setlistTemplates=0` reflects steady-state-before-Instance-1; Instance 1 is currently the only thing populating the collection.
- **No "16 hardcoded liturgicals" exist in `setlistTemplates/*`.** They presumably live as client-side constants or are not yet implemented. The §7 question "Are Daniel + David's MCP-created templates landing here, or is the collection only the 16 hardcoded liturgicals?" answers: **neither** — collection is empty except for active probe fixtures.

Implication for criterion 8 of the green rubric (synthetic David-flow PASS): Instance 1 will validate the create→clone path on its synthetic fixtures, but **the green rubric does not require any real Daniel/David-authored templates to exist** — adoption is a post-green observation. Lane 2 ships functional CRUD; usage is a separate question.

---

## Real-user CWV

(No table — see Probe 6. p75 LCP/FID/CLS per top-5 routes is unanswerable from the read surface available to me. Baseline I can capture: 261 observations across ~23 h of one calendar day, with a 16h silent tail.)

---

## Baselines

| Metric | Value | Notes |
|---|---:|---|
| Library orphan count (live) | **24** | vs `[[project_orphan_baseline]]` recorded `272` — memory is wrong by 10×, OR cycle-5-fixes Lane 2 reclassified the gap. |
| `aiEnrichmentRetryQueue` depth | 0 | A4 PASS |
| `aiEnrichmentCache` size | 0 | suggests zero successful enrichment runs ever, OR zero upload events |
| `aiCorrectionSignals` count | 0 | self-heal counter machinery unexercised |
| `webVitalsObservations` 7d window | 261 (1 calendar day only; ~16h silent tail) | quiet-period vs. broken-writer ambiguous |
| Gemini AI cost (24 h window) | **$0 inferred** | zero cache rows ⇒ zero enrichment ⇒ zero token cost; placeholder for `[[project_ai_cost_baseline]]` until enrichment fires |
| Setlists published / total | 1 / 45 | publish_setlist MCP used exactly once since 2026-05-15 ship |
| Templates user-created / hardcoded | 0 / 0 | (Instance 1 currently populating; not adoption) |

---

## A1–A8 verdicts

| # | Assertion | Verdict | Evidence path |
|---|---|---|---|
| A1 | 9-collection cardinality snapshot captured; deltas flagged | **PASS** (establishment baseline) | `artifacts/probe1-cardinality.txt` + cardinality table above |
| A2 | Library orphan delta from 272 baseline quantified | **PASS-WITH-DRIFT** — live is 24, memory had 272; salvage status: 24 rows present, all named load-bearing, none auto-salvageable per the same memo | `artifacts/probe2-library.txt` reconcile dryRun section |
| A3 | Sampled 10 setlists ≥80 % healthy chart bonds | **FAIL** — aggregate 46 %; worst case 25 % | `artifacts/probe3-verify.txt` + aggregate above |
| A4 | `aiEnrichmentRetryQueue ≤ 5` + deterministic correction-counter movement confirmed | **PASS on queue** (0 ≤ 5) / **FAIL on counter movement** (signals/stats both zero — counter has not yet moved post-ship) | `artifacts/probe4-ai.txt` |
| A5 | Zero orphaned `scheduling_assignments` in sample of 20 | **PASS by vacuity** (0 assignments total) | `artifacts/probe5-scheduling.txt` |
| A6 | Real-user CWV p75 LCP per top-5 routes; any >2.5s flagged HIGH | **INCOMPLETE** — no read tool / HTTP route to query the data; collection has 16h silent tail | `artifacts/probe67-templates-cwv.txt` |
| A7 | Template adoption count; David adoption pattern visible | **PASS-on-CRUD / FAIL-on-adoption** — 0 real user-created templates; Lane 2 MCP CRUD works (Instance 1's writes land) | `artifacts/probe67-templates-cwv.txt` |
| A8 | AI cost baseline recorded | **PASS-trivial** — baseline = $0 (zero enrichment activity captured) | inferred from A4 + Probe 4 |

---

## Findings (severity-only, per PARENT §4)

Detail in `cycle-7-instance-4-findings.jsonl`. Summary index:

| ID | Severity | Surface | One-liner |
|---|---|---|---|
| C7I4-001 | **HIGH** | `verify_setlist_charts` aggregate / library bonds | 10-setlist sample shows 46 % okCount (target ≥80 %); 6/10 setlists ≥10 % missing-charts; worst-case 62 % missing |
| C7I4-002 | MED | `setlists/{id}` doc vs `tracks/{id}` subcoll | Stale `trackCount` counter — `Eitan Shabbat Morning 2/21` (`b12a5221`) reports trackCount=43 but actual tracks subcollection is empty |
| C7I4-003 | MED | `[[project_orphan_baseline]]` memory vs live | Live orphan count is 24, not 272 — memory entry is wrong by 10× (or cycle-5-fixes Lane 2 reclassified ~248 without a memory update) |
| C7I4-004 | MED | NEW-3 AI enrichment pipeline | `subscriberActive:true` but zero artifacts in 24 h post-ship (cache 0, signals 0, queue 0, review 0, enrichmentStatus null on 50/50 library sample) — dormant by lack-of-input vs broken-writer ambiguous |
| C7I4-005 | MED | `webVitalsObservations` read surface | No MCP tool / HTTP route exposes p75 LCP/FID/CLS — `dump_collection_size` gives cardinality only; A6 unanswerable until a `get_web_vitals_summary` tool ships |
| C7I4-006 | LOW | `webVitalsObservations` write cadence | newestTimestamp 2026-05-18T23:43Z → ~16 h silent tail at probe time; quiet-period vs broken-writer ambiguous, re-probe in 24–48 h |
| C7I4-007 | LOW | `publish_setlist` adoption | Exactly 1/45 setlists has `publishedAt != null`; the 2026-05-15 "weekly-flow closer" MCP has been used once in 4 days |
| C7I4-008 | LOW | `list_musicians` instrument normalization | 2/10 rows have `instrumentLabel: null` because `instrument` is free-text ("Guitar", "Drums") instead of snake_case slug — cosmetic, no functional break |
| C7I4-009 | INFO | `list_musicians` / David Lazaroff presence | David (2nd band_leader per memory 2026-05-15) is not in `list_musicians.musicians[]` — likely role-filter (band_leader excluded), worth confirming the weekly-flow musician picker doesn't omit him |
| C7I4-010 | INFO | `setlistTemplates` adoption | 0 user-created templates from Daniel/David in production (Probe 7 saw 2 entries, both Instance-1 test fixtures created during my probe window) — Lane 2 CRUD works, usage hasn't started |
| C7I4-011 | INFO | `/api/version` builtAt format | Reports `builtAt: "5/18/2026"` for sha `59b25c87a` which was pushed 2026-05-19T21:55Z — date-string format ambiguous (US locale day vs build-date drift) |

---

## Repros

Read-side instance — per `cycle-7-instance-4-PROMPT.md` §6 "read-only probes don't strictly need prod-SHA stamping (read-side is by construction at master tip), but each finding should cite the Firestore collection + sample size."

Citation table:

| Finding | Collection | Sample / Tool |
|---|---|---|
| C7I4-001 | `setlists/*` + `tracks/*` | `verify_setlist_charts` on 10 highest-trackCount setlists (full id list in artifacts/probe3-verify.txt) |
| C7I4-002 | `setlists/b12a5221-…` + `tracks/*` | `list_setlists` (trackCount=43) vs `get_setlist({id:"b12a5221-…"})` (tracks=[]) vs `verify_setlist_charts` (trackCount=0) |
| C7I4-003 | `library_index/*` | `reconcile_library({dryRun:true})` → scanned 286 / orphan 24 |
| C7I4-004 | `aiEnrichmentCache`, `aiEnrichmentRetryQueue`, `aiCorrectionSignals`, `aiCorrectionStats`, `library_index` | `dump_collection_size` on each + `list_library({limit:50})` enrichment-field check + `get_correction_stats` + `list_review_queue` + `get_ai_config` |
| C7I4-005 | `webVitalsObservations` | `dump_collection_size`, GET `/api/admin/web-vitals/summary` → 404, GET `/api/admin/webvitals` → 404 |
| C7I4-006 | `webVitalsObservations` | `dump_collection_size` → newestTimestamp 2026-05-18T23:43:16Z vs scannedAt 2026-05-19T15:31:05Z |
| C7I4-007 | `setlists/*` | `list_setlists({limit:50})` × 2 sort modes; count of `publishedAt != null` = 1 / 45 |
| C7I4-008 | `users/*` (musician projection) | `list_musicians({})` |
| C7I4-009 | `users/*` | `list_musicians({})` — David Lazaroff not in returned 10-row musicians[] |
| C7I4-010 | `setlistTemplates/*` | `dump_collection_size` (0 at 15:31:03Z) + `list_templates({})` (2 at 15:35:08Z — both Instance-1 fixtures) |
| C7I4-011 | (no collection) | GET `/api/version` |

---

## Cleanup

**N/A — read-only instance.** Zero `create_test_account`, zero `create_template`, zero `create_setlist`, zero `add_track_to_setlist`, zero `update_*`, zero `delete_*` calls. No fixtures created → no cleanup needed. Cardinality re-probe at HANDOFF time would still show: `users=20` (unchanged), `setlistTemplates=2` (Instance-1's two test rows — NOT mine), `setlists=45` (unchanged). I added zero rows to any collection.

**Bearer burn.** Marked `cycle-7-instance-4` row → `ASSIGNMENT=burned` in `C:\Users\dsbog\.claude\projects\C--Users-dsbog-centralreform-live\.supervisor-bearers` on completion (see HANDOFF-COMPLETE message in `.coord/inbox/supervisor.md`).

---

## Cross-instance observations (for TRIAGE)

- Cycle-7 Instance 1 is actively running concurrent with my probe (`uidPrefix=c7i1` test fixtures landing in `setlistTemplates` during my window). The two Instance-1 templates I observed in Probe 7 are her work — supervisor will reconcile.
- The disparity between `setlistTemplates=0` at 15:31:03 (Probe 1) and `setlistTemplates` containing 2 rows at 15:35:08 (Probe 7) is **NOT a drift** — it's Instance 1's `create_template` calls completing between my snapshots. **This is positive evidence the Lane 2 write path works end-to-end in deployed prod.**

---

## Soft-re-entry trigger assessment (per PARENT §6)

- **≥3 BLOCKS-GREEN at TRIAGE?** I'm not green-gating at discovery per PARENT §4 + Decision 1. Supervisor TRIAGE will tag. My 1 HIGH (C7I4-001 missing-chart prevalence) is the most likely BLOCKS-GREEN candidate; the 4 MEDs split between data-integrity (C7I4-002, -003), feature-dormancy (C7I4-004), and read-surface-gap (C7I4-005).
- **Regression-of-shipped-fix?** Possibly — cycle-3 DATA-001 named exactly the songs I see in the live orphan list as needing salvage. Salvage path was shipped (`salvage_chart_bytes`) but I see no evidence it's been used. Not a regression-of-fix; more a not-applied-fix.

Supervisor's call.

---

*from coder-4*
