# P0-B2 — Live query-after-write monitor probe

`scripts/monitor-live-probe.mjs` — the **autonomous live half** of the Monitor
Overhaul self-test oracle (PROGRAM-SPEC §3). Companion to the faithful X32 mock
(P0-B1, the CI half). The X32's own query/response is ground truth: *"did the
desk actually change, per the desk itself."*

It snapshots a monitor bus → writes via **both** the iPad command-queue path and
the MCP path → reads the desk back → confirms `monitor-live/state` reflects it →
**restores byte-identical** → emits PASS/FAIL per assertion + the
command→state round-trip latency.

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

## Examples

```bash
# Full probe (both paths + restore), service account on disk:
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

## Interpreting the result

- **`REPORTS REAL STATE: control path LIVE, readback BROKEN`** — the expected
  pre-Phase-1 verdict. `F4-ipad-write-drained` PASS (the bridge consumed the
  command) + `F5-state-reflects` FAIL (state never reflected it). Exit 0 — the
  *probe* worked; the *system* has the R1/R2/R3 defect Phase 1 fixes.
- **`FULLY GREEN`** — Phase-1 contract met: control applied **and** readback
  reflected within budget. This is the program's acceptance signal.
- **`STOP: …`** — a precondition failed; nothing was written. Exit 1.

`latency enqueue→bridge-drain` is the control-path liveness baseline;
`latency enqueue→state-reflect` is the readback baseline (N/A pre-Phase-1).
These feed the deferred PROGRAM-SPEC §6 latency targets.

## Scheduling

Run on-demand per lane and on a schedule (the studio desk is "always on, poke
freely" outside services). A scheduled wrapper must pass `CRL_MCP_TOKEN` + the
Firestore credential + `PROBE_BUS`/`PROBE_RESTORE_VALUE` for the bus it owns,
and rely on the built-in service-time guard.
