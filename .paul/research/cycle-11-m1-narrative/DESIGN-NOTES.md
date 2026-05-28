# Cycle-11 M1 — Design notes for the musician-shadow scenario-narrative methodology

> Companion to `PROMPT.md`. Two-page explanation of why this methodology was chosen, how it grades
> the charter's anchor moments and bug-classes, the shape of the report, one worked-example
> finding end-to-end, and an honest accounting of what this methodology will likely miss (so Daniel
> + supervisor can choose between M1 / M2 / M3 informed).

---

## Why narrative

Past cycle-10 findings (`.paul/research/cycle-10-cowork-instance-1-findings.jsonl`) caught the right
DOM-level facts but in the wrong order. The Saturday-morning "0 songs" finding (C10I1-002) reads as
`severity:HIGH, hypothesis:setlist.songCount Firestore field set at write but not updated on
track-add`. That sentence is **correct** but it's a fix-wave hypothesis, not the experience. The
experience was: a band member opens the app for Saturday, the card for Saturday says "0 songs", and
in that moment the musician's brain does a half-second double-take — *is this even the right
setlist? did the leader forget? am I on the wrong page?* — before they tap in and find 16 songs in
the header.

Cycle-10's compressed schema preserved zero of that. By the time the finding reached the supervisor
pipeline, it was a Firestore-field denorm bug. The half-second of doubt — the actual UX symptom —
was annotated out of existence.

This methodology bets that the **lived moment is the load-bearing form of the finding**, and the
DOM/Firestore mechanism is a footnote that helps the fix wave route the work. The order matters
because Daniel's framing on 2026-05-28 was explicit: *"how does the app feel to use, on the device
the band will hold."* "Feel" is not a property of a finding row; it's a property of a sequence of
beats. So the methodology produces sequences of beats. The findings emerge from them.

Concretely: a finding here is not a row in a JSONL but a paragraph at a timestamp inside a
musician's named morning. Severity grades how much of that morning the moment ate. The mechanism
guess is a footnote — useful for the next dispatch, but not the headline.

## How it grades the four anchor moments (charter §1)

| Anchor | How the narrative methodology surfaces frictions on it |
|--------|--------------------------------------------------------|
| **A1 setup-prep** | The musician's arrival is the first ~5 minutes of every scenario. Beats 1-5 of each timeline cover screen-wake, card scan, setlist open, songCount check, "Save N/M" indicator. A1 frictions are confidence dents BEFORE downbeat — they don't kill the service but they erode trust in the surface and slow the run-up. |
| **A2 between-songs** | Beats explicitly named "leader calls X, musician has 6 sec to land" in each scenario. The narrative captures the SCRAMBLE quality A2 has — overshoot, hesitate, mis-tap, re-tap. Two scenarios put A2 as PRIMARY (Aviva beat 7+11, Sarah beat 3). |
| **A3 mid-service change** | Beats simulating leader-side reorder + transpose from a sibling window. The narrative captures whether the change "lands" (musician's view converges) or "stalls" (musician plays the cut song). Sarah's scenario is the A3 stress test. |
| **A4 sanctuary edge** | The bottom of each timeline: wifi drop, glare, tilt, battery die, wedge mixer state, deep-link entry. Yossi's full scenario is an A4 stress test because the fresh-incognito guest IS the sanctuary-edge case. |

The methodology refuses to grade an A1-A4 moment "in the abstract" — every finding ties to a
timestamp in a named musician's service. A finding without a moment is not a finding under this
methodology; it's a DOM observation that hasn't been validated against the user's day.

## How it grades the three bug-classes (charter §2)

| Class | How the narrative methodology surfaces it |
|-------|--------------------------------------------|
| **Stickiness regressions** | Every scenario has at least one transpose / annotate / reorder beat followed by a reload beat. The musician's surprise on reload — "wait, didn't I…?" — IS the stickiness finding. The methodology pairs a write-beat to a read-beat across the same identity, and tags the gap. |
| **Fresh-tablet cache divergence** | Yossi's whole scenario is identity-state C (fresh-tablet-no-cache). Sarah's beat 6 (battery-died → fresh window) is a within-scenario fresh-tablet probe. The musician's "this iPad has nothing on it" reality is the lens. |
| **Auth-state divergence** | Three identity states (A logged-in band, B fresh-incognito, C fresh-tablet) run across the three scenarios. Yossi's signed-out → signed-in transition (beat 8) is the auth-divergence stress beat. Sarah's iPad↔phone same-account is the multi-device-same-account variant. |

Because each class has its own NAMED beats in the PROMPT, the auditor can verify coverage cheaply
("did Scenario 2 beat 5 fire — was the fresh-tablet chart-open actually exercised?") rather than
trusting a methodology checkbox.

## The report shape

`HANDOFF.md` has four major sections after the verdict + cleanup metadata:

1. **Three timelines** — one per scenario. Each timeline is prose with timestamps and explicit
   beat numbers. PASS beats get a `✓` and a one-line note; FRICTION/BROKEN beats get a paragraph
   describing the moment + a severity + a mechanism footnote + a ship-class.
2. **WHAT-WE-LEARNED per scenario** — two paragraphs per scenario, NOT bullets. Asks what the
   walking taught us about how the surface feels.
3. **SERVICE-DESIGN-INSIGHT** — one section at the end, one page, distilled across scenarios. The
   highest-altitude finding the methodology produces: not "fix this button" but "the band's
   relationship with the surface has this character." This is the section M2 (matrix) and M3
   (heuristic) probably will not produce.
4. **Mechanism footnotes table** — the bridge to a fix-wave dispatcher. Finding IDs, beat
   coordinates, mechanism guesses, ship-classes. This is the M1-to-supervisor handoff —
   compressed because we already have the lived moment above; the table is the lookup.

A secondary `findings.jsonl` is optional (for cycle-10 supervisor-pipeline compat); the canonical
form is the prose.

## Worked example — one finding end-to-end in this methodology

**Hypothetical beat from Scenario 1, transcribed in M1 shape:**

> **9:42:11** — Aviva taps the "B'nei Mitzvah of Gavin Stein — May 30" card on the `/perform`
> listing. The card itself reads "0 songs" — she registers it without quite reading it, and the
> setlist page begins to load. The header paints: **"16 songs · 20 items."**
>
> She freezes for a beat. *Was that the right setlist?* The card said zero. The header says
> sixteen. She glances back to the top of the page to confirm the title is the right service —
> "B'nei Mitzvah of Gavin Stein — May 30" — yes. So the card was wrong, not her tap.
>
> Total cost: about three seconds of hesitation + a quiet erosion of trust in the listing. A
> guest musician (Yossi) would have backed out of this and gone to find David L. to ask which
> setlist to open.
>
> - **Severity:** HIGH — A1 setup-prep beat; trust erosion before downbeat is the worst time for
>   it. Cumulative two-HIGH-in-one-scenario threshold reached on its own scenario.
> - **Mechanism (footnote):** `setlist.songCount` Firestore field went stale; the denorm fix
>   shipped `8139a443ec` claimed to cover all 5 track-mutating MCP tools but the inline auditor heal
>   was needed for Shavuot (0→17) and Saturday auto-heals only at the next cron tick. Verify
>   whether the post-`8139a443ec` heal has caught up by run time — if it has, this finding may not
>   reproduce; note as ALREADY-CLOSED in that case.
> - **Ship-class:** depends on reproduction — SAFE-NOW-DATA if a simple `recompute_setlist_track_
>   count` on the affected rows reproduces the heal; HOLD if there's a code-side gap.

Notice: **the moment is the headline**. The Firestore field is two lines of footnote. The fix-wave
dispatcher reading the Mechanism + Ship-class can route the work; the runbook reader sees how it
felt to Aviva.

## Honest weaknesses of this methodology

This lane is one of three independent bets per charter §8. M2 (matrix) and M3 (heuristic) will
cover different shapes. Daniel + supervisor compare. So the honest accounting is what this
methodology will likely **miss**, so the comparison is informed:

1. **Surface breadth.** Three scenarios × ~11 beats = ~33 beats. That is deep on a few moments and
   shallow elsewhere. There are probably 60+ distinct interactive affordances across Perform mode
   + Library + Setlist editing + Monitor + Print + Onboarding; this methodology will touch maybe
   30. M2's matrix will cover more affordances per minute by sweeping a finite (action × surface ×
   identity × reload) grid. If a regression exists in an affordance no scenario beat happens to
   touch (e.g. the metronome control's state during a sub-90-second tempo change), this methodology
   will miss it; M2 won't.
2. **Determinism / reproducibility.** A musician's run-through is by design a narrative — a beat is
   a single instance. If Aviva taps Modah Ani and the chart opens fine, the methodology will not
   re-tap 30 times to see if there's a 1-in-30 race. M2 + harness specs are better at the
   probabilistic / stickiness-across-100-tries shape.
3. **Subjective severity calibration.** "How much of the musician's morning did this eat" is a
   judgment call. Two reviewers running this methodology might disagree on whether a finding is
   HIGH or MED. JSONL-compressed methodologies are more deterministic in their grading. The fix is
   to write the moment richly enough that the reader can re-judge — but this is a real tax on the
   format.
4. **Performance regressions hidden in the narrative.** A 200ms slowdown across all interactions
   won't surface as a beat unless a musician notices it AT a beat. A targeted Lighthouse-style
   methodology (not proposed here; could be a future lane) catches that better.
5. **Cross-musician synchronization at scale.** This methodology probes two sibling windows
   (Scenario 3 beats 5, 7); it does NOT probe what happens when 6 iPads simultaneously listener on
   one setlist with one of them pushing changes. That's a load-shape test more suited to M2.
6. **One-shot run = one snapshot.** This methodology generates one rich run. M2's matrix runs many
   small probes and can detect drift over re-runs. M1 is high-fidelity-one-snapshot; for a
   regression detector that compares "did this beat get worse since last cycle" you'd want a
   different shape.
7. **Cost.** A 75-minute walk produces ~3 timelines × ~11 beats = ~33 evidence units. M2 can
   produce 200+ probe results in the same window. M1 trades breadth for depth.

What this methodology is **good at** (the inverse of the misses):
- The shape of the band's actual workflow, including the cross-cutting "I just walked in and need
  to play in 5 minutes" pressure that no DOM probe captures.
- Surfacing affordance + copy + discoverability frictions that the harness can't grade.
- Producing a SERVICE-DESIGN-INSIGHT that justifies whole-surface redesign or workflow change, not
  just bug fixes.
- The "guest musician on a fresh tablet" beat — Yossi — as a built-in stress test for the parts of
  the surface that work for Daniel-on-dev but not for the actual user.
- Producing findings the band-leader can read and recognize ("yeah, that IS what happens at
  9:42 every Saturday").

## Methodology comparison frame (for Daniel's eventual pick)

Pick **M1** when the question is *"does the app FEEL right for the band's actual workflow at
service-time"*. Pick **M2** when the question is *"does state stick across the matrix of identity
× action × reload"*. Pick **M3** when the question is *"do all surfaces survive a stressed-musician
attention budget under sanctuary conditions"*. If Daniel hybridizes: M1's timelines provide the
load-bearing narratives; M2 fills the breadth + stickiness sweep; M3 stress-tests the affordances
the timelines surface. A combined sweep would probably run M1 first (defines what to look for),
then M2 + M3 in parallel as fill-in.
