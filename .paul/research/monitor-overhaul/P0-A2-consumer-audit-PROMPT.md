# Lane: P0-A2 — Consumer audit: iPad / MCP / rules (Monitor Overhaul Phase 0, Wave 1)

**Tier 0, READ-ONLY. Owner: coder-5. Sign `from coder-5`.**

## 0. Mandatory `.coord/` startup
Read in order: `.coord/CODER.md` (role + EPHEMERAL inbox model), `.coord/README.md`,
`.coord/shared/decisions.md` tail (**Monitor Overhaul** entry 2026-05-21T~20:15Z), `.coord/shared/claims.md`,
`.coord/shared/master-tip.md`, `.coord/inbox/coder-5.md`.
Then the program docs:
- `.paul/research/monitor-overhaul/PROGRAM-SPEC.md` (esp. §1 impact, §2 North Star = the iPad flow)
- `.paul/research/monitor-overhaul/PHASE-0-PLAN.md` (your lane = **P0-A2**)

## 1. Why
The **iPad fader-adjustment flow is the program's North Star** (Daniel's top priority). The iPad command
path works (writes straight to `monitor-live/commands/pending`); the **display path is broken** by the
bridge state-write bugs (array→map corruption loses buses, read-of-own-write isn't confirmed, idle
staleness). Map exactly how each consumer depends on the state contract so Phase-1's fix lands cleanly,
and catalog the iPad UX gaps vs the North Star.

## 2. Scope (audit only — change NOTHING)
- **iPad /monitor (priority):** `src/lib/firestore-monitor-client.ts`; the monitor store/hooks
  (`useMonitorConnection` / `useMonitorStore` / `useMonitorAccess` — locate exact names); `src/components/monitor/*`
  (FaderStrip, VerticalFaderStrip, …); the `/monitor` route.
- **MCP:** `src/lib/mcp/tools/monitor.ts` + `src/lib/mcp/server-monitor.ts`.
- **Rules:** `firestore.rules` monitor blocks (`monitor-live/**`, `config/monitor`).

## 3. Produce `.paul/research/monitor-overhaul/AUDIT-consumers.md`
1. For EACH consumer: how it reads/writes the state contract + what breaks under each bridge bug
   (esp. the iPad display: `toArray` masking the array→map corruption but losing dropped buses;
   own-move shown only locally, never confirmed from authoritative state; idle staleness).
2. **MCP defects** with evidence: the `get_mix` throw (`buses.find is not a function`) + `invalid_bus_index`
   on corrupted state (auditor BLOCK on `70357f47f`); validation coupled to live-state vs owned-buses/config.
3. **iPad UX gaps vs the North Star:** own-move confirmation, others'-change reflection, reconnect /
   offline / staleness UX, multi-musician concurrency, latency feel.
4. **Dedupe against prior audits** — read + reconcile: monitor-audit-1 `c2c45b6f4`, monitor-audit-2
   `22b5e1f1b`, the 2026-05-21 mixer-MCP cowork audit, monitor-mcp-polish (`62a287f06`), the shipped
   staleness guard (`70357f47f`). Cite SHAs; mark which prior findings are already fixed vs still open.

## 4. Boundaries / method
- **READ-ONLY** — zero code edits. Read master content via `git show origin/master:<path>` OR a
  master-pinned worktree (`sheet-music-app-monitor-state-staleness-guard/` @ master tip). Canonical cwd is
  STALE — do not trust it. Shallow clone — verify before history claims.
- Output the AUDIT doc only. Ship **docs-only** (worktree off `origin/master`, add doc, FF-push), update
  `master-tip.md` + `status/coder-5.md`, SHIP-NOTICE to `inbox/auditor.md` (Tier-0).

## 5. Acceptance
Every consumer mapped to its contract dependency with `file:line` evidence; iPad-flow gaps explicit;
deduped against the prior audits (SHAs cited); **no "TBD".** No code/build. **Action required:** ACK in
`inbox/supervisor.md`, then audit.
