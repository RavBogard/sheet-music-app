# v50-07-01 DRY-RUN REPORT

Generated: 2026-04-27T04:27:15.903Z
Firebase project: `crcmusiccharts`
Source script: `scripts/audit-v50.ts` (read-only)

---

## 1. Migration Marker

**Marker collection empty / absent.** Migration has never been applied.

> 🐛 **BUG FOUND in `migrate-v50.ts`:** migrate-v50.ts uses MARKER_PATH='system/migrations/v50' which is a 3-segment Firestore path = collection, not document. db.doc(MARKER_PATH).get/set will throw `documentPath must point to a document` against real Firestore. Script must be patched in v50-07-02 before any apply attempt.
>
> **Action required in v50-07-02:** patch `MARKER_PATH` to a valid 2-segment doc path (e.g., `system/v50Migration` or `migrations/v50State`). Same applies to any `setDoc(MARKER_PATH, ...)` call.

---

## 2. Setlists Collection (`setlists/*`)

| Metric | Count |
|--------|-------|
| Total setlist documents | **29** |
| Setlists with non-empty embedded `tracks[]` | **24** |
| Total embedded track count (sum of all `tracks[]` lengths) | **650** |
| Distinct songIds referenced from embedded tracks | **0** |
| Setlists with non-null `liveState` field (v50-02 orphan) | **10** |
| Embedded tracks with `liturgicalSlot` field (v50-02 orphan) | **0** |
| `songs/*` collection size | **0** |

Sample setlist IDs with embedded tracks:
- `0RC4b6CpvnPbz09ue07q`
- `29EqdMESd6QjhfokL2Bu`
- `3ydVKM1WSADW0vn9vWaN`
- `4GVt6rK5RCVHr5BGPAUv`
- `5zLP8DidKQ2lLMKci2xI`

Sample setlist IDs with `liveState`:
- `0RC4b6CpvnPbz09ue07q`
- `29EqdMESd6QjhfokL2Bu`
- `9bmwUMJzgIQgNRIe81jv`
- `KBDlDwRI0rfDdv8cxJG9`
- `LMkJRNf3HWa8l9Mqmr0Q`

### Embedded track field-frequency

How often each field appears across all 650 embedded tracks. Helps identify whether the legacy shape uses `songId` (v5.0 expected), `fileId` (v1.x storage ref), or something else as the song reference.

| Field | Occurrences | % of tracks |
|-------|-------------|-------------|
| `id` | 634 | 97.5% |
| `title` | 607 | 93.4% |
| `type` | 543 | 83.5% |
| `fileId` | 351 | 54.0% |
| `key` | 342 | 52.6% |
| `notes` | 209 | 32.2% |
| `fileName` | 183 | 28.2% |
| `leadMusician` | 62 | 9.5% |
| `bpm` | 58 | 8.9% |
| `estimatedMinutes` | 44 | 6.8% |
| `performer` | 43 | 6.6% |
| `name` | 43 | 6.6% |
| `transposition` | 38 | 5.8% |
| `url` | 8 | 1.2% |
| `description` | 7 | 1.1% |

### Sample track shapes (first track from first 3 setlists)

**Setlist 1 (`0RC4b6CpvnPbz09ue07q`)** — keys: `id`, `title`, `type`

```json
{
  "id": "2aee196e-5373-4332-9049-1aa8e5bf8d66",
  "title": "Pre Service",
  "type": "header"
}
```


**Setlist 2 (`29EqdMESd6QjhfokL2Bu`)** — keys: `id`, `title`, `type`

```json
{
  "id": "ae5553a2-41ed-4ccd-9295-8b3b93b56b16",
  "title": "Pre Service",
  "type": "header"
}
```


**Setlist 3 (`3ydVKM1WSADW0vn9vWaN`)** — keys: `id`, `key`, `notes`, `title`

```json
{
  "title": "Nigun",
  "key": "",
  "notes": "",
  "id": "track-1769385266647-1"
}
```


---

## 3. Top-Level Tracks Collection (`tracks/*`)

| Metric | Count |
|--------|-------|
| Total track documents | **0** |
| Distinct setlistId values | **0** |
| Distinct songId values | **0** |
| Tracks with `liturgicalSlot` field (v50-02 orphan) | **0** |

---

## 4. Split-Brain Delta

Cross-reference of which setlists have embedded `tracks[]` vs. top-level `tracks/{id}` documents.

| Bucket | Count | Sample IDs |
|--------|-------|------------|
| **Legacy-only** (embedded tracks, NO top-level) | 24 | `0RC4b6CpvnPbz09ue07q`, `29EqdMESd6QjhfokL2Bu`, `3ydVKM1WSADW0vn9vWaN`, `4GVt6rK5RCVHr5BGPAUv`, `5zLP8DidKQ2lLMKci2xI` |
| **Top-level only** (no embedded, has top-level) | 0 | — |
| **Both** (embedded AND top-level — split-brain) | 0 | — |

---

## 5. Orphan v50-02 Data

v50-02 deleted the *code* for AI chat, song-groups, and live-swap UI but left the *data* in place per close note. This audit confirms what's still in production.

| Source | State |
|--------|-------|
| `chats/*` collection | **0 docs** |
| `songGroups/*` collection | **0 docs** |
| `config/songGroups` doc | _absent (✓)_ |
| Setlists with `liveState` field | **10** (see Section 2) |
| Embedded tracks with `liturgicalSlot` | **0** (see Section 2) |
| Top-level tracks with `liturgicalSlot` | **0** (see Section 3) |

---

## 6. Dry-Run Output (existing `migrate-v50.ts`)

The existing script does ONLY the v50-04 song-defaults backfill (`songs/{id}.defaults` + `recent[]` from setlist `tracks[]` history). It does NOT reshape tracks or scrub orphans.

**Affected song count:** 0


Captured output:
```
[v50] DRY-RUN: 0 songs would be touched.
```

---

## 7. Recommendation

### Critical context the audit revealed

The legacy production data is **fundamentally different** from what `migrate-v50.ts` expected:

1. **`songs/*` collection is empty (0 docs).** v50-04's whole premise — populate `songs/{id}.defaults` from setlist history — has no target. Even if MARKER_PATH were fixed and the script ran, it would touch 0 songs because every iteration hits `if (!songDoc.exists) continue` (script line 196).

2. **0 of 650 embedded tracks reference `songId`.** Tracks have `id` (UUID local identifier, 97.5%) and `fileId` (Drive/Storage chart ref, 54%) — neither is a `songs/{id}` reference. The legacy shape predates v50-04's songId model entirely. Bridging requires either:
   - Generating songIds from unique titles (creates duplicates if same title spelled differently across setlists)
   - Matching by title + fuzzy logic (judgment calls; error-prone)
   - Skipping song-catalog migration entirely (editor populates `songs/*` organically as user adds songs in v5.0 UX)

3. **`migrate-v50.ts` has a structural bug** in MARKER_PATH (3-segment path = collection, not doc; throws against real Firestore). Tests use a fake adapter that doesn't validate, so this never surfaced before.

4. **10 setlists carry orphan `liveState`** (Section 2). v50-02 amputation deleted the code paths that consume this field, so it's dead weight. Cleanup is cosmetic but trivial.

5. **0 top-level `tracks/{id}` docs.** The v5.0 editor (shipped via v50-05-01 cutover) has never been used in production — confirms band-not-onboarded constraint. There is no live v5.0 data to preserve.

6. **Most embedded tracks have no memory fields.** Only 9.5% have `leadMusician`, 8.9% have `bpm`. Even with a perfect bootstrap pass, the v50-04 backfill would produce defaults for ≤62 songs (and only if their titles uniquely identify them).

### Answers to v50-07-02 scope questions

| # | Question | Answer | Driver |
|---|----------|--------|--------|
| 1 | Apply existing `migrate-v50.ts` as-is? | **NO** | Marker-path bug + empty songs/* + 0 songId references → script does nothing useful and crashes on first read |
| 2 | Reshape `setlists.tracks[]` → `tracks/{id}`? | **OPTIONAL** (depends on perf-view choice in v50-07-03) | 24 legacy-only setlists, 0 split-brain, 0 top-level — depending on whether perf-view stays on legacy reads (no migration needed) or moves to top-level (full reshape needed) |
| 3 | Scrub orphan v50-02 data? | **YES — narrow** | 10 setlists with `liveState` field; chats/songGroups already clean. Trivial. |
| 4 | v50-07-02 scope estimate | **see options below** | Three viable scope shapes — band-not-onboarded constraint changes the calculus significantly |

### Three viable v50-07 scope shapes

#### Option A — Full Forward Migration (LARGE, ~3 plans)
Treat all 24 historical setlists as production data; migrate them fully into the v5.0 shape so the perf-view + editor work uniformly across old + new.

- **v50-07-02a** Patch `migrate-v50.ts` MARKER_PATH bug + scrub `liveState` from 10 setlists (low risk)
- **v50-07-02b** Bootstrap `songs/*` from unique track titles + reshape `setlists.tracks[]` → `tracks/{id}` (high risk; song dedup is judgment-heavy; ~24 setlists × ~27 tracks avg = ~650 reshape writes; rollback snapshots needed)
- **v50-07-02c** Apply v50-04 song-defaults backfill (now that songs/* is populated)
- **v50-07-03** Perf-view bridge to top-level `tracks/{id}` (`/ui-ux-pro-max` BLOCKING)

**Pros:** Single uniform data shape going forward; perf-view bridge is straightforward.
**Cons:** Most work; song dedup is fuzzy; only 9.5% of tracks have memory fields so the backfill payoff is marginal; risk of broken historical setlists if dedup goes wrong.

#### Option B — Clean-Slate Cutover (SMALL, 1 plan)
Treat historical setlists as **frozen archive** — read-only forever, never touched by v5.0 editor. v5.0 starts fresh; band creates new setlists from scratch via the new editor; songs/* populates organically; perf-view continues reading legacy `tracks[]` for old setlists and top-level `tracks/{id}` for new ones.

- **v50-07-02** Scrub `liveState` from 10 setlists + patch MARKER_PATH bug (defensive — for any future migration). NO data reshape, NO songs bootstrap, NO v50-04 backfill.
- **v50-07-03** Perf-view dual-read: legacy `setlists/{id}.tracks[]` if non-empty, else top-level `tracks/{id}` (backwards-compatible; covers both cohorts) (`/ui-ux-pro-max` BLOCKING)

**Pros:** Lowest risk; no data-shape decisions; band-not-onboarded constraint makes "freezing the archive" cheap; perf-view bridge becomes a fallback-chain not a migration-dependent rewrite.
**Cons:** Old setlists frozen — Rabbi cannot edit them through v5.0 UI (would need to clone-and-edit). songs/* memory features only apply to newly-created songs.

#### Option C — Hybrid: Editor Can Open Legacy (MEDIUM, 1-2 plans)
Like Option B, but additionally extend `SetlistGridHydrator` to **convert legacy `setlists/{id}.tracks[]` → top-level `tracks/{id}` lazily on first edit**. The setlist becomes "live" the moment the user opens it for editing. No bulk migration; migration is per-setlist, on-demand, driven by user action.

- **v50-07-02** Scrub `liveState` + patch MARKER_PATH bug (same as Option B).
- **v50-07-03** Lazy-hydration in `SetlistGridHydrator`: detect legacy shape on mount, fan out `applyEdit('set', 'tracks', ...)` per legacy track, set a `hydrated:true` flag on the setlist doc to prevent re-hydration. Perf-view also dual-reads (legacy or top-level). (`/ui-ux-pro-max` BLOCKING)

**Pros:** No bulk-migration risk; old setlists become editable on first open; band can pull up any past setlist and tweak it. Self-healing — every visit moves data forward.
**Cons:** Lazy migration logic must be 100% correct (rollback if write fails partway; idempotent on re-mount); hidden cost on first-open of old setlists.

### Final recommendation: **Option C (Hybrid)**

Reasoning:
- **Band-not-onboarded constraint** means there's no urgency to migrate everything pre-cutover. Lazy is fine.
- **Rabbi's weekly workflow is "clone last week's setlist"** (per project memory) — so the hot path lives in newly-created setlists. Old setlists need to be *readable* (perf-view + clone source) more than *editable*.
- **Lazy hydration self-heals** — every edit-open migrates one setlist, so the fleet drifts forward without a Big Bang day.
- **Lower blast radius than Option A** — no one-shot reshape against 24 setlists with judgment-heavy song dedup.
- **More capability than Option B** — Rabbi can edit old setlists through the new editor (not just clone-and-edit-new).

Caveats:
- Old setlists with no `key`/`leadMusician`/`bpm` (the majority of tracks) will look bare in the v5.0 grid. Acceptable — those fields were never set in the legacy data.
- `songs/*` populates organically; sticky memory only kicks in for songs the user re-uses post-onboarding. Acceptable.
- The 10 `liveState` orphans get scrubbed proactively (cheap; reduces future confusion).

---

### HUMAN-VERIFY decision required

Before v50-07-02 PLAN can be written, please choose:

- **(A) Full Forward Migration** — write all 24 setlists into the v5.0 shape now. Bigger blast radius, fuller uniformity.
- **(B) Clean-Slate Cutover** — freeze historical setlists; v5.0 starts empty. Lowest risk.
- **(C) Hybrid: Lazy Hydration** ← **recommended.** Old setlists migrate on first edit-open. Best balance of risk + capability.
- **(override: ...)** — describe alternative scope.
- **(pause)** — defer v50-07 until later session.

Type your choice in chat to proceed. The autonomous run will halt at this checkpoint per PLAN AC-7.
