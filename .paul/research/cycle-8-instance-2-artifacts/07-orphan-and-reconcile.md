# §4 — orphan baseline + reconcile residuals evidence

Captured 2026-05-19T22:39Z; deployed SHA = `edb24a47c`.

## §4.1 — orphan baseline (sweep_orphan_test_data dryRun)

```
{
  "ok": true,
  "dryRun": true,
  "scanned": { "setlists": 47, "setlistTemplates": 5 },
  "swept":   { "setlists": 0, "setlistTemplates": 0, "tracks": 0 },
  "orphans": [],
  "orphansTruncated": false
}
```

Current orphan count: **0**, well under the corrected baseline of 24
(`[[project_orphan_baseline]]`). No ballooning. ✓

This goes BELOW the corrected baseline — either additional cleanup happened
post-correction, or no new test-shape orphans have accumulated since the
baseline was set. (Cross-reference: the 47 scanned setlists includes the
real-owner setlists from Daniel + David — none of those qualify as orphans
because their owner uids are not test-shape, or they exist in `users/`.)

## §4.2 — reconcile_library dryRun: transient bucket investigation

```
{
  "ok": true,
  "scanned": 262,
  "alreadyHealthy": 231,
  "driveMirror": { "count": 0 },
  "orphan":      { "count": 0 },
  "transient":   { "count": 2 },
  "skippedNonChart": { "count": 29 },
  "coverage": {
    "total": 568,
    "eligible": 262,
    "scanned": 262,
    "filteredOut": { "byStatus": { "orphaned": 297, "duplicate": 9 }, "byCollection": {}, "byOther": {} }
  },
  "dryRun": true,
  "committed": 0
}
```

**Result vs Lane 3 OPEN-FOLLOWUP #1 (~20 residual transient rows):** down to **2**.
The daily cron has cleared the vast majority of Drive-API-flake residue. ✓

But the 2 surviving rows have a different failure mode than the OPEN-FOLLOWUP
described:

```
{ "fileId": "17TDzffOQT4ohO2p7yQCudUTYbj1tRg28", "name": "Tu Bishvat.pdf",
  "error": "library_index mimeType is application/vnd.google-apps.shortcut — re-bond to the shortcut target's fileId." }
{ "fileId": "1jgs72zwhfEvqsqeeCFMw8Th7Zsk0mVJj", "name": "Lechu Goldman.pdf",
  "error": "library_index mimeType is application/vnd.google-apps.shortcut — re-bond to the shortcut target's fileId." }
```

These are NOT Drive 5xx/timeout flake. They're persistent shortcut-bond
mismatches — the library_index row's mimeType is
`application/vnd.google-apps.shortcut`, meaning the indexed Drive object is a
pointer to another file, not the file itself. The reconcile path's "transient
= retry next cron run" semantics will leave them stuck forever; retry doesn't
fix bond-shape, only Drive availability.

### MED — transient-bucket misclassification

The 2 residuals fall into a "needs-rebond" failure mode that retry can't heal,
but reconcile_library routes them to the `transient` bucket which the cron
re-tries indefinitely. They should either be (a) re-routed to a new
`needsRebond` bucket with the shortcut-target resolution applied (cycle-6 Lane 1
`87f4708fa` shipped a shortcut-resolution helper at the gig-packet fetch
boundary — the same helper could re-bond here), or (b) marked `orphaned` so
they drop out of the next scan.

## §4.3 — search_library spot-checks for 404-to-Storage divergence

`Tu Bishvat`: returns 1 hit at `id: 1WNBHOQhMyr8Aokyp1ECGCibyUZr0UnFT` (status:active).
This is a DIFFERENT library_index row than the broken-shortcut one at
`17TDzffOQT4ohO2p7yQCudUTYbj1tRg28` — there are two rows for the same title,
the healthy one is what David sees. The broken-shortcut row is a zombie.

`Lechu Goldman`: returns `[]`. No matching library_index row visible to
search_library. But reconcile_library reports a row at fileId
`1jgs72zwhfEvqsqeeCFMw8Th7Zsk0mVJj` with that exact filename. This is a real
search-divergence: David searches "Lechu Goldman" → zero hits; the file IS
known to the library (just bonded to a shortcut id that doesn't resolve).
The broken-shortcut row appears to be filtered out of search but isn't marked
`orphaned` — fits the "needs-rebond" failure-mode this bucket can't handle.

`Adon Olam`: 2 active hits — healthy. ✓
`Hatikvah`: 1 active hit — healthy. ✓

No 404-to-Storage divergence on active rows that search_library exposes. The
divergence is hiding behind the broken-shortcut wall (a row that's nominally
`active` but invisible to search).

## §4.4 — non-chart filter cosmetic note (INFO)

`skippedNonChart` includes 29 rows where `reason: "drive_folder"` covers both
actual `application/vnd.google-apps.folder` AND `application/vnd.google-apps.document` /
`application/vnd.google-apps.spreadsheet`. The reason-label is mildly
misleading — `drive_non_chart` or per-mime sub-reasons would be more accurate.
Trivial; LOW.
