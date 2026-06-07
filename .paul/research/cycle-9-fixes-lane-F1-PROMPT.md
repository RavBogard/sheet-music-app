# Cycle-9-fixes — Lane F1 (MCP gate/envelope/security + writer-isTest)

**You are coder-1.** Sign `from coder-1`.
**Anchor:** branch off `origin/master` @ current tip `552e79aa1` (hardening A+B
already landed) in a FRESH `git worktree` (`sheet-music-app-cycle9-fixes-f1/`).
NOT the canonical checkout (stale branch). Your old cycle-8-fixes worktree stays
held for teardown — leave it.
**Bearer:** pool row `ASSIGNMENT=cycle-9-fixes-f1`. Mark `burned` on SHIP.
**Tier:** Tier-1 (real src + deployed verify). Deployed REPROs required.
**Source of truth:** `.paul/research/cycle-9-sweep-TRIAGE.md` §1/§2/§6.

---

## Mission — 5 tasks, security first

### Task 1 — C9I5-001: `dedupe_library` has NO role gate  `[HIGH · PRIORITY-1 security]`
A musician/member can call `dedupe_library({dryRun:false})` and mark
`library_index` rows `duplicate` + mirror into `songs/{id}`. Every OTHER admin
hygiene tool gates correctly — this is a singular omission.
- Registration ~`src/lib/mcp/tools/index.ts:1032`; handler ~`src/lib/mcp/tools/library.ts:688` (verify line refs at your branch).
- Wrap with the SAME admin role guard the rest of the admin-hygiene family uses (rich `forbidden_role` 403 per `[[feedback_mcp_validation_shape]]`).
- REPRO: musician + member bearers → `forbidden_role`; admin → still works.

### Task 2 — C9I5-003 / C8I2-006: machine_code standardize
4 test-tokens tools emit a bare `forbidden` machine_code instead of the standard
rich `forbidden_role` envelope. Standardize them on `forbidden_role` (match the
17 tools that already do). REPRO: each emits the rich envelope shape.

### Task 3 — C9I5-002 / C8I1-001: cascade-dead audit view
`list_minted_bearers` shows children of a revoked root as `status:'active'`
(verifyBearer DOES reject them on use — this is the audit VIEW only). Derive a
`parent_revoked` (or `revoked`) status when `parentTokenId` points at a
revoked/missing/expired root — one parent-read per row, or a join. File:
`src/lib/mcp/tools/mint-admin-bearer.ts`. REPRO: a child of a revoked root shows
the derived dead status (you can use a short-TTL mint + revoke to set this up).

### Task 4 — C9I4-007: monitor `get_mix` wrong HTTP code
SE-with-no-bus calling `get_mix()` returns HTTP 500 `monitor_no_bus_assigned`
for what is really a 400 (client-precondition, not server error). File:
`src/lib/mcp/tools/monitor.ts`. Fix the status code; keep the machine_code.
REPRO: SE-no-bus `get_mix` → 400.

### Task 5 — §6.2: writer-side `isTest` stamp (hygiene)
`clone_setlist` + `create_setlist` don't carry `isTest:true`, so admin-owned or
test-named fixtures (a) escape `cleanup_all_test_data` uidPrefix sweep AND (b)
leak into the PUBLIC `/perform` listing (cross-confirmed C9I1-008 + C9I2-003 +
i5). Stamp `isTest:true` when the source setlist was `isTest` OR the name matches
`^(c9i\d+|test)-` / `-CLONE-` regardless of owner uid. Files:
`src/lib/mcp/tools/clone-setlist.ts`, `src/lib/mcp/tools/setlist-write.ts`
(create_setlist name heuristic). REPRO: clone a test-named setlist → new doc has
`isTest:true` + does NOT appear in unauth `/perform`; `cleanup_all_test_data`
sweeps it.

---

## Coordination

- **Shared file with Lane F2: `src/lib/mcp/tools/library.ts`.** You touch the
  `dedupe_library` handler region (~688); F2 touches the `searchLibrary`
  projection region. Different functions — claim YOUR region in
  `.coord/shared/claims.md` + drop a HEADS-UP to `inbox/coder-2.md`. Trivial
  3-way merge; if origin diverges, cherry-pick onto fresh origin/master (narrow-
  lane caveat in `master-tip.md`).
- Everything else in F1 is F1-exclusive.

## Hard rules

Do NOT touch `bridge/**`, repo-root `mcp/`, `SetlistGrid.tsx`,
`src/lib/mcp/errors.ts`, `src/lib/mcp/error-envelopes.ts` (use `richError()`,
don't edit the factory).

## Gates before SHIP

1. `npm run test:emulator` green (incl. any new gate/cascade tests you add).
2. `next build --webpack` clean.
3. Push to master (Vercel auto-deploy).
4. Deployed-surface REPROs (paste transcripts): dedupe role gate (musician+member
   → forbidden_role), machine_code standard shape, cascade-dead derived status,
   monitor get_mix 400, clone isTest stamp + cleanup sweep + public-listing absence.

## SHIP protocol

1. Clean commits. Push to `origin master` (NOT `master:main`).
2. OVERWRITE `.coord/shared/master-tip.md` with the new SHA.
3. SHIP-NOTICE to `inbox/supervisor.md` (`from coder-1`) with REPRO transcripts.
4. Mark bearer row `burned`. Hold worktree for auditor ACCEPT + supervisor teardown.

### ACK
Append `msg-from-coder-1-cycle9-F1-ack` to `inbox/supervisor.md` after worktree
setup + branch cut + read + the library.ts claim/HEADS-UP. Then start with Task 1.
