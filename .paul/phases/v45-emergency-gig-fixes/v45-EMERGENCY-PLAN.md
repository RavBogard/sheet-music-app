---
phase: v45-emergency-gig-fixes
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/components/performance/PerformanceToolbar.tsx
  - src/components/performance/MetronomeControl.tsx
  - src/hooks/use-setlist-logic.ts
  - src/lib/setlist-draft.ts  # NEW
autonomous: true
emergency: true
---

<objective>
## Goal
Ship targeted root-cause fixes for live-gig reports #1 (toolbar overlap) and #3 (setlist data loss) **before Rabbi Daniel's service resumes**. Ship now even though the full local-first re-architecture (v45-02..05) is the eventual right answer — this phase addresses the specific silent-failure modes so the app becomes usable TODAY without shipping a bandaid.

## Purpose
User feedback during the gig: "we need to fix 1 and 3 before the gig. it's not usable right now." App is unusable. Emergency scope: narrow, surgical, but still root-cause not symptom — no `setTimeout` hacks, no "just hide it", no feature flags.

## Output
- PerformanceToolbar: flex-based layout (desktop + mobile row 2) — LEFT/RIGHT never overlap CENTER chart-nav
- MetronomeControl: BPM input collapses first (< 1280px viewport) per user rule
- use-setlist-logic: isDirtyRef replaces hasPendingSave||saving gate; subscription drops `saving` dep; post-save ref reset; StaleWriteError surfaces as toast + banner
- NEW src/lib/setlist-draft.ts: localStorage-backed draft snapshot. Debounced writes on state changes; restore prompt on mount if draft newer than server.
</objective>

## Acceptance (compressed)

### Issue #1 — toolbar
- **AC-1:** At every supported viewport (iPad portrait 1024, iPad landscape 1366, phone 390), chart prev/next arrows in SongNavigation are **not visually covered** by Monitor / BPM / Transposer / Exit / SetlistDrawer.
- **AC-2:** When space is tight, **BPM is the first control to collapse** (BPM number input hidden first; blink button stays).

### Issue #3 — data loss
- **AC-3:** Dirty-flag tracks true edits. When remote snapshot advances and local is DIRTY → banner + **toast**. When remote advances and local is CLEAN → silent merge.
- **AC-4:** After successful save, `lastSeenUpdatedAtRef` resets so the next subscription echo re-baselines cleanly. No stale-precondition loop.
- **AC-5:** `saving` removed from subscription effect deps — subscription no longer churns per save cycle.
- **AC-6:** `StaleWriteError` catch emits `toast.error("Save conflict — review banner at top")` alongside the existing structured logger.error.
- **AC-7:** localStorage-backed draft persists on every state mutation (debounced 500ms). On editor mount, if draft.savedAt > remote.updatedAt, a sonner toast offers "Restore draft" action. Draft cleared on successful save.

## Boundaries

### DO NOT CHANGE
- Firestore rules, flush route, auth, or any security surface
- SetlistEditorV2's render structure beyond necessary wiring
- The existing SetlistChangedBanner (keep it; we ADD a toast, we don't replace the banner)
- Any v45-01 instrumentation (must continue to fire)

### SCOPE LIMITS
- No IDB. localStorage is explicitly chosen for synchronous + simple + survives reload.
- No sync engine / retries / backoff (v45-03 still pending).
- No full three-way conflict UI (v45-04 still pending; banner stays).
- No file-size refactor, type-safety, or perf tail (v45-08 still pending).

## Verification
- `npx tsc --noEmit` green
- `npm test` green (existing suite must not regress; add 3-5 smoke tests inline only if fast)
- `npx next build` passes
- Manual browser inspection of toolbar at 1024px and 1366px widths not feasible during gig — relying on DOM layout guarantees (flex + min-w-0 + truncate)
- User smoke test: user edits setlist → refreshes → offered to restore

## Emergency deviations acceptable

To ship fast:
- Test additions may be lighter than ideal (smoke-level)
- Documentation SUMMARY will be abbreviated
- Skill audit waived (we know /ui-ux-pro-max is recommended for v45-06; this is a surgical fix not a UI redesign, so the skill's decision value is low here)

