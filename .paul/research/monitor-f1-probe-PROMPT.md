# Lane: monitor-f1-probe — Tier 1, LIVE-X32 single-owner probe (READ-mostly, ONE reversible write)

## Goal
Resolve the **one open question** from the monitor/mixer MCP cowork audit: is **F-1 (silent
write-drop)** a REAL bridge write-path bug, or an artifact of the audit window (X32 off /
not-receiving during 2026-05-21T16:27–16:32Z)? The audit saw 13/13 valid writes return `{ok:true}`
with **zero** state change on read-back, while `x32Connected:true` throughout — but it could NOT
confirm the desk was live+receiving for *writes*. This lane confirms it against a known-live desk.

**You are the SINGLE OWNER of this live prod action** ([[feedback_single_owner_destructive_runs]]).
One reversible write to an UNUSED bus, restored immediately. Do not touch any bus a musician is on.

## Preconditions (verify before any write — STOP + report if any fail)
1. **X32 is live + connected NOW.** Read Firestore `config/monitor.bridge` (or `list_monitor_buses`
   bridge metadata): want `x32Connected:true` + a **fresh** `lastSeen` (< 120s old). If stale → STOP
   (can't distinguish bug from off-desk; report "desk not live, probe inconclusive").
2. **No service running.** Confirm with Daniel it's safe to nudge the desk (no rehearsal/service).
3. **Bearer:** Daniel hands ONE seed ROOT `crl_live_*` at fire; dogfood-mint a child admin bearer
   via `mint_admin_bearer`, probe with it, then **revoke the child** at the end. Deployed MCP =
   `https://www.centralreform.live/api/mcp`; confirm `/api/version` first.

## Method (exactly this; reversible)
1. `list_monitor_buses` → pick a **demonstrably UNUSED bus** (fader 0, all sends level 0 / on=false).
   The audit saw bus 4 "Andrea Wedge" unused — **RE-VERIFY at probe time, do not assume.** If none
   is cleanly unused, STOP + report (don't probe a live mix).
2. **Snapshot** the target bus: `get_mix(busIndex=B)` — record fader + every send {level, on}.
3. **Write #1:** `set_bus_fader(busIndex=B, level=0.5)` (a value clearly ≠ snapshot). Record the
   `{ok, commandId}` response.
4. **Wait** ~5–10s (OSC round-trip + heartbeat), then **read back:** `get_mix(busIndex=B)`. Did
   `fader` become ~0.5?
5. **Corroboration write:** one `set_send_level` on a send of the same unused bus; read back.
6. **RESTORE** the bus to the exact snapshot (fader + each send), then read back to confirm restored
   byte-identical.
7. **Revoke** the minted child bearer; confirm post-revoke call → invalid_token.

## Interpretation (the verdict this lane produces)
- **Read-back REFLECTS the writes** → propagation works. **F-1 was an audit-window artifact** (desk
  was off/unreachable for writes during the audit). The monitor MCP write path is sound; only the
  observability findings (R-2/R-3) remain as nice-to-haves. → no bridge fix needed.
- **Read-back does NOT change** while `x32Connected:true` + fresh heartbeat → **F-1 is REAL** (bridge
  accepts + queues OSC into a black hole). → escalate: a bridge-side observability lane (R-1
  get_command_status, R-3 ack-derived x32Connected + x32StaleSeconds, R-9 drop counter) — another
  bridge release.
- **★ Caveat to flag:** the read-back goes through the SAME bridge. If the bug were in the bridge's
  *read-of-its-own-write*, read-back could mislead. **Ask Daniel to glance at the physical X32 / its
  console** during write #1 to confirm the fader physically moved — that's the ground truth. State
  clearly in your report whether physical confirmation was obtained or only MCP read-back.

## Hard rules
- UNUSED bus only; snapshot→write→**restore**; leave the desk byte-identical (the audit's restore
  achieved 0 diffs across 5 buses / 6 matrices / 160 send slots — match that).
- No code changes — this is a probe. Output = a findings note + recommendation.
- Revoke the minted bearer. Don't burn Daniel's seed ROOT (mint a child).

## Deliverable
A short findings note (`.paul/research/monitor-f1-probe-FINDINGS.md`) with: preconditions met (heartbeat
age, bus chosen), the write→readback evidence (values + commandIds), physical-confirmation status,
and the **verdict (artifact vs real bug)** + recommendation. SHIP-NOTICE to supervisor. No build/test
(probe lane). If you must STOP at a precondition, report what blocked.
