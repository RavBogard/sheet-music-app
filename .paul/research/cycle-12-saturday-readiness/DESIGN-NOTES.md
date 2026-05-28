# Cycle-12 — DESIGN-NOTES

**Authored:** 2026-05-28 (coder-1 lane `cycle-12-saturday-readiness-prompt-design`)
**Anchor SHA:** origin/master `0709bccfa6`
**Companion docs:** [PROMPT.md](./PROMPT.md), [SAMPLE-REPORT.md](./SAMPLE-REPORT.md)

---

## Why hybrid (and why now)

Cycle-11 ran three independent methodology designs in parallel: M1 musician-shadow
scenario-narrative (coder-1), M2 stickiness + state-divergence probe matrix
(coder-3), M3 heuristic + sanctuary-conditions affordance sweep (coder-5). After
the trio shipped (`649e6be92f` + `db33d0db7c` + `e970c0e0a6`) and Daniel + supervisor
read all three SAMPLE-REPORTs side-by-side, the supervisor dispatched a fix wave
mixing methodology — coder-1's `c11-fix-relax-setlist-and-chart-gates` lane
(shipped `f614d7b901`) was triggered by M2's F-M2-005 finding **and** M1's C11M1-007
**both**; coder-2's track-position-in-URL lane (shipped `595153b192`) was triggered
by M3-009 **and** M1's S3 beats **and** M2's stickiness cells; coder-4's landing-SSR
lane (shipped `0aef7d53d0`) was triggered by M2's F-M2-006 + M3's M3-012.

**The cross-methodology pattern that emerged:** the same friction tended to surface
in 2 of the 3 methodologies under different shapes. A finding that bit the
musician's hands AND was deterministically reproducible AND violated a heuristic
under stress was always the strongest finding. The methodologies' independence
caught COVERAGE gaps — narrative caught flow frictions matrix missed; matrix
caught divergences narrative didn't enumerate; heuristic caught affordance issues
neither did. But the redundancy was expensive: 3× the cowork time, 3× the
auditor time, 3× the worktree teardown, and the supervisor's triage required
reading three different REPORT shapes against each other.

**Cycle-12's bet:** a single methodology lets each FINDING self-tag the shape
that best captures it. The musician moment IS the moment — sometimes its best
form is a timeline beat (narrative), sometimes a deterministic cell (matrix),
sometimes a stress-activated affordance card (heuristic). The shape is a property
of the FINDING, not a property of the METHODOLOGY. One cowork run can produce all
three shapes in the same REPORT, ordered by severity, with cross-references where
a moment is best captured by two shapes at once.

**Why now (and not in cycle-11):** cycle-11 needed methodology DIVERSITY. We
genuinely didn't know which shape would catch the most service-day frictions.
Now we know: each shape catches different classes, and the right move is to let
the friction pick the shape. Cycle-11 was the design phase; cycle-12 is the
convergence phase. After cycle-12, the supervisor's working-assumption is that
the hybrid shape becomes the standard cowork PROMPT shape.

**Why Saturday 5/30 specifically:** Daniel chose 2026-05-28T~21:25Z to verify
that the cycle-11 fix wave HOLDS UP across the real upcoming-Saturday setlist
(`cd2010f4` B'nei Mitzvah of Gavin Stein) under realistic conditions before
downbeat. Saturday is 38h out at dispatch; that gives ~4h for the PROMPT to
ship, ~75 min for cowork to fire, ~30 min for triage, and 18h+ for any fix
wave to land + auditor-accept + sweep before 10:00am local downbeat. The
verification axis isn't speculative — it's a deadline-driven re-test of
just-landed code.

---

## How cycle-12 grades the 4 anchor moments + 3 bug-classes

Cycle-11 charter §1 named four anchor moments (A1 setup-prep, A2 between-songs,
A3 mid-service change, A4 sanctuary edge) + three bug-classes (stickiness,
fresh-tablet, auth-divergence). Cycle-12 grades a SUBSET deliberately — Daniel's
narrow-worry pick:

| Anchor | Cycle-12 status | Why (cycle-11 outcome) |
|---|---|---|
| **A1 setup-prep** | IN SCOPE | Per cycle-11 M1 + M2 + M3, A1's stickiness regression on songCount was the strongest leading-indicator finding (M2 F-M2-006, M3 M3-013); `ae647fac20` shipped the denorm fix. Cycle-12 re-tests A1 fully across all 20 Saturday tracks to verify the fix holds. |
| **A2 between-songs** | IN SCOPE | M1's S3 Sarah's between-songs scramble, M2's track-position-in-URL stickiness matrix, M3's H7 between-songs scramble test all converged on `595153b192`. Cycle-12 re-tests A2 across 19 (N, N+1) transitions to verify no regressions. |
| **A3 mid-service key/song change** | OUT-OF-SCOPE | Daniel directive 2026-05-28T~21:30Z. M3-004 transposer-state-display covers part of A3; the remainder is reorder + leader-side-write which is the David-side workflow that's not the Saturday risk-class. A3 frictions surfaced during walkthrough park in §F of REPORT, not promoted. |
| **A4 sanctuary edge** | IN SCOPE (offline-only) | Cycle-11 M1's Aviva-Beat-11 + M3's S-offline cells surfaced offline-survival as the highest-leverage A4 sub-axis. Cycle-12 narrows to JUST the offline matrix (no `/monitor` cell, no glare/tilt cell — those were cycle-11 M3's domain). |

| Bug-class | Cycle-12 status | Why |
|---|---|---|
| **Stickiness** | IN SCOPE — primary | 7 of the 8 just-landed cycle-11 SHAs touched stickiness or stickiness-adjacent surfaces. Cycle-12 IS the stickiness regression sweep. |
| **Fresh-tablet** | OUT-OF-SCOPE | Cycle-11 M3 + Daniel's iPad-verify covered this; the band's iPads have warmed-up caches by Saturday. No new finding axis here. |
| **Auth-divergence** | IN SCOPE — secondary | Surfaces via the 3 personas (Aviva musician / David band_leader / Daniel admin); not the primary axis but ANY auth-divergence finding flagged here is P0 per err-public invariant `[[feedback_err_public_not_gated]]`. |

---

## The report shape — one worked-example finding, end-to-end

To make the hybrid shape concrete, here's one fictional finding walked end-to-end
through cycle-12's voice and structure. This is what a cowork instance's
finding card looks like once the methodology is internalized.

### F-C12-007 — Aviva's transpose vanishes when she jumps to track 12

- **Shape:** narrative (with secondary matrix-shape cross-reference to F-C12-008)
- **Persona:** Aviva (musician, `c12-saturday-musician-a1b2c3d4`)
- **Anchor moment:** A2 (between-songs scramble)
- **Worry axis:** stickiness (cycle-11 M3-004 / `fd9e5c8439` regression check)
- **Timeline beat:**

  > 10:23:14 — Aviva is on track 11 "Etz Chayim Hi" in F. The cantor finishes
  > the verse. David nods toward track 12 "Hashkiveinu" — keyed C in the
  > setlist. Aviva swipes left to advance. The chart paints in C at 10:23:17.
  > **But the toolbar's transpose pill still shows "+2" — the value from
  > track 11.** She glances down expecting "+0", sees "+2", does the math in
  > her head (C + 2 semitones = D), realizes the chart paint is C not D,
  > realizes the indicator is wrong. **Friction cost: 2.4 seconds + a
  > moment of "wait, am I reading this right" in front of a B'nei Mitzvah
  > family in the front row.**

- **Surface (mechanism footnote):** `PerformanceToolbar.tsx` post-`fd9e5c8439`
  shows the signed-offset buttonLabel; the per-track transpose-state is sticky
  ACROSS tracks in the same session, not reset. The C11 M3-004 fix made the
  indicator MORE visible, which raised the bar for "what does it mean" — and
  the current behavior (sticky across track jumps) is now confusing rather
  than invisible.
- **Severity (musician-felt):** HIGH (A2 — actively spent her 6-sec window on
  cognitive load that should have been zero).
- **Affordance fix (1-3 sentences):** Reset transpose to 0 on track jump (treat
  it as a per-track override, not a session-global). Alternative: persist
  transpose per track in URL (mirrors `595153b192` pattern); the URL becomes
  the source of truth and "no transpose param" means 0. The track-level
  persistence is the stronger fix because it also handles reload.
- **Cross-reference:** F-C12-008 grades this as a matrix cell `M.S.A1.D5`
  (transpose × cross-track jump persistence) — same friction, different shape.
  Either card alone tells the story; both together let the supervisor's
  triage see the moment AND the matrix dimension.

**Why this finding is narrative-primary, not matrix-primary:** the COST of the
friction is the 2.4 sec + cognitive load + family-watching context; that
doesn't reduce to a cell verdict. The matrix shape (F-C12-008) captures the
*reproducibility* but loses the lived-moment cost. The hybrid PROMPT lets us
keep both: narrative for the cost story, matrix for the reproducibility, with
explicit cross-link. A cycle-10 cowork would have lost either the moment OR
the rigor; a cycle-11 trio would have forced the cowork to pick one
methodology and lose half the finding. Cycle-12's hybrid keeps both.

---

## Honest weaknesses — what cycle-12 will likely MISS

The narrow worry-axis pick has costs. The cowork instance is forbidden from
chasing certain classes of frictions even if it sees them; those go to §F of
the REPORT, not promoted. Here's what the cycle-12 sweep is BLIND to by design:

1. **A3 mid-service key/song change frictions.** If the leader changes the
   order or transposes mid-set and a different friction surfaces — say,
   Aviva's view stops updating, or the band's iPads drift out of sync — the
   cowork instance is supposed to NOTE it in §F and move on. A real cycle-13
   would need to pick A3 back up if Saturday surfaces an A3 friction in the
   wild.

2. **Fresh-tablet cold-load class.** A guest musician David brings — say, a
   guest violinist with no IndexedDB, no service-worker, no warmed caches —
   gets ZERO grading here. Cycle-11 M3 graded fresh-tablet but only on the
   public landing + chart-overlay; the *post-onboarding* fresh-tablet
   experience (sign in, then walk the setlist) wasn't deeply probed and
   cycle-12 isn't probing it either. If Saturday has a guest musician
   problem, we'll feel it then.

3. **`/monitor` (wedge mixer) surface.** Cycle-12 doesn't probe the wedge
   panel at all. Per `[[project_bridge_state_freshness_diagnostic]]` the
   monitor state can silently freeze (the v10.0.0 boundary froze
   `monitor-live/state.updatedAt` while the heartbeat advanced). Cycle-12
   would not catch that — needs its own sweep.

4. **Long-tail edge cases on non-Saturday services.** The Friday-night Erev
   Shabbat (Daniel's separately-cloned Kabbalat Shabbat template), the
   Shavuot Yizkor (`UnjLqKTtS4lNKQfMY6hB`), the weekday rehearsal surprises —
   none of these are graded. The cowork instance might surface a finding
   that's about cd2010f4-shape-specific behavior (20 tracks, 4 dividers, 16
   songs) that wouldn't bite on a 9-track Friday-night setlist.

5. **The "M2 matrix" sub-class M2 itself caught.** Cycle-11 M2 had a full
   3-axis matrix (action × surface × identity × persistence) covering 7
   actions × 6 surfaces × 8 identities × 8 modes — ~3800 theoretical cells,
   ~70 core cells run. Cycle-12 has only the §2.2 regression-grade table
   (~8 SHAs × 3 personas = ~24 cells) + the §2.1 offline matrix (5 probes ×
   3 personas = ~15 cells). That's ~39 cells vs cycle-11's ~70. We're
   trading matrix BREADTH for cycle-11-SHA DEPTH. If the just-landed
   cycle-11 fix wave introduced a NEW non-stickiness divergence — say, a
   role-gate bug in the new bearer-accept paths shipped `f614d7b901` —
   cycle-12 might not catch it.

6. **Methodology validation itself.** The hybrid bet assumes "the friction
   picks the shape" works as a discipline for the cowork instance. If the
   cowork instance defaults too hard to one shape (probably narrative —
   it's the most natural-feeling), we'll get a M1-style report missing the
   matrix rigor. The PROMPT counters this with explicit §1 decision rule +
   §C target-finding-count guidance, but it's a discipline question we
   won't know the answer to until the first cowork run completes.

These are the known weaknesses. The PROMPT is shipped acknowledging them; the
supervisor's post-cycle-12 triage should explicitly cover (1)-(6) as planned
gaps, not as missed bugs.

---

## Methodological choice: why "≥18 of 20" tracks is the §9 success criterion

Daniel's narrow-axis pick (stickiness across the FULL 20 Saturday tracks)
intentionally inverts cycle-11's "shallow on many, deep on a few" tradeoff.
The success criterion has to match: "you probed 18+ of the 20" is the
verification-time floor. Sampling 5 of 20 is what cycle-11 M3 did, and that
was correct for design-time; cycle-12 is verification-time. If the §2.2
regression table is "passed on track 7, didn't check tracks 8-20," it's a
weak verdict for the Saturday-readiness gate.

The 18/20 threshold accounts for ~10% loss to inevitable harness flakes or
deferred-cells (`⊘ slow — defer`). 20/20 would be too rigid for a 75-min
budget; 15/20 too loose. 18/20 is the realistic mid.

---

## What "Saturday-readiness verdict" means in §A

The §A verdict is one of three tokens:

- **SHIP-AS-IS** — zero P0 findings, ≤2 P1 findings, all §D regression-graded
  cells PASS, all §E offline cells PASS. Saturday goes ahead with the
  current master tip (`0709bccfa6` or later).
- **SHIP-WITH-FIXES <list of P0 IDs>** — 1-3 P0 findings, each with a clear
  affordance fix; the fix-wave dispatches before downbeat, lands + auditor-
  ACCEPTs, sweeps into master. Saturday goes ahead on a new tip.
- **HOLD-AND-FIX** — ≥4 P0 findings or any "the chart is unreachable"-class
  finding (the band literally can't render a song mid-set). Daniel decides
  whether to push Saturday back, switch to paper, or accept the risk with
  the band briefed.

The verdict is the cowork instance's call, but the supervisor's triage owns
the dispatch (per cycle-11 charter §5 run policy). The cowork doesn't pick
ship-class on individual findings — that's the supervisor's call post-report.

---

— from coder-1 (lane `cycle-12-saturday-readiness-prompt-design`)
