# LANE 2 — iPad consumer wiring + channel-index mapping (coder-2)

**Read `PARENT.md` in this directory FIRST.** Tier-0 READ-ONLY, `src/**` consumer
plane. **This is the PRIME-SUSPECT lane** (Suspect A). Board is OFF.

## Surfaces to trace
- `src/app/(main)/monitor/MonitorClient.tsx` (the orchestrator)
- `src/components/monitor/MonitorTabs.tsx`, `FaderStrip.tsx`,
  `VerticalFaderStrip.tsx`, `QuickMonitorPanel.tsx`, `MatrixPanel.tsx`,
  `DefaultChannelPicker.tsx`
- `src/lib/monitor-store.ts`, `src/lib/firestore-monitor-client.ts`,
  `src/components/monitor/__tests__/visible-channels.test.ts`,
  `fader-interaction.test.ts`, `mute-toggle.test.ts`

## Questions to answer
1. **Does dragging a per-channel send fader actually dispatch a write?** Trace the
   channel FaderStrip's `onChange` up to `client.setSendLevel(...)`. Is it wired at
   all, or is the channel fader read-only / a no-op / pointed at the wrong handler?
   This is the literal "changing things did nothing" symptom — prove or disprove a
   missing/broken call.
2. **channelIndex SEMANTICS — the hot bug.** What integer does the channel fader
   pass as `channelIndex`? Trace its source through `visible-channels` /
   `defaultChannels` / the store's channel list. Is it:
   - the **X32 absolute channel number (1–32)** the bridge needs, or
   - a **display position / array index / 0-based** value?
   An off-by-one or position-vs-absolute mismatch → the OSC hits a channel Daniel
   isn't listening to → "nothing happens." Pin down the exact mapping with file:line.
3. **Compare to the WORKING path.** How is the bus-master fader (and bus mute)
   wired vs the channel sends? The delta between working and broken is the bug.
   Confirm whether "bus mute" calls `setBusMaster(0)` (Suspect: yes).
4. **Role/visibility gating.** Is the per-channel send control hidden, disabled, or
   guarded for a `band_leader` (non-engineer) who owns the bus — e.g. only the
   master fader + mute exposed, channels rendered but inert? Check `useMonitorAccess`
   / privileged checks in the channel render path.
5. **Optimistic snap-back.** Given FaderStrip's 2s pending timeout that snaps back
   to `value` if the store doesn't reflect the change: would a successful write that
   the bridge never reflects into `monitor-live/state` *look* like "nothing
   happened" to the user? Note this UX-vs-write distinction for the synthesis.

## Deliverable
`MONITOR-SENDS-consumer-FINDINGS.md`: per-question verdict (file:line), the
consumer-side root-cause hypothesis (esp. the channelIndex mapping), and a
proposed fix shape (described, NOT coded) with the exact lines that would change.

SHIP-NOTICE (Tier-0) → `inbox/supervisor.md`.
