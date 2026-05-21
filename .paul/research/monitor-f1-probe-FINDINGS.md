# monitor-f1-probe — FINDINGS

**Lane:** monitor-f1-probe (Tier 1, LIVE-X32 single-owner probe, READ-mostly + ONE reversible write)
**Probed:** 2026-05-21 ~18:23–18:34Z against deployed MCP `https://www.centralreform.live/api/mcp` (deployed sha `b24090918`, app v7.0.0)
**Owner:** coder-2 (single owner of the live write, per [[feedback_single_owner_destructive_runs]])

## VERDICT (one line)

**F-1 is REAL, not an audit-window artifact.** On a provably-live desk (heartbeat advancing every 60s, `x32Connected:true`, command queue draining the whole time) a valid `set_bus_fader` write returned `{ok:true, commandId, confidence:"queued"}` and produced **zero** observable state change. **Root mechanism found:** the mixer-state document `monitor-live/state` has been **frozen since 16:21:49Z** (~2h11m at probe end) — it stopped updating at the **v2.0.0 → v10.0.0 bridge-upgrade boundary** — while the separate `config/monitor` heartbeat keeps advancing and reporting healthy. The monitor MCP is currently **non-functional** (all writes silently no-op) despite all-green health signals.

## Preconditions

| # | Gate | Result |
|---|------|--------|
| 1 | Desk live NOW | **PASS (definitive).** `config/monitor.bridge.lastSeen` advanced 18:22:50 → 18:23:50 → 18:25:50 → 18:30:50 → 18:32:50Z (every 60s — liveness by *advancement*, immune to clock skew). `x32Connected:true`, `status:"online"`, `version:"10.0.0"`, `clients:0` throughout. |
| 2 | No service / safe to nudge | **PASS.** Daniel confirmed by selecting bus 5 as the target. Thu 2026-05-21 — no scheduled service ([[project_shul_cadence]]: Fri eve + Shabbat morning). |
| 3 | Bearer hygiene | **PASS.** Daniel handed seed ROOT at fire → minted child via `mint_admin_bearer` (tokenId `7GjzevapOMjbuQIdgyFb`, ttl 1h, purpose audited) → probed with child → `revoke_minted_bearer` → `revoked:true` → post-revoke call **HTTP 401 `invalid_token`**. Seed ROOT never used for probe writes. |

## Target bus

**Bus 5 "rabbi wedge"** — unassigned (no uid), lightest config (1 live send). Daniel-selected.
**Note:** the audit's assumption "bus 4 Andrea Wedge unused" is **stale** — `busAssignments` now has bus 3 → Daniel, **bus 4 → David Lazaroff**. Re-verified at probe time per the lane's "do not assume" rule. No bus was *cleanly* unused (all 5 masters were up ~0.74 with sends routed — desk in a configured/ready state); Daniel authorized bus 5 as safe to nudge.

## Write → read-back evidence

**Snapshot (bus 5):** `fader = 0.7399804592132568`; sends: ch1 `level 0.13124999403953552 on=true`, ch2 `level 0 on=true`, ch3–32 `level 0 on=false`.

| Step | Action | Time (Z) | Result |
|------|--------|----------|--------|
| Write #1 | `set_bus_fader(5, 0.5)` | 18:29:16 | `{ok:true, commandId:"6IfNh7pg8RDdjI7iZuCC", confidence:"queued"}` |
| Read-back ×6 | `get_mix(5)` | 18:29:17, :44, :45, :46, :46, :47 | `fader = 0.7399804592132568` **UNCHANGED** across the full ~31s window |
| Queue check | `monitor-live/commands/pending/6IfNh7pg8RDdjI7iZuCC` | 18:30 | **not found** (consumed/drained — no `pending` subcollection remains) |
| Restore | `set_bus_fader(5, 0.7399804592132568)` | 18:33:04 | `{ok:true, commandId:"zf6UcC66j9AOhqhg8pjR", confidence:"queued"}`; read-back `0.7399804592132568` |

**Corroboration send write deliberately SKIPPED.** With no physical X32 view (see below), a `set_send_level` could not be guaranteed byte-restorable (it sets `level` but not the `on` flag; restoring `{level,on}` needs `set_send_mute` too). The hard rule "leave the desk byte-identical" dominates a nice-to-have second data point. The bus-fader write is fully restorable and already decisive.

## Root-cause evidence (the smoking gun)

`get_mix` reads from **`monitor-live/state`** (bus values match byte-for-byte). That document:
- **`updatedAt` / `updateTime` = 2026-05-21T16:21:49Z** — and did **not** advance across snapshot → write → restore (re-checked 18:33: still `16:21:49.458Z`). **Frozen ~2h11m.**
- Its **embedded** `config.bridge.version = "2.0.0"`, `lastSeen 16:06:41Z`.

Meanwhile **`config/monitor.bridge`** (the heartbeat, separate doc): `version "10.0.0"`, `lastSeen` advancing every 60s (18:32:50Z at probe end), `x32Connected:true`.

⇒ The mixer-state pipe **froze exactly at the v2.0.0 → v10.0.0 bridge-upgrade boundary (~16:21Z today)**. Since v10.0.0 took over it **heartbeats + drains the command queue** but **never writes `monitor-live/state`** (and almost certainly isn't driving the X32). `list_monitor_buses` returns `bridge.lastSeenIso` from the **fresh** heartbeat spliced onto **frozen** state values — this is precisely why both the audit and this probe see green health alongside dead writes.

## Physical confirmation

**NOT obtained** — Daniel had no view of the physical X32 / X32-Edit during the write. Therefore I cannot 100% separate:
- **(a)** writes dropped before reaching the X32 (true silent write-drop), vs
- **(b)** writes reach + apply on the X32 but the bridge never syncs state back (read-of-own-write / state-sync loop dead).

**Both are real bridge bugs requiring a bridge-side fix, and both produce the F-1 symptom through the MCP/app surface.** The frozen-state evidence makes **(b)-flavored "state-sync dead"** at least partly true regardless of (a); a desk that physically applied writes but never re-synced would still be uncontrollable in any feedback sense.

## Recommendations

1. **OPERATIONAL — urgent (Daniel).** The studio bridge needs attention *now*: v10.0.0 is heartbeating but not driving/syncing the X32 (state frozen since 16:21Z). Likely a **bridge process restart** and/or the credential **JSON-drop fix** from `bridge-setup-code-mismatch-FINDINGS.md` (v10.0.0 installed to a new exeDir → degraded startup; see [[project_bridge_update_ops]]). **Until fixed, every monitor MCP write silently no-ops.** Confirm recovery by watching `monitor-live/state.updatedAt` resume advancing (and ideally a physical fader nudge).
2. **BRIDGE-SIDE observability lane (escalate, post-restart).** This probe answers the lane's gating question → a bridge release is now justified:
   - **R-3:** derive `x32Connected` from real X32 ack / state-sync freshness, NOT a connection flag that survives a dead sync loop; add `stateAgeSeconds` (now − `monitor-live/state.updatedAt`).
   - **R-1:** `get_command_status(commandId)` so a write is confirmable applied-vs-dropped (today `confidence:"queued"` is the only receipt).
   - **R-9:** a bridge drop / round-trip counter.
3. **APP-SIDE guard (cheap, NO bridge release — ships from the web repo).** Have `list_monitor_buses` / `get_mix` compute state-staleness (`now − monitor-live/state.updatedAt`) and downgrade/annotate `bridge` health when state is stale even though the heartbeat is fresh — so the LLM/UI never trusts writes against a frozen desk. In-app analog of R-3; strong follow-up candidate (out of THIS no-code lane's scope — flagged to supervisor).

## Desk left state

Byte-identical to snapshot. Bus 5 fader `0.7399804592132568`; no send writes made. Restore command `zf6UcC66j9AOhqhg8pjR` issued (no-op if writes are dropped; corrective if they apply). Child bearer revoked. No code changed (probe lane).
