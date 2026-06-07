# Bridge Resilience & Remote-Recovery Audit — v10.0.4 prep

- **Auditor:** coder-2 (bridge-resilience-audit lane)
- **Baseline:** `bridge/` @ origin/master `ba7663584` (v10.0.3), read via the detached worktree `sheet-music-app-auditor-validation`
- **Scope:** READ-ONLY. No writes, no commits, no bridge edits, no live OSC (board may be off; service tomorrow AM).
- **Sibling:** coder-3 owns OBSERVABILITY (heartbeat fields / logs / ack surface / blind spots). This doc owns RESILIENCE/RECOVERY. We share ONE proposed bridge-control command channel — see §Coordination.
- **The stakes:** Daniel gets ONE install of v10.0.4, then the studio PC + X32 are **ON but physically inaccessible for ~2 days**, reachable only via Firestore/MCP. Findings are graded through the "don't-destabilize-the-one-box-we-can't-touch" lens: features that REDUCE the chance of an unrecoverable wedge come first; anything that adds a new restart/failure vector is deferred or rejected.

---

## Executive summary

The bridge is **substantially more resilient than the 5/21-outage era** — X32 auto-reconnect with capped backoff, sleep/wake detection, durable install-path-independent credentials, a single-writer lease, state-freshness liveness, and a deferred-update guard that won't restart mid-service are all already in place and tested.

**But for a 2-day unattended window the bridge has three load-bearing gaps:**

1. **An unhandled `"error"` event on the X32 socket can hard-crash the whole process** (`x32-client.ts:205` emits `"error"`; `index.ts` never attaches a listener; there is NO `uncaughtException`/`unhandledRejection` handler anywhere). The most likely trigger is exactly the unattended scenario: the X32 powers off / drops while the bridge keeps probing it every 8s → on Windows, UDP `ECONNRESET` is delivered to the socket → unhandled `"error"` → crash with **no relaunch**. **This is the single highest-value, lowest-risk fix.**
2. **There is NO remote recovery command of any kind.** If the bridge wedges (or even just needs a resync), nothing in Firestore can kick it. A wedge today = wait for physical access. For a box we can't touch for 2 days, this is the core missing capability.
3. **A true process crash has no auto-relaunch** except the Windows login-item (which only helps on a full PC reboot/login, not a process crash). No watchdog.

Everything else (queue stall, confirm-loop hang, lease standby, frozen-state trap) is either already mitigated or remotely *detectable* — but only #2 makes them remotely *recoverable*.

### Recoverability matrix (current state @ ba7663584)

| Wedge / failure mode | Auto-recovers? | Remotely detectable? | Remotely recoverable today? | Fix priority |
|---|---|---|---|---|
| X32 OSC/socket drop (board off, net blip) | ✅ yes — capped-backoff reconnect loop, retries forever @ ≤60s | ✅ `bridge.x32Connected:false` | n/a (self-heals on board return) | — |
| Unhandled socket `"error"` → process crash | ❌ no | ⚠️ only as a stale heartbeat | ❌ no (needs relaunch) | **P0** |
| Process crash (any uncaught throw) | ❌ no (only Win login-item on reboot) | ⚠️ stale `lastSeen` only | ❌ no | **P0/P2** |
| Surprise auto-update restart mid-window | partial guard (deferred-install) | ✅ version field | n/a | **P0 (pin it)** |
| Alive-but-frozen `monitor-live/state` writes | C3 10s state-heartbeat re-set | ✅ `x32Connected:false` (C5/B3 cross-check) | ❌ no kick available | **P1** |
| Command-queue stall | ✅ listener re-establishes @5s; batch timer self-rearms | ⚠️ indirect | ❌ no kick | P1 (resync) |
| Confirm/ack loop hang | ✅ all timers self-clear (1.5s) | — | n/a | — |
| Lease stuck in STANDBY (2nd bridge) | ✅ 20s re-acquire; single-instance lock prevents same-PC dup | ⚠️ no published lease state | ❌ no | low |
| Config snapshot listener dies on error | ❌ no resubscribe (unlike command listener) | ❌ no | ❌ no | P3 |
| Hung Firestore role read blocks queue | ⚠️ no timeout on the read | ❌ no | ❌ no | P3 |
| Missing creds after update | ✅ durable userData + self-migration (Bug#1) | ✅ `require-setup` / no heartbeat | ❌ no (needs JSON drop) | low (already fixed) |

---

## Q1 — X32 reconnect on OSC/socket drop

**Verdict: GOOD. Auto-reconnects with capped exponential backoff; recovers after arbitrarily long drops; does not wedge.**

- **Liveness probe:** `startKeepalive()` sends `/xinfo` immediately then every **8s** (`x32-client.ts:286-294`). The X32 answers `/xinfo`, so every reply bumps `lastMessageAt` (`x32-client.ts:198`). This actively solicits traffic on a quiet console (the BR-02 fix — an idle-but-healthy desk no longer looks dead).
- **Drop detection:** `startHealthCheck()` runs every 5s; if `Date.now() - lastMessageAt > 20000` (≈2+ missed keepalives) it marks `connected=false`, emits `"disconnected"`, and calls `attemptReconnect()` (`x32-client.ts:296-315`).
- **Reconnect loop:** `attemptReconnect()` (`x32-client.ts:324-375`) probes `/xinfo` with a 5s response timeout, backing off `INITIAL_BACKOFF=2000` → doubling → `MAX_BACKOFF=60000` (`x32-client.ts:143-144`). The loop is `while (!this.shouldStopReconnecting)` — it **never gives up**, so a minutes/hours drop just retries every ≤60s until the board returns. On success it sets `connected=true`, resets backoff, emits `"reconnected"`.
- **Post-reconnect resync:** `index.ts:174-177` — on `"reconnected"`, `x32.syncFullState(monitorBuses)` re-reads the desk so published state matches reality.
- **Socket reuse:** reconnect reuses the persistent UDP socket (never re-bound/closed except in `disconnect()`); correct for connectionless UDP.
- **Tested:** `bridge/src/__tests__/reconnect.test.ts`, `health-keepalive.test.ts` exist.

**Caveat (feeds Q2/P0):** the reconnect machinery handles a *silent* drop well, but a socket that emits an **`"error"`** (not silence) bypasses all of this and crashes the process — see Q2.

---

## Q2 — Process resilience (watchdog / crash relaunch / sleep / net loss)

**Verdict: PARTIAL → this is where the unattended risk concentrates.**

What exists:
- **Single-instance lock** — `app.requestSingleInstanceLock()` (`main.ts:47-57`); a second launch focuses the existing window and quits.
- **Auto-start on Windows login** — `app.setLoginItemSettings({openAtLogin:true, ...})` (`main.ts:61-70`). Helps after a **reboot+login**, NOT after a bare process crash.
- **Sleep/wake detection** — the 60s heartbeat loop measures tick gap; `elapsed > 90_000` ⇒ "wake detected", re-detects IP, lets the X32 health loop reconnect (`index.ts:181-202`). Good.
- **DHCP guard** — re-publishes `bridgeUrl` on IP change (`index.ts:204-210`).
- **Heartbeat never crashes the bridge** — `writeHeartbeat`/`writeOffline` are timeout-raced + swallow errors (`config.ts:150-189`).

What's MISSING (gaps):
- **No `process.on('uncaughtException')` / `process.on('unhandledRejection')`** anywhere (grep: none). Any uncaught throw in the Electron main process kills the bridge with no relaunch.
- **No `x32.on("error")` listener.** `x32-client.ts:202-205` does `this.emit("error", err)` on socket error; `index.ts` registers only `"disconnected"`/`"reconnected"`. **An EventEmitter `"error"` with no listener throws** → uncaught → crash. On Windows, sending UDP to a host whose port is closed (X32 powered off — the literal unattended scenario) commonly delivers `ECONNRESET` to the socket on a subsequent operation → `"error"` emit → crash. **This is the most plausible silent-death path for the window.**
- **No watchdog / auto-relaunch** on crash. Electron's `render-process-gone` / `child-process-gone` are not handled. A crashed main process can only come back via the Windows login-item (i.e., a PC reboot+login), which won't happen unattended.

**Net:** transient network loss and PC sleep are handled. A *crash* — and the unhandled `"error"` is a real, scenario-specific way to get one — is **not** survivable remotely.

---

## Q3 — Remote recovery (restart / reconnect / resync)

**Verdict: NONE EXISTS.** Grep for `bridge.restart|bridge.reconnect|bridge.resync|bridgeControl|forceReconnect|selftest`: zero hits.

The only Firestore→bridge inbound channel today is `monitor-live/commands/pending` (`firestore-transport.ts:212-240`), and it ONLY accepts X32 control verbs (`set_bus_master`, `set_send_level`, `set_send_on`, `set_matrix_fader`, `set_matrix_on` — `firestore-transport.ts:383-399`). Anything else is rejected by `confirmKeyFor` (`:421-446`). There is no way to tell the bridge "resync", "drop+reconnect the socket", or "restart yourself".

### Lowest-risk way to add recovery commands

**Recommended: a new optional field `config/monitor.bridgeControl` watched by the EXISTING config listener.** Rationale: `config.startWatching()` already attaches a `config/monitor` snapshot listener (`config.ts:60-73`) and `index.ts` already wires `config.onChange(...)` (`index.ts:272-282`). Adding a `bridgeControl` branch there is purely additive, touches no part of the X32 command-execution path, and is admin-write-gated by the existing firestore.rules on `config/monitor`. Shape:

```jsonc
// config/monitor.bridgeControl  (admin-write)
{ "action": "resync" | "reconnect" | "restart",
  "nonce": "<uuid>",          // dedup: bridge ignores a nonce it already ran
  "requestedAt": <serverTs>,
  "requestedBy": "<uid>" }
```

Handler sketch (in `index.ts`'s `config.onChange`, after a `lastHandledNonce` guard):
- **`resync`** *(safest — do this one first)*: `await x32.syncFullState(cfg.monitorBuses); await transport.writeFullState();` — no socket churn, no restart. Cures the frozen-state trap (Q5a) and any drift.
- **`reconnect`**: add a tiny public `X32Client.forceReconnect()` that flips `connected=false`, emits `"disconnected"`, and calls the existing `attemptReconnect()`. Recovers a wedged socket without a process restart.
- **`restart`** *(heaviest hammer, last resort)*: `app.relaunch(); app.exit(0)` from `main.ts` (exposed via an IPC or a callback handed to `index.ts`). Safe-ish only because relaunch re-spawns the process; still a brief outage. This is the ONLY remote lever if the process is *alive-but-stuck*.

I rejected routing recovery verbs through `monitor-live/commands/pending`: its auth is per-bus ownership (`isCommandAuthorized`, `firestore-transport.ts:509-530`), its ack/confirm machinery is X32-shaped, and bridge-control verbs would need a parallel auth+exec path — more blast radius than a watched config field for the same outcome.

**Dependency:** if recovery rides `config.onChange`, the config listener must survive a transient error — today it does NOT resubscribe (Q5/P3). Bundle that fix.

---

## Q4 — Auto-update during an unattended window

**Verdict: mostly safe by construction, but PIN it for v10.0.4 to remove all doubt.**

- **Update checks are NOT periodic.** `checkForUpdates()` runs once at startup (`main.ts:96`, in `ready-to-show`) and on the manual tray item (`main.ts:165`). There is no `setInterval` polling it (the two intervals in `main.ts:254`/`:434` are the idle-install watch and UI status push). So mid-window, with no restart, the bridge does **not** poll GitHub again.
- **Install is deferred, never mid-service (BR-03).** `autoDownload=true` but `update-downloaded` only sets `pendingUpdateVersion` and defers (`main.ts:277-326`). Install happens only when: (1) X32 disconnected for **30 continuous minutes** (`IDLE_MINUTES_BEFORE_AUTO_INSTALL`, `main.ts:229`, `startIdleInstallWatch` `:251-275`); (2) manual tray/dashboard install; or (3) next app quit (`autoInstallOnAppQuit=true`).
- **Why it's *mostly* safe for the window:** after Daniel installs v10.0.4 (the latest release), the next startup's single `checkForUpdates()` finds nothing newer ⇒ no download ⇒ `startIdleInstallWatch()` never starts ⇒ no auto-restart, even if the board goes idle.
- **Residual risks worth removing:**
  - If *any* newer release is published to `RavBogard/sheet-music-app` during the window **and** the bridge restarts (re-running startup `checkForUpdates`), it would download and could later auto-install on a 30-min idle window — an unattended restart.
  - An auto `quitAndInstall` (silent NSIS, `main.ts:245`) could hit the same SmartScreen/installer-stall class seen on 5/21, leaving the bridge **down** with no one to click through it. The deferred-install logic reduces *when* this fires but not *that it can*.

**Recommendation (PIN for this build):** for v10.0.4, set `autoUpdater.autoDownload = false` and skip the startup `checkForUpdates()` (gate both behind an env flag, e.g. `BRIDGE_DISABLE_AUTOUPDATE=1`, default-on for this build). Net effect: nothing downloads → nothing to install → zero self-restart vector for 2 days. The manual tray "Check for Updates" remains for when Daniel is back. This is pure subtraction of a failure mode — exactly the right risk posture for the unattended box.

---

## Q5 — Wedge taxonomy (how it can go zombie) + recoverability

For each: **R** = remotely recoverable today, **D** = remotely detectable today.

**(a) Fresh heartbeat + FROZEN `monitor-live/state` writes** ([[project_bridge_state_freshness_diagnostic]]).
- *Mitigated/detectable:* the C3 state-heartbeat re-`.set()`s the cached snapshot every 10s (`firestore-transport.ts:129-132`, `STATE_HEARTBEAT_MS`), so idle alone no longer freezes state. If the state-write path genuinely wedges, `getStateAgeMs()` grows and the 60s heartbeat publishes `x32Connected = socketAlive && stateFresh` = **false** (C5/B3 cross-check, `index.ts:218-220`) — so a remote observer sees `x32Connected:false` while `status:online`. **D: yes. R: no** (no kick exists) → needs `bridge.resync`/`restart`.
- Note: a *total* Firestore outage freezes both the state write AND the heartbeat write together (both swallow on failure), so `lastSeen` also stalls — distinguishable from the "alive but frozen" case where `lastSeen` keeps advancing.

**(b) Command-queue stall.** Listener re-establishes 5s after an `onSnapshot` error (`firestore-transport.ts:232-236`); `processCommandBatch` nulls its timer at the top so `queueCommand` re-arms (`:247-253`); idempotency map blocks double-apply. **Robust.** Residual: `processCommand` awaits `getIsEngineer` whose `users/{uid}` read has **no timeout** (`firestore-transport.ts:550`) — a hung read on a cache miss could stall the batch (cache TTL 30s limits exposure). **D: weak. R: no** (resync doesn't clear it; restart would).

**(c) Confirm/ack loop hang.** C2 read-backs are fire-and-forget; pending acks self-timeout at 1.5s (`firestore-transport.ts:463-468`); confirm timers self-clear. **No hang risk.**

**(d) Reconnect "stuck" retrying.** Not a zombie — the loop correctly retries ≤60s forever and recovers when the board returns (Q1). Only a problem if paired with the Q2 crash vector.

**(e) Lease stuck in STANDBY.** If a second bridge ever held the lease, this one won't drive the X32 until it re-acquires (every 20s, `index.ts:254-266`). Single-instance lock prevents a same-PC duplicate; only a second *PC* could cause it — not in play for the studio. **R: self-heals in ≤20s once the other frees it; D: no** (lease state isn't published in the heartbeat — a small obs gap for coder-3).

**(f) Process crash / unhandled `"error"`.** Covered in Q2. **D: only as a stale `lastSeen`. R: NO.** The worst wedge: needs physical access (or an external PC-level relaunch). Mitigations: the P0 error-guard (prevents the most likely crash) + an optional watchdog.

**(g) Config snapshot listener dies on error.** `config.ts:70-72` logs the watch error but does **not** resubscribe (the command listener *does*, `firestore-transport.ts:232-236`). After such an error the bridge stops reacting to config changes (bus assignments, X32 address) and — if recovery rides `config.onChange` (Q3) — would also miss recovery commands. **D: no. R: no.** Low likelihood mid-window but it undermines the recovery channel, so fix it alongside Q3.

---

## Prioritized v10.0.4 additions (recoverability-first, low-risk lens)

> Ordering rule: things that *remove* a failure mode or *add* a remote lever, with the smallest blast radius, come first. Anything that introduces a new restart/exec path is deferred or human-gated.

| # | Priority | Change | Risk | Why it earns a slot in the one-shot build |
|---|---|---|---|---|
| 1 | **P0** | Add `x32.on("error", logSwallow)` in `index.ts` + `process.on('uncaughtException')` & `('unhandledRejection')` last-resort loggers in `main.ts` | **tiny / pure-additive** | Closes the single most likely silent-crash path (Windows UDP `ECONNRESET` when the board powers off mid-window). No behavior change when healthy. |
| 2 | **P0** | Pin auto-update: `autoDownload=false` + skip startup `checkForUpdates()` for this build (env-gated) | **subtractive** | Removes every self-restart/installer-stall vector for 2 days. Manual check still available later. |
| 3 | **P1** | Recovery command **`bridge.resync`** via `config/monitor.bridgeControl` watched by existing `config.onChange` (nonce-deduped) | **low** | Safest remote lever: cures frozen-state (5a) + drift with no socket churn or restart. Reuses an existing listener. |
| 4 | **P1** | Re-establish the **config snapshot listener on error** (mirror the command-listener resubscribe) | **low** | Makes the recovery channel (#3) reliable; fixes wedge (5g). |
| 5 | **P1** | Recovery command **`bridge.reconnect`** (+ small public `X32Client.forceReconnect()`) | **low-med** | Recovers a wedged socket without a process restart. |
| 6 | **P2** | Recovery command **`bridge.restart`** (`app.relaunch(); app.exit(0)`) | **med** | The only remote lever for an *alive-but-stuck* process. Recoverable because relaunch re-spawns; brief outage. |
| 7 | **P2** | Optional crash watchdog: handle `render-process-gone`/`child-process-gone` (→ relaunch) | **med** | Helps for renderer/child crashes. NOTE: a *main*-process crash can't relaunch itself — the real net is an external Win Task Scheduler "restart-if-not-running" task (**Daniel-side config, not bridge code** — flag it). |
| 8 | **P3** | Add a timeout to the `users/{uid}` role read in `getIsEngineer` (`firestore-transport.ts:550`) | **tiny** | Prevents a hung read from stalling the command batch (5b). |

**Minimum viable v10.0.4 if time is tight:** ship **#1 + #2 + #3 + #4**. That converts "a board-power-off can silently kill the bridge for 2 days" into "stays alive, and we can remotely resync if it drifts" — with no new restart vectors. #5/#6 add stronger remote levers if the schedule allows.

---

## Coordination with coder-3 (shared command surface)

We both need a Firestore→bridge control channel. **Proposal: ONE shared channel** = `config/monitor.bridgeControl { action, nonce, requestedAt, requestedBy }`, dispatched by `action`, deduped by `nonce`, watched by the existing `config.onChange` listener (with the #4 resubscribe fix making it reliable):

- **coder-2 (recovery) owns:** `action: "resync" | "reconnect" | "restart"` (the verbs above).
- **coder-3 (observability) owns:** `action: "selftest"` (write a diagnostic snapshot back to Firestore) and any obs response payloads/ack.

This avoids two competing control surfaces. coder-3: if you'd rather route `selftest` through `monitor-live/commands/*` for ack symmetry with `get_command_status`, flag it — but I recommend the single config-field channel for blast-radius reasons (see Q3). Open question for the supervisor/Daniel: which channel, and whether `restart` ships in v10.0.4 or is held as too heavy for the one-shot.

---

## Out of scope / what I did NOT do

- No live OSC, no Firestore writes, no reads of live `monitor-live/*` (board may be off; SE turf + service tomorrow). coder-3 is doing the permitted READ-ONLY Firestore reads.
- No code changes, commits, or branch — this lane is a research deliverable only.
- Heartbeat field-by-field schema, log/error sink design, and the ack lifecycle detail are coder-3's deliverable; I reference them only where they bear on recovery.
