# Lane monitor-fix-f2 — F2/BR-04: array-aware bus assignment (CRITICAL musician-lockout) · Tier 2

You are **coder-1**. Fix the #1 finding from the monitor audit: **non-engineer musicians are locked
out of their own faders.** The in-app BusAssignmentPanel writes `busAssignments[bus]` as an ARRAY,
but the bridge's `getUserBus` only understands the single-object shape → returns `null` → every
regular musician's fader command is rejected "Unauthorized" (silently). Code-certain; latent-but-
blocking for the IEM rollout.

Daniel has **authorized touching `bridge/`** for this tier (normally a do-not-touch zone).

## Read first (full context)
- `C:/Users/dsbog/CentralReform.live/sheet-music-app/.coord/research/monitor-audit-SYNTHESIS.md`
- `.paul/research/monitor-audit-lane1-bridge-FINDINGS.md` — **BR-04** (root cause), **BR-19** (the muted check:types warning that let it ship)
- `.paul/research/monitor-audit-lane2-app-mcp-FINDINGS.md` — **F2** (cross-layer detail), **F10** (test gap)

## §1 Worktree
```bash
cd C:/Users/dsbog/CentralReform.live/
git fetch origin
git worktree add ../sheet-music-app-monitor-fix-f2 -b feat/monitor-fix-f2-bus-assign c2c45b6f4
cd ../sheet-music-app-monitor-fix-f2
```
ACK to supervisor inbox; create `.coord/status/coder-1.md`; claim the bridge files below in `shared/claims.md`.

## §2 Scope (EDIT)
1. **`bridge/src/config.ts`** `getUserBus` (~117-124): normalize BOTH shapes. Mirror the canonical
   `getOwnedBuses` semantics (`src/lib/mcp/server-monitor.ts:58-70`) — e.g.
   `const list = Array.isArray(a) ? a : a ? [a] : []; if (list.some(x => x.userId === uid)) return Number(busIdx)`.
   Handle co-ownership (multiple users on one bus) correctly.
2. **`bridge/src/types.ts`** (~15): add the `BusAssignment[]` variant so it matches the canonical
   `src/types/monitor.ts:15` (`Record<string, BusAssignment | BusAssignment[] | null>`). **Do NOT
   change the canonical type — it's already correct.**
3. **`scripts/check-types-sync.js`** + `package.json` `check:types`: make the monitor-type drift a
   HARD FAIL (non-zero exit), not a warning (BR-19) — so this class can't silently regress. **Verify
   `npm run check:types` passes GREEN after your type-sync before flipping it to fail-hard**, so you
   don't break the gate on unrelated pre-existing drift.
4. **Regression test** in `bridge/src/__tests__/`: `getUserBus` returns the right bus for the
   array form (single occupant + co-owned), still works for legacy single-object, returns null for
   unassigned. This is the test that would have caught BR-04.
5. (Optional, F10) flip the emulator seed `src/lib/mcp/__tests__/mcp-monitor.emulator.test.ts`
   (~97-101) to the **array** form so producer/consumer drift is exercised end-to-end.

## §3 Guard rails / seam
- Do NOT touch `firestore.rules` or the bridge authz comment — that's **coder-2 (Lane F1)**.
- Do NOT touch `bridge/src/main.ts` — that's **coder-4 (Lane BR-03)**.
- Claim every shared file before editing. Base off `c2c45b6f4`.

## §4 Ship
Run bridge tests + `npm run check:types` + (if you touched src/) `next build`. Tier-2
(authz/data-integrity) → **full auditor rigor**: your SHIP-NOTICE must carry the before/after of a
non-engineer fader command (the audit's repro). Push FF → update `master-tip.md` → SHIP-NOTICE to
`.coord/inbox/supervisor.md` (signed `from coder-1`) → mark agents.md → archive status → release claims.
Supervisor + auditor verify before teardown.
