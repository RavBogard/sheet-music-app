# Cycle-11 M3 — Heuristic + sanctuary-conditions DESIGN-NOTES

> Companion to `PROMPT.md`. This file answers: **why this methodology, what does it grade, what does it intentionally miss, and what does one finding look like end-to-end in this shape.** ~2 pages, written for Daniel + the auditor + the M3 cowork-Claude — design-thinking rationale, not procedure.

---

## Why heuristic-under-stress (and not "iPad sweep")

The cycle-1→10 mode treated the app as a thing to audit. Cycles got more rigorous but the unit of value drifted from *the musician's hand on the iPad* to *the spec passing or a class-violation in `PerformanceToolbar.tsx`*. Cycle-10's PARENT — which I authored — leans hardest on this drift: the report shape is a scorecard PER AREA, the findings JSONL has fields like `measurements: {zoom_out: {w:40, h:40}}`, and the verdict is BLOCKER/HIGH/MED/LOW. All true. None of it tells you whether Modah Ani opens in the right key in 4.2 seconds in a sun-bright sanctuary with a band leader counting off.

Daniel's reframe (cycle-11 charter §0): treat the musician as the user being followed, not the app as the thing to audit. **Heuristic-under-stress is the methodology that makes that reframe operational for *design intuition*** — it produces findings a designer can sit with and say "yes, I see why that bites; here's what I'd do Tuesday." M2's matrix is for data-correctness divergence; M1's narrative is for the lived end-to-end timeline; M3 owns **the designerly question of whether each affordance is *right for the conditions it's used under.***

### The lens, compressed

- **8 heuristics** (Nielsen-derived, picked for *Perform* specifically — H1–H8 in PROMPT §2). Three Nielsen heuristics are deliberately dropped (help-docs, flexibility-of-use, i18n) because they don't grade Perform; carrying them would dilute the lens.
- **7 stress conditions** (S1–S7 in PROMPT §3) — glare / time-pressure / tilted-angle / sweaty-fingers / partial-attention / battery-dim / cross-musician. Each has a "how to simulate in 75 min" recipe so a fresh cowork instance can run it.
- **4 anchor moments** (A1–A4 from charter §1) — setup-prep / between-songs / mid-service change / sanctuary edge.

The (H × S × A) tuple is the **identity** of a finding. A finding without that tuple is rejected. This forces every observation back to the musician's hand: *which heuristic is violated, what conditions activated the violation, when in the service does it bite?* If you can answer all three you have a designer-actionable finding. If you can't, you have an outside-M3-frame observation worth flagging but not logging.

## How M3 grades the 4 anchor moments + 3 bug-classes

| Charter target | How M3 grades it | What the finding looks like |
|----------------|------------------|------------------------------|
| **A1 setup-prep** | Walk the cold-load → setlist → first-chart sequence under S1 (glare) + S2 (time-pressure) + S5 (partial attention). | "Logged-out QR card flashes-then-yanks on auth-resolve (H1 visibility, S5 partial-attention, A1 setup-prep) — fresh band-member on a fresh iPad sees a card disappear during their first 600ms; affordance fix: pre-render the auth-state-resolved card." |
| **A2 between-songs scramble** | The 5-10sec scramble is the single hardest moment Perform is designed for. Apply S2+S4+S6 to the tap-path: open setlist row → tap next track → chart renders → transpose holds → wake-lock holds. Stopwatch every step. | "Mid-service compact toolbar 3 controls + spacing under S4 + S2 fails neighbor-test — three +2/+1/0 transpose buttons crowded enough that thumb-tap lands wrong button at 60% confidence; affordance fix: collapse to single transpose-value display with long-press for menu." |
| **A3 mid-service change** | The rabbi changes the order. The leader transposes. M3 probes S5 (partial attention), S7 (cross-musician), H3 (recovery), H4 (consistency). | "Transposing +2 on iPad-A doesn't broadcast peripherally on iPad-B (H4 consistency + H1 visibility, S7 cross-musician, A3 mid-service change) — bandmate plays one bar in wrong key before noticing; affordance fix: emit a peripheral 'key-changed' confirmation pulse to all bound iPads." |
| **A4 sanctuary edge** | Wifi drops, battery hits 18%, glare on the screen. S6+S1+S2. H8 (recover from errors) is the heaviest lens here. | "Offline drop silently freezes the not-yet-opened chart (H8 help/recover, S1 glare + S2 time-pressure, A4 sanctuary edge) — no visible cue the wifi is gone; band member taps + sees nothing for 4 sec; affordance fix: peripheral 'offline-mode' status pill above the chart frame, visible from any zone." |
| **§2.1 Stickiness** | A dedicated stickiness pass in PROMPT §6 Part 3.1 — soft-reload + hard-reload + close-and-reopen on each user-changeable value. Findings carry a `bug-class: stickiness` tag layered on the (H × S × A) identity. | "Wake-lock toggle ON persists in-session but drops on cold-load (H1 visibility + H3 recovery, S5 partial-attention, A1/A4); musician believes Keep-Awake is on because the toggle UI shows ON, but the actual wake-lock-API was never re-acquired on cold-load. Affordance fix: on cold-load, surface 'reactivate wake-lock' affordance instead of stale-ON state." |
| **§2.2 Fresh-tablet** | A dedicated fresh-incognito pass walking A1+A2 cold. SW + Firestore + auth + Next.js caches all cold. | "First-touch Perform load shows 'Rendering…' for 3.4 sec on cold cache (H8 + H7, S2 time-pressure, A1) — a fresh-tablet band member walking up two minutes pre-service sees an unresponsive screen; affordance fix: warm the SW + Firestore caches at QR-sign-in success so cold-tablet → first-chart-open <1 sec." |
| **§2.3 Auth-state divergence** | A dedicated dual-window pass, signed-in + guest, walking the same routes. Findings here often surface H4 (consistency) breaks. | "/perform/setlist/<public-id> signed-in shows Wake-Lock + Annotate toolbar; logged-out guest sees neither despite the page being technically public (H4 consistency, S7 cross-musician, A4 sanctuary edge); affordance fix: decide explicitly whether annotate is band-only or public — currently it's accidentally auth-gated." |

If any of the 4 moments or 3 bug-classes has zero findings, that itself is reported in REPORT §D. Empty cells are data ("the surfaces I probed all persisted cleanly across reload across 6 stickiness probes" is a useful sentence Daniel can act on).

---

## The report shape: heuristic-violation card (NOT scorecard)

Cycle-10's scorecard rolled up to PASS/FRICTION/BROKEN per AREA, with findings tagged by SEVERITY + SHIP-CLASS. That format optimizes for "what bugs ship today and what hold." It's the wrong optimization for the *redesign-the-affordance* question.

M3's unit is a card with these fields (full spec PROMPT §7):
- **(H × S × A) tuple** — the finding's identity.
- **Bug-class tag** if applicable (stickiness / fresh-tablet / auth-divergence / none).
- **The musician's experience in first-person POV** — 1-2 sentences. The voice is "I tapped Modah Ani. The transpose was still on +2…", not "the user clicked the link". This is AP-5 (audit stance) being explicitly broken; M3's voice is a designer shadowing a user, not an auditor noting a class violation.
- **Heuristic violation in design language** — what H<N> says good looks like; what the affordance does instead.
- **Stress activation** — under S<N>, here's why it bites. The same affordance might be fine in a non-stress probe.
- **Affordance fix** — designer-actionable, 1-3 sentences. "Move the wake-lock toggle into the chart-overlay compact toolbar with a peripheral-pulse on state change" — not "increase h-10 to h-11". The fix names the *interaction*, not the *CSS*.

This is the AP-4 break: each finding is itself a design artifact, not a row in a triage table. And **REPORT §B WHAT-WE-LEARNED** is mandatory ≥4 design principles — distilled insight, not bug count.

---

## A worked-example finding — end-to-end in M3 shape

### M3-007 — Keep-Awake toggle confirms ON foveally but never peripherally; partial-attention musicians don't know it's working

- **Heuristic:** H1 Visibility of system state.
- **Stress condition:** S5 Partial attention (60/40 eye-split between conductor and screen).
- **Anchor moment:** A1 setup-prep (band-member arms wake-lock 8 minutes pre-service before partial-attention mode begins).
- **Bug-class tag:** none — pure heuristic; orthogonal to stickiness (PROMPT §6 Part 3.1 also probes stickiness of this toggle as a separate cell — see M3-008 below for the stickiness companion).
- **Identity state observed under:** signed-in band-member (via admin-test-session escape hatch).
- **Surface:** `src/components/performance/KeepAwakeToggle.tsx` rendered from `src/components/performance/PerformanceToolbar.tsx:300` (compact variant in chart-overlay) and `:369` (full toolbar top variant). Plus `src/hooks/use-wake-lock.ts` for the underlying API contract.
- **The musician's experience:**
  > "I tap Keep Awake. The toggle slides to ON. The icon turns blue. Three minutes into the call-to-prayer my eyes are on the rabbi. I glance down: the screen is dim. I think it dropped. I tap the toggle again to be sure. It was already on. I just couldn't tell from peripheral vision because nothing on the screen *looks* like it's holding the screen awake — there's no peripheral motion, no edge-glow, no pulse-on-screen-dim-avoidance moment."
- **The heuristic violation:** H1 (visibility of system state) requires the user to be able to assess current state without invoking memory. The current toggle confirms state ONLY in the foveal-attention zone (the toggle is a 44×24 px UI control in the toolbar). Under partial attention there's no peripheral signal that "the wake-lock is engaged." The musician falls back on memory ("I think I tapped it"), and memory under cognitive load is unreliable.
- **The stress condition that activates it:** S5 partial-attention is the dominant operating mode in A2/A3. A toggle that confirms only foveally is structurally invisible during exactly the moments the band needs it most.
- **Affordance fix (designer-actionable):** Surface wake-lock state in a *peripherally-visible* way that doesn't require looking at the toggle. Three options to weigh: (a) a faint pulsing edge-glow around the chart frame while wake-lock is engaged; (b) a small persistent indicator in the *bottom* third of the screen (the visible-action zone under S3 tilted-angle); (c) an OS-level integration with iPad's "stay awake" affordance so the OS-level indicator does the work. (a) is cheapest; (c) is ideal but iOS-Safari-restricted. Designer should sketch (a) first.
- **Measurement evidence:** screenshot path `cycle-11-m3-heuristic-instance-1-artifacts/M3-007-toggle-confirmation-foveal-only.png`; contrast ratio of the toggle's ON-state color vs ambient toolbar background = 3.2:1 (under-spec for foveal but legibility was not the failure — peripheral motion absence was).

---

## What this methodology will likely MISS (honest)

M3's lens is **point-in-time affordance evaluation under stress**. Some classes of bugs it under-catches:

1. **Long-tail data-correctness divergence.** "Saturday's songCount shows 0 but the setlist has 16" is not a heuristic violation under a stress condition; it's a Firestore field that wasn't recomputed. M3 might catch its *display-time symptom* under H1 (S1 glare doesn't activate it; just visiting the page does). M2's matrix is the right tool — it'll systematically probe (write-tool × field) combinations and catch the source. M3 cells that find one will note "outside-M3-frame, may be M2 territory" per PROMPT §8.
2. **End-to-end timeline narrative friction.** "From 8:42am rabbi-arrives → 9:03am opening-prayer → 9:15am Modah-Ani → 9:18am surprise-key-change → 9:21am wifi-blip" — this 40-minute lived arc is what M1's narrative methodology catches. M3 catches each *moment* under stress; the *transitions between moments* under sequential pressure are M1's job. M3 partially covers this via the §6 Part 2 anchor-moment walk-throughs, but it's a secondary pass, not the headline.
3. **Subtle MCP-side behaviors that surface to UI.** "Hebrew transliteration shows English on guest view but Hebrew on signed-in view" is auth-state divergence but its root cause is a MCP tool branching on `roles`. M3 catches the UI symptom; M2's matrix is more likely to trace it back to the write path.
4. **First-time-user mental-model formation.** "Does a guest understand what /perform IS at all" is a UX-research question that exceeds a single-session heuristic sweep. M3 grades affordances *given* the user knows what they're doing; the orientation phase before that is partial coverage at best.
5. **Heuristic-frame-blind violations.** If a friction doesn't map to one of the 8 chosen heuristics (e.g., a delight-design choice that's wrong-for-context), M3 might dismiss it. The H1–H8 frame is a deliberate compression; like all compressions it loses signal in some axes.

The honest framing: **M3 is the right tool for "would this affordance feel right in a stressed musician's hands"** and the wrong tool for "are the underlying data flows correct" (M2) and "does the whole service-arc feel like a coherent experience" (M1). The three-lane bet is that those three questions catch different bugs; the comparison reveals which questions Daniel wants answered first.

---

## How this PROMPT is *intentionally* different from cycle-10 (recap of PROMPT §0)

Five explicit breaks (PROMPT §0 1–5), checked against the charter's 7 anti-patterns:

| PROMPT §0 break | Charter AP | What changes |
|------------------|------------|--------------|
| #1: drop the harness as scope-generator | AP-1 (class-violations) + AP-2 (app-wide roam) | Scope is the (H × S × A) cell list, not the harness category map. The DOM is not a coordinate. |
| #2: scope by (H × S × A), not by letters | AP-2 | Deep on Perform, not shallow on 10 letters. |
| #3: heuristic-violation card, not scorecard + JSONL | AP-3 (compressed findings) + AP-4 (findings-as-only-output) | Cards include musician-voice + affordance fix; JSONL is optional secondary. |
| #4: probe across identity states deliberately | AP-7 (single-state probe) | Logged-out + signed-in + fresh-incognito + cross-musician are the minimum probe set. |
| #5: no ship-class field | AP-6 (pre-service ship-freeze) | Charter §5 no-freeze means the cowork doesn't pre-classify; triage decides. |

The two remaining anti-patterns (AP-4 "findings-as-only-output" and AP-5 "audit stance") are broken by REPORT §B "WHAT-WE-LEARNED ≥4 design principles" and REPORT §A "first-person designer-voice verdict" respectively. The PROMPT §9 sign-off makes those mandatory.

---

## A note on insider knowledge

I authored cycle-10 PARENT (`1fe7bfb58a` blob). The supervisor's dispatch flags this as a strength to use deliberately — *"you have the strongest pull-to-pattern-match. Open your PROMPT.md by listing 5 specific things cycle-10 PARENT did that this lane WILL NOT DO."* That list is PROMPT §0. The honest risk is that I'll re-do cycle-10 in heuristic clothing; the honest mitigation is to keep the §0 break-list on the wall throughout writing and check every section against it. The DESIGN-NOTES section above ("How this PROMPT is intentionally different from cycle-10") is the final check — if a future reader can't see the break, the methodology has slid back. The shape of the report shipped (cards, not scorecards; voice, not severity; affordance fix, not measurement-only) is the proof.

*— coder-5, cycle-11 M3 lane*
