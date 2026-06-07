# Lane monitor-audit-1 — Bridge, Transport & X32 control plane (DEEP READ-ONLY AUDIT)

You are **coder-1** on a RESEARCH lane. Daniel wants a deep, no-bandaid teardown of the
monitor-mix control system — specifically the **device/LAN half**. The Companion-migration
idea is OFF the table (verified obsolete: the cloud→LAN path is already solved via Firestore,
nothing is internet-exposed). We are leaning back into the custom bridge and asking the honest
question: **"have we actually built this the best way, or did we just make it work?"**

Your job: tear apart the bridge + the Firestore message-bus mechanics + the X32 OSC layer.
Find what's wrong, fragile, racy, or sub-optimal. Recommend with **depth and tradeoffs** — not
surface patches. Daniel explicitly said: *"depth of research and analysis here, nothing surface
or bandaid."* Treat that as the bar.

## Role & hard rules

- **READ-ONLY.** You will NOT edit any code. `bridge/**` is normally a do-not-touch zone — that
  rule is about EDIT races; **reading it is the entire point of this lane.** Read it freely;
  edit NOTHING in `bridge/` or `src/`.
- Your ONLY write is your findings doc (§5) — a **docs-only** commit, FF-pushed to master per
  the established research-lane pattern (precedent on master-tip: `shireinu-ingestion-research`,
  `musicxml-health-audit`, `ipad-sweep-*` — all docs-only pushes).
- **Analyze code at `origin/master` (b7b5bb4d8), NOT the canonical checkout** — the canonical
  `sheet-music-app/` cwd is parked on a stale branch and reading it would analyze stale code.
  This has bitten this project repeatedly ([[feedback_supervisor_verify_against_origin_not_cwd]]).
  Your worktree (below) is cut from b7b5bb4d8, so just analyze your own worktree's files.

## §1 Worktree setup

```bash
cd C:/Users/dsbog/CentralReform.live/
git fetch origin
git worktree add ../sheet-music-app-monitor-audit-1 -b feat/monitor-audit-1-bridge b7b5bb4d8
cd ../sheet-music-app-monitor-audit-1
```

Then create your status file at `.coord/status/coder-1.md` per CODER.md, and ACK to
`.coord/inbox/supervisor.md` (signed `from coder-1`).

## §2 Your scope — the device/LAN plane (READ + ANALYZE)

Everything under `bridge/`:
- `bridge/src/index.ts` — bridge server startup, HTTP API (health/status/scan), heartbeat
- `bridge/src/main.ts` — Electron tray app shell, auto-update, single-instance, setup-code flow
- `bridge/src/firestore-transport.ts` — **the heart of it**: the Firestore message bus
- `bridge/src/x32-client.ts` — OSC client, /xremote subscription, reconnect, dB scaling
- `bridge/src/config.ts` — Firestore config manager
- `bridge/src/types.ts` — wire/snapshot types
- `bridge/src/__tests__/reconnect.test.ts` + `bridge/src/__tests__/x32-mock-server.ts`
- `bridge/README.md`, `bridge/SETUP_GUIDE.md`, `bridge/package.json`, `Dockerfile`, `docker-compose.yml`

Plus the Firestore schema **as the bridge consumes/produces it** (describe from the bridge side
only — Lane 2 owns the producer/rules side): `monitor-live/state`, `monitor-live/commands/pending`.

## §3 What "deep, not bandaid" means here — questions you MUST answer

1. **Transport correctness.** Trace the throttle (`STATE_WRITE_INTERVAL=100ms`, delta-vs-full-sync,
   `scheduleStateWrite`/`flushState`), the command batch window (`COMMAND_BATCH_WINDOW=20ms`), the
   stale-command discard (10s), the obsolete-by-timestamp discard (`latestCommandTimestamps`/
   `targetKey`), and `cleanupStaleCommands` (30s). Find correctness bugs/races. Specifically
   scrutinize: the dead `lastSnapshot` block (~lines 144–148); what happens when two musicians
   write the same `targetKey` near-simultaneously; whether a delete + a newer create can race; the
   `update`-then-fallback-to-`writeFullState` NOT_FOUND path; ordering guarantees across batches.
2. **Latency budget.** Compute the realistic end-to-end latency for a fader move: client write →
   Firestore propagation → bridge `onSnapshot` → 20ms batch → OSC/UDP → X32; and the return path:
   X32 event → 100ms throttle → Firestore delta → client read. Where is the floor? Is Firestore an
   appropriate bus for "feels-live" control, or is it being pressed into a soft-realtime role it
   isn't built for? Give numbers/ranges and your reasoning. (Live-measured numbers come from a
   prod-PC probe later — give the analytical budget now.)
3. **Reliability / failure modes.** Bridge crash mid-batch (commands lost or double-run on
   restart?). Firestore listener drop + the 5s re-establish (command gap?). X32 disconnect /
   reconnect storm. **Write amplification**: every fader move = a command-doc create→delete +
   state-delta write — quantify Firestore op volume + cost under 16 musicians moving faders, and
   whether the 10-writes/sec state cap coalesces correctly or drops/collides deltas.
4. **X32 OSC layer.** `/xremote` subscription correctness + renewal, reconnect/backoff, dB↔float
   scaling fidelity, the per-event `findIndex` array mapping, the `fullSyncPending` fallback when a
   bus/send isn't found.
5. **Bridge-side authz.** `isCommandAuthorized` — it comments *"we trust that the Firestore
   security rules enforce this"* + checks `getUserBus` + matrix=engineer. Is this real
   defense-in-depth or a gap? Flag your finding for Lane 2's cross-layer authz verdict (Lane 2 owns
   the verdict; you supply the bridge-side fact).
6. **Ops / deploy / SPOF.** Electron + `electron-updater` auto-update (what if an update lands or
   breaks mid-service?), single-instance lock, credential lifecycle (setup-code → on-disk
   `service-account-key.json`), single-PC single-point-of-failure, observability (only
   `bridge.lastSeen`/`status` surface to the app — adequate?).
7. **Documentation drift.** `README.md` + `SETUP_GUIDE.md` describe a WebSocket + Docker +
   Windows-service architecture the code **abandoned** (`firestore-transport.ts`: *"Replaces the
   WebSocket server entirely"*; `main.ts` is an Electron tray app). Quantify the drift — it's a real
   maintainability/onboarding hazard, not cosmetic.
8. **The architecture question (the one Daniel actually asked).** Is "Firestore as the message bus
   between a cloud app and a LAN device" the right call — or would a materially better approach exist
   (direct WSS with proper cert handling; a lightweight self-hosted relay; MQTT; the rejected
   Companion path; something else)? Give a reasoned verdict **with tradeoffs**, sized to this
   project's reality (one synagogue, ~16 iPads, weekly use, solo maintainer, no-local-dev/Vercel
   shop). "Best way" is contextual — judge it for THIS context.

## §4 Seam with Lane 2 (coder-2)

Lane 2 owns the PRODUCERS (MCP tools + iPad UI), `firestore.rules`, and the **cross-layer authz
verdict**. You own the consumer/bridge side + the **end-to-end latency budget**. Do NOT deep-dive
the MCP tool internals or `firestore.rules` — reference them as inputs, surface the bridge-side
`isCommandAuthorized` fact, and defer the authz verdict to Lane 2. Shared seam = the
`monitor-live/*` schema (describe from the bridge side only). Don't duplicate Lane 2's analysis.

## §5 Deliverable

Write `.paul/research/monitor-audit-lane1-bridge-FINDINGS.md` with:
- **TL;DR** (verdict on the transport + the 3 biggest issues, up top).
- **Architecture verdict** (§3.8) — is Firestore-as-bus right for this context? tradeoffs.
- **Findings**, each tagged severity (CRITICAL / HIGH / MED / LOW / NOTE) + correctness-bug vs
  architecture vs polish, with `file:line` evidence and a concrete repro/reasoning. No vague
  hand-waving — name the line, show the failure path.
- **Latency budget** (§3.2) with numbers + assumptions.
- **Recommendations** — prioritized, each with effort×impact and tradeoffs; separate "fix now
  (correctness)" from "consider (architecture)" from "polish". Recommendations only — do NOT
  implement.
- A **FACTS-vs-INFERENCES** note + anything that needs the prod-PC live probe to confirm.

Then: docs-only commit → FF-push to master → overwrite `.coord/shared/master-tip.md` → SHIP-NOTICE
to `.coord/inbox/supervisor.md` (signed `from coder-1`) → mark `agents.md` row complete → archive
status → release any claims. This is a Tier-0/research lane (docs-only); supervisor self-verifies.
