# Track A2 Wider-Blast — GCS Object Versioning probe (READ-ONLY)

**Date:** 2026-05-24T00:30Z
**Lane:** `gcs-version-probe-wider-blast` (coder-3, Tier-0, one-commit lane)
**Cut from:** `83c86e6c2`
**Inputs:**
- Firestore `sync_runs` (cron-blast enumeration window 2026-05-22T00:00Z → 2026-05-23T14:04:30Z)
- GCS bucket `crcmusiccharts.firebasestorage.app` (Object Versioning enabled 2026-05-22 per [[project_backup_floors]])

**Scope per supervisor's `msg-gcs-version-probe-wider-blast-001`:** enumerate every fileId the cron tried to delete in the recoverable window, probe Object Versioning for restorability, classify, intersect with Friday-relevant setlists, propose a restore path. **ZERO writes. No `--apply`. No Storage/Firestore mutations.**

---

## TL;DR

- **1 single cron tick at `2026-05-23T14:00:10Z` deleted all 348 unique fileIds.** All other "blast tick" reports were post-tombstone re-listings (coder-2's read confirmed). Subsequent cron runs after disarm (`e9442cae1` 2026-05-23T22:42Z) emitted no further deletions in the window — and the cron is now disabled in `vercel.json`.
- **Window deletion timestamps span `14:03:54.896Z → 14:04:49.335Z`** — a 55-second burst, exactly one sync run.
- **347/348 fileIds have a single restorable prior generation** in Object Versioning. The 1 outlier (`upload-8cf12700…`) has zero versions in GCS — never had Storage bytes (or pre-versioning-enable delete).
- **341 RESTORE-VIA-VERSIONING / 4 STILL-LIVE / 2 TINY-META / 1 ABSENT-FROM-VERSIONING** — see classification table.
- **Total restorable bytes: 151.4 MB** (min 3 KB, median 386 KB, max 2.0 MB). All within GCS Object Versioning's 30-day default TTL (~26 days remaining as of probe time).
- **Friday-relevant hot list (Kabbalat Shabbat + Yizkor): 2 new RESTORE-VIA-VERSIONING fileIds** that coder-2's `restore-gcs-versions.mjs --apply` did **not** cover. Both are load-bearing for tomorrow's services.
  - `1t7fPtGbxIVUUaskwynvKjMYactKDbvGq` — "Modeh ani - Klepper.pdf" — Yizkor, 32 KB, Drive-sourced w/ Storage copy
  - `12Q_6mN94HnSFNcDsHZtvzXX2TqXm9sqh` — "Adonai S'fatai (trad)" — present on **both** KS + Yizkor (this is the Drive-shape 404 Daniel was already rebonding per `[[project_chart_loss_reports_are_display_bugs]]`)
- **Recommendation:** extend `scripts/restore-gcs-versions.mjs` to accept `--from <path>` arg, point it at this lane's `wider-blast-probe-COMPAT.json` (drop-in schema match), and rerun `--apply` for the 341-row sweep. Daniel-owned single-owner run per [[feedback_single_owner_destructive_runs]].

---

## Phase 1 — `sync_runs` enumeration

Window: `[2026-05-22T00:00:00Z, 2026-05-23T14:04:30Z]`.

| run id | startedAt | status | totalScanned | deleted | deletedFromStorage |
|---|---|---|---|---|---|
| `<single run in window>` | `2026-05-23T14:00:10.459Z` | completed | <see runSummaries[0]> | **348** | (per-object Storage delete fanout: 3 extensions × 348 = up to 1044 Storage ops) |

**Dedup count: 348** unique fileIds across the window.

**Interpretation:** the supervisor's "~348 objects per tick" estimate is exact for this tick. Earlier runs in the window (post-versioning-enable, pre-blast) either completed with `deleted: 0` or were filtered out by status. The blast was a single sweep — no second blast in the recoverable window.

---

## Phase 2 — GCS Object Versioning probe (per-fileId × per-variant)

For each fileId the probe lists ALL generations of three object-name variants the cron deletes (`library/{id}.pdf`, `library/{id}.xml`, `library/{id}`).

**Variant coverage breakdown:**

| variant | fileIds with ≥1 version |
|---|---:|
| `.pdf` | 345 |
| (no extension) | 3 |
| `.xml` | 0 |
| other | 0 |

The single `.pdf`-by-fileId shape dominates. The 3 no-extension hits are the two text/plain scraper-text Walkdowns + Modeh ani's Drive-id (objectName `library/1t7fPtGbxIVUUaskwynvKjMYactKDbvGq` — Drive importer writes without extension).

**Content types across all variants:**

| contentType | count |
|---|---:|
| `application/pdf` | 345 |
| `text/plain` | 2 |
| (absent — no versions) | 1 |

---

## Phase 3 — classification

| classification | count | meaning |
|---|---:|---|
| **RESTORE-VIA-VERSIONING** | 341 | prior generation exists in versioning, size > 1 KB, byte-identical restore possible via `bucket.file(name, {generation}).copy(…)` |
| **STILL-LIVE** | 4 | row is currently serving — already restored (these are the 4 Daniel re-uploaded via coder-2's restore script) |
| **TINY-META** | 2 | prior gen exists but < 1 KB and `text/plain` — scraper-text walkdown stubs; Daniel-call whether worth restoring vs. re-typing |
| **ABSENT-FROM-VERSIONING** | 1 | no versions in GCS at all — pre-versioning-enable delete OR never had Storage bytes (Drive-only row) |

**STILL-LIVE (the 4 already-rescued bare-UUIDs from coder-2's prior lane — sanity-check anchor; confirms restore script worked):**

| fileId | title |
|---|---|
| `6ca6e82c-e3be-4e6b-b6c1-63f60b3ac5cc` | Eili Eili (Zahavi) - Eit Dodim - Elijah Rock.pdf |
| `72a7aa6a-7b08-4c78-862c-197bbffb9515` | Adon Olam (Folk).pdf |
| `ae83649a-718d-4fc4-ace8-82a9f6c2a400` | Shiru Ladonai (Neimark-Gumer).pdf |
| `c9efe661-9eb8-42fc-89d5-13f026629dc7` | Adon Olam (Hitman-Ben-Hur) - Adon Olam (Dobin) - Shehecheyanu.pdf |

**TINY-META (Daniel-call):**

| fileId | title | size | contentType | variant |
|---|---|---:|---|---|
| `upload-046649f0-1c68-4586-b021-964bb84c3228` | Barechu / Maariv Arvim (Walkdown) | 164 B | text/plain | no-ext |
| `upload-c996b761-a8e5-4e75-b516-61134b1b0b50` | Eli, Eli (A Walk to Caesarea) | 497 B | text/plain | no-ext |

Both are scraper-text walkdowns; re-typing is faster than restoring. **Note:** the 164-byte walkdown is on the Kabbalat Shabbat setlist (see Phase 4) — surface to Daniel.

**ABSENT-FROM-VERSIONING:**

| fileId | title |
|---|---|
| `upload-8cf12700-fb49-4d3c-8b96-fcadab19999f` | Bar'chu Walkdown |

Zero versions in versioning — either deleted before 2026-05-22 versioning enable, or library_index row was created without ever calling `processChartUpload` (no Storage bytes ever). Not blocking Friday; can be re-typed if needed (likely text walkdown shape).

---

## Phase 4 — Friday-relevant setlist coverage

Targeted setlists (per supervisor dispatch) + wider scan (`eventDate >= 2026-05-22T00:00Z`).

### Kabbalat Shabbat — May 22, 2026 (`226309e2-78b7-48af-aa21-6aaf606b4fbe`)

- 10 fileIds total; **5 in blast radius:**

| fileId | title | classification |
|---|---|---|
| `12Q_6mN94HnSFNcDsHZtvzXX2TqXm9sqh` | Adonai S'fatai (trad) | **RESTORE-VIA-VERSIONING** |
| `ae83649a-718d-4fc4-ace8-82a9f6c2a400` | Shiru Ladonai (Neimark-Gumer).pdf | STILL-LIVE (coder-2 restored) |
| `72a7aa6a-7b08-4c78-862c-197bbffb9515` | Adon Olam (Folk).pdf | STILL-LIVE (coder-2 restored) |
| `c9efe661-9eb8-42fc-89d5-13f026629dc7` | Adon Olam (Hitman-Ben-Hur) - Adon Olam (Dobin) - Shehecheyanu | STILL-LIVE (coder-2 restored) |
| `upload-046649f0-1c68-4586-b021-964bb84c3228` | Barechu / Maariv Arvim (Walkdown) | TINY-META (164 B text — Daniel call) |

**KS verdict:** 3/5 already serving (coder-2 restore landed); 1 RESTORE-VIA-VERSIONING needs the wider sweep to land; 1 TINY-META is Daniel-call.

### Shavuot Yizkor — May 23 (`UnjLqKTtS4lNKQfMY6hB`)

- 13 fileIds total; **3 in blast radius:**

| fileId | title | classification |
|---|---|---|
| `1t7fPtGbxIVUUaskwynvKjMYactKDbvGq` | Modeh ani - Klepper.pdf | **RESTORE-VIA-VERSIONING** |
| `12Q_6mN94HnSFNcDsHZtvzXX2TqXm9sqh` | Adonai S'fatai (trad) | **RESTORE-VIA-VERSIONING** (shared with KS) |
| `6ca6e82c-e3be-4e6b-b6c1-63f60b3ac5cc` | Eili Eili (Zahavi) - Eit Dodim - Elijah Rock.pdf | STILL-LIVE (coder-2 restored) |

**Yizkor verdict:** 1/3 already serving; 2 RESTORE-VIA-VERSIONING needs the wider sweep.

### Wider eventDate scan

`setlists.where('eventDate', '>=', new Date('2026-05-22T00:00:00Z'))` returned **2 setlists** — the two above. No other setlist on the books has an eventDate ≥ 2026-05-22.

### Friday-relevant unique restorable fileIds (the load-bearing minimum sweep)

| fileId | title | setlists |
|---|---|---|
| `1t7fPtGbxIVUUaskwynvKjMYactKDbvGq` | Modeh ani - Klepper.pdf | Yizkor |
| `12Q_6mN94HnSFNcDsHZtvzXX2TqXm9sqh` | Adonai S'fatai (trad) | KS + Yizkor |

If Daniel runs ONLY the Friday-priority subset, he restores 2 fileIds. If he runs the full wider sweep, he restores 341 — which costs the same script invocation and recovers every still-bonded chart that was blast-tombstoned.

---

## Top restorable rows by size (sanity sample — 15 largest)

| fileId | title | size | generation |
|---|---|---:|---|
| `000cc80a-9c65-4b55-929e-c9ca1f6737c3` | Yih'Yeh Shalom (Recht) - Yih'Yeh Tov (Broza).pdf | 2001.7 KB | 1779306170687831 |
| `99876430-8fc9-43f6-b41b-ada31937c260` | Milibeinu (Lustig) - Mipi Eil-Ein Adir … | 1624.1 KB | 1779306068765370 |
| `d182a8c3-2bba-4a8b-8399-57d640cb2044` | You Are The One (Friedman) - Rise And Shine (Folk) … | 1617.9 KB | 1779306101263537 |
| `c4761aac-f40d-45b0-a151-94869bcebdb3` | Sing Unto God (Friedman) - Sisu Et Y'Rushalayim … | 1551.3 KB | 1779306126878122 |
| `d56ad543-bac7-4fb9-825f-b9ceb8efd4cc` | Hillel's Song (Brodsky-Zweiback-Glaser).pdf | 1404.9 KB | 1779305978361158 |
| `87bddcb0-5d4a-47f7-a7f2-20a99a17b5fc` | Birkat Hamazon (The Blessing After Meals) (Traditional).pdf | 1309.8 KB | 1779306433314157 |
| `0ca658e4-c2e0-43df-9888-a7f2d536710a` | Adonai Oz (Klepper-Freelander) - Al Hanisim … | 1293.4 KB | 1779305847534378 |
| `a8c83317-b120-4e7e-8590-d33c43519b78` | Levi The Leviathan (Milder) - Light One Candle (Yarrow).pdf | 1280.3 KB | 1779306040705315 |
| `bf3b034a-c117-459a-be3d-743f2e2f9b97` | Simi Yadeich (Israeli Folk) - Sing (Dobin).pdf | 1257.8 KB | 1779306124361889 |
| `33d9e425-2ed1-4054-988f-2935119d90e8` | This Is Very Good (Klepper) - Todah - Torat C… | 1204.7 KB | 1779306133829538 |
| `3b90c6ba-e8f2-4fa2-ac26-ad4fa316c9c3` | Let The Heavens Be Glad (Weinberg) - Let The Rivers … | 1159.5 KB | 1779306035829888 |
| `837e0ce9-4525-4258-b0e1-0cf483189f81` | La-Asok B'Divrei Torah (Klepper) - Eilu D'Varim … | 1158.6 KB | 1779306196622485 |
| `fb29fdcb-6db1-44a8-8df1-e76aaeae5475` | Adonai S'Fatai (Traditional) - Avot V'Imahot (Katchko-Nusach) | 1149.0 KB | 1779306262666704 |
| `3df0360d-9078-45e0-ab96-73804fa7276b` | Hinei Mah Tov (Folk) - Hinei Mah Tov (Dropkin) … | 1146.5 KB | 1779305981547903 |
| `323ccd88-d31e-40f1-afbd-bd4601136e27` | B'Tzelem Elohim (Nichols-Moskowitz).pdf | 1143.0 KB | 1779305905115335 |

These are arrangement charts (multi-song catalogs) — real, load-bearing library content, not test fixtures.

---

## File-id shape buckets (cron blast cross-section)

| shape | count | notes |
|---|---:|---|
| bare-UUID (`xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx`) | 271 | historical legacy uploads (pre-`upload-` prefix era) |
| `upload-<uuid>` | 72 | native Storage uploads (post-storage-canonical) |
| Drive-id (long alphanumeric) | 5 | Drive-sourced with Storage copy — cron's `library/{driveId}` Storage deletion |
| other | 0 | — |

This confirms the cron's deletion criterion (`library_index doc.id` ∉ `driveIds` set) hit all three id shapes. The 5 Drive-id rows are the ones with `storageCopiedAt` set — they had a Storage copy mirrored, which the cron blasted.

---

## Restore-list (the 341-row inventory the next step needs)

Two compatible deliverables written:

1. **`wider-blast-probe-output.json`** (canonical — full per-fileId report incl. all classifications). Includes raw `sync_runs` summaries, per-variant version metadata, Phase-4 setlist coverage, library_index title enrichment. **663 KB.** Load-bearing audit trail.

2. **`wider-blast-probe-COMPAT.json`** (filtered — `RESTORE-VIA-VERSIONING` only, in coder-2's `restore-gcs-versions.mjs`-expected `{bucket, rows[]}` schema with each row carrying `{ok, fileId, title, objectName, versionCount, currentExists, versions: [{generation, timeCreated, timeDeleted, size, md5Hash, crc32c, contentType, isCurrent}]}`). **341 rows.**

3. **`wider-blast-restore-list.json`** (compact — one entry per restore action, schema independent of script-internal contract; suitable for human review or alt-tooling).

---

## Restore recommendation

**Extend coder-2's `scripts/restore-gcs-versions.mjs` with one minimal change: accept `--from <path>` arg to override `PROBE_JSON_PATH`.** Default behavior (no arg) stays at the original `track-a2-resalvage/gcs-version-probe-output.json` for backward-compat with the 4-row first restore.

With that change:

```bash
# Friday-priority dry-run (2 rows, both still-bonded on KS/Yizkor):
node scripts/restore-gcs-versions.mjs \
  --from .paul/research/track-a2-wider/wider-blast-probe-COMPAT.json \
  # (filter the COMPAT json down to those 2 if a more conservative first pass is wanted)

# Full wider sweep dry-run (341 rows; idempotent — skips already-live):
node scripts/restore-gcs-versions.mjs \
  --from .paul/research/track-a2-wider/wider-blast-probe-COMPAT.json

# Then --apply if Daniel approves the dry-run report (single-owner per
# [[feedback_single_owner_destructive_runs]]).
node scripts/restore-gcs-versions.mjs \
  --from .paul/research/track-a2-wider/wider-blast-probe-COMPAT.json --apply
```

The script's existing idempotency contract (SKIP on live-md5-match, ABORT on live-md5-mismatch, post-copy md5 verification, abort-on-first-FAIL) carries straight over — 4 of the 341 rows will SKIP (the already-restored bare-UUIDs from the first restore, which the supervisor's 14:04:30Z window includes via the original blast tick; they'll show as STILL-LIVE classification here but the restore-list filter excludes them).

**One-line extension proposal** (for the follow-up lane; NOT in this lane's scope — Tier-0 research deliverable only):

```js
// At the top of restore-gcs-versions.mjs, replace the hardcoded PROBE_JSON_PATH:
const FROM_ARG_IDX = process.argv.indexOf('--from');
const PROBE_JSON_PATH = FROM_ARG_IDX > -1 && process.argv[FROM_ARG_IDX + 1]
  ? join(REPO_ROOT, process.argv[FROM_ARG_IDX + 1])
  : join(REPO_ROOT, '.paul', 'research', 'track-a2-resalvage', 'gcs-version-probe-output.json');
```

That's it — the rest of the script (load → pre-flight `.exists()` → SKIP/ABORT/copy → md5 verify) is path-independent and works as-is.

---

## What's out of scope for this lane (per supervisor dispatch)

- NO writes / NO `--apply` / NO restore. Pure read-only research.
- NO touch to the existing A1/A2 docs (`.paul/research/track-a1-forensic/`, `.paul/research/track-a2-resalvage/`) — historical record.
- NO widening beyond the cron blast. A1 already exonerated `dedupe_library` / `sweep_orphan_test_data` / etc. as deletion sources.
- NO changes to `bridge/`, `firestore.rules`, MCP tools, app routes. Pure `scripts/` + `.paul/research/track-a2-wider/`.

---

## Reproducibility

```bash
cd C:/Users/dsbog/centralreform.live/sheet-music-app-gcs-version-probe-wider-blast
# Re-run the probe (READ-ONLY; no `--apply` to write):
node scripts/probe-gcs-versions-wider-blast.mjs \
  > .paul/research/track-a2-wider/wider-blast-probe-output.json \
  2> .paul/research/track-a2-wider/wider-blast-probe.stderr.log

# Or to scope to a single fileId list (e.g. Friday-only):
node scripts/probe-gcs-versions-wider-blast.mjs --ids 1t7fPtGbxIVUUaskwynvKjMYactKDbvGq,12Q_6mN94HnSFNcDsHZtvzXX2TqXm9sqh
```

`node --check` exit 0 on the probe script. Default window covers the recoverable cron-blast region. Auth via the same `firebase-adminsdk-fbsvc@crcmusiccharts` SA used by coder-2's probe — has `storage.objects.list` + `.get` versioning visibility + `datastore.user` (for `sync_runs` + `setlists` + `library_index` reads).

---

## Related memories / cross-refs

- `[[project_backup_floors]]` — GCS Object Versioning enable date + chart-bucket setup
- `[[project_chart_loss_reports_are_display_bugs]]` — Daniel's loss-report disposition baseline (Adonai S'fatai is the Drive-shape 404 he was rebonding before this lane confirmed restorability)
- `[[feedback_single_owner_destructive_runs]]` — single-owner contract for `--apply` execution; Daniel runs, coder produces inventory
- `[[feedback_dryrun_is_observability]]` — `dryRun: true` default + `--apply` required for the eventual restore extension
- `[[feedback_worktree_teardown_loses_untracked]]` — these deliverables commit to canonical `sheet-music-app/.paul/research/track-a2-wider/` so they survive supervisor's worktree teardown
- coder-2's prior lane: `.paul/research/track-a2-resalvage/GCS-VERSION-PROBE.md` + `RESTORE-RUNBOOK.md` (precedent for the restore-script pattern)
- coder-3 disable-cron-sync `e9442cae1` — the upstream fix that prevents the next blast tick
