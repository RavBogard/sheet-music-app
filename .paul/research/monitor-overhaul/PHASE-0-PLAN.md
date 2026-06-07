# Monitor Overhaul — Phase 0 Plan (Audit + Self-Test Harness)

> Parent: `.paul/research/monitor-overhaul/PROGRAM-SPEC.md`. Phase 0 is **load-bearing**: every later
> phase gates on the harness it builds and the defect register + target-contract it produces.
> Execution model: `.coord/` lanes (each coder runs its own TDD/steps per CODER.md). Auditor gates each wave.

**Goal:** produce (1) a complete, deduped defect+gap register for the entire monitor system, (2) an agreed
**target state-contract** the Phase-1 root-fix will implement, and (3) the autonomous self-test harness
(faithful mock + live query-after-write probe) that certifies every later phase with no human in the booth.

**Sequencing:** Wave 1 (two parallel READ-ONLY audits) → supervisor synthesis (defect register + target
contract, Daniel-ratified) → Wave 2 (two parallel harness builds). Wave 2 depends on the ratified contract.

---

## Wave 1 — Audit (parallel, READ-ONLY, disjoint)

### Lane P0-A1 — Bridge + data-model audit  (Tier 0, read-only; owner: coder-1, bridge expert)
**Surface:** `bridge/src/{index,x32-client,firestore-transport,config,types}.ts` + existing `bridge/src/__tests__/*`;
data model `config/monitor`, `monitor-live/state`, `monitor-live/commands/pending`.
**Produce:** `.paul/research/monitor-overhaul/AUDIT-bridge.md` —
- Confirm + extend this session's 3 root bugs (read-of-own-write; BR-02 idle-freeze; array→map delta corruption) with exact file:line evidence.
- Enumerate every other bridge defect/gap: reconnect path NOT re-arming `/xremote` (x32-client.ts:294-302), startup `state_synced` emitted before transport listener attaches (index.ts:116 vs :121), liveness derived from `/xinfo` keepalive not real state-freshness, command timeout/obsolete/ordering edge cases, error handling, OSC encode/decode correctness.
- Propose the **target state-contract**: full-state-write vs shape-preserving-delta; query-after-command confirmation shape; state-heartbeat cadence; doc schema (incl. whether `buses` stays array + whether schema versioning is needed).
**Boundary:** READ-ONLY (no code changes). Read from `git show origin/master:` or a master worktree, NOT the stale canonical cwd.
**Acceptance:** every claim has file:line evidence; target-contract section is concrete enough for Phase-1 to implement; no "TBD".

### Lane P0-A2 — Consumer audit (iPad / MCP / rules)  (Tier 0, read-only; owner: coder-5)
**Surface:** iPad `src/lib/firestore-monitor-client.ts`, the monitor store/hooks (`useMonitorConnection`/`useMonitorStore`/`useMonitorAccess`), `src/components/monitor/*` (FaderStrip, VerticalFaderStrip, …) + the `/monitor` route; MCP `src/lib/mcp/tools/monitor.ts` + `src/lib/mcp/server-monitor.ts`; `firestore.rules` monitor blocks.
**Produce:** `.paul/research/monitor-overhaul/AUDIT-consumers.md` —
- For each consumer, how it depends on the state contract + what breaks under each Wave-1-A1 bug (esp. the **iPad display path**: corruption-loses-buses via `toArray`, read-of-own-write not confirmed, idle staleness).
- MCP defects: the `invalid_bus_index`/`get_mix` throw on corrupted state (auditor BLOCK), validation coupling to live-state vs owned-buses/config.
- iPad UX gaps vs the North Star (own-move confirmation, others'-change reflection, reconnect/offline/staleness UX, concurrency).
- Fold in + dedupe prior: monitor-audit-1 `c2c45b6f4`, monitor-audit-2 `22b5e1f1b`, the 2026-05-21 mixer-MCP cowork audit, monitor-mcp-polish, the shipped staleness guard.
**Boundary:** READ-ONLY. Master content only.
**Acceptance:** every consumer mapped to its contract dependency; deduped against prior audits (cite SHAs); no "TBD".

**Wave-1 gate:** auditor verifies both are read-only + evidence-backed → supervisor synthesizes
`.paul/research/monitor-overhaul/DEFECT-REGISTER.md` + ratifies the **target state-contract** with Daniel.
(The contract decision is the one real fork — it sets Wave 2 + Phase 1.)

---

## Wave 2 — Self-test harness (parallel, build; AFTER the ratified contract)

### Lane P0-B1 — Faithful X32 mock  (Tier 1, build; owner: coder-1)
**Surface:** `bridge/src/__tests__/x32-mock-server.ts` (+ new mock-fidelity tests).
**Build:** model the REAL X32 quirks so CI catches the bug classes that bit us — (a) own-writes NOT echoed to the sender, (b) query/response returns current values, (c) `/xremote` subscribe + 8s renewal + expiry, (d) external changes echo to subscribers. Add tests that REPRODUCE read-of-own-write against the mock (a write via the bridge does not, by itself, refresh state) so Phase-1's fix has a red→green target.
**Acceptance:** mock-fidelity tests green; a test that fails on today's bridge behavior (read-of-own-write) exists + is documented as the Phase-1 target; CI wired.

### Lane P0-B2 — Live query-after-write probe  (Tier 1, build; owner: coder-5)
**Surface:** new harness under `e2e/` or `scripts/` (audit picks the home) + a runner doc.
**Build:** autonomous probe — pick a safe monitor/IEM bus → snapshot via X32 **query** → write via BOTH the iPad command-queue path AND the MCP path → **query the desk back** to confirm applied → confirm `monitor-live/state` reflects it (full round-trip) → restore. Service-time guard ([[project_shul_cadence]]); admin-bearer parameterized; idempotent + self-restoring; clear PASS/FAIL output.
**Acceptance:** runs headless against the live desk ("always on") and currently REPORTS the real state — i.e. confirms control works + readback fails (the exact Phase-1 target); restore verified byte-identical; no human needed.

**Phase-0 done when:** DEFECT-REGISTER + ratified target-contract exist; mock + live probe both run green-where-expected and red-where-the-known-bugs-are (so Phase 1 has executable targets); auditor ACCEPTs both harness lanes.

---

## Coders / dispatch
- Wave 1: **coder-1** (bridge audit) + **coder-5** (consumer audit) — both read-only, parallel, fire together.
- coder-4 is mid-fix on the get_mix BLOCK (down-payment); frees after.
- Wave 2 reuses coder-1 (mock) + coder-5 (probe) after the contract ratifies.
- Bridge/** work (B1 mock is tests-only; Phase-1 bridge code) stays single-owner coder-1, Daniel-gated.

## Open forks for Daniel (at the Wave-1 synthesis gate, not now)
Full-state vs shape-preserving-delta · latency targets · schema versioning · harness home (`e2e/` vs `scripts/`).
