# Lane: P0-A1 — Bridge + data-model audit (Monitor Overhaul Phase 0, Wave 1)

**Tier 0, READ-ONLY. Owner: coder-1 (bridge expert). Sign `from coder-1`.**

## 0. Mandatory `.coord/` startup
Read in order: `.coord/CODER.md` (role + EPHEMERAL inbox model), `.coord/README.md` (protocol),
`.coord/shared/decisions.md` tail (the **Monitor Overhaul** entry 2026-05-21T~20:15Z), `.coord/shared/claims.md`,
`.coord/shared/master-tip.md`, `.coord/inbox/coder-1.md`.
Then read the program docs (your north star):
- `.paul/research/monitor-overhaul/PROGRAM-SPEC.md` (§1 confirmed root cause, §2-4 architecture)
- `.paul/research/monitor-overhaul/PHASE-0-PLAN.md` (your lane = **P0-A1**)

## 1. Why
This session live-verified the monitor control system: **control works**, and F-1 "write-drop" is a
readback illusion from three bridge state-write bugs (read-of-own-write; BR-02 idle-freeze; array→map
delta corruption). Phase 1 will redesign the bridge's state-write contract. **Your job: produce the
authoritative bridge-side defect register + propose the target state-contract Phase 1 implements.**

## 2. Scope (audit only — change NOTHING)
- `bridge/src/{index,x32-client,firestore-transport,config,types}.ts` + `bridge/src/__tests__/*`
- Data model: `config/monitor`, `monitor-live/state`, `monitor-live/commands/pending`

## 3. Produce `.paul/research/monitor-overhaul/AUDIT-bridge.md`
1. **Confirm + extend the 3 root bugs** with exact `file:line` evidence (read-of-own-write: the X32
   doesn't echo own-writes + the bridge never optimistically updates its cache on send; idle-freeze:
   no periodic state heartbeat — only startup/echo/reconnect writes; array→map: dot-path delta `update()`
   corrupts the `buses` array).
2. **Enumerate every other bridge defect/gap** with evidence, including (verify each — don't assume):
   reconnect path NOT re-arming `startXRemote()` (`x32-client.ts:294-302`); startup `state_synced`
   emitted before the transport listener attaches (`index.ts:116` vs `:121`); liveness derived from the
   `/xinfo` keepalive rather than real state-freshness; command timeout/obsolete/ordering edges; error
   handling; OSC encode/decode correctness; two-instance `checkForRunningInstance` "continue anyway".
3. **Propose the target state-contract** (the one real fork for Phase 1): full-state-write vs
   shape-preserving delta; the query-after-command confirmation shape (bridge queries the param it just
   set, since the X32 won't echo own-writes); state-heartbeat cadence; doc schema (keep `buses` an array?
   schema versioning?). Give a concrete recommendation + tradeoffs.

## 4. Boundaries / method
- **READ-ONLY** — zero code edits. Read master content via `git show origin/master:<path>` OR a
  master-pinned worktree (e.g. `sheet-music-app-monitor-state-staleness-guard/` @ master tip). The
  canonical `sheet-music-app/` cwd is on stale `fix/b1-error-envelope-sweep` — DO NOT trust it.
- Shallow clone — check `--is-shallow-repository` before any history claim ([[feedback_auditor_shallow_clone_check_before_panic]]).
- The AUDIT doc is your only output. Ship it **docs-only** (cut a worktree off `origin/master`, add the
  doc, FF-push), update `master-tip.md` + `status/coder-1.md`, SHIP-NOTICE to `inbox/auditor.md` (Tier-0).

## 5. Acceptance
Every claim has `file:line` evidence; the target-contract section is concrete enough for Phase 1 to
implement without re-deriving intent; deduped against this session's findings; **no "TBD".** No code/build
(read-only). **Action required:** ACK in `inbox/supervisor.md`, then audit.
