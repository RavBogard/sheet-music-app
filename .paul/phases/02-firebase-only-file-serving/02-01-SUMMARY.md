---
phase: 02-firebase-only-file-serving
plan: 01
status: complete
---

# Plan 02-01 Summary: Firebase Storage-Only File Serving

## What Was Done

### Task 1: Remove MAX_COPIES_PER_RUN Cap
- Removed the 20-file-per-sync cap from sync-engine.ts
- Added 200ms pacing between Storage uploads to be gentle on quotas
- Added log line showing total files to copy at start of copy phase
- Updated test to verify all files are copied (was testing for 20 cap)

### Task 2: Make file-fetcher Storage-Only
- Removed entire Drive fallback block from fetchFileById
- Removed DriveClient import and EXPORTABLE_GOOGLE_TYPES constant
- Function now returns null if file not in Storage (with helpful log suggesting sync)
- Reduced from 84 lines to 40 lines

### Task 3: Fix PDF Health Scanner
- Added 1100ms delay between file scans (stays under 60 req/min rate limit)
- With Storage-only serving, Drive API 429s are eliminated entirely
- ~180 PDFs now scan in ~3.3 minutes instead of failing with 429s

### Task 4: Update Sync Card
- Shows "Copied to Storage: N" count when files were copied
- Shows warning when copy errors occur ("N files failed to copy")

### Bonus: Simplified File Proxy Cache Headers
- Removed conditional cache header logic (was Storage vs Drive)
- Always uses long cache since source is always Storage

## Verification
- `npm run build`: PASS
- `npx vitest run`: 647/648 pass (1 pre-existing failure: route-auth.test.ts)
- No new test failures

## Commits
- cdb5df9: feat: Firebase Storage-only file serving, remove Drive fallback

## Acceptance Criteria
- [x] AC-1: All files in Storage — sync engine copies all files per run (no cap)
- [x] AC-2: Storage-only serving — file-fetcher has no Drive fallback, returns 404 if not in Storage
- [x] AC-3: Health scanner fixed — 1100ms pacing + no Drive calls = no 429s
- [x] AC-4: Build and tests pass

## Note
After deploying, a full sync should be triggered from the admin panel to ensure all files are copied to Storage. Any files not yet in Storage will return 404 until synced.
