---
phase: v5h-01-track-edit-save-loss
plan: 04
type: execute
wave: 1
depends_on: ["v5h-01-01", "v5h-01-02", "v5h-01-03"]
files_modified:
  - .paul/postmortems/v5h-01-save-loss.md
  - .paul/ROADMAP.md
autonomous: true
---

<objective>
## Goal
Write the v5.0-hotfix save-loss postmortem capturing root cause, harness blind spots, iteration lessons, deferred items, and the Daniel-loop UAT norm — the final plan in the v5.0-hotfix milestone before audit + close.

## Purpose
The save-loss bug shipped because v50-05's cutover plans introduced top-level `tracks/{trackId}` and `songs/{songId}` collections without corresponding `firestore.rules` entries, and v50-07's kitchen-sink harness shipped with fidelity gaps that masked it (no security-rules layer, no perf-view path, zero-latency in-memory adapters). The perf-view side then took 4 iterations because the team patched Firestore subscription semantics for 3 commits before recognizing the actual fault was architectural (editor + perf-view reading from different stores). Capturing these lessons in a referenceable artifact is the only thing that prevents a v5.x repeat — which would burn another week of Daniel's time and erode band trust before onboarding.

## Output
- `.paul/postmortems/v5h-01-save-loss.md` — the postmortem document
- `.paul/ROADMAP.md` — correct phase v5h-01's plan count (3 → 4) so it matches the actual shipped work
</objective>

<context>
## Project Context
@.paul/PROJECT.md
@.paul/ROADMAP.md
@.paul/STATE.md

## Prior Work (direct inputs to the postmortem)
@.paul/phases/v5h-01-track-edit-save-loss/v5h-01-01-SUMMARY.md
@.paul/phases/v5h-01-track-edit-save-loss/v5h-01-02-SUMMARY.md
@.paul/phases/v5h-01-track-edit-save-loss/v5h-01-03-SUMMARY.md
@.paul/handoffs/archive/HANDOFF-2026-04-27-v5h01-03-complete-paused.md
@.paul/handoffs/archive/HANDOFF-2026-04-27-post-uat-v5h-and-v51.md

## Reference (so the postmortem can name files + commits accurately)
@firestore.rules
@src/lib/sync/snapshot-listener.ts
@src/components/setlist/grid/SetlistGridHydrator.tsx
@src/hooks/use-setlist-performance.ts
@src/lib/sync/__tests__/property-failures.test.ts
</context>

<skills>
## Required Skills (from SPECIAL-FLOWS.md)

No required skills. SPECIAL-FLOWS.md gates `/ui-ux-pro-max` on frontend UI/UX work; this plan touches docs only (postmortem markdown + ROADMAP correction). Same precedent as v50-06-01, v50-07-02, v50-07-04, v50-07-05 (observability + docs).

</skills>

<acceptance_criteria>

## AC-1: Postmortem document exists at the canonical path
```gherkin
Given the v5.0-hotfix milestone is closing and a referenceable postmortem is needed
When v5h-01-04 ships
Then `.paul/postmortems/v5h-01-save-loss.md` exists, is committed to git, and is linked from v5h-01-04-SUMMARY.md
```

## AC-2: Postmortem covers the cutover-plan rules-audit gap
```gherkin
Given v50-05-02 introduced top-level tracks/{trackId} + songs/{songId} collections without firestore.rules entries
When a future planner reads the postmortem
Then they find: (a) the timeline of the silent default-deny window, (b) why the kitchen-sink harness didn't catch it, (c) a concrete proposal for a "new top-level Firestore collection?" → "firestore.rules updated?" gate to add to PAUL/CARL planning checks for cutover-shaped phases
```

## AC-3: Postmortem covers kitchen-sink harness fidelity gaps
```gherkin
Given v50-07-04's fast-check property harness shipped 1468/1468 yet missed the production save-loss
When a future planner is sizing a harness for a cutover phase
Then they find named gaps: (a) no security-rules layer (missed missing rules), (b) no perf-view path coverage (missed data-path divergence + dual-read freshness bug), (c) zero-latency in-memory adapters (missed cache-vs-server-fresh races + Firestore SDK persistent-cache semantics), each with a concrete remediation option (Firebase emulator OR higher-fidelity in-memory adapter modeling initial-cache-then-fresh delivery OR thin RTL/Playwright test running editor cell-commit AND perf-view subscription against a shared in-memory Firestore)
```

## AC-4: Postmortem covers the perf-view fix iteration cycle
```gherkin
Given v5h-01-03 ran 4 iterations (f83d75d reverted, 8971223 + 4aa6840 superseded, 92b1902 final architectural refactor)
When a future engineer is debugging a similar subscription/caching hook
Then they find: (a) why `metadata.fromCache` was a false signal (source not freshness), (b) the 2-3-iteration heuristic for stepping back to question architecture vs continuing to patch, (c) the principle that architectural fixes can be cleaner AND simpler than patches when the underlying divergence is architectural
```

## AC-5: Postmortem covers the auth-claim staleness incident + Daniel-loop UAT norm + Issue 2 routing
```gherkin
Given v5h-01-02 had a diagnostic chain where Daniel's session token from before the rules deploy didn't carry the new admin claim path, requiring sign-out/in + reset-and-drain of 142 stuck outbox rows
And v5h-01-02 + v5h-01-03 each ran a Daniel UAT cycle between fix and close
And Issue 2 (iPad key-picker UI bad) was surfaced in v5h-01-02 UAT and deferred
When v5.x phases ship
Then the postmortem documents: (a) the auth-claim staleness incident (what happened, what to watch for, whether client tokens should auto-refresh on rules-version change is in or out of scope), (b) the Daniel-loop UAT cycle as the v5.x norm, (c) Issue 2's deferred status with the routing rule (tap-target/sheet issue → v50-05-04 regression follow-up; "feels janky" → v5.1 UX overhaul) so the next session knows how to triage Daniel's symptom description
```

## AC-6: ROADMAP.md reflects v5h-01's actual 4-plan structure
```gherkin
Given STATE.md and the v5h-01-03-SUMMARY both treat the postmortem as v5h-01-04 (because the original v5h-01-03 became the perf-view architectural refactor)
But ROADMAP.md still lists v5h-01 as "3 plans" with the postmortem labeled v5h-01-03
When v5h-01-04 ships
Then ROADMAP.md is updated to "4 plans" with v5h-01-03 as "Perf-view architectural refactor" and v5h-01-04 as "Postmortem", matching what STATE.md and the SUMMARYs already record
```

## AC-7: Suite + build remain green
```gherkin
Given this plan modifies only documentation files
When `npm test` and `npm run build` run after Task 1 + Task 2
Then suite passes 1481/1481 and `next build` is clean (no regression introduced)
```

</acceptance_criteria>

<tasks>

<task type="auto">
  <name>Task 1: Write the v5h-01 save-loss postmortem</name>
  <files>.paul/postmortems/v5h-01-save-loss.md</files>
  <action>
    Create the postmortem at `.paul/postmortems/v5h-01-save-loss.md`. Use absolute paths in any tool calls. Structure:

    ## Header
    Title: "v5.0-hotfix Postmortem — Track-Edit Save-Loss". Date: 2026-04-27. Author: Rabbi Daniel + PAUL session. Severity: P0 (data loss in production). Status: RESOLVED.

    ## TL;DR (one paragraph)
    What broke (silent default-deny on tracks/{id} + songs/{id} writes), how it surfaced (Daniel's UAT 2026-04-27 path "P"), what fixed it (rules deploy + Hydrator outbox guard + listener LWW + perf-view Dexie refactor across plans v5h-01-01..03), what we learned (rules-audit gate; harness fidelity gaps; architectural-vs-patch heuristic).

    ## Timeline
    Single dated table walking the reader from v50-05-02 (cutover that introduced unprotected collections) → v5.0 milestone marked complete → Daniel UAT 2026-04-27 morning surfacing path "P" → v5h-01-01 reproduction + production capture → root cause confirmed (missing rules + downstream effects) → v5h-01-02 fix (E+F+B at commit 0c2921d) → diagnostic chain (142 stuck outbox rows, stale auth token, reset-and-drain) → editor save passing UAT → perf-view still showing stale → v5h-01-03 four iterations (f83d75d revert, 8971223 + 4aa6840 superseded, 92b1902 final architectural refactor) → Daniel UAT pass.

    ## Root Cause
    Lead with the corrected diagnosis (NOT the original handoff hypothesis): missing `match /tracks/{trackId}` and `match /songs/{songId}` blocks in `firestore.rules`. v50-05 shipped the new collection shape without growing the rules file; default-deny rejected every track write silently; per-doc drain ordering then blocked subsequent valid writes behind the failed lazy-hydration cascade rows; SetlistGridHydrator re-primed legacy embedded `setlists/{id}.tracks[]` over the user's stuck-pending local edit; perf-view read from Firestore SDK's persistent IDB cache (not the engine's Dexie store), so cross-device fresh data took 60s+ + multiple refreshes to surface even after rules shipped.

    Note explicitly that the original handoff's three ranked hypotheses (LWW underflow / writeback miss / serverTimestamp race) were all WRONG, and explain WHY (each assumed engine-side bugs in code paths the production capture proved were wired correctly). This matters for AC-4's "research-before-execute" lesson.

    ## What Got Shipped (the fix, by commit)
    - `0c2921d` (v5h-01-02): firestore.rules + SetlistGridHydrator outbox-pending guard + snapshot-listener strict-equality LWW + property-failures.test.ts AC-1 flip from `it.fails` → `it`.
    - `92b1902` (v5h-01-03 final): use-setlist-performance.ts refactored to read tracks from Dexie via useLiveQuery + mount snapshot-listener; embedded fallback retained ONLY for unhydrated legacy setlists; public-view short-circuit preserved. (Note that 3 prior iterations on this hook all failed; covered in §Lessons.)

    ## Lessons (the meat — five subsections)

    ### 1. Cutover-plan rules-audit gap → propose a planning gate
    Explain how v50-05-02's plan didn't include a rules-audit step even though it introduced 2 new top-level collections. The kitchen-sink harness can't catch this because it doesn't run real security rules. The fix has to be at planning time. Propose adding to PAUL's plan-phase workflow OR a CARL global rule: "If `files_modified` includes a new top-level Firestore collection (any path matching `setlists|songs|tracks|users` or any new collection introduced this phase), the plan MUST include a task touching `firestore.rules` OR explicitly document why no rules change is needed." Recommend wording for the gate. Note this also applies to `storage.rules` (Phase 1.3 of an earlier era already flagged a similar invisibility for Firebase Storage rules).

    ### 2. Kitchen-sink harness fidelity gaps → name them and give remediation options
    Three concrete gaps with named remediation:
    - **No security-rules layer.** The harness uses fake adapters; real Firestore default-deny was invisible. Remediation options ranked: (a) **Firebase Local Emulator Suite** running rules + auth in-process during the harness run — highest fidelity, ~5-10s startup cost, can run subset of property iterations against the emulator (e.g., 5 of 50); (b) extend `KitchenSinkAdapter` to optionally apply a parsed-rules layer using `@firebase/rules-unit-testing` patterns — middle fidelity, no emulator dep; (c) accept the gap and add an explicit "rules-audit gate" at planning time (what §1 proposes).
    - **No perf-view path coverage.** Harness asserted invariants on the engine + outbox + Dexie + SetlistGridHydrator's lazy-hydration; never exercised the perf-view subscription. Remediation: a thin RTL test running BOTH the editor cell-commit path AND `useSetlistPerformance` against the same in-memory Firestore + Dexie, asserting the cross-view propagation invariant. Cheaper than Playwright; reuses existing test seams.
    - **Zero-latency in-memory adapters miss cache-vs-fresh races.** The Firestore SDK has persistent-cache semantics (initial-cache delivery, then server-fresh) that an in-memory adapter doesn't model. Remediation options: (a) introduce an `AdapterDelayProfile` shaping option to `KitchenSinkAdapter` that simulates cache-then-fresh delivery (`onSnapshot` fires twice on connect — once from cache, once from fresh, with configurable delay); (b) Firebase emulator covers this for free; (c) accept the gap with an explicit assumption documented in `property-failures.test.ts` describing what the harness CAN'T prove.

    Cross-reference to `feedback_harness_real_firestore.md` in the user's auto-memory (this gap was already flagged after v50-07-04 → v50-07-05 UAT save-loss; the postmortem is the codification).

    ### 3. Perf-view fix iteration lessons (the 2-3-strikes architectural-rethink rule)
    Three points:
    - `metadata.fromCache` indicates SOURCE not FRESHNESS. After `getDocsFromServer` warms the cache, listener deliveries from that fresh cache STILL report `fromCache: true`. Anyone reaching for `fromCache` as a freshness signal should stop — it's the wrong primitive.
    - Research-before-execute when subscription state semantics + caching are at play. The first execute attempt (`f83d75d`) was based on a hypothesis (resubscribe-on-error + hydrated-trust gate) that hadn't been validated against the actual Firestore SDK behavior; it returned `[]` during initial mount and broke live setlists.
    - **The 2-3-strikes architectural-rethink rule.** When a hook has been patched 2-3 times without fixing the user-visible symptom, stop patching and ask: "Is the architecture right?" In this case, three commits patched perf-view's Firestore subscription before the realization that editor + perf-view were reading from two different stores with different freshness semantics. The architectural fix (read from Dexie like the editor does) was simpler AND cleaner than any of the patches.

    ### 4. Auth-claim staleness incident
    Document the diagnostic chain (sign-out/in restored `role: "admin"`; reset-and-drain snippet flipped 46 failed rows back to pending). Note the open question: should client tokens auto-refresh on rules-version change? Probably out of scope (Firebase doesn't expose rules-version changes to the client; would require server-side coordination via custom claims revision bumps); document for future awareness rather than committing to a fix.

    ### 5. The Daniel-loop UAT cadence as v5.x norm
    Both v5h-01-02 and v5h-01-03 ran a Daniel UAT cycle between fix and close. v5h-01-02 specifically caught the residual perf-view problem that the harness couldn't see. Establish for v5.x: every fix that touches data flow gets a Daniel UAT before the milestone close, against real production. Note this connects to the user's stated requirement that the app be "bulletproof and easy and intuitive" before band onboarding.

    ## Deferred Items (with routing)
    - **Issue 2: iPad key-picker UI is bad.** Surfaced in v5h-01-02 UAT. Symptom unclear. Routing rule: tap-target / sheet-vs-popover issue → v50-05-04 regression follow-up (likely a v5h-01-05 if blocking onboarding, or a v5.1 plan). "Feels janky / discoverability" → v5.1 UX overhaul. Resume action: ask Daniel for the symptom, then route per above.
    - **Auth-claim auto-refresh on rules-version change** (from §Lessons.4) — out of scope, documented for awareness.
    - **Snapshot-listener mounted in TWO places (editor + perf-view) when both views open simultaneously** (from v5h-01-03 SUMMARY's Concerns) — accepted; LWW makes redundant writes no-ops; could be optimized later by lifting to a layout-level singleton.

    ## Action Items (concrete next steps)
    Numbered list with owner + target milestone:
    1. Add the rules-audit gate from §1 to PAUL plan-phase workflow OR a CARL global rule. Owner: Rabbi Daniel. Target: before next cutover-shaped phase.
    2. Pick a kitchen-sink remediation option from §2 (recommend the Firebase emulator + thin RTL editor↔perf-view test) and ticket it for the v5.x harness work. Owner: Rabbi Daniel. Target: opportunistic during v5.1 or before next major cutover.
    3. Resolve Issue 2 routing once Daniel describes the symptom. Owner: next /paul:resume session.
    4. Codify the Daniel-loop UAT cadence in PROJECT.md or PAUL milestone-close workflow. Owner: Rabbi Daniel. Target: before v5.1 ships.

    ## Appendix
    - Affected user count: 1 (Daniel; band not yet in production).
    - Production data loss: 0 confirmed (cell edits all recovered via reset-and-drain).
    - Time-to-resolution: ~6h end-to-end on 2026-04-27 (research + 3 plans + 4 iterations).
    - Outbox stuck-row count at peak: 142 (46 failed + 96 pending blocked behind them).
    - Final commit: `92b1902`. Suite: 1481/1481.

    Style: Match the tone of existing PAUL summaries — terse, named files + commits, no marketing. Use the file paths and commit hashes from the v5h-01-01..03 SUMMARYs verbatim where applicable. Cross-reference SUMMARYs with relative paths so future readers can jump back. Avoid duplicating their content; postmortem is lessons + actions, not a re-narration.
  </action>
  <verify>Run `ls -la .paul/postmortems/v5h-01-save-loss.md` to confirm the file exists. Open and verify all 6 acceptance criteria sections (TL;DR + Timeline + Root Cause + Shipped + Lessons.1-5 + Deferred + Action Items + Appendix) are present and named.</verify>
  <done>AC-1 + AC-2 + AC-3 + AC-4 + AC-5 satisfied: postmortem exists at canonical path covering cutover rules-audit gap, harness fidelity gaps, perf-view iteration lessons, auth-claim staleness, Daniel-loop UAT norm, and Issue 2 routing.</done>
</task>

<task type="auto">
  <name>Task 2: Correct ROADMAP.md to reflect v5h-01's 4-plan structure</name>
  <files>.paul/ROADMAP.md</files>
  <action>
    Update `.paul/ROADMAP.md` to match the actual shipped phase structure.

    Edit the Current Milestone block (around line 4-15) and the Phase v5h-01 block:
    - Phase v5h-01 row in the milestone table: change "3 (planned: 01-01 reproduce+diagnose • 01-02 fix • 01-03 postmortem)" → "4 (01-01 reproduce+diagnose ✓ • 01-02 fix ✓ • 01-03 perf-view architectural refactor ✓ • 01-04 postmortem)"
    - Plan list under "### Phase v5h-01: Track-edit save-loss diagnosis + fix" (around lines 22-24): keep v5h-01-01 + v5h-01-02 entries as-is; rewrite the third bullet (currently "v5h-01-03 — Postmortem") as TWO bullets:
      - **v5h-01-03 — Perf-view architectural refactor** (execute; ~6h with 3 failed iterations; final commit `92b1902`) — refactored `useSetlistPerformance` to read tracks from Dexie via `useLiveQuery` + mount snapshot-listener; embedded fallback retained ONLY for unhydrated legacy setlists. Daniel UAT 2026-04-27 confirmed instant editor→perf-view propagation.
      - **v5h-01-04 — Postmortem** (execute; ~30min) — `.paul/postmortems/v5h-01-save-loss.md`: cutover-plan rules-audit gap proposal; kitchen-sink harness fidelity gaps with remediation options; perf-view 4-iteration architectural-rethink lesson; auth-claim staleness incident; Daniel-loop UAT norm; Issue 2 routing.

    Use Edit (not Write) — ROADMAP.md is large (~590 lines); only the milestone block + phase block change.

    Do NOT edit:
    - Active Milestone block for v5.0 (status `🟡 Pending UAT` is still correct; v5.0 close is gated on v5.0-hotfix completing — this plan moves it forward but doesn't close it)
    - Any v5.0 phase entries (v50-01 through v50-07)
    - Any v5.1 entries (still future)
  </action>
  <verify>Run `grep -n "v5h-01" .paul/ROADMAP.md` and confirm: (a) milestone table shows "4 (..." for v5h-01 row, (b) plan list under Phase v5h-01 has 4 entries (01-01, 01-02, 01-03, 01-04), (c) v5h-01-04 description names `.paul/postmortems/v5h-01-save-loss.md` and lists the lesson areas.</verify>
  <done>AC-6 satisfied: ROADMAP.md reflects the actual 4-plan structure of v5h-01 with correct titles for v5h-01-03 (perf-view refactor) and v5h-01-04 (postmortem).</done>
</task>

<task type="auto">
  <name>Task 3: Verify suite + build remain green</name>
  <files>(verification only — no file modifications)</files>
  <action>
    Run the standard verification suite to confirm the docs-only changes from Task 1 + Task 2 introduced no regression:

    1. `npm test` — confirm 1481/1481 pass.
    2. `npm run build` (Next.js production build) — confirm clean.

    If either fails, the postmortem should not be considered shipped. Failures here would be a process-only issue (no code changed) so investigate before proceeding to UNIFY.

    Note: per user preference (`feedback_nextjs_route_exports.md`), `next build` is the actual gate, not just `tsc` — keep both in the run.
  </action>
  <verify>`npm test` shows 1481/1481 passing; `npm run build` exits 0 with no errors.</verify>
  <done>AC-7 satisfied: docs-only changes did not regress the suite or build.</done>
</task>

</tasks>

<boundaries>

## DO NOT CHANGE
- `firestore.rules` (already correct as of 0c2921d; postmortem references but does not edit)
- `src/lib/sync/snapshot-listener.ts` (locked; v5h-01-02 ship)
- `src/components/setlist/grid/SetlistGridHydrator.tsx` (locked; v5h-01-02 ship)
- `src/hooks/use-setlist-performance.ts` (locked; v5h-01-03 final commit `92b1902`)
- `src/lib/sync/__tests__/property-failures.test.ts` (locked; AC-1 flip lives here from v5h-01-02)
- Any `.paul/phases/v5h-01-*-SUMMARY.md` (already shipped; postmortem references them)
- v5.0 milestone status in ROADMAP.md (still `🟡 Pending UAT`; this plan does not close it)
- v5.1 milestone entries in ROADMAP.md (still future)

## SCOPE LIMITS
- Postmortem is documentation only. The action items it proposes (rules-audit planning gate, kitchen-sink emulator integration, Issue 2 resolution, Daniel-loop UAT codification) are NOT implemented in this plan — they're captured for future plans.
- No new code, no new tests, no new dependencies. If the suite or build breaks, the breakage is unrelated to this plan and must be diagnosed separately.
- Do NOT update `feedback_harness_real_firestore.md` in the user's auto-memory — that memory entry already documents the harness fidelity gap; the postmortem cross-references it.
- Do NOT edit `STATE.md` until UNIFY (the close commit). The plan-creation update to STATE.md happens in the workflow's `update_state` step, not as a task here.

</boundaries>

<verification>
Before declaring plan complete:
- [ ] `.paul/postmortems/v5h-01-save-loss.md` exists and contains all 5 lesson subsections + deferred items + action items + appendix
- [ ] ROADMAP.md milestone table shows "4 (..." for v5h-01 and the phase block lists 4 plans with v5h-01-03 = perf-view refactor and v5h-01-04 = postmortem
- [ ] `npm test` passes 1481/1481
- [ ] `npm run build` exits clean
- [ ] All 7 acceptance criteria satisfied
</verification>

<success_criteria>
- Postmortem document committed to git at `.paul/postmortems/v5h-01-save-loss.md`
- ROADMAP.md reflects actual phase structure (4 plans, not 3)
- Suite + build green (no regression from docs change)
- Future planners can read the postmortem and apply the rules-audit gate + kitchen-sink fidelity remediation + 2-3-strikes architectural-rethink heuristic to v5.1 and beyond
- v5.0-hotfix milestone is now 4/4 plans complete and ready for `/paul:audit-milestone`
</success_criteria>

<output>
After completion, create `.paul/phases/v5h-01-track-edit-save-loss/v5h-01-04-SUMMARY.md` summarizing:
- Postmortem path + headline lessons (one-line each for the 5 subsections)
- ROADMAP.md correction (3→4 plans)
- Verification results (suite + build)
- Next milestone action: `/paul:audit-milestone v5.0-hotfix` to close the milestone, then route to v5.1 via `/paul:new-milestone` or `/paul:discuss-milestone`
</output>
