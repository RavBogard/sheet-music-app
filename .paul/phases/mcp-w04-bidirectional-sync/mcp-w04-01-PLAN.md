---
phase: mcp-w04-bidirectional-sync
plan: 01
type: feature
wave: 1
depends_on: []
files_modified:
  - src/lib/mcp/server-tracks-write.ts
  - src/lib/mcp/tools/setlist-write.ts
  - src/lib/mcp/tools/setlist-publish.ts
  - src/lib/setlist-write.ts
  - src/lib/mcp/tools/setlists.ts
  - src/lib/mcp/tools/index.ts
  - src/lib/mcp/tools/wait-for-setlist-change.ts
  - src/lib/mcp/error-envelopes.ts
  - src/lib/mcp/tools/sync.emulator.test.ts
autonomous: false
---

**SCOPE NOTE 2026-05-16:** W-04 was originally scoped as one phase plan but
the optimistic-concurrency refactor of 7 write paths is larger than fits in
one ship cleanly. This plan is now Plan **01 — Foundation** only:

- Version fields stamped on every write (additive, no checks yet).
- `bumpVersion` helper + error-envelopes module (consumed by 02 + 03).
- `wait_for_setlist_change` long-poll MCP tool (read-only — no write-path
  refactor).
- Version surfaced on `get_setlist` + `list_setlists` envelopes.

**Plan 02** — single-row write gating: `lastSeenVersion` rejection on
`update_track`, `update_setlist`, `remove_track`, `reorder_setlist`,
`delete_setlist`. E-002 envelope polish.

**Plan 03** — bulk + publish: `bulk_update_tracks` atomic pre-flight,
`publish_setlist` required version.

The 3 plans together ship the full W-04 surface. Plan 01 alone is safe to
ship today — existing callers see new `version` field on reads and are
unaffected (writes always succeed; no rejections yet).

<objective>
## Goal
Make concurrent setlist editing safe. Add optimistic concurrency
(`lastSeenVersion`) to every setlist + track write tool with a uniform
stale-rejection envelope and a recovery hint, and add a long-poll
`wait_for_setlist_change` MCP tool so the agent can observe changes
without polling. Real SSE / change-feed is explicitly deferred.

## Purpose
The Bar Mitzvah session (2026-05-16) saw concurrent edits from the rabbi
(web app, replacing rows) and the agent (MCP, patching the same rows)
produce silent `trackId` staleness and an unhelpful "Track not found"
error. With David Lazaroff onboarding as a 2nd band_leader, concurrent
authoring is no longer hypothetical. This phase is the concurrency
safety net beneath W-01's propose-then-confirm loop — without it, that
loop is racy.

The companion long-poll tool gives the agent observability without
inventing a streaming idiom MCP doesn't have a clean shape for yet.

## Output
- `setlists/{id}.version` and `setlists/{id}/tracks/{trackId}.version`
  fields, incremented atomically on every write.
- Every read tool (`get_setlist`, `list_setlists`,
  `search_library` — wait, that one's library, NOT here, ignore)
  surfaces the version.
- Seven write tools accept optional `lastSeenVersion` and reject stale
  writes with a uniform envelope.
- E-002 "Track not found" envelope folded in: now includes
  `setlistVersion`, `lastModifiedAt`, recovery hint.
- New MCP tool: `wait_for_setlist_change(setlistId, sinceVersion,
  timeoutSec?, includeFullState?)` — long-poll change observer.
- Bulk pre-flight read in `bulk_update_tracks` atomic mode (option (c)
  from W-04 §3 Q3): version-check all rows first, then apply.
- Emulator tests covering every stale-rejection path, bulk pre-flight,
  long-poll timeout + change detection + role gate.
- Updated `project_mcp_status.md` memory.
</objective>

<context>
## Project Context
@.paul/PROJECT.md
@.paul/research/w-plans/W-004-bidirectional-sync.md
@~/.claude/projects/C--Users-dsbog-centralreform-live/memory/project_mcp_status.md
@~/.claude/projects/C--Users-dsbog-centralreform-live/memory/feedback_admin_rate_limit_bypass.md
@~/.claude/projects/C--Users-dsbog-centralreform-live/memory/feedback_upload_atomicity.md

## Decisions baked in
- Track A optimistic concurrency: ships in this phase.
- Track B-cheap long-poll: ships in this phase (same plan).
- Track B-real SSE: deferred indefinitely — see W-04 §2.
- Per-row + setlist-level version both stored. update_track rejects on
  row-level. update_setlist + reorder_setlist reject on setlist-level.
- bulk_update_tracks atomic mode: pre-flight read of all versions, then
  apply (option (c)). Best-effort mode: skip stale rows, report.
- reorder_setlist accepts setlist.lastSeenVersion only, not per-row.
- publish_setlist requires lastSeenVersion (strict — see W-04 Q5).
- Version increment lives inside the existing Firestore transactions —
  no Firestore trigger.
- Backfill: missing version = 0; first write sets 1. No migration.
- lastSeenVersion is OPTIONAL on every tool — omit to preserve
  today's last-writer-wins behavior; HTTP callers and pre-W04 agent
  tool-call patterns keep working.

## Uniform rejection envelope
```
{
  error: "stale_version",
  message: "Setlist (or track) was modified by another writer.",
  currentVersion: <int>,
  lastSeenVersion: <int>,
  setlist: { lastModifiedBy: <uid>, lastModifiedAt: <iso> },
  hint: "Call get_setlist to refresh state and retry."
}
```
For bulk atomic: include `staleRows: [{trackId, currentVersion}]`.

## wait_for_setlist_change semantics
- Args: `{setlistId, sinceVersion, timeoutSec?: 30, includeFullState?: false}`.
- timeoutSec capped at 60 (Vercel function timeout headroom).
- Server attaches Firestore listener on the setlist doc + tracks
  subcollection. Returns immediately if version is already past
  sinceVersion.
- Auth: same gate as `get_setlist`.
- Rate-limit `api` tier with trusted-leader bypass per
  `feedback_admin_rate_limit_bypass`.
- Returns `{changed: false, currentVersion}` on timeout. On change,
  returns `{changed: true, currentVersion, changes: [...], setlist?}`
  where `setlist` is the full get_setlist payload only if
  `includeFullState: true`.

## Coordination
- W-04 will edit `src/lib/mcp/tools/server-tracks-write.ts` — the
  parallel session no longer owns this file as of 2026-05-16
  (b3f78850a stable). Confirm with Daniel before starting if the
  bug-stomp stress-test session has uncovered new work here.
- Companion to W-01 (consumer of `lastSeenVersion`). Sequence W-04
  AFTER W-02 + W-01 per the W-plan, OR concurrently if implementation
  capacity allows — they don't share files.
</context>

<skills>
## Required Skills
| Skill | Priority | When | Loaded? |
|-------|----------|------|---------|
| /ui-ux-pro-max | n/a | No UI | — |

## Pre-ship checklist
- [ ] `npx tsc --noEmit` clean.
- [ ] `npx next build` succeeds.
- [ ] Emulator suite green.
- [ ] Pull master before pushing (parallel-session coordination).
</skills>

<acceptance_criteria>

## AC-1: Version fields written atomically on every mutation
```gherkin
Given a setlist with version=3 and a track within it with version=2
When any write tool mutates the setlist or the track in a transaction
Then the affected doc's version increments by 1 atomically with the
  data mutation (single Firestore transaction)
And setlist-level mutations also stamp lastModifiedBy + lastModifiedAt
```

## AC-2: Stale-write rejection on update_track
```gherkin
Given a track at version=5 in setlist v=7
When the agent calls update_track with lastSeenVersion=4 on that track
Then the tool returns the stale_version envelope with currentVersion=5,
  lastSeenVersion=4, hint pointing at get_setlist
And the underlying Firestore doc is NOT mutated (version stays 5)
And rate-limit token is NOT consumed for stale rejections (cheap reads only)
```

## AC-3: bulk_update_tracks atomic pre-flight
```gherkin
Given a batch of 5 patches, four with valid lastSeenVersion and one stale
When bulk_update_tracks runs in mode: "atomic"
Then a single pre-flight read of all 5 tracks happens first
And the whole batch rejects with staleRows: [{trackId: <the stale one>,
  currentVersion}] and the four valid patches are NOT applied
And no Firestore writes are issued for any row
```

## AC-4: bulk_update_tracks best-effort skip
```gherkin
Given a batch of 5 patches, four with valid lastSeenVersion and one stale
When bulk_update_tracks runs in mode: "best-effort"
Then the four valid patches commit
And the stale row is reported in the response under skipped: [...] with
  reason: "stale_version", currentVersion, lastSeenVersion
And the four committed rows' versions increment by 1 each
```

## AC-5: Companion E-002 envelope on missing trackId
```gherkin
Given the agent calls update_track with a trackId that no longer
  exists in the setlist (deleted or never existed)
When the tool runs
Then it returns:
  error: "track_not_found",
  message: explaining,
  setlistVersion: <current>,
  setlistLastModifiedAt: <iso>,
  hint: "Track may have been deleted or replaced — call get_setlist."
```

## AC-6: wait_for_setlist_change returns on change
```gherkin
Given the agent calls wait_for_setlist_change({setlistId: "X",
  sinceVersion: 7, timeoutSec: 30})
When another writer mutates setlist X (version goes 7 → 8) before
  timeout fires
Then the call returns {changed: true, currentVersion: 8,
  changes: [{entity: "setlist"|"track", id, version, kind, by?, at}]}
And the change describes the actual mutation (kind = "update"/"insert"/"delete")
```

## AC-7: wait_for_setlist_change returns on timeout
```gherkin
Given the agent calls wait_for_setlist_change with timeoutSec=5 and
  no mutation occurs
When 5 seconds elapse
Then the call returns {changed: false, currentVersion: 7}
And the Firestore listener detaches (no orphaned subscriptions)
```

## AC-8: publish_setlist requires lastSeenVersion (strict mode)
```gherkin
Given the agent calls publish_setlist({setlistId, lastSeenVersion: 9})
  but the current setlist version is 10
When publish_setlist runs
Then it returns the stale_version envelope and does NOT dispatch any
  notifications
And the snapshot is not written
```

## AC-9: project_mcp_status.md memory updated
```gherkin
Given this phase ships
When commits land
Then project_mcp_status.md gains a W-04 entry capturing version
  semantics, the rejection envelope shape, wait_for_setlist_change,
  and explicit deferral of Track B-real SSE
And the tool count increments by 1 (wait_for_setlist_change)
```

</acceptance_criteria>

<tasks>

<task type="auto">
  <name>Task 1: Add version fields + increment helper</name>
  <files>src/lib/mcp/tools/server-tracks-write.ts, src/lib/mcp/tools/server-setlists.ts, src/lib/mcp/error-envelopes.ts</files>
  <action>
    Add a `bumpVersion(tx, ref)` helper that reads current version
    inside the transaction and writes version+1 + lastModifiedAt + by
    on the same write. Apply to every Firestore transaction in the 7
    write tools.
    Add error-envelopes.ts (new file): exports `staleVersionEnvelope`,
    `trackNotFoundEnvelope`, with the shapes documented in <context>.
  </action>
  <verify>
    tsc --noEmit clean. Existing emulator suite passes (versions are
    written even when nobody reads them).
  </verify>
</task>

<task type="auto">
  <name>Task 2: lastSeenVersion gating on all 7 write tools</name>
  <files>src/lib/mcp/tools/server-tracks-write.ts, src/lib/mcp/tools/server-setlists.ts, src/lib/mcp/tools/index.ts</files>
  <action>
    Add optional `lastSeenVersion: number` to schemas of:
    update_setlist, update_track, bulk_update_tracks (per-patch),
    reorder_setlist, remove_track, delete_setlist, publish_setlist.
    Inside each tool's transaction: if lastSeenVersion supplied AND
    current version differs, return staleVersionEnvelope WITHOUT
    consuming rate-limit tokens.
    publish_setlist: lastSeenVersion is REQUIRED when called from MCP
    (per Q5 decision). Existing HTTP callers don't change.
  </action>
  <verify>
    Emulator tests AC-2 + AC-8 pass.
  </verify>
</task>

<task type="auto">
  <name>Task 3: bulk_update_tracks atomic pre-flight</name>
  <files>src/lib/mcp/tools/server-tracks-write.ts</files>
  <action>
    Refactor bulk_update_tracks atomic mode: pre-flight read of all
    target tracks inside the transaction's first phase. If any
    lastSeenVersion mismatch, abort with staleRows: [...]. If all
    pass, apply patches. Best-effort mode: skip stale rows, report
    under skipped: [].
  </action>
  <verify>
    AC-3 + AC-4 emulator tests.
  </verify>
</task>

<task type="auto">
  <name>Task 4: E-002 track-not-found envelope polish</name>
  <files>src/lib/mcp/tools/server-tracks-write.ts, src/lib/mcp/error-envelopes.ts</files>
  <action>
    update_track + bulk_update_tracks + remove_track: when the
    target trackId does not exist, return trackNotFoundEnvelope
    including the current setlist version + lastModifiedAt + hint.
  </action>
  <verify>
    AC-5 emulator test.
  </verify>
</task>

<task type="auto">
  <name>Task 5: wait_for_setlist_change MCP tool</name>
  <files>src/lib/mcp/tools/wait-for-setlist-change.ts (new), src/lib/mcp/tools/index.ts, src/lib/mcp/tools/sync.emulator.test.ts</files>
  <action>
    New tool. Schema: {setlistId, sinceVersion, timeoutSec?: 30,
    includeFullState?: false}. timeoutSec clamped to 60.
    Implementation: attach a Firestore listener on the setlist doc +
    a query listener on its tracks subcollection. Race with a
    setTimeout. First-fire wins. Always detach both listeners on exit.
    If currentVersion > sinceVersion at attach time, return
    immediately.
    Auth: same gate as get_setlist (admin / band_leader / has-bus).
    Rate-limit `api` tier with trusted-leader bypass.
    Description: "Long-poll setlist change observer. Returns as soon
    as the setlist version moves past sinceVersion, or after timeoutSec
    seconds with no change. Use to passively await concurrent edits
    from the web app or another agent. Max timeoutSec = 60; chain
    calls for longer waits."
  </action>
  <verify>
    AC-6 + AC-7 emulator tests. Manual probe against staging:
    open one terminal calling wait_for_setlist_change(sinceVersion:
    current), another mutating the setlist; first call returns
    within ~1s with the change.
  </verify>
</task>

<task type="auto">
  <name>Task 6: get_setlist + list_setlists surface version</name>
  <files>src/lib/mcp/tools/server-tracks-read.ts, src/lib/mcp/tools/index.ts</files>
  <action>
    Extend response envelopes: get_setlist returns
    `{setlist: {..., version}, tracks: [{..., version}]}`.
    list_setlists returns `version` per row.
    Update tool descriptions to mention that the version is the
    `lastSeenVersion` to pass on subsequent writes for optimistic
    concurrency.
  </action>
  <verify>
    Emulator pass; manual probe shows version on every read.
  </verify>
</task>

<task type="manual">
  <name>Task 7: Update memory + ship</name>
  <files>~/.claude/projects/C--Users-dsbog-centralreform-live/memory/project_mcp_status.md</files>
  <action>
    Append "W-04 Bidirectional sync" wave entry: version semantics,
    stale-rejection envelope, wait_for_setlist_change. Bump tool
    count to 36 (one new tool). Note explicit deferral of Track
    B-real SSE.
    Commit message: "W-04 optimistic concurrency + wait_for_setlist_change
    — concurrent edits no longer silently produce stale-trackId failures"
    Push master + ff-merge feat/mcp-server.
  </action>
  <verify>
    Memory updated. git log -1 --stat clean. Production probe:
    get_setlist returns version field; update_track with stale
    lastSeenVersion returns stale_version envelope.
  </verify>
</task>

</tasks>

<verification>
1. tsc + next build + emulator suite all green.
2. Production probe: get_setlist returns version; intentional stale
   write returns the documented envelope; wait_for_setlist_change
   returns within 1s of a concurrent mutation.
3. Memory updated; commits pushed; both branches ff-equal.

## NOT in scope
- Real SSE (`subscribe_setlist_changes`). Deferred per W-04 §2.
- Browser-side useSetlist passing lastSeenVersion. Deferred (W-04 Q8).
- S-002 order-numbering invariant. Adjacent issue; separate phase if
  Daniel calls it in.
</verification>
