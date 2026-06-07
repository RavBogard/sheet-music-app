# Cycle-9 Sweep — Instance 3: Library / chart management + data integrity

**Read `cycle-9-sweep-PARENT.md` first.** Sign `from cycle-9-instance-3`.
uidPrefix: `c9i3`. Bearer: pool row `ASSIGNMENT=cycle-9-instance-3`.

## Why this axis

The song library is the substrate everything else stands on. Garbage in the
library (orphans, broken bonds, search misses, count drift) silently corrupts
the band's Perform experience. Probe library integrity hard.

## Surface

`/api/library/upload` (Storage path) + `import_chart_from_drive` + in-app
Scraper (chord-chart text), dedup (0.85 strict + `force` override —
`[[feedback_dedup_force_override]]`, don't tune the threshold), `reconcile_library`,
`search_library`, `verify_setlist_charts`, orphan tooling
(`sweep_orphan_test_data`), `recompute_setlist_track_count`. `library_index`
abstracts Storage (`upload-{uuid}`) + legacy Drive (`fileId`) — see
`[[project_file_storage]]`, `[[project_track_mimetype_gotcha]]`.

## Probes

1. **Upload atomicity.** Upload a chart via the Storage path; confirm the
   `processChartUpload` atomic guard (read-verify + compensating-delete +
   `library_signals` broadcast — `[[feedback_upload_atomicity]]`). Try a
   failure injection if reachable (oversized / wrong-type).
2. **Dedup.** Upload a near-duplicate; confirm 0.85 dedup fires and `force:true`
   overrides per-call. Don't recommend tuning the threshold.
3. **reconcile_library.** Run `dryRun:true`. Inspect buckets. C8I2-005 found 2
   persistent `google-apps.shortcut`-mimetype rows the `transient` bucket
   misclassifies (retry can't heal them; they need shortcut-target re-bond).
   Confirm + quantify; check whether a `needsRebond` concept is needed.
4. **Search divergence.** `search_library "Lechu Goldman"` returned `[]` even
   though the file is in the library (broken-shortcut row filtered, no healthy
   alternate). Find more such pockets. Also test Hebrew **phonetic tolerance**
   (cycle-7 A7 FAILed: transliteration variants don't match) — e.g. "Hashkiveinu"
   vs "Hashkivenu", "L'cha Dodi" vs "Lecha Dodi".
5. **Orphans.** Baseline is ~24 (`[[project_orphan_baseline]]`). Measure current
   prod orphan count; flag drift. Confirm `sweep_orphan_test_data` dryRun is
   safe + force-gated.
6. **trackCount integrity.** Sample ~10 recent setlists with
   `recompute_setlist_track_count` (idempotent heal). Quantify drift. (The
   producer is being fixed concurrently in cycle-9 hardening B — tag drift
   `kind:"known-in-flight"` but report counts; a NEW drift pattern is valuable.)
7. **mimeType backstop.** Picker/chart-binder track docs lack `mimeType` +
   `fileName` (`[[project_track_mimetype_gotcha]]`); confirm file-type detection
   backstops via `library_index`/`useLibraryStore` and doesn't mis-render.

Cleanup: `cleanup_all_test_data({prefix:"c9i3"})`; don't mutate real library
rows except idempotent recompute heals (allowed). Deliverables per PARENT §6.
