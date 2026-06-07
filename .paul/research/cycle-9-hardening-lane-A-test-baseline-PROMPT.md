# Cycle-9 Hardening — Lane A (unit-test baseline triage + repair)

**You are coder-2.** Sign `from coder-2`.
**Anchor:** branch off `origin/master` @ `edb24a47c` in a fresh `git worktree`
(NOT the canonical checkout — it's parked on stale `fix/b1-error-envelope-sweep`).
**Bearer:** none needed — this lane is unit tests + build only, no MCP/prod surface.
**Tier:** Tier-0/1 (test + source). Green = the failing baseline goes to zero (or
every remaining red is justified-quarantined with a written reason).

---

## Why this lane exists

The current master tip carries a **standing baseline of ~66 failing unit tests**
that has been carried "disjoint from the MCP changeset" for several cycles and
never triaged. For the "bulletproof before onboarding the band" bar, a red test
suite is unacceptable — it hides real regressions behind noise. Your job is to
make `npm run test` (the unit suite, NOT the emulator suite) green, honestly.

## The failing surface (from master-tip.md gate notes)

~66 failures across these files (all confirmed present at `edb24a47c`):
- **SetlistGrid family** (`src/components/setlist/grid/__tests__/`): `SetlistGrid.a11y`, `.contextmenu`, `.dnd`, `.edit`, `.fileId-on-pick`, `.read`, `.selection`, `.undo`, `SetlistGridHydrator`, `SetlistGridTopBar` — 10 files testing one component cluster.
- **`src/__tests__/a11y/touch-targets.test.tsx`** (a11y tap-target sizes).
- **`src/app/api/library/__tests__/upload-musescore.test.ts`** (library upload route).
- **`src/components/music/__tests__/smart-score-viewer.test.tsx`** (PDF/score viewer).

Test infra: `vitest.config.ts` + `src/test-setup.ts` (jsdom). 238 total test files.

## Method (triage BEFORE you fix)

1. **Reproduce + categorize first.** Run the unit suite and capture the actual
   failures. Group them by ROOT CAUSE, not by file. The SetlistGrid family is
   one component — its 10 test files likely share a small number of causes (a
   shared harness/mock change, a moved prop, a jsdom/RTL version drift, a
   `test-setup.ts` gap). The 3 standalone files are probably independent.
   Expect ~2-5 distinct root causes, not 66.
2. **Write a short triage note** (`.paul/research/cycle-9-test-baseline-TRIAGE.md`)
   listing each root-cause cluster, how many tests it covers, and your fix plan.
   Post it to `inbox/supervisor.md` as a HEADS-UP before you fix, so I can split
   the lane if any single cluster is genuinely large + independent.
3. **Fix by cluster.** Prefer fixing the PRODUCTION code / shared test harness
   when the test is asserting correct behavior. Only change a test assertion
   when the test itself is wrong (stale snapshot, asserting removed behavior) —
   and say so in the commit.
4. **Quarantine is last resort.** If a test is genuinely flaky/environment-bound
   and not worth fixing now, `.skip` it WITH an inline comment citing why + a
   tracking note, and list every quarantined test in your SHIP-NOTICE. Do NOT
   silently delete tests.

## Hard rules

- Do NOT touch `bridge/**`, repo-root `mcp/`, `src/lib/mcp/errors.ts`,
  `src/lib/mcp/error-envelopes.ts`. **`SetlistGrid.tsx` itself** is normally a
  do-not-touch zone for MCP lanes — but this lane's mandate IS the SetlistGrid
  test suite, so you MAY edit `SetlistGrid.tsx` + its helpers IF a failing test
  reveals a real component bug. If you touch it, HEADS-UP `inbox/supervisor.md`
  first (in case a sibling lane has it claimed — check `.coord/shared/claims.md`).
- Don't expand scope into the MED/LOW polish backlog. Tests only.
- Don't weaken assertions just to go green. Fix the cause.

## Gates before SHIP

1. `npm run test` (unit suite) — green, OR every remaining failure is a
   documented `.skip` with justification.
2. `next build --webpack` — clean.
3. (Do NOT need the emulator suite for this lane unless your fix touches code an
   emulator test covers — if so, run `npm run test:emulator` for the touched area.)

## SHIP protocol

1. Clean commits grouped by root-cause cluster (readable history).
2. Push to `origin master` (NOT `master:main`); cherry-pick onto fresh
   origin/master if it diverged (narrow-lane caveat in `master-tip.md`).
3. OVERWRITE `.coord/shared/master-tip.md` with the new SHA.
4. SHIP-NOTICE to `inbox/supervisor.md` (`from coder-2`): before/after failure
   counts, the root-cause clusters you fixed, and any quarantined tests.
5. Hold worktree for teardown until supervisor go-ahead.

### ACK
Append `msg-from-coder-2-cycle9-A-ack` to `inbox/supervisor.md` after worktree
setup + branch cut + this read. Then start with the triage note.
