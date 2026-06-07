# m0-companion-verify — Findings

**Agent:** m0-companion-verify (one-shot research)
**Date:** 2026-05-17
**Machine:** Daniel's dev box (Windows 11, hostname not captured)
**Branch:** `research/m0-companion-verify`

---

## Verdict

**Cannot answer the scoping question yet — Bitfocus Companion is NOT running on this machine.**

No process matching `companion` / `bitfocus` exists, and no TCP listener is bound on any of the ports Companion is known to use (8000, 8001, 8080, 8088, 16622–16624, 9999). Every empirical probe in the brief depends on a reachable HTTP API at `http://127.0.0.1:8000/api/*`, so all eight verification questions are blocked.

Per the brief's standing rule — *"If Companion is NOT reachable, report that + stop. Don't try to fix."* — I'm stopping here and flagging the premise mismatch back to Daniel rather than attempting to install, launch, or configure Companion myself.

---

## Evidence

### Reachability probes

**TCP connect to 127.0.0.1:8000** (default Companion HTTP API port):

```
> Test-NetConnection -ComputerName 127.0.0.1 -Port 8000 -InformationLevel Quiet
False
```

**curl to the HTTP root:**

```
> curl -s -m 5 -w "HTTP_CODE:%{http_code}\nTIME:%{time_total}\n" http://127.0.0.1:8000/
HTTP_CODE:000
TIME:2.001337
(exit code 7 — "Failed to connect")
```

**Port sweep across every port Companion has used historically:**

```
> $ports=8000,8001,8080,8088,16622,16623,16624,9999
> foreach($p in $ports){
>   $r = Test-NetConnection -ComputerName 127.0.0.1 -Port $p -InformationLevel Quiet
>   "$p`t$r"
> }
8000    False
8001    False
8080    False
8088    False
16622   False
16623   False
16624   False
9999    False
```

Zero of eight candidate ports are accepting connections.

### Process scan

```
> Get-Process | Where-Object { $_.ProcessName -match 'comp|bitf|x32|node|electron' }
```

→ Many `node` processes (this is a Node-heavy dev environment with multiple worktrees running build/dev/test toolchains), zero processes matching `companion`, `bitfocus`, `x32`, or `electron`. No Companion app instance is alive.

A broader filename search across `C:\Program Files\` and `C:\Program Files (x86)\` for `companion*.exe` was not run because the brief explicitly tells me not to try to fix the situation — that's a Daniel-side action.

---

## Blocked questions

All eight verification questions in the brief depend on a reachable HTTP API. Marking each blocked rather than empty so the supervisor can see exactly what's deferred:

| # | Question | Status |
|---|---|---|
| 1 | Companion HTTP API reachability + version | ❌ Blocked — no listener |
| 2 | X32 module connection state | ❌ Blocked — no API |
| 3 | X32 module variable surface (faders, mutes, sends, routing) | ❌ Blocked — no API |
| 4 | X32 module action surface (write-side, esp. send level/mute, bus routing) | ❌ Blocked — no API |
| 5 | Read+write round-trip latency on a safe bus | ❌ Blocked — no API + no Daniel-designated safe bus yet |
| 6 | Burst latency of 16 cell writes | ❌ Blocked — no API |
| 7 | Auth surface check on `/api/*` | ❌ Blocked — no API |
| 8 | Parameterized button + custom variable round-trip | ❌ Blocked — no API + would need a Daniel-configured button |

The two questions that would *also* have needed a Daniel chat exchange even if Companion were up (Q5's safe-bus designation and Q8's potential need for a Daniel-configured button) are noted so they don't surprise the next attempt.

---

## Recommendation to supervisor

**Do not scope m1-monitor-control yet.** The whole Companion-as-bridge premise is unverified. Specifically:

1. **Resolve the premise mismatch with Daniel** before relaunching this research task. He said Companion was already running on this computer; it isn't. Possibilities, in rough likelihood order:
   - Companion is installed but not auto-started → he launches it, we retry.
   - Companion was on a different machine on the LAN (e.g., a dedicated show-control box) and the localhost assumption is wrong → we need the real host:port + a way for the MCP layer to reach it (firewall, mDNS, etc.).
   - Companion isn't installed yet → install + initial X32 module wiring is a prerequisite phase, not a research phase.

2. **Once Companion is reachable, re-run this exact brief.** All eight questions are still the right discovery surface; nothing in the brief is wrong.

3. **Three sub-questions for Daniel that the brief implicitly assumes but we never confirmed:**
   - Which bus index is *safe* for the round-trip write test (Q5)? Brief defaults to bus 16 but he should confirm bus 16 isn't routed to a live IEM right now.
   - Is the X32 module instance already configured + connected to the console in Companion's UI, or is "module is installed" all we know? Q2 distinguishes "module loaded" from "module → console link is OK," and a freshly installed module with no instance configured would also produce empty variable enumerations even with a reachable API.
   - For Q8, is there an existing parameterized button on a known page/row/col we can press, or do we need him to add one? The brief assumes "if a suitable button is already configured" — we should pin that down.

4. **Standing-rule reminder for the eventual m1 implementer:** Companion's HTTP API has no auth. Any MCP tool that calls it from the app's server must enforce its own auth gate (mirror `useMonitorAccess` per the project's existing convention) — the HTTP surface itself will accept anything, so the gate has to live in the MCP tool layer.

---

## What I did NOT do (deliberate)

- Did not attempt to install Companion.
- Did not attempt to start Companion or look for an auto-start config.
- Did not touch any X32 console settings.
- Did not modify any file outside `.coord/research/`.
- Did not touch `.coord/agents.md`, `.coord/SUPERVISOR.md`, or any implementer status file.
- Did not interact with `bridge/**` or any MCP-workstream "do-not-touch" zone.

— from m0-companion-verify
