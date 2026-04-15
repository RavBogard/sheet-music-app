# Performance & Code Quality Audit — v4.4 Phase 1

**Scope:** Full src/ (495 files, 760+ LOC max)  
**Date:** 2026-04-14

## Summary

**Health:** Good. No major anti-patterns.  
**Issues:** 36 (18 perf, 10 quality, 5 duplication, 3 dead code)  
**Key Focus:** Duplicated role logic, large files (600+ LOC), missing memoization

---

## Performance Issues (18)

### P-001 | Duplicated `isMusician` Logic
- **Where:** DesktopHeader.tsx:54 & MobileMenuDrawer.tsx:38
- **Issue:** Both re-derive isMusician locally; inconsistent
- **Fix:** Export helper from /lib/roles.ts

### P-002 | MusicianPicker — useCallback Chains Defeat Child Memoization
- **Where:** MusicianPicker.tsx:230-248
- **Issue:** Callbacks depend on musicians; all recreate when it changes
- **Fix:** Memoize callback list or pass musicians directly

### P-003 | SetlistEditorV2 — Keydown Handler Re-registration
- **Where:** SetlistEditorV2.tsx:216-239
- **Issue:** Effect deps too broad; re-registers on every state change
- **Fix:** Use useRef or extract outside effect

### P-004 | SetlistEditorV2 — Inline Object Defeats Memoization
- **Where:** SetlistEditorV2.tsx:128-145 (handlePlayTrack)
- **Issue:** Queue recreated on every call
- **Fix:** Memoize queue construction

### P-005 | PrintModal — Unm emoized Subscription
- **Where:** PrintModal.tsx:63-66
- **Issue:** subscribeToAllMusicianProfiles results not memoized
- **Fix:** Wrap in useMemo or custom hook

### P-006 | ChatPanel — Duplicate useMemo Import
- **Where:** ChatPanel.tsx:15
- **Issue:** Imported twice
- **Fix:** Remove duplicate

### P-007 | MusicianPicker — Fragile Memo
- **Where:** MusicianPicker.tsx:66-67
- **Issue:** Memoizes based on object reference, not content
- **Fix:** Memoize based on array content

### P-008 | SetlistEditorV2 — Memoized Children Props Not Memoized
- **Where:** SetlistEditorV2.tsx (757 LOC)
- **Issue:** Handlers passed to memo'd children created on every render
- **Fix:** useCallback for all handlers

### P-009 | MusicianPicker — Multiple Consumers, No Memoization
- **Where:** MusicianPicker.tsx:199-216
- **Issue:** allUsers used by multiple memos; changes cascade
- **Fix:** useAllUsersMap() hook

### P-010 | MusicianPicker — handleRequestAll Array
- **Where:** MusicianPicker.tsx:102-148
- **Issue:** musiciansToAssign recreated each call
- **Fix:** Ensure not passed inline to children

### P-011 | ChatPanel — Large Component, Many Subscribers
- **Where:** ChatPanel.tsx (549 LOC)
- **Issue:** Implicit subscriptions hard to trace
- **Fix:** Extract to custom hook or split

### P-012 | SetlistEditorV2 — Unnecessary useRef
- **Where:** SetlistEditorV2.tsx:243
- **Issue:** useRef for mount tracking
- **Fix:** Custom hook or restructure

### P-013 | DesktopHeader — searchResults Not Memoized
- **Where:** DesktopHeader.tsx:63-68
- **Issue:** filter().slice() on every render
- **Fix:** Wrap in useMemo

### P-014 | SetlistEditorV2 — Undo/Redo Not Memoized
- **Where:** SetlistEditorV2.tsx:147-148
- **Issue:** canUndo/canRedo not memoized
- **Fix:** Memoize in hook

### P-015 | MusicianPicker — Subscription Churn
- **Where:** MusicianPicker.tsx:89-94
- **Issue:** Re-subscribes on every setlistId change
- **Fix:** Custom hook with debounce

### P-016 | PrintModal — printMode Not Re-computed
- **Where:** PrintModal.tsx:47-80
- **Issue:** State initialized once, not re-computed
- **Fix:** useEffect to re-initialize

### P-017 | Congregation Store — Memo Fragility
- **Where:** congregation-store.ts:91
- **Issue:** Storage dependency could change
- **Fix:** Move creation outside, memoize

### P-018 | SetlistEditorV2 — Broad Effect Deps
- **Where:** SetlistEditorV2.tsx:204-250
- **Issue:** Multiple effects depend on tracks
- **Fix:** Split by concern, debounce

---

## Code Quality Issues (10)

### Q-001 | Duplicated roleLabels
- **Where:** MobileMenuDrawer.tsx:43-50
- **Fix:** Use ROLE_LABELS + CSS uppercase

### Q-002 | Inline Role Check
- **Where:** DesktopHeader.tsx:54
- **Fix:** Use auth context isMusician

### Q-003 | Role Label Typo
- **Where:** MobileMenuDrawer.tsx:43-50
- **Issue:** Includes 'leader' (should be 'band_leader')
- **Fix:** Remove entry

### Q-004 | Large Files (>600 LOC)
- **Where:** print-pipeline.ts (760), SetlistEditorV2.tsx (757), use-setlist-logic.ts (746), MusicianPicker.tsx (611), ChatPanel.tsx (549)
- **Fix:** Split into focused modules

### Q-005 | Inconsistent Null Checks
- **Where:** Various
- **Fix:** Standardize on optional chaining

### Q-006 | No Centralized Error Logging
- **Where:** error-boundary.tsx
- **Fix:** Add telemetry integration

### Q-007 | Inconsistent Error Handling
- **Where:** Various
- **Fix:** Create handleAsyncError() helper

### Q-008 | Unvalidated Chat Command Payload
- **Where:** ChatPanel.tsx:50
- **Fix:** Use Zod validation

### Q-009 | No Strict Null Checks
- **Where:** Role checks throughout
- **Fix:** Enable strictNullChecks or add guards

### Q-010 | Silent Failure on Profile Creation
- **Where:** auth-context.tsx:176
- **Fix:** Add retry logic

---

## Duplication Issues (5)

### X-001 | Role Commands String Literals
- **Where:** ChatPanel.tsx:20-22
- **Fix:** Move to /lib/chat-commands.ts

### X-002 | getInstrumentLabel Duplicated
- **Where:** MusicianPicker.tsx & PrintModal.tsx
- **Fix:** Export from /lib/musician-profile.ts

### X-003 | Role Label Duplication
- **Where:** /lib/roles.ts, MobileMenuDrawer.tsx, components
- **Fix:** Create ROLE_LABEL_MAP

### X-004 | handleClickOutside Pattern
- **Where:** DesktopHeader.tsx & MusicianPicker.tsx
- **Fix:** Create useClickOutside() hook

### X-005 | Instrument Resolution Scattered
- **Where:** Multiple files
- **Fix:** Centralize in /lib/musician-profile.ts

---

## Dead Code Issues (3)

### D-001 | build-info.json Import
- **Where:** MobileMenuDrawer.tsx, SetlistDashboard.tsx
- **Fix:** Lazy-load or fetch dynamically

### D-002 | Commented-Out Code
- **Where:** setlist-firebase.ts (old)
- **Fix:** Remove or archive

### D-003 | Unused Exports
- **Where:** liturgical-templates.ts, notification-store.ts (15+ exports each)
- **Fix:** Run unimported tool

---

## No Major Issues Found

✓ No untyped event handlers (e: any)  
✓ No N+1 Firestore reads (chunking used)  
✓ No subscription leaks (cleanup present)  
✓ No missing useMemo on context (auth-context memoized)  
✓ No large JSON to bundle  
✓ No global listeners without cleanup  

---

**Total:** 36 issues | Recommend: Start with Q-004 (split files), then P-001/X-003 (consolidate logic)
