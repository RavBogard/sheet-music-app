# TANGENTS — open-ended observations from the ingest-mutator audit

**Lane:** `ingest-mutator-matrix-research` (Tier-0).
**Companion files:** `INVENTORY.md`, `MATRIX.md`, `FINDINGS.md`.
**Purpose:** capture observations that don't fit Phase 1-4 cleanly but might inform future direction, refactor opportunities, or test-coverage gaps.

---

## T-1 — `library_index.status` has multiple values used asymmetrically across mutators

Status values observed in code:
- `"active"` — modern canonical; everything healthy.
- `"orphaned"` — set by `reconcile_library` (Storage 404 + Drive 404) and `markorphan-b006-uuid-charts.ts` (Storage 404 confirmed).
- `"archived"` — set by `/api/library/archive` PATCH (user-initiated soft delete).
- `"duplicate"` — set by MCP `dedupe_library_index` on losers.

Asymmetric handling:
- `runStorageBackupProd` filters `status:"active"` only — backups never touch archived, orphaned, or duplicate rows. Good.
- `/api/cron/admin-consistency` PGR-04 filters `status:"active"` — same.
- `runDriveSync` doesn't filter by status when checking for existing rows by `driveFileId` — it could match an "archived" row and resurrect via REPLACE/RENAME. **Subtle interaction worth confirming.** A user archives → Drive renames → cron RENAME branch updates `name` on an archived row. Not destructive but might confuse the user.
- `reconcile_library` filters status when iterating but the exact set varies — agent §10 mentions a HygieneCoverage filteredOut.byStatus tally. Specific exclusions worth a separate read.
- `processChartUpload` dedup queries filter `status:"active"` in both passes (`library-upload.ts:402, 433`) — so a duplicate of an archived chart can be uploaded silently. Maybe intentional (archive = soft delete), maybe a gap.

**Not actionable in this lane.** Recommend a future refactor that defines an explicit status state machine + per-status guards on each mutator. ~half-day of design + ~150 LOC implementation.

---

## T-2 — Three coexisting "AI enrichment" paths

The codebase carries THREE separate AI-enrichment surfaces, with overlapping responsibilities:

1. **`/api/cron/enrich`** (daily 2am) — operates on `library_index.where("metadata.enrichedAt", "==", null).limit(20)`. Filters `failCount >= 3`. Uses an older model (per agent's earlier scan).
2. **`enrichLibraryRow`** in `src/lib/library/ai-enrichment.ts` — modern event-driven. Subscribes to `library.row.created` events emitted by `processChartUpload`. Uses Gemini 3 (`AI_ENRICHMENT_MODEL`). Sets `enrichmentStatus: "pending"|"enriched"|"review_pending"|"failed"|"human_curated"|"human_rejected"` on library_index.
3. **`/api/cron/ai-enrich-retry`** (every 30 min) — drains `aiEnrichmentRetryQueue` by replaying the original `library.row.created` event. Only fires on rows that originated through `processChartUpload`.

`/api/cron/enrich` operates on a different schema (`metadata.enrichedAt` vs `enrichmentStatus`) than the modern path. Either:
- (a) the legacy cron is dead code and should be removed (it operates on a field that processChartUpload doesn't write), OR
- (b) the legacy cron is intentionally a backup for the eventbus path in case the in-process subscriber crashes

Worth a 30-min read of `src/app/api/cron/enrich/route.ts` + the modern subscriber to confirm. If (a), follow-on `cron-enrich-cleanup` lane (~20 LOC delete). If (b), document the failover contract.

---

## T-3 — `library_signals/latest` is a singleton broadcast doc — race-prone but bounded

Every mutator that modifies library_index broadcasts via:
```ts
await db.collection("library_signals").doc("latest").set({
    at: new Date().toISOString(), fileId, op, by
}, /* not merge — full replace */)
```
Open in-tab library views listen on this single doc. Two writes within a few ms could clobber each other (only the latest `op` is visible to the snapshot). Not a data hazard — listeners refetch on ANY change — but the `op` field is occasionally read for debug logging and can lose granularity.

**Not actionable.** Documented in case it surfaces during a deep refactor.

---

## T-4 — `orphaned` library_index rows are never hard-deleted

Per `[[project_orphan_baseline]]` (verified against current `reconcile_library` semantics in agent §10): the bootstrap can MARK orphans but doesn't HARD-DELETE. 297 historical orphan-marked rows + 9 duplicates sit in the catalog indefinitely.

The MCP-side `delete_chart` requires a fileId argument; there's no "delete all orphaned rows" sweep tool. Would benefit from:
- A `cleanup_orphaned_library_index` admin-only MCP tool (or ops script) that:
  - Queries `library_index.where("status","==","orphaned")`.
  - For each, runs the bond-guard check (no live tracks).
  - Hard-deletes the library_index doc + songs doc + library_signals broadcast.
  - dryRun-first; force-required for writes.
  - Operates on all 3 doc.id shapes uniformly (shape-agnostic — operates on doc.id directly).

LOC estimate: ~150 (mirror reconcile_library's shape; reuse `safelyDeleteLibraryObject` for any stray Storage bytes; though orphaned rows definitionally have no Storage bytes).

**Suggested follow-on:** `orphan-hard-delete-sweep` (Tier-0 ops, single-owner, Daniel-supervised). Not blocking; the orphan-marked tail just bloats catalog size.

---

## T-5 — Integration test coverage gaps at the cross-product

The vitest suite has emulator-driven tests for individual mutators (drive-sync poller, processChartUpload, reconcile_library), but no integration test that:
1. Runs SLI to seed a Drive-id-shaped row.
2. Then runs drive-sync cron against the SAME Drive file.
3. Asserts no shadow `upload-{uuid}` row is created.

The test would have caught FINDING-1 immediately. Recommended as part of the FINDING-1 fix lane.

Similar gap for:
- setlist-import-execute → drive-sync (FINDING-3 + FINDING-1).
- editEnrichment title change → next dedup attempt (FINDING-7).
- processChartUpload supplied key → bond-resolution reads songs.defaults.key (FINDING-5).

A Tier-1 follow-on `ingest-mutator-integration-tests` (~200 LOC of tests, no code change) would lock down these cross-products.

---

## T-6 — Memory entries verified, with one to update

Verified-against-code during this audit:
- `[[project_track_mimetype_gotcha]]` — confirmed shape: picker→mimeType-only, MCP post-2026-05-20→both, legacy→neither. Matches current backfill_track_mimetype scope.
- `[[project_orphan_baseline]]` — confirmed 297 orphan-marked rows + 9 duplicates baseline; orphan-mark hard-delete sweep not yet built (T-4).
- `[[project_catalog_dual_read_surfaces]]` — confirmed: songs/{id}.defaults vs library_index/{id} (FINDING-5 sharpens this).
- `[[feedback_upload_atomicity]]` — confirmed: processChartUpload has read-verify + compensating-delete + library_signals broadcast. Matches doc.
- `[[feedback_dryrun_is_observability]]` — confirmed: `MCP backfill_track_mimetype` ships dryRun-default + force-required for writes.
- `[[feedback_admin_rate_limit_bypass]]` — confirmed: `applySongMetadata` callers pass `bypass: isTrustedLeader(roles)`.

One implicit memory entry NOT yet captured (worth a future MEMORY.md addition):
> **The 3 doc.id shapes** (`upload-{uuid}` / Drive-id / bare UUID) are an architectural fact, not historical noise. Any future sweep mutator MUST be aware that all 3 coexist in `library_index`. See `.paul/research/ingest-mutator-matrix/`.

---

## T-7 — Honesty about depth gaps

Per dispatch §"what 'really in depth' means in practice", documenting what I DIDN'T read top-to-bottom:

- Tail of `src/lib/mcp/tools/library.ts` (lines ~990-1700) — covers `searchLibrary`, `listLibrary`, beyond `dedupeLibraryIndex`. Earlier agent scan covered the dedup path; un-read tail likely covers read-only surfaces.
- `restore-gcs-versions.mjs` — recent successful restore (master-tip 4537463cc); deferred since the mechanism is well-documented in the SHIP-NOTICE and the script worked correctly twice.
- `probe-b006-uuid-charts.mjs` / `probe-f02-shape.mjs` — read-only probes; not load-bearing for write-path audit.
- `heal-orphans-from-local.ts` / `heal-run-from-plan.ts` — plan-driven (operator-supplied per-row decisions); risk shifts to the plan-author. Documented as a class.
- `ingest-library.ts` — legacy bulk ingest; predates processChartUpload. Out of cadence.
- Tail of `src/lib/mcp/tools/backfill-track-mimetype.ts` (lines 200-end) — first 200 lines cover the candidate-selection + library-read concurrency phase. Tail covers commit logic + result reporting; structurally similar to other backfill tools.

If supervisor wants any of these expanded, request a follow-up Tier-0 spike (~30-60 min each).

---

## T-8 — Friday-relevance check

Friday-evening service is tomorrow (2026-05-25 in CRC timezone). The HIGH FINDING-1 is structural and won't bite the band tonight. Of the 9 findings:

- **None** can cause an iPad-Perform render break tomorrow.
- **None** can cause chart-byte loss tomorrow (the disarm + chokepoint shipped 24h ago).
- **FINDING-2** (PGR-04 sample) — if there's a real Storage outage during the next 24h that selectively affects upload-shape bytes, PGR-04 might not alert. Probability low; mitigation: PGR-03 catches the umbrella case.
- **FINDING-3** (setlist-import bypass) — only affects future setlist imports; tomorrow's setlist is already constructed.

So this lane's findings are post-Friday work. No action items for the service window.
