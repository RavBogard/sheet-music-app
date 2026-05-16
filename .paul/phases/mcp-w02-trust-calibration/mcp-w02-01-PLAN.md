---
phase: mcp-w02-trust-calibration
plan: 01
type: feature
wave: 1
depends_on: []
files_modified:
  - src/lib/mcp/title-specificity.ts
  - src/lib/library-upload.ts
  - src/lib/mcp/tools/library.ts
  - src/lib/mcp/tools/index.ts
  - src/lib/songs/server-songs.ts
  - firestore.indexes.json
  - functions/src/index.ts
  - src/lib/mcp/title-specificity.test.ts
  - src/lib/mcp/tools/library.emulator.test.ts
autonomous: false
---

<objective>
## Goal
Add deterministic *specificity* and *learning* signals to the MCP catalog
surface so that the agent has the data it needs to know when to stop and ask
before bonding. Ships four schema additions to `library_index` + one new
sibling collection, a deterministic scorer, ranking biases in
`search_library` / `list_library`, and a Cloud Function trigger that
aggregates rabbi corrections into context-preference hints.

## Purpose
The Bar Mitzvah session (2026-05-16) failure mode was: agent searches
`Hashkivenu`, gets one hit, confidently bonds the wrong arrangement, the
rabbi catches it only on iPad after publish. Today's tactical fixes
(chart-verify, orphan filtering) closed the "broken chart" loop but not the
"wrong-but-renderable chart" loop. Trust calibration requires the agent
read specificity off the catalog directly — without it, every downstream
W (W-001 commit-and-flag, W-004 propose-then-confirm) is keying on data
that doesn't exist.

This phase is the data-layer prerequisite for W-001. It is mechanical,
self-contained, and unblocks the experience layer.

## Output
- New file `src/lib/mcp/title-specificity.ts` containing the deterministic
  scorer + the static `GENERIC_LITURGICAL_STEMS` array.
- `library_index` schema additions: `titleSpecificity`, `composer?`,
  `arranger?`, `notationSource?`, `lastUsedInSetlist?`,
  `bondCorrectionHistory`.
- New Firestore collection `titleContextHints/{stem}_{contextKey}`.
- `search_library` / `list_library` response envelopes carry the new fields
  AND apply the `bondCorrectionHistory` + `titleContextHints` ranking bias.
- Cloud Function trigger on `bond_corrections/*` writes that aggregates
  picks into `titleContextHints` after N=3 consistent picks.
- One-time backfill script: computes specificity for every existing
  `library_index` row.
- Hook into `processChartUpload` in `library-upload.ts` so new uploads
  score on entry and trigger a sibling-recount cascade.
- Emulator tests pinning scorer outputs, ranking bias math, hint aggregation
  threshold, and the upload-time scoring path.
- Updated `project_mcp_status.md` memory at ship time (per standing rule).
</objective>

<context>
## Project Context
@.paul/PROJECT.md
@.paul/research/w-plans/W-002-trust-calibration.md
@~/.claude/projects/C--Users-dsbog-centralreform-live/memory/project_mcp_status.md
@~/.claude/projects/C--Users-dsbog-centralreform-live/memory/feedback_learning_self_healing.md
@~/.claude/projects/C--Users-dsbog-centralreform-live/memory/user_mcp_is_primary_author_workflow.md

## Decisions baked in (from Daniel discussion 2026-05-16)
- Liturgical-generic-title list: static array in code (not Firestore doc).
- Specificity threshold for "stop and ask": `< 0.5` to start.
- `composer` / `arranger` / `notationSource`: free-text strings; W-003
  content campaign populates the actual values later. This phase ONLY
  ships schema + reads.
- `lastUsedInSetlist` source: extend `recordSongUsage` (denormalized).
- Recompute trigger: on upload + on any new entry sharing a normalized
  stem (cascade recount to siblings). Not nightly.
- Threshold tuning: one-line PR after first 4 weeks of real-use data.

## Specificity scoring rule (deterministic)
Base 0.5. Then:
- +0.2 if title has a parenthesized clarifier (`Foo (Composer)`).
- +0.2 if title has a hyphen-composer pattern (`Foo - Composer`).
- -0.3 if the *normalized stem* matches any entry in
  `GENERIC_LITURGICAL_STEMS` (initial set: hashkivenu, veshamru,
  mi-chamocha, oseh-shalom, adon-olam, niggun, shalom-rav, lecha-dodi,
  yedid-nefesh, modeh-ani, kaddish, vahavta, eitz-chayim, halleluyah,
  ahavat-olam, sim-shalom, hineni, debbie-friedman-blessing,
  shehecheyanu, kiddush, motzi).
- +0.2 if normalized title is unique in catalog (`siblingsInCatalog === 1`).
- -0.2 if shared by ≥2 entries.
- +0.1 if title has ≥3 word tokens.
- -0.1 if title is ALL CAPS, all-lowercase-with-underscore, or matches
  `/^[a-z_0-9]+$/`.
Final score clamped to `[0, 1]`. Round to 2 decimals.

## Ranking bias math
For each result row at search time:
- `bondCorrectionBias = (correctedTo - correctedAwayFrom) × 0.05`,
  clamped to `[-0.25, +0.25]`.
- `contextHintBoost = +0.5` if `titleContextHints/{stem}_{contextKey}`
  resolves to this row's `fileId` and that hint has `picks ≥ 3`,
  else `0`.
- Final rank = base relevance + bondCorrectionBias + contextHintBoost.
- Tie-break: `lastUsedInSetlist.eventDate` desc, then `name` asc.

## titleContextHints aggregation
A Cloud Function `onCreate` for `bond_corrections/*` documents reads the
last N=3 corrections for the same `(normalizedStem, contextKey)` pair
where `correctedTo.fileId` is consistent. When all three agree, write a
hint doc. Subsequent disagreements roll the picks counter back.
`contextKey` derives from the setlist's `templateType` (e.g.
`friday-evening`, `shabbat-morning`, `bnei-mitzvah`).

## Coordination
- The parallel session shipped 6 commits today, last at `b3f78850a`. All
  files this phase touches are now stable; no merge churn expected.
- A cowork bug-stomp stress test is running NOW. If it surfaces new
  CRIT-bar issues against `search_library` or `library_index`, pull
  first before pushing this phase's commits.
</context>

<skills>
## Required Skills (from SPECIAL-FLOWS.md)

| Skill | Priority | When to Invoke | Loaded? |
|-------|----------|----------------|---------|
| /ui-ux-pro-max | n/a | No UI in this phase | — |

## Skill Invocation Checklist
- [ ] No UI changes — `/ui-ux-pro-max` not required.
- [ ] Run `next build` (NOT just tsc) before claiming done — per
  `feedback_nextjs_route_exports`, even though no `route.ts` exports
  change, the build is the only thing that catches App Router
  violations.
- [ ] Run the emulator test suite (`npx firebase emulators:exec --only
  firestore,auth "npx vitest run --config vitest.emulator.config.ts"`)
  before claiming done.
</skills>

<acceptance_criteria>

## AC-1: Deterministic specificity scorer
```gherkin
Given a chart title string
When titleSpecificity(title, siblingCount) is called
Then it returns a number in [0, 1] computed by the rule in <context>
And the score is stable across repeated calls (deterministic)
And the test suite pins values for:
  - "Hashkivenu" with siblingCount=1 → 0.40
    (base 0.5 + generic -0.3 + unique +0.2 = 0.40)
  - "Hashkivenu (Klepper-Freelander)" with siblingCount=1 → 0.70
    (base 0.5 + parens +0.2 + generic -0.3 + unique +0.2 + 3+ tokens +0.1 = 0.70)
  - "Eitz Chayim - Weisenberg" with siblingCount=1 → 0.70
    (base 0.5 + hyphen-composer +0.2 + generic -0.3 + unique +0.2 + 3+ tokens +0.1 = 0.70)
  - "shalom_rav" with siblingCount=2 → 0.00
    (base 0.5 + generic -0.3 + shared -0.2 + lowercase-underscore -0.1 = -0.1, clamped to 0)
And bare "Hashkivenu" at 0.40 sits below STOP_AND_ASK_THRESHOLD (0.5),
  triggering the propose-then-ask path; the disambiguated 0.70 variant
  sits above and commits without asking.
```

## AC-2: library_index carries the new fields
```gherkin
Given a freshly uploaded chart via processChartUpload
When its library_index doc is created
Then it carries titleSpecificity (number, 0..1)
And bondCorrectionHistory = {correctedTo: 0, correctedAwayFrom: 0}
And composer / arranger / notationSource / lastUsedInSetlist absent unless
  the caller supplied them (no defaults)
```

## AC-3: Sibling-recount cascade on upload
```gherkin
Given the catalog contains one entry "Hashkivenu" with siblingCount=1
  and titleSpecificity=0.20
When a new chart "Hashkivenu (Sulzer)" is uploaded (force: true)
Then the new chart's siblingCount is 2 and specificity recomputes accordingly
And the existing "Hashkivenu" row's siblingCount AND specificity
  are recomputed in the same Firestore batch
And the cascade is bounded — only entries sharing the new chart's
  normalized stem are touched
```

## AC-4: search_library / list_library envelope and bias
```gherkin
Given search_library({query: "hashkivenu"}) returns multiple rows
When the response is built
Then each row carries: titleSpecificity, siblingsInCatalog, composer?,
  arranger?, notationSource?, lastUsedInSetlist?, bondCorrectionHistory,
  fileHealthy (from existing chart-verify integration)
And rows are ordered by: base relevance + bondCorrectionBias +
  contextHintBoost, with the documented tie-break
And a row with bondCorrectionHistory = {correctedTo: 10, correctedAwayFrom: 0}
  ranks above an otherwise identical row with {correctedTo: 0, correctedAwayFrom: 10}
```

## AC-5: titleContextHints aggregation
```gherkin
Given three bond_corrections docs exist for stem="hashkivenu",
  contextKey="friday-evening", all pointing correctedTo.fileId="abc123"
When the Cloud Function trigger fires on the third write
Then titleContextHints/hashkivenu_friday-evening exists with picks=3,
  preferredFileId="abc123"
And a fourth correction with a DIFFERENT correctedTo.fileId resets picks to 1
And search_library({query: "hashkivenu"}) against a friday-evening setlist
  context returns fileId="abc123" at position 0
```

## AC-6: Backfill script computed specificity for all existing rows
```gherkin
Given the existing library_index has ~500 entries with no titleSpecificity
When the one-time backfill script is run
Then every row carries titleSpecificity AND bondCorrectionHistory:
  {correctedTo: 0, correctedAwayFrom: 0}
And the script is idempotent — running it twice produces no diff
And it skips orphaned rows (status: "orphaned") to avoid wasted writes
```

## AC-7: project_mcp_status.md memory updated
```gherkin
Given this phase ships
When the commits land
Then ~/.claude/projects/.../memory/project_mcp_status.md adds a new
  W-02 entry capturing the schema additions, the scorer, ranking-bias
  math, and the hint aggregation threshold
And the tool count and tip commit are updated in the headline
```

</acceptance_criteria>

<tasks>

<task type="auto">
  <name>Task 1: Create the deterministic specificity scorer</name>
  <files>src/lib/mcp/title-specificity.ts, src/lib/mcp/title-specificity.test.ts</files>
  <action>
    Write src/lib/mcp/title-specificity.ts exporting:
    - GENERIC_LITURGICAL_STEMS: readonly string[] of normalized stems (use
      the same normalization helper L-003 added to lib/mcp/tools/library.ts —
      lowercase + collapse [_\s-]+ + fold diacritics).
    - normalizeStem(title: string): string.
    - titleSpecificity(title: string, siblingsInCatalog: number): number
      implementing the scoring rule from <context>. Round to 2 decimals.
    - STOP_AND_ASK_THRESHOLD = 0.5 (single source of truth for any
      downstream consumer that needs to gate on it).
    Write title-specificity.test.ts pinning the four AC-1 cases plus
    edge cases (empty title → 0, very long title → bounded ≤ 1, ALL CAPS
    detection, normalization round-trip).
  </action>
  <verify>
    npx vitest run src/lib/mcp/title-specificity.test.ts — all pass.
    npx tsc --noEmit — no type errors.
  </verify>
</task>

<task type="auto">
  <name>Task 2: Schema additions on library_index + Firestore index</name>
  <files>src/lib/mcp/tools/library.ts, src/lib/library-upload.ts, firestore.indexes.json, firestore.rules</files>
  <action>
    Extend LibraryIndexEntry type with optional titleSpecificity (number),
    composer/arranger/notationSource (string), lastUsedInSetlist
    ({setlistId, eventDate}), and bondCorrectionHistory
    ({correctedTo: number, correctedAwayFrom: number, lastCorrectionAt?: string}).
    In processChartUpload, on the Firestore write that creates
    library_index/{fileId}: compute titleSpecificity using
    siblingsInCatalog from a fresh count query, write
    bondCorrectionHistory default {correctedTo: 0, correctedAwayFrom: 0}.
    Add a Firestore composite index on
    library_index.normalizedName ASC if not already present (L-003 may
    have added it; check first).
    firestore.rules: bond_corrections collection — write open to admin +
    band_leader; read admin only.
  </action>
  <verify>
    npx firebase deploy --only firestore:indexes,firestore:rules --project crcmusiccharts.
    Run the existing chart-upload emulator test — should still pass.
  </verify>
</task>

<task type="auto">
  <name>Task 3: Sibling-recount cascade on upload</name>
  <files>src/lib/library-upload.ts, src/lib/mcp/title-specificity.ts (helper), src/lib/mcp/tools/library.emulator.test.ts</files>
  <action>
    In processChartUpload, after the library_index write, query for all
    other library_index docs with the same normalizedStem AND
    status != "orphaned". For each: recompute titleSpecificity with the
    new sibling count, write back in a batch with the originating
    transaction (or a follow-up batch keyed to the same traceId for
    observability). Bounded to entries sharing the stem — DO NOT scan
    the full collection.
    Add emulator test: upload two "Hashkivenu" entries; verify both have
    siblingCount=2 + specificity recomputed after the second upload.
  </action>
  <verify>
    npx firebase emulators:exec --only firestore,auth "npx vitest run
    --config vitest.emulator.config.ts src/lib/mcp/tools/library.emulator.test.ts"
    — all pass including new sibling-recount case.
  </verify>
</task>

<task type="auto">
  <name>Task 4: search_library / list_library envelope + ranking bias</name>
  <files>src/lib/mcp/tools/library.ts, src/lib/mcp/tools/index.ts, src/lib/mcp/tools/library.emulator.test.ts</files>
  <action>
    In search_library and list_library: surface the new fields in each
    row. Apply ranking bias per <context>: bondCorrectionBias (linear)
    + contextHintBoost (when contextKey is supplied). Add new optional
    arg `contextKey?: string` on both tools, defaulting to undefined
    (no hint lookup).
    Document both tools' descriptions to call out the new fields and
    the ranking bias. Caller can pass contextKey="friday-evening" etc.
    when they want context-aware ordering.
    Emulator tests: bias math math (correctedTo=10 ranks above 0),
    contextHintBoost pulls a row to position 0, tie-break by
    lastUsedInSetlist.eventDate desc.
  </action>
  <verify>
    Emulator suite — all pass including new bias tests.
    Manual probe against staging: search_library({query:"hashkivenu",
    contextKey:"friday-evening"}) returns enriched envelope.
  </verify>
</task>

<task type="auto">
  <name>Task 5: titleContextHints schema + read-side lookup (write-side deferred to W-01)</name>
  <files>firestore.rules, src/lib/mcp/tools/library.ts (already done in Task 4)</files>
  <action>
    **REVISED 2026-05-16 mid-execution:** This project has no Firebase
    Functions infrastructure (no `functions/` directory, no functions
    section in firebase.json, no firebase-functions npm dep). Bootstrapping
    a Functions deployment just for one trigger doubles the deployment
    surface and CI complexity for negligible benefit.

    **New mechanism:** aggregation runs inline inside the
    `record_bond_correction` MCP tool (W-01 Task 5). Same transactional
    write, same 3-pick threshold, same envelope — just lives in the
    MCP tool path instead of a Firestore trigger. Read-side lookup
    contract is identical (search_library still reads
    `titleContextHints/{stem}_{contextKey}` and gates on `picks >= 3`).

    **What ships in this task:**
    - `titleContextHints` Firestore rules (read for signed-in, write
      server-only) — DONE in Task 2.
    - `loadContextHint` lookup in searchLibrary — DONE in Task 4.
    - Tests pinning the read-side contract (picks < 3 ignored, picks
      >= 3 surfaces preferredFileId at position 0) — DONE in Task 4
      (`mcp-search-library-w02.emulator.test.ts`).

    **Deferred to W-01 Task 5 (`record_bond_correction` tool):**
    - The inline aggregation logic: on each bond_corrections write,
      read the last N matching corrections in the same transaction;
      if all agree, upsert the hint with picks=3; if not, reset to 1
      with the new fileId.
    - Emulator tests for the aggregation lifecycle.
  </action>
  <verify>
    `loadContextHint` is exercised by mcp-search-library-w02.emulator.test.ts;
    "contextHint with picks < 3 is ignored" and bias-vs-boost ordering both
    pass. Cross-reference in W-01 Task 5 confirms the write-side will
    land where this task expected.
  </verify>
</task>

<task type="auto">
  <name>Task 6: One-time backfill script + run against prod</name>
  <files>scripts/backfill-title-specificity.ts</files>
  <action>
    New script iterates library_index (in 50-row batches, skipping
    orphaned rows). For each batch:
    - Read all rows.
    - Group by normalizedStem.
    - For each group, compute siblingsInCatalog = group size, then
      titleSpecificity per row.
    - Write back in a batched commit; include bondCorrectionHistory
      default if missing.
    Idempotent — second run produces no diff.
    Run against prod using the service account: `npx tsx
    scripts/backfill-title-specificity.ts`.
  </action>
  <verify>
    Spot-check: search_library({query:"hashkivenu"}) returns all
    rows with titleSpecificity populated and the score < 0.5.
    Run the script a second time; observe zero writes in the report.
  </verify>
</task>

<task type="manual">
  <name>Task 7: Update project_mcp_status.md memory and ship commit</name>
  <files>~/.claude/projects/C--Users-dsbog-centralreform-live/memory/project_mcp_status.md</files>
  <action>
    Append a "W-02 Trust calibration" wave entry to project_mcp_status.md:
    schema additions, scorer formula, ranking bias math, hint
    aggregation threshold. Bump tool count if any new MCP tool was
    added (Task 4 didn't add one — just expanded existing).
    Final commit message:
    "W-02 trust calibration: titleSpecificity + bondCorrectionHistory +
    titleContextHints — agent now reads catalog-side confidence signals"
    Push to master + ff-merge feat/mcp-server.
  </action>
  <verify>
    `git log -1 --stat` shows the expected files.
    Production: search_library returns the new envelope.
    Memory file updated and saved.
  </verify>
</task>

</tasks>

<verification>
## Phase-level verification

Run BEFORE marking the phase complete:

1. `npx tsc --noEmit` — zero errors.
2. `npx next build` — succeeds (catches Next.js App Router export
   violations per `feedback_nextjs_route_exports`).
3. `npx firebase emulators:exec --only firestore,auth "npx vitest run
   --config vitest.emulator.config.ts"` — all green.
4. Manual production probe:
   - `search_library({query: "hashkivenu"})` returns rows with
     `titleSpecificity` set, all `< 0.5`.
   - `search_library({query: "klepper"})` returns the specific
     arrangement with specificity `> 0.5`.
   - Upload a duplicate-stem chart via `import_chart_from_drive`
     (with `force: true`); verify both rows' specificity recomputed.
5. Memory updated; commit pushed to master + ff-merged to
   feat/mcp-server.

## What this phase does NOT do
- Does NOT populate composer/arranger values (that's W-03 §pass 3).
- Does NOT add the `record_bond_correction` MCP tool (that's W-01).
- Does NOT change agent prompts or tool descriptions beyond surfacing
  the new fields.
</verification>
