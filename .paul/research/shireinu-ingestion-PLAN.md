# Shireinu / Supplemental Corpus Ingestion — Reconciliation + Delta

**Author:** coder-1 (shireinu-ingestion-research lane) · **Date:** 2026-05-20
**Base SHA at ship:** `60aedd6be` (origin/master advanced under me during this lane)
**Assignment:** `inbox/coder-1.md` msg-ingestion-research-002 ("design the BEST way to ingest the full Shireinu/supplemental corpus").

> **⚠️ This lane collided with `storage-recovery-b` (coder-4), which designed AND SHIPPED the ingestion solution while I was researching it.** Their work landed on master mid-session (`e347fab22`, `60aedd6be`). This document therefore **defers to their shipped, Daniel-ratified plan as canonical**, **retracts my independent "create-new" recommendation** (it was based on an undersampling error — corrected below), and contributes the **one verified net-new finding** their plan does not cover. All prod evidence read-only via Firebase MCP, 2026-05-20.

---

## 1. The canonical plan is coder-4's storage-recovery-b Path 1 (heal-in-place) — SHIPPED + RATIFIED

See `.paul/research/storage-recovery-B-report.md` + `orphan-recovery-manifest.{json,md}` + `orphan-bond-map.json`. In short, already done and on master:

- **`finalize_chart_upload({targetFileId})` heal-mode** (shared `src/lib/chart-heal.ts`, also backing `salvage_chart_bytes`) — heals bytes onto the **existing** orphan fileId via the signed-URL staging flow + atomic-guard. (`e5427914d`.)
- **`scripts/heal-orphans-from-local.ts`** — catalog-prefix-aware matcher (strips `99xxxx` prefix; `e347fab22`) → `heal-plan.json` (matched / unmatchedLocal / unmatchedOrphan).
- **`scripts/heal-run-from-plan.ts`** — batch runner: rebuild plan → **physically strip page 1 (pdf-lib)** → heal each onto its `targetFileId`; `--dry-run` default, `--commit --bearer` is Daniel-driven. (`60aedd6be`.)
- **Daniel ratified Path 1** (heal-in-place over create-new) on 2026-05-20; runbook is live, GATED only on Daniel pointing `--dir` at the local folder + reviewing the dry-run plan.

**Recommended next action: run `npx tsx scripts/heal-run-from-plan.ts --dir "<folder>"` (dry-run) → review → `--commit --bearer <pool-root>`.** No new design is needed.

## 2. RETRACTION — my "create-new" recommendation was wrong (undersampled bonds)

My earlier draft of this file recommended **create-new** on the premise that the orphans were unbonded. **That premise was false.** I sampled only 5 orphan ids + a 30-track slice and saw zero bonds, then over-generalized.

coder-4's **exhaustive** probe (all 573 tracks / 42 setlists) found **51 tracks bonding 30 distinct orphans across 10 live setlists** (Shir Shabbat May 13, Shavuot Yizkor May 23, Bar Mitzvah Chase May 16, Shabbat mornings, …). I **independently verified** one: orphan `4a00f597…` ("Ashrei (Klepper-Freelander)", a bare-UUID supplemental batch-1 row) **is bonded** to track `1a57b0a2…` in setlist `WoguRLMMTOv24o1G2ew3` — live, today.

⇒ **Bonds matter. Heal-in-place (Path 1) is correct; create-new would break 51 bonds.** (Lesson: don't conclude "unbonded" from a non-exhaustive sample — [[feedback_cowork_prompt_verify_before_write]].)

## 3. NET-NEW FINDING (not covered by Path 1) — healed rows are metadata-incomplete

**The heal path leaves the recovered rows missing `normalizedName`, `stem`, `titleSpecificity`, and `enrichmentStatus`.**

`src/lib/chart-heal.ts:119-123` merges only:
```ts
const patch = { mimeType, fileSize, source: "salvage", status: "active", salvaged* }
```
The orphan rows **already lack** `normalizedName` / `stem` / `titleSpecificity` / `enrichmentStatus` (verified on the live rows), and the heal merge does not add them. Consequences for the 271 healed supplemental charts:

- **Fuzzy dedup blind spot.** `processChartUpload`'s fuzzy gate range-queries `normalizedName` (`library-upload.ts:388`). Rows with no `normalizedName` are invisible to it → a future upload of a similar-named chart won't dedup against a healed Shireinu row → **duplicate risk** (exact `nameLower` dedup still works; fuzzy does not).
- **No AI enrichment.** Enrichment is driven by `enrichmentStatus:'pending'` + the `library.row.created` event, which heal neither sets nor emits → healed rows never get AI key/bpm/tags.
- **Weaker search ranking.** `stem`/`titleSpecificity` (W-02 trust calibration) are absent; `titleSpecificity` is partly recomputed at query time from the stem distribution, but a missing `stem` still degrades it.

**`backfill_library_index` is NOT a complete remedy** — it only backfills `name` / `nameLower` / `fileSize` (`library.ts:~1586`). Nothing currently backfills `normalizedName` / `stem` / `titleSpecificity`.

**Recommended follow-up (small, additive):** extend `chart-heal.ts` to compute + set, on heal, the same fields `processChartUpload` does — `normalizedName = nameLower.replace(/[^a-z0-9]/g,"")`, `stem = bareStem(title)`, `titleSpecificity`, and `enrichmentStatus:'pending'` (and optionally emit `library.row.created` so enrichment runs). One patch-object extension in the shared heal core; covers both `salvage_chart_bytes` and `finalize_chart_upload({targetFileId})`. Alternatively, a one-off post-heal backfill pass over the healed ids. Tier 1, no hard-rule files. **This is the only design gap I'd add to coder-4's lane breakdown.**

## 4. Corroborations (independent, agree with coder-4)

- **Page 1 = Transcontinental license cover, universally.** 80/80 sampled PDFs; chart starts page 2; multi-song = one cover + N chart pages; **no file <2 pages** (page-1 strip always safe). **Daniel explicitly ratified physical-strip** (kept original in `originals/{fileId}.pdf`) via AskUserQuestion this session — corroborates the strip coder-4 built.
- **0/40 sampled PDFs encrypted** (PDF-1.4) → `pdf-lib removePage(0)` is safe (the runner uses `PDFDocument.load` without `ignoreEncryption`; fine for this corpus, but worth a defensive `ignoreEncryption:true` + per-file try/catch so one bad file can't abort the batch — the runner already try/catches pdf load per file).
- **Local corpus = 272 PDFs = 254 Shireinu (`993122D`) + 18 Ruach (`994059D`)**, all in `…\993122D COMPLETE SHIREINU\INDIVIDUAL PDFs\`. The dedicated `994059D RUACH 5783\INDIVIDUAL PDFs\` folder is **empty** (only 19 `955021D` audio mp3s). **Point the runner `--dir` at the Shireinu folder — it contains both catalogs.** coder-4's manifest already includes the Ruach songs (matcher strips the `99xxxx` prefix).
- **Match rule = exact `nameLower`** (orphan `nameLower` == local filename, lowercased, prefix-stripped). Validated 30/30 on a real batch. Agrees with coder-4's normalized-filename matcher.
- **Orphan population:** 297 orphaned = 271 `local_upload` supplemental (Shireinu+Ruach, recoverable from local) + 22 `upload-` (bryn/David, **no local source = true data loss**) + 4 edge. Matches coder-4's manifest exactly.

## 5. Bottom line

1. **Do not dispatch a separate ingestion lane** — it's built (storage-recovery-b Path 1). Run the heal runner (dry-run → commit) per coder-4's runbook.
2. **Add one follow-up lane:** backfill `normalizedName`/`stem`/`titleSpecificity`/`enrichmentStatus` on healed rows (extend `chart-heal.ts` or a post-heal pass) — §3.
3. **Then Lane C** hard-deletes the 22 `upload-` data-loss orphans (no local source) + 9 dupes + triages 99 non_chart, per the existing cleanup plan.

---

### Appendix — evidence (read-only, 2026-05-20)
- Live bond verify: `tracks where fileId==4a00f597…` → 1 track in setlist `WoguRLMMTOv24o1G2ew3` (bonds real).
- `chart-heal.ts:119-123` merge patch (no normalizedName/stem/specificity/enrichmentStatus).
- `backfill_library_index` (`library.ts:~1586`) backfills name/nameLower/fileSize only.
- Local: 272 PDFs (254 `993122D` + 18 `994059D`); Ruach folder empty (19 mp3s); 0/40 encrypted; page1=license 80/80; ≥2 pages all.
- Match: `nameLower IN [30 local keys]` → 30/30 orphaned/supplemental/local_upload.
- coder-4 artifacts: `storage-recovery-B-report.md`, `orphan-recovery-manifest.{json,md}`, `orphan-bond-map.json`; runner `scripts/heal-run-from-plan.ts`; matcher `scripts/heal-orphans-from-local.ts`; heal core `src/lib/chart-heal.ts`.
