# Milestones

Completed milestone log for this project.

| Milestone | Completed | Duration | Stats |
|-----------|-----------|----------|-------|
| v1.3 Bugsweep & Backend Hardening | 2026-03-10 | ~76 min | 4 phases, 7 plans |

---

## v1.3 Bugsweep & Backend Hardening

**Completed:** 2026-03-10
**Duration:** ~76 min across 7 plans

### Stats

| Metric | Value |
|--------|-------|
| Phases | 4 |
| Plans | 7 |
| Files changed | 40+ |

### Key Accomplishments

- Produced comprehensive codebase audit with 20+ findings categorized by severity
- Fixed QR auth token binding vulnerability and AI concurrency deadlock
- Added rate limiting to unauthenticated endpoints and fire-and-forget notification safety
- Standardized error responses via createApiHandler pattern on key routes
- Added Zod validation, StorageResult pattern, and BroadcastChannel cache invalidation
- Fixed dependency array bugs on 7 hooks eliminating stale closures in live performance
- Added unmount safety (isMountedRef, AbortController, cancelled flags) to 4 async hooks
- Implemented ref-counted monitor connection with debounced teardown
- Added error boundaries to 4 crash-prone components (admin sections, setlist editor)
- Eliminated 14 dangerous `as any` casts by fixing root type signatures

### Key Decisions

| Decision | Phase | Impact |
|----------|-------|--------|
| withAiSlot as preferred AI concurrency API | Phase 2 | Pattern for all future AI callers |
| Drive timeout via Promise.race | Phase 2 | googleapis doesn't support AbortSignal |
| uploadToStorage keeps throwing, reads get StorageResult | Phase 3 | Consistent pattern for Storage callers |
| BroadcastChannel for cross-tab cache invalidation | Phase 3 | Tabs stay in sync after library sync |
| Ref-based callbacks for effect dep stability | Phase 4 | Pattern for all hooks with callback deps |
| Broadened useSafeFirestoreSync ref type to DocumentData | Phase 4 | Eliminates all caller as any casts |

---
