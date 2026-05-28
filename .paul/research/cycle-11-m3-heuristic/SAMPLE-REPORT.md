# Cycle-11 M3 — Heuristic + sanctuary-conditions cowork REPORT (SAMPLE)

> **This is a FICTIONAL completed run.** It exists so Daniel + the auditor can read what an M3 finished report *feels like* and pick between the three methodologies on the basis of it. None of these findings are real — they are illustrative of the M3 shape applied to the real surfaces.

**Run date:** 2026-MM-DDTHH:MMZ (fictional)
**Cowork instance:** M3-instance-1 (fictional sample)
**Wall-clock:** ~73 min
**Identity states probed:** logged-out guest, signed-in band-member (via admin-test-session), fresh-incognito, cross-musician (two side-by-side iPad-webkit windows)
**Master SHA at run:** `<sample — would be `git log -1 origin/master` value>`
**Cleanup state:** clean — `cleanup_all_test_data({prefix:"c11m3"})` returned 0 residual

---

## §A — Designer's verdict

I followed a fictional band member, *D.*, through a Saturday morning B'nei Mitzvah on her own iPad — first under the actual sanctuary stress conditions, then re-walking each moment under the seven S-conditions individually. I came away with three sentences I want to keep in front of me: **Perform is a great power-user surface and a tense first-touch one.** When D. has memorized where the wake-lock toggle is and what the +2 transpose indicator looks like, she succeeds in the 6-second scramble. When she hasn't (fresh tablet, partial attention, or a moment of stress) she doesn't get a peripheral signal that anything is happening, and the app goes quiet at exactly the moment it should pulse. **The single biggest design intervention available right now isn't tap-target enlargement — it's giving Perform a peripheral-vision vocabulary** for state changes (transpose, wake-lock, monitor send, offline, cross-musician sync). Twelve findings, eight of which trace to two heuristics (H1 visibility and H6 recognition) and three stress conditions (S5 partial-attention, S3 tilted-angle, S2 time-pressure). The other four are split across the three charter bug-classes (1 stickiness, 2 fresh-tablet, 1 auth-divergence). Recommendation: a peripheral-state-vocabulary lane post-Saturday is the highest-leverage design intervention of the cycle.

---

## §B — WHAT-WE-LEARNED (design principles)

1. **Perform speaks foveally but operates peripherally.** Every state change confirms itself in the foveal-attention zone (toolbar, dropdown closes). The dominant operating mode for a musician on a stand is partial attention. The app is structurally silent during the moments it most needs to signal — every state change should ALSO produce a peripheral-vision cue (edge pulse, color shift in the chart frame, brief scale gesture).

2. **44px is the floor, not the goal — neighbor-spacing is the second axis.** Three controls in the compact toolbar individually pass HIG; their *neighbor distances* fail S4 sweaty-finger probes (mis-tap rate ~25% in a fictional 30-tap dry run). The next iteration of the toolbar should specify both target size AND minimum 12px gap to a sibling interactive element.

3. **The "lose-the-beat zone" is real and the wake-lock lives in it.** The top-third of a tilted iPad is the look-up-and-lose-the-beat zone; the wake-lock toggle is there. Critical state indicators must move into the bottom-third (visible-action zone) — or into a peripheral-edge surface that's visible from any zone. The principle: any control whose state matters mid-song belongs in the visible-action zone.

4. **Fresh-tablet is not just "no cache" — it's "no muscle memory".** Two of the fresh-incognito findings aren't about cache cold; they're about *the user not having seen the UI before*. Onboarding (QRSignIn → first-chart-open) needs to teach the affordances it expects the musician to use Tuesday. The PWA install moment is the right teaching opportunity; it's currently silent.

5. **Cross-musician sync is the unspoken contract.** Every musician assumes that what they see on their iPad matches what their bandmate sees. Three of the findings break this contract subtly (transpose changes don't broadcast peripherally to bound iPads; the leader's reorder is reflected eventually but without acknowledgment; an authed musician sees an annotate affordance that a logged-out musician peering over their shoulder doesn't, so the second musician's "look the chart is the same" check fails). The principle: surface a "your iPad is in sync with the band" affordance that confirms when sync happens.

---

## §C — Findings (heuristic-violation cards)

### M3-001 — Keep-Awake toggle confirms ON foveally but never peripherally

- **Heuristic:** H1 Visibility of system state
- **Stress condition:** S5 Partial attention
- **Anchor moment:** A1 setup-prep (the moment it's most likely to be armed; the consequence bites later in A2/A3)
- **Bug-class tag:** none (pure heuristic)
- **Identity state:** signed-in band-member
- **Surface:** `src/components/performance/KeepAwakeToggle.tsx` rendered from `PerformanceToolbar.tsx:300, 369`
- **The musician's experience:**
  > "I tap Keep Awake. The toggle slides to ON, the icon turns blue. Three minutes in, my eyes are on the rabbi. I glance down: screen looks dim. I think it dropped. I tap again to be sure. It was already on."
- **The heuristic violation:** H1 requires the user to assess current state without invoking memory. The toggle confirms only in foveal-attention range; under partial attention there's no peripheral signal the wake-lock is engaged.
- **The stress condition that activates it:** S5 is the dominant operating mode in A2/A3. A toggle confirming only foveally is structurally invisible during exactly the moments the band needs it.
- **Affordance fix:** Add a peripheral signal that wake-lock is engaged — a faint pulsing edge-glow on the chart frame, OR an indicator in the bottom-third (visible-action zone), OR (ideal but iOS-Safari-restricted) OS-level integration. (a) is cheapest; sketch first.
- **Measurement evidence:** sample-artifact `M3-001-peripheral-absence.png`; foveal contrast on toggle ON state = 4.7:1 (passes), peripheral-cue presence = absent.

### M3-002 — Compact-toolbar neighbor spacing fails S4 (12px gap to sibling)

- **Heuristic:** H5 Error prevention
- **Stress condition:** S4 Sweaty / imprecise fingers
- **Anchor moment:** A2 between-songs scramble
- **Bug-class tag:** none
- **Identity state:** signed-in band-member
- **Surface:** `PerformanceToolbar.tsx` compact variant; specifically the chart-overlay toolbar's transpose / zoom / monitor group
- **The musician's experience:**
  > "Modah Ani opens. I reach for transpose to bump +2 — my thumb is sweaty from kiddush. I hit the zoom control next to it. I now have a zoomed chart in the wrong key and I'm three bars in."
- **The heuristic violation:** H5 requires the design to prevent accidental destructive taps. Three compact-toolbar controls have ≤4px effective interactive-edge gap.
- **The stress condition that activates it:** S4 humid-finger imprecision raises mis-tap rate to ~25% (sample: 8 of 30 fictional taps landed neighbor). 44px hit area is necessary but not sufficient under S4.
- **Affordance fix:** Enforce a minimum 12px gap between adjacent interactive controls in the compact toolbar. Move zoom into a separate compact-toolbar group or behind a single "view options" affordance. The principle: target-size and neighbor-distance are independent axes; both must be satisfied.
- **Measurement evidence:** `getBoundingClientRect` from `ipad-webkit` viewport: transpose right-edge x=224, zoom left-edge x=228 (4px gap). Per Apple HIG, 44px individually meets floor but the gap is sub-spec for "important controls."

### M3-003 — Wake-lock toggle lives in the lose-the-beat zone (header top-strip)

- **Heuristic:** H6 Recognition over recall
- **Stress condition:** S3 Tilted-stand angle (70°)
- **Anchor moment:** A2 between-songs scramble
- **Bug-class tag:** none
- **Identity state:** signed-in band-member
- **Surface:** `PerformanceToolbar.tsx:369` (full toolbar variant, top strip)
- **The musician's experience:**
  > "Wake-lock dropped during the sermon — I'd forgotten to arm it. The leader's already counting off. I have to glance UP at the top strip and visually scan for the moon icon. By the time I land it I've missed the downbeat."
- **The heuristic violation:** H6 requires the user to *recognize* the affordance from glance, not *recall* its location. The top-of-screen position requires recall (head movement + foveal scan + memory of icon).
- **The stress condition that activates it:** S3 70° tilt makes the top-third the "look-up-and-lose-the-beat" zone. Critical state controls living there violate the visible-action-zone principle.
- **Affordance fix:** Add a wake-lock affordance to the compact in-chart toolbar (`PerformanceToolbar.tsx:300` already supports this — see Daniel's cycle-10 C10I1-003 / coder-1 `4bcefb929c` partial fix). Verify the compact placement is in the bottom-third visible-action zone, not buried.

### M3-004 — Logged-out QR card flash-yanks on auth-resolve

- **Heuristic:** H1 Visibility of system state (sub-class: stable-state-on-load)
- **Stress condition:** S5 Partial attention
- **Anchor moment:** A1 setup-prep
- **Bug-class tag:** fresh-tablet (charter §2.2 — most likely to be observed on a fresh-cache iPad where auth-resolve is the slowest)
- **Identity state:** logged-out guest cold-load (then watching auth-resolve)
- **Surface:** `PublicSetlistListing.tsx:35,139` (`useAuth()` + `!authLoading` CLS guard)
- **The musician's experience:**
  > "Brand-new iPad. I tap /perform. A QR sign-in card flashes on for ~400ms then disappears. I think 'wait, was I supposed to scan that?' and tap around looking for it."
- **The heuristic violation:** The `!authLoading` guard is intended to prevent flash-yank, but observed behavior shows brief render-then-yank during the auth-state-cold-resolve window. H1 says the user must be able to assess state without watching the screen reshape itself.
- **The stress condition that activates it:** S5 partial attention raises the cost of an unexpected motion: a card appearing and disappearing in peripheral vision is exactly the kind of motion the eye catches; the foveal follow-up finds nothing.
- **Affordance fix:** Hold the SSR skeleton longer (until auth-state is resolved) OR render the card with an initial `opacity:0` and fade-in only after `!authLoading` (so a brief auth-loading-then-resolved sequence shows zero card-yank). Designer choice: which feels right; the principle is *do not let the auth-state-resolve produce visible motion*.

### M3-005 — Transpose state change doesn't broadcast peripherally

- **Heuristic:** H1 Visibility of system state
- **Stress condition:** S5 Partial attention
- **Anchor moment:** A3 mid-service change
- **Bug-class tag:** none
- **Identity state:** signed-in band-member
- **Surface:** `src/components/music/TransposerMenu.tsx` (referenced from `PerformanceToolbar.tsx:9, 277`) + `SmartScoreViewer.tsx` re-render
- **The musician's experience:**
  > "Leader says 'down to D.' I tap transpose, tap -2, the menu closes. Chart looks the same to my eye. I play the first bar in the original key. Then I look — the chart IS now in D but it looks identical to my peripheral view."
- **The heuristic violation:** A user-initiated state change with no peripheral signal. H1 says the system's response should be *visible*. Foveal post-change inspection requires looking at the chart and reading note names — a 2-3 sec cognitive cost the scramble can't afford.
- **The stress condition that activates it:** S5 partial-attention. Under foveal attention the change is obvious (notes are different); under peripheral attention the chart shape is identical.
- **Affordance fix:** Brief peripheral confirmation on transpose-apply — a 200ms color-pulse on the chart frame in the new key's color, or a momentarily-larger key-name overlay in the bottom-third. The principle: any user-initiated state-change that affects what the musician plays needs a peripheral signal.

### M3-006 — Wake-lock toggle's ON state silently lapses on cold-reload

- **Heuristic:** H3 User control + freedom (recovery) + H1 Visibility
- **Stress condition:** S5 Partial attention
- **Anchor moment:** A1 setup-prep (mismatched re-arm expectation) + A4 sanctuary edge (cold-recovery)
- **Bug-class tag:** stickiness (charter §2.1)
- **Identity state:** signed-in band-member
- **Surface:** `KeepAwakeToggle.tsx` + `use-wake-lock.ts`
- **The musician's experience:**
  > "Cold-load Perform — yesterday I'd left Keep Awake ON. The toggle still SHOWS ON. I assume I'm armed. Mid-prayer the screen dims. The wake-lock was never actually re-acquired; the UI just persisted the toggle position."
- **The heuristic violation:** Partial persistence — the UI state (toggle position) sticks; the underlying wake-lock API state does not. H1 (visibility) is violated because the UI claims a state the system doesn't have. H3 (recovery) is also violated — the user has no clean recovery affordance because they don't know there's a problem until the dim.
- **The stress condition that activates it:** S5 + the cold-reload boundary. The wake-lock API requires a user gesture to acquire; persistence reads from local-state but never re-fires the gesture.
- **Affordance fix:** On cold-load, force the toggle to OFF state until user re-arms. OR display an explicit "Wake-lock requires re-activation" affordance in the visible-action zone on cold-load. The principle: persisted UI state must match underlying system state, or the UI must surface the mismatch.

### M3-007 — Fresh-incognito Perform load shows "Rendering…" for ~3.4 sec on first-chart

- **Heuristic:** H8 Help users recognize / diagnose / recover from errors (sub-class: communicate progress)
- **Stress condition:** S2 5-second time pressure
- **Anchor moment:** A1 setup-prep (fresh iPad walking up 2 min pre-service)
- **Bug-class tag:** fresh-tablet (charter §2.2)
- **Identity state:** fresh-incognito (Firestore cache cold, SW cold, Next.js page cache cold)
- **Surface:** `SetlistPerformClient.tsx` first-chart loader; `SmartScoreViewer.tsx` + `resolveViewerKind.ts` route resolution
- **The musician's experience:**
  > "First time using this iPad. I scan the QR. I sign in. I tap into Saturday. I tap the first track. I see 'Rendering…' for what feels like forever. I'm worried something is broken."
- **The heuristic violation:** H8 says the system should communicate state during long operations. 'Rendering…' is text not a progress signal; the user can't tell if 3.4 sec is normal or if the chart is broken.
- **The stress condition that activates it:** S2 time-pressure. The cowork pre-service window is ~5-10 min; a 3.4-sec first-chart-render eats it.
- **Affordance fix:** Replace 'Rendering…' with a chart-skeleton (staff lines + chord-symbol shimmer) during the load. OR pre-warm the SW + Firestore cache at QRSignIn success so cold-tablet → first-chart-open is <1 sec. (b) is the higher-leverage fix; (a) is the cheaper one.

### M3-008 — Annotate affordance is auth-gated but doesn't say so

- **Heuristic:** H2 Match between system and real world + H4 Consistency
- **Stress condition:** S7 Cross-musician peripheral
- **Anchor moment:** A4 sanctuary edge (a guest peering over a bandmate's shoulder)
- **Bug-class tag:** auth-divergence (charter §2.3)
- **Identity state:** dual-window (signed-in band-member + logged-out guest, side-by-side at iPad viewport)
- **Surface:** `PDFOverlay.tsx` annotation affordance visible to signed-in only; logged-out guest sees the chart without the affordance
- **The musician's experience:**
  > "A guest walks up. They see the chart on my iPad — same chart, same key. But mine has an annotation. They tap their setlist row and see the chart but no annotation. They ask 'how did you draw on yours?' I have to explain we have different roles."
- **The heuristic violation:** H2 — the system divergence doesn't match the user's mental model ('the chart is the chart'). H4 — two views of the same chart should be consistent unless the divergence is intentional + communicated.
- **The stress condition that activates it:** S7 cross-musician peripheral check makes the divergence visible.
- **Affordance fix:** Decide: is annotate band-only or public? Currently it's accidentally auth-gated. If band-only, surface a "this annotation is visible to the band" affordance; if public, render the annotation layer to logged-out guests. The principle: differential surface MUST be intentional + signaled; never accidental.

### M3-009 — Offline-drop has no peripheral signal

- **Heuristic:** H8 Help users recognize / diagnose / recover from errors
- **Stress condition:** S1 Glare + S2 Time pressure (compounded)
- **Anchor moment:** A4 sanctuary edge
- **Bug-class tag:** none
- **Identity state:** signed-in band-member; wifi disabled via DevTools network throttling 'Offline'
- **Surface:** `SetlistPerformClient.tsx` + lack of a global offline-state pill above the chart
- **The musician's experience:**
  > "I'm mid-song. The wifi drops. The chart on screen is fine (it was cached). I try to swipe to the next chart — nothing happens. I tap again. Nothing. I'm 4 sec in before I figure out the wifi is gone."
- **The heuristic violation:** H8 says the system should TELL the user what's wrong. Currently the offline state is silent.
- **The stress condition that activates it:** S1 glare obscures any subtle indicator (browser-chrome offline notice is barely visible); S2 4-sec discovery cost is half the between-songs scramble budget.
- **Affordance fix:** A persistent peripheral 'offline-mode' status pill above the chart frame, visible from any zone (use the visible-action-zone principle). Show 'offline — cached charts only' immediately on wifi-loss; clear on reconnect with a peripheral pulse confirming sync.

### M3-010 — MusicXML transpose at 30% brightness fails legibility floor for chord glyphs

- **Heuristic:** H1 Visibility of system state (state = "I can read this chart")
- **Stress condition:** S6 Battery-dim / auto-dim (30% brightness)
- **Anchor moment:** A3 mid-service change
- **Bug-class tag:** none
- **Identity state:** signed-in band-member; brightness OS-level 30%
- **Surface:** `SmartScoreViewer.tsx` chord-symbol overlay (the MusicXML render path per `resolveViewerKind.ts`)
- **The musician's experience:**
  > "iPad at 30% — the leader transposes to D. Chord symbols are now Gm7/D and the small chord-name text is hard to read. I'm squinting and missing the count-off."
- **The heuristic violation:** H1 — at the moment the musician needs to read the new chord names, they can't. The visibility-of-state collapses with brightness.
- **The stress condition that activates it:** S6 battery-dim. Contrast measured at 30% brightness drops the chord-glyph foreground/background contrast from 7.1:1 to ~3.4:1 (under 4.5:1 floor).
- **Affordance fix:** Increase the chord-glyph weight (regular → medium) and slightly larger size at the MusicXML render stage. Alternatively, raise the contrast-mode threshold so iPad's high-contrast OS setting kicks in earlier. Per `[[project_musicxml_goal]]`: never propose PDF-only; fix MusicXML.

### M3-011 — Setlist reorder by leader doesn't peripherally acknowledge on bound iPads

- **Heuristic:** H4 Consistency + H1 Visibility
- **Stress condition:** S7 Cross-musician peripheral
- **Anchor moment:** A3 mid-service change
- **Bug-class tag:** none (could overlap stickiness if the reorder fails to persist; this finding is the *peripheral-signal* gap, not the persistence gap)
- **Identity state:** dual-window (signed-in band-member + signed-in second band-member)
- **Surface:** `SetlistPerformClient.tsx` (the listener that receives the reorder)
- **The musician's experience:**
  > "The leader on her iPad drags Modah Ani up two slots. On my iPad the list silently re-renders. I didn't see it move. I think the list is still the old order and tap what I think is next — wrong song."
- **The heuristic violation:** H1 — a remote state change that I'm subject to should announce itself. H4 — consistency between leader's iPad and mine is preserved in data but not in the signal.
- **The stress condition that activates it:** S7 cross-musician. The leader's iPad confirms the change; mine doesn't; the discrepancy is silent.
- **Affordance fix:** When a remote-initiated reorder arrives, animate the list item motion (250ms) so the change is visible peripherally; OR show a transient pill 'setlist updated by leader' in the visible-action zone.

### M3-012 — `/monitor` panel iPad layout fails the visible-action-zone test for bus5 master-mute

- **Heuristic:** H6 Recognition + H1 Visibility
- **Stress condition:** S3 Tilted-stand angle
- **Anchor moment:** A4 sanctuary edge (a band-member checks their monitor during a quiet moment)
- **Bug-class tag:** none
- **Identity state:** signed-in band-member with monitor access
- **Surface:** `src/app/(main)/monitor/page.tsx`; `src/components/monitor/{BusAssignmentPanel,FaderStrip,ConnectionIndicator}.tsx` — visual shape only (no fader push)
- **The musician's experience:**
  > "I want to check my wedge is on bus 5 master-mute. I have to scroll the iPad up to find the bus assignment, then visually scan for bus 5 — which is mid-screen, in the lose-the-beat zone."
- **The heuristic violation:** H6 + H1. The critical "is my wedge muted right now" state lives in the look-up-and-lose-the-beat zone on iPad portrait.
- **The stress condition that activates it:** S3 tilted-stand angle.
- **Affordance fix:** Pin a 'my channel · bus N · mute state' summary affordance to the bottom-third visible-action zone of `/monitor`. The rest of the matrix can stay in the top-third for power-user adjustments.

---

## §D — The 3 NEW bug-classes (charter §2) — explicit roll-up

- **Stickiness (§2.1):** 1 finding — M3-006 (wake-lock cold-reload partial-persistence). Other stickiness probes (transpose, annotation, monitor fader-position) ALL persisted cleanly across 3 reload modes — that's a positive note in itself.
- **Fresh-tablet (§2.2):** 2 findings — M3-004 (flash-yank on auth-resolve), M3-007 (3.4s 'Rendering…' on first-chart). The cache-cold reality is concentrated at *the first interaction*; subsequent navigations on the warmed cache are clean.
- **Auth-state divergence (§2.3):** 1 finding — M3-008 (annotate affordance silently auth-gated). The cross-musician peripheral check is the diagnostic that surfaced it; without dual-window probing the divergence is invisible.

---

## §E — Manual cleanup needed

None — `cleanup_all_test_data({prefix:"c11m3"})` returned 0 residual after the session.

---

## §F — What M3 likely MISSED in this run

- Long-tail data-correctness divergence (e.g., songCount field mismatches like cycle-10 C10I1-002) — M2's matrix should catch these.
- The full 40-min Saturday-morning lived arc — M1's narrative should catch the cumulative attention cost.
- MCP-side root causes for the auth-divergence in M3-008 — M2's matrix more likely to trace it.
- First-time-user mental-model formation (the orientation question prior to using affordances) — exceeds the heuristic-sweep methodology.

Several observations were noted-outside-frame and handed off:
- One MCP enumeration anomaly noted while side-checking — flagged for M2.
- One narrative seam (the gap between QRSignIn success and PWA install moment) noted — flagged for M1.

— *fictional sample, cycle-11 M3*
