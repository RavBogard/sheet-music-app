---
phase: v5h3-01-save-loss-recurrence
plan: 02
subsystem: sync-instrumentation
tags: [sentry-breadcrumbs, edit-log, dexie-schema-bump, observability, no-pii, save-loss-recurrence-instrumentation]

# Dependency graph
requires:
  - phase: v5h3-01-save-loss-recurrence
    provides: Round-2 Option B decision from v5h3-01-01 (auto-capture instrumentation only); 6-hypothesis investigation defining the 5 hot-site target list
  - phase: v50-07-migration-cutover
    provides: sentry-capture.ts + captureSyncFailure pattern + no-PII discipline + try/catch-around-Sentry-itself precedent (v50-07-05)
  - phase: v50-04-song-catalog-sticky-memory
    provides: Dexie additive-non-indexed schema-bump rule
provides:
  - Auto-capture instrumentation deployed-ready: Sentry breadcrumbs at 5 hot write paths + IndexedDB edit_log table + upload-on-mount helper
  - Schema bump v2 → v3 (additive `edit_log: '++id, ts'` table only)
  - 29 new tests + no-PII enforcement assertion
affects: [v5h3-01-03 (postmortem + fix decision once recurrence captured), v53-02 chart-binding-and-verification (still blocked behind first recurrence signal)]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Round-2 Option B (auto-capture instrumentation): when manual production capture is unavailable, build observability infra to catch next recurrence without user intervention. Pattern: Sentry breadcrumbs at hot write paths + IndexedDB-persisted edit log + upload-on-mount. Reusable for any future evidence-blocked diagnosis."
    - "Snapshot-listener breadcrumb collection: collect outcomes inside the existing Dexie tx, EMIT breadcrumbs (recordEdit calls) AFTER the tx commits — recordEdit opens its own rw tx on db.edit_log, nesting would error. Outcomes accumulator preserves observable behavior; tx-throw → no breadcrumbs emitted (matches 'after success' semantics)."
    - "DropdownCell breadcrumb gated by value-change (next !== value), mirroring TextCell's draft !== value semantics — prevents noop-close breadcrumb noise"

key-files:
  created:
    - sheet-music-app/src/lib/sync/edit-log.ts
    - sheet-music-app/src/lib/sync/edit-log-upload.ts
    - sheet-music-app/src/lib/sync/__tests__/edit-log.test.ts
    - sheet-music-app/src/lib/sync/__tests__/edit-log-upload.test.ts
  modified:
    - sheet-music-app/src/lib/local/schema.ts (Dexie v2 → v3 + edit_log table)
    - sheet-music-app/src/lib/local/types.ts (LocalEditLog + EditLogSource)
    - sheet-music-app/src/lib/local/write.ts (recordEdit after applyEdit tx commit)
    - sheet-music-app/src/lib/sync/sentry-capture.ts (addEditBreadcrumb + uploadEditLogBreadcrumbs + stableTagsFromEntry)
    - sheet-music-app/src/lib/sync/engine.ts (3 breadcrumb sites: success / handleAdapterError entry / dead-letter)
    - sheet-music-app/src/lib/sync/snapshot-listener.ts (per-change outcome collection + post-tx emission)
    - sheet-music-app/src/lib/sync/init.ts (uploadRecentEditLog fire-and-forget after engine.start)
    - sheet-music-app/src/components/setlist/grid/cells/TextCell.tsx (recordEdit in commit, value-change-gated)
    - sheet-music-app/src/components/setlist/grid/cells/DropdownCell.tsx (recordEdit in commit, value-change-gated)
    - sheet-music-app/src/lib/local/__tests__/schema.test.ts (Rule 1 auto-fix: verno 2 → 3)

key-decisions:
  - "Schema bump v2 → v3 (additive `edit_log: '++id, ts'` only — primary key + ts secondary index for orderBy)"
  - "Snapshot-listener: collect outcomes inside existing Dexie tx, emit breadcrumbs after tx commits (avoids nested rw-tx error)"
  - "DropdownCell breadcrumb gated by `next !== (value ?? '')` (matches TextCell's value-change discipline)"
  - "All recordEdit/addEditBreadcrumb/uploadRecentEditLog calls wrapped in try/catch + logger.warn (fail-soft; instrumentation MUST NOT crash callers — v50-07-05 precedent)"
  - "engine.ts uses `this.clock.now()` for recordEdit timestamps; other 4 sites use Date.now() (no clock injection point — fine for production; means engine breadcrumbs deterministic in FakeClock tests, others use real wallclock)"

patterns-established:
  - "edit_log Dexie table convention: append-only fire-and-forget FIFO-capped at 500 rows; oldest evicted in same tx as insert; per-mount upload + clearUploaded(maxId)"
  - "Sentry breadcrumb stableTags discipline: only stable identifiers (op, collection, docId, cellType, payloadKeys-as-comma-string, outcome, attempts, localUpdatedAt). Undefined/null dropped. Numeric values string-coerced. Timestamp in seconds (Sentry convention). Reusable wrapper format for future breadcrumb additions."
  - "no-PII enforcement via test assertion (forbidden-keys list) — future schema additions automatically caught if they leak"

# Metrics
duration: ~1.5h (delegated to dan-executor agent)
started: 2026-05-02T08:30:00Z
completed: 2026-05-02T10:00:00Z
---

# v5h3-01-02: Auto-Capture Instrumentation Build Summary

**Sentry breadcrumbs at 5 hot write paths + IndexedDB edit_log table + upload-on-mount helper, all wired through fail-soft instrumentation. Suite 1528 → 1557 (+29). Boundary-clean except for 1 schema-test auto-fix (Rule 1) and build-info.json auto-stamp. Ready to deploy via push to origin master.**

## Performance

| Metric | Value |
|--------|-------|
| Duration | ~1.5h (dan-executor agent delegation) |
| Started | 2026-05-02T08:30:00Z |
| Completed | 2026-05-02T10:00:00Z |
| Tasks | 3 of 3 PASS |
| Source files modified | 11 (9 in plan + 1 auto-fix + 1 auto-stamped) |
| Source files created | 4 (2 modules + 2 test files) |
| LOC delta | +313 / -9 across src/ |
| Tests added | +29 (1528 → 1557) |
| tsc | clean (0 errors) |
| next build | clean |

## Acceptance Criteria Results

| Criterion | Status | Notes |
|-----------|--------|-------|
| AC-1: Dexie schema bump for edit_log table | ✅ Pass | v2 → v3 additive non-indexed; LocalEditLog type with no value-carrying fields |
| AC-2: edit-log helper records + caps + queries | ✅ Pass | 11 unit tests including FIFO cap (510 → 500 retained), default K=50, fail-soft on Dexie errors |
| AC-3: Sentry breadcrumb wrapper added | ✅ Pass | addEditBreadcrumb + uploadEditLogBreadcrumbs + stableTagsFromEntry; try/catch around Sentry; undefined/null dropped |
| AC-4: Breadcrumbs wired at 5 hot sites | ✅ Pass | TextCell.commit + DropdownCell.commit (value-change-gated) + applyEdit (post-tx) + engine.drainOnce (3 sites: success / error-entry / dead-letter) + snapshot-listener.handleTracks (4 outcomes: applied / guard-skipped-pending / guard-skipped-undefined / guard-skipped-stale + remove-applied) |
| AC-5: Upload-on-mount fires + clears | ✅ Pass | init.ts wires `void uploadRecentEditLog()` after engine.start; fire-and-forget; fail-soft via logger.warn |
| AC-6: No-PII enforcement test | ✅ Pass | Forbidden-keys assertion (payload, text, value, draft, title) on Sentry data; future regressions caught automatically |
| AC-7: Full suite + boundary clean | ✅ Pass | 1557/1557 passing; tsc + next build clean; boundary diff matches files_modified except Rule 1 auto-fix + auto-stamped build-info |

## Accomplishments

- **Auto-capture infrastructure ready for deploy.** Push to origin master triggers Vercel auto-deploy; next save-loss recurrence will auto-capture evidence to Sentry as a breadcrumb sequence Daniel can inspect — no manual iPad inspection required.
- **5 hot write paths instrumented additively.** Zero existing logic changes; the v5h-01-02 LWW guards in snapshot-listener.ts (lines 186-189, 233-236) preserved with byte-identical guard semantics — only `outcomes.push(...)` lines inserted before each `continue`.
- **No-PII discipline enforced via test assertion.** Forbidden-keys list (payload, text, value, draft, title) checked against Sentry breadcrumb data; future schema additions automatically caught if they leak.
- **Schema bump v2 → v3 additive non-indexed.** `edit_log: '++id, ts'` — primary key + ts index only (per v50-04 rule). No upgrade callback needed; no destructive ops; existing data carries forward unchanged.
- **fail-soft contract everywhere.** recordEdit, addEditBreadcrumb, uploadRecentEditLog all wrapped in try/catch + logger.warn. Instrumentation MUST NOT crash production code paths (v50-07-05 discipline).

## Files Created/Modified

| File | Change | LOC delta | Purpose |
|------|--------|-----------|---------|
| `src/lib/local/schema.ts` | Modified | +19 | Dexie v3 declaration; existing tables re-declared per Dexie version-carry semantics |
| `src/lib/local/types.ts` | Modified | +44 | EditLogSource union + LocalEditLog interface (no value-carrying fields) |
| `src/lib/local/write.ts` | Modified | +21 | recordEdit fire-and-forget after applyEdit tx commit |
| `src/lib/sync/edit-log.ts` | **Created** | new | recordEdit + getRecentEntries + clearUploaded; FIFO cap 500 in same tx as insert |
| `src/lib/sync/edit-log-upload.ts` | **Created** | new | uploadRecentEditLog orchestrator (read → push → clear, fail-soft) |
| `src/lib/sync/sentry-capture.ts` | Modified | +85 | addEditBreadcrumb + uploadEditLogBreadcrumbs + stableTagsFromEntry |
| `src/lib/sync/engine.ts` | Modified | +53 | 3 breadcrumb sites: success after writeback / handleAdapterError entry / dead-letter |
| `src/lib/sync/snapshot-listener.ts` | Modified | +53 | Per-change outcome collection inside tx + post-tx emission (avoids nested rw tx) |
| `src/lib/sync/init.ts` | Modified | +7 | uploadRecentEditLog fire-and-forget after engine.start |
| `src/components/setlist/grid/cells/TextCell.tsx` | Modified | +13 | recordEdit in commit, value-change-gated (draft !== value) |
| `src/components/setlist/grid/cells/DropdownCell.tsx` | Modified | +15 | recordEdit in commit, value-change-gated (next !== value) |
| `src/lib/sync/__tests__/edit-log.test.ts` | **Created** | new | 11 cases — record, FIFO cap, getRecentEntries default K=50, clearUploaded, fail-soft on Dexie errors, no-PII shape audit, applyEdit site contract |
| `src/lib/sync/__tests__/edit-log-upload.test.ts` | **Created** | new | 10 cases — chronological breadcrumb ordering, no-PII enforcement on Sentry data, fail-soft on Sentry SDK throw, empty-input no-op |
| `src/lib/local/__tests__/schema.test.ts` | Modified (auto-fix) | +6 / -3 | Rule 1: existing test asserted `verno).toBe(2)`; bumped to (3) — 1-line forced by version bump |
| `src/build-info.json` | Modified (auto-stamped) | +6 / -6 | npm run build regenerates this; not a code change |

## Decisions Made

| Decision | Rationale | Impact |
|----------|-----------|--------|
| Snapshot-listener breadcrumbs collected-then-emitted | recordEdit opens its own `db.transaction('rw', db.edit_log)`; calling that inside an existing rw tx (which doesn't include db.edit_log in scope) errors. Defer emission to after outer tx commits via outcomes accumulator. | Identical observable behavior; tx-throw → no breadcrumbs emitted (matches "after success" semantics). Reusable for any future tx-nested instrumentation. |
| DropdownCell breadcrumb value-change-gated | Mirrors TextCell's `draft !== asString(value)` discipline. Without the gate, every dropdown CLOSE (even noop) emits a breadcrumb regardless of value change. | Reduces breadcrumb noise; matches user-intent semantics. Flag for review if "noop close" telemetry is later wanted (cheap to remove the gate). |
| engine.ts uses `this.clock.now()` for recordEdit | Engine has clock injection (FakeClock for deterministic tests); other sites don't. | Engine breadcrumbs deterministic in tests; other sites use real wallclock — fine for production. |
| Schema bump v2 → v3 (additive only) | Per v50-04 rule: additive non-indexed only; new indexed fields require version bump but not data migration. | No upgrade callback needed; existing v2 data carries forward unchanged via Dexie version-carry semantics. |
| Default K=50 for upload-on-mount | Matches plan AC-5; covers typical Daniel-loop session edit count without flooding Sentry. | Tunable via `uploadRecentEditLog({max: N})` option; conservative starting value. |

## Deviations from Plan

### Summary

| Type | Count | Impact |
|------|-------|--------|
| Auto-fixed | 1 | schema.test.ts verno 2→3 (forced by version bump; 1-line change; could not be avoided) |
| Auto-stamped | 1 | build-info.json (npm run build regenerates; not a code change) |
| Implementation nuances | 2 | DropdownCell value-change gate (mirrors TextCell); snapshot-listener post-tx emission (avoids nested rw tx) |
| Deferred | 0 | — |

**Total impact:** Plan executed cleanly; deviations are forced or implementation-detail clarifications, no scope creep or skipped work.

### Auto-fixed Issues

**1. schema.test.ts verno bump**
- **Found during:** Task 1 (schema bump v2 → v3)
- **Issue:** Existing test asserts `db.verno).toBe(2)` — schema bump forces a 1-line update
- **Fix:** Changed `2 → 3` in test assertion + describe-block label refresh
- **Files:** `src/lib/local/__tests__/schema.test.ts`
- **Verification:** Test passes; suite green
- **Reasoning:** Could not be avoided without leaving the suite red. Rule 1 (essential auto-fix to keep tests green during a forced schema change).

### Implementation Nuances (NOT deviations — clarifications)

**2. DropdownCell breadcrumb value-change-gated**
- Plan said "after the bind/select fires"
- Implemented as `if (next !== (value ?? '')) recordEdit(...)`
- Reasoning: Without gate, every dropdown CLOSE (noop or otherwise) emits a breadcrumb. Mirrors TextCell's existing value-change discipline.
- Flag for qualifier review if "noop close" telemetry is later wanted (1-line revert).

**3. Snapshot-listener post-tx breadcrumb emission**
- Plan said "recordEdit per change inside the for-loop"
- Implemented as outcomes accumulator inside tx, recordEdit calls AFTER tx commits
- Reasoning: recordEdit opens its own `db.transaction('rw', db.edit_log)` — nesting inside an outer rw tx (which doesn't include db.edit_log in scope) would error. Outcomes accumulator preserves identical observable behavior; tx-throw → no breadcrumbs emitted (matches "after success" semantics).

## Issues Encountered

| Issue | Resolution |
|-------|------------|
| snapshot-listener.test.ts closes its DB per-test; async fire-and-forget recordEdit lands slightly after | Correctly hits the swallowed-failure branch with `DatabaseClosedError` logged via `logger.warn`. Test still passes; behavior is correct (fail-soft contract). Worth noting for future test infra cleanup but NOT a blocker. |
| Snapshot-listener nested rw-tx error initially | Resolved by deferring breadcrumb emission to after outer tx commits (outcomes accumulator pattern). |

## Skill Audit

SPECIAL-FLOWS.md exists: `/ui-ux-pro-max` is required for any phase touching frontend UI/UX. v5h3-01-02 modifies TextCell.tsx + DropdownCell.tsx — but instrumentation is in code paths only (recordEdit calls in commit handlers); zero visual surface change. Per v50-07-05 precedent (Sentry instrumentation phase that did not require /ui-ux-pro-max), the gate does NOT apply. Skill audit: ✓ correctly N/A.

## Next Phase Readiness

**Ready:**
- Push to `origin master` triggers Vercel auto-deploy. Next save-loss recurrence after deploy will auto-capture evidence to Sentry as a breadcrumb sequence under category=`edit-log`.
- Daniel can inspect Sentry dashboard for any captures with category=`edit-log` after a recurrence; the sequence shows exactly which write paths fired in what order before the loss.
- v5h3-01-03 (final plan in v5h3-01 phase) can be a postmortem-only plan (if no recurrence in M weeks → close gap with v5h-01 §5 escalation), OR a fix plan once recurrence captured (single-cause / multi-cause / rules-extension / harness-fidelity-only per v5h3-01-01 decision matrix).

**Concerns:**
- Sentry breadcrumb noise: 5 hot sites × N edits per session = potentially many breadcrumbs. Rate limiting / sampling NOT added (would lose evidence). Monitor Sentry quota usage; add sampling if it bites.
- IndexedDB edit_log capacity: 500 rows ≈ 7-14 days at typical Daniel edit rate. If recurrence takes longer, oldest evidence may be evicted before upload. Acceptable tradeoff (recent rows are most relevant).
- DropdownCell gate may suppress legitimate "user opened picker, scrolled, closed without changing" telemetry that could matter for UX research (NOT save-loss). Easy to remove the gate later.

**Blockers:**
- None for v5h3-01-03 planning. Phase v5h3-01 still open (more plans / waiting for recurrence signal).
- v53-02 / v53-03 / v53-04 stay blocked behind first-recurrence-captured (per rescope ordering).

---

*Phase: v5h3-01-save-loss-recurrence, Plan: 02*
*Completed: 2026-05-02*
