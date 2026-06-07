# Lane: bridge-recon (coder-1) — Tier 0, READ-ONLY

## Context
The studio PC running the bridge is **UP**, but **nobody is physically present**
(only an occasional **non-technical** office helper who can type if given foolproof
keystroke-level steps). Daniel: "the more we can explore on our own re the bridge
the better."

Goal: determine everything possible about the running bridge **purely remotely**
(Firestore + safe non-mutating MCP reads) so we know what we're working with without
anyone touching the screen. You just traced the bridge build/release/auto-update
(`.paul/research/bridge-release-runbook.md`) — perfect context.

**READ-ONLY: zero `src/` edits, zero code, zero destructive writes.** Output is a
docs-only FINDINGS file.

Verified anchors (origin/master `5dd02b555`):
- Bridge writes `monitor-live/state` — full `MixerSnapshot` (channels/buses/matrices
  /config) + `updatedAt` serverTimestamp, throttled deltas
  (`bridge/src/firestore-transport.ts` `writeFullState`/`flushState`, ~80-175).
- It consumes `monitor-live/commands/pending` + has a heartbeat loop.

## Investigate → NEW `.paul/research/bridge-recon-FINDINGS.md`
1. **Liveness** — read `monitor-live/state`: is `updatedAt` fresh (bridge alive +
   syncing)? Are channels/buses/matrices populated (X32 connected)?
2. **Read-path MCP probes** — Daniel hands ONE seed ROOT `crl_live_*`; **dogfood-mint
   a scoped child** via `mint_admin_bearer` (`tools/list` first to read its schema —
   like the auditor did). Call `listMonitorBuses` / `get_mix` / `get_matrix` — do
   they return live console state? This is the exact read path the band will use.
3. **Version / electron-vs-pkg (the gating question)** — can we determine the
   bridge's running version REMOTELY? Inspect `monitor-live/state.config`
   (writeFullState includes `config: this.config.getConfig()`) + hunt for ANY
   bridge-written version/heartbeat/status field. **If the bridge writes no
   observable version → that is a FINDING:** we can't tell electron-build vs
   legacy-pkg remotely (gates the whole auto-update path). Document the cheapest way
   to close it: foolproof office-helper steps to read the tray, vs Daniel checking
   the public releases URL from anywhere.
4. **BR-02 idle behavior** — watch `monitor-live/state.updatedAt` over a few minutes
   of (presumably) idle console: does it flap / go stale falsely? (Observational.)
5. **Auto-update gate** — the v3.x GitHub release check is a PUBLIC URL
   (`github.com/RavBogard/sheet-music-app/releases`) Daniel opens from ANYWHERE —
   note it Daniel-from-anywhere, NOT office-helper. (`gh` is unauthed in this env.)

## Optional Tier-2 (do NOT execute without explicit supervisor/Daniel go)
If read-only is inconclusive on whether the bridge APPLIES commands: ONE
near-zero-impact safe-write test — read a fader's CURRENT value via `get_mix`, set it
to the **same** value, confirm the bridge applies/clears the command. No actual audio
change. Surface as a recommendation; await go-ahead.

## Deliverable
`bridge-recon-FINDINGS.md`: bridge alive? X32 connected? read-path works?
version-determinable-remotely? + a crisp **"what we still can't know remotely and the
cheapest way to get it"** (office-helper-foolproof-steps vs Daniel-from-anywhere).

## Hard rules
READ-ONLY (no `src/`, no code, no destructive console writes). `bridge/**` read-only.
Dogfood-mint the bearer + REVOKE it + mark burned when done. Clean up any probe docs.
Tier-0 research (docs-only).
