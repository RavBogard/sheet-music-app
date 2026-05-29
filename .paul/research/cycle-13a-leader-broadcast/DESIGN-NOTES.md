# Cycle-13a — DESIGN-NOTES (methodology rationale + worked example + what this axis misses)

Companion to `PROMPT.md`. Charter deliverable #2. Explains *why* the axis is shaped the way it is,
traces ONE worked-example finding end-to-end, and honestly states what 13a structurally cannot see
(deferring to which sibling axis).

---

## 1 — Why "multi-context broadcast trace" and not another single-context sweep

Cycle-11 and cycle-12 both watched ONE iPad. That is the right shape for *stickiness* (does MY state
survive MY reload?) and *offline survival* (does MY chart hold when MY wifi drops?). It is the WRONG
shape for *broadcast*, because a broadcast is a relation between devices: a change made on device A
must appear on devices B and C. You cannot observe propagation on the device that originated it — the
originating device shows the change instantly from its own local write, which tells you nothing about
whether anyone else got it.

So the observation unit had to change. In 13a the unit is a **broadcast trace**:

```
action@leader  →  [ receiver-1: reflected? + latency ,  receiver-2: reflected? + latency ]  →  BC-3 disruption
```

Three devices, open on the same setlist, observed *simultaneously* around a single leader action.
This is why the PROMPT's harness primitive (`broadcastTrace`) commits on the leader and then
stopwatches BOTH receivers — and why the receivers must be parked in a realistic in-progress state
(overlay open / scrolled / transposed) BEFORE the action, so disruption (BC-3) is even observable.

This is also the strongest possible break of **AP-7 (single-state probe)** — not "we added a second
identity to a matrix cell" (cycle-12's flavor) but "the methodology is constitutively multi-device."

## 2 — Why the headline is a GAP, not a bug

The dispatch framed A3 as "the leader pushes a live change … current-song advance, setlist edit,
transpose/key change, monitor tweak." The verify-every-ref pass found that the list contains one
item that **does not exist as a broadcast**:

- **Current-song advance:** `use-setlist-performance.ts:180` `const currentTrackIndex = -1` (constant,
  never set) and `:225-226` `// No-op position control (live stepping removed)` /
  `const setCurrentPosition = () => {}`. The plumbing survives cosmetically — `onLeaderSetPosition`
  threads through `SetlistView.tsx:73,95` to `SetlistRow` — but it terminates in a no-op. There is no
  Firestore field, no write, no read. The leader cannot advance the band.
- **Setlist edit / key change / chart swap:** these DO broadcast, via the content-sync pipe (§1.1).
- **Monitor tweak:** verified NOT a leader→band fan-out at all (§1.4) — personal mixing.

A lesser PROMPT would have written a probe for "leader advances song N → assert band jumps to N" and
the cowork instance would have burned 15 minutes discovering the feature is absent, then filed a
confused "couldn't reproduce" cell. Verifying first turned a dead probe into the axis's headline
*design finding*: the band has no leader-driven now-playing signal, and whether it should is a Daniel
decision (the err-public invariant says don't gate; the wedges-not-IEM live reality says the band is
co-located and uses verbal cues — so maybe the gap is fine). The PROMPT documents and frames; it does
not pre-judge the fix. This is the `[[feedback_cowork_prompt_verify_before_write]]` discipline paying
off exactly as intended.

## 3 — Why content-sync gets re-graded as a broadcast channel (not staleness)

Cycle-12 already touched `snapshot-listener.ts`, but only as "is my view stale?" 13a re-frames the
identical pipe as a channel with three properties a broadcast must have:

- **BC-1 propagation** — the change arrives at all. The three guards in `handleSetlist`/`handleTracks`
  (skip-if-pending-outbox `:244/:303`, LWW `:263-266/:349-365`, tombstone `:251/:333`) each can
  legitimately SUPPRESS a delivery. A receiver with its own pending outbox row, or a clock-skew LWW
  loss, or a stale tombstone, silently drops the leader's broadcast. BC-1 probes whether any guard
  eats a real leader change.
- **BC-2 latency** — the leader→band path is `applyEdit`→outbox-drain→Firestore→`onSnapshot`→Dexie
  put→`useLiveQuery`. Each hop adds time; the leader's own device shows the edit at hop 0. The gap
  between "leader sees it" and "band sees it" is the axis's central number.
- **BC-3 disruption** — when the delivery lands and `useLiveQuery` swaps `tracks[]`, what happens to a
  receiver mid-chart? The sharpest case: `PDFOverlay` keys on a positional `currentIndex`
  (`SetlistPerformClient.tsx:317-323`, `onNavigate(index)`), while `595153b192` URL-persistence keys
  on a `trackId`. An insert ABOVE the open track shifts the array index but not the trackId — so a
  broadcast insert can leave a receiver's overlay pointing at the wrong song. That's a real receiver
  yank, and it's only visible in a multi-context trace with a receiver parked in an open overlay.

## 4 — Worked example (traced end-to-end): F-C13A-EX "insert-above yanks the open overlay"

A fictional-but-grounded finding, traced through every layer, to show the cowork instance the depth
expected. (This is an illustration of the SHAPE, not a pre-judged result — the RUN must reproduce it.)

- **A3 sub:** A3-insert. **Persona:** broadcaster David; receiver Aviva (musician) mid-chart.
- **Anchor moment (narrative beat):**
  > Aviva is reading track 6 "Hashkiveinu," chart overlay open, scrolled to the bridge. The rabbi
  > calls for a niggun before it. David long-presses track 6 → Insert song → "before" → picks the
  > niggun. On David's iPad the new row drops in cleanly. On Aviva's iPad the chart she's reading
  > suddenly shows a DIFFERENT song — the overlay is still on positional index 5, but index 5 is now
  > the niggun, not Hashkiveinu. She's mid-bridge on a chart that just became the wrong chart, with
  > no cue that anything moved.
- **Mechanism trace (every hop):**
  1. David's `InsertSongAction` → `insertTrack({...})` (`live-director.ts:163`) + sibling `order`
     bumps (`:132`) → `applyEdit` (`local/write`) → David's Dexie + outbox.
  2. Outbox drains → Firestore `tracks` collection gains a doc + sibling order patches, each
     `updatedAt: serverTimestamp()`.
  3. Aviva's `startSnapshotListener` `subscribeTracks` (`snapshot-listener.ts:174`) fires
     `docChanges()` → `handleTracks` puts the new + modified rows into Aviva's Dexie (LWW passes;
     server stamp is newer).
  4. Aviva's `useLiveQuery` (`use-setlist-performance.ts:143`) re-sorts `tracks[]` by `order` →
     the array re-indexes. The niggun is now at array index 5; Hashkiveinu shifts to 6.
  5. Aviva's `PDFOverlay` is mounted with `currentIndex = 5` (`SetlistPerformClient.tsx:321`,
     `activeSongIndex` state). React re-renders the overlay with the SAME index → now resolves to the
     niggun. The `595153b192` URL effect (`:141-155`) keys on `tracks[activeSongIndex].id`, so the URL
     silently rewrites to the niggun's trackId too. **No "the setlist changed" cue fires.**
- **BC-1:** propagated ✓. **BC-2:** ~1-3s (illustrative). **BC-3:** YANKED — open overlay now shows
  the wrong song, scroll-within-chart lost, no cue.
- **Severity (receiver-felt):** HIGH — a musician actively performing loses their chart mid-phrase.
- **Affordance fix (1-3 sentences, err-public-safe):** When a snapshot delivery changes the array
  position of the currently-open overlay track, re-resolve the overlay by `trackId` (not positional
  index) so the musician STAYS on their song, and surface a non-blocking "setlist updated" pill (the
  `KeepAwakeToggle` `lastError` inline-pill pattern, `fd9e5c8439`, is the template). Never gate the
  update; just keep the musician anchored and tell them it moved.

## 5 — What this axis MISSES (honest deferral)

13a is deliberately one surface-family deep, not app-wide. It does NOT cover:

- **The MCP authoring round-trip itself** (clone→tweak→bond→eventDate→publish→templates→dedup). 13a
  fires exactly ONE MCP-origin broadcast trace (§3.D) to confirm MCP writes land live; the full
  weekly-flow authoring stress is **→ sibling 13b** (`cycle-13b-mcp-authoring`). Daniel's PRIMARY
  surface lives there.
- **Real iOS-Safari engine fidelity.** 13a runs Playwright `ipad-webkit` (WebKit, but the
  Playwright build, not a real iPad / real iOS Safari). Whether the broadcast latency + SW-cache
  interaction behaves the same on the band's ACTUAL device is **→ sibling 13c**
  (`cycle-13c-webkit-engine-correct`). If a trace shows surprising latency, flag it for 13c re-verify.
- **Bond hygiene + the chart-bind picker UX.** A3-swap touches binding only as a broadcast source;
  whether the SWAP picker itself surfaces the right candidates, and the `bondReviewRows` mismatch
  hygiene (FU-c12-4 `de2e089dc6`), is **→ sibling 13d** (`cycle-13d-bond-hygiene-and-picker`).
- **Offline broadcast survival.** What happens to a broadcast when the LEADER is offline (outbox
  stuck, never drains → band never receives) OR a RECEIVER is offline (misses the delivery, catches
  up on reconnect?) is genuinely interesting and broadcast-native — but it overlaps cycle-12's
  offline axis heavily. 13a notes the leader-offline-outbox-stuck failure mode in §1.1 as a BC-1
  risk but does not build a full offline matrix; **defer the offline×broadcast cross-product to a
  future dedicated axis** to avoid re-running cycle-12's `goOffline` matrix.
- **Monitor / wedge broadcast.** Verified non-existent as a leader→band fan-out (§1.4). One read-only
  topology-confirm observation, then deferred to a future monitor-dedicated axis.

## 6 — Why the personas are 1 broadcaster + 2 receivers (and the auth fold)

The gesture gate (`SetlistView.tsx:61` `isLeader && …`) means only band_leader/admin can broadcast.
So the broadcaster MUST be David (band_leader) — a musician can't open the live-director sheet. The
two receivers are deliberately asymmetric: Aviva (signed-in musician) and a public/unauth iPad,
because `firestore.rules:117-118` opens `tracks` to public read, so the QR-scan band member is a
real receiver and might behave differently (no profile → no `defaultTransposition`, different SSR
seed). Putting auth-divergence INSIDE the receiver set (rather than as a separate matrix axis) is how
13a folds the cycle bug-class "auth-state divergence" into the broadcast methodology without a
dedicated phase. The gate-check (musician long-press must NOT open the sheet) is the one place the
auth dimension is probed directly.

— from coder-1 (lane `cycle-13a-leader-broadcast-PROMPT-design`)
