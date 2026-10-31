# Bet 4: wedge safety and memory

Evidence: `research/mixer.md` (MIXER ids).

Daniel's rulings (2026-10-31):
- **Ceilings:** YES. Drew sets them, starting at about -2 dB (fader 0.70) for sends and bus
  master, and the bridge enforces them.
- **Planned:** saved mixes and an engineer console. NOT now: the change log or undo, and the
  one-call `adjust_my_mix`.
- **Alerts** to Drew and Michael: done in #32.

Monitors are "wedges", never IEM.

## Shared data model (both PRs build against this)
- `config/monitor.ceilings`:
  ```
  { default: { send: 0.70, master: 0.70 }, perBus?: { "<busIndex>": { send?, master? } },
    perChannel?: { "<channelIndex>": { send? } }, updatedBy, updatedAt }
  ```
  - Values are fader positions from 0 to 1.
  - When the doc is absent, the defaults (0.70/0.70, ≈ −2 dB by the X32 fader law `f*40-30` above 0.5) apply.
    (Corrected 2026-10-31 in B4a from 0.80, which is about +2 dB.)
  - Only sound-engineer or admin callers may write it.
- `monitor-live/snapshots/buses/{busIndex}/items/{snapshotId}`:
  ```
  { busIndex, kind: "auto"|"named", name?, serviceType?, ownerUid?,
    createdAt, sends:[{channelIndex, channelName, level, on}], master }
  ```
  - **Path changed by B4a (2026-10-31):** the original `monitor-live/snapshots/{busIndex}/items/{snapshotId}`
    has 5 segments, which is a collection path, not a document. The extra `buses` segment makes it
    valid. `busIndex` is the doc id as a string ("5"); `createdAt` is a Firestore Timestamp.
  - Auto snapshot ids are `auto-<YYYY-MM-DD>-<setlistId>` or `auto-<YYYY-MM-DD>-nightly`. The
    bridge reads today's services from the public `today.json` (`startsAt`, already resolved).
  - Channel name and index are stored so a recall can match by name when the desk is renumbered.
  - Auto snapshots: the bridge writes one per owned bus at service end. That is 2 hours after
    `startsAtLocal` of today's setlist, or nightly at 23:00 local when there is no setlist. Keep
    the last 10 auto snapshots per bus.
  - Named snapshots: a musician saves one for their own bus. They are never shared between people.
- Recall goes through the normal command path (the `pending` commands collection) as a ramped
  multi-command move, so ownership and ceiling checks apply.

## PR B4a: bridge (`bridge/` only, plus a version bump and a release via the existing build-bridge workflow)
1. **MIXER-03:** enforce the ceilings in the bridge authorizer for every send-level and
   bus-master command, from the iPad or the MCP. Over the cap, CLAMP to the cap. Ack with
   `applied:true, clamped:{requested, applied, cap}`, so the UI can show it.
   - Cache `config/monitor` with a listener.
   - Fail safe to the defaults when the doc is unreadable.
2. **MIXER-10:** drop a command whose `serverCreateMs - cmd.createdAt` is over 30 s, allowing
   small clock skew. Ack it with `timeout: queued offline`.
3. **MIXER-12:** the heartbeat gains `launchReason` (boot | watchdog | update | manual) and
   `watchdogInstalled` (bool).
4. **MIXER-13:** ignore empty error messages in `remote-log` `record()`, and keep the last
   non-empty error.
5. **Auto snapshots:** as in the model above.
6. **Release:**
   - Bump the version.
   - Follow `bridge/README.md` "Building a release" and the existing `.github/workflows/build-bridge.yml` trigger (a tag), so `latest.yml` is published.
   - Installed bridges self-update in their idle window, which is the normal pipeline.
   - Do NOT run a release from the agent if the workflow needs a tag push you are unsure of. Say exactly which tag push the lead must do.
7. **Tests:** clamp math, stale-command drop, launch reason and the snapshot writer, all as
   unit tests in the bridge's existing test setup.

## PR B4b: web + MCP (`src/`, excluding `bridge/`)
1. **Ceilings editor (Drew):**
   - In `/monitor`, an engineer-only "Limits" panel with the default send and master and
     per-bus overrides, as sliders with a dB readout.
   - It writes `config/monitor.ceilings`.
   - Firestore rules: only admins or sound engineers may write that field. Add an emulator test
     for both tenants.
   - MCP: add `get_monitor_limits`, and `set_monitor_limits` (engineer or admin only, a write
     tool).
2. **Fader UI:** show the cap as a tick on each fader. A clamped ack shows "Limited to −2 dB by
   Drew's setting" (wording below) for 3 s. Double-tap resets to the channel's last saved level,
   or 0.6 (about -6 dB) when there is none, never 0.75.
3. **Saved mixes:**
   - The musician's popover and `/monitor` get "Save this mix" (a name, defaulting to today's
     service type) and "Recall" (named ones plus the last 3 auto snapshots).
   - Recall shows a confirm sheet listing the changes, then sends a ramped move through the
     command path.
   - MCP: `list_saved_mixes` and `recall_mix` (own bus only, unless engineer or admin; returns
     before/after in dB).
4. **Engineer console:** `/monitor/engineer` for engineers and admins.
   - Shows all 5 buses side by side: who is on each bus, its master, and its top channels.
   - Lets the engineer ride any bus.
   - Has a plain-words bridge status card (alive, last seen, launch reason, watchdog, queue).
   - Plural buses: a user on two buses gets a bus switcher (MIXER-15).
5. **MIXER-09, bridge-down wording** in the popover: "Controls are paused. Your wedge sounds the
   same as before. Ask Michael or Drew to restart the bridge." Reuse the `/monitor` overlay with
   the last known levels.
6. **Wording (the lead's call, logged; Daniel can change it):**
   - "Limited to −2 dB by Drew's setting" is generic in code, rendered as "Limited to {db} by
     the sound engineer's limit".
   - "Save this mix", "Recall a mix".
   - "Controls are paused…" as above.

## Rules for both
- Never let a recall or a ceiling write bypass bus ownership.
- Brothers Lazaroff has `mixer:false`: these routes and tools stay CRC-only. Add a tenant test.
- Both PRs use the shared data model exactly. If B4a needs to change it, write the change here
  and tell the lead.
