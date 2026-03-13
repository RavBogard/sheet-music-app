# Plan 15: Unauthorized Redirect UX Audit

**Phase:** 15 - Unauthorized Redirect UX Audit
**Status:** Ready to execute

## Goal
Scan the entire codebase for aggressive "bounce outs" (`redirect('/setlists')`, `redirect('/')`) and replace them with intelligent, graceful downgrades to read-only views where appropriate.

## Requirements
- ✓ Review `src/proxy.ts` to ensure unauthenticated users trying to access secure routes are handled gracefully (e.g. they hit `/login`, but do we need a `?returnTo` parameter? — Out of scope for this specific request, but worth checking).
- ✓ Review Server Components using `getServerUser()`.
- ✓ Identify instances of `redirect()` and determine if a "closer" view exists.

## Proposed Changes

### 1. Codebase Scan
- **Task**: Search for `redirect(`/setlists`)` or `redirect(`/`)`.
- **Action**: Use `grep_search` to find all instances.

### 2. Analysis & Mitigation
- **Task**: For each instance, evaluate the context.
- **Action**: If a Band Leader tries to access `/admin`, `/manage` is the correct downgrade (already implemented in `proxy.ts`).
- **Action**: If a user hits `/setlists/[id]` without edit access, they go to `/perform/setlist/[id]` (Implemented).
- **Action**: Are there any other similar paired routes? (e.g. `/manage/templates/[id]` vs a read-only template view? We don't have read-only templates. `/monitor/[id]`? We just have `/monitor`).

## Verification Criteria
- [ ] Comprehensive scan completed.
- [ ] Findings reported and fixed if applicable.

---
*Plan: 15-PLAN*
*Phase: 15-unauthorized-redirect-audit*