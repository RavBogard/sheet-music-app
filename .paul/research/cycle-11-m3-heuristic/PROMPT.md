# Cycle-11 M3 — Heuristic + sanctuary-conditions affordance sweep (cowork PROMPT)

> **Lane M3 (charter §7).** Methodology = **classical UX heuristics graded UNDER STRESS — simulated real sanctuary conditions.** Every Perform affordance is read through the question: *"would this work for a stressed musician on a tilted, glare-bright iPad with five seconds to react, the rabbi watching, the leader counting off?"* Findings are heuristic violations contextualized in the stress condition that makes them BITE + a concrete affordance fix.
>
> **Authored by:** coder-5 (lane `cycle-11-m3-heuristic-design`, branch `feat/cycle-11-m3-heuristic-design`). I authored the cycle-10 PARENT (`1fe7bfb58a` blob) — the dispatch asks me to use insider knowledge of that model to **intentionally break from it**. §0 below is the explicit 5-thing break-list I hold myself to throughout.
>
> **Read order at boot:** (1) `.coord/cycle-11-CHARTER.md` end-to-end (the shared frame for M1/M2/M3). (2) `.paul/research/cycle-10-cowork-PARENT.md` once (the anti-example — see §0). (3) THIS file. (4) `cycle-4/harness/README.md` (only enough to know what the harness can/can't do for you — §4 specifies your light coupling).
>
> **Anchor SHA:** `8390b31aac` (origin/master tip at lane-cut time per `.coord/shared/master-tip.md`). Repo is genuinely un-shallowed (`is-shallow-repository:false`, verified at boot per `[[feedback_supervisor_verify_commit_diff_not_subject]]`). Every file/route/hook/prop reference below verified via direct worktree read at this SHA per `[[feedback_cowork_prompt_verify_before_write]]`. Re-confirm via `git log -1 origin/master` at run-time and note any delta.

---

## §0 — Five things cycle-10 PARENT did that M3 will NOT do

(Dispatch demand: "open your PROMPT.md by listing 5 specific things cycle-10 PARENT did that this lane WILL NOT DO. Hold yourself to that list throughout." This is the break-list. Every later section is checked against it.)

1. **Cycle-10 anchored on the `npm run stress` Playwright harness + a thin judgment layer over the public surface.** M3 anchors on a **heuristic frame applied under a stress-condition matrix**, by-hand. The harness is a tap-target measurement aide only (§4) — not the scope generator, not the verdict source, not the report shape driver.
2. **Cycle-10 scoped by harness category letters (A/B/C/D/E/H/J/K/L/S + Cat-G + Cat-N).** M3 scopes by **(heuristic × stress-condition × anchor-moment)** cells. The DOM is not a coordinate; the *moment-of-stress* is.
3. **Cycle-10's report shape was a usability scorecard table (PASS / FRICTION / BROKEN per AREA) followed by a JSONL findings list with severity tags + ship-class.** That shape rolls up to a bug list and loses the lived moment (charter AP-1/AP-3/AP-4). M3's report shape is a **heuristic-violation card per finding** with explicit fields: which heuristic, which stress-condition activated it, which anchor moment it bites in, what the musician *experiences in their own words*, what the affordance fix is. No JSONL primary; bug-severity is a property, not the headline.
4. **Cycle-10 chose the public `/perform` landing as the "cleanest target" because META-003 made auth painful.** M3 does not let auth tractability shape scope. Heuristics are graded *across* identity states (signed-in band member · unauthenticated guest · fresh-incognito · fresh-tablet-no-cache) because the charter's 3 NEW bug-classes (§3) require it — stickiness, fresh-tablet divergence, and auth-state divergence all live at the seams between states.
5. **Cycle-10 ran observe/report-only with a pre-service ship-freeze on any destabilizing fix.** M3's RUN policy (charter §5) has **no ship-freeze** — reports go straight back for immediate triage and fix. M3's PROMPT must NOT bake in a HOLD-POST-SERVICE / SAFE-NOW ship-class field; that's stale. Findings ship-class is whatever the triaging supervisor decides post-report; the cowork doesn't pre-classify.

(These five are the anti-patterns AP-1, AP-2, AP-3, AP-7, and AP-6 from the charter §3, made concrete against cycle-10 specifically. The remaining anti-patterns AP-4 "findings-as-only-output" and AP-5 "audit stance" are addressed in §6 and §3 respectively.)

---

## §1 — Mission

You are cowork-Claude (cycle-11, M3). You are not auditing the app. You are a **designer + observer + stress-condition simulator** standing behind a band member at a Saturday morning B'nei Mitzvah, watching them work, asking at every interaction:

> *"Given the conditions this iPad is being used under right now — the glare, the angle, the partial attention, the 6-second between-songs window — does this affordance let them succeed, or does it leak friction?"*

Each leak is a finding: a heuristic violation made real by a stress condition, anchored to a specific moment in the service. Each finding ends with an **affordance fix** a designer could implement Tuesday.

Single-thread cowork session, **~75 min real wall-clock** per `[[feedback_cowork_real_harness]]` (NOT a walk-away; CFC + chrome.debugger DOES NOT WORK on this surface; the iPad viewport requires the Playwright `ipad-webkit`/`ipad-webkit-landscape` projects defined at `playwright.config.ts:37,44`).

---

## §2 — The heuristic frame (M3's lens)

Eight heuristics — Nielsen's ten compressed to the eight that actually grade *Perform* (a recognition-and-recovery surface, not a transactional one). Each is a question you ask of each affordance.

| # | Heuristic | The question for *this* app |
|---|-----------|------------------------------|
| **H1** | **Visibility of system state** | Can the musician tell, from the screen alone, whether the wake-lock is on, the transpose is +2 / detected D / capo 3, the monitor send is the right bus, the chart is the right key, the offline cache is primed? Or do they have to *remember* what they last did? |
| **H2** | **Match between system and the musician's mental model** | Does "the chart", "the setlist", "the key", "the lead" mean the same thing on screen as in the band's rehearsal vocabulary? Are non-song chart bonds (prayer / reading) rendered as themselves or shoehorned? Does the term *Vocal Lead* (`[[feedback_terminology]]` — not Leader; rabbi *Led by* is distinct) show up correctly? |
| **H3** | **User control + freedom (recovery)** | Can the musician undo a wrong transpose mid-song? Recover from a mis-tapped chart? Roll back an annotation made with a sweaty thumb? Get out of a stuck state without exiting the service and walking back in? |
| **H4** | **Consistency + standards** | Does iPad-portrait Perform feel like iPad-landscape Perform feel like Desktop Perform? Do the toolbar primitives stay in the same spatial position across cold-load vs hot-load vs offline-recovery? Does an authed view show the same primitives as a guest view? |
| **H5** | **Error prevention** | Where are the irreversible taps that could cost a song? Where are *gating* "are you sure" dialogs that earn their place (avoid wrong-key publish) vs ones that don't (every annotation undo)? Are accidental-tap targets isolated from primary-tap targets? |
| **H6** | **Recognition over recall** | Does the musician have to RECALL where wake-lock lives, or RECOGNIZE its icon from a glance two thumbwidths into chart real-estate? Same for transpose, capo, key-of-track, AI-chord-overlay, metronome, page-turn direction. |
| **H7** | **Aesthetic + minimalist (the between-songs scramble test)** | In the 5-10 sec scramble (anchor A2), every element that's on screen earns its place or it's noise. What is on screen during A2 that isn't earning? What's NOT on screen that the musician was reaching for? |
| **H8** | **Help, recognize, recover from errors** | When the chart fails to load, the wifi drops mid-song, the bind is wrong, the monitor mixer is frozen, the setlist syncs late: does the app *tell* the musician what's wrong and what to do, or does it silent-fail and leave them flipping through prayers manually? |

**Three heuristics are explicitly NOT in this frame** and you should *not* generate findings primarily about them in M3 (M2's matrix or M1's narrative will catch them — disjointness rule, charter §8):

- *Help and documentation* — the app has none and shouldn't (charter §3 AP-7 disqualifies one-state probes; H8 covers the recovery half of help in-context).
- *Flexibility + efficiency of use* (Nielsen #7 — power-user shortcuts) — irrelevant to a band member in a 6-sec scramble.
- *Internationalization* — out of scope (the Hebrew transliteration concern is on the authoring side, M2's lane).

---

## §3 — Stress conditions (the multiplier)

A heuristic violation under no stress is a polish bug. A heuristic violation that BITES under one of these conditions is the M3 finding. Each finding cites the stress condition that activated it.

| # | Stress condition | How to simulate (in 75 min) | What kind of friction it surfaces |
|---|------------------|------------------------------|------------------------------------|
| **S1** | **Glare / low contrast** | Chrome DevTools → Rendering panel → Emulate vision deficiencies: `Blurred vision` + `Achromatopsia`; AND set `prefers-contrast: less` via DevTools Rendering → CSS media features; AND a manual squint test on each screenshot (capture at full brightness, then screenshot-then-squint until you can read only ≥4.5:1 contrast). | State-indicator icons that rely on color/value contrast (transpose +2 vs +0, wake-lock on vs off, monitor send levels, offline-status dot) failing H1 (visibility of state) when contrast drops. |
| **S2** | **5-second time pressure (A2 scramble)** | For each between-songs tap-path you find, set a stopwatch and grade: did you land the right tap in **≤2 sec** from chart-open, **≤6 sec** from leader-cue (next-track named to chart-rendered-and-bound)? | Multi-step tap-paths (open-setlist → tap-track → wait-spinner → wrong-key → tap-transpose-menu → tap-+2) that fail H7 (between-songs scramble test) or H6 (recognition over recall). |
| **S3** | **Tilted-stand angle (70°)** | The iPad is on a stand at 70° tilt. The bottom-third of the screen is the **visible-action zone** (eye contact + thumb reach); the top-third is the **look-up-and-lose-the-beat zone**. Use DevTools to draw three horizontal bands and grade each affordance by which zone it lives in. | H1 violations: critical state indicators (wake-lock, transpose, offline) living in the lose-the-beat zone. H6 violations: a primary action requiring an upward glance. |
| **S4** | **Sweaty / imprecise fingers** | For every tap target, measure via `getBoundingClientRect` (the harness can help — see §4). **Apple HIG 44×44 px is the FLOOR, not the goal.** Then check neighbor-spacing: is there a ≥8px gap to the next interactive element? Lighthouse "tap targets" rule is a check, not a substitute. | H5 (error prevention): adjacent affordances close enough to mis-tap; tiny icons on a stand-held iPad with humid sanctuary hands; targets at the screen edge where finger-bezel-collision happens. |
| **S5** | **Partial attention (60/40 eye-split)** | The musician's eyes are 60% on the conductor / rabbi / leader and 40% on the iPad. Visual state changes must be **peripherally visible** (motion, color shift, scale change in the periphery). For each state change you trigger (transpose, wake-lock, monitor-change, setlist-reorder, chart-load-complete), close your eyes briefly and ask: "would I have *known* the screen changed without looking foveally?" | H1 violations: silent state changes (the transpose dropdown closes but the +2 indicator in the toolbar is the same size + color as before; the chart binds but no peripheral confirmation). |
| **S6** | **Battery-dim / auto-dim** | Set browser brightness to ~30% (OS-level) OR use DevTools Rendering → CSS media features → `prefers-contrast: more` to simulate the high-contrast OS setting the iPad falls back to at low battery. Grade legibility at 30%. | H1 / accessibility: text that meets 4.5:1 contrast at full brightness but falls below the readability threshold at 30%. Chord-symbol overlay glyph weight insufficient. |
| **S7** | **Cross-musician peripheral check** | The musician can briefly see a bandmate's iPad. Does it show the same chart, same key, same page-position? If a leader changes the key or order, does *every* iPad reflect it within a band-feasible window (~3 sec)? Probe via two browser-windows side-by-side at iPad viewport: change in one, watch the other. | H4 (consistency) under multi-instance reality. Stickiness regressions (charter §2.1) when one tablet's change doesn't propagate. Auth-state divergence (charter §2.3) when bandmate and guest see different things. |

Every M3 finding cites **one heuristic (H1–H8) + one stress condition (S1–S7) + one anchor moment (A1–A4 from charter §1)**. That tuple IS the finding's identity. The bug-severity (BLOCKER/HIGH/MED/LOW) is a downstream property.

---

## §4 — Surfaces in scope + harness coupling (light)

**Scope (deep on Perform, not app-wide — charter AP-2).** All references verified at `8390b31aac`:

| Surface | Files | Notes |
|---------|-------|-------|
| Public `/perform` landing | `src/app/perform/page.tsx` (server component, no `cookies()` — edge-cached); `src/components/performance/PublicSetlistListing.tsx` (uses `useAuth()` line 35, `QRSignIn` import line 11, `MAX_PUBLIC_SERVICES=5` line 17, `!authLoading` CLS guard line 139, `upcoming.slice(0, 5)` cap line 67); `src/components/performance/public-setlist-order.ts` (`splitPublicSetlists` upcoming-soonest + past-fill ordering). | The recently-landed `perform-public-auth-and-cap` from coder-1 — verify SHA at run-time. |
| Perform mode page | `src/app/perform/setlist/[id]/page.tsx`; `src/app/perform/setlist/[id]/SetlistPerformClient.tsx` | The authed deep view. |
| Toolbar (full) | `src/components/performance/PerformanceToolbar.tsx` (`TransposerMenu` line 9, `KeepAwakeToggle` lines 300/369, `MetronomeControl` line 293, with compact/full variants) | Compact = chart-overlay; full = top-bar. |
| Chart overlay + annotations | `src/components/performance/PDFOverlay.tsx` | Annotation gesture target. |
| Score viewer | `src/components/music/SmartScoreViewer.tsx`; `src/components/performance/resolveViewerKind.ts` | Routes pdf/musicxml/audio/image/chordpro; MusicXML is the strategic format per `[[project_musicxml_goal]]`. |
| Wake-lock | `src/components/performance/KeepAwakeToggle.tsx`; `src/hooks/use-wake-lock.ts` | Discoverability + reachability per `[[project_chart_loss_reports_are_display_bugs]]`-adjacent class. |
| Sign-in (logged-out card) | `src/components/auth/QRSignIn.tsx`; `LoginClient.tsx` (Google sign-in) | First-touch onboarding per anchor A1. |
| Monitor (wedge mixer) UI shape | `src/app/(main)/monitor/page.tsx`; `src/components/monitor/{FaderStrip,BusAssignmentPanel,MatrixPanel,QuickMonitorPanel,VerticalFaderStrip,ConnectionIndicator,MonitorTabs,DefaultChannelPicker}.tsx` | **Visual + affordance shape only — never push a fader** (the desk is OFF unless Daniel says otherwise; monitors are **wedges**, not IEM per `[[feedback_terminology]]`). |

**Out of scope (do not probe — hard rules from `[[CODER.md]]` + charter):**
- Repo-root `mcp/`, `bridge/`, `SetlistGrid.tsx`, `src/lib/mcp/errors.ts`, `src/lib/mcp/error-envelopes.ts`.
- Authoring surfaces (`UploadDialog`, `ScraperModal`) — band consumes; Daniel authors via MCP per `[[user_mcp_is_primary_author_workflow]]`.
- F-002 lyric-search (feature dropped at `3155fb2881`).
- Live X32 writes from `/monitor`.

**Harness coupling — light.** M3 does NOT ride `npm run stress` as the verdict source (§0 break #1). M3 uses the harness for **two narrow purposes only**:
1. **Tap-target measurement.** Open the Playwright `ipad-webkit` project at `playwright.config.ts:37`, navigate to the target route, evaluate `getBoundingClientRect()` on the affordances in scope. This is a one-off measurement helper for S4 stress condition findings; you do NOT run the full e2e suite.
2. **Viewport fidelity.** Run your judgment pass *inside* the Playwright `ipad-webkit` project (820×1180 portrait) and `ipad-webkit-landscape` (1180×820) — they are what the band's actual iPad WebKit looks like. Open the deployed URL `https://www.centralreform.live` in those contexts and observe; do NOT execute existing specs.

**Anything that requires running a spec — skip and note in REPORT.** The verdict for M3 is your eyes + the stress-condition simulation + the heuristic frame, not a spec passing or failing.

---

## §5 — Auth, sandbox, isolation

**META-003 awareness per `[[feedback_cowork_real_harness]]`:** `/api/auth/test-session` mints a session cookie but does NOT hydrate Web SDK auth state. That doesn't gate M3 because we probe across identity states deliberately (§3 S7 + the charter's 3 bug-classes). Each finding states which identity state it was observed under.

**Identity states (charter §3 AP-7 — single-state probe is disqualifying):**
1. **Logged-out guest** (no auth, fresh browser) — the public `/perform` landing surface.
2. **Signed-in band-member** — via real Google sign-in if you have a test Google account, OR via the admin-test-session escape hatch (`src/app/api/auth/admin-test-session/route.ts`, gated by `MCP_ADMIN_TEST_SESSION_SECRET` per `src/env.mjs:72/118`) IF Daniel has set the secret in prod. If unset → degrade to "guest-only" and note the gap in REPORT (do not block).
3. **Fresh-incognito** — same browser, a new private window. Cookies + service-worker + Firestore cache all cold. Use this state for the *fresh-tablet cache divergence* probe (charter §2.2).
4. **(If multi-window available) cross-musician** — two browser windows side-by-side at iPad viewport, one signed-in, one guest. The S7 stress condition rides on this.

**uidPrefix (per `[[feedback_sandbox_test_isolation]]`):** `c11m3` (lowercase, ≤6 chars). For any `create_test_account({role, uidPrefix:"c11m3"})` mint a matching `cleanup_all_test_data({prefix:"c11m3"})` at end-of-run. ★ Create-side is `uidPrefix`; cleanup-side is `prefix` — same value, different name (verified `src/lib/mcp/tools/test-tokens.ts`). NEVER `cleanup_all_test_data` without `prefix` (sweeps sibling sessions per `[[feedback_self_inclusion_test_fixtures]]`).

**Never** copy a raw bearer / secret into any file under `sheet-music-app/` (tracks to git). Redact as `***redacted***` in REPORT.

**Boot pre-flight (HARD-BLOCK on failure → BLOCKER to supervisor, stop):**
- `GET https://www.centralreform.live/perform` → 200 + paints `PublicSetlistListing` skeleton then card list.
- `git rev-parse --is-shallow-repository` → `false` (per `[[feedback_supervisor_verify_commit_diff_not_subject]]` — boundary lies kill verify-before-write).
- Playwright `ipad-webkit` project loads (`npx playwright test --list --project=ipad-webkit | head` — just confirms the project resolves; do NOT execute).
- (Optional) `MCP_ADMIN_TEST_SESSION_SECRET` reachability for the authed-state probe.

---

## §6 — The methodology, step by step

Total budget ~75 min. Pace yourself.

### Part 1 — Per-element heuristic-under-stress checklist (~45 min)

For each affordance listed in §4, walk a **cell-by-cell grid**: heuristic × stress-condition × anchor-moment. You do not need to cover all 8×7×4 = 224 cells; you cover the cells that **plausibly bite** for that affordance.

For each cell:
1. Observe the affordance under the stress condition (use the S1–S7 simulation method).
2. Ask the heuristic question (§2 H1–H8).
3. If the affordance leaks: write a finding card (§7 schema).
4. If the affordance succeeds: move on; do not log a passing cell as a "probe" — that's the cycle-10 anti-pattern (AP-3).

**The element list to walk (deep, not shallow — AP-2):**

| Order | Element | Critical cells to check |
|-------|---------|-------------------------|
| 1 | Public `/perform` landing | (H1, S2, A1) does the upcoming service jump out? (H4, S7, A1) does logged-out vs signed-in feel like the same product? (H1, S5, A1) does the auth-resolve happen *peripherally* without a card flash-yank? |
| 2 | Setlist card tap → Perform mode load | (H8, S2, A2) what does the user see between tap and chart-rendered? (H7, S2, A2) is "Rendering…" earning its place or is it noise? (H3, S3, A3) if they tap the wrong setlist row, can they get back without a full nav reset? |
| 3 | `PerformanceToolbar` compact (chart-overlay variant) | (H1, S5, A2) state visibility of transpose value while playing; (H6, S3, A2) recognition of icons in the lose-the-beat zone; (H5, S4, A3) tap-target spacing; (H7, S2, A2) what's earning its place mid-song? |
| 4 | `TransposerMenu` open + select +2 + close | (H1, S5, A3) does the resulting state change broadcast peripherally? (H3, S4, A3) recovery from a wrong transpose; (H8, S6, A3) any error path? |
| 5 | `KeepAwakeToggle` (both placements — header + in-chart from `PerformanceToolbar:300,369`) | (H6, S3, A1+A2) is it discoverable from the chart overlay? (H1, S5, A2) is the on/off state legible peripherally? (this is the Daniel 2026-05-23 Yizkor regression class per cycle-10 C10I1-003.) |
| 6 | `MetronomeControl` | (H1, S5, A3) state visibility (is it ON?); (H5, S4, A3) accidental on/off mis-tap risk. |
| 7 | `PDFOverlay` annotation gesture | (H3, S4, A3) undo a wrong-finger annotation; (H4, S4, A3) does the gesture work the same in portrait vs landscape? |
| 8 | `SmartScoreViewer` MusicXML render + transpose | (H1, S6, A3) chord-glyph legibility at 30% brightness; (H4, S7, A3) does +2 reflow look the same on bandmate's iPad? (H8, S2, A3) what if the MusicXML fails — silent PDF fallback or honest "render failed"? (Per `[[project_musicxml_goal]]`, never propose PDF-only — fix MusicXML instead.) |
| 9 | Offline → recover → wifi-back transition | (H8, S2, A4) what does the user see during the drop? (H1, S5, A4) does the offline-cache state advertise itself peripherally? (H3, S4, A4) recovery — can they keep playing? (Per cycle-10 H category specs.) |
| 10 | `QRSignIn` card (logged-out landing) | (H6, S3, A1) discoverable from across the room? (H2, S2, A1) does "Scan with your phone" match a fresh-iPad band-member's mental model? (H1, S5, A1) does it disappear cleanly when the user signs in or does it flash-yank? |
| 11 | `/monitor` panel UI shape (READ-ONLY — no fader pushes) | (H1, S5, A4) bus-5 master-mute state legible during partial attention? (H4, S7, A4) does my bandmate's monitor view feel like the same product? (H7, S3, A4) what's on screen during A4 not earning? |

For each, the cell list is *suggestions*. If you find a cell I didn't list that bites, log it. If a cell I listed doesn't bite, skip it.

### Part 2 — Anchor-moment walk-throughs (~15 min)

After the per-element pass, walk each of the 4 anchor moments end-to-end **as a single linear narrative**, looking specifically for friction that only appears in the *transition* between elements, not in any single element.

- **A1 setup-prep.** Cold-load `/perform`, see the upcoming row, tap into Saturday, wait for hydrate, look at chart 1. Under S1+S2+S5: does the whole sequence feel un-friction-ed?
- **A2 between-songs scramble.** Already inside Perform on chart N. Leader says "next: Modah Ani". You have 6 sec. Tap path → measure stopwatch + heuristic violations.
- **A3 mid-service change.** Leader transposes "down to D". You have 4 sec. Tap path → measure.
- **A4 sanctuary edge.** Wifi drops mid-song. You have an open chart. Then the drop ends; what does the screen show?

Each walk-through produces 0–3 *transition findings* — distinct from per-element findings because they live in the seam.

### Part 3 — The three NEW bug-classes (charter §2 — must address all three)

Hand-probe each of these:

- **Stickiness (§2.1):** pick 3 user-changeable values (transpose +2, wake-lock on, annotation, page-position, monitor fader-position, leader-set field if you have authed access). Make each change. Reload. Did it persist? Try **soft-reload + hard-reload + close-tab-reopen**. Probe the *partial-persistence* case (field A stuck, field B didn't).
- **Fresh-tablet (§2.2):** open a fresh-incognito window. Walk through A1+A2 cold. What dies? (Service-worker cold, Firestore cache cold, auth cold, Next.js page caches cold.)
- **Auth-state divergence (§2.3):** open two windows side-by-side at iPad viewport. One signed-in, one logged-out guest. Visit `/perform` and `/perform/setlist/<a-public-one>` in both. Where do they diverge? Is the divergence intentional (the public-listing log-out card) or accidental (a surface that's intended public but my session is masking an accidental auth requirement)?

Each of these produces findings tagged with the bug-class.

### Part 4 — Cleanup + report (~15 min)

If you minted test fixtures, clean up (§5). Then write the deliverables per §7.

---

## §7 — Report shape (M3-native — NOT the cycle-10 scorecard)

(Anti-pattern AP-3 break: no JSONL primary; the unit is the heuristic-violation card, not a row in a table.)

Write to **`.paul/research/cycle-11-m3-heuristic-instance-1-REPORT.md`** (one file; sections below). Optionally also dump a flat `findings.jsonl` mirror at the end if a downstream consumer wants grep — but the markdown REPORT is the source of truth.

```markdown
# Cycle-11 M3 — Heuristic + sanctuary-conditions cowork REPORT

**Run date:** 2026-MM-DDTHH:MMZ
**Cowork instance:** M3-instance-1
**Wall-clock:** ~75 min
**Identity states probed:** logged-out / signed-in-band-member / fresh-incognito / cross-musician [check those that apply]
**Master SHA at run:** <git log -1 origin/master>
**Cleanup state:** read-only / clean / partial — list orphans

---

## §A — Designer's verdict (≤200 words)

A short first-person-designer prose verdict. NOT a scorecard. NOT a count. The voice
is: "I followed a musician through Saturday 5/30 under [stress conditions]; here's what
I learned about how this app feels in their hands." This section is what a designer
peer reads first to know whether to dig in or skim. Lead with the WHAT-WE-LEARNED
distillation (charter AP-4 — design principle, not bug count); the findings inventory
comes after.

---

## §B — WHAT-WE-LEARNED (≥4 design principles)

Each principle is a one-line distillation + a 2-3-sentence explanation. These are
designer-actionable insights, not bug reports. Example shapes (do not reuse verbatim):

- "**Peripheral state-change confirmation is structurally absent in Perform.**
  Every state change (transpose, wake-lock, monitor send) confirms itself only in
  the foveal-attention zone. Partial-attention is the dominant operating mode in
  A2/A3, so the app is silent at the moment the musician needs it loudest."

- "**The 44px floor isn't the iPad bar — it's the floor.** Under S4 sweaty-finger
  conditions on a tilted stand, neighbor-spacing matters as much as size. Three
  affordances in the compact toolbar pass HIG individually but fail neighbor-test
  collectively."

≥4 principles required (≥1 per anchor moment is a useful guide).

---

## §C — Findings (heuristic-violation cards)

For each finding, this card schema:

### M3-NNN — <one-line designer description in user terms>

- **Heuristic:** H<N> <name>
- **Stress condition:** S<N> <name>
- **Anchor moment:** A<N> <name>
- **Bug-class tag (charter §2):** stickiness | fresh-tablet | auth-divergence | (none — pure-heuristic)
- **Identity state observed under:** logged-out / signed-in / fresh-incognito / cross-musician
- **Surface:** <route + component path + line numbers if precise>
- **The musician's experience (1-2 sentences, first-person POV):**
  > "I tap Modah Ani. The transpose menu is still on +2 from the last song.
  > I don't notice because the +2 indicator is the same gray as the surrounding
  > toolbar. I play it in E and realize three bars in."
- **The heuristic violation:** <one line — what H<N> says this should look like and what it does>
- **The stress condition that activates it:** <one line — under S<N>, here's why it bites>
- **Affordance fix (designer-actionable, 1-3 sentences):** <what a designer would do Tuesday>
- **(Optional) measurement evidence:** screenshot path / getBoundingClientRect / contrast value / stopwatch / etc.

A finding without a heuristic + stress condition + anchor moment is rejected. If you
can't tie a finding to that tuple, you're outside the M3 frame — flag the observation
for the supervisor as "outside-M3-frame, may be M1/M2 territory" and move on.

Target finding count: **8–15**. More is suspicious of cycle-10-style scattershot; fewer
may mean the methodology didn't bite. Quality > quantity.

---

## §D — The 3 NEW bug-classes (charter §2) — explicit roll-up

For each of stickiness, fresh-tablet, auth-divergence, a one-sentence summary
("found N findings under this class; here are the most teaching") + the finding IDs.
If a class is empty, say so explicitly — that's also data ("0 stickiness findings;
the surfaces I probed all persisted cleanly across reload"). Per charter §2: a
methodology that can't address all three is wrong for cycle-11. Even a 0-finding
result must be reported.

---

## §E — Manual cleanup needed (only if a fixture wasn't deleted)

---

## §F — What this methodology likely MISSED (honest)

A 2-3 line note: what M2 (matrix) and M1 (narrative) will probably catch that I
didn't. Example: "M2 will catch the long-tail of data-correctness divergence;
M1 will catch the lived end-to-end timeline that doesn't reduce to per-element
heuristics. That's fine — by design."
```

---

## §8 — Operational rules (the don't-fuck-this-up list)

1. **Observe + report only.** No source modification, no worktree, no branch, no commit.
2. **No live X32 writes.** `/monitor` is visual-shape only.
3. **No publish-to-real-recipients.** Any `publish_setlist` you trigger uses `c11m3-`-prefixed fixtures; cleanup before report.
4. **No bearer in git.** Redact `***redacted***`.
5. **Verify-before-cite at run-time.** If the cowork instance fires days after this PROMPT was written, `git log -1 origin/master` to confirm the SHA, re-verify any cited path/component. Note any delta inline in the REPORT §A verdict.
6. **No ship-class field in findings.** That's a triage decision, not yours (§0 break #5).
7. **No spec runs.** §4 light-coupling rule.
8. **Out of M3 frame? Flag, don't shoehorn.** If you see something interesting that doesn't tie to a heuristic + stress + moment, note it in REPORT §F as "outside-M3-frame" — let M1/M2 catch it. Disjointness is the point.

---

## §9 — Sign-off

The cowork instance signs the supervisor inbox ACK + HANDOFF-COMPLETE message `from cycle-11-m3-instance-1`, citing finding count + the dominant heuristic violated + the dominant stress condition + the dominant anchor moment. The auditor reads the REPORT against:
- (a) verify-every-ref pass — no broken paths/refs/tool-names vs master
- (b) all 4 moments + 3 bug-classes addressed
- (c) at least 3 of the 7 anti-patterns explicitly broken (§0 alone covers AP-1, AP-2, AP-3, AP-6, AP-7; you must ALSO demonstrably break AP-4 via §B WHAT-WE-LEARNED + AP-5 via §A first-person designer-voice verdict)
- (d) the SAMPLE-REPORT counterpart in `.paul/research/cycle-11-m3-heuristic/SAMPLE-REPORT.md` is rich enough Daniel can choose between methodologies on its strength

Go.

*— coder-5, cycle-11 M3 lane*
