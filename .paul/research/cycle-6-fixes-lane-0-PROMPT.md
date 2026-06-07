# Cycle-6-fixes Lane 0 — MCP test-tooling schema additions (unblocks future cowork)

> **Coder lane prompt** — not a cowork instance prompt. Single focused
> code lane. Multi-commit OK if logically separable; single commit
> preferred for SHIP-NOTICE atomicity.
>
> **Part of cycle-6-fixes Wave A** (3 parallel lanes: 0 / 1 / 4).
> Siblings: Lane 1 (gig-packet fix), Lane 4 (npm audit). Coder-X
> handles this lane.

---

## §0 — Identity, branch, scope

**Lane:** `cycle6-fixes-lane-0-mcp-tooling`
**Branch:** `feat/cycle6-fixes-0-tooling` (cut from current `origin/master` at lane start)
**Output:** master push when SHIP-NOTICE acceptable. Single push preferred (multi-commit narrow lane OK per `.coord/shared/master-tip.md` cherry-pick caveat).

**DRIVER_BEARER (admin, for MCP testing):**
```
crl_live_d580c63d519f85de29c0c7b795c29a9eecef955f140792d636183f916541137b
```
Burn at lane end. Never echo.

**Scope:** ship the MCP test-tooling additions cycle-6 cowork discovered missing. This lane UNBLOCKS future cowork waves (currently impossible to run parallel-safe due to schema gaps).

**SHIP-NOTICE protocol (Daniel-ratified 2026-05-19 — non-negotiable):** when filing the SHIP-NOTICE in `inbox/supervisor.md` (or `inbox/auditor.md` if CC'd), include a `## Repros` section pasting each REPRO block from §6 below verbatim. Without it, auditor BLOCK-TEARDOWNs the verdict per AUDITOR.md §Validation workflow.

---

## §1 — Tasks (5 sub-tasks)

### 1a — Add `uidPrefix` to `create_test_account` schema

**File:** `src/lib/mcp/tools/test-tokens.ts`

**Edit createTestAccountSchema (around line 644):** add a `uidPrefix` field:
```typescript
uidPrefix: z
    .string()
    .min(1)
    .max(8)
    .regex(/^[a-zA-Z0-9]+$/)
    .optional()
    .describe(
        "Short alphanumeric prefix (≤8 chars) for the test uid. When provided, uid becomes `test-<uidPrefix>-<role>-<8hex>` instead of `test-<role>-<8hex>`. Use this to namespace test fixtures per cowork instance per `[[feedback_sandbox_test_isolation]]`."
    ),
```

**Thread through `provisionTestAccount` (line 134):** when `args.uidPrefix` is present, the generated uid must be `test-<prefix>-<role>-<8hex>`. Find the uid construction (probably uses `randomBytes(4).toString("hex")` or similar) and inject the prefix.

**Regression test:** add to `src/lib/mcp/__tests__/mcp-test-tokens.emulator.test.ts` (or new file if pattern requires). Mint with `uidPrefix:'TEST'`; assert uid matches `/^test-TEST-musician-[0-9a-f]{8}$/`.

### 1b — Add `prefix` to `cleanup_all_test_data` schema

**File:** `src/lib/mcp/tools/test-tokens.ts`

**Edit registration (around line 726):** change `inputSchema: {}` to:
```typescript
inputSchema: {
    prefix: z
        .string()
        .min(1)
        .max(16)
        .regex(/^test-[a-zA-Z0-9]+$/)
        .optional()
        .describe(
            "Restrict cleanup to test users whose uid starts with this prefix (e.g., 'test-6A' to clean only Instance A's fixtures). When omitted, walks all test-* users (nuclear default — preserves backward compatibility)."
        ),
},
```

**Thread through `cleanupAllTestDataCore`:** accept `prefix` arg; filter the walker's uid-startsWith check. When prefix is omitted, behavior is unchanged (walks everything).

**Regression test:** mint `test-AAA-musician-X` + `test-BBB-musician-Y`; call `cleanup_all_test_data({prefix:'test-AAA'})`; assert AAA gone, BBB survives. Add `[[feedback_self_inclusion_test_fixtures]]` self-inclusion test (caller in operand set).

### 1c — Ship `dump_collection_size` MCP tool (or remove from PARENT)

**File:** new — `src/lib/mcp/tools/dump-collection-size.ts` (or fold into `library.ts` if pattern requires).

**Tool signature:**
```typescript
"dump_collection_size",
inputSchema: {
    collectionName: z.string().min(1).max(64),
}
// Returns: { docCount, estimatedBytes, oldestTimestamp, newestTimestamp }
```

**Implementation:** admin Firestore SDK + `collection().count().get()` for docCount, sample N docs for byte estimate, query first + last by creation timestamp. Admin-only gate (NOT band_leader — this is observability for ops).

**Register in `src/lib/mcp/tools/index.ts`** alongside existing tool registrations.

**Decision point:** if implementing now is too expensive, REMOVE the `dump_collection_size` reference from `.paul/research/cycle-6-cowork-PARENT.md` §6.A and update `[[project_mcp_status]]` memory. Coder picks based on effort estimate.

### 1d — Ship `list_service_personnel` MCP tool (or remove from PARENT)

**File:** new — `src/lib/mcp/tools/service-personnel.ts` (or fold into `setlists.ts`).

**Tool signature:**
```typescript
"list_service_personnel",
inputSchema: {
    setlistId: z.string().min(1),
}
// Returns: { matched_setlists, grouped_assignments, distinct_vocal_leads }
```

**Implementation:** query `scheduling_assignments` for the setlistId, group by musician, surface vocal_leads (per `[[feedback_terminology]]` — "Vocal Lead" not "Lead"). band_leader-gated.

**Same decision point as 1c** — if effort is too high, remove from PARENT instead. Coder picks.

### 1e — Decide harness scripts/ ship location

**Current state:** `sheet-music-app/cycle-4/harness/` ships only `lib/probe.mjs` at master. `scripts/` (probe-batch.mjs, aggregate.py, install-harness.sh, runAxe.mjs) lives only in `sheet-music-app-auditor-validation/cycle-4/harness/scripts/`.

**Decision:** copy `scripts/` from auditor-validation worktree into `sheet-music-app/cycle-4/harness/scripts/` and commit; future cowork sandboxes inherit. (Alternative: update `[[feedback_cowork_real_harness]]` to say "scripts live only in auditor-validation worktree, not in main repo" — but that's brittle for cowork sandboxes.) Default recommendation: ship to main repo.

### Acceptance check across all 5 tasks
- `npm run test:emulator` stays green (44 files / 603 tests / 0 failures baseline)
- `next build --webpack` clean
- New regression tests for 1a + 1b PASS

---

## §2 — Hard boundaries
- DO NOT touch `bridge/**` (CRIT-003 deferred).
- DO NOT touch `src/lib/mcp/__tests__/*` outside scope (only add new tests for 1a+1b).
- DO NOT silently downgrade `cleanup_all_test_data` default behavior (prefix omitted = nuclear walk, unchanged).
- DO NOT bake the bearer into any committed file.
- DO NOT push without filing a SHIP-NOTICE with `## Repros` (auditor BLOCKs without it).

---

## §3 — Prerequisites handshake (lightweight)

Before P1:
- `cd sheet-music-app && git fetch origin && git checkout -b feat/cycle6-fixes-0-tooling origin/master` — branch cut from current master.
- `npm install` + `npm run test:emulator` once to confirm green baseline.
- Read `src/lib/mcp/tools/test-tokens.ts` end-to-end before editing (the file has dense Zod + Admin SDK; tracing is required).

---

## §4 — Phases
- **P0** — branch + baseline tests green
- **P1** — 1a + 1b (test-tokens.ts edits + tests)
- **P2** — 1c + 1d (new tools OR PARENT removal)
- **P3** — 1e (harness scripts decision + commit if shipping)
- **P4** — full suite + build clean; SHIP-NOTICE prep

---

## §5 — Standing rules
- Rich-error envelope per cycle-3 sweep (REG-001/002/003).
- Trusted-leader gate semantics intact per `[[feedback_admin_rate_limit_bypass]]`.
- F-05 dryRun-default unchanged.
- No `force:true` use outside explicit F-05 probes.
- Bearer never echoed in any artifact.
- Commit-message style: `feat(mcp): cycle-6-fixes Lane 0 — test-tooling unblock (uidPrefix, cleanup-prefix, [dump_collection_size, list_service_personnel, harness-scripts])`.

---

## §6 — Repros to paste in SHIP-NOTICE `## Repros` section

Copy these verbatim into the SHIP-NOTICE Body when filing:

```
### REPRO-L0-uidPrefix (cycle-6 dispatch META — test-isolation gap)
preconditions: production MCP, admin bearer
steps: tools/call create_test_account {role:'musician', uidPrefix:'6ZZ'}
expected: response uid matches /^test-6ZZ-musician-[0-9a-f]{8}$/
observed_pre_fix: response uid matches /^test-musician-[0-9a-f]{8}$/ (no uidPrefix segment)

### REPRO-L0-cleanup-prefix (cycle-6 dispatch META — cleanup-isolation gap)
preconditions: production MCP, admin bearer
steps:
  1. tools/call create_test_account {role:'musician', uidPrefix:'6ZZA'}
  2. tools/call create_test_account {role:'musician', uidPrefix:'6ZZB'}
  3. tools/call cleanup_all_test_data {prefix:'test-6ZZA'}
  4. tools/call list_test_accounts {includeExpired:true}
expected: list returns only the test-6ZZB-* user; test-6ZZA-* swept
observed_pre_fix: schema rejects prefix param (-32602) OR walker nukes both users

### REPRO-L0-dump-collection-size (if shipped per 1c)
preconditions: production MCP, admin bearer
steps: tools/call dump_collection_size {collectionName:'library_index'}
expected: response shape {docCount:<n>, estimatedBytes:<n>, oldestTimestamp:<iso>, newestTimestamp:<iso>}
observed_pre_fix: tool not found / -32601 error

### REPRO-L0-list-service-personnel (if shipped per 1d)
preconditions: production MCP, admin bearer, known setlistId with ≥1 assigned musician
steps: tools/call list_service_personnel {setlistId:<id>}
expected: response shape {matched_setlists:[...], grouped_assignments:[...], distinct_vocal_leads:[...]}
observed_pre_fix: tool not found / -32601

### REPRO-L0-harness-scripts (per 1e if shipping to main)
preconditions: fresh clone of master tip post-Lane-0 ship
steps: ls sheet-music-app/cycle-4/harness/scripts/
expected: probe-batch.mjs + aggregate.py + install-harness.sh + runAxe.mjs all present
observed_pre_fix: dir doesn't exist (only sheet-music-app/cycle-4/harness/lib/ ships)
```

If you skip 1c, 1d, or 1e per the decision points, OMIT the corresponding REPRO block and note the skip + rationale in the SHIP-NOTICE Body.

---

## §7 — Go signal

1. Acknowledge receipt + start P0.
2. Branch cut + baseline green.
3. P1 → P4 in order.
4. File SHIP-NOTICE with `## Repros`.
5. Worktree teardown after auditor ACCEPT + Daniel go-ahead.

Daniel can walk away after P0 confirmation; auditor verdict + Daniel teardown handle the back end.

Go.
