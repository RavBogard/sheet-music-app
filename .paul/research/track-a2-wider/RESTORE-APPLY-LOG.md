# RESTORE-APPLY-LOG — track-a2 wider-blast restore

**Executor:** coder-1 (lane `restore-gcs-versions-wider-apply`)
**Daniel authorization:** 2026-05-24T~01:05Z in-thread; "a. go. yes" 2026-05-24T~01:27Z post-HEADS-UP confirm-and-fire.
**Inventory:** `.paul/research/track-a2-wider/wider-blast-probe-COMPAT.json` (341 rows, RESTORE-VIA-VERSIONING-only filter from coder-3 wider-blast probe @ `1e38254fd`).
**Bucket:** `crcmusiccharts.firebasestorage.app`
**Auth:** `firebase-adminsdk-fbsvc@crcmusiccharts` service account via `.env.local`.
**Branch:** `feat/restore-gcs-versions-wider-apply` cut from `a41f9aef8`.

---

## Phase summary

| phase | mode | rows | counts | exit |
|---|---|---:|---|---:|
| Phase 2 dry-run | dry-run | 341 | {"would-copy":341} | 0 |
| Phase 3 apply   | apply   | 341 | {"restored":341} | 0 |
| Phase 4 re-dry  | dry-run | 341 | {"skip":341} | 0 |

- **Phase 3 elapsed:** 94s (start 2026-05-24T01:30:45Z → end 2026-05-24T01:32:19Z)
- **Total bytes restored:** 158,778,809 (151.42 MB; matches `WIDER-BLAST-PROBE.md` §Executive line 20 figure "151.4 MB")
- **Per-row md5 verification:** PASS — every restored row's post-copy md5Hash equals source non-current generation md5 (server-side `bucket.file(name, {generation}).copy(bucket.file(name))` preserves md5/crc32c)
- **ABORT count:** 0 — no live-md5-mismatch row encountered
- **FAIL count:** 0 — script ran to completion on all 341 rows

---

## Divergence note (HEADS-UP-001 ratification)

Dispatch `msg-restore-gcs-versions-extend-and-apply-001` expected dry-run counts **341 / 4 SKIP / 337 would-copy**; actual was **341 / 0 SKIP / 341 would-copy**. Per dispatch §reporting "STOP and HEADS-UP on divergence ±1" rule, posted `msg-restore-gcs-versions-wider-apply-headsup-001` to `inbox/supervisor.md` 2026-05-24T01:25Z. Daniel ratified (A) — 341/0/341 was the genuine state because `wider-blast-probe-COMPAT.json` filters STILL-LIVE rows OUT per `WIDER-BLAST-PROBE.md` §Restore-list line 192 (verified: 4 known STILL-LIVE bare-UUIDs `6ca6e82c…`, `72a7aa6a…`, `ae83649a…`, `c9efe661…` are NOT-in-COMPAT). Dispatch + L220 of the probe doc inherited a contradictory anchor. Phase 3 fired with Daniel's "a. go. yes" 2026-05-24T01:27Z.

## Spot-check (3 random restored fileIds via wider-blast probe `--ids`)

Probed 2026-05-24T01:33:30Z. Each shows the restored current generation alongside the original non-current (md5-identical → byte-identical restore confirmed):

| fileId | classification | versionCount | currentExists | liveMd5 | liveSize |
|---|---|---:|---|---|---:|
| `8311b9ad-cce4-4d96-aa4d-ec615a7f7401` | STILL-LIVE | 2 | true | `CZs1lMgSgih+i5u2IK2ovQ==` | 746,459 |
| `7c15883f-41bd-4a32-875e-dbca4ec4188f` | STILL-LIVE | 2 | true | `cv5euHebA4LO09Zy+Q58qw==` | 309,107 |
| `323ccd88-d31e-40f1-afbd-bd4601136e27` | STILL-LIVE | 2 | true | `SfYcPQwi5cHWg4bGP67cAg==` | 1,170,426 |

---

## Friday-relevant restorations (per WIDER-BLAST-PROBE.md §Hot list)

| fileId | title | bytes | post-restore md5 |
|---|---|---:|---|
| `1t7fPtGbxIVUUaskwynvKjMYactKDbvGq` | Modeh ani - Klepper.pdf | 32,993 | `2pYG82Q1SyZzjOmv4W0PlQ==` |
| `12Q_6mN94HnSFNcDsHZtvzXX2TqXm9sqh` | Adonai S'fatai (trad) | 26,889 | `evkPU6Bhij4tgzO5jmZZkA==` |

Both Kabbalat Shabbat + Yizkor charts that coder-2's first restore did NOT cover are now byte-identical-live. Closes Daniel's rebond-of-Adonai-S'fatai workaround.

---

## Reproducer

```bash
# Phase 2 dry-run:
node scripts/restore-gcs-versions.mjs --from .paul/research/track-a2-wider/wider-blast-probe-COMPAT.json

# Phase 3 apply (Daniel-authorized single-owner):
node scripts/restore-gcs-versions.mjs --from .paul/research/track-a2-wider/wider-blast-probe-COMPAT.json --apply

# Phase 4 re-dry-run idempotency:
node scripts/restore-gcs-versions.mjs --from .paul/research/track-a2-wider/wider-blast-probe-COMPAT.json
```

## Companion artifacts (committed alongside this log)

- `scripts/restore-gcs-versions.mjs` — patched with `--from <path>` CLI arg (absolute + relative path support)
- `.paul/research/track-a2-wider/RESTORE-DRYRUN-STDERR.log` — full per-row stderr for Phase 2
- `.paul/research/track-a2-wider/RESTORE-DRYRUN-STDOUT.json` — canonical Phase 2 report
- `.paul/research/track-a2-wider/RESTORE-APPLY-STDERR.log` — full per-row stderr for Phase 3 (341 PASS lines + md5 confirmations)
- `.paul/research/track-a2-wider/RESTORE-APPLY-STDOUT.json` — canonical Phase 3 report (per-row `expectedMd5` + `liveMd5` + `action: 'restored'`)
- `.paul/research/track-a2-wider/RESTORE-REDRY-STDERR.log` — Phase 4 stderr (341 SKIP lines)
- `.paul/research/track-a2-wider/RESTORE-REDRY-STDOUT.json` — canonical Phase 4 report
