# Cycle-7 TRIAGE

**Author:** supervisor (draft — Daniel ratifies BLOCKS-GREEN/POLISH/DEFER tags + lane shape before dispatch)
**Date:** 2026-05-19T~23:30Z (synthesizing 5 HANDOFFs that landed between 15:55Z and 16:35Z)
**Anchor SHA:** `59b25c87a` (prod tip; confirmed via `/api/version` by every instance at boot)
**Inputs:**
- `.paul/research/cycle-7-instance-1-HANDOFF.md` — MCP multi-turn weekly-flow (14 findings)
- `.paul/research/cycle-7-instance-2-HANDOFF.md` — In-app editor + library UI deep-walk (9 findings)
- `.paul/research/cycle-7-instance-3-HANDOFF.md` — Multi-user concurrency + live-edit propagation (7 findings)
- `.paul/research/cycle-7-instance-4-HANDOFF.md` — Real-data read-only probe (11 findings)
- `.paul/research/cycle-7-instance-5-HANDOFF.md` — Contrarian narrative (freeform; ~4 distinct issues surfaced)

**Total ~45 findings across 5 instances.** Severity-only at discovery per ratified Decision 1; green-gating happens HERE.

---

## §0 — Process notes

**Cycle-7 ran through Claude Code tabs, not Claude Desktop cowork.** This is a deliberate departure from cycle-5/6. Most findings would have manifested under either model; the gap is "real-LLM-as-product-consumer behavior" — covered post-cycle-7-fixes by an optional narrow Claude Desktop validation probe + David's natural post-impl shadow.

**Bearer dispatch model worked.** 5 admin bearers pre-assigned from pool; coders read their assigned row via `/bongo:resume <N>`. Zero Daniel-mint operations needed. Repeatable.

**4 protocol amendments validated under load:**
1. BLOCKS-GREEN/POLISH tagging moved to TRIAGE — supervisor sees full-wave context, judges with cross-instance correlations in view. (This document is the artifact.)
2. Deployed-surface evidence requirement — every HIGH/MED finding carries a `## Repros` block with prod-SHA stamp. No emulator-only false PASSes.
3. Soft re-entry rule — triggered cleanly. 8 HIGH findings = well past the ≥3 threshold; cycle-7-fixes wave fires automatically per ratified protocol.
4. 200-line mission cap — 4 disciplined instance prompts averaged ~165 mission lines each; PARENT carried all boilerplate. Per-instance dispatch friction was near-zero.

**Cycle-7 dispatch SHA + per-instance wall-clock vs budget:**

| Instance | Mission | SHA | Wall-clock | Budget | Findings |
|---|---|---|---|---|---|
| 1 | MCP multi-turn weekly-flow | `59b25c87a` | 28min | 90min | 14 (4 HIGH / 6 MED / 4 INFO) |
| 2 | In-app editor + library UI | `59b25c87a` | 42min | 110min | 9 (2 HIGH / 1 MED / 6 LOW-INFO) |
| 3 | Concurrency + live-edit | `59b25c87a` | 65min | 75min | 7 (1 HIGH / 3 MED / 3 INFO) |
| 4 | Real-data read-only | `59b25c87a` | 50min | 60min | 11 (1 HIGH / 4 MED / 4 LOW / 2 INFO) |
| 5 | Contrarian | `59b25c87a` | 25min | 60min | freeform (~4 issues) |

---

## §1 — Cross-instance convergences

The findings that surfaced from **multiple independent instances** are where the strongest signal lives. Three convergences:

### Convergence A — `isTest` structural gap (3 instances)

| Instance | Finding | Surface |
|---|---|---|
| 1 | C7I1-008 HIGH | `publish_setlist` derives audience to real production band (18 humans) when called on isTest:true setlist owned by test-* uid |
| 3 | C7I3-002 MED | `publish_setlist {dryRun:true}` by band_leader non-owner sees same 18 real emails — corroborates from a different angle (non-owner authorization passes; PII exposed to unauthorized actor) |
| 5 | headline | Public `/perform` landing leaks test setlists as TOP entries — mojibake titles + `c7i1-band_leader-db04aebb` author uid visible unauth |

**Root cause:** `isTest` is a flag passed at create-time by the caller, not a property derived from caller-uid shape (`/^(test-|c\d+i\d+-|cf\d+-)/`). The filter on `/perform` display checks the flag; the audience-derivation in `publish_setlist` doesn't. **One structural fix closes all three.**

**Supervisor tag: BLOCKS-GREEN.** Public exposure + audience-leak via sandbox cycles is a real prod safety surface.

### Convergence B — Missing Firestore composite indexes (2 instances)

| Instance | Finding | Index |
|---|---|---|
| 1 | C7I1-004 HIGH | `suggest_band` 500 — `scheduling_assignments` needs `status ASC + assignedAt ASC` |
| 3 | C7I3-001 HIGH | `wait_for_setlist_change {includeFullState:true}` → Vercel 504 — `tracks` needs `setlistId ASC + order ASC` |

**Status:** ✅ DEPLOYED via `firebase deploy --only firestore:indexes --project crcmusiccharts` at 2026-05-19T~23:30Z. Both indexes added to `firestore.indexes.json` (local working tree — pending commit to master). Build time 1-10min; should auto-resolve before any cycle-7-fixes lane dispatches.

**Side note from deploy:** Firebase CLI reported "4 indexes defined in your project that are not present in your firestore indexes file." These are console-clicked auto-indexes from prior debugging sessions — pruning is a separate housekeeping ticket (not blocking).

**Supervisor tag: ALREADY-RESOLVED for the index portion.** A code-side fix to the listener-path unrejected-promise leak (C7I3-001 secondary observation) remains POLISH.

### Convergence C — Cleanup cascade gap (3 instances + structural memo)

| Instance | Finding |
|---|---|
| 1 | C7I1-014 MED — orphan setlist `841df759...` after test-account loss (`delete_setlist` 404 for admin due to ownership-filter; `cleanup_all_test_data {prefix}` cascade misses) |
| 3 | C7I3-007 MED — templates not cascade-cleaned by `cleanup_all_test_data` |
| 5 | observation — cleanup swept 1 setlist + 8 tracks + 1 mcpToken from a PRIOR c7i5-prefixed run, not its own mints |

**Pattern:** test-account deletion does not consistently cascade across all collections (setlists, templates, tracks, mcpTokens). Each cycle leaves an accreting orphan tail that survives subsequent cycle runs.

**Supervisor tag: BLOCKS-GREEN.** Each cycle's residue pollutes the next cycle's signal. Also feeds the Convergence-A leak (orphan test setlists visible on public `/perform`).

### Convergence D — Web-SDK auth wiring gap (2 instances)

| Instance | Finding |
|---|---|
| 2 | C7I2-008 INFO (META) — A4 UploadDialog/ScraperModal probes UNREACHABLE because `src/lib/firebase.ts` exports `auth` as module-scoped singleton; `apiFetch` needs `user.getIdToken()` which is null without Web-SDK signin |
| 3 | A5/A6 INDETERMINATE — Playwright DOM observation blocked by same wiring gap; server-side path PASS via `wait_for_setlist_change` (2.2s) but iPad-side propagation unmeasurable |

**Resolution path:** Instance 2 proposed a 3-line env-gated `window.__c7_auth_for_probes__` exposure. Scoped as `c7-probe-harness-001` cycle-7-fixes lane.

**Supervisor tag: POLISH** (BLOCKS-GREEN only if cycle-7-fixes harness depth matters; otherwise it's debt for the next cycle).

---

## §2 — Proposed cycle-7-fixes wave (supervisor draft)

Soft re-entry rule per ratified Decision 3 fires automatically — ≥3 BLOCKS-GREEN unconditionally triggers parallel-wave mode.

**6 proposed lanes**, ordered by load-bearing-ness. Daniel ratifies lane count + scope.

### Lane 1 — `isTest` uid-shape filter (BLOCKS-GREEN)

**Closes:** C7I1-008 (publish audience-leak) + C7I3-002 (non-owner PII visibility) + Instance 5 headline (public `/perform` exposure).

**Approach:** derive isTest-ness from caller-uid regex match across all surfaces that filter on isTest. Single helper function `isTestUid(uid: string): boolean` in `src/lib/test-isolation.ts` (new). Wire into:
- `src/lib/setlist-publish.ts` audience-derivation step
- `src/app/perform/page.tsx` (and route data fetchers) for the public list filter
- Any other `isTest`-conditioned read path (audit via `grep isTest src/`)

**Estimated effort:** ~150 LOC + test coverage. Single coder lane.

### Lane 2 — Cleanup cascade hardening (BLOCKS-GREEN)

**Closes:** C7I1-014 + C7I3-007 + Instance 5 prior-fixture-leak.

**Approach:** extend `cleanup_all_test_data({prefix})` to enumerate + delete:
- Setlists where `ownerId` matches `prefix-*`
- Templates where `ownerUid` matches `prefix-*`
- Tracks where `setlistId` belongs to a swept setlist
- mcpTokens already swept (working)
- Library entries with `uploaderUid` matching (verify behavior)

Plus admin-bypass `delete_setlist({force:true})` path so already-orphaned setlists (owner gone) can be cleaned by admin caller.

**Estimated effort:** ~100 LOC + emulator test coverage exhaustive on cascade behavior. Single coder lane.

### Lane 3 — iPad-Mini layout + chart-fetch UX (BLOCKS-GREEN)

**Closes:** C7I2-001 (Upcoming Services card title truncation on iPad-Mini) + C7I2-002 (`/perform/[fileId]` infinite spinner with no escape).

**Approach:**
- **C7I2-001:** responsive layout fix on `/setlists` Upcoming Services cards. Title gets `min-width` + Edit/download/kebab cluster collapses to overflow menu at <820px viewport.
- **C7I2-002:** chart-fetch path gets 15s timeout + error UI + retry button + back affordance. Affects `useSetlistPerformance` + `PerformanceToolbar`.

**Estimated effort:** ~80 LOC (CSS + 1 component). Single coder lane.

### Lane 4 — Chart-bond health repair (BLOCKS-GREEN)

**Closes:** C7I4-001 (46% chart-bond health on top 10 setlists; worst case 62% missing) + C7I1-009 (search index returns active-status songs whose files are missing in Storage + Drive 404).

**Approach:**
- Run `reconcile_library({dryRun:false, scope:'setlists'})` to prune dead bonds across published setlists.
- Investigate + fix the search-index vs Storage divergence: `library_index` rows marked `status:active` should not survive Storage-404 + Drive-404.
- Add a `verify_setlist_charts` cron that flags chart-bond health regressions before they hit Friday-night.

**Estimated effort:** ~200 LOC (reconcile call + index-vs-Storage audit + cron). Heaviest lane. Single coder; may justify 90-min budget.

### Lane 5 — Probe harness Web-SDK wiring (POLISH but enables future cycles)

**Closes:** C7I2-008 + Instance 3 A5/A6 INDETERMINATE.

**Approach:** Instance 2's proposed `c7-probe-harness-001` 3-line env-gated `window.__c7_auth_for_probes__` exposure in `src/lib/firebase.ts`. Behind `NEXT_PUBLIC_PROBE_HARNESS_AUTH==='1'`-style env gate so prod build never exposes it.

**Estimated effort:** ~10 LOC + 1 emulator test. Trivial; can be bundled into Lane 6.

### Lane 6 — Misc bundle (mixed POLISH/INFO)

**Closes:**
- C7I1-011 MED — band_leader bearer premature 401 (TTL claim is wrong or session-store evicts early; reproduced twice). Investigate `src/lib/mcp/tokens.ts` + `src/app/api/auth/test-session/route.ts`.
- C7I1-012 MED — search_library phonetic Hebrew transliteration absent. Decide: implement (e.g., add fuzzy match layer) OR document as known limitation.
- C7I1-007 MED — missing `create_template_from_setlist` shortcut MCP tool. New tool: `create_template_from_setlist({setlistId, name, templateType})` inverting `clone_setlist_from_template`.
- C7I2-007 LOW — `PerformanceBottomBar` orphan; delete entire file + any imports.
- C7I4-002 MED — stale trackCount on `b12a5221`. One-off fix + investigate whether the counter has any active writer that updates it. (If counter is unused/computed: drop it; if used: fix the writer.)
- C7I4-004 MED — NEW-3 AI enrichment cache empty 24h post-ship. Investigate subscriber-side write path; verify the writer is firing.
- C7I4-005 LOW — no MCP/HTTP read surface for `webVitalsObservations`. Add `/api/admin/web-vitals/summary` or `get_web_vitals_summary` MCP tool.
- Lane 5's harness wiring (10 LOC).
- Memory updates: `[[project_orphan_baseline]]` 272 → 24; promote `[[feedback_mcp_lane_deployed_surface_evidence]]` into AUDITOR.md (already proposed to auditor).
- Optional: prune the 4 stale Firebase composite indexes the CLI reported as out-of-sync.

**Estimated effort:** ~150 LOC across 6-8 small fixes. Single coder lane budgeting 90min.

---

## §3 — Per-instance finding catalog (full)

### Instance 1 (MCP multi-turn weekly-flow) — 14 findings

| ID | Sev | Surface | Status |
|---|---|---|---|
| C7I1-001 | HIGH | Zero production templates 18h post-Lane-2-ship | **DAEMON-ACTION** (Daniel seeds templates via MCP; ~5min task) |
| C7I1-002 | MED | `publishedAt:null` on all 10 recent setlists — David never publishes OR publish_setlist doesn't set field | Cross-ref Instance 4 for data confirmation |
| C7I1-003 | INFO | `revoke_test_account` uid-vs-tokenId arg confusion footgun | Lane 6 |
| C7I1-004 | HIGH | `suggest_band` 500 missing Firestore index | ✅ DEPLOYED |
| C7I1-005 | MED | `suggest_band` error envelope misleading ("Check Firestore connectivity" vs actual missing-index) | Lane 6 (env hint correction) |
| C7I1-006 | INFO | `list_service_personnel` empty for new setlists (David's "who's playing bass" has no answer until `assign_musician` runs) | DOC; possibly Lane 6 hint improvement |
| C7I1-007 | MED | Missing `create_template_from_setlist` shortcut | Lane 6 |
| C7I1-008 | HIGH | `publish_setlist` audience-leak (isTest filter doesn't carry through fanout) | Lane 1 |
| C7I1-009 | HIGH | `search_library` status:active vs Storage missing divergence | Lane 4 |
| C7I1-010 | INFO | A3 PASS confirmation (trusted-leader rate-limit bypass holds at burst-of-5) | RECORD-ONLY |
| C7I1-011 | MED | band_leader bearer premature 401 (~10min vs 4h advertised TTL); reproduced twice | Lane 6 |
| C7I1-012 | MED | search_library phonetic Hebrew transliteration absent | Lane 6 (decide: implement or document) |
| C7I1-013 | INFO | `Lechu Nranina` absent from catalog or under different spelling | Surface to Daniel for content review |
| C7I1-014 | MED | Orphan setlist after test-account loss; cleanup cascade gap | Lane 2 |

### Instance 2 (in-app editor + library UI) — 9 findings

| ID | Sev | Surface | Status |
|---|---|---|---|
| C7I2-001 | HIGH | `/setlists` Upcoming Services card titles catastrophically truncated on iPad-Mini | Lane 3 |
| C7I2-002 | HIGH | `/perform/[fileId]` infinite spinner with no timeout/retry/back/error | Lane 3 |
| C7I2-003 | MED | `/library` long track-row left-edge clipping on iPad-Mini | Lane 3 (bundle with C7I2-001 layout fix) |
| C7I2-004 | LOW | Template count off-by-2 (prompt overstated as 16; actual 14 hardcoded) | DOC; update mission prompts for future cycles |
| C7I2-005 | LOW | Role-fallback "Musician" badge appears for test session | INFO; investigate Lane 6 |
| C7I2-006 | LOW | `/api/mcp/tokens` 401 hint copy could be clearer | Lane 6 hint tweak |
| C7I2-007 | LOW | `PerformanceBottomBar` confirmed orphan (zero consumers in src/**) | Lane 6 (delete) |
| C7I2-008 | INFO (META) | Harness Web-SDK gap blocks 4 routes | Lane 5 |
| C7I2-009 | INFO | A3 `PerformanceToolbar` safe-area NOT EXERCISED (needs chart-open deeplink) | Daniel iPad shadow covers this |

### Instance 3 (concurrency + live-edit) — 7 findings

| ID | Sev | Surface | Status |
|---|---|---|---|
| C7I3-001 | HIGH | `wait_for_setlist_change {includeFullState:true}` 504 — missing tracks index + listener-path unrejected-promise leak | ✅ INDEX DEPLOYED; code-side promise-leak Lane 6 |
| C7I3-002 | MED | publish dryRun PII visible to non-owner band_leader | Lane 1 (Convergence A) |
| C7I3-003 | INFO | Position-arg silent-normalize (out-of-bounds positions clamped without warning) | Lane 6 (decide: warn or document) |
| C7I3-004 | INFO | `lastModifiedBy` stale on rejected (stale-version) write | DOC; minor |
| C7I3-005 | MED | (per pool NOTE — confirm via HANDOFF read) | TBD on Daniel review |
| C7I3-006 | INFO | `notify-updated` route mis-scoped in cycle-7 prompts (it's in-app notif fanout, NOT live-edit listener) | DOC fix to PARENT + supervisor mental model correction |
| C7I3-007 | MED | `cleanup_all_test_data` doesn't cascade-clean templates | Lane 2 (Convergence C) |

**Note on C7I3-005:** pool NOTE doesn't specify; supervisor should read full HANDOFF before TRIAGE ratification. If it's something I've covered under another lane, fold in; otherwise drop into Lane 6 misc.

### Instance 4 (real-data read-only) — 11 findings

| ID | Sev | Surface | Status |
|---|---|---|---|
| C7I4-001 | HIGH | Setlist chart-bond aggregate 46% (target 80%); 6/10 setlists ≥10% missing; worst `tIJ5DlvkeeN1CWAUTUM2` at 62% missing | Lane 4 |
| C7I4-002 | MED | Stale trackCount on `b12a5221` (`Eitan Shabbat Morning 2/21`) | Lane 6 |
| C7I4-003 | MED | `[[project_orphan_baseline]]` memory drift 272 → 24 (10×) | Lane 6 (memory update) |
| C7I4-004 | MED | NEW-3 AI enrichment cache empty 24h post-ship; `subscriberActive:true` but no rows accumulated | Lane 6 (investigate writer) |
| C7I4-005 | LOW | No MCP/HTTP read surface for webVitalsObservations | Lane 6 (add tool/route) |
| C7I4-006 to -011 | LOW/INFO | Various data-shape observations + collection cardinality snapshot | RECORD-ONLY; baseline for next cycle |

### Instance 5 (contrarian) — narrative HANDOFF

Headline: public `/perform` test-setlist exposure — **Lane 1** (Convergence A).

Secondary:
- Listing/detail track-count disagreement on `5/15 -- Shir Shabbat` (listing "15 songs"; detail "0 songs · No tracks yet") — likely overlap with C7I4-002 stale-trackCount pattern; Lane 6 (data audit).
- Mojibake floor on stored titles (`EF BF BD` REPLACEMENT bytes where em-dashes belong) — Lane 6 (encoding pipeline audit).
- 3× duplicate "B'nai Mitzvah Morning (Template)" tiles on public list — Lane 1 (test-template leakage to public).
- 16 of 44 setlists dateless; no pagination; abandoned drafts + duplicates fill the feed — DEFER (broader content-hygiene initiative; not cycle-7-fixes scope unless Daniel ratifies).

---

## §4 — Memory + decision updates

**Memory updates (supervisor can land):**
- `[[project_orphan_baseline]]` 272 → 24 per C7I4-003 (was wrong by an order of magnitude).
- `[[project_ai_cost_baseline]]` placeholder populated if Instance 4 captured a snapshot (verify HANDOFF — INFO findings probably include it).
- Promote `[[feedback_mcp_lane_deployed_surface_evidence]]` into `AUDITOR.md §Validation-workflow` (already proposed to auditor via inbox 2026-05-19T23:30Z; auditor lands when they next boot).

**Decision updates:**
- The 4 ratified protocol amendments held. No new ratifications proposed from this TRIAGE.

**Standing-rule observations (for future cycle prompts):**
- Cycle-7 Instance 3 explicitly corrected my (supervisor) misunderstanding of the live-edit propagation path. `api/setlists/notify-updated` is the in-app notification fanout endpoint (toast/badge), NOT the Firestore-listener-driven live-edit observation path. The actual live-edit primitive is `wait_for_setlist_change` (long-poll) + the `useSetlistPerformance` Dexie-backed snapshot listener. **PARENT for future cycles + the iPad-shadow CHECKLIST §4 needs updating to reflect this** before the Friday walk.

---

## §5 — Daniel-action queue (post-TRIAGE)

1. **Ratify lane scope above** OR redirect. Supervisor's 6-lane proposal is conservative-additive — most fixes are one-shot LOC changes. Could fold to 4 lanes if you want to reduce dispatch overhead, OR split Lane 4 (chart-bond) into 2 lanes if you want narrower scope per coder.
2. **Seed production templates** via MCP (closes C7I1-001 immediately, ~5min task). Recommended seeds: "Randy Shabbat morning", "B'nai Mitzvah service", "Shir Shabbat", "Friday evening Erev Shabbat". David's "use Randy's usual" stops failing at step 1 the moment these land.
3. **Friday iPad shadow walk** per `.paul/research/cycle-7-ipad-shadow-CHECKLIST.md` — but FIX the J6 propagation mental model first (see §4 standing-rule observation: real propagation primitive is `wait_for_setlist_change` + Dexie snapshot listener, not `notify-updated`).
4. **Optional post-fixes narrow Claude Desktop probe** to close the LLM-as-product-consumer gap (~60min, single freeform mission).
5. **David's natural shadow report** ~1 week post-cycle-7-fixes-ship (criterion-8 retroactive validator).

---

## §6 — Supervisor recommendation: BLOCKS-GREEN summary

Per ratified Decision 1 + Decision 3 (soft re-entry threshold):

**BLOCKS-GREEN at TRIAGE: 4 (well past ≥3 threshold; cycle-7-fixes wave fires).**

1. Convergence A — `isTest` structural gap (Lane 1)
2. Convergence C — Cleanup cascade gap (Lane 2)
3. C7I2-001 + C7I2-002 — iPad-Mini layout + chart-spinner-trap (Lane 3)
4. C7I4-001 + C7I1-009 — Chart-bond health 46% + search-vs-storage divergence (Lane 4)

**POLISH: ~12 items consolidated into Lanes 5-6.**

**DEFER: ~5 INFO findings + the broader content-hygiene observations from Instance 5 (datelessness, abandoned drafts, mojibake floor — separate initiative).**

**ALREADY-RESOLVED in this session:**
- Convergence B (Firestore indexes) — DEPLOYED via `firebase deploy --only firestore:indexes` 2026-05-19T~23:30Z.

---

## §7 — Bearer pool + dispatch posture

Pool at TRIAGE time: 5 burned + 4 spare. Cycle-7-fixes wave needs ~6 bearers if all 6 lanes dispatch concurrently — pool depth INADEQUATE; would need refresh.

**Options:**
- Run lanes sequentially (1 bearer at a time): pool fine.
- Run 3 lanes parallel + 3 sequential: 3 bearers concurrent, pool fine.
- Daniel mints +5 fresh: pool becomes 9 spare; 6 concurrent lanes runnable.
- Fold to 4 lanes (consolidate Lanes 5+6 misc into Lane 4): 4 bearers needed; pool fine.

**Supervisor recommendation:** fold to **4 lanes** (1, 2, 3, 4 — drop Lanes 5+6 into a single "misc + harness wiring" lane). Reduces dispatch friction; keeps the load-bearing fixes separate; pool depth stays comfortable.

---

## §8 — Open questions for Daniel

1. **Ratify 4-lane consolidation** OR run 6 lanes with bearer refresh? Supervisor leans toward 4.
2. **Lane 4 scope:** include the `reconcile_library({dryRun:false, scope:'setlists'})` actual sweep, OR just diagnose + propose the sweep as a separate Daniel-action step (similar to how the suggest_band index deploy was a Daniel-ratified-then-supervisor-ran step)?
3. **Lane 1 wiring:** should `isTestUid(uid)` regex include the prefix patterns we know about (`test-`, `c\d+i\d+-`, `cf\d+-`) or read from a config? Hard-coded regex is simpler; config is more flexible for future prefix shapes.
4. **Cycle-7-fixes dispatch model:** continue `/bongo:resume <N>` Claude Code tabs as in cycle-7, OR run lanes via cowork? The dispatch model worked well. Default: continue Claude Code unless you want a specific lane in cowork.
5. **Friday iPad-shadow CHECKLIST updates:** want me to edit the existing CHECKLIST to fix the J6 propagation mental model before you run it, or note the correction inline for you to read?

---

*from supervisor (draft for Daniel ratification)*
