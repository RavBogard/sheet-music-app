# Lane monitor-fix-f1 — F1: firestore.rules monitor authz hardening + honest comment · Tier 2

You are **coder-2**. The monitor audit found the **bridge is the SOLE authoritative authz gate**:
`firestore.rules` does authN + attribution (`uid==auth.uid`) + a loose schema allowlist, but **no
ownership/privilege check** — any signed-in user (even a `pending`/`member` with zero monitor
access) can write any monitor command (incl. matrix/FOH) straight to Firestore via the Web SDK,
bypassing MCP. The bridge catches the dangerous cases (no active escalation today) but it's fragile,
and the bridge's own comment **inverts** reality. Make the rules genuinely enforce the cheap+high-
value half so the bridge is real defense-in-depth, and tell the truth in the comment.

Daniel has **authorized touching `bridge/`** for this tier (comment-only here).

## Read first
- `C:/Users/dsbog/CentralReform.live/sheet-music-app/.coord/research/monitor-audit-SYNTHESIS.md`
- `.paul/research/monitor-audit-lane2-app-mcp-FINDINGS.md` — **F1** (the 3-layer authz trace + the
  authoritative-gate verdict), **F6**, **F7**, **F10**
- `.paul/research/monitor-audit-lane1-bridge-FINDINGS.md` — **BR-13 [SEAM]** for the bridge side

## §1 Worktree
```bash
cd C:/Users/dsbog/CentralReform.live/
git fetch origin
git worktree add ../sheet-music-app-monitor-fix-f1 -b feat/monitor-fix-f1-rules c2c45b6f4
cd ../sheet-music-app-monitor-fix-f1
```
ACK; create `.coord/status/coder-2.md`; **claim `firestore.rules`** (Tier-2 shared file).

## §2 Scope (EDIT)
1. **`firestore.rules`** `monitor-live/commands/pending` create rule (~392-410):
   - Require real membership, not bare `isSignedIn()` — use the existing membership predicate
     (verify the helper name in the file; the audit cites `isSignedIn`/`isAdmin`/`isSoundEngineer`
     — use/define a consistent `isMember()`).
   - Gate `set_matrix_fader` / `set_matrix_on` to **admin/SE in the rule itself** (matrix is the
     most dangerous primitive and needs no per-bus data lookup). Per-bus ownership stays at the
     bridge (CEL `get()` is awkward) — that's an accepted boundary; do NOT try to do per-bus
     ownership in CEL.
   - (Optional, F7) tighten with per-type required fields + `hasOnly([...])`.
   - **F6 decision:** `monitor-live/state` read is `isSignedIn()`. Tightening to `isMember()` is
     low-stakes — do it only if trivial + safe; otherwise leave it and flag to supervisor. Don't
     over-reach.
2. **`bridge/src/firestore-transport.ts`** (~321-323): fix the **inverted comment** — state plainly
   that the bridge is the AUTHORITATIVE bus-ownership gate and that `firestore.rules` does NOT
   enforce ownership (the opposite of what it says now). **Comment-only** edit.
3. **Regression test:** add a `monitor-live` firestore.rules emulator test modeled on
   `src/lib/songs/__tests__/firestore-rules-tracks.emulator.test.ts` (and/or
   `src/lib/recordings/__tests__/firestore-rules-recordings.emulator.test.ts`). Assert: non-member
   signed-in create → DENIED; member creating own-uid command → allowed; cross-uid forge → DENIED;
   non-privileged `set_matrix_*` → DENIED; admin/SE `set_matrix_*` → allowed. (Closes F10's "zero
   monitor-live rules tests".)

## §3 Guard rails / seam
- Do NOT touch `bridge/src/config.ts`/`types.ts` (coder-1) or `bridge/src/main.ts` (coder-4). Only
  the comment in `firestore-transport.ts`.
- Confirm the rules COMPILE (`firebase deploy --only firestore:rules --dry-run` or the emulator) and
  the emulator test is GREEN before ship.

## §4 Ship
Tier-2 (firestore.rules/auth) → **full auditor rigor** (independent deployed-surface probe of the
authz behavior). Push FF → `master-tip.md` → SHIP-NOTICE (`from coder-2`) → agents.md → archive →
release claims.
