# Project State

> Re-baselined 2026-06-07. Prior 1255-line STATE recoverable from git history (`git show HEAD~1:.paul/STATE.md` relative to the re-baseline commit).

## Project Reference

See: .paul/PROJECT.md (updated 2026-06-07)

**Core value:** The band gets the right charts + recordings on their iPads each week, and Daniel authors setlists conversationally via Claude + MCP.
**Current focus:** v7.1 Production Hardening & MCP Authoring Surface — cycle-13 (4-axis cowork-stress) in flight.

## Current Position

Milestone: **v7.1 Production Hardening & MCP Authoring Surface** (ACTIVE — PAUL-tracking label; `package.json` still `7.0.0`)
Phase: Cycle 13 of the cowork-stress cadence (cycles 1–12 landed)
Plan: N/A — work runs through the bongo `.coord/` system, not PAUL PLAN dirs
Status: Active hardening; PAUL re-baselined to reflect reality
Last activity: 2026-06-07 — PAUL re-baseline (reconciled `f3f86c41..master`, 439 commits, into the v7.1 milestone record)

Progress:
- v7.1: [███████░░░] ~cycles 1–12 of 13 landed; cycle-13 in flight

## Git State

- **master tip:** `467e788ed5` (local) / `ad16769505` (origin — **+1 ahead, local pull due**)
- **cwd branch:** `fix/b1-error-envelope-sweep` — STALE, 321 commits behind master. **Switch to master before any work.**
- Production branch is `master`; push `origin master` (NOT `master:main`).
- Multi-computer workflow — always `git pull` before starting.

## Loop Position

PAUL loop is effectively superseded by the bongo `.coord/` cowork cadence for this milestone:
```
COWORK RUN ──▶ MULTI-AXIS REPORT ──▶ PARALLEL FIX WAVE ──▶ (repeat)
```
PAUL now tracks the milestone-level record; `.coord/` tracks per-cycle execution.

## Execution Substrate (bongo .coord/)

- Roles: supervisor / auditor / coder (specs in `.coord/{SUPERVISOR,AUDITOR,CODER}.md`).
- ≤5 concurrent coder ceiling; cowork runs are **Daniel-run** (coders only author PROMPT.md).
- Active charter: `.coord/cycle-13-CHARTER.md` — 4 design lanes (13a leader-broadcast / 13b MCP-authoring / 13c real-WebKit / 13d bond-hygiene+picker).

## Accumulated Context

### Decisions (binding — full set in auto-memory + `.coord/shared/decisions.md`)
- MCP-first authoring pivot (2026-05-15): browser app is the band/consumer surface only.
- `err-public` invariant (2026-05-28): never gate data from musicians/performers.
- No-Saturday framing (2026-05-28): don't scope triage around service gates.
- Always-proceed / no decision-blocks (2026-05-28): agents proceed autonomously on in-scope work.
- Dedup 0.85 strict + `force: true` override; `dryRun` = observability.

### Deferred Issues
- v7.0 fold-forward backlog (`.paul/MILESTONES.md` § v7.0 "Fold-forward to v7.1") — largely superseded by iPad/MCP cycle work; re-triage what's still live.
- Decide whether to formalize a `package.json` semver bump at v7.1 close.
- ROADMAP.md (983 lines) / PROJECT.md / MILESTONES.md still carry full historical milestone detail — intentional archive per PAUL template (collapse, don't delete); only STATE has a hard size target.

### Blockers/Concerns
- None active. Sync hygiene (pull local master; leave the stale b1 branch) is the only pre-work step.

## Session Continuity

Last session: 2026-06-07 — PAUL re-baseline complete (MILESTONES + ROADMAP + PROJECT + STATE updated).
Stopped at: v7.1 milestone recorded; cycle-13 in flight.
Next action: Pull local master; then either drive cycle-13 forward via `.coord/` (supervisor/auditor/coder) or run `/paul:progress` for a PAUL-side next-step.
Resume file: .paul/PROJECT.md → .paul/MILESTONES.md § v7.1 → .coord/cycle-13-CHARTER.md

---
*STATE.md — digest, not archive. Target <100 lines.*
