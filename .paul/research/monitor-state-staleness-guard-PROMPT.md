# Lane: monitor-state-staleness-guard (Tier 1, app-side / web-repo, NO bridge, NO desk)

## 0. Mandatory `.coord/` startup
Read, in order, before touching code:
- `.coord/CODER.md` (your role + memory model — your inbox is EPHEMERAL/current-lane-scoped)
- `.coord/README.md` (protocol + push/update protocol)
- `.coord/shared/decisions.md` (tail — standing decisions)
- `.coord/shared/claims.md` (claim BEFORE editing shared files; rows for this lane are pre-staked)
- `.coord/shared/master-tip.md` (current master tip; verify before push)
- `.coord/inbox/coder-4.md` (your assignment)
Sign messages `from coder-4`.

## 1. Why this lane exists (verified context — do NOT relitigate)
The studio bridge's mixer-state document `monitor-live/state` (what `get_mix` / `list_monitor_buses` /
the iPad `/monitor` surface read for live fader values) **froze at the v10.0.0 upgrade boundary
(16:21:49Z 2026-05-21)** and has not advanced since. Root cause (supervisor-confirmed in bridge
source @ master): **BR-02** added a `/xinfo` keepalive that fixed a false-disconnect; pre-BR-02 that
false-disconnect was firing a full resync ~every 20s and was the ONLY thing periodically refreshing
`monitor-live/state` on an idle desk. Post-BR-02 there is **no periodic mixer-state heartbeat** — state
only advances on live X32 OSC echoes — so an idle desk's state goes and stays stale. Meanwhile the
SEPARATE `config/monitor.bridge` heartbeat keeps advancing green. Net: **the read surface reports
"x32Connected:true, online" while the fader values are hours stale** → MCP/LLM and iPad callers trust
writes against a dead snapshot ("green health + dead writes").

The bridge-side fix (a real mixer-state heartbeat) is a SEPARATE coder-1 lane, verified at the desk.
**THIS lane is the cheap, desk-independent half:** make the read surface HONEST about staleness so no
caller trusts a frozen desk. (coder-2 F-1 FINDINGS rec 3.)

## 2. Scope — additive, read-path only
Add a state-freshness signal to the `bridge` health object that `list_monitor_buses` and `get_mix`
already return (and `get_matrix` if it returns the same bridge block — verify):
- `stateAgeSeconds: number | null` — `(Date.now() - monitor-live/state.updatedAt) / 1000`, rounded;
  `null` if the state doc or its `updatedAt` is missing.
- `stateStale: boolean` — `stateAgeSeconds == null || stateAgeSeconds > STALE_STATE_THRESHOLD_SECONDS`.
- Define `STALE_STATE_THRESHOLD_SECONDS` as a documented constant. Recommend **90** (post-bridge-fix
  the desk should refresh well inside that; until the bridge fix ships an idle desk reads stale — that
  is CORRECT/honest, document it). Pick + justify in a code comment; surface the raw `stateAgeSeconds`
  so callers can apply their own judgment.
- Annotate the tool DESCRIPTIONS (in `index.ts` registration, if descriptions live there) so the LLM
  knows: "if `bridge.stateStale` is true, the mixer values are not live — do not assume writes apply."

Reuse the existing `monitor-live/state` read (`loadMixerState` in `server-monitor.ts`). You will likely
need the doc's `updatedAt` Timestamp, which `loadMixerState` currently drops — extend it (e.g. a
`loadMixerStateMeta` returning `{ snapshot, updatedAt }`, or read `updatedAt` alongside) WITHOUT changing
the existing `loadMixerState` callers' contract. Add a small pure `computeStateAgeSeconds(updatedAt)`
+ reuse `serializeLastSeen`-style coercion (Timestamp | string | null).

## 3. Hard boundaries (do NOT cross)
- **NO `bridge/**` edits.** This is a web-repo lane only.
- **NO auth changes, NO write-behavior changes.** `enqueueCommand`, `isCommandAuthorized`, the gates —
  untouched. `on` and every existing read field PRESERVED (iPad `/monitor` + `useMonitorStore` consume them).
- `src/lib/mcp/errors.ts` and `src/lib/mcp/error-envelopes.ts` are **hard-rule read-only**.
- Additive only — no removed/renamed response fields.

## 4. Files (claims pre-staked in `.coord/shared/claims.md`)
- `src/lib/mcp/tools/monitor.ts` — add `stateAgeSeconds`/`stateStale` to the `bridge` block in
  `listMonitorBuses` + `getMix` (+ `getMatrix` if applicable).
- `src/lib/mcp/server-monitor.ts` — `updatedAt`-aware state load + `computeStateAgeSeconds` helper.
- `src/lib/mcp/tools/index.ts` — ONLY if tool descriptions need the staleness note (append-point; release on push).
Verify these claims are still `released` from the monitor-mcp-polish ship @ 62a287f06 before editing.

## 5. Tests (REQUIRED — proof, not assertion)
- **Emulator:** seed `monitor-live/state` with a stale `updatedAt` (e.g. 3h ago) → assert
  `bridge.stateAgeSeconds` ≈ that age + `bridge.stateStale === true` while `x32Connected`/`status`
  still reflect the (separately-seeded) `config/monitor` heartbeat. Seed a FRESH `updatedAt` →
  `stateStale === false`. Missing-`updatedAt` → `stateAgeSeconds:null, stateStale:true`.
- Cover both `list_monitor_buses` and `get_mix`.
- Determinism: use a fixed clock if you compare exact ages.

## 6. Gates (ALL must pass; paste evidence in SHIP-NOTICE)
- unit + emulator green (cite counts)
- `eslint` clean
- `check:types` in sync
- `next build --webpack` exit 0

## 7. Push protocol
Single-commit narrow lane → cherry-pick FF (READ `master-tip.md` first; if origin moved:
`git fetch && git reset --hard origin/master && git cherry-pick <local-sha>`). Update `master-tip.md`
+ your `status/coder-4.md` + release your claims on push.

## 8. SHIP-NOTICE (to `inbox/auditor.md`) — Tier 1
Include a `## Repros` section. **The live prod frozen state is your deployed fixture:** after deploy,
call `list_monitor_buses` / `get_mix` against `https://www.centralreform.live/api/mcp` (admin
`crl_live_` bearer) and show `bridge.stateAgeSeconds` is large (hours) + `bridge.stateStale:true`
while `bridge.x32Connected:true`/`status:"online"`. Note for the auditor: this Tier-1 deployed repro
needs an admin bearer (Daniel hands one at verify-time).
