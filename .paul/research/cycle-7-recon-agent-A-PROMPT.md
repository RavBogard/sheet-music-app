# Cycle-7 Recon — Agent A: Real-User-Flow Reconnaissance

You are one of three parallel research agents scaffolding the next cowork
stress test for **centralreform.live**. Daniel's concern: the test has
become predictable; protocol decisions may have over-fit. Your job is
NOT to critique the test (Agent C does that) and NOT to audit cowork
capability (Agent B does that). Your job is to map **what real users
actually do on the site** and surface where synthetic tests are most
likely to miss real failure modes.

You are working in `C:\Users\dsbog\CentralReform.live\sheet-music-app\`
on the master branch (production source). Read-only mission.

---

## §0 — Identity

- Sign your deliverable `from recon-agent-A`.
- One-shot research: read, think, write the deliverable, stop.
- Do NOT modify code, run dev server, or push anything.
- Do NOT consult Agent B's or Agent C's outputs (they run in parallel).

---

## §1 — Mission (one sentence)

Map the 5–8 highest-load-bearing real-user journeys on centralreform.live
and identify which of them prior cowork cycles have under-probed or
mis-probed, so the next cowork test targets *user reality*, not test-spec
artifacts.

---

## §2 — User population (already known — do NOT re-derive from scratch)

Four real user shapes. Don't invent personas; these are the actual humans:

1. **Daniel Bogard (rabbi, admin, primary author).** Authors setlists
   via Claude Desktop → MCP at `/api/mcp`, NOT the in-app library UI.
   See `[[user_mcp_is_primary_author_workflow]]`. Browser app is rarely
   touched by Daniel — when he does, it's spot-checks, gig-packet
   prints, or troubleshooting.
2. **Randy (musical director).** Friday-evening + Shabbat-morning
   services. Touch points unknown to you — surface them by reading
   `[[project_shul_cadence]]` + setlist artifacts in repo. Possibly a
   second authoring voice; possibly a consumer-only.
3. **David Lazaroff (band_leader, joined 2026-05-15).** Weekly-flow
   user via Claude Desktop. Cycle-6 Instance C was synthetic-David
   harness. See `[[project_david_band_leader]]`. The "what does Randy
   Shabbat morning look like" template-conversation directive came
   from David's flow. See `[[feedback_mcp_template_management]]`.
4. **Band members (musicians).** Read-only Perform mode on iPads
   during services. Chart-bind picker, transpose, scroll, metronome,
   annotations. See `PerformanceToolbar` / `PerformanceBottomBar`.
5. **Public visitors.** Unauth landing pages (`/`, `/perform`,
   `/accessibility`, legal pages). Cycle-5 and cycle-6 Lane 5
   touched unauth surfaces — note that scope.

---

## §3 — Read order (load-bearing)

Read these in this order. Do NOT read every file in the repo; respect
the lean-context rule.

1. `C:\Users\dsbog\.claude\projects\C--Users-dsbog-CentralReform-live\memory\MEMORY.md`
   — full index. Pay special attention to entries under "Core Workflow",
   "Project Facts", "Project Context".
2. `C:\Users\dsbog\CentralReform.live\sheet-music-app\.paul\PROJECT.md`
   if present, else `.paul/CURRENT.md` / `.paul/STATE.md` — current
   project state.
3. `C:\Users\dsbog\CentralReform.live\sheet-music-app\src\app\` route
   tree — use `Glob` on `src/app/**/page.tsx` + `route.ts`. Don't read
   each file; build a mental map of the route surface and identify the
   ~10 routes that real users hit (Perform, Library, Login, Monitor,
   Gig-packet, API endpoints that bind to UI flows).
4. `C:\Users\dsbog\CentralReform.live\sheet-music-app\.paul\research\cycle-6-cowork-PARENT.md`
   — the most recent cycle's 4-mission-profile design. Read §"4 mission
   profiles" + §"green rubric". This is the *prior assumption* about
   user flows; your job is to interrogate it.
5. `C:\Users\dsbog\CentralReform.live\sheet-music-app\.paul\research\cycle-6-fixes-TRIAGE.md`
   — see which findings from cycle-6 mapped to which user flow. Note
   which flows produced ZERO findings (under-probed) vs which produced
   MANY (over-probed or genuinely fragile).

---

## §4 — Research questions

Answer each in your deliverable, with evidence (file paths + line
references where applicable):

**Q1. The Friday-night critical path.** Walk it in your head from
Daniel's Tuesday-MCP-authoring through to a band-member opening a
chart in Perform mode at the service. List every system boundary the
data crosses (MCP → Firestore → publish → push/email/SMS → iPad GET →
library_index lookup → chart fetch → PDF render). Where is the
weakest link that a synthetic cowork test would NOT trip?

**Q2. The David weekly-flow (synthetic-shadow).** Cycle-6 Instance C
simulated David. What did the simulation get RIGHT and what did it
likely get WRONG vs an actual David session? (You don't have David's
real transcripts — make defensible guesses backed by the David memory
+ MCP-template gap.)

**Q3. Routes / surfaces that prior cycles under-probed.** Cross-ref
the route tree from §3.3 against the cycle-6 PARENT's 4 instance
profiles. Which routes have ZERO coverage across cycles 1–6? For each
zero-coverage route, judge: is it (a) low-stakes / out-of-scope,
(b) admin-only and intentionally skipped, or (c) actual blind spot?

**Q4. Real failure modes synthetic tests miss.** List 5–10 plausible
real-user failure modes that synthetic cowork (MCP-via-bearer + in-
sandbox-Playwright + chrome.debugger) STRUCTURALLY cannot trigger.
Example shape: "iOS Safari on iPad mini renders the PDF overlay
toolbar at z-index lower than the system gesture bar — invisible in
Playwright/Chromium." For each: why synthetic misses + what a
human-shadow probe would catch.

**Q5. The MCP-first author's hidden dependencies.** Daniel doesn't
touch the in-app library UI anymore. What features in the browser
app rot silently as a result? (e.g., upload dialog, scraper modal,
chart edit pages.) Should cycle-7 PROBE these for staleness even
though Daniel doesn't use them — because David / Randy might?

**Q6. Concrete cycle-7 mission ask.** Given Q1–Q5, what 3–6 user
journeys SHOULD cycle-7 cowork probe? For each, give a one-paragraph
"day-in-the-life" sketch + the load-bearing assertion (what would
make it pass vs fail). Be opinionated; Daniel can pushback.

---

## §5 — Deliverable

Write to:
**`C:\Users\dsbog\CentralReform.live\sheet-music-app\.paul\research\cycle-7-recon-A-USER-FLOWS.md`**

Shape:
```markdown
# Cycle-7 Recon — Agent A — Real-User-Flow Reconnaissance

**Author:** recon-agent-A
**Date:** 2026-05-19 (or actual date you run)
**Sibling agents:** B (cowork capabilities), C (protocol critique)

## §1 — Friday-night critical path (answers Q1)
[walk + weakest-link analysis]

## §2 — David weekly-flow gap (answers Q2)
[synthetic-vs-real delta]

## §3 — Under-probed routes (answers Q3)
[zero-coverage list + judgment per route]

## §4 — Structural blind spots of synthetic cowork (answers Q4)
[5–10 failure modes synthetic misses]

## §5 — Hidden-dependency rot inventory (answers Q5)
[Daniel-skipped surfaces that may have rotted]

## §6 — Recommended cycle-7 mission ask (answers Q6)
[3–6 ranked user journeys + day-in-the-life + load-bearing assertion]

## §7 — Open questions for Daniel
[anything you couldn't resolve from repo state]
```

Target length: 1500–2500 words. Be terse, citation-heavy.

---

## §6 — Anti-patterns (what NOT to do)

- DO NOT critique cowork protocol decisions (Agent C's lane).
- DO NOT propose harness changes / time budgets / instance counts
  (Agent B's lane).
- DO NOT enumerate every route — only the load-bearing ones.
- DO NOT invent personas beyond the 4 known users.
- DO NOT recommend new features. Test scope only.
- DO NOT inflate findings with low-stakes nits. Daniel's bar is
  "would a real user notice / care."

---

## §7 — Go

Read §3 inputs. Answer §4 questions. Write §5 deliverable.

Sign off `from recon-agent-A`. Stop.
