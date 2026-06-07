# bridge-v1004-stress — LIVE-VERIFIED v10.0.4 soak FINDINGS

**Lane:** bridge-v1004-stress (Tier-0 READ-ONLY observability soak + LIMITED bridgeControl R2/R3 probes)
**Author:** coder-2 (parallel-agent system)
**Ship time:** 2026-05-23T19:52Z
**Reconstructed:** 2026-05-23T20:36Z from the SHIP-NOTICE in `.coord/inbox/supervisor.md` after the prior worktree was torn down with an untracked draft of this file in it. The SHIP-NOTICE is the canonical content source; this file is the durable replay + a continuity snapshot from T+44min post-ship confirming the bridge has remained healthy in the meantime.
**Deployed-surface baseline:** bridge `v10.0.4` @ `6a313f5dd`, build `ProductionDSKTP-34444-5fafab1c @ 192.168.1.201`, X32 `192.168.1.78:10023`.

---

## Soak window

- **Start:** 19:22Z (ACK → first heartbeat read)
- **Ship:** 19:52Z (after assembly of this report's per-finding verdicts)
- **Continuity sample (post-ship, this file):** 20:34Z — bridge still alive, uptime 12,421,088 ms = 3h27m wall-clock, uninterrupted since boot at 17:06:33Z.

7 captured heartbeat ticks across 30 min + R2 (observed via coder-1's parallel fire) + R3 + O4 fires. No anomalies. No process restart. Uptime advanced 8.22M → 9.85M ms (= +27.1 min wall-clock) over the soak; +0.78h additional through 20:34Z = clean continuous run.

---

## Per-finding verdict

### O1 — `monitor-live/bridgeLog` (remote error ring buffer)
**LIVE-VERIFIED.** Bounded 50-entry ring, rate-limited (5s debounced flush), fail-open silent (no console recursion). 8 boot entries (2× Node DEP warnings + 6× lease-takeover STANDBY warns) + 2 entries from my R3 fire (`[X32] Forced reconnect requested (remote bridgeControl)` + `[Bridge] X32 connection lost — fader changes will not work until reconnected`). No spam. No info-level entries from O4 selftest (correctly excluded by error/warn filter).

### O2 — heartbeat diagnostics (additive `config/monitor.bridge` fields)
**LIVE-VERIFIED.** All new fields publishing: `socketAlive`, `stateAgeMs`, `unconfirmedCount`, `queueDepth`, `lastOscRxAt`, `lastStateWriteAt`, `startedAt`, `uptimeMs`, `errCount`, `lastError`. Throttle fix `8fb8cd62a` held `unconfirmedCount:0` through both R2 resync and R3 reconnect's `syncFullState` bursts and through cold boot. Continuity probe at 20:34Z: all fields still publishing, `unconfirmedCount` still 0.

### O3 — `get_bridge_health` MCP tool
**LIVE-VERIFIED + code-reviewed.** Derived `alive` from `now − lastSeen ≤ 120s` is the honest liveness signal — replaces the legacy last-write-wins `status:"online"` field that read alive for hours after death. Defensive `typeof` guards on each O2 field handle pre-v10.0.4 bridges (null-fallback shape preserved). `assertEditor` trusted-leader gate correct. Continuity probe @ 20:34Z: `{alive:true, lastSeenAgeS:55, stateAgeS:4, stateStale:false, version:"10.0.4", summary:"Bridge alive — last seen 55s ago (v10.0.4)."}`.

### O4 — `bridge.selftest` (live diagnostic dump trigger)
**LIVE-VERIFIED.** `monitor-live/selftest` doc written with full `BridgeDiagnostics & { ts, bridgeVersion }` shape. Dispatch latency ~0.1s. Confirmed by re-read at 20:35Z: doc still present, `createTime` 19:50:42Z, content matches the spec. Bonus property: O4 emits ZERO `bridgeLog` entries — correctly info-level only, which confirms O1's console-intercept error/warn filter is doing its job.

### R1 — `BridgeControlDispatcher` wiring
**Code-reviewed SOUND.** Rides existing `config.onChange` listener (`index.ts:376-381`). No new listener required; `bridgeControl` field changes route through the same hot-path that already handles `monitorBuses` / `busAssignments` changes.

### R2 — `bridgeControl: {action: "resync"}`
**LIVE-VERIFIED via coder-1's parallel fire** (19:37:27Z, nonce `3f4c42c2-22d6-417f-8b8d-0c55195a2784`); their `DESK-VERIFY-FINDINGS.md` is the canonical evidence. Cross-correlated bridge-side: `unconfirmed:[]` held through resync; stateSeq advanced 1342→1377→1489; no cascade errors; no process restart. Throttle fix's invariant — `syncFullState` must drain through the bounded pool (cap-12, attempts-3) without re-fabricating bus-2..5 send reads — held.

### R3 — `bridgeControl: {action: "reconnect"}`
**LIVE-VERIFIED.** Fired 19:47:59.903Z, nonce `cc0638f1…`. Exact code-review trace confirmed against observed behavior:
1. Dispatcher receives nonce → checks `lastHandledNonce` → handles
2. Calls `x32.forceReconnect()` → console.warn ring entry
3. Sets `connected = false` → emits `disconnected` event
4. `index.ts:223` listener fires the second warn (`X32 connection lost`)
5. `attemptReconnect()` → recovery sub-60s
6. `connected = true` → state advances normally on next OSC tick

Process did **NOT** restart (`uptimeMs` continued advancing). Throttle fix held through reconnect's `syncFullState` burst (`unconfirmed:[]` empty throughout).

### R4 — `bridgeControl: {action: "restart"}`
**Code-review ONLY** per scope (not fired). See HIGH finding below — the deployed v10.0.4 dispatch path has a serious correctness gap that should land in v10.0.5 BEFORE R4 is ever live-tested.

### R5 — config-listener resubscribe-on-error
**Code-reviewed SOUND.** Listener registration in `bridge/src/config.ts` includes error-path resubscribe so a transient Firestore disconnect doesn't permanently silence `bridgeControl` dispatch.

### F1 — `getIsEngineer` read timeout (`firestore-transport.ts`)
**Code-reviewed SOUND.** 3000ms `Promise.race`, fail-closed (`isEngineer = false` in catch), not cached on timeout (so a transient slowness doesn't poison subsequent commands).

### B1 — crash guard
**Code-reviewed SOUND.** `process.on('uncaughtException')` + `process.on('unhandledRejection')` swallows attached in `main.ts`; `x32Client.on('error')` swallow attached in `index.ts`. Combined effect: the bridge process cannot crash from an unhandled event-emitter error or an async rejection without first triggering the recorder + heartbeat tick.

### Nonce dedup
**LIVE-VERIFIED across 3 heartbeat boundaries for my R3 nonce + ~10 heartbeat boundaries for coder-1's R2 nonce.** The 60s config listener re-fires the same `bridgeControl` payload every cycle; dispatcher's `lastHandledNonce` returns `{handled: false, reason: "duplicate-nonce"}`; no repeat dispatch. `errCount` + `bridgeLog` confirm no log mutation post-dispatch-1.

---

## 🚨 HIGH finding for v10.0.5 — restart-nonce persistence (post-restart re-fire / boot-loop vector)

`BridgeControlDispatcher.lastHandledNonce` is **in-memory only** (`bridge-control.ts:129`). The `config/monitor.bridgeControl` doc persists indefinitely after a successful dispatch. After R4 restart:

1. New process boots
2. Fresh dispatcher instantiated with `lastHandledNonce: null`
3. `config.startWatching()` initial-snapshot reads the same persisted `bridgeControl` doc
4. Restart-nonce now looks unknown to the new dispatcher → dispatches `restart` AGAIN
5. **Infinite boot loop.**

Same vector triggers from ANY post-restart relaunch: OS reboot, `electron-updater quitAndInstall`, manual quit + relaunch, uncaught exception with `app.relaunch()`. **Once `restart` has ever been dispatched, the doc holds the restart-nonce forever; every subsequent startup re-fires it.**

**Test-coverage gap:** `bridge-control.test.ts:145-155` covers in-process re-fire only; no cross-process restart-with-doc-persisted-nonce test.

### Recommended fix (priority order)

| # | Fix | Idempotent? | Failure mode |
|---|-----|-------------|--------------|
| A | In the `restart` dispatch path, write `config/monitor.bridgeControl: FieldValue.delete()` **before** invoking `deps.restart()`. | Yes | If the clear fails, current behavior — proceed with restart. |
| B | Capture `processStartedAt` at dispatcher construction; if `ctrl.requestedAt` exists and `ctrl.requestedAt < processStartedAt`, skip. The `BridgeControl.requestedAt` field already exists (`types.ts:117`, optional) — make it a strong recommendation for callers + dispatcher honor it. | Yes | If clock skew large, dispatch deferred until next nonce. |
| C | Persist `lastHandledNonce` to Firestore (`bridgeLease` extra field) and rehydrate on boot. | Yes | More surface to break; race vs lease ownership. |

**Recommend A + B combined** (delete-on-restart-fire + boot-time `requestedAt` skip gate). Each alone closes most of the vector; together they're defense in depth.

> **2026-05-23T20:36Z status:** coder-1 has shipped this exact fix in `bridge-v1005-accumulator` item 1 at `5ea6afc55`. The patch wires `clearBridgeControl` dep on the BridgeControlDispatcher (set merge=true `FieldValue.delete` on `config/monitor.bridgeControl`) plus a `processStartedAt` skip-guard plus a `firestoreDateToMs` helper for `requestedAt` parsing, with +8 cross-process tests. Lands in the next bridge release (v10.0.5). This finding is **closed** in code, awaiting the version bump + Daniel-install.

---

## Other recommendations (LOW)

### errCount startup-noise inflation
Every cold boot logs 8 boot warnings (Node `punycode`/`url.parse` deprecation + lease-takeover). `errCount ≥ 8` baseline dilutes the signal — making "real" error count drift hard to read. **Fix:** filter Node `[DEPNNNN]` pattern at `RemoteLogger.record()` ingest, OR expose `getErrCountSinceBootGrace()`. One-line filter.

> **2026-05-23T20:36Z status:** coder-1 has staged a fix in `bridge-v1005-accumulator` item 2 at `bridge/src/remote-log.ts` (and tests in `remote-log.test.ts`). `isStartupNoise(text)` predicate filters Node `[DEP\d{4}]` deprecations + benign lease-takeover STANDBY entries so they stay in the ring for forensics but DON'T bump `errCount` or `lastError`. Not yet landed on origin/master at time of writing.

### MCP wrappers
No MCP write tools currently expose `bridge_resync` / `bridge_reconnect` / `bridge_selftest`. Adding trusted-leader-gated thin wrappers (auto-mint nonce server-side) makes recovery a one-call op from Claude Desktop instead of a hand-shaped Firestore write. `restart` stays admin-only with explicit confirm-yes guard. Routine ops cleanup (deleting stale `bridgeControl` nonces) gets simpler too.

---

## Ops follow-ups (not v10.0.5)

1. **`unconfirmedCount > 0 for > 60s` watchdog alarm** (cron + MCP read; coder-1 also suggested this in her DESK-VERIFY-FINDINGS). The throttle fix held during this soak, but a regression check would be cheap insurance.
2. **Cleanup of my R3 + O4 nonces in `config/monitor.bridgeControl`** — harmless but tidy. The deployed v10.0.4 doesn't auto-clear; the v10.0.5 fix will clear on each successful dispatch going forward. One-shot `FieldValue.delete()` write is the cleanup path until v10.0.5 ships and consumes naturally.
3. **Future bridge release should remove the manual JSON-drop fallback** once Daniel's `userData` cred migration completes across all installs (per `[[project_bridge_update_ops]]`).

---

## Gates / posture

- **No commits.** No bridge edits. No `firestore.rules` change. No data writes beyond `config/monitor.bridgeControl` (R3 + O4) + the implicit `monitor-live/state` writes the bridge itself drives + the new `monitor-live/selftest` doc written by the O4 dispatch.
- **Worktree (prior session):** `sheet-music-app-bridge-v1004-stress/` — detached at `6a313f5dd`, no `npm ci`, no junction. Torn down between 19:52Z ship and 20:33Z re-fire; the untracked draft of this file in it was lost in that teardown, which is the proximate reason this reconstruction exists. Recommend: in future, Tier-0 deliverables that land only in a worktree should be cherry-copied to canonical `sheet-music-app/.paul/research/<lane>/` BEFORE supervisor teardown — at minimum the deliverable filename should be tracked under git so an uncommitted-state warning fires on `git worktree remove`.
- **Worktree (this re-fire):** `sheet-music-app-bridge-v1004-stress/` — fresh detached HEAD at `6a313f5dd`. No `npm ci`. Standing down post-reconstruction; supervisor handles teardown per `[[feedback_worktree_teardown_timing]]`.

---

## Continuity probe — 2026-05-23T20:34Z (T+44min post-ship)

`config/monitor.bridge` snapshot:
```
status:           "online"
version:          "10.0.4"
lastSeen:         2026-05-23T20:33:35.607Z  (55s ago)
socketAlive:      true
x32Connected:     true
stateAgeMs:       54
unconfirmedCount: 0
queueDepth:       0
errCount:         10  (unchanged since R3 fire @ 19:47:59Z)
lastError:        "X32 connection lost — fader changes will not work until reconnected"
                  (ts 1779565679527 = 19:47:59.527Z — the R3 fire entry; not an active error)
startedAt:        1779555993992 (= 17:06:33Z — original morning boot, no restart)
uptimeMs:         12,421,088  (= 3h27m, +43min beyond ship-time uptime of 2h44m)
clients:          0  (nobody on /monitor right now)
```

`get_bridge_health` snapshot:
```
{ ok:true, alive:true, lastSeenAgeS:55, stateAgeS:4, stateStale:false,
  leaseExpired:false, status:"online", x32Connected:true, socketAlive:true,
  unconfirmedCount:0, queueDepth:0, version:"10.0.4", clients:0,
  uptimeMs:12421088, errCount:10,
  lastError:{msg:"[Bridge] X32 connection lost — fader changes will not work until reconnected", ts:1779565679527},
  summary:"Bridge alive — last seen 55s ago (v10.0.4)." }
```

`config/monitor.bridgeControl` (stale, expected — see Ops follow-up #2):
```
action:      "selftest"
nonce:       "127e1e56-f758-4a6c-8bf0-978b26f4e25e"
requestedAt: 2026-05-23T19:49:30Z  (51 min ago)
requestedBy: "coder-2 bridge-v1004-stress O4 live verify"
```

`monitor-live/bridgeLog`: 10 entries (2× Node DEP + 6× boot lease-takeover STANDBY + 2× R3 fire). No new entries post-ship — bridge has been quiescent except for heartbeats.

`monitor-live/selftest`: present, `createTime` 19:50:42Z, content matches the v10.0.4 selftest spec (BridgeDiagnostics + `ts` + `bridgeVersion`).

**Verdict:** v10.0.4 continues healthy in continuous operation through T+44min post-ship. No drift. No new errors. The bridge is doing exactly what the build was designed to do — unattended-remote runtime with full observability surface — and the deployed-surface evidence for every O1-O4 + R1-R5 finding in this report still holds.
