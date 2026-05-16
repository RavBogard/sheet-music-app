---
phase: mcp-w03-library-hygiene
plan: 01
type: maintenance
wave: 1
depends_on:
  - mcp-w02-trust-calibration
files_modified:
  - src/lib/mcp/tools/sweep-library-orphans.ts
  - src/lib/mcp/tools/dedup-library-by-sha.ts
  - src/lib/mcp/tools/update-library-entry.ts
  - src/lib/mcp/tools/index.ts
  - scripts/hash-sweep.ts
  - .paul/phases/mcp-w03-library-hygiene/OPERATIONS.md
  - src/lib/mcp/tools/library-hygiene.emulator.test.ts
autonomous: false
---

<objective>
## Goal
One-time hygiene pass to bring the library from "the rabbi keeps
bonding to orphans and duplicates" to "the rabbi can trust catalog
results". Four sequenced passes: orphan sweep → SHA dedup →
enrichment campaign (Daniel's content work) → ID canonicalization
(deferred). Ships three new MCP tools + a one-time hash-sweep script
+ an operations playbook.

## Purpose
The Bar Mitzvah session showed library quality is the bottleneck —
orphans, duplicates, and generic titles caused most of the round-trip
failures. Tactical fixes (today's shipped commits) added the
machinery (orphan-status, render-verify, atomic upload SHA) but
didn't operate it across the existing ~500 catalog rows. W-03 is the
operational playbook that runs the cleanup.

This phase is mostly orchestration tooling — passes 1 and 2 are
fully automated; pass 3 is Daniel's content time gated on the new
`update_library_entry` MCP tool; pass 4 is explicitly deferred.

## Output
- New MCP tool `sweep_library_orphans({collection?, dryRun?})` —
  iterates library_index, HEAD-probes via `getChartHealth`, marks
  `status: "orphaned"` for `missing` (never `unreachable`).
- New MCP tool `dedup_library_by_sha({collection?, dryRun?, commit?})` —
  groups by Storage object SHA, returns clusters, applies canonical
  selection + bonded-track redirects when called with commit: true.
- New MCP tool `update_library_entry({fileId, patch})` — admin-only,
  patches free-text fields (composer, arranger, notationSource,
  title, displayName). Bumps version-style lastEditedAt.
- One-time script `scripts/hash-sweep.ts` — computes Storage object
  SHA for pre-`f650d94f0` rows that lack one; idempotent.
- `OPERATIONS.md` playbook in this phase folder describing the run
  order, expected outputs, checkpoint pauses for Daniel review, and
  rollback procedures.
- Emulator tests for sweep_library_orphans + dedup_library_by_sha
  (cluster grouping, canonical pick, redirect math, dryRun safety).
- Updated `project_mcp_status.md` memory.
</objective>

<context>
## Project Context
@.paul/PROJECT.md
@.paul/research/w-plans/W-003-library-hygiene.md
@~/.claude/projects/C--Users-dsbog-centralreform-live/memory/project_mcp_status.md
@~/.claude/projects/C--Users-dsbog-centralreform-live/memory/feedback_upload_atomicity.md

## Decisions baked in (Daniel 2026-05-16)
- Dedup canonical tiebreaker: most-recently-used in a setlist
  (preserves what the band has seen).
- Orphan retention: keep visible in
  `list_library({includeOrphaned: true})` indefinitely as audit
  trail. Hard-delete deferred.
- Tombstone for dedup losers: redirect for ≥30 days; quiet delete
  later.
- Bonded-track redirect on dedup: automated for past-event setlists
  (eventDate < today); supervised (return diff + require explicit
  confirm) for upcoming setlists.
- Cadence: nightly orphan sweep + on every upload event.
- Pass 4 ID canonicalization: deferred — no engineering work in W-03.
- update_library_entry: in scope (Q7 answer is "build it" since
  the in-app UI is no longer Daniel's path).
- Pass 3 enrichment includes composer/arranger fields from W-02
  schema; Daniel populates them via update_library_entry during
  the enrichment campaign. Bundle the open-and-edit step.

## Pass order with checkpoints
1. **Pass 1 — Orphan sweep.** Automated. Run sweep_library_orphans
   in dryRun mode first, share the orphan list with Daniel, then
   re-run with commit. ~5 min.
2. **Pass 2 — Hash-sweep backfill.** Automated. Run hash-sweep.ts
   for rows pre-f650d94f0 lacking storageSha. ~10 min depending
   on Storage object count.
3. **Pass 3 — SHA dedup.** Automated. Run dedup_library_by_sha
   in dryRun, share clusters + canonical picks with Daniel,
   re-run with commit. Bonded-track redirects auto-apply for
   past setlists; supervised for upcoming.
4. **Pass 4 — Enrichment campaign.** Daniel content work over a
   week. Worklist = library_index where titleSpecificity < 0.5
   (from W-02). Daniel uses update_library_entry from Claude Desktop.
5. **Pass 5 — ID canonicalization.** DEFERRED. No work here.

## Coordination
- Hard dependency on mcp-w02 (titleSpecificity needed for pass 4
  worklist).
- No code overlap with parallel session's tactical-fix files.
- Engineering work batched (~1.5–2 days). Daniel's content time
  is separate — ~1–2 hours spread over a week.
</context>

<skills>
| Skill | Priority | When | Loaded? |
|-------|----------|------|---------|
| /ui-ux-pro-max | n/a | No UI | — |

- [ ] tsc + next build clean.
- [ ] Emulator suite green.
- [ ] Run sweep + dedup in dryRun first; pause for Daniel review.
</skills>

<acceptance_criteria>

## AC-1: sweep_library_orphans marks missing rows
```gherkin
Given the library_index contains 10 rows; 3 of their Storage objects
  are 404 and the other 7 are reachable
When sweep_library_orphans({dryRun: false}) is called
Then the 3 unreachable rows are marked status: "orphaned"
And the other 7 are untouched
And the response envelope reports {checked: 10, markedOrphaned: 3,
  alreadyOrphaned: 0, transient: 0}
And rows that returned "unreachable" (5xx, timeout) are NOT marked
  — only confirmed missing (404).
```

## AC-2: dedup_library_by_sha clusters + picks canonical
```gherkin
Given two library_index rows pointing to the same Storage object
  (identical SHA) — one last-used 2024-03-01, one last-used
  2026-05-09
When dedup_library_by_sha({dryRun: false, commit: true}) is called
Then the more-recently-used row is selected as canonical (the
  2026-05-09 one per Daniel's tiebreaker decision)
And the other row is marked status: "duplicate" with
  redirectsTo: <canonical fileId>
And any setlist tracks bonded to the duplicate are updated to bond
  to the canonical (automated for past setlists, supervised for
  upcoming)
```

## AC-3: dedup preserves rollback
```gherkin
Given a dedup run marked 5 rows as duplicate with redirectsTo
When 14 days later Daniel wants to undo
Then the duplicate rows still exist with their redirectsTo + original
  fileId; restoring them to status: "active" is a single
  update_library_entry call per row
And bonded-track redirects are reversible via update_track patches
  (recorded in dedup audit log)
```

## AC-4: update_library_entry patches free-text fields
```gherkin
Given an admin/band_leader calls
  update_library_entry({fileId: "abc", patch: {composer: "Klepper",
  arranger: "Freelander", title: "Hashkivenu (Klepper-Freelander)"}})
When the tool runs
Then library_index/abc has the three fields updated
And the row's titleSpecificity is recomputed (because title changed)
And sibling specificity is cascade-recomputed (per W-02's hook)
And the response is the updated library_index entry
```

## AC-5: Hash-sweep backfill is idempotent
```gherkin
Given pre-f650d94f0 library_index rows lack storageSha
When scripts/hash-sweep.ts runs
Then every row gets storageSha populated (computed from the Storage object)
And running the script a SECOND time produces zero writes
And orphaned rows are skipped (no Storage object to read)
```

## AC-6: Operations playbook covers the run order
```gherkin
Given .paul/phases/mcp-w03-library-hygiene/OPERATIONS.md exists
When read end-to-end
Then it covers: pre-run dryRun + Daniel review for each pass,
  expected output shapes, rollback procedures (especially for
  dedup), Daniel checkpoint pause points, and the worklist
  derivation for pass 4 enrichment
```

</acceptance_criteria>

<tasks>

<task type="auto">
  <name>Task 1: sweep_library_orphans MCP tool</name>
  <files>src/lib/mcp/tools/sweep-library-orphans.ts (new), src/lib/mcp/tools/index.ts</files>
  <action>
    Iterate library_index in batches of 50 (skip already-orphaned).
    For each: call getChartHealth(fileId, mimeType). On "missing":
    mark status: "orphaned" + orphanedAt. On "unreachable" or
    transient errors: do NOT mark — log + continue. On "ok": no-op.
    Args: {collection?: "core"|"supplemental"|"uploads", dryRun?:
    boolean}. Default dryRun = true (safety).
    Auth: admin-only (destructive marking).
    Rate-limit: api tier with trusted-leader bypass.
  </action>
  <verify>AC-1 emulator test.</verify>
</task>

<task type="auto">
  <name>Task 2: hash-sweep one-time script</name>
  <files>scripts/hash-sweep.ts (new)</files>
  <action>
    For every library_index row where storageSha is missing AND
    status !== "orphaned": read the Storage object bytes,
    compute SHA-256, write back. Batched 50/sec. Resumable
    (skip rows that already have storageSha). Service-account
    credentials.
    Run command: npx tsx scripts/hash-sweep.ts --project crcmusiccharts
  </action>
  <verify>AC-5 — run, then re-run and observe zero writes.</verify>
</task>

<task type="auto">
  <name>Task 3: dedup_library_by_sha MCP tool</name>
  <files>src/lib/mcp/tools/dedup-library-by-sha.ts (new), src/lib/mcp/tools/index.ts</files>
  <action>
    Query library_index where storageSha != null. Group by SHA.
    For each cluster size > 1:
    - Select canonical = row with most-recent lastUsedInSetlist.eventDate
      (fallback: oldest createdAt if no usage data).
    - Mark non-canonical rows status: "duplicate" + redirectsTo: canonical fileId.
    - For each bonded track in any setlist pointing at a duplicate:
      - If setlist.eventDate < today: auto-update via update_track
        (single transaction per setlist).
      - Else: collect into supervisedRedirects: [...] for the response;
        do NOT mutate.
    Args: {collection?, dryRun?: true, commit?: false}.
    On commit: true AND dryRun: false: apply.
    Auth: admin-only.
    Audit log: write a dedup_runs/{runId} doc capturing the full
    cluster + canonical pick + redirect list (rollback support).
  </action>
  <verify>AC-2 + AC-3 emulator tests.</verify>
</task>

<task type="auto">
  <name>Task 4: update_library_entry MCP tool</name>
  <files>src/lib/mcp/tools/update-library-entry.ts (new), src/lib/mcp/tools/index.ts</files>
  <action>
    Args: {fileId, patch: {title?, displayName?, composer?, arranger?,
    notationSource?, key?, bpm?, tags?}}.
    Validates field types. Writes patch to library_index/{fileId}.
    If title changed: recompute titleSpecificity + trigger W-02's
    sibling cascade (factor the cascade helper out of library-upload.ts
    into a shared module if needed).
    Auth: admin OR band_leader (writes to curated catalogs allowed
    per `9f737cc7` widening).
    Rate-limit: api tier with trusted-leader bypass.
  </action>
  <verify>AC-4 emulator test.</verify>
</task>

<task type="manual">
  <name>Task 5: Write OPERATIONS.md playbook</name>
  <files>.paul/phases/mcp-w03-library-hygiene/OPERATIONS.md (new)</files>
  <action>
    Document the run order:
    1. Sweep orphans (dryRun) → review with Daniel → commit.
    2. hash-sweep.ts → run once.
    3. Dedup (dryRun) → review clusters with Daniel → commit
       (auto past, supervised upcoming).
    4. Enrichment: pass library_index where titleSpecificity < 0.5
       to Daniel as a worklist; he edits via update_library_entry
       from Claude Desktop over the next week.
    5. (Deferred) ID canonicalization.
    Include rollback procedures: how to undo a dedup run via
    dedup_runs/{runId} audit log; how to un-orphan a row.
    Include expected output shapes from each tool.
  </action>
  <verify>AC-6 — read end-to-end, all listed elements present.</verify>
</task>

<task type="manual">
  <name>Task 6: Run passes 1 + 2 + 3 against production (with Daniel checkpoints)</name>
  <files>(no file changes — operational)</files>
  <action>
    DO NOT START until Daniel says go. Run sequence:
    a. sweep_library_orphans({dryRun: true}) → share list with Daniel.
       Wait for "proceed" → run with dryRun: false.
    b. npx tsx scripts/hash-sweep.ts → run to completion.
    c. dedup_library_by_sha({dryRun: true}) → share clusters with
       Daniel. Wait for "proceed" → run with commit: true.
    d. Pull the supervisedRedirects list, walk through with Daniel,
       apply individual update_track calls as approved.
    Append a HUMAN-VERIFY checkpoint to .paul/UAT-PENDING.md per
    `feedback_uat_checklist`: "W-03 hygiene pass: verify random
    sample of orphan markings + dedup canonicals are correct".
  </action>
  <verify>
    list_library({collection: "core"}) shows reduced cardinality
    (duplicates collapsed). Random sample of bonded tracks in
    upcoming setlists still renders. Orphan list matches Daniel's
    expectations.
  </verify>
</task>

<task type="manual">
  <name>Task 7: Memory + ship</name>
  <files>~/.claude/projects/C--Users-dsbog-centralreform-live/memory/project_mcp_status.md</files>
  <action>
    Append "W-03 Library hygiene" wave entry: 3 new tools, the
    OPERATIONS.md playbook, the run results (rows orphaned, clusters
    deduped). Tool count → +3 from prior.
    Commit message: "W-03 library hygiene tooling: sweep_library_orphans
    + dedup_library_by_sha + update_library_entry + operations playbook"
    Push master + ff-merge feat/mcp-server.
  </action>
  <verify>Memory updated. Production probe of the three new tools.</verify>
</task>

</tasks>

<verification>
1. tsc + next build + emulator suite green.
2. Production: sweep + dedup ran with Daniel's approval; orphan
   count matches dry-run; bonded tracks in upcoming setlists still
   work.
3. Pass 4 enrichment kicked off (Daniel's content work; ongoing).
4. Memory updated; commits pushed.

## NOT in scope
- Pass 5 ID canonicalization.
- Daniel's actual enrichment of composer/arranger fields (his work,
  spread over the next week).
- Restoring orphaned rows to "active" (manual via update_library_entry
  case by case).
</verification>
