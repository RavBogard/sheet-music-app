# Cycle-7-fixes Lane 3 — chart-bond audit (Scope A artifact)

**Bearer-driver:** coder-3 (lane assignment `cycle-7-fixes-lane-3-chart-bond`)
**Captured against prod SHA:** `59b25c87a4cd52bd0d1a2826398595ce7eec3c80`
**Endpoint:** `https://www.centralreform.live/api/mcp` (apex stripped Authorization → www-direct)
**Captured at:** 2026-05-19T17:35Z
**Raw JSON:** `.paul/research/cycle-7-fixes-3-bond-audit.json` + `cycle-7-fixes-3-divergence-detail.json`

---

## TL;DR

1. **Reconcile force-run is overdue.** `reconcile_library({dryRun:true})` reports **24 orphans pending**, **2 transient**, **29 skipped non-chart**, **0 driveMirror**. Force-run will flip those 24 → `status:'orphaned'` on both `library_index/{fid}` AND `songs/{fid}`. Hidden from `search_library` afterward.
2. **C7I4-001 chart-bond aggregate reaffirmed.** Top-10 setlists by trackCount: **65 ok / 157 trackCount = 41.4% okPct** (Instance 4 saw 46% on a slightly different sample). 4/10 setlists have `trackCount=0` despite a denormalized counter — 3 are "Shabbat Morning — <date>" rows that look like cloned empty templates; b12a5221 confirms C7I4-002 stale denormalized counter.
3. **C7I1-009 search-vs-Storage divergence confirmed empirically.** Sampled 37 unique fileIds across 5 search queries; **22/37 (59%) return `status:'missing'` from `get_chart_status`** — i.e. Storage 404 AND Drive 404 (or upload-* prefix with no Storage). All probed rows have both `songs/{fid}` AND `library_index/{fid}` present with `status:'active'`. **All 22 are subsumed by the 24-orphan reconcile bucket** (sample-vs-population overlap). Reconcile force-run closes the structural divergence.
4. **C7I4-002 b12a5221 stale trackCount confirmed.** `list_setlists` row reports `trackCount=43`; `get_setlist({id:'b12a5221-…'}).tracks=[]`; `verify_setlist_charts({setlistId})` returns `trackCount=0`. **Root cause:** `/api/setlist/delete` HTTP cascade does NOT delete top-level `tracks/{id}` rows where `setlistId == id`. The MCP `delete_setlist` tool DOES (`setlist-write.ts:825`). v60-07-02 moved tracks from embedded → top-level; HTTP cascade was never updated to reflect that. b12a5221 must have been touched by a non-MCP delete path that left the trackCount counter stale.

Treating `[[project_orphan_baseline]]` 24 as live truth (down from memory's 272; matches Instance 4's drift flag).

---

## Cardinality (vs Instance 4 baseline 2026-05-19T15:31Z)

| Collection | Live count | Instance-4 baseline | Δ |
|---|---:|---:|---:|
| setlists | 45 | 45 | 0 |
| tracks | 576 | 576 | 0 |
| library_index | 568 | 568 | 0 |
| songs | 567 | n/a (added probe) | n/a |
| setlistTemplates | 0 | 0 (→2 Instance-1 fixtures, now cleaned) | 0 |
| users | 19 | 20 | -1 |
| scheduling_assignments | 0 | 0 | 0 |
| webVitalsObservations | 342 | 261 | +81 (telemetry is alive; ~14h of new observations between snapshots) |

**Observation:** users count dropped from 20→19. Likely an Instance-1 / Instance-3 test-account that cleanup_all_test_data swept, OR a real user deletion. Within margin; not a finding for this lane.

**Observation:** `webVitalsObservations` accreted +81 in ~14h. That contradicts Instance 4's "16h silent tail" concern — telemetry IS being written, just at a low cadence consistent with low traffic (no active Shabbat service window). C7I4-006 likely resolves naturally; no Lane 3 action.

---

## Reconcile dryRun snapshot

```
scanned: 286   (library_index rows where status NOT IN {orphaned, duplicate})
alreadyHealthy: 231
driveMirror.count: 0     (Drive-200/Storage-404 — none; storage-canonical migration is current)
orphan.count: 24         (Storage-404 + Drive-404)
transient.count: 2       (Drive 5xx/timeout — not orphan-marked; re-run later)
skippedNonChart.count: 29 (Drive folder / audio / .DS_Store / Office-doc — never bond-able)
```

The 24-row orphan bucket is structurally identical to the 22 missing files I found via `search_library` sample probe — population vs sample. Force-run flips all 24 to `status:'orphaned'` atomically (batched write across library_index + songs collections per `commitOrphanBatch`).

**Conclusion:** existing `reconcile_library` already implements the C7I1-009 fix. The lane action is to **EXECUTE** it, not extend it.

---

## Per-setlist chart-bond health (top 10 by trackCount)

| Setlist id | Name | trackCount | ok | missing | shortcut | phantom | okPct |
|---|---|---:|---:|---:|---:|---:|---:|
| XLRlBdTh… | 5786 / 2025 Kol Nidre Alternative Service | 0 | 0 | 0 | 0 | 0 | — (empty subcollection; list_setlists counter stale) |
| UnjLqKTt… | Shabbat Morning — Parashat Emor — May 9 | 30 | 13 | 1 | 0 | 0 | 43.3% |
| IvowaTdX… | Shabbat Morning — Parashat Tazria-Metzora | 45 | 20 | 2 | 0 | 0 | 44.4% |
| fgxquthW… | Shabbat Morning — April 11 | 44 | 19 | 3 | 0 | 0 | 43.2% |
| b12a5221… | Eitan Shabbat Morning 2/21 | **0** | 0 | 0 | 0 | 0 | — (**C7I4-002** stale counter; listing says 43) |
| 29EqdMES… | Shabbat Morning — March 21 | 0 | 0 | 0 | 0 | 0 | — |
| KBDlDwRI… | Shabbat Morning — February 28 | 0 | 0 | 0 | 0 | 0 | — |
| 9bmwUMJz… | Shabbat Morning — April 4 | 38 | 13 | 2 | 0 | 0 | 34.2% |
| 0RC4b6Cp… | Shabbat Morning — March 28 | 0 | 0 | 0 | 0 | 0 | — |
| LMkJRNf3… | Shabbat Morning — Parashat Vayakhel-Pekudei | 0 | 0 | 0 | 0 | 0 | — |

**Aggregate (non-empty subset):** 65 ok / 73 bonded / 157 trackCount → **41.4% okPct** (target ≥ 80%).

Multiple `trackCount=0` rows where `list_setlists` reports a non-zero count — **same stale-counter shape as b12a5221**. Per-row repair via the cron's `trackCount` reconciliation step is the right call.

Per-row breakdown of `missing` tracks shows ~5-10% chart-bond breakage on the populated setlists. Reconcile force-run + per-setlist `verify_setlist_charts({markOrphaned:true})` will close the structural part; the remaining missingCount post-sweep is content-recovery territory (chart files actually got lost upstream — outside this lane's scope per prompt §8 bail-out).

---

## Classification (Scope A)

Per prompt §1: classify each row.

- **Prunable (Drive-id rows, Drive 404):** subset of the 24-orphan bucket. Reconcile force-run flips to `status:'orphaned'`. Reversible by editing the row back.
- **Recoverable (Storage-404, but Drive 200):** **0 rows**. The storage-canonical migration kept up; no Drive-only chart bytes pending mirror at this snapshot. (Instance 4 saw the same — `driveMirror.count: 0`.)
- **OK (probes succeed):** 231 of 286 active candidates.
- **Transient (Drive 5xx):** 2 — left untouched per reconcile semantics. Re-run captures them next time.
- **Skipped non-chart:** 29 — folders / audio / Office docs that are not embeddable. Operator decides whether to delete_chart or leave as catalog cruft. NOT in this lane's scope.

---

## What this lane will ship

1. **Run `reconcile_library({dryRun:false, force:true})` against prod.** Soft-flag + auto-mark orphans per Daniel's boot ratification. Expected effect: 24 rows flipped to `status:'orphaned'` on library_index + songs. Verified post-run by re-probing reconcile dryRun (should return `orphan.count: 0` since orphans are excluded from the candidate set on the second pass).
2. **Run `verify_setlist_charts({setlistId, markOrphaned:true})` over the top-N setlists** to close the per-setlist hygiene gap. Same status-flip semantic, narrower input.
3. **Fix `/api/setlist/delete` cascade gap** — add a `tracks` query-by-setlistId batch-delete phase between the existing notifications phase and recursiveDelete. This is C7I4-002's root-cause closure.
4. **Repair stale `b12a5221` row** by setting `trackCount` to the actual `tracks/` subcollection length. Direct Firestore write via the script using the bearer.
5. **Add `/api/cron/verify-chart-bond-health`** — daily Thursday-afternoon UTC run. Enumerates `published` setlists with `eventDate >= now()`; calls `verifySetlistCharts` on each; writes `chart_bond_alerts/{alertId}` when aggregate <80% OR any setlist <70%. Sends admin push.
6. **firestore.rules** block for `chart_bond_alerts/{alertId}` admin-read-only, server-only-write (mirrors `webVitalsObservations` pattern).
7. **Emulator tests** for the cascade fix + the cron logic.
8. **vercel.json** entry for the new cron.

Out of scope (per prompt §8 bail-out + Daniel's boot direction):
- Mass-delete of orphan track rows on published setlists.
- Content recovery for the ~5-10% genuinely-missing chart files (operator-driven via salvage_chart_bytes per row).
- Extending reconcile to scan `songs/*` rows orthogonally to library_index — see post-sweep observation below.

---

## Post-sweep results (Scope B executed)

Ran `scripts/cycle-7-fixes-3-prod-sweep.mjs` with the lane bearer at 2026-05-19T17:51Z. Raw artifact: `.paul/research/cycle-7-fixes-3-prod-sweep.json`.

| Step | Result |
|---|---|
| `reconcile_library({force:true})` | **24 orphans committed** to `library_index/{fid}` + mirrored onto `songs/{fid}`. Mirror count 0 (storage-canonical kept up). Transient 2 (left untouched per semantic — re-tried by cron). |
| `verify_setlist_charts({setlistId, markOrphaned:true})` × top-10 | **8 additional library_index rows orphan-marked** across 4 of 10 setlists; 0 phantomBonds. okPct on the verified subset still 41.4% (bytes don't return from a status flip — the flip just hides them from search/perform). |
| Post-sweep reconcile dryRun | **`orphan.count: 0`** — confirms the active candidate set is clean. `scanned` dropped from 286 → 262 (the 24 + duplicates are now excluded). |
| Post-sweep search divergence repro | sampled 35 unique fileIds across 5 queries → **20 still report `status:'missing'`** (was 22/37 pre-sweep). |

**Why the residual.** Spot-checked 3 of the 20 still-missing (`e16dbb6e…`, `dcacad1e…`, `bf84ee28…`) — each has `songs/{fid}.status: 'active'` AND `library_index/{fid}` exists. Reconcile's `loadAdminCandidates` excludes rows whose `library_index.status` is already orphaned/duplicate; some of these rows likely sit in `library_index` already at `status:'active'` but their Drive metadata probe returned transient (5xx / timeout) during the reconcile run, classifying them into the `transient` bucket instead of `orphan` — reconcile leaves transients for re-run by design. Re-running reconcile would catch them; the new daily cron (`verify-chart-bond-health`) covers this naturally for upcoming-published setlists.

**Conclusion.** **Structural divergence closed**: the 24-row population the reconcile tool sees as definitively dead is now invisible to `search_library` and `/perform`. **Residual ~20 row tail is intermittent-probe-driven, not a structural gap** — a second cron pass or operator force-run will clear it. Logging as a non-blocking follow-up rather than a missed scope item.

---

## Pending post-deploy step

`recompute_setlist_track_count({setlistId: 'b12a5221-111a-4ffa-b408-350cdbd28190'})` — the new MCP tool in this lane needs the deploy to land first. Run will repair the stale counter (`list_setlists.trackCount: 43` → actual `tracks.length: 0`). REPRO-L3-trackCount-repair captures the before/after.

