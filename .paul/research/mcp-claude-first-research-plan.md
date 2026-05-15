# MCP Claude-First Eval — My-Side Research Plan

**Date:** 2026-05-15
**Author:** Claude Opus 4.7 (this conversation)
**Sibling artifact:** `.paul/research/mcp-claude-first-cowork-PROMPT.md` (prompt for cowork-Claude)
**Merge target:** `.paul/research/mcp-claude-first-SYNTHESIS.md` (produced once cowork report returns)

---

## Premise

Daniel wants Claude (via MCP) to become the primary way leaders/admins create, edit, and manage setlists and library content. The frontend would eventually shrink toward read-only / performance views (perform, setlist browse, library browse, monitor for musicians) while the editor surface retires.

**Weighting (Daniel-explicit, 2026-05-15):** 40% speed-for-Daniel (his weekly throughput), 40% conversational-fit (is leader work inherently chat-shaped?), 20% codebase economics (which UI surfaces can be retired).

**Scope:** leader/admin side only (options 1+2 of the scope poll). Musicians keep their performance/monitor UI. Pure read views (perform, public-share, setlist preview) also stay.

**Not in scope this round:** musician-side flows, mobile-tablet-specific affordances, the v2 redesign (`/v2/*`) — those are separate workstreams.

## Method

Two parallel viewpoints, synthesized:

1. **Cowork viewpoint** — cowork-Claude attempts an 11-task battery + one weekly end-to-end scenario via the live MCP. Reports per-task scorecard, e2e narrative, cross-task patterns, missing-tool wishlist, conversational-fit verdict. Driven by `.paul/research/mcp-claude-first-cowork-PROMPT.md`.

2. **Codebase viewpoint (this plan)** — I walk every leader-touching UI surface in the repo and produce a coverage matrix, hidden-context audit, safety audit, and shrink-ROI map. Runs in parallel; doesn't wait for cowork.

The synthesis diffs cowork's "I couldn't do X" findings against my "the codebase knows about X" findings, surfacing the highest-leverage MCP additions.

## Four passes

### Pass A — Leader-side UI surface inventory + MCP coverage matrix

For every route, modal, dialog, and major component a leader/admin touches in the current app, produce a row:

| UI surface | What it does | MCP tool(s) that cover it | Gap notes |
|---|---|---|---|

Routes/components to walk (initial list — expand during the pass):

**Routes** (under `src/app/(main)/`):
- `/setlists` (list view + new-setlist actions)
- `/setlists/[id]` (setlist editor — the heaviest leader surface)
- `/library` (library browse / upload / archive / rename)
- `/schedule` (scheduling assignments + responses)
- `/manage` + `/manage/templates` (admin: roles, templates, transfer ownership)
- `/admin/*` (admin sub-routes — role management, migrations)
- Dashboard (`(main)/page.tsx` + `DashboardClient.tsx`)

**Editor components** (under `src/components/setlist/grid/`):
- `SetlistGrid.tsx` — the main editor grid
- `AddBar.tsx` — add-song / add-section / add-reading / add-prayer / add-transition / add-note
- `BatchActionBar.tsx` — multi-select bulk operations
- `ChartBindDialog.tsx`, `ChartBindPopover.tsx` — bind a chart to a track row
- `RecordingBindPopover.tsx` — bind a recording to a track row
- `SetlistMetaEditSheet.tsx` — name / date / rabbi / serviceType / notes
- `MobileRowCard.tsx`, `MobileCardList.tsx` — mobile editor surface
- `DeleteConfirmProvider.tsx` — destructive-action confirmation pattern
- `ReconciliationProvider.tsx` — what's the conflict-resolution model?

**Dialogs / modals** (under `src/components/setlist/`):
- `PublishDialog.tsx` — publish / unpublish + email notification
- `PrintModal.tsx` + `PrintModeSelector.tsx` + `TrackPrintOptionsList.tsx` — print packets (band / personal / public)
- `ImporterModal` (under `src/components/setlist/importer/`) — document-driven import (v7.0)
- `wizard/` — new-setlist wizard

**Library** (`/library` + components):
- UploadDialog (and any rename / archive / move flow)
- Whatever search / filter UI is there
- The picker used in ChartBindDialog (overlaps but worth listing)

**Schedule** (`/schedule`):
- Assignment UI, response UI, calendar-feed token management

Output: a markdown table with one row per surface. "MCP tool coverage" answers: of the 22 tools we have, which ones (if any) reproduce this surface's primary action? "Gap notes" is free text: what's missing, or "fully covered", or "covered but worse than UI in $WAY".

### Pass B — Hidden context audit

What does the UI *implicitly* show or do that an MCP client doesn't get? Cowork will hit these and not know how to ask for them. Examples I expect to find:
- Setlist drawer shows missing-chart badges per row → no MCP equivalent.
- AddBar's recent-songs / suggested-songs UI → MCP has `search_library` but no "songs Daniel has used most often in the last 6 weeks" affordance.
- Schedule view shows visual conflicts (Randy already leading on that date) → MCP has no scheduling-conflict tool.
- The grid shows live sync state (other-editor activity, latency badges) → MCP write tools fire-and-forget.
- Publish dialog previews who'll receive the email + their roles → MCP `delete_setlist` exists but no `publish_setlist` or notify-band tool exists yet.
- Library upload shows real-time progress + dedup preview → MCP `upload_chart` returns one envelope after the fact.
- ImporterModal does interactive cleanup (split lines, edit titles, set service type) between extract and commit → MCP `save_scraped_chart` is single-shot.

Output: a list of "UI knows X / MCP doesn't surface X" items, severity-tagged (HIGH if cowork is likely to fail on it, MED if cowork will struggle but recover, LOW if it just slows things down).

### Pass C — Reversibility + safety audit

Every leader action has a destructiveness rating. Compare UI vs MCP:

- **Delete setlist:** UI uses `DeleteConfirmProvider` (typed confirm?). MCP `delete_setlist` is admin-OR-owner, cascades to tracks, no soft-delete. Probe: is there an "are you sure" pattern we should mirror? An undo window?
- **Delete chart:** UI archives (`status: 'archived'`) — soft delete. MCP `delete_chart` is hard delete. Mismatch — investigate whether MCP should default to archive.
- **Reorder:** non-destructive but easy to mess up. UI shows what changed; MCP gives `{ok: true}`. (G-11 already partially fixes this for `update_setlist` echo.)
- **Bulk rename / bulk type change** (BatchActionBar): MCP has no bulk tools; cowork would loop, which compounds blast radius.
- **Transfer ownership** (`/api/setlist/transfer/route.ts`): MCP has no equivalent. Probe: should it?
- **Publish** (`/api/setlist/publish/route.ts`): emits email. MCP has no equivalent — and any publish tool will need a confirmation pattern because emails are irreversible side effects.

Output: a destructive-actions table — action × UI safety × MCP safety × proposed mitigation (confirm token, dry-run flag, soft-delete default, etc.). Tag any MCP tool that's irreversible without a UI-equivalent safety net.

### Pass D — Frontend-shrink ROI map

Per leader-side UI surface, a verdict in one of three columns:

- **Delete** — if MCP fully covers + cowork prefers it, this route/component goes away. Estimate LOC saved.
- **Keep** — UI is genuinely better here (spatial, multi-select, drag-drop, visual conflict resolution). Document why.
- **Read-only-only** — strip the write affordances, keep the view. The route survives as a presentation surface.

Output: a route × verdict table + a rough LOC-saved column. Weight by Daniel's stated frequency-of-use (auto-memory says clone-and-tweak is the 90% case, so `/setlists/[id]` is the highest-traffic surface).

## Mechanics

- Pure docs work — no code changes. Lands as a single `docs(research): ...` commit on `master`.
- Read-only investigation: use Glob/Grep/Read against `src/`, no Edit/Write outside `.paul/research/`.
- Time-box: ~2 hours for the four passes. If I'm not done, commit what I have and continue post-cowork.
- All file references use repo-relative paths so the synthesis can link them.
- Cross-link to the cowork report by section: when Pass A finds a gap, name it `A1`, `A2`...; when cowork reports a missing tool, the synthesis pairs `A1 ↔ cowork-T3-missing-bulk-bind` etc.

## Open dependencies on cowork

The synthesis can't finalize until cowork's `mcp-claude-first-cowork-REPORT.md` lands. But the four codebase passes are independent — they run now and stand alone. When cowork lands:

1. Diff cowork's missing-tool wishlist against Pass A coverage matrix.
2. Cross-reference cowork's "context I wished I had" callouts against Pass B's hidden-context list.
3. Cross-reference cowork's "I would've nuked something" near-misses against Pass C's safety audit.
4. Cross-reference cowork's per-task verdicts against Pass D's verdict — agreement strengthens the recommendation; disagreement gets flagged for Daniel.

The synthesis output is a prioritized "v7.1 (or beyond) MCP roadmap" — what tools to add, what UI surfaces to retire, what to keep — sized so each item can be planned as a discrete phase via PAUL.

## Out-of-scope reminders

- No code written from this round. Roadmap-only.
- No v2 redesign work — that's a parallel UI workstream.
- No musician-side changes.
- No monitor work in the eval battery this round (X32 unavailable for testing); deferred to next stress-test cycle.
- No bridge / X32 hardware concerns — bridge is do-not-touch lane (CRIT-003).
