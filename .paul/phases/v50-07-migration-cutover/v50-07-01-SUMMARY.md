# v50-07-01 SUMMARY

**Closed:** 2026-04-27
**Loop:** PLAN ✓ → APPLY ✓ → UNIFY ✓ (HUMAN-VERIFY pending for v50-07-02 scope decision)
**Type:** research / discovery — no production writes, no source code changes outside of `scripts/audit-v50.ts`
**Commits:** `c10bc81` (PLAN) + close commit (this SUMMARY + audit script)

---

## What was built

`scripts/audit-v50.ts` — a one-shot READ-ONLY audit script (~340 LOC) that inspects production Firestore to drive v50-07-02 scope decisions. Reuses `runMigration` from `migrate-v50.ts` for the dry-run portion (with an interceptor adapter that hides the broken MARKER_PATH from the existing script). Outputs a structured Markdown report at `.paul/phases/v50-07-migration-cutover/v50-07-01-DRY-RUN-REPORT.md`.

Audit covers:
1. Migration marker state (`system/migrations/v50`)
2. Setlists collection — count, embedded `tracks[]` shape + field-frequency + sample, `liveState`/`liturgicalSlot` orphan probes, `songs/*` collection size
3. Top-level `tracks/{id}` collection — count, distinct setlistId/songId, `liturgicalSlot` orphan probe
4. Split-brain delta (legacy-only / top-level-only / both)
5. Orphan v50-02 collections (`chats/*`, `songGroups/*`, `config/songGroups`)
6. Existing `migrate-v50.ts --dry-run` output (with marker-path bug intercept)
7. Synthesized Recommendation block with three viable v50-07 scope shapes

---

## Key findings

### 🐛 Pre-existing bug discovered in `migrate-v50.ts`
`MARKER_PATH = 'system/migrations/v50'` is a 3-segment path = collection, not document. `db.doc()` rejects with `documentPath must point to a document, but was "system/migrations/v50"`. Tests use a fake adapter that does not validate path structure, so the bug never surfaced. **The script as currently written will crash on first invocation against real Firestore.** Must be patched in v50-07-02 before any apply attempt.

### 📊 Production data shape is more divergent than the handoff suggested

| Metric | Value | Implication |
|--------|-------|-------------|
| Total setlists | 29 | Small fleet — band-not-onboarded |
| Setlists with embedded `tracks[]` | 24 | All historical data lives in legacy shape |
| Total embedded track count | 650 | Average 27 tracks/setlist |
| Distinct songIds in embedded tracks | **0** | Tracks reference `id` (UUID, 97.5%) + `fileId` (Drive ref, 54%) — NOT `songs/{id}` |
| `songs/*` collection | **0 docs** | v50-04 target population doesn't exist |
| Top-level `tracks/{id}` collection | **0 docs** | v5.0 editor never used in prod |
| Setlists with `liveState` | 10 | v50-02 orphan; trivial scrub |
| `chats/*` collection | 0 | v50-02 orphan already clean |
| `songGroups/*` collection | 0 | v50-02 orphan already clean |
| `config/songGroups` doc | absent | v50-02 orphan already clean |
| Tracks with `leadMusician` | 9.5% | Sticky-memory backfill payoff is marginal |
| Tracks with `bpm` | 8.9% | Same |
| Tracks with `key` | 52.6% | Modest payoff |

### 🎯 What the v50-04 migration would actually do

`migrate-v50.ts --dry-run` reports **0 affected songs** even after fixing MARKER_PATH. The reason: every iteration hits `if (!songDoc.exists) continue` because `songs/*` is empty and embedded tracks have no `songId` references. **The migration as designed has no work to do against current production data.**

### 🧭 Three viable v50-07 scope shapes

Full Recommendation in DRY-RUN-REPORT.md §7. Headline:

- **Option A — Full Forward Migration (LARGE, ~3 plans):** bootstrap songs/* from titles + reshape setlists.tracks[] → tracks/{id} + scrub orphans + apply backfill. Highest blast radius; song-dedup judgment-heavy.
- **Option B — Clean-Slate Cutover (SMALL, 1 plan):** freeze historical setlists as read-only; v5.0 starts empty; perf-view dual-reads legacy + top-level. Lowest risk.
- **Option C — Hybrid: Lazy Hydration (MEDIUM, 1–2 plans) ← RECOMMENDED:** scrub orphans + patch MARKER_PATH; SetlistGridHydrator converts legacy → top-level on first edit-open; old setlists self-heal as Rabbi opens them. Best balance of risk + capability for the band-not-onboarded reality.

---

## Decisions made

| Decision | Rationale |
|----------|-----------|
| Build a separate `scripts/audit-v50.ts` rather than extending `migrate-v50.ts` | Keeps the migration script frozen until v50-07-02; audit is pure read-only with different concerns |
| Use a wrapped `MigrationFirestore` adapter that intercepts MARKER_PATH `getDoc` | Lets the existing dry-run logic run progressably despite the path bug; documented in audit report |
| Audit captures full `fieldFrequency` map across all 650 tracks | Surfaces the legacy shape (no songId, has fileId/id) — couldn't be inferred from migrate-v50.ts assumptions |
| Sample first 3 setlist track shapes verbatim into the report | Concrete examples beat abstract counts when humans are deciding scope |
| Recommendation is INPUT to a human decision, not the decision itself | Migration is irreversible past `--apply`; band-not-onboarded constraint changes optimal scope; user judgment required |

---

## Acceptance criteria status

- ✓ AC-1: dry-run runs cleanly (with marker-path bug intercept; no production writes)
- ✓ AC-2: dry-run output captures affected count (0) and notes marker absence
- ✓ AC-3: setlist data shape audited (counts + field-frequency + samples)
- ✓ AC-4: tracks collection audited (0 docs confirmed)
- ✓ AC-5: split-brain delta computed (24 legacy-only, 0 top-level-only, 0 both)
- ✓ AC-6: orphan presence checked (chats/songGroups/config clean; 10 setlists with liveState)
- ✓ AC-7: Recommendation block synthesizes findings into 3 scope options + recommended choice
- ⏸ HUMAN-VERIFY: pending user decision before v50-07-02 PLAN

---

## What's next

**HUMAN-VERIFY checkpoint.** User reviews `DRY-RUN-REPORT.md` end-to-end and selects one of:
- (A) Full Forward Migration
- (B) Clean-Slate Cutover
- (C) Hybrid: Lazy Hydration ← recommended
- (override: ...)
- (pause)

Once the user signals their choice, v50-07-02 PLAN gets written against that scope. The autonomous run halts here per PLAN AC-7 — migration is irreversible past `--apply` and scope decisions of this magnitude require human judgment.

After v50-07-02 + v50-07-03 (perf-view bridge) ship, v50-07-04 (Playwright kitchen-sink) and v50-07-05 (Sentry alarms + UAT prep) can run autonomously.

---

## Files touched

- `scripts/audit-v50.ts` (new, ~340 LOC) — read-only production audit
- `.paul/phases/v50-07-migration-cutover/v50-07-01-PLAN.md` (created in PLAN commit)
- `.paul/phases/v50-07-migration-cutover/v50-07-01-DRY-RUN-REPORT.md` (new, audit output)
- `.paul/phases/v50-07-migration-cutover/v50-07-01-SUMMARY.md` (new, this file)
- `.paul/STATE.md` (updated — loop position + HUMAN-VERIFY status)

No production source files modified. No production Firestore writes.
