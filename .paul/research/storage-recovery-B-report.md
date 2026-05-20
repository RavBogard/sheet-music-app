# Storage Recovery — Lane B Report (B1 verdict + B2 re-ingest path + runbook)

**Author:** coder-4 (lane storage-recovery-b, Tier 2) · **Date:** 2026-05-20
**Base SHA:** 57f9c85de · **Companion:** [orphan-recovery-manifest.md](orphan-recovery-manifest.md) (B0 — the 297-row checklist)
**All probes read-only** against `crcmusiccharts` (Firestore + Cloud Storage) via the locally-authenticated Firebase CLI session.

---

## TL;DR

1. **B1 — The 297 orphaned charts are NOT server-side recoverable.** No Storage bytes (live), versioning is **disabled**, soft-delete holds **nothing** for them, **0/297** have any Drive source, and git/Vercel builds never hold upload bytes. The only recovery is **re-supplying the original files** — which Daniel says he still has locally (the "one-time batch from claude code").
2. **B2 — Recovery MUST heal-in-place, not create-new.** **30 of the 297 orphans are bonded to 51 tracks across 10 real, live setlists** (Shir Shabbat May 13, Shavuot Yizkor May 23, Bar Mitzvah Chase May 16, six Shabbat-mornings, …). Healing onto the **existing fileId** preserves those bonds; minting new fileIds would break all 51 and force a re-bond sweep.
3. **The cleanest re-ingest reuses shipped infra.** The signed-URL upload flow (`request_chart_upload_url` → PUT → `finalize_chart_upload`) already gets real-size local bytes through the FIXED atomic `processChartUpload` path. The one missing capability for heal-in-place is a **`targetFileId` heal-mode on `finalize_chart_upload`** (small, additive, reuses the atomic-guard contract). Base64-in-args (`upload_chart`/`salvage sourceBase64`) is **rejected** — its own docstring caps it at ~50 KB; real charts are 200 KB–5 MB.
4. **GATED on Daniel** (folder location + how the original batch uploaded + filename convention) before the heal-run. Manifest + matcher tooling are built now; the heal-run is Daniel-driven.

---

## Part B1 — Recoverability verdict (DEFINITIVE)

> **Closes Daniel's "can we dig it out of past builds?" question: No. The bytes are gone from every server-side store. Recovery = re-upload the local originals.**

### Evidence (all read-only, 2026-05-20)

| Question | Probe | Result |
|---|---|---|
| Bytes live in Storage? | `GET storage/v1/b/.../o?prefix=library/{id}` for 11 orphans across both batches (incl. the repro `72a7aa6a…`) | **0 live objects** for every sampled orphan |
| Recoverable via **object versioning**? | bucket metadata `versioning` | **DISABLED** — no prior versions exist to restore |
| Recoverable via **soft-delete**? | bucket `softDeletePolicy` + soft-deleted listing | Policy = **7-day** retention; **37** soft-deleted objects under `library/`, **0** match any of the 297 orphan ids (they are unrelated recent dedupe/cleanup deletions, hard-deleting 2026-05-22…25). Orphan bytes were **never written**, so there was never an object to soft-delete. |
| Recoverable from **Drive**? | re-pulled `driveFileId`/`driveId`/`webViewLink` across **all 297** | **0/297** carry any Drive marker. (Corroborates PLAN's `reconcile driveMirror:0`.) These came from `local_upload`/`upload`, never Drive sync. |
| Cached at a **CDN** / ever served? | bytes never written ⇒ byte route (`/api/drive/file/[fileId]`) returns 404 ⇒ never served | Nothing to be cached. No CDN holds them. |
| In **git / Vercel builds**? | `git ls-files` for chart binaries | Only `public/demo.musicxml` (a built-in sample). **No user upload bytes are tracked in git**; the Next.js bundle/Vercel build contains code only. Uploads write to Firebase Storage at runtime. |

**Bucket:** `crcmusiccharts.firebasestorage.app` (single bucket; legacy `crcmusiccharts.appspot.com` does not exist). Created 2026-02-15.

### What the 297 are (from B0)

| Batch | Count | Shape | Origin |
|---|---:|---|---|
| 1 | **271** | `source: local_upload`, bare-UUID id, `collection: supplemental`, `orphanedReason: B-006`, orphaned 2026-05-17 | March-2026 supplemental songbook batch (Shireinu et al.), uploaded "straight from claude code" per Daniel. Pre-atomic-guard — index rows written, **Storage bytes never written**. |
| 2 | **22** | `source: upload`, `upload-{uuid}` id, `storageUrl` set but bytes absent, orphaned 2026-05-19 | bryn/David direct uploads, pre-atomic-guard write failure. |
| edge | **4** | `source: null` / no `orphanedAt` | inspect individually (manifest §A). |

**Recovery ceiling = how many of the 271+22 originals Daniel still holds locally.** Engineering cannot manufacture the bytes; this is content re-supply.

---

## Part B2 — Bulk re-ingest path

### The decisive constraint: bonds

`tracks/{id}.fileId` (mirrored in `setlists.fileIds[]`) bonds a setlist row to a chart by its `library_index` id. Probe over all 573 tracks / 42 setlists:

- **51 tracks** bond an orphan fileId, spanning **30 distinct orphans** across **10 setlists** — all real services:
  `Shir Shabbat — May 13`, `5/15 Shir Shabbat`, `Shavuot Yizkor — May 23`, `Bar Mitzvah — Chase — May 16`, `Confirmation Shabbat`, and `Shabbat Morning — Apr 4 / Apr 11 / Apr 18 / Apr 25`, plus `Seui` (10 orphan bonds).
- Every sampled orphan also has a `songs/{id}` mirror (20/20).

⇒ **Recovery must preserve bonds.** A path that mints new fileIds orphans these 51 track references (the band would still see broken charts until each is re-bonded).

### Shipped tools surveyed

| Tool | Bytes source | fileId | Bonds | Size ceiling |
|---|---|---|---|---|
| `salvage_chart_bytes` | **https `sourceUrl`** → `driveFileId` → else `no_source_available` | **existing (heal)** | **preserved** | 25 MB (server-fetched) |
| `upload_chart` | inline `fileBase64` | new `upload-{uuid}` | broken | **~50 KB practical** (MCP arg/token budget) |
| `request_chart_upload_url` + `finalize_chart_upload` | signed-URL PUT → staged blob → `processChartUpload` | new `upload-{uuid}` | broken | 25 MB |
| `swap_chart` | — | rebinds a track's fileId | re-bonds | — |

Key facts: salvage **heals in place** (perfect for bonds) but needs an **https URL Vercel can fetch** — the orphans have no `driveFileId`, and Daniel's files are **local**, so today salvage can't reach them. The signed-URL flow **does** get real-size local bytes server-side through the atomic path, but **mints a new fileId**.

### Two designs

#### ✅ Path 1 — Heal-in-place (RECOMMENDED)

Add a **`targetFileId` heal-mode to `finalize_chart_upload`**: when set, instead of `processChartUpload` (new fileId) it runs the **salvage HEAL contract** onto the existing `library_index/{targetFileId}` using the already-staged bytes — Storage write at `library/{targetFileId}{ext}` → read-verify by size → Firestore merge-update (`status:active, source:salvage, mimeType, fileSize, salvagedAt`) + `songs/{id}` status flip → compensating-delete on failure → `library_signals` broadcast.

- Reuses the **size-unlimited signed-URL staging** (handles 200 KB–5 MB charts) AND the **atomic-guard** ([[feedback_upload_atomicity]]).
- **Preserves all 51 bonds** — zero re-bond work.
- Implementation: extract salvage's HEAL core into a shared `healChartBytes(fileId, buffer, mimeType, uid)` used by BOTH `salvage_chart_bytes` (after it resolves sourceUrl/Drive bytes) and `finalize_chart_upload` (when `targetFileId` is set). One branch + one schema field + emulator coverage. **Tier-2, additive, no hard-rule files touched.**
- **Zero-prod-change fallback** (more fragile, documented for completeness): stage via `request_chart_upload_url` → PUT → obtain a Firebase download URL for the staged blob → `salvage_chart_bytes({fileId, sourceUrl})`. Depends on the staged object exposing a Vercel-fetchable URL; unverified, so the `targetFileId` addition is preferred.

#### Path 2 — Create-new + re-bond + cleanup (shipped tools only, no prod change)

Per local file → `finalize_chart_upload` (new fileId, atomic, deduped) → for each of the 30 bonded orphans, `swap_chart` the bonded track(s) (51 swaps) old→new fileId → Lane C hard-deletes the orphan rows. Dedup handles title collisions.

- No prod change, but **touches 10 live setlists' tracks** (51 swaps) and depends on Lane C ordering. More moving parts at the data layer; larger blast radius.

### Recommendation

**Path 1.** Bonds never break; the prod addition is small and rides the existing atomic guard; unbonded orphans (267/297) heal identically. Path 2 is the fallback if Daniel prefers zero prod change and accepts the 51-swap re-bond sweep.

---

## Operator Runbook (Daniel-driven heal-run)

> **Prerequisite (GATED):** confirm (a) the local batch **folder path**, (b) **how the original batch uploaded** (a local sync script? `upload_chart`? `/api/library/upload`? — determines whether an id↔file map already exists), (c) that local **filenames match** the manifest `fileName`/`title` keys (e.g. `Adon Olam (Folk).pdf`). The matcher keys on normalized filename; if names diverged, supply a mapping.

### Step 0 — Match local files to orphan rows (dry-run, no writes)
```
node scripts/heal-orphans-from-local.mjs --dir "<LOCAL_BATCH_FOLDER>" --dry-run
```
Loads `orphan-recovery-manifest.json`, walks `--dir`, normalizes each filename, matches to an orphan `fileId`. Emits `heal-plan.json`: **matched** (file ↔ fileId), **unmatched-local** (file with no orphan), **unmatched-orphan** (orphan with no local file = true data loss). Daniel reviews before any write.

### Step 1 — Heal (after Daniel approves the plan + picks the path)
- **Path 1:** for each matched pair: `request_chart_upload_url` → `curl -X PUT --data-binary @<file> "<uploadUrl>"` → `finalize_chart_upload({uploadSessionId, targetFileId:<orphanFileId>, force:true})`. Bonds preserved.
- **Path 2:** `finalize_chart_upload` (new fileId) → `swap_chart` each bonded track (from manifest bond-map) → mark old orphan for Lane C.

The driver automates the per-file loop + emits a **heal report** (healed N, failed M, unmatched K). Bearer = admin (salvage/heal is admin-only).

### Step 2 — Verify
Spot-check `get_chart_status(fileId)` flips `missing → ok`; open a healed chart in Perform on a bonded setlist (e.g. Shavuot Yizkor). Re-run Step 0 dry-run: matched-count should drop to 0 for healed rows.

### Step 3 — Hand unrecovered remainder to Lane C
`unmatched-orphan` rows (no local original) are confirmed data loss → Lane C hard-deletes (unbond any bonded track first via the shipped `update_track songId:null` / unbond path).

---

## Resolution (Daniel, 2026-05-20)

1. **Path 1 (heal-in-place) — CHOSEN + BUILT.** Shipped the `targetFileId` heal-mode on `finalize_chart_upload` (heal contract extracted into shared `src/lib/chart-heal.ts`, also now backing `salvage_chart_bytes`). Admin-only; no dedup/conversion; staged mime must be a renderable chart type. Emulator-tested (heal happy-path + admin-gate + row-not-found; salvage regression green). The runbook Step 1 Path-1 call sequence is live.
2. **Original upload method = "not sure / need to check."** ⇒ recovery matches by **normalized filename** via `scripts/heal-orphans-from-local.ts` (dry-run reviewed before any write). No precise id↔file map assumed.

### Still GATED on Daniel (the heal-RUN itself)
- Local batch folder path (point the matcher `--dir` at it).
- Confirm local filenames resemble the manifest `fileName`/`title` keys (the dry-run `heal-plan.json` surfaces mismatches as `unmatchedLocal`/`ambiguous` before any write).
- Then run Step 1 (Path 1) per the runbook; unmatched orphans (no local original) → Lane C.
