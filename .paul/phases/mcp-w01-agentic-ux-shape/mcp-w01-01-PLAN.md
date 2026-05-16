---
phase: mcp-w01-agentic-ux-shape
plan: 01
type: feature
wave: 1
depends_on:
  - mcp-w02-trust-calibration
files_modified:
  - src/lib/mcp/tools/propose-changes.ts
  - src/lib/mcp/tools/bond-corrections.ts
  - src/lib/mcp/tools/preview-publish.ts
  - src/lib/mcp/tools/index.ts
  - src/lib/mcp/server.ts
  - .paul/AGENT-GUIDE.md
  - src/lib/mcp/tools/ux.emulator.test.ts
autonomous: false
---

<objective>
## Goal
Ship the chat-native propose → confirm → commit loop that turns the agent
from "fast typist" into "trustworthy collaborator", plus the
learning/self-healing loop that records rabbi corrections as structured
signals back into the catalog. Adds three new MCP tools, one
agent-conventions doc, and surface for the `bond_corrections` collection
that W-02's Cloud Function consumes.

## Purpose
W-02 puts the data (specificity, render-status, sibling counts) into
search results. W-01 is the experience layer that uses it: when to ask
vs. proceed, how to stage a multi-row proposal, how to confirm before
publish, how to record the rabbi's corrections so the system learns
from this week's mistakes by next week.

Daniel's framing 2026-05-16: "Claude as the main backend for the
website, at least when it comes to setlist generation." The in-app
edit tools stay available for ad-hoc quick fixes but are explicitly
NOT the primary surface.

## Output
- New MCP tool `propose_setlist_changes(setlistId, proposals[],
  ttlSec?)` — stages a batch, returns a summary envelope with
  per-proposal confidence (from W-02 specificity), render-health,
  flag status. Stage lives in `proposal_stages/{stageId}` with TTL
  default 600s. NO writes against setlists yet.
- New MCP tool `commit_staged_changes(stageId, lastSeenVersion)` —
  atomically applies the stage. Uses W-04's optimistic concurrency.
- New MCP tool `preview_publish(setlistId)` — thin wrapper over the
  existing `publish_setlist({dryRun: true})` envelope, formatted for
  the confirm-before-send loop: chart-verify summary + audience count
  + snapshot diff vs. last publish + total flagged bonds awaiting
  review.
- New MCP tool `flag_bond(setlistId, trackId, reason)` — marks a row
  for batch review at end of authoring.
- New MCP tool `review_flagged_bonds(setlistId)` — returns all flagged
  rows in the setlist with their current bond + alternatives ranked
  by W-02 signals.
- New MCP tool `record_bond_correction(setlistId, trackId, fromSongId,
  toSongId, reason?)` — writes a `bond_corrections/{id}` doc that
  W-02's Cloud Function aggregates into `titleContextHints`, plus
  bumps `library_index.{fromSongId}.bondCorrectionHistory.correctedAwayFrom`
  and `.{toSongId}.bondCorrectionHistory.correctedTo`.
- New `.paul/AGENT-GUIDE.md` — agent-side conventions for when to
  ask, how to surface confidence, how to format proposals. Injected
  into the MCP server's `instructions` block.
- Emulator tests covering the stage/commit lifecycle, TTL expiry,
  cross-setlist guards, learning-signal writes, flag/review round-trip.
- Updated `project_mcp_status.md` memory.
</objective>

<context>
## Project Context
@.paul/PROJECT.md
@.paul/research/w-plans/W-001-agentic-ux-shape.md
@.paul/research/w-plans/W-002-trust-calibration.md
@~/.claude/projects/C--Users-dsbog-centralreform-live/memory/project_mcp_status.md
@~/.claude/projects/C--Users-dsbog-centralreform-live/memory/feedback_learning_self_healing.md
@~/.claude/projects/C--Users-dsbog-centralreform-live/memory/user_mcp_is_primary_author_workflow.md

## Decisions baked in (Daniel 2026-05-16)
- Confirm step is chat-native — NO web review pages.
- Low-confidence bonds default to commit-and-flag + batch review.
  True zero-info bonds (no search hit, fabricated songId) hard-stop.
- The flag/review/correction loop is the system's training signal —
  learning is deterministic counter-aggregation, NOT ML.
- Threshold for "low confidence": specificity `< 0.5` from W-02
  (single source of truth in `title-specificity.ts`).

## Compact summary envelope shape (for the preview/proposal tools)
The agent will read these into a chat response and present to Daniel.
Goal: short enough to fit in a chat message without burying signal.

```
{
  stageId: <uuid>,
  setlistId,
  proposals: [
    {
      action: "add" | "update" | "remove" | "reorder",
      index, trackId?,
      songId?, title?, key?, position?,
      confidence: "high" | "medium" | "low",   // derived from specificity
      flags: ["generic_title", "orphan_risk", "no_render_check"],
      explanation: "single liturgical match, no arrangement disambiguator"
    },
    ...
  ],
  summary: { high: N, medium: M, low: K, flagged: F },
  ttlExpiresAt: <iso>
}
```

## Learning-loop data flow
1. Agent commits a flagged bond.
2. Rabbi reviews batch via `review_flagged_bonds`.
3. For each correction, agent calls `record_bond_correction(...)`.
4. record_bond_correction writes to `bond_corrections/{id}` AND bumps
   counters on `library_index.{songId}.bondCorrectionHistory`.
5. W-02's Cloud Function `aggregateContextHints` fires on the new
   bond_corrections doc, updates `titleContextHints` after N=3
   consistent picks.
6. Next time the agent searches, ranking bias + hint boost surface
   the rabbi-preferred entry first.

## Coordination
- Hard dependency on mcp-w02 — specificity scores and
  bond_corrections schema must exist before this phase ships.
- Soft dependency on mcp-w04 — `commit_staged_changes` should pass
  `lastSeenVersion` to the underlying writes for race safety. If
  W-04 hasn't shipped yet, document it as a known race window and
  ship anyway; retrofit later.
- No code overlap with the parallel session's tactical-fix files;
  all new tools live in new files.
</context>

<skills>
| Skill | Priority | When | Loaded? |
|-------|----------|------|---------|
| /ui-ux-pro-max | n/a | No UI | — |

- [ ] tsc + next build clean before claim of done.
- [ ] Emulator suite green.
</skills>

<acceptance_criteria>

## AC-1: propose_setlist_changes stages without writing setlist
```gherkin
Given a setlist X with 10 tracks
When the agent calls propose_setlist_changes({setlistId: X,
  proposals: [<5 changes>]})
Then proposal_stages/{stageId} is created with the proposals + ttl
And setlists/X and its tracks subcollection are UNCHANGED
And the response envelope contains per-proposal confidence,
  flags, and the summary counts
```

## AC-2: commit_staged_changes applies atomically
```gherkin
Given a stage exists with 5 proposals against setlist X v=7
When commit_staged_changes({stageId, lastSeenVersion: 7}) runs
Then all 5 proposals are applied in one Firestore transaction
And setlist X's version is now 8
And the stage doc is deleted (one-shot)
And the response is the post-commit get_setlist envelope
```

## AC-3: Commit rejects if setlist drifted past lastSeenVersion
```gherkin
Given a stage exists with proposals against setlist X v=7
And after the stage was created, setlist X is mutated to v=9
When commit_staged_changes({stageId, lastSeenVersion: 7}) runs
Then it returns the stale_version envelope from W-04
And no proposals are applied
And the stage doc is NOT deleted (caller may re-fetch state and re-stage)
```

## AC-4: Stage expires after TTL
```gherkin
Given a stage was created 10 minutes ago with ttlSec=600
When commit_staged_changes({stageId}) runs after expiry
Then it returns {error: "stage_expired", expiredAt}
And the stage doc is cleaned up by the next read (or a Cloud Function
  sweep)
```

## AC-5: preview_publish formats the dryRun envelope
```gherkin
Given a setlist with 10 bonded tracks and 17 band recipients
When the agent calls preview_publish({setlistId})
Then it calls publish_setlist({dryRun: true}) internally and reformats
  the response to:
  {
    chartHealth: {ok: N, missing: M, unreachable: K, details: [...]},
    audience: {count, breakdown: {admin, band_leader, musician, member}},
    snapshotDiff: {addedTracks, removedTracks, modifiedTracks},
    flaggedBonds: F,
    recommendation: "publish" | "review_first" | "hard_block"
  }
```

## AC-6: Flag/review/correction round-trip
```gherkin
Given setlist X has track T bonded to songId A
When the agent calls flag_bond({setlistId: X, trackId: T, reason: "generic title, only result"})
And later review_flagged_bonds({setlistId: X})
Then the response lists T with reason and 5 alternative songIds ranked
  by W-02 signals
When the rabbi picks alternative B and the agent calls
  record_bond_correction({setlistId: X, trackId: T, fromSongId: A, toSongId: B, reason: "wrong arrangement"})
Then bond_corrections/{id} is written
And library_index.A.bondCorrectionHistory.correctedAwayFrom increments by 1
And library_index.B.bondCorrectionHistory.correctedTo increments by 1
```

## AC-7: AGENT-GUIDE.md content + MCP server instructions injection
```gherkin
Given .paul/AGENT-GUIDE.md exists
When the MCP server initializes
Then the contents of AGENT-GUIDE.md are injected into the server's
  `instructions` field (visible to Claude Desktop on connect)
And the guide covers: when to ask vs. proceed (specificity < 0.5),
  how to format proposals, when to flag, the batch-review pattern,
  and the propose → confirm → commit loop with concrete examples
```

## AC-8: Memory + ship
```gherkin
Given this phase ships
When commits land
Then project_mcp_status.md gains a W-01 entry naming the 5 new tools,
  the AGENT-GUIDE.md doc, and the learning-loop data flow
And tool count bumps from 36 (post-W-04) to 41
```

</acceptance_criteria>

<tasks>

<task type="auto">
  <name>Task 1: Stage schema + propose_setlist_changes tool</name>
  <files>src/lib/mcp/tools/propose-changes.ts (new), src/lib/mcp/tools/index.ts, firestore.rules</files>
  <action>
    New collection: proposal_stages. Rules: write only via MCP service
    account, read for admin + band_leader.
    Tool propose_setlist_changes: validates each proposal, computes
    per-proposal confidence from W-02's specificity + flags
    (generic_title when specificity < 0.5; orphan_risk when songId's
    library_index.status === "orphaned"; no_render_check when
    fileHealthy !== true). Writes stage doc. Returns summary envelope.
  </action>
  <verify>AC-1 emulator test.</verify>
</task>

<task type="auto">
  <name>Task 2: commit_staged_changes + TTL expiry</name>
  <files>src/lib/mcp/tools/propose-changes.ts, src/lib/mcp/tools/index.ts</files>
  <action>
    Tool commit_staged_changes: reads the stage, applies every proposal
    in a single Firestore transaction. Uses W-04's bumpVersion helper
    + lastSeenVersion check. Deletes stage on success.
    Stage TTL: checked at commit time. Cleanup: a daily Cloud Function
    sweeps stages older than 24h (avoids unbounded growth).
  </action>
  <verify>AC-2, AC-3, AC-4 emulator tests.</verify>
</task>

<task type="auto">
  <name>Task 3: preview_publish wrapper</name>
  <files>src/lib/mcp/tools/preview-publish.ts (new), src/lib/mcp/tools/index.ts</files>
  <action>
    Tool preview_publish: calls publish_setlist with dryRun: true,
    reformats. Also queries flagged-bonds count for the setlist
    (Task 4's collection). Recommendation derivation: hard_block if
    any chart status === "missing" AND no force flag; review_first
    if flaggedBonds > 0; else publish.
  </action>
  <verify>AC-5 emulator test.</verify>
</task>

<task type="auto">
  <name>Task 4: flag_bond + review_flagged_bonds</name>
  <files>src/lib/mcp/tools/bond-corrections.ts (new), src/lib/mcp/tools/index.ts, firestore.rules</files>
  <action>
    New collection: bond_flags/{setlistId_trackId} with reason,
    flaggedAt, flaggedBy.
    flag_bond: upsert the flag doc. review_flagged_bonds: list all
    flags for setlistId, joined with the current track state and 5
    alternative songIds from search_library ranked by W-02 signals.
  </action>
  <verify>AC-6 round-trip (first half).</verify>
</task>

<task type="auto">
  <name>Task 5: record_bond_correction tool</name>
  <files>src/lib/mcp/tools/bond-corrections.ts, src/lib/mcp/tools/index.ts, firestore.rules</files>
  <action>
    record_bond_correction: writes bond_corrections/{id} doc with
    {setlistId, trackId, fromSongId, toSongId, reason, contextKey
    derived from setlist.templateType, correctedAt, correctedBy}.
    Same write transaction: increment library_index.{fromSongId}.
    bondCorrectionHistory.correctedAwayFrom and library_index.
    {toSongId}.bondCorrectionHistory.correctedTo. Set
    lastCorrectionAt on both.
    Also deletes bond_flags/{setlistId_trackId} on success.
    W-02's Cloud Function picks up the new bond_corrections doc and
    aggregates into titleContextHints — no code from this phase
    triggers it directly.
  </action>
  <verify>
    AC-6 round-trip end-to-end. Verify library_index counter writes
    and the Cloud Function fires on the new doc.
  </verify>
</task>

<task type="auto">
  <name>Task 6: AGENT-GUIDE.md + MCP server instructions injection</name>
  <files>.paul/AGENT-GUIDE.md (new), src/lib/mcp/server.ts</files>
  <action>
    Write AGENT-GUIDE.md covering:
    - When to ask vs. proceed: specificity < 0.5 + sibling count > 1
      → ask; otherwise commit-and-flag.
    - How to format a proposal in chat: tabular summary, confidence
      column, total flagged count.
    - Batch review pattern: at end of authoring, call
      review_flagged_bonds, walk through each, record corrections.
    - Concrete examples (good + bad), referencing the Bar Mitzvah
      session as the canonical failure mode.
    Modify src/lib/mcp/server.ts: read AGENT-GUIDE.md content at
    startup, append to the MCP server's `instructions` block.
  </action>
  <verify>
    MCP discovery endpoint (or Claude Desktop reconnect) shows the
    guide content in the server instructions.
  </verify>
</task>

<task type="manual">
  <name>Task 7: Memory + ship</name>
  <files>~/.claude/projects/C--Users-dsbog-centralreform-live/memory/project_mcp_status.md</files>
  <action>
    Append "W-01 Agentic UX shape" wave entry: 5 new tools, the
    AGENT-GUIDE.md doc, the learning-loop diagram from this plan's
    <context>. Tool count → 41.
    Commit message: "W-01 propose-then-confirm + learning loop —
    chat-native agentic UX shape for the MCP-first weekly flow"
    Push master + ff-merge feat/mcp-server.
  </action>
  <verify>Memory updated; production probe of all 5 new tools.</verify>
</task>

</tasks>

<verification>
1. tsc + next build + emulator suite green.
2. End-to-end probe: stage a 5-row proposal, confirm, commit;
   verify version increment; flag one bond; review; record a
   correction; verify counters incremented and W-02's hint
   aggregation fires.
3. Memory updated; commits pushed; branches ff-equal.

## NOT in scope
- Specificity scoring itself (W-02).
- Optimistic concurrency (W-04).
- W-03 hygiene operations.
</verification>
