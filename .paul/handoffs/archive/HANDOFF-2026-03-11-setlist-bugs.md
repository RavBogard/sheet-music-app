# PAUL Session Handoff

**Session:** 2026-03-11
**Phase:** 8 of 12 (Performance UX Fixes) — paused for urgent bug investigation
**Context:** Phase 7 completed + Phase 8 planned + production bug investigation

---

## Session Accomplishments

- Phase 7 (Remove Annotation Feature) UNIFY complete — SUMMARY created, PROJECT/ROADMAP/STATE evolved
- Git commit `84a99ef` pushed to master: `feat(07-remove-annotation-feature)` (5 files deleted, 6 edited)
- Phase 8 Plan 08-01 created at `.paul/phases/08-performance-ux-fixes/08-01-PLAN.md`
- Production bug investigation completed — root causes identified for two user-reported issues

---

## Decisions Made

| Decision | Rationale | Impact |
|----------|-----------|--------|
| Pause Phase 8 for urgent bug fix | Production-breaking issues affecting band members | Insert Phase 8.1 before continuing Phase 8 |
| Phase 8 plan kept as-is | UX fixes still valid, just deferred | Resume after 8.1 |

---

## Production Bug Investigation Results

### Bug 1: "Failed to save changes, check your internet connection" + blank page

**Root Cause:** Firestore security rules have NO admin fallback for setlists collection.

```
// firestore.rules lines 83, 95-96
allow read: if (resource.data.isPublic == true) || isOwner(resource);
allow update: if isOwner(resource) || (resource.data.isPublic == true && isBandLeader());
```

`isOwner()` checks `resource.data.ownerId == request.auth.uid`. Old setlists with missing `ownerId` field → **nobody** can read or write via client Firestore (including admin). Server-side page loads fine (Admin SDK bypasses rules), but client-side auto-save fails.

**Key files:**
- `firestore.rules:81-99` — setlist read/write rules
- `src/hooks/use-setlist-logic.ts:318-326` — error catch shows misleading "check internet" message
- `src/lib/setlist-firebase.ts:105-114` — `subscribeToSetlist` uses converter with rules

### Bug 2: Other user redirected to /setlists page viewing past setlists

**Root Cause:** Server-side ownership check in `src/app/(main)/setlists/[id]/page.tsx:47`:

```typescript
if (data.ownerId !== user.uid && !user.isAdmin) {
    redirect("/setlists")
}
```

If `ownerId` is undefined/null in old Firestore docs, `undefined !== user.uid` is always true. Non-admin users get silently redirected.

---

## Fixes Needed (Phase 8.1 scope)

### Fix 1: Firestore rules — add admin fallback
**Priority:** CRITICAL
**Files:** `firestore.rules`
**Action:** Add `|| isAdmin()` to setlist read and update rules
```
allow read: if (resource.data.isPublic == true) || isOwner(resource) || isAdmin();
allow update: if isOwner(resource) || (resource.data.isPublic == true && isBandLeader()) || isAdmin();
```

### Fix 2: Server page — handle missing ownerId
**Priority:** CRITICAL
**Files:** `src/app/(main)/setlists/[id]/page.tsx`
**Action:** Treat missing ownerId as legacy data, don't redirect if ownerId is falsy
```typescript
if (data.ownerId && data.ownerId !== user.uid && !user.isAdmin) {
    redirect("/setlists")
}
```

### Fix 3: Data migration — backfill ownerId
**Priority:** HIGH
**Action:** One-time script to set `ownerId` on old setlists that lack it (set to admin UID since Rabbi Daniel created them all)

### Fix 4: Better error messaging
**Priority:** MEDIUM
**Files:** `src/hooks/use-setlist-logic.ts`
**Action:** Show actual Firestore error instead of catch-all "check internet connection"

---

## Open Questions

- Are ALL old setlists owned by Rabbi Daniel, or were some created by other users? (Affects migration script)
- Should the Firestore READ rule also allow `isBandLeader()` for non-public setlists? (Currently only owner or public)

---

## Reference Files for Next Session

```
@firestore.rules (lines 81-99 — setlist rules)
@src/app/(main)/setlists/[id]/page.tsx (lines 39-50 — ownership redirect)
@src/hooks/use-setlist-logic.ts (lines 318-326 — save error handling)
@src/lib/setlist-firebase.ts (lines 105-114 — subscribeToSetlist)
@src/types/schemas.ts (lines 162-180 — Zod converter)
@.paul/phases/08-performance-ux-fixes/08-01-PLAN.md (paused Phase 8 plan)
```

---

## Prioritized Next Actions

| Priority | Action | Effort |
|----------|--------|--------|
| 1 | Insert Phase 8.1: Setlist Access Bug Fixes | — |
| 2 | `/paul:plan` for Phase 8.1 with the 4 fixes above | ~10min |
| 3 | `/paul:apply` Phase 8.1 (rules + server page + migration + error msg) | ~20min |
| 4 | Deploy + verify with band member | ~5min |
| 5 | Resume Phase 8 (Performance UX Fixes) with existing plan 08-01 | — |

---

## State Summary

**Current:** Phase 8, Plan 08-01 created (PLAN ✓, APPLY ○, UNIFY ○) — paused
**Urgent:** Insert Phase 8.1 for production bug fixes before continuing
**Next:** `/paul:resume` → this handoff → `/paul:add-phase` for 8.1 → plan → apply
**Resume:** `/paul:resume`

---

*Handoff created: 2026-03-11*
