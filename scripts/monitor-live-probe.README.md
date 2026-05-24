# P0-B2 — Live query-after-write monitor probe

`scripts/monitor-live-probe.mjs` — the **autonomous live half** of the Monitor
Overhaul self-test oracle (PROGRAM-SPEC §3). Companion to the faithful X32 mock
(P0-B1, the CI half). The X32's own query/response is ground truth: *"did the
desk actually change, per the desk itself."*

It snapshots a monitor bus → writes via **both** the iPad command-queue path and
the MCP path → reads the desk back → confirms `monitor-live/state` reflects it →
**restores byte-identical** → emits PASS/FAIL per assertion + the
command→state round-trip latency.

The F-tier snapshot is captured at the **top of `main()`**, BEFORE the M-tier
MCP write, so the byte-identical restore returns the desk to the TRUE pre-probe
value rather than the post-M4 quantized readback. A `F3-restore-untainted`
assertion refuses the F-tier write if the resolved restore value is ~equal to
`PROBE_TEST_VALUE` and no operator `PROBE_RESTORE_VALUE` was supplied — that
combination is the signature of someone having reverted the snapshot ordering.

Today (pre-Phase-1) it **reports the real state**: control reaches the desk but
readback does not reflect own-writes (R1) and/or the idle snapshot is stale (R2)
and/or `buses` is array→map corrupted (R3). After Phase 1 the *same* probe
should go fully green — it is the standing regression oracle for the program.

## Why `scripts/`, not `e2e/`

This is a standalone operational diagnostic against **production** Firestore +
the **real X32**, run on-demand and on a schedule — not a browser test. It lives
beside the existing `scripts/probe-*.mjs` operational probes. `e2e/` is reserved
for Playwright specs that drive a browser; this drives the MCP HTTP surface and
the Firestore command bus directly, headless, with no browser.

## The two write paths

| Path | How | Behaviour under R3 corruption |
|------|-----|-------------------------------|
| **(ii) MCP** | `set_bus_fader` over `/api/mcp` | **Refused** — `preflightBusWrite` validates the busIndex against the (corrupt) live state → `invalid_bus_index`, `validBusIndices:[]`. |
| **(i) iPad** | direct `addDoc(monitor-live/commands/pending, {type,busIndex,value,uid,createdAt})` — exactly as `src/lib/firestore-monitor-client.ts` | **Reaches the bridge** — bypasses MCP validation; the bridge authorizes per `config/monitor.busAssignments`. This is the North Star surface. |

## Credential tiers

- **MCP tier** (always runs; needs only the bearer): `tools/list`, dogfood
  child-bearer **mint → probe → revoke** + post-revoke 401, `list_monitor_buses`,
  `get_mix`, `set_bus_fader`. Fully headless with just `CRL_MCP_TOKEN`.
- **Firestore tier** (raw `monitor-live/state` + `config/monitor` reads, the
  iPad-path `addDoc`, bridge-drain + state-reflect latency, byte-identical
  restore). Needs Firebase admin credentials; **skipped with a clear message**
  if none are present. Credential sources, in priority order:
  1. `GOOGLE_APPLICATION_CREDENTIALS` — path to a service-account JSON (ADC)
  2. `FIREBASE_SERVICE_ACCOUNT` — inline service-account JSON
  3. `FIREBASE_CLIENT_EMAIL` + `FIREBASE_PRIVATE_KEY` (+ project id) — the trio
     the app's `initAdmin()` uses
  4. Application Default Credentials (`gcloud auth application-default login`)

## Safety (hard rules, enforced in code)

- **Service-time guard FIRST** — CRC services are Friday evening + Shabbat
  morning (America/Chicago). The probe refuses inside a window unless
  `PROBE_ALLOW_SERVICE_WINDOW=1`.
- **Monitor/IEM buses only** — never FOH / matrix outputs.
- **Reversible** — snapshots the target value and restores it byte-identical,
  then verifies. Because R3 can hide the live value, the restore value is
  provided explicitly via `PROBE_RESTORE_VALUE` and the probe **refuses to write
  a value it cannot restore** (no restore value + unreadable snapshot ⇒ STOP).
- **STOP + report** on any failed precondition (desk stale, X32 down, in a
  service window, no bearer, no restore value for the write tier).

## Environment / arguments

| Var | Default | Meaning |
|-----|---------|---------|
| `CRL_MCP_TOKEN` | — (required) | Seed **ROOT** `crl_live_` admin bearer. Mints the short-lived child the probe actually uses. |
| `CRL_MCP_ENDPOINT` | `https://www.centralreform.live/api/mcp` | MCP HTTP endpoint. |
| `PROBE_BUS` | caller's first owned bus | Target **monitor** bus index. |
| `PROBE_TEST_VALUE` | `0.5` | Fader value (0–1) to set during the nudge. |
| `PROBE_RESTORE_VALUE` | readable snapshot, else **required** | Value to restore the bus to (byte-identical target). |
| `PROBE_UID` | first bus owner in `config/monitor` | uid stamped on the iPad-path command (must be bridge-authorized for the bus). |
| `PROBE_ALLOW_SERVICE_WINDOW` | `0` | Set `1` ONLY to override the service-time guard. |
| `GOOGLE_APPLICATION_CREDENTIALS` / `FIREBASE_SERVICE_ACCOUNT` / `FIREBASE_CLIENT_EMAIL`+`FIREBASE_PRIVATE_KEY` | — | Firestore-tier credentials (see above). |

Flags: `--mcp-only` (skip Firestore tier), `--dry-run` (no desk writes — snapshot
+ report only), `--json` (emit the machine-readable result object).

> **⚠ Always load `.env.local` via `node --env-file=`** when running locally.
> Node does NOT auto-source `.env.local`, so without the flag the Firestore-tier
> credentials are not visible to the probe and it falls back to ADC (which fails
> if `gcloud auth application-default login` was never run). The M-tier MCP write
> still goes through in that fallback — meaning the desk gets perturbed but the
> F-tier byte-identical restore never runs. **Always pass `--env-file=.env.local`
> (or export the creds yourself) before any probe run that crosses the M-tier
> write boundary.** (Bit `monitor-probe-nit2-fix` smoke 2026-05-24 — recovered
> via the `desk-restore-true-original.mjs` follow-up helper.)

## Examples

```bash
# Full probe (both paths + restore), credentials from .env.local:
CRL_MCP_TOKEN=crl_live_<root> PROBE_BUS=5 \
node --env-file=.env.local scripts/monitor-live-probe.mjs

# Full probe with service account on disk (no .env.local needed):
CRL_MCP_TOKEN=crl_live_<root> \
PROBE_BUS=5 PROBE_TEST_VALUE=0.5 PROBE_RESTORE_VALUE=0.75 \
GOOGLE_APPLICATION_CREDENTIALS=./service-account.json \
node scripts/monitor-live-probe.mjs

# Bearer-only (no Firestore creds): MCP read + the MCP-write-blocked-by-R3
# evidence + dogfood mint→revoke; Firestore write tier is skipped:
CRL_MCP_TOKEN=crl_live_<root> node scripts/monitor-live-probe.mjs --mcp-only

# Validate plumbing with zero desk impact (mint → read → revoke, no writes):
CRL_MCP_TOKEN=crl_live_<root> node scripts/monitor-live-probe.mjs --dry-run
```

## v10.0.4 surface tier (V1-V5) + stress tier (V6-V9)

Added 2026-05-24 by lane `monitor-stress-v1004-probe` (master `4537463cc`+):
the probe now also stress-tests the v10.0.4 unattended-remote observability
surface that shipped at `6a313f5dd`. Both tiers run automatically when the
Firestore tier is enabled (no flag needed).

**V1-V5 — read-only surface verification (runs BEFORE the F-tier write):**

| ID | What it asserts |
|----|-----------------|
| `V1-heartbeat-fields-present` | All 10 O2 fields in `config/monitor.bridge`: `socketAlive`, `stateAgeMs`, `unconfirmedCount`, `lastOscRxAt`, `lastStateWriteAt`, `startedAt`, `uptimeMs`, `queueDepth`, `errCount`, `lastError`. |
| `V2-heartbeat-fields-sane` | Type/range sanity on the O2 fields (non-negative numerics, boolean for `socketAlive`, `{msg,ts}` shape for `lastError`). |
| `V3-get-bridge-health` | O3 `get_bridge_health` MCP tool returns `{ok:true, alive, lastSeenAgeS, stateAgeS, …}`. Trusted-leader gated; the probe's minted child bearer (admin-equiv) passes. |
| `V4-selftest` | O4 `monitor-live/selftest` shape + freshness. Soft PASS when absent (the doc is only populated when `bridgeControl.action='selftest'` fires; the v10.0.5 MCP wrappers are code-complete-but-unpublished). |
| `V5-bridgeLog-ring` | O1 `monitor-live/bridgeLog` ring buffer (≤50 entries) + `errCount`/`bridgeVersion`/`lastError` shape. Soft PASS when absent (no error/warn since boot = clean run). |

**V6-V9 — stress tier (runs AFTER the F-tier restore, no further desk motion):**

A 3-command burst at `restoreValue` (the bus is already there post-F-tier
restore — same value = zero desk motion). This is the live oracle for v10.0.4's
queue-bounding + freshness-divergence promises.

| ID | What it asserts |
|----|-----------------|
| `V6-burst-applied` | All 3 rapid commands reach terminal `applied` within `drainTimeoutMs` (no silent drops). |
| `V7-queue-bounded` | Post-drain `queueDepth ≤ 5` and `unconfirmedCount ≤ 10` on the heartbeat. |
| `V8-state-not-frozen` | `monitor-live/state.updatedAt` advanced during the stress window (NOT just `config/monitor.bridge.lastSeen` heartbeat). This is the [[project_bridge_state_freshness_diagnostic]] failure mode — heartbeat fresh + state frozen = writes silently no-op. |
| `V9-errcount-stable` | `bridge.errCount` delta during the probe window = 0 (legacy errCount baseline is captured at V-tier entry). A jump means the bridge logged an error mid-probe; cross-reference `bridgeLog.entries[]`. |

**Skipped when:**
- `--dry-run` (V6-V9 stress tier requires writes; V1-V5 still run)
- Firestore tier skipped (no admin creds) — V1-V5 + V6-V9 all skipped together (V3's MCP call would still work, but V1/V2/V4/V5 need raw reads)

## Interpreting the result

- **`REPORTS REAL STATE: control path LIVE, readback BROKEN`** — the expected
  pre-Phase-1 verdict. `F4-ipad-write-drained` PASS (the bridge consumed the
  command) + `F5-state-reflects` FAIL (state never reflected it). Exit 0 — the
  *probe* worked; the *system* has the R1/R2/R3 defect Phase 1 fixes.
- **`FULLY GREEN`** — Phase-1 contract met: control applied **and** readback
  reflected within budget. This is the program's acceptance signal.
- **`V10.0.4 SURFACE: FULLY VERIFIED`** — all V1-V5 reads + V6-V9 stress pass.
- **`V10.0.4 SURFACE: ISSUES — V-fail=[…] stress-fail=[…]`** — list of failing
  V-IDs; cross-reference REPORT.md for the issue category.
- **`STOP: …`** — a precondition failed; nothing was written. Exit 1.

`latency enqueue→bridge-drain` is the control-path liveness baseline;
`latency enqueue→state-reflect` is the readback baseline (N/A pre-Phase-1).
These feed the deferred PROGRAM-SPEC §6 latency targets.

## Scheduling

Run on-demand per lane and on a schedule (the studio desk is "always on, poke
freely" outside services). A scheduled wrapper must pass `CRL_MCP_TOKEN` + the
Firestore credential + `PROBE_BUS`/`PROBE_RESTORE_VALUE` for the bus it owns,
and rely on the built-in service-time guard.
