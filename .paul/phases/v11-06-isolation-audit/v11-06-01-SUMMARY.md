---
phase: v11-06-isolation-audit
plan: 01
status: complete
loop: APPLY done → UNIFY pending
date: 2026-06-09
---

# v11-06-01 SUMMARY — Rules-layer isolation audit + leadHistory deferral close

## Result: BOTH TASKS PASS

The rules-layer axis of the cross-tenant isolation close gate is complete. The last
known deferred cross-tenant read is closed, and the Firestore rules now wall the
client-readable v11-05 collections. Two real findings fixed; two collections
characterized as application-only (recorded below).

## Task 1 — leadHistory tenant-scoped (closes the v11-05-04 deferral) — PASS

`getCongregationContext` now passes the caller `org` to `getAllSetlists`, so
`leadHistory` is tenant-scoped (a BL author sees BL services, not CRC's).
- Crc-safe: v11-01-03's backfill stamped every CRC setlist `orgId='crc'`, and the
  `(orgId,date)` index backs the equality-filter + orderBy pair.
- File: `src/lib/mcp/tools/congregation.ts` (one-arg change; stale DEFERRED comment replaced).
- Test: `mcp-congregation-context.emulator.test.ts` — seed helper now stamps `orgId`
  (prod reality), +2 cross-tenant cases (BL sees only BL; CRC sees only CRC, BL invisible).
- **Verify:** congregation-context emulator **11/11** (was 9); tsc 0. AC-1 ✓.

## Task 2 — adversarial cross-tenant rules audit + harden — PASS

Extended `firestore-rules-orgscope.emulator.test.ts` with a `v11-06-01 cross-tenant
isolation` block over the four v11-05 collections. New `orgReadOk(res)` read-isolation
helper (mirrors orgCreateOk/orgUpdateOk; orgId-absent → crc-safe; admins exempt).

### Per-collection enforcement-layer findings (→ feeds v11-06-03 AUDIT.md)

| Collection | Client read path? | Enforcement before | Action | After |
|---|---|---|---|---|
| `scheduling_assignments` | **YES** — `subscribeToAllUpcomingAssignments` (leader-facing) | band_leader read NOT org-scoped (app-layer filter only) | **HARDENED**: read = own-musicianUid OR (band_leader && orgReadOk) | RULES-walled; BL leader cannot read CRC; musician reads own; crc-safe |
| `scheduling_history` | web API (server) | band_leader read NOT org-scoped | **HARDENED**: read = band_leader && orgReadOk (defense-in-depth + future-proof) | RULES-walled (orgId-absent rows still readable until history-write stamps orgId — residual, crc-safe) |
| `config/congregation__{org}` | **YES** — client `onSnapshot` (congregation-store) | **DENY-by-default** (no matching rule → BL branding read blocked) | **FIXED**: guarded wildcard `/config/{doc}` (regex `congregation__[a-z0-9-]+`) → signed-in read, admin write | Per-tenant branding client-readable; admins doc stays write:false (no wildcard regression) |
| `setlistTemplates` | NO (MCP/admin-SDK authoring surface) | role-gated (band_leader/admin), not org-scoped at rules; app-layer scoped (v11-05-01) | CHARACTERIZE (no client path) | App-only. **Residual recommendation:** add orgReadOk for defense-in-depth if a client read path ever lands. |
| `users` | leader picker (server) | band_leader reads all; user doc carries **no orgId** (membership = auth claim, v11-05-02) | CHARACTERIZE (rules cannot field-scope) | App-only by design (claim-based filter). Accepted architectural residual. |

- **Verify:** rules-orgscope emulator **19/19** (was 11; +8); rules **compiled + deployed** to
  `crcmusiccharts` (prod); tsc 0. AC-2, AC-3, AC-4 ✓.

## Quality floor

- `npx tsc --noEmit`: **0 errors**
- Full emulator suite (`test:emulator`): **71/71 files, 934/934 tests** green
- Non-emulator unit suite (`npm test`): **3321 passed, 80 skipped, 0 failed**
- `firebase deploy --only firestore:rules`: **compiled successfully + released** to prod
- `next build`: NOT required — congregation.ts is server-only (imported solely by
  `mcp/tools/index.ts`; no `use client` under `src/lib/mcp`); bundle-boundary rule not triggered.

## DEVIATIONS — 3 pre-existing stale emulator tests fixed (verified via git stash)

Running the **full** emulator suite (the close-gate gate) surfaced 3 red tests that were
stale from earlier v11 slices and never updated. **Confirmed pre-existing by stashing my
changes and re-running at the origin/master baseline** — NOT v11-06-01 regressions. Product
behavior was correct; the tests lagged. Fixed to restore the green gate:

1. `mcp-mint-admin-bearer.emulator.test.ts` ×2 — `verifyBearer` returns `orgId` since
   v11-02-01; two `toEqual` assertions never added it. Added `orgId: "crc"` (default).
2. `org-scope-writes.emulator.test.ts` — `clone_setlist_from_template` AC seeded a
   no-orgId template; v11-05-01 org-scoped template reads, so a BL caller couldn't see it.
   Seeded the template `orgId: BL` (matches the AC's BL-clone intent).

These are outside v11-06-01's planned files but were necessary to certify a green
emulator suite for the close gate; logged here for UNIFY reconciliation.

## Files modified
- `src/lib/mcp/tools/congregation.ts`
- `firestore.rules` (+orgReadOk; scheduling_assignments + scheduling_history read scope; per-org congregation wildcard)
- `src/lib/mcp/__tests__/mcp-congregation-context.emulator.test.ts`
- `src/lib/org/__tests__/firestore-rules-orgscope.emulator.test.ts`
- `src/lib/mcp/__tests__/mcp-mint-admin-bearer.emulator.test.ts` (deviation fix)
- `src/lib/mcp/__tests__/org-scope-writes.emulator.test.ts` (deviation fix)

## Carries to v11-06-02 / v11-06-03
- v11-06-02: MCP org-scope-escape + host-spoof (x-org-id forgery vs bearer-orgId authority).
- v11-06-03 AUDIT.md: fold in the enforcement-layer table above; the two residuals
  (setlistTemplates defense-in-depth; scheduling_history orgId-absent rows) go in the
  residual-risk register.
