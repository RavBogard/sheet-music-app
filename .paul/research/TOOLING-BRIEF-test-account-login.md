# Tooling brief — loginable test accounts (blocks stress-test browser run)

**For:** Claude Code, small standalone plan (quick-fix/standard scope).
**Origin:** Stress-test run 1 (2026-06-10), `## INCOMPLETE` item 3 — MCP
`create_test_account` mints Firebase Auth accounts `disabled:true`, so
browser-side persona testing (UI login as test-member / test-musician /
test-musician-bus) is impossible. Report: `.paul/research/STRESS-TEST-REPORT-2026-06-10.md`.

## Requirement

`create_test_account` gains an **opt-in** `loginable: true` option:

- Mints the account **enabled** with a generated strong password, returned
  exactly once in the tool response (never readable again).
- Roles limited to `member` / `musician` / `band_leader` — a loginable test
  account can NEVER be `admin`.
- Short TTL (default 24h) with auto-disable on expiry.
- `revoke_test_account` and `cleanup_all_test_data` fully clean loginable
  accounts AND everything they created (note: run 1's BUG-1 suggests library
  uploads may already escape the cleanup cascade — do not widen that gap;
  verify-first whether the sweep covers uploads by test accounts).
- Accounts remain `isTest` and must never appear in publish audiences or
  consumer-facing people lists (ACCESS-POLICY invariant 5).
- Default behavior without the flag is unchanged (`disabled:true`).

## Acceptance criteria

- Given `create_test_account({role:"musician", loginable:true})`,
  When I open the login page and use the returned credentials,
  Then I am signed in with role `musician` and normal consumer access.
- Given the same account after `revoke_test_account` (or TTL expiry),
  When I attempt the same login, Then it fails cleanly.
- Given `create_test_account({role:"admin", loginable:true})`,
  Then the tool refuses with a structured error.
- Given `cleanup_all_test_data` after a loginable account created content,
  Then no artifact of that account remains (account, tokens, setlists, uploads).

## Out of scope

Everything else from the stress test (BUG-1/2/3, browser findings, D8 notify
redesign). This is tooling-only so the stress-test browser run can proceed.
