# Cycle-7-fixes Lane 1 — Test-isolation hardening

**Read order:** `.coord/CODER.md` → `.coord/README.md` → `.coord/shared/master-tip.md` → `.coord/shared/decisions.md` → `.coord/shared/claims.md` → **`.paul/research/cycle-7-TRIAGE.md`** (especially §1 Convergence A + C) → THIS FILE.

**Role:** IMPLEMENTER. Cut a branch, ship code, push to master. Standard CODER.md §Worktree-setup applies.

**Bearer:** admin `crl_live_*` from pool row `ASSIGNMENT=cycle-7-fixes-lane-1`.

**Wall-clock budget:** ~120 min (heaviest lane).

**Branch:** `feat/cycle-7-fixes-1-test-isolation`
**Worktree:** `sheet-music-app-cycle-7-fixes-1-test-isolation/`
**Cut from:** origin/master tip (`59b25c87a` or newer if sibling lanes have already FF-pushed).

---

## §0 — Mission

Close the two test-isolation convergences from cycle-7:

**Convergence A — `isTest` structural gap** (3 instances surfaced it):
- C7I1-008 HIGH: `publish_setlist` derives audience to REAL 18-human production band when caller is a test-* uid with isTest:true setlist.
- C7I3-002 MED: `publish_setlist` dryRun by band_leader non-owner sees same 18 real emails.
- Instance 5 headline: public `/perform` shows test setlists with mojibake titles to anyone visiting the homepage.

**Root cause:** `isTest` is an opt-in **flag** set at create-time. Filters that should isolate test data (display + publish audience derivation) check the flag, but the flag isn't always set when test-* uids create things (especially after C7I1-014's cleanup-cascade gap leaves orphans).

**Fix:** derive isTest-ness from **caller-uid shape**, not from a flag.

**Convergence C — Cleanup cascade gap** (3 instances surfaced it):
- C7I1-014 MED: orphan setlist `841df759-0dba-4b50-958d-f17cfb2894e1` survived `cleanup_all_test_data` because owner uid was already deleted.
- C7I3-007 MED: templates not cascade-cleaned by `cleanup_all_test_data`.
- Instance 5 observation: cleanup swept 1 setlist + 8 tracks + 1 mcpToken from a PRIOR c7i5-prefixed run (across-cycle leak).

**Fix:** `cleanup_all_test_data({prefix})` must enumerate + delete across all dependent collections; admin-bypass path for already-orphaned setlists.

---

## §1 — Scope (Convergence A — `isTestUid()` derivation)

**New helper file** `src/lib/test-isolation.ts`:

```typescript
const TEST_UID_PREFIXES = /^(test-|c\d+i\d+[a-z]?-|cf\d+-)/

export function isTestUid(uid: string | null | undefined): boolean {
  if (!uid) return false
  return TEST_UID_PREFIXES.test(uid)
}
```

Add **emulator + unit test coverage** at `src/lib/__tests__/test-isolation.test.ts`. Test cases: real prod uid (e.g. Daniel's `firebase-auth-...`) → false; `test-foo-bar` → true; `c7i1-band_leader-abc` → true; `c7i3a-...` → true; `cf2-...` → true; empty/null/undefined → false; uid that contains but doesn't START with a test prefix → false.

**Wire `isTestUid()` into every isTest-conditioned path.** Audit via:
```bash
git grep -nE "isTest|is_test" src/ | grep -v __tests__
```

Known load-bearing call sites (verify; this list is from supervisor pre-flight + may be incomplete):
1. `src/components/performance/PublicSetlistListing.tsx` — the `/perform` public list filter. Change `setlist.isTest === true` check to ALSO exclude if `isTestUid(setlist.ownerId)` is true. This is the Instance 5 headline fix.
2. `src/lib/setlist-write.ts` — wherever audience derivation runs for `publish_setlist`. The fanout step must filter out recipients where `isTestUid(uid)` AND must also short-circuit the entire publish if `isTestUid(ownerId)` is true (so even an explicit `recipients:[<real-uid>]` from a test-owner caller can't publish to real humans — this is the C7I1-008 fix).
3. `src/lib/mcp/tools/setlists.ts` and `src/lib/mcp/tools/setlist-hygiene.ts` — verify isTest filters here propagate uid-shape derivation too.

**Backward compat:** existing `isTest:true` flag on setlists STAYS authoritative (don't break existing test data). New rule is: a setlist is test-isolated if `isTest === true` OR `isTestUid(ownerId) === true`. Either condition triggers all isolation behaviors.

**Acceptance for Convergence A:**
- `src/components/performance/PublicSetlistListing.tsx` no longer returns any setlist whose `ownerId` matches `TEST_UID_PREFIXES`, even if `isTest` flag is missing/false.
- `publish_setlist` called by a test-* uid REFUSES with rich envelope `{ok:false, error:{code:403, machine_code:'test_owner_cannot_publish_to_real_humans', ...}}` instead of proceeding with audience derivation to real humans.
- `publish_setlist {dryRun:true}` called by a band_leader test session on a real-owner setlist still works (dryRun is observability per `[[feedback_dryrun_is_observability]]`), BUT real-publish refuses with `cross_owner_publish_forbidden` or similar.

---

## §2 — Scope (Convergence C — cleanup cascade hardening)

**Extend `cleanup_all_test_data({prefix})`** in `src/lib/mcp/tools/test-tokens.ts` (or wherever the tool lives — verify) to enumerate + delete across:
- ✅ Already swept: `users`, `mcpTokens`, possibly `library_index`.
- ❌ Currently missing: `setlists` where `ownerId` startsWith `prefix-`; `setlistTemplates` where `ownerUid` startsWith `prefix-`; `tracks` where parent `setlistId` belongs to a swept setlist.

**Two-pass cleanup:**
- Pass 1: enumerate `users` matching prefix → collect uid list.
- Pass 2: for each uid in list, sweep `setlists`, `setlistTemplates`, `mcpTokens`, dependent `tracks`, then delete user.

**Admin-bypass for orphans:** add a separate MCP tool `sweep_orphan_test_data({uidPattern?})` that enumerates setlists + templates whose owner uid matches the test-prefix regex AND whose owner user-record is already absent from `users`. Deletes them without ownership check. Admin-only.

**Acceptance for Convergence C:**
- `cleanup_all_test_data({prefix:'c7iX'})` after a representative test workflow leaves zero residual setlists, templates, tracks, mcpTokens with `c7iX-*` ownerships.
- `sweep_orphan_test_data()` sweeps the C7I1-014 documented orphan `841df759-0dba-4b50-958d-f17cfb2894e1` (assuming the orphan still exists at lane-cut SHA; verify first via `get_setlist` or direct Firestore inspection).
- Emulator test coverage at `src/lib/mcp/__tests__/mcp-test-tokens.emulator.test.ts` extends existing tests with cascade scenarios.

---

## §3 — REPROs (mandatory per ratified Decision 2)

Each acceptance criterion gets a `## Repros` block in your SHIP-NOTICE with `observed_pre_fix` (matches the cycle-7 HANDOFFs) AND `observed_post_fix` (your verification at the ship SHA). At least 4 REPROs:

- **REPRO-L1-public-perform-filter:** open `https://www.centralreform.live/perform` unauthed; observe no `c7i1-*`, `c7i5-*`, `c7iX-*` setlist titles in the rendered DOM (Instance 5 headline closed).
- **REPRO-L1-publish-test-owner-blocked:** mint c7l1-test band_leader; clone a setlist; `publish_setlist {setlistId}` (real publish, not dryRun) — expect rich envelope refusal, NOT a 200 with 18-recipient fanout.
- **REPRO-L1-publish-non-owner-still-readable-via-dryrun:** non-owner band_leader can still call `publish_setlist {dryRun:true}` on a real-owner setlist and see recipients (observability path holds per `[[feedback_dryrun_is_observability]]`).
- **REPRO-L1-cleanup-cascades:** create test fixtures via uidPrefix `c7l1`; run `cleanup_all_test_data({prefix:'c7l1'})`; verify via `list_setlists` + Firestore query that ZERO `c7l1-*` setlists/templates/tracks remain.
- **REPRO-L1-orphan-sweep:** if C7I1-014 orphan `841df759...` still exists at lane SHA, call `sweep_orphan_test_data` and verify it gets removed.

---

## §4 — Hard rules (per CODER.md + PARENT cycle-7)

- Don't touch `bridge/**`, repo-root `mcp/`, `SetlistGrid.tsx`, `src/lib/mcp/errors.ts`, `src/lib/mcp/error-envelopes.ts`.
- Claim shared files in `.coord/shared/claims.md` before editing. Likely contended: `src/lib/mcp/tools/test-tokens.ts`, `src/lib/mcp/tools/index.ts`. Use TTL `2h`.
- HEADS-UP sibling Lane 3 (chart-bond) before editing anything in `src/lib/setlist-write.ts` or `src/components/performance/*` — Lane 3 may touch the same files.
- Single commit FF-push when possible; multi-commit OK if narrow-lane caveat (`[[feedback_shared_worktree_race]]`) applies.

---

## §5 — HANDOFF requirements

SHIP-NOTICE msg `msg-from-coder-1-cycle7-fixes-1-ship` to `.coord/inbox/supervisor.md` with:
- Ship SHA + branch + commit summary
- Per-acceptance-criterion PASS/FAIL
- `## Repros` section with deployed-surface evidence per `[[feedback_mcp_lane_deployed_surface_evidence]]`
- Cleanup verification: zero residual `c7l1-*` fixtures
- Bearer-burn note: mark pool row `ASSIGNMENT=cycle-7-fixes-lane-1` → `ASSIGNMENT=burned` with NOTE summarizing the SHIP

Then PAUSE — supervisor relays to auditor; auditor binary-verdicts per AUDITOR.md §Validation-workflow + cycle-7 Decision 2 (deployed-surface evidence requirement).

---

## §6 — Bail-out conditions

- HARD-BLOCK on `.coord/inbox/supervisor.md` if: `isTest` audit reveals call sites you'd need to touch that overlap with another lane's territory beyond what's negotiable via HEADS-UP; OR cleanup cascade requires touching `src/lib/mcp/errors.ts` (forbidden).
- DEGRADED-OK if: orphan `841df759...` no longer exists at lane SHA (someone already swept it via console) — note in HANDOFF, continue.

---

*from supervisor*
