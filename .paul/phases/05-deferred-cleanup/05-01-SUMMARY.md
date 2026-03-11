# Plan 05-01 Summary: Deferred Cleanup Batch

## What Was Done

### Task 1: Delete test-gemini endpoint
- Removed `src/app/api/test-gemini/route.ts` — debug endpoint that was deployed to production

### Task 2: Fix ESLint 9 config
- Added explicit `eslint-plugin-react-hooks` import in `eslint.config.mjs`
- `npm run lint` now passes clean

### Task 3: Remove legacy 'leader' role (LOW-004)
- Verified 0 Firestore users have role='leader' — safe to remove
- Removed 'leader' from `UserRole` type and `ROLE_HIERARCHY` in `src/lib/roles.ts`
- Removed backward-compat checks from `api-auth.ts`, `server-auth.ts`, `middleware.ts`
- Removed 'leader' from Firestore queries in `email-packets`, `notification-store`, `push/send`
- Removed from UI components: `UserRow`, `PeopleSection`, `MusicianPicker`
- Removed from `set-role` zod schema and `bridge/setup-code` role check
- Removed from `firestore.rules`
- Updated role tests (removed 3 leader-specific assertions)

## Verification
- TypeScript: ✅ Compiles clean
- Tests: ✅ 657/657 passing
- Lint: ✅ `npm run lint` passes
- Zero 'leader' role references remain in codebase: ✅ Confirmed via grep

## Commit
`e9fd2a6` — chore(cleanup): remove test-gemini endpoint, fix ESLint 9, remove legacy 'leader' role
