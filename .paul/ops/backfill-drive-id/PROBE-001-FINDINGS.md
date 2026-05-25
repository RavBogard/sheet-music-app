# PROBE-001 — UUID-row provenance probe

**Lane:** drive-id-apply-backfill
**Phase:** 1.5 (read-only probe, per Daniel's Option B ruling on `msg-coder-3-heads-up-uuid-overmatch-001`)
**Probed at:** 2026-05-25T~17:30Z
**Probed by:** coder-3
**Probe tool:** Firebase MCP `firestore_get_document` (read-only)
**Verdict:** **Case 2 — surprise.** STOP. HEADS-UP filed. Do NOT proceed to APPLY or regex tightening without a fresh ruling.

## Sample selection

10 doc-ids drawn deterministically from the 271-row UUID-shape set in `DRY-RUN-001.log`:
first 5 alphabetically + last 5 alphabetically.

| # | docId | salvagedAt | backupDriveId | name |
|---|-------|------------|---------------|------|
| 1 | `000cc80a-9c65-4b55-929e-c9ca1f6737c3` | 2026-05-20T19:42:50.827Z | `1HWv4dMDvKSVmvuX1FFv4V5U4s7O0D33_` | Yih'Yeh Shalom (Recht) - Yih'Yeh Tov (Broza).pdf |
| 2 | `012dd661-f451-444c-88fb-11d589028908` | 2026-05-20T19:42:11.507Z | `1hGSUyKTSs79AXqLPsiyaK-BYzQpNzAKQ` | T'Filat Haderech (Friedman).pdf |
| 3 | `0281c548-8aea-48c9-8991-98cb381b3f3a` | 2026-05-20T19:38:37.258Z | `1ch-Ttw6dRhxNpIdBDRuYsiLy6RtfDoLj` | David Melech Yisraeil (Frankel) - Dodi Li (Sher).pdf |
| 4 | `055bf376-f545-45f9-9f40-da81544b312f` | 2026-05-20T19:42:34.368Z | `1DGH1SVeRA5izsdZqhzuTjEjGiL7Albjc` | V'Nomar L'Fanav (Chassidic Folk).pdf |
| 5 | `07478587-664a-4153-8a82-c35364f4ec12` | 2026-05-20T19:39:50.802Z | `1fw7LlXON7j1aK0eW-MlJRUn51nbevmBX` | Hodu (Silver).pdf |
| 6 | `fb29fdcb-6db1-44a8-8df1-e76aaeae5475` | 2026-05-20T19:44:22.794Z | `1l-WZavwNZFQmPsVnAJSDsmqRG3Ni29Gg` | Adonai S'Fatai (Traditional) - Avot V'Imahot (Katchko-Nusach).pdf |
| 7 | `fbf15797-3d74-4397-86c4-931b16a334cf` | 2026-05-20T19:44:18.109Z | `1aEa_ocx6Y4NX-VJKvih2r8eeF0_nI9dd` | V'Shamru (Friedman).pdf |
| 8 | `fcc1c2fe-358e-43ec-b39f-bfa84ba1b6e2` | 2026-05-20T19:44:20.487Z | `1Jy2cIyhPTOVKMtyzl0rSk4LDwEe1oHtS` | V'Shamru (Rothblum).pdf |
| 9 | `fcdeef79-f662-4ac6-aa94-bdf74511ac2c` | 2026-05-20T19:37:48.368Z | `1tmoHJxCPhruGPqqODBQrMHe9SQnapaXZ` | Anachnu M'Vorachim (Recht) - Anatoly (Mishkin).pdf |
| 10 | `fe495975-d73d-43ca-ba6c-2a16b2702bdf` | 2026-05-20T19:41:20.900Z | `1abWRNe8TxwhNCMtfl0LkNFQz-dA0LpQR` | Od Lo Ahavti Dai (Shemer).pdf |

## Pattern (consistent across all 10/10 sampled)

Every sampled row has **the same field shape** — this looks like a single bulk operation:

```yaml
source:           "salvage"
salvagedFrom:     "upload-session"
salvagedBy:       "93Xn3DbS0bSNb8zmfzLyfOMX1A13"   # same actor across all 10
salvagedAt:       2026-05-20T19:37–19:44Z          # 7-minute window
orphanedAt:       2026-05-17T01:40:37.553Z         # identical timestamp across all 10
orphanedReason:   "B-006: pre-atomic-guard sync left no Storage bytes"
status:           "active"
collection:       "supplemental"                    # all 10
mimeType:         "application/pdf"                 # all 10
backupDriveId:    <real Drive id, URL-safe-base64, 33 chars>   # present + populated on all 10
driveFileId:      <ABSENT — confirms why the script flagged them>
fileId:           <ABSENT>
storagePath:      <ABSENT>
id (in body):     <equals docId — UUID v4>
createTime:       2026-03-15T00:41–00:42Z (Firestore-side creation)
```

The `backupDriveId` Drive ids are real (mixed-case URL-safe-base64, 33 chars — matches Drive-id-shape regex). Examples: `1HWv4dMDvKSVmvuX1FFv4V5U4s7O0D33_`, `1ch-Ttw6dRhxNpIdBDRuYsiLy6RtfDoLj`. None resemble UUIDs.

## What this means

These are the **B-006 salvage rows** referenced in `[[project_chart_loss_reports_are_display_bugs]]` ("B-006 salvage complete"). The salvage operation on 2026-05-20T19:37–19:44Z resurrected 271 rows that had been orphaned 3 days earlier (2026-05-17T01:40:37.553Z) for "B-006: pre-atomic-guard sync left no Storage bytes". The salvage:

- **Generated fresh UUID v4 doc-ids** (instead of reusing the original Drive id as the doc-id). This is why the script's `looksLikeDriveId(docId)` heuristic over-matched — the docId is a UUID, not a Drive id.
- **Parked the original Drive id in `backupDriveId`** — the field is present and populated on all 10 sampled rows; this is recoverable data.
- **Did NOT stamp `driveFileId`** — so the drive-sync poller's `findRowByDriveFileId(driveFileId)` lookup misses them. The salvaged rows are functionally invisible to drive-sync.

## Verdict — Case 2 (surprise)

This is **NOT** "the 271 UUID rows are non-Drive-backed; safely skip" (Case 1).

This **IS** "the 271 UUID rows have RECOVERABLE Drive ids in a different field; stamping `driveFileId: <docId>` is wrong (because docId is a UUID), but stamping `driveFileId: <backupDriveId>` would correctly recover the Drive backing".

Per the dispatch's Case-2 instruction:
> ⛔ STOP. HEADS-UP supervisor with the surprise. Do NOT proceed to APPLY (or regex tightening) without a fresh ruling. The probe might surface a separate bug class that's worth scoping into a different lane.

## Recommendation (for supervisor's ruling)

**Option A′ (recovery):** Amend script to handle two cases:
- Drive-id-shape docId → existing behavior (`driveFileId: <docId>`); ~281 stamps.
- UUID-shape docId with `backupDriveId` present → stamp `driveFileId: <backupDriveId>`; ~271 stamps (assuming the 10/10 pattern holds across the 271 — should be confirmed via full DRY-RUN-002 after the amendment).
- UUID-shape docId WITHOUT `backupDriveId` → skip (out of recovery scope).

Trade-offs: meaningful scope change to the script. Needs auditor re-VERIFY because the script shipped at `0c0392a72` with the original narrow heuristic. Recovers the full 552 backfill set rather than the narrow 281.

**Option A (narrow, original):** Skip UUIDs entirely (`if (uuidRe.test(docId)) skip`); only stamp the 281 Drive-id-shape rows. Leaves 271 salvage rows without `driveFileId` despite recoverable Drive ids in `backupDriveId`. Wastes the recovery; the salvage operation's full value isn't realized.

**Option E (split into 2 lanes):**
- This lane: narrow Option A — ship the 281 Drive-id-shape stamps.
- New lane `salvage-row-drivefileid-recovery`: stamp `driveFileId: <backupDriveId>` for salvage rows (separate auditor-VERIFY, separate single-owner discipline).

Cleaner separation of concerns; clearer audit trail; each lane stays narrow. Slightly more orchestration overhead.

**My (coder-3) recommendation:** Option E (split). The salvage rows are a meaningfully different category (different source field, different ingest provenance, different field semantics — `driveFileId === backupDriveId` for them is a real claim that deserves its own audit trail). Keeping this lane narrow at 281 stamps preserves its tight auditor-VERIFY context. The salvage-row recovery lane can be queued as a follow-up.

## Boundaries honored

- ✅ Read-only probe via Firebase MCP — no Firestore mutations.
- ✅ No script changes.
- ✅ Single-owner discipline still binding — APPLY remains paused.
- ✅ Sample is reproducible (first 5 + last 5 alphabetically of the 271 UUID-shape rows in DRY-RUN-001.log).

## Coverage caveat

10/10 of the sample matches the salvage pattern, but the sample is alphabetical-extremes. A small chance the middle of the alphabetical range hides a different shape. Cheap to confirm via a wider sweep (10 more rows from the middle) or via the script itself (Option A′ amendment) before APPLY. Supervisor's call.
