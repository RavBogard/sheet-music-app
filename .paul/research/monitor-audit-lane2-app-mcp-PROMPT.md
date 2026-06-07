# Lane monitor-audit-2 — App, MCP API & Authz control plane (DEEP READ-ONLY AUDIT)

You are **coder-2** on a RESEARCH lane. Daniel wants a deep, no-bandaid teardown of the
monitor-mix control system — specifically the **cloud/client half**: the MCP tool surface, the
iPad `/monitor` UI, the command/state contract, and above all the **security/authz model**.

The Companion-migration idea is OFF the table (verified obsolete). We're leaning back into the
custom bridge and asking honestly: **"have we built the app/MCP/authz side the best way, or did we
just make it work?"** Daniel's bar: *"depth of research and analysis here, nothing surface or
bandaid."*

## Role & hard rules

- **READ-ONLY.** You will NOT edit any code. Your ONLY write is your findings doc (§5) — a
  **docs-only** commit, FF-pushed to master per the research-lane pattern.
- **Analyze code at `origin/master` (b7b5bb4d8), NOT the canonical checkout** (it's parked on a
  stale branch — [[feedback_supervisor_verify_against_origin_not_cwd]]). Your worktree is cut from
  b7b5bb4d8; analyze your own worktree's files.
- Do NOT touch `bridge/**` (Lane 1's plane) beyond referencing it. Do NOT edit
  `src/lib/mcp/errors.ts` / `error-envelopes.ts` (read-only foundation).

## §1 Worktree setup

```bash
cd C:/Users/dsbog/CentralReform.live/
git fetch origin
git worktree add ../sheet-music-app-monitor-audit-2 -b feat/monitor-audit-2-app-mcp b7b5bb4d8
cd ../sheet-music-app-monitor-audit-2
```

Then create `.coord/status/coder-2.md` per CODER.md and ACK to `.coord/inbox/supervisor.md`
(signed `from coder-2`).

## §2 Your scope — the cloud/client plane (READ + ANALYZE)

- **MCP surface:** `src/lib/mcp/tools/monitor.ts` (8 tools), `src/lib/mcp/server-monitor.ts`
  (`assertMonitorAccess`, `enqueueCommand`, `loadMixerState`, `canControlBus`,
  `isPrivilegedMonitor`, `serializeLastSeen`), registration in `src/lib/mcp/tools/index.ts`.
- **iPad /monitor surface:** `src/app/(main)/monitor/MonitorClient.tsx`,
  `src/components/monitor/{FaderStrip,MatrixPanel,BusAssignmentPanel,QuickMonitorPanel,DefaultChannelPicker}.tsx`,
  `src/lib/firestore-monitor-client.ts`, `src/hooks/use-monitor-access.ts`,
  `src/hooks/use-monitor-connection.ts`.
- **Authz foundation:** `firestore.rules` (the `monitor-live/state` + `monitor-live/commands/pending`
  blocks — read the FULL `commands/pending` create rule, it continues past the uid check),
  `src/lib/roles.ts`, `src/types/monitor.ts`.
- **Tests:** `src/lib/mcp/__tests__/mcp-monitor.emulator.test.ts`,
  `src/lib/mcp/__tests__/mcp-monitor-defensive.test.ts`,
  `src/lib/__tests__/bridge-latency.util.ts`, `src/hooks/__tests__/use-monitor-access.test.ts`.

## §3 What "deep, not bandaid" means here — questions you MUST answer

1. **The authz model — THE headline finding.** Trace the gate for a write command across all THREE
   layers and render a verdict:
   - **MCP:** `assertMonitorAccess` → `canControlBus` → `preflightBusWrite`/`preflightPrivilegedWrite`.
   - **Firestore rules:** the `monitor-live/commands/pending/{id}` `create` rule. It checks
     `request.resource.data.uid == request.auth.uid` + a schema/type allowlist (S05). **Does it
     enforce bus OWNERSHIP?** If not, a signed-in musician could write a command for a bus they
     don't own via a direct Firestore SDK write (bypassing MCP entirely) — and only the bridge's
     `isCommandAuthorized` would catch it. Confirm whether that's the case.
   - **Bridge:** `isCommandAuthorized` (Lane 1 supplies the mechanics; you own the cross-layer
     verdict). matrix=engineer-only; bus = `isEngineer || userBus === cmd.busIndex`.
   - **Verdict:** Where is the AUTHORITATIVE gate? Is the model coherent, or are there
     gaps / dangerous redundancies / contradictions between MCP, rules, and bridge? Is the
     "everyone can read `monitor-live/state`" rule (`allow read: if isSignedIn()`) acceptable? This
     is the central security question — be exhaustive, show the bypass path if one exists.
2. **Contract / API design.** The command schema + rich error envelopes; command IDs &
   read-back correlation (does the producer correlate the enqueued `commandId` with the resulting
   state, or is it fire-and-forget with no ack?); idempotency; the `set_send_on value=!muted`
   polarity flip; the F-018 index validation. Is the contract sound?
3. **Client UX / flow (iPad).** `MonitorClient` + `FaderStrip` + `firestore-monitor-client` +
   `use-monitor-connection`: optimistic UI vs round-trip lag; how state read-back drives the UI;
   the conflict case when the X32 and an iPad move the same control; perceived latency on the iPad.
   Does it "feel" right? (Defer measured latency to Lane 1's budget + the prod-PC probe.)
4. **MCP surface design (AI ergonomics).** The 8 tools — granularity, naming, composability for AI
   ("turn down David's IEM by 3 dB" = ?), read-back fidelity of `get_mix`/`get_matrix`, error
   envelopes as AI-actionable signals.
5. **v1 scope-gap map.** Ratified v1 scope = faders + mutes + **bus assignments**. The shipped 8
   tools are list_monitor_buses / get_mix / get_matrix / setSendLevel / setSendMute / setBusFader /
   setMatrixFader / setMatrixMute — **there is no bus-assignment write tool.** Map shipped-vs-ratified
   precisely; identify every gap; recommend how each missing primitive should be added as a
   Firestore-write mirroring the existing tools (recommend, do NOT implement).
6. **Test coverage.** Do the emulator + defensive + latency-util + access tests actually exercise
   the authz bypass paths and the failure modes, or is there a coverage hole around exactly the
   risks you found?
7. **Architecture verdict from the producer/app side.** Is "Firestore as the cloud→device RPC bus"
   the right call from the API/UX/authz vantage? Corroborate or dissent from Lane 1's transport
   verdict.

## §4 Seam with Lane 1 (coder-1)

Lane 1 owns `bridge/**`, the transport mechanics, the X32 layer, and the end-to-end **latency
budget**. You own the producers, `firestore.rules`, the **cross-layer authz verdict**, the
contract, and the client UX. Reference the bridge as an input; don't re-derive its internals.
Shared seam = the `monitor-live/*` schema (describe from the producer/rules side). Don't duplicate
Lane 1.

## §5 Deliverable

Write `.paul/research/monitor-audit-lane2-app-mcp-FINDINGS.md` with:
- **TL;DR** (authz verdict + the 3 biggest issues, up top).
- **Authz model analysis** (§3.1) — the three-layer trace, the authoritative-gate verdict, and the
  bypass path if one exists, with `file:line` + rule-line evidence.
- **Findings**, each tagged severity (CRITICAL / HIGH / MED / LOW / NOTE) + category
  (security / contract / UX / scope-gap / test-gap / architecture), with `file:line` evidence and a
  concrete repro/reasoning.
- **v1 scope-gap map** (§3.5) — shipped vs ratified table + how to close each gap.
- **Architecture verdict** (§3.7).
- **Recommendations** — prioritized, security-first, each with effort×impact + tradeoffs; separate
  "fix now" from "consider" from "polish". Recommendations only — do NOT implement.
- A **FACTS-vs-INFERENCES** note + anything needing the prod-PC live probe.

Then: docs-only commit → FF-push → overwrite `master-tip.md` → SHIP-NOTICE (signed `from coder-2`)
→ mark `agents.md` complete → archive status → release claims. Tier-0/research; supervisor
self-verifies.
