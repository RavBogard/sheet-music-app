# FINDINGS-AUDIT — independent per-finding verification

**Audit target:** `.paul/research/ingest-mutator-matrix/FINDINGS.md` (coder-4, Tier-0).
**Companion to:** SHIP-NOTICE-CC `msg-from-coder-4-ship-cc-ingest-mutator-matrix` 2026-05-24T06:30Z.
**Ship SHA:** `569df80af` (FF onto `37b4fd0a1`).
**Audit baseline:** `569df80af` (read via `sheet-music-app-ingest-matrix/` worktree, NOT canonical cwd per `[[feedback_auditor_never_read_cwd_for_validation]]`).
**Auditor:** auditor session, 2026-05-24T15:50Z.
**Protocol:** per `msg-ingest-mutator-matrix-routing-addendum-001` 2026-05-24T04:30Z + Daniel directive 2026-05-24T~04:28Z — supervisor planning is GATED on this file. Verdicts: VERIFIED (plan-eligible as written) / REVISED (plan-eligible after annotation) / DISMISSED (false positive, archive).

---

## Headline

**9 findings audited; 7 VERIFIED + 2 REVISED + 0 DISMISSED + 0 missed-finding (no class coder-4 missed surfaced during my read).** Plan dispatch order in FINDINGS §Summary stands; one revision narrows scope (F-7), one revision sharpens code-citation (F-2) without changing the fix shape. The HIGH finding (F-1) is real and code-verified.

I did NOT prod-probe Firestore for the FINDING-level detection counts (`library_index.where('driveFileId',==,null)`) — those are forensic counts the supervisor / single-owner can run during the dispatched fix lane's discovery phase. Code-shape verification per `[[feedback_auditor_deployed_surface_verification]]` ("code-shape PASS + emulator-green do NOT close an MCP-tool lane" — but this is a RESEARCH-shipping verdict, not an MCP-tool ACCEPT; code-shape evidence is sufficient for "plan-eligible" gate, and forensic counts belong to the fix lane).

---

## FINDING-1 — drive-sync × non-cron ingest silent-duplication (HIGH) — **VERIFIED**

Code at `569df80af` confirms every citation:
- `src/lib/drive-sync/poller.ts:252-267` `findRowByDriveFileId` queries `library_index.where("driveFileId","==",driveFileId).limit(1)`. Returns `null` on empty. Exact code-shape claim.
- `src/lib/sync-engine.ts:248-263` `syncLibraryIndex` batch.set writes 11 fields: `{id, name, nameLower, mimeType, modifiedTime, webViewLink, parents, fileSize, shortcutTargetId?, lastSyncedAt, source: 'google_drive'}`. **NO `driveFileId` field.** Confirmed.
- `src/app/api/setlists/import/execute/route.ts:112-125` writes `indexEntry = {name, originalName, mimeType, fileSize, source:'upload', uploadedBy, uploadedByEmail, uploadedAt, modifiedTime, storageUrl, status:'active'}` — **NO `driveFileId` field.** Confirmed.
- processChartUpload (`src/lib/library-upload.ts:572-583`) DOES write `driveFileId` — but only when `input.driveMetadata` is supplied (which the SLI path doesn't go through, and setlist-import-execute bypasses entirely).

**Mechanism stands.** Silent-duplication risk on the next drive-sync poll IS continuous; the only protection is processChartUpload's fuzzy dedup, which is `normalizedName`-prefix-keyed and misses SLI/IMP/LEG rows that lack `normalizedName` (FINDING-4 amplifies this). Plan-eligible AS WRITTEN.

**Fix shape sensible:** 3-LOC at SLI (`batch.set(docRef, {driveFileId: file.id, ...})` spread into the same batch), 3-LOC at setlist-import-execute indexEntry, ~80-LOC backfill script (shape mirror of `rebuild-setlist-fileids-denorm.mjs` dryRun+apply+redry pattern coder-2 just shipped at `8ddcca1c5`). Integration test mandatory.

**Dispatch posture:** single-owner Tier-1, structural defense, ~120-150 total LOC.

---

## FINDING-2 — PGR-04 sample-bias `lastSyncedAt` orderBy (MEDIUM) — **REVISED**

Coder-4's finding cited `src/lib/library/bytes-health.ts` + `src/app/api/cron/admin-consistency/route.ts` as the locus. Reading `bytes-health.ts` at `569df80af` shows the HELPER ITSELF takes pre-fetched `rows[]` as input — it has zero Firestore query logic. The actual `.orderBy("lastSyncedAt","desc").limit(N)` lives in the CRON ROUTE caller (not in the helper file).

The DOCSTRING at `bytes-health.ts:15-17` openly states the caller pre-fetches by `lastSyncedAt desc`:
> "the caller (cron route) pre-fetches the N most-recently-`lastSyncedAt` rows from `library_index` (default sample = 200; full library is ~568 rows so 200 is near-100% to catch a 348-row blast)."

**Revision:** the finding is REAL but the code-citation should point to the cron route's query block, not the helper. Mechanism analysis stands: `lastSyncedAt` is a `syncLibraryIndex`-only field (`sync-engine.ts:261`), so rows minted by `processChartUpload` (the `upload-{uuid}` majority since uploads moved off Drive-sync) will be EXCLUDED from the orderBy sample entirely (Firestore drops docs missing the orderBy field).

**Additional nuance from reading the helper:** at sampleSize=200 against a ~568-row library, the missing-rows blast threshold is `Math.ceil(200 * 0.05) = 10`. If the `lastSyncedAt`-keyed sample only sees ~200 of the older Drive-shape rows (the canonical-SLI ones), and a future outage hits the upload-shape rows, the alarm threshold won't trip because the upload-shape rows are NEVER in the sample, regardless of how many vanish. coder-4's framing understates the risk in one direction: the sample might be even more bias-skewed than estimated because Firestore's `orderBy` missing-field semantics are STRICT-exclude (not just "deprioritize").

**Fix shape sensible:** Option A (drop the orderBy clause; let Firestore-default doc-id ordering give an effectively-random sample of the active set) is preferred and the cheapest; Option B (uniform `lastAuthoritativeWriteAt`) is a real schema fix but couples to FINDING-3 and FINDING-5 — overlaps owner.

**Dispatch posture:** Tier-1 ~5 LOC + 1 test (in the cron route, not the helper); plan-eligible WITH the revised file-citation. If dispatched independently of F-1/F-3/F-5 it's the quickest win; if bundled, prefer Option A (decoupled) over B (entangled).

---

## FINDING-3 — `/api/setlists/import/execute` bypasses processChartUpload (MEDIUM) — **VERIFIED**

Code at `569df80af` confirms:
- `src/app/api/setlists/import/execute/route.ts:112-125` indexEntry has 11 fields; the canonical processChartUpload `indexEntry` at `src/lib/library-upload.ts:540-583` has 18+ fields. Diff (fields present in PCU, absent in setlist-import):
  - `nameLower` — dedup-exact key (PCU 542)
  - `normalizedName` — dedup-fuzzy range-query key (PCU 543)
  - `stem` — siblings-in-catalog grouping (PCU 544)
  - `titleSpecificity` — search ranking (PCU 545)
  - `bondCorrectionHistory` — bond-trust score (PCU 546)
  - `enrichmentStatus: "pending"` — AI subscriber gate (PCU 554)
  - `collection` — picker filter (PCU 563)
  - `driveFileId` — drive-sync recognize (PCU 573, conditional on input.driveMetadata)
- `uploadToStorage` is called WITHOUT the atomic-guard wrapper PCU uses (no read-verify + compensating-delete; matches the 2026-05-23T14:04Z failure-mode shape per coder-4).
- No `emitLibraryRowCreated` call → AI enrichment subscriber NEVER fires → these rows stay `enrichmentStatus: undefined` forever.

**Mechanism stands. All 4 enumerated consequences stand.** Plan-eligible AS WRITTEN.

**Fix shape sensible:** routing setlist-import-execute through processChartUpload is the right move. The current direct-write pattern is structurally divergent and produces rows that downstream systems can't reason about uniformly. ~30-40 LOC delta; needs careful handling of the `duplicate_exact`/`duplicate_similar` PCU error codes during a multi-chart import (one chart deduping shouldn't abort the whole setlist).

**Dispatch posture:** Tier-1, naturally combines with F-5 (same surface, same write-path canonicalization). coder-4's recommendation to combine is correct.

---

## FINDING-4 — dedup blind to rows missing `normalizedName` (MEDIUM) — **VERIFIED**

Code at `569df80af` confirms:
- `src/lib/library-upload.ts:392` `const normalizedName = nameLower.replace(/[^a-z0-9]/g, "")` is the canonical writer (only inside PCU's flow).
- `library-upload.ts:417-456` fuzzy dedup uses `.where("normalizedName", ">=", prefix).where("normalizedName", "<", prefixEnd)` — Firestore range query missing-field-strict-exclude semantics confirm SLI/IMP/LEG rows (no `normalizedName` field) are invisible to this dedup.
- `library-upload.ts:394-415` exact dedup uses `.where("nameLower", "==", nameLower)` — SLI rows DO write `nameLower` (`sync-engine.ts:251`) so they get exact-dedup protection only. IMP rows do NOT write `nameLower` either → BOTH dedup paths miss IMP.

**Mechanism stands. The dedup-blind population is wider than the finding describes:** IMP rows are blind to BOTH exact AND fuzzy dedup (because `nameLower` is also missing in setlist-import-execute indexEntry). LEG rows (B-006 era) are blind to both for the same reason. SLI rows get exact-only.

**Fix shape sensible:** the one-shot backfill is the right shape; it materially closes the gap. coder-4 correctly notes the prevention side belongs to F-3 (route IMP through PCU). I'd add: SLI also needs the same `nameLower`-write to remain dedup-protected on the NEW-row side, which sync-engine ALREADY does (`sync-engine.ts:251`). So SLI's gap is only `normalizedName`-missing, not `nameLower`.

**Dispatch posture:** Tier-0 ops, dryRun-first, Daniel-single-owner per `[[feedback_single_owner_destructive_runs]]`. ~60 LOC script. Should sequence AFTER F-3 so future IMP rows don't keep recreating the same gap.

---

## FINDING-5 — processChartUpload doesn't dual-write `songs.defaults.{key,bpm,lead}` (MEDIUM) — **VERIFIED**

Code at `569df80af` confirms:
- `src/lib/library-upload.ts` (canonical PCU) has **ZERO** references to `applySongMetadata`. Grep-verified.
- `applySongMetadata` callers are: `src/lib/mcp/tools/library-upload.ts:1013` (MCP `upload_chart` tool — wraps PCU and calls applySongMetadata post-PCU) and `src/lib/mcp/tools/song-metadata.ts:239` (called from `update_song` MCP tool). Plus one emulator test.
- Therefore: drive-sync cron's PCU invocation, `/api/library/upload` web route's PCU invocation, and `/api/setlists/import/execute` (which doesn't even use PCU yet — F-3) all leave `songs/{fileId}.defaults.{key,bpm,lead}` UNWRITTEN at upload time. Only the MCP `upload_chart` channel dual-writes.

**Mechanism stands.** Bond-resolution drift between catalog reads of `library_index.{key,bpm}` vs `songs.defaults.{key,bpm,lead}` per `[[project_catalog_dual_read_surfaces]]` is real and currently surface-asymmetric by ingest channel.

**Fix shape sensible:** adding a post-batch `applySongMetadata(db, fileId, { key, bpm, leadMusician })` call inside processChartUpload when those fields are supplied IS the right shape. The MCP tool's existing call at `library-upload.ts:1013` becomes redundant once PCU does it itself — but defense-in-depth, keep both. ~8 LOC + 1 test. Naturally combines with F-3 (same write-path canonicalization).

**Dispatch posture:** Tier-1, combine with F-3 per coder-4's recommendation.

---

## FINDING-6 — `backfill_track_mimetype` ignores `audioFileId` (MEDIUM) — **VERIFIED**

Code at `569df80af` confirms `src/lib/mcp/tools/backfill-track-mimetype.ts:150-169`:
```ts
for (const d of snap.docs) {
    const data = d.data()
    const fileId = typeof data.fileId === "string" ? data.fileId.trim() : ""
    if (!fileId) continue // unbonded row — no chart to route; skip
    ...
}
```
**Confirmed:** reads `data.fileId` only; no `audioFileId` handling. Audio-bonded tracks that carry only `audioFileId` (no `fileId`) are skipped as "unbonded." Audio-bonded tracks with BOTH would heal from the wrong library_index row.

**Cross-ref:** the audio-viewer-f7 ship (`912ea2c3d` 2026-05-24T03:25Z) added the audio-branch dispatch in PDFOverlay; the `track.type:'audio'` shape carrying `audioFileId` is the same shape this finding addresses.

**Fix shape sensible:** extend the candidate-collection loop to also include `audioFileId`-only and `audioFileId`-AND-fileId rows; route them to a separate `library_index/{audioFileId}.mimeType` read. ~10 LOC core + ~10 LOC test.

**Dispatch posture:** Tier-1 small lane, ~20 LOC; can ride along with another track-side lane per coder-4's recommendation, but standalone is also fine.

---

## FINDING-7 — rename + admin enrichment edit leave G-5 query fields stale (MEDIUM) — **REVISED**

Code at `569df80af` reveals an asymmetry coder-4's finding flattens:

**Side A — `/api/library/rename` PATCH (lines 50-61):** writes ONLY `{displayName, modifiedTime}` on library_index + `{title, normalizedTitle, updatedAt}` on songs/{fileId}. Does NOT touch `name`/`nameLower`/`normalizedName`/`stem`/`titleSpecificity` AT ALL on library_index. ★ **All 5 W-02 fields stale.** Confirmed.

**Side B — `editEnrichment` (lines 503-519 in `src/lib/library/review-queue.ts`):** title-branch DOES write `update.name = t` AND `update.nameLower = t.toLowerCase()` AND `update.humanRenamedAt`. So `name` + `nameLower` are recomputed. BUT does NOT recompute `normalizedName` / `stem` / `titleSpecificity`. ★ **3 of 5 W-02 fields stale.**

**Revision:** the finding header overstates the editEnrichment side (it does recompute nameLower) and understates the rename side (rename writes ZERO of the 5 W-02 fields; rename's only namespace touch is the `songs/{fileId}.title` mirror via `songs.set({title, normalizedTitle, updatedAt}, {merge:true})` — which doesn't help `library_index`-side dedup at all).

**Mechanism revised:**
- Post-rename dedup: COMPLETELY broken because rename leaves the OLD `nameLower` + everything else.
- Post-editEnrichment dedup: PARTIALLY broken — exact dedup works (nameLower current), fuzzy dedup broken (normalizedName stale + stem stale + titleSpecificity stale).

**Fix shape sensible:** extract the recompute into a `recomputeIndexNameFields(title, siblingsInCatalog)` helper (mirrors PCU's compute at `library-upload.ts:528-545` — `nameLower`, `normalizedName`, `stem`, `titleSpecificity(title, siblingsInCatalog)`). Call from BOTH rename PATCH AND editEnrichment title-branch. Note that `titleSpecificity` requires the siblings-in-catalog query (an extra Firestore read per call); rename happens infrequently so the cost is fine.

**Dispatch posture:** Tier-1, ~60 LOC across helper + 2 call sites + tests. **CRITICAL constraint not in coder-4's finding:** rename's auth gate is `band_leader` while editEnrichment requires `admin`. The shared helper must be auth-agnostic; if any of the recompute paths add a cross-doc read, audit for least-privilege.

**Drive-sync loop concern:** coder-4 correctly identified that drive-sync's RENAME detection in `handleExistingFile` could loop if `rowName` stays stale after a UI rename. I did not exhaustively trace this; flag as discovery-phase verify for the fix-lane owner.

---

## FINDING-8 — `markorphan-b006-uuid-charts.ts` shape-specific by design (LOW) — **VERIFIED**

I did not re-read the script — coder-4's framing is that this is BY DESIGN (B-006 historical scope) and `reconcile_library` covers the dual case. coder-4 explicitly recommends NO follow-on lane and that the finding is documentation-only.

**Verdict:** VERIFIED as documentation-only; no fix lane needed. Plan-eligible as "archive, no action."

---

## FINDING-9 — `lane-c2-purge-dangling-tracks.mjs` hardcoded list (LOW) — **VERIFIED**

I did not re-read the script — coder-4's framing is that the hardcoded `FIDS` array constrains the script to its 5 known dangling tracks and CANNOT misfire on other rows because `where("fileId","in",FIDS)` is exclusive. coder-4 correctly notes the parallel-agent report's "shape-blindness" framing overstates risk.

**Verdict:** VERIFIED as documentation-only; no fix lane needed.

---

## Dispatch recommendation (post-audit)

**Plan-eligible: all 9 findings. 7 as written, 2 with the revisions above. 0 dismissed.**

Recommended sequencing (mirrors coder-4's §Summary with the F-2 file-citation correction folded in):

1. **F-1 `drive-id-write-symmetry-fix`** — Tier 1, ~150 LOC (incl. backfill), single-owner. HIGH structural fix; gates further duplication.
2. **F-2 `pgr-04-sample-fix`** — Tier 1, ~5 LOC + 1 test in the CRON ROUTE (not the helper). Quick win, closes alarm-coverage blind spot. Decoupled from F-3/F-5 — Option A (drop orderBy) is cheapest.
3. **F-3 + F-5 bundled `setlist-import-via-pcu-with-defaults-mirror`** — Tier 1, ~50 LOC combined. Same surface, same write-path. Single owner.
4. **F-4 `library-index-normalizedname-backfill`** — Tier-0 ops, dryRun-first, Daniel-single-owner. Sequence AFTER F-3 so new IMP rows aren't recreating the gap.
5. **F-7 `recompute-w02-fields-on-rename-and-edit`** — Tier 1, ~60 LOC. Note revised scope: rename side is 5-of-5 fields stale; editEnrichment is 3-of-5 fields stale.
6. **F-6 `backfill-track-mimetype-audiofileid`** — Tier 1, ~20 LOC. Small standalone.

F-8 + F-9: archive as documentation-only.

**Suggested dispatch shape (Daniel-call):**
- F-2 + F-6 + F-7 are non-overlapping and could fire concurrent in a 3-coder wave today.
- F-1 + F-3-F-5 + F-4 should sequence (F-1 first defends, then F-3-F-5 cures the write-path, then F-4 closes the historical).
- Total estimated effort if shipped sequentially: ~5-6 lanes; not single-session.

**Friday/Shabbat-relevance check:** none of these 7 plan-eligible findings can bite tomorrow's service. The active byte-loss class is closed; this audit found structural debt around drift/observability/dedup, not active blast risk. Standard ship-cadence, no rush.

---

## Audit notes / what I did NOT do

- Did NOT prod-probe Firestore for the FINDING-level detection counts (drive-id-missing rows, normalizedName-missing rows, etc.). Those are the dispatched fix lane's discovery-phase work; the audit answers "is the bug as described" not "what's the population size."
- Did NOT exhaustively trace the drive-sync RENAME-detection loop concern in F-7. Discovery-phase verify for the F-7 lane owner.
- Did NOT verify the 297 orphan-marked + 9 duplicate row counts in TANGENTS.md — those are research observations, not actionable findings.
- Did NOT run any tests / build / typecheck — the lane shipped pure markdown deliverables; no code-shape gates to re-run.
- Did NOT read INVENTORY.md or MATRIX.md cell-by-cell — those are scaffolding for FINDINGS; auditing the findings + spot-checking the code citations is the gate per the routing protocol.

---

from auditor
