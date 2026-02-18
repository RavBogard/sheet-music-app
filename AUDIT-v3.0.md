# Audit Report v3.0 — Final Sweep Complete

**Date:** 2026-02-18
**Scope:** All bugs from v2.2 audit + roadmap features + new bug scan

## Build Health

| Check | Status |
|-------|--------|
| TypeScript (`tsc --noEmit`) | ✅ 0 errors |
| Tests (Vitest) | ✅ 22 files, 361 tests passing |
| ESLint | ✅ 0 errors, 3 warnings (boilerplate) |
| Dead code | ✅ Cleaned |

## Bugs Fixed This Session

### Critical (2)
| ID | Bug | Fix |
|----|-----|-----|
| FRESH-6 | Rabbi missing from `createSetlist` | Added `rabbi: rab` to create path |
| FRESH-7 | Rabbi clearing doesn't persist (`rab \|\| undefined`) | Changed to `rabbi: rab` (allows empty string) |

### Medium (7)
| ID | Bug | Fix |
|----|-----|-----|
| FRESH-3 | KeyPicker stale quality + case normalization | Added `useEffect` sync + `toUpperCase` normalization |
| FRESH-4 | DividerRow grip invisible on mobile | Removed `opacity-0 group-hover:opacity-100` |
| FRESH-5 | CalendarView ignores search/rabbi filters | Changed to `displayedSetlists` |
| FRESH-8 | Dead `onSetDate` prop in OverflowMenu | Removed from interface |
| NEW-6 | Manual `getIdToken()` scattered across 4 components | Migrated 31 calls to `apiFetch()` utility |
| — | Pre-existing TS2554 errors (chord-cache callers) | Fixed callers + rewrote test file for `apiFetch` mock |
| — | `onTap` required but conditionally undefined in select mode | Made optional in DividerRow, FlowRow, SongRow |

### Low (2)
| ID | Bug | Fix |
|----|-----|-----|
| FRESH-2 | Dead `deleteRef` in SwipeToDelete | Removed ref + `useRef` import |
| FRESH-9/NEW-5 | 3 dead files in `editor/` folder | Deleted `useDigitize.ts`, `useMetronome.ts`, `useMetronome.test.ts` |

## Previously Implemented (confirmed working)
| Item | Status |
|------|--------|
| FRESH-1: Swipe vs drag conflict | ✅ `useDndContext` guard |
| NEW-1: Undo toast on delete | ✅ 5s toast with undo callback |
| NEW-2: Track sheet auto-close | ✅ Implemented |
| NEW-3: CORS wildcard | ✅ `getAllowedOrigin()` allowlist |
| NEW-4: Rate limiting | ✅ `checkRateLimit()` on all API routes |
| UX-3: Batch multi-select | ✅ Select mode + BatchActionBar |
| ARCH-4: Firestore indexes | ✅ 3 composite indexes defined |
| ARCH-6: Streaming chat | ✅ SSE with `generateContentStream` + progressive UI |

## Excluded (per request)
| Item | Reason |
|------|--------|
| UX-4: Keyboard shortcuts | Daniel requested exclusion |

## Remaining Known Issues
| Issue | Severity | Notes |
|-------|----------|-------|
| PDFViewer uses raw `getIdToken()` | Info | Legitimate — react-pdf needs raw token for `httpHeaders` config |
| 3 ESLint warnings | Info | Unused `error` params in Next.js error boundaries (boilerplate) |

## Commits (this session)
1. `fix: 3 critical data bugs — rabbi persistence, create path, KeyPicker sync`
2. `fix: 6 quick fixes — DividerRow grip, calendar filters, dead code cleanup`
3. `refactor: migrate 31 manual auth fetches to apiFetch utility`
