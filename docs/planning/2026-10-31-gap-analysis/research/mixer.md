# Research: mixer (personal wedge mixing)

Researcher: mixer. Date: 2026-10-31. Read-only. No live fader, mute or assignment was changed and
no test data was written, so there is nothing to clean up. Live reads were `get_bridge_health`,
`list_monitor_buses`, `get_mix` (one call that failed, one with `busIndex:5`).

Note on scope: `C:\Users\dsbog\centralreform.live\sheet-music-service-bridge` is **not** the X32
bridge. It is a Next.js app (the Beit Mitzvah service bridge, `src/app`, `inngest`, `mcp-apps`).
The X32 bridge is `bridge/` in this repo (Electron tray app, v10.0.7). I did not audit the
service-bridge app here; the family researcher owns it.

## 1. How it works today

- **Musician surface.** `/monitor` (`src/app/(main)/monitor/MonitorClient.tsx`) plus the Perform
  toolbar popover (`src/components/monitor/QuickMonitorPanel.tsx`, opened from
  `PerformanceToolbar.tsx:290-319`). The user's bus is derived from `config/monitor.busAssignments`
  (`monitor-store.ts:60-63`, first match only). A musician sees Master plus "My Channels" (band-wide
  `defaultChannels` plus personally starred channels, `monitor-store.ts:70-78`). Faders are 0..1
  positions shown as 0-100% (`FaderStrip.tsx:161`, no dB).
- **Command path.** iPad `addDoc` to `monitor-live/commands/pending` (`firestore-monitor-client.ts:364-380`),
  50 ms per-key throttle, release value sent synchronously. The MCP tools write the same doc
  (`server-monitor.ts:315-330`). The bridge listens, authorizes, applies over OSC/UDP, reads back
  from the desk, and writes an ack to `monitor-live/commands/acks/{id}` (`firestore-transport.ts:344-534`).
  The iPad watches its own acks and shows a refusal in words (`FaderStrip.tsx:247-256`).
- **State path.** The bridge `.set()`s one ~10 KB doc `monitor-live/state` on every change, every 10 s
  idle, with a 30 s full desk re-query (`firestore-transport.ts:63-67, 163-183`). iPads and the MCP
  read it. Staleness (>90 s) comes from the bridge's own `updatedAt`.
- **Authorization.** `firestore.rules:510-531` checks only shape and membership. **Per-bus ownership
  is enforced only in the bridge** (`firestore-transport.ts:559-580`). The MCP checks it in
  `canControlBus` (`server-monitor.ts:286-292`): admin or sound engineer may drive any bus, everyone
  else only their own.
- **Health.** Bridge heartbeat every 60 s, 20 s single-writer lease, standby marker, Windows
  watchdog task (`bridge/watchdog/`, per-minute relaunch). `get_bridge_health` computes a derived
  `alive`. A cron `bridge-watch` runs daily 14:00 UTC plus Friday 19:00 and 21:30 UTC and pushes to
  admins and emails `BRIDGE_ALERT_EMAIL` (`vercel.json:54-64`, `bridge-watch/route.ts`).
- **MCP.** Reads: `list_monitor_buses`, `get_mix`, `get_matrix`, `get_command_status`,
  `get_bridge_health`. Writes: `set_send_level`, `set_send_mute`, `set_bus_fader`, matrix pair,
  `assign_monitor_bus`/`unassign_monitor_bus`, and admin-surface `bridge_resync/reconnect/selftest/restart/...`.
  The agent guide injected into every MCP session has **no mixer section** (`agent-guide.ts` only
  names the feature at line 129).

The 2026-08-31 audit (`docs/FABLE-REVIEW-2026-08-31-monitor-mix.md`) was largely actioned: acks reach
the iPad, `unconfirmed` is surfaced, faders are no longer disabled on a stale-but-working desk,
release value is sent synchronously, the cron tripwire and watchdog exist, lease TTL is 20 s.
Still open from that list: plural buses (R6), per-bus state docs (R3), latency telemetry (#15).

### Live probe results (2026-10-31 ~16:44 UTC, Saturday late morning CT)

- `get_bridge_health`: alive, v10.0.7, lastSeen 18 s, state age 8 s, `queueDepth 0`,
  `unconfirmedCount 0`, `clients 0`, `uptimeMs 7201001` (2h00m01s), `errCount 5`,
  `lastError {msg:"", ts:1793457853416}` (the ts equals lastSeen to the millisecond).
- `list_monitor_buses`: 5 buses: `1 - Instrume`, `2 - Bass` (David Lazaroff), `3 -Vox Wedge`,
  `4 - Piano`, `5 - Rabbi` (Daniel Bogard). Buses 1, 3, 4 have nobody assigned. Matrices: Main L/R,
  MP Room, Oneg, Library, ALS. `myAssignedBuses: []` for the calling account.
- `get_mix` with no arg: **400 `monitor_no_bus_assigned`**. With `busIndex:5`: all 32 channels
  returned, raw floats (`0.6437500119...`), master 0.648. Two vocal-looking channels for Daniel
  (`3 - Daniel` 0.331, `Rabbi Dan` 0.387). Channel names mix styles (`Rav Gtr 5`, `Joey Gtr 3`,
  `David Gtr 1`, `1 - Alan`, `Spare`, `Wall`, `Booth`).

## 2. Findings

| ID | Type | Persona | Sev | Evidence | Recommendation | Effort | Quick safe win |
|---|---|---|---|---|---|---|---|
| MIXER-01 | gap | Daniel, all musicians | S2 | Nothing stores a mix: no scene, preset, snapshot or history anywhere (`grep scene/preset` in `bridge/src`, `src/lib/monitor*` finds none; only `pinnedChannels` is saved, `MonitorClient.tsx:93-99`). The X32 is the only memory, so a desk scene load or reset by Drew loses every musician's levels. | Saved mixes (see Big bet 1). Smallest first step: bridge writes a rolling snapshot of each owned bus every N minutes and at service end to `monitor-live/snapshots/{bus}/{ts}`. | M | No (data model) |
| MIXER-02 | gap | Musicians | S2 | No undo on the iPad. A mis-drag loses the old value; only double-tap (to 0 or 0.75) exists (`FaderStrip.tsx:129-134`). The store keeps a rollback only for a rejected command (`monitor-store.ts:163-167`). | Per-fader "previous value" chip for ~10 s after a move, plus a bus-level "Back to a minute ago" button fed by a small client ring buffer. | S | Yes (client only) |
| MIXER-03 | risk | Musicians, Drew | S1 | No ceiling anywhere. Bridge clamps only 0..1 (`x32-client.ts:619-648`); tools allow 0..1 (`tools/index.ts:3150-3210`). Wedges (not in-ears) make a raised send a **feedback** risk, and 1.0 is +10 dB on an X32 fader. One slip, or an LLM write of `level: 1`, can ring the room. Double-tap jumps a muted-to-0 fader straight to 0.75 (0 dB), with no ramp (`FaderStrip.tsx:130`, `VerticalFaderStrip.tsx:112`). | Per-bus ceilings (send max, master max) held in `config/monitor`, editable by Drew only, enforced in the bridge so both iPad and MCP are covered, with the refusal text shown on the fader. Make double-tap reset to a per-channel "home" level, not 0.75. | M (bridge release) | No |
| MIXER-04 | risk | Musicians on shared bus | S2 | Co-owned buses are by design (`assign_monitor_bus` desc, `BusAssignmentPanel`). Bus 3 is named "Vox Wedge" and is the natural shared one. Any co-owner can move the whole bus and no one is told; there is no record of who moved what (command docs are deleted on process, acks swept at 5 min, `firestore-transport.ts:673-697`). Also Daniel/Drew (privileged) may overwrite anyone's bus silently. | Append-only change log written by the bridge on `applied` (uid, bus, target, old to new, time). Doubles as the undo source and as "who touched my wedge". | M | No |
| MIXER-05 | friction | Drew | S2 | The iPad UI gives an engineer no way to ride another bus: an engineer without their own bus gets only bus assignment, default channels and matrix (`MonitorClient.tsx:193-217`). "David says bass is low in his wedge" must go through Claude/MCP or the desk. | Engineer bus picker in `/monitor` that targets any bus (the bridge already allows it, `firestore-transport.ts:575-577`). Same fix lets a multi-bus owner switch. | S-M | No (UX decision on layout) |
| MIXER-06 | bug | Daniel via Claude | S2 | `get_mix` with no `busIndex` returns 400 for the account used this session although bus 5 is assigned to "Daniel Bogard" (live probe). `myAssignedBuses: []`, so the calling identity (the shared `crcmusic@` account) is not the assigned uid `93Xn3D...`. "Show me my mix" and "turn my vocal up" therefore fail unless the caller already knows to pass 5. The hint says "ask an admin to assign one" (`monitor.ts:257-262`), unhelpful to a privileged caller. | For a privileged caller with no own bus, return the bus list and "pass busIndex 1-5" in the error. Also confirm which account Claude Desktop connects as and assign the bus to it (or make `assign_monitor_bus` accept an alias uid). | XS | Yes (error text), data fix is Daniel's |
| MIXER-07 | gap | Daniel, David, all | S2 | No natural-language ergonomics. "Turn my vocal up in my wedge" takes 4 calls (list, get_mix, guess channel, set, then re-read or `get_command_status`), writes need a raw 0..1 value, and the agent guide says nothing about mixers (`agent-guide.ts:129` only). Daniel's mix has two vocal channels; nothing says which is "mine". Fader taper is non-linear, so the description's "+0.05-0.1" (`index.ts` set_send_level) is anywhere from ~1 to ~3 dB. | Add a mixer section to the agent guide now (XS). Then a single tool `adjust_my_mix {channel: name or alias, change: "up"|"down"|"set", amountDb?}` that resolves the name, clamps to the bus ceiling, writes, waits for the ack and returns before/after in dB. Store per-user channel aliases ("my vocal" = `3 - Daniel`). | XS guide, S-M tool | Guide: yes |
| MIXER-08 | friction | David, Daniel | S3 | `get_mix` returns all 32 channels including `Spare`, `Wall`, `Booth`, `Floor 1`, `EXTRA` at level 0 (live probe), raw floats with 10 decimals, no dB, no "audible" flag. An LLM reading this burns tokens and mis-picks. | Add `audible` (on and level>0) and `db` fields, and an optional `onlyActive` filter. Additive, so no break. | S | Yes |
| MIXER-09 | friction | Musicians | S2 | Bridge-down screen. `QuickMonitorPanel` replaces the whole popover with one line, "Bridge is offline" or "Bridge online - mixer disconnected" (`QuickMonitorPanel.tsx:138-147`). It does not say that the wedges still sound as last set, who to ask, or how long to wait. The `/monitor` page does better (overlay with last known levels). | Reuse the overlay in the popover and add a calm line: "Controls are paused; your wedge is unchanged. Ask Michael or Drew to restart the bridge." Wording needs Daniel's OK. | S | No (wording) |
| MIXER-10 | risk | Musicians | S2 | Offline-queued commands may replay late. The app uses `persistentLocalCache` (`firebase.ts:172`) and `sendCommandImmediate` awaits `addDoc` (`firestore-monitor-client.ts:370`), which does not reject offline. The bridge's stale guard uses the **server** createTime (`firestore-transport.ts:372-381`, deliberately not the iPad `createdAt`), so a move made in a dead spot and flushed on reconnect minutes later looks fresh and is applied. PLAUSIBLE, not reproduced. | In the bridge, also drop when `serverCreateMs - cmd.createdAt` is large (for example more than 30 s, tolerant of small clock skew) and ack `timeout: queued offline`. | S (bridge release) | No (needs bridge release) |
| MIXER-11 | gap | Michael, Drew | S2 | Alerts reach the wrong people. `bridge-watch` pushes to **admins** only (`route.ts` `listTenantMembers(... roles:["admin"])`) and mails one `BRIDGE_ALERT_EMAIL`. Michael (powers the PC) and Drew (sound engineer) are not told. `get_bridge_health` is gated to admin/band_leader (`bridge-health.ts:110`, `server-tracks-write.ts:125-142`), so a sound-engineer-only account cannot read it, and the bridge tools sit on the admin surface (`surfaces.ts:98-107`). | Add the sound-engineer flag holders to the push list, let `get_bridge_health` accept `isPrivilegedMonitor` callers, and give Michael a one-line pre-service checklist. Messaging real people is Daniel's call (Q4). | S | No (messages to humans) |
| MIXER-12 | gap | Michael | S2 | The watchdog is a manual, per-PC install (`bridge/watchdog/INSTALL.md`). I could not confirm it is installed on the studio PC. Observation: bridge uptime was exactly 2h00m01s at probe time, so something restarted it ~14:44 UTC (auto-update, watchdog, or a boot). PLAUSIBLE only. | Add a `watchdogInstalled` / `bridgeLaunchReason` field to the heartbeat so `get_bridge_health` can say "restarted 2h ago by: watchdog/update/boot". Cheap proof for Michael. | S | No (bridge release) |
| MIXER-13 | risk | Daniel | S3 | `lastError` is `{msg:"", ts==lastSeen}` with `errCount 5`. An empty message makes the one field Drew would read useless. `remote-log.ts:97-118` records `String(msg ?? "")` with no empty guard. PLAUSIBLE that a blank `console.error` runs periodically. | Ignore empty lines in `record()` and keep the last non-empty error. | XS | Yes (bridge, next release) |
| MIXER-14 | friction | Musicians | S3 | Only 2 of 5 buses are assigned (live probe: 1, 3, 4 empty). Other musicians cannot use `/monitor` at all, since access needs a bus or the engineer flag (`use-monitor-access.ts:87`). The no-access screen says only "Ask a sound engineer or admin" (`MonitorClient.tsx:162-168`). | A one-tap "Request a bus" that notes the request for Drew, and a roster of who is on which bus visible to Drew. Adoption, not a bug. | S | No |
| MIXER-15 | risk | David | S3 | A user who owns two buses gets only the first on the iPad (`monitor-store.ts:60-63`) and in the bridge (`bridge/src/config.ts:133-142` returns the first, though the authorizer then checks the specific bus). Open item R6 from the August audit. | Plural buses with a bus switcher; unlock for engineers as in MIXER-05. | S-M | No |
| MIXER-16 | friction | Musicians | S3 | `isBridgeOnline` fails open ("no heartbeat data = assume online", `ConnectionIndicator.tsx:15`) and compares against the iPad clock (`:28`). A skewed iPad clock can show "Bridge offline" or "Connected" wrongly. | Compare using the Firestore server time from `state.updatedAt` plus listener metadata, or add a `serverNow` field to the heartbeat. | S | No |
| MIXER-17 | friction | Daniel | S4 | `get_command_status` does not check that the ack belongs to the caller (`monitor-observability.ts:96-118`) although the iPad rules do (`firestore.rules:532-535`). Low harm (acks hold no secrets) but inconsistent. Also acks vanish after ~5 min. | Filter by `uid` unless privileged. | XS | Yes |
| MIXER-18 | friction | Daniel, David | S3 | **Terminology.** Wedges are never "IEM". User-visible MCP strings still say IEM or in-ear: `tools/index.ts:3103` ("personal-IEM"), `3209` ("overall in-ear volume ... in my ears"), `3290`, `3320`, plus the error shown to a musician at `server-monitor.ts:274` ("personal IEM bus") and `monitor-observability.ts:55`. The UI components are clean. The agent will repeat "in-ear" back to the band. | Sweep to "wedge monitor / wedge mix". Mechanical, precedent is explicit. | XS | Yes |
| MIXER-19 | sprawl | Maintainers | S4 | Monitor tools are 19 on the MCP list; the mix tools are fine in number but two of the four writes (`set_bus_fader` vs `set_send_level`) differ only by scope and a bus-master mute exists on iPad but has no MCP tool (`set_bus_on` is in the rules allow-list and iPad, not in `tools/monitor.ts`). | Add `set_bus_mute` only if Drew wants it from Claude; otherwise leave. | XS | No (needs a decision) |
| MIXER-20 | risk | Everyone | S3 | One ~10 KB state doc is rewritten up to 10 times a second and fanned out to every iPad (`firestore-transport.ts:61, 169`). Latency is still unmeasured. The bridge-down alarm is daily plus Friday only, so a Saturday-morning death is found by the band. | Per-bus docs (August audit R3), latency telemetry (#15), and add a Saturday morning cron entry (the crons are `0 14 * * *`, `0 19 * * 5`, `30 21 * * 5`; the daily one is the only Saturday check). | M | Cron entry only: yes |

## 3. Big bets

1. **Saved mixes per musician and per service type.** *Problem:* no memory of a good mix; every
   week the musician re-finds levels, and a desk reset wipes everyone (MIXER-01, 02).
   *Sketch:* bridge writes a nightly and end-of-service snapshot of each owned bus; musicians
   name and recall mixes ("Shir Shabbat", "Shabbat morning", "B'nei Mitzvah") from the iPad and by
   voice ("go back to last Friday's mix"); recall goes through the normal command path so the
   ceiling and ownership checks still apply, and sends a ramped move. The service type already
   exists in the setlist (`templateType`), so the app can offer the matching saved mix.
   *Risks:* channel renumbering on the desk breaks recall (match by channel name plus index and
   show the unmatched ones); recall during a service is a big hit (confirm and ramp).
   *Effort:* M-L.
2. **A one-call mix assistant over MCP.** *Problem:* MIXER-06, 07, 08. *Sketch:* `adjust_my_mix`
   (name or alias, up/down/set, dB), per-user aliases, ceiling-aware, waits for the ack and
   reports before/after in dB; `get_mix` gains `audible` and `db`; a mixer section in the agent
   guide ("never exceed +3 dB without asking; confirm bus-wide changes; read back"). Drew gets
   `adjust_mix_for {musician}` with a mandatory reason that lands in the change log.
   *Risks:* an LLM writing live levels; mitigated by the bridge ceiling and a per-call max step.
   *Effort:* S-M.
3. **Safety envelope for wedges.** *Problem:* feedback and overwrite risk (MIXER-03, 04, 10).
   *Sketch:* per-bus ceilings and a per-channel "do not raise past" cap that Drew sets once
   (he knows which mics ring), enforced in the bridge; an engineer "lock" on a bus during a
   service; late-replay guard; a "Panic: restore my last saved mix" button on the popover.
   *Risks:* needs a bridge release (the bridge self-updates only in the idle window, so plan the
   rollout); a ceiling set too low is itself a service problem, so show the cap on the fader.
   *Effort:* M.
4. **Engineer console and honest ops view for Drew and Michael.** *Problem:* MIXER-05, 11, 12, 14.
   *Sketch:* a `/monitor/engineer` view with all five buses side by side (ride any bus, see who
   is on it and when they last touched it), a bridge status card in plain words with the same
   remedy text the cron produces, alerts to Drew and Michael (not only admin), a
   "pre-service check" button that runs `bridge_selftest` and reports green/red.
   *Risks:* it is a second surface to keep reliable; keep it read-mostly. *Effort:* M-L.
5. **Break-glass path and measured latency.** *Problem:* control depends on Firestore and the
   cloud (August audit R10a, MIXER-20). *Sketch:* first measure round-trip in the web-vitals sink;
   only if P95 is above the ADR's 300 ms trigger, add a bridge-hosted LAN control page for the
   studio network. *Risks:* certificate trust on iPads, which the current design was built to
   escape. *Effort:* L (measurement alone: S).

## 4. Questions for Daniel

1. **Ceilings.** May the bridge refuse levels above a per-bus ceiling (Drew-editable)?
   *Recommend yes:* start at send max 0.80 and master max 0.80 (about -2 dB), shown on the fader
   and in the refusal text.
2. **Who may overwrite whom.** Should admin and sound engineer keep silent override of any bus?
   *Recommend yes*, but with a change log so a musician can see "Drew moved Bass at 10:42".
3. **Saved mixes.** Automatic snapshot at the end of each service plus musician-named presets,
   keyed by service type? *Recommend yes*, musician-owned, never shared between people.
4. **Alerts.** May the pre-service bridge alert also reach Drew and Michael (push or email), not
   only admins? *Recommend yes*; this messages real people, so it needs your word.
5. **Bridge-down wording.** OK to tell musicians "Controls are paused; your wedge is unchanged;
   ask Michael or Drew"? *Recommend yes.*
6. **Which account does Claude Desktop use for you?** The `crcmusic@` account owns no bus, so
   "my mix" fails. *Recommend* assigning bus 5 to that account too (or telling me which uid to
   alias).
7. **Saturday cron.** Should the bridge check also run Saturday morning at about 15:00 UTC?
   *Recommend yes* (it is silent when green).

## Quick safe wins (for the lead to batch)

MIXER-18 (IEM wording sweep, MCP only), MIXER-06 (error text), MIXER-08 (`audible`/`db` on
`get_mix`), MIXER-17 (ack uid filter), MIXER-07 (agent-guide mixer section), MIXER-02 (client undo
chip), MIXER-13 (blank lastError, ships with next bridge release), MIXER-20 (Saturday cron line).
