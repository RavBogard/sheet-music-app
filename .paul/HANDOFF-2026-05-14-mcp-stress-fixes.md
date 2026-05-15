# PAUL Handoff — MCP Stress-Test Fixes + v71-01 Branched State

> **⚠️ SUPERSEDED 2026-05-15** — this handoff is HISTORICAL. The MCP stress-test fix work it describes shipped through Wave 4/5/6 + CF1 + CF2-B + CF3 + import_chart_from_drive + atomic upload guard + library_signals (all live on master, latest `f650d94f0`). The 2026-05-15 authoring-model pivot makes MCP Daniel's primary author surface, NOT a parallel workstream. For current MCP state, read `project_mcp_status.md` in auto-memory and `.paul/research/mcp-stress-test-2026-05-15-mcp-first-PROMPT.md` (the live stress-test prompt). Do not resume from THIS handoff's TODO list.

**Date:** 2026-05-14 (Thursday evening, CT)
**Status:** Multiple workstreams in flight; context will be cleared before resume
**Author of this handoff:** Claude Code, Opus 4.7 (1M context)

---

## READ THIS FIRST

You have no prior context. This document is comprehensive.

**Project:** centralreform.live — CRC Music (Reform Jewish synagogue setlist + perform app)
**Core value:** Musicians can instantly access setlists, transpose charts, and control monitor mixes — live on any device, no paper or prep needed.

This session did two things:
1. **Closed phase v71-01** (the v7.1 audit fold-forward security wave), parked on a feature branch — NOT pushed yet (Thursday-PM cadence forbids).
2. **Triaged an MCP stress-test report** Daniel pasted at end-of-session — wrote it up to `.paul/research/mcp-stress-test-2026-05-14.md` with code-level root cause analysis for the three high-priority findings.

Next-up work is **MCP-workstream fixes** in a separate branch/worktree. This handoff explains how to resume there cleanly.

---

## Current git state (as of 2026-05-14 evening)

```
* master                                       65dd9724 [origin/master]
                                               (synced with origin)
                                               Will gain the small "docs(research)" commit
                                               for this handoff + the stress-test research
                                               doc — see "What to commit before /clear" below

  feature/v71-01-security-auth-fold-forward    2bf4beb1
                                               (NOT pushed — parked for Sunday+)
                                               Contains v71-01-01 work: recordings/upload
                                               validation + execute Drive-fetch hardening +
                                               .paul/ tracking updates

  feat/mcp-server                              59363f52 [origin/feat/mcp-server]
                                               Lives in worktree at ../sheet-music-app-mcp/
                                               This is where MCP stress-fix work belongs
```

Worktrees:
- `sheet-music-app/`   → master (this dir; main v7.1 work)
- `sheet-music-app-mcp/` → `feat/mcp-server` (parallel MCP development)

---

## What shipped earlier this session (v71-01-01)

**Phase v71-01 — Security + auth fold-forward** (Wave 1 of v7.1 milestone), single-plan, LOOP CLOSED.

Commit `2bf4beb1` on `feature/v71-01-security-auth-fold-forward`:
- `recordings/upload`: songId existence check (404), TITLE_MAX=200 / NOTES_MAX=2000 caps, enforced BEFORE buffer read + Storage write. New emulator test (3/3 PASS, HFG-compliant).
- `execute` route: `MAX_IMPORT_PDF_SIZE=25MB` cap (content-length + post-read body length) + `%PDF-` magic-byte sniff. New unit test (4/4 PASS).
- `drive/file` session-cookie auth swap was implemented + qualify-clean, then **REVERTED in-phase** at risk-review (`PDFOverlay.tsx:162` fetches it without auth for the PUBLIC `/perform/setlist/[id]` view; would have 401'd public viewers). v70-08-AUDIT had pre-authorized this fold-forward.
- **CRIT-003 (bridge credentials) DEFERRED** at decision-checkpoint per Daniel's call ("not important; don't include and leave be").

Verification: `next build` ✓ EXIT 0; setlist-import 41/41; recordings rules emulator 10/10; drive-file-auth 12/12; HFG 0/3 held.

Full reconciliation in `.paul/phases/v71-01-security-auth-fold-forward/v71-01-01-SUMMARY.md` (on the feature branch).

**To resume v7.1 work:** `git checkout feature/v71-01-security-auth-fold-forward` then `/paul:plan v71-02` (doc-import architecture cleanup). DO NOT push to master until Sunday+ (v7.1 constraint #7).

---

## What landed on master in this handoff commit

A small documentation-only commit on master, separate from v71-01:

- `.paul/research/mcp-stress-test-2026-05-14.md` — Daniel's full stress-test report verbatim + Claude Code's code-level root-cause appendix
- `.paul/HANDOFF-2026-05-14-mcp-stress-fixes.md` — this file

No code changes. Safe to push at any time (it's all docs, deploys nothing).

---

## The MCP stress-test, in 60 seconds

Daniel ran an end-to-end stress test of the production MCP server (`https://www.centralreform.live/api/mcp`) using claude.ai (Opus 4.7) under his own band-leader session. The MCP exposes 9 tools (list/get/search/get_song reads + create/update/add_track/remove_track/reorder_setlist writes).

He surfaced 12 findings (F-1 through F-12). Severity-sorted top three:

1. **F-4 (high) — `referenceLink` silently dropped** on track adds. CONFIRMED root cause: write path persists correctly, but `getSetlist` projection at `src/lib/mcp/tools/setlists.ts:83-98` omits the field. **One-line fix.** Existing track docs in Firestore already have the data.
2. **F-9 (medium) — `eventDate` validation leaks Firestore error text.** Bad-format ISO string produces raw Firestore SDK error `"Value for argument 'seconds' is not a valid integer."` Fix: add Zod `.refine(s => !Number.isNaN(Date.parse(s)), ...)` in `src/lib/mcp/tools/index.ts` on both `create_setlist` and `update_setlist` `eventDate` schemas.
3. **F-10 (medium) — No `delete_setlist` tool.** Two stress-test setlists are stuck in production (`982b7ee8-cb2b-4c3c-af07-0314b4959720` + `0c734209-62ca-4b66-9962-634e3b922129`) until either F-10 ships or Daniel deletes them via the centralreform.live UI. Both have eventDate=2099-12-31 so they're invisible in upcoming-services view — clutter only, not active harm.

Findings F-1, F-2, F-3, F-5, F-6, F-7, F-8, F-11, F-12 are lower priority — see the research doc for the full sweep.

**ALL MCP code lives in `src/lib/mcp/**` in THIS repo.** The `sheet-music-app-mcp/` directory is a worktree of the same repo on the `feat/mcp-server` branch.

---

## How to route the MCP fixes

Per `project_mcp_parallel_workstream.md` (auto-memory), MCP work is a **parallel workstream** that runs separately from v7.1's audit-fold-forward. Specifically:

- **Lane:** `feat/mcp-server` branch; work happens in the `sheet-music-app-mcp/` worktree
- **PAUL state:** The worktree has its OWN `.paul/` directory with its own PROJECT.md / ROADMAP.md / STATE.md for MCP-specific tracking
- **Do not** add MCP fix phases to v7.1's ROADMAP or v7.1's `.paul/` on master — they would muddy the milestone scope

Suggested next phase name (when you scaffold it on `feat/mcp-server`): **`mcp-stress-fixes-2026-05-14`**

Suggested Wave 1 plan: ship F-4 + F-9 + F-10 together (all backend, all in `src/lib/mcp/**`, no `/ui-ux-pro-max` needed).
- F-4 = 1-line read-side projection fix
- F-9 = Zod refine on 2 schemas in `src/lib/mcp/tools/index.ts`
- F-10 = new `delete_setlist` tool with cascade-delete of `tracks/{id}` rows in one batch + emulator test

Verification gates (per the MCP `.paul/`'s prior conventions, see its STATE.md):
- `next build` ✓
- `src/lib/mcp/__tests__/mcp-setlist-write.emulator.test.ts` — extend with `referenceLink` round-trip + `delete_setlist` describe block
- HFG counter held (F-10's cascade-delete is a real data-layer touch — emulator coverage required, no clause-(b) waiver)

After Wave 1 ships, Wave 2 candidates are lower-priority items (F-1 id/setlistId rename, F-3 filter inclusivity, F-2 description accuracy, F-7 missing-id error specificity, F-8 ISO validation in list_setlists, F-11 no-op-update short-circuit, F-12 envelope unification). Scope these only after Wave 1 lands cleanly.

---

## Stuck production artifacts (manual cleanup option)

Two stress-test setlists are sitting in production Firestore:

| Setlist ID | Name | eventDate | Owner |
|---|---|---|---|
| `982b7ee8-cb2b-4c3c-af07-0314b4959720` | `⚠️ STRESS TEST 2026-05-14 — DELETE ME (Claude)` | 2099-12-31 | Daniel Bogard |
| `0c734209-62ca-4b66-9962-634e3b922129` | `⚠️ STRESS TEST — DELETE ME (Claude)` | (unknown — prior run) | Daniel Bogard |

Both have far-future event dates so they don't appear in any "upcoming services" view, but they DO show up in `list_setlists(limit=50)`. They can be:
- (a) Left alone until F-10 ships, then deleted via the new MCP tool
- (b) Manually deleted right now via the centralreform.live UI (whatever delete affordance the band-leader dashboard exposes)

No urgency either way. Daniel's call.

---

## NEW Daniel feature ask (added end-of-session, before /clear)

**"I want to be able to control the monitor mixes via the MCP."**

Context: the `/monitor` route is a real, shipped, WebSocket-driven personal-IEM monitor mixing system — NOT a planned feature. It exists today:
- Route: `src/app/(main)/monitor/page.tsx` + `MonitorClient.tsx`
- Components: `FaderStrip`, `VerticalFaderStrip`, `MatrixPanel`, `BusAssignmentPanel`, `QuickMonitorPanel`, `DefaultChannelPicker`, `MonitorTabs`, `ConnectionIndicator`
- Hooks: `useMonitorAccess` (gates on `config/monitor.busAssignments[uid]` + sound-engineer + admin), `useMonitorConnection` (the WebSocket transport)
- Feature-flagged at congregation level via `congregation.features.monitor`
- v1.4 Phase 2 added support for 5 monitor buses

**What "via MCP" implies (Claude's read — verify with Daniel before scoping):**

Likely tools to expose, gated to the same access model that `useMonitorAccess` enforces:
- `list_monitor_buses` — read bus configuration
- `get_bus_mix(busId)` — read current fader / mute state for a bus
- `set_bus_fader(busId, channelId, level)` — adjust a fader
- `mute_channel(busId, channelId)` / `unmute_channel(busId, channelId)`
- `set_bus_assignment(busId, uid)` — admin only; sets which user owns which bus
- Possibly higher-level: `apply_monitor_preset(busId, presetName)` if presets exist

**Open architectural questions to settle before planning:**
- The existing monitor system uses live WebSocket for fader updates. MCP tools are request/response. The MCP wrapper would presumably write desired state to Firestore (`config/monitor` or similar) and let the existing WebSocket layer propagate. Confirm the data shape + which doc holds authoritative state.
- Auth model: re-use `useMonitorAccess`'s logic in a server-side check that the MCP tool layer can call, OR mirror its rules in Firestore security rules + let writes fail unauthorized. Need to inspect both paths.
- Hardware coupling: the monitor system likely terminates at hardware via the `bridge/` daemon (the Windows hardware-bridge daemon flagged in CRIT-003). MCP writes that propagate through bridge will surface the deferred bridge-auth concern — coordinate with CRIT-003 routing.
- Scope of "control" — adjusting an existing bus is one thing; creating a new bus or reconfiguring channel mappings is bigger. Confirm with Daniel.

**Routing:** new MCP-workstream phase, distinct from `mcp-stress-fixes-2026-05-14`. Suggested name: `mcp-monitor-control` (no date suffix since this is a feature, not a dated remediation). Should run AFTER stress-fixes Wave 1 ships — the F-4 / F-9 / F-10 fixes are tiny and should not be blocked behind a feature design.

**Resume-Claude should NOT scope this without a discovery conversation with Daniel** — the protocol surface area (read-only read-back vs. full fader writes vs. presets vs. bus assignment) needs Daniel's input. Treat this as an item to acknowledge and brainstorm, not to plan unilaterally.

---

## What's NOT in scope for the resume

- v7.1 work (v71-02 / v71-03 / v71-04 / v71-05) — that resumes on `feature/v71-01-security-auth-fold-forward` whenever you're ready. Don't pull it into the MCP-workstream session.
- Pushing v71-01 to production — blocked by Thursday-PM cadence (v7.1 constraint #7); wait for Sunday+.
- Bridge credentials (CRIT-003) — DEFERRED to a future MCP-aware milestone; do not pull into the MCP-stress-fixes phase (different lane, different scope). **NOTE:** the monitor-MCP feature ask above will probably surface this concern, since monitor writes may flow through `bridge/`.
- The drive/file public-aware auth follow-up (new in v71-01) — also routed to a future MCP-aware milestone; not the MCP-stress-fixes phase.

---

## The exact resume prompt to use

Copy-paste this verbatim after `/clear`:

```
Resume MCP-workstream work. Full context is in
`.paul/HANDOFF-2026-05-14-mcp-stress-fixes.md` and the source report at
`.paul/research/mcp-stress-test-2026-05-14.md`. Read the handoff first.

Two scope items are queued, in priority order:

(1) Scaffold + plan a new phase `mcp-stress-fixes-2026-05-14` covering
    F-4 + F-9 + F-10 — the three high-priority stress-test findings.
    Backend, small, three independent fixes; all root causes are
    already located in the handoff appendix.

(2) Acknowledge but DO NOT plan unilaterally: I want to control the
    /monitor route (existing WebSocket personal-IEM mixing system) via
    MCP tools. The handoff has the architectural open questions —
    surface them, and we'll discuss before scoping.

Switch to the MCP worktree (`cd ../sheet-music-app-mcp`), confirm
you're on the `feat/mcp-server` branch, read that worktree's
`.paul/STATE.md` to see the MCP workstream's current PAUL position,
then bring me a proposal on (1) and the discussion questions on (2).

Do NOT touch v7.1 work or the `feature/v71-01-security-auth-fold-forward`
branch. Do NOT push anything until I approve.
```

---

## Cheat sheet — file paths Claude Code will need

**On master (this worktree, after the handoff commit lands):**
- `.paul/HANDOFF-2026-05-14-mcp-stress-fixes.md` — this file
- `.paul/research/mcp-stress-test-2026-05-14.md` — Daniel's report + Claude's root-cause appendix
- `.paul/STATE.md` — main sheet-music-app PAUL state (v7.1 milestone — points at the feature branch for next work)
- `.paul/ROADMAP.md` — v7.1 roadmap (v71-01 ✅ COMPLETE; v71-02..05 not started)
- `.paul/PROJECT.md` — main project facts (v71-01 entries added at tail)

**On `feat/mcp-server` (in `../sheet-music-app-mcp/` worktree):**
- `../sheet-music-app-mcp/.paul/STATE.md` — MCP workstream PAUL state (CHECK this on resume; it tells you what MCP work was last done and what comes next)
- `../sheet-music-app-mcp/.paul/PROJECT.md`, `ROADMAP.md`, etc.
- `../sheet-music-app-mcp/src/lib/mcp/tools/setlists.ts:83-98` — F-4 fix site (one-line read-side projection)
- `../sheet-music-app-mcp/src/lib/mcp/tools/index.ts` — F-9 fix site (add Zod refine on eventDate schema in 2 places)
- `../sheet-music-app-mcp/src/lib/mcp/tools/setlist-write.ts` — F-10 fix site (add `deleteSetlist` function; cascade-delete tracks)
- `../sheet-music-app-mcp/src/lib/mcp/__tests__/mcp-setlist-write.emulator.test.ts` — extend for new coverage

**On `feature/v71-01-security-auth-fold-forward` (do NOT touch in this session):**
- v7.1 in-flight work, parked. Untouchable from the MCP session.

---

## Memory carry-forwards already saved

These auto-memory entries were updated during this session and don't need re-stating:

- `CRIT-003: bridge credentials design` — DEFERRED status, with full reasoning, in MEMORY.md "Deferred Issues"
- `drive/file public-aware auth` — NEW deferred entry in MEMORY.md "Deferred Issues" with full root-cause + routing
- `LOW-004: leader → band_leader migration` — confirmed RESOLVED 2026-05-14

These persist across context clears — no need to copy them into the resume prompt.

---

## If something looks wrong on resume

- **STATE.md says v71-01 isn't done** → you're on master. v71-01's PAUL updates live on `feature/v71-01-security-auth-fold-forward`. Switch branches if you need that state.
- **Can't find the MCP `.paul/`** → it's in the worktree at `../sheet-music-app-mcp/.paul/`, not in this repo's `.paul/`. `git worktree list` confirms paths.
- **`feat/mcp-server` looks stale vs. recent MCP work** → check `git log feat/mcp-server` and the worktree's `.paul/STATE.md`. If a prior session committed there, it may be ahead.
- **The stuck stress-test setlists need quick cleanup** → just have Daniel delete them in the UI; don't rush F-10 to fix.

---

*Handoff written 2026-05-14T22:00Z (Thursday evening CT).*
*Purpose: enable a clean cold-start on MCP stress-fixes after Daniel /clears the context window.*
