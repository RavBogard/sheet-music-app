# Cycle-9 Sweep — Instance 3 HANDOFF

**Axis:** Library / chart management + data integrity
**Signed:** from cycle-9-instance-3
**uidPrefix:** c9i3
**Anchor SHA:** `db208948f687542c130235fa65224bf2640e1c0c` (v7.0.0, built 5/19/2026)
**Probe window:** 2026-05-19 23:32–23:50 UTC

## SHA ordering vs PARENT §1

PARENT named `edb24a47c` as the expected base. `db208948f` is the **next**
commit after `edb24a47c`, the **cycle-8-fixes** commit
`fix(cron,scheduling): register chart-bond cron + fix suggest_band index
direction + bond-ratio denominator`. So the cycle-8-fixes lane HAS landed.
The cycle-9 hardening A (unit-test baseline) and hardening B (trackCount
drift-producer) lanes are NOT in master at this SHA — anything I tag
`known-in-flight` is anchored to that fact.

## Severity counts

| severity | count | items |
|---|---|---|
| HIGH | 1 | C9I3-001 |
| MED  | 4 | C9I3-002, C9I3-003, C9I3-004, C9I3-005 |
| LOW  | 1 | C9I3-006 |
| INFO | 4 | C9I3-007 (atomic-guard conformance), C9I3-008 (dedup conformance), C9I3-009 (orphan baseline), C9I3-010 (sizing) |

**Regression-of-shipped-fix:** none. (See §7 re-entry rule — my axis
contributes 1 BLOCKS-GREEN signal from C9I3-001.)

## Verdict per sub-axis

### Upload atomicity — PASS (with one reverse-orphan window)
processChartUpload's 5-step guard is fully wired (storage write → read-
verify by size → Firestore batch → compensating-delete on Firestore
failure → best-effort library_signals broadcast). Per-call traceId +
stage timing is excellent observability.

**Caveat (C9I3-005):** HEIC and MuseScore conversion paths upload
`originals/{fileId}.{ext}` BEFORE the Firestore batch, but the compensating-
delete only removes `realStoragePath` — not the originals artifact. Narrow
window (Firestore-commit failure post-storage-verify), but the guard's
own contract says no reverse orphans. MED.

### Dedup 0.85 + force override — PASS
Threshold hard-coded at 0.85, force:true bypasses both exact and fuzzy.
Matches `[[feedback_dedup_force_override]]` exactly. Did NOT recommend
tuning.

**But see C9I3-003:** the prefix-range query that gates fuzzy candidates
suffers the same phonetic-bucketing problem as search. Hebrew transliteration
variants slip past both layers — silently, without force:true.

### reconcile_library transient — UNCHANGED FROM C8I2-005
2 google-apps.shortcut rows (Tu Bishvat.pdf, Lechu Goldman.pdf) still
misclassified as `transient` when they actually need a shortcut-target
re-bond. Server-side error message has improved guidance but routing is
the same. The C8I2-005 finding is reproducible at HEAD. MED — proposed
fix unchanged: a `needsRebond` bucket OR auto-resolve via the cycle-6
Lane 1 shortcut-resolver helper.

### Search divergence + Hebrew phonetic — DEGRADED
- `search_library('Lechu Goldman')` → [] confirms C8I2-005 (broken
  shortcut row, status:'active' so includeOrphaned doesn't surface it).
- Hashkiveinu vs Hashkivenu: 3 vs 3 hits, zero overlap.
- Lecha Dodi / L'cha Dodi / Lcha Dodi: 5 vs 1 vs 1 hits, three disjoint
  sets.
- **The dedup-side corollary (NEW)**: same prefix-bucketing splits the
  upload-time fuzzy candidates. Users can upload near-phonetic duplicates
  without `force:true` and the strict 0.85 dedup never sees the
  comparison. C9I3-003. MED.

C7I1-012 tracks the search-side gap as deferred. The dedup-side angle
is new and arguably more dangerous than search divergence — search
divergence misses an existing chart; dedup divergence creates a new
duplicate the user didn't know they had.

### Orphan setlists — CLEAN
`sweep_orphan_test_data({dryRun:true})` returns scanned=45, swept=0. The
[[project_orphan_baseline]] reference of ~24 appears stale; current is 0.
dryRun safe; force-gated for real sweep. C9I3-009 INFO.

### trackCount integrity — DRIFTING (HIGH, known-in-flight)
**3 of 15 (20%) recent setlists drifted.** Both directions present:

1. **OVER-count**: declared 8, actual 0 (Religious School); declared 21,
   actual 0 (Shir Shabbat — March 27).
2. **UNDER-count**: declared 0, actual 5 (Confirmation Shabbat).

After writing this section I read `msg-from-coder-3-cycle9-B-producer`
(2026-05-20T06:05Z) — coder-3's path audit names BOTH directions
explicitly: SetlistGrid.tsx `applyEdit` adds, removes, duplicates,
and pastes `tracks/{id}` without maintaining the parent counter. The
planned fix at `ProductionFirestoreAdapter.commitOutboxRow` (absolute
recompute after any tracks create/delete) covers both my under-count
and over-count cases. So this finding is **`known-in-flight` for both
facets**, not a new pattern.

**Residual value:** the three specific drifted setlist IDs at SHA
`db208948f` are useful regression-test fixtures for hardening B to
verify against once it lands. C9I3-001. HIGH.

All three drifted were unpublished drafts. Cron heals upcoming-
published, so the published surface is healthier than this sample.

### mimeType backstop — PARTIAL
PDFOverlay reads `useLibraryStore.allFiles.find().mimeType` to upgrade
legacy bound tracks to image rendering — but only image. MusicXML and
text rely on `currentItem.type` only. A legacy track bound before
mimeType persistence to a .musicxml or .txt chart would route through
the PDF viewer and break. C9I3-006. LOW.

### Storage path divergence (incidental find) — MED
`library_index.storageUrl` (via extForContentType) writes `.txt/.png/.jpg`
suffixes that don't exist at the real Storage path (actualStoragePath
returns no extension for those mimes). The atomic guard reads the right
path; consumers reading storageUrl directly get 404s. C9I3-004. MED.

## Findings table

| id | sev | kind | one-line |
|---|---|---|---|
| C9I3-001 | HIGH | known-in-flight | trackCount drift 3/15 (both directions); coder-3 path audit covers both |
| C9I3-002 | MED  | bucketing-misclassification | reconcile transient still misclassifies 2 shortcut rows |
| C9I3-003 | MED  | phonetic-tolerance-gap | phonetic-variants split both search AND dedup |
| C9I3-004 | MED  | path-divergence | storageUrl ≠ actualStoragePath for text/image |
| C9I3-005 | MED  | reverse-orphan-window | originals/ blob not rolled back on Firestore failure |
| C9I3-006 | LOW  | partial-backstop | mimeType backstop only upgrades image, not xml/text |
| C9I3-007 | INFO | policy-conformance | atomic-guard correctly implemented |
| C9I3-008 | INFO | policy-conformance | dedup 0.85 + force correctly implemented |
| C9I3-009 | INFO | baseline-drift | orphan baseline 24→0 (clean) |
| C9I3-010 | INFO | sizing-snapshot | library_index = 568 docs, 309KB |

## Cleanup verification

**No test fixtures minted.** All probes ran on the admin bearer wired
into this cowork session's MCP connection — every read-only probe used
the bearer directly, and the three writes were idempotent
`recompute_setlist_track_count` heals on real setlists, explicitly
allowed by PROMPT §("don't mutate real library rows except idempotent
recompute heals (allowed)").

Setlists that were healed by recompute:
- `QQSsAK2XY4dc8k5sFXIa` (Confirmation Shabbat) — trackCount 0 → 5
- `5zLP8DidKQ2lLMKci2xI` (Religious School Morning Service) — 8 → 0
- `s2nWyd63mWjQj3LAJ8zg` (Shir Shabbat — March 27) — 21 → 0

These are real-data heals (not test data). No cleanup needed; recompute
is the heal itself.

Belt-and-braces cleanup pass:
```
cleanup_all_test_data({prefix:"c9i3"}) → { removed: 0, failures: [], aggregate: {} }
```
Zero residue confirmed.

## Bearer status

The admin bearer in this cowork's MCP connection was used for every
probe. Per PARENT §2, the supervisor flips the pool row; I cannot reach
the pool file directly. Treat the bearer as **burned** at HANDOFF
sign-off; it TTL-expires regardless.

## Artifacts

- `cycle-9-instance-3-artifacts/01-anchor.json`
- `cycle-9-instance-3-artifacts/02-reconcile-library-dryRun.json`
- `cycle-9-instance-3-artifacts/03-search-divergence.md`
- `cycle-9-instance-3-artifacts/04-orphan-sweep.json`
- `cycle-9-instance-3-artifacts/05-trackcount-drift.md`
- `cycle-9-instance-3-artifacts/06-upload-atomic-guard-source-trace.md`

## Load-bearing items for triage

1. **C9I3-001 (HIGH)** is the only BLOCKS-GREEN candidate from this axis,
   but it's fully `known-in-flight` per coder-3's 06:05Z path audit
   (both over- and under-count covered by the planned commitOutboxRow
   recompute). My value-add is the 3-setlist test-fixture set at
   `db208948f` for hardening B to verify against. Triage can lean
   on the producer fix; no separate fix lane needed.

2. **C9I3-003 (MED)** is a new convergence: phonetic-bucketing affects
   BOTH search and dedup. Daniel's C7I1-012 deferral was a search-only
   call; the dedup-side angle escalates the cost-of-deferral because
   users silently accumulate phonetic duplicates that no exact-match,
   no fuzzy, no search query will surface together.

3. **C9I3-002 (MED)** is a clean re-verification of C8I2-005 — useful
   to triage as "no progress on shortcut rebond" since cycle-8.

Cross-axis touchpoints to watch in TRIAGE: instance-2 (weekly authoring)
will likely surface trackCount drift from the writer side; instance-5
(security) should consider the storageUrl divergence (C9I3-004) for any
public-vs-private boundary it touches.
