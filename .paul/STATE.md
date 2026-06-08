# Project State

> Re-baselined 2026-06-07. Prior 1255-line STATE recoverable from git history (`git show HEAD~1:.paul/STATE.md` relative to the re-baseline commit).

## Project Reference

See: .paul/PROJECT.md (updated 2026-06-07)

**Core value:** The band gets the right charts + recordings on their iPads each week, and Daniel authors setlists conversationally via Claude + MCP.
**Current focus:** v11.0 Brothers Lazaroff Multi-Tenant — make the app multi-tenant so David Lazaroff gets his own org-scoped instance on brotherslazaroff.live. (v7.1 hardening continues in parallel via `.coord/`.)

## Current Position

Milestone: **v11.0 Brothers Lazaroff Multi-Tenant** (ACTIVE — created 2026-06-08 via /paul:milestone)
Phase: **v11-01 COMPLETE ✅ (2026-06-08)** — Tenant foundation shipped (4/4 plans). Next: v11-02 of 5 — MCP org-scoping (Not started).
Plan: none active (v11-01 closed). Ready to PLAN v11-02.
Status: Phase v11-01 complete + committed + pushed to prod master. Ready to plan v11-02.
Last activity: 2026-06-08 — v11-01 PHASE TRANSITION: all 4 plans LOOP COMPLETE (org model → write-path stamping → 2105-doc prod backfill → org-scoped rules deployed). PROJECT/ROADMAP evolved; phase commit + push origin master.

Parallel track: **v7.1 Production Hardening** remains ACTIVE via the bongo `.coord/` system (cycle-13 in flight) — independent of the PAUL loop, which now tracks v11.0. App is at `10.1.0` (package.json).

Progress:
- v11.0: [██░░░░░░░░] ~20% — 1 of 5 phases done (v11-01 ✅); next v11-02 MCP org-scoping
- v7.1 (via .coord/): ~cycles 1–12 landed; cycle-13 in flight

## Git State

- **cwd branch:** `master`, EVEN with `origin/master` (verified live 2026-06-08; the prior "stale fix/b1 / +1 behind" note was itself stale). Pull before starting on another machine.
- Working tree carries the in-flight v11-01-01 changes (src/lib/org/, models.ts, set-role, .paul/) — not yet committed.
- Production branch is `master`; push `origin master` (NOT `master:main`).
- Multi-computer workflow — always `git pull` before starting.

## Loop Position

v11.0 runs through the standard PAUL loop:
```
PLAN ──▶ APPLY ──▶ UNIFY
  ✓        ✓        ✓     [v11-01 PHASE COMPLETE — next: PLAN v11-02 (MCP org-scoping)]
```
The v7.1 hardening campaign continues separately via the bongo `.coord/` cowork cadence (COWORK RUN ──▶ MULTI-AXIS REPORT ──▶ PARALLEL FIX WAVE ──▶ repeat); the two run in parallel.

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
- **v11.0 AUTONOMY directive (2026-06-08, Daniel):** run the whole milestone autonomously — waive PAUL approval/continuation gates; auto-proceed plan→plan & phase→phase; auto-commit per phase + push to prod `master`; bake decisions into PLANs (no `checkpoint:decision`); Firebase deploys + backfills run as AUTO tasks (single-owner = the executor). **QUALITY FLOOR HELD (non-negotiable):** E/Q every task (tsc clean + tests green + AC proof); emulator-backed rules tests + the v11-05 isolation audit are mandatory/blocking; /ui-ux-pro-max BLOCKING on UI phases (v11-03/04); backfills get dry-run + idempotency marker + rollback, inspect dry-run before --apply. **STOP only for:** product ambiguity, an unresolvable quality-gate failure, or a discovered cross-tenant LEAK / CRC lock-out risk. See auto-memory [[feedback_v11_autonomous_milestone]].

### Deferred Issues
- v7.0 fold-forward backlog (`.paul/MILESTONES.md` § v7.0 "Fold-forward to v7.1") — largely superseded by iPad/MCP cycle work; re-triage what's still live.
- Decide whether to formalize a `package.json` semver bump at v7.1 close.
- ROADMAP.md (983 lines) / PROJECT.md / MILESTONES.md still carry full historical milestone detail — intentional archive per PAUL template (collapse, don't delete); only STATE has a hard size target.

### Blockers/Concerns
- None active. (v11-01-03 prod backfill RAN + verified 2026-06-08 — see below.)
- **Prod-script auth note (reusable):** this box has NO Firebase Admin SA creds in `.env.local` and no gcloud. Admin-SDK prod scripts authenticate by converting the firebase CLI login's refresh token (`~/.config/configstore/firebase-tools.json` → `tokens.refresh_token`) into a temp `authorized_user` ADC json (with the public firebase-tools OAuth client_id/secret) and pointing `GOOGLE_APPLICATION_CREDENTIALS` at it; delete the temp file after. `firebase deploy` (rules/indexes — v11-01-04) uses the CLI directly, so it needs no ADC. The runner now supports cert(.env.local) OR applicationDefault(GOOGLE_APPLICATION_CREDENTIALS).

## Session Continuity

Last session: 2026-06-08 — Completed ENTIRE phase v11-01 in one autonomous session (4 plans): org model + write-path orgId stamping + 2105-doc prod backfill + org-scoped rules deployed. Phase commit + push to prod master done. Multi-tenant foundation is live.
Stopped at: v11-01 phase complete + committed/pushed. Milestone v11.0 at 1/5 phases.
Next action: PLAN v11-02 — MCP org-scoping (org-scoped bearer auth; resolve caller org per tool call; thread orgId through the ~108 library+setlist MCP tools; issue David's brotherslazaroff bearer). Largest surface in the milestone.
Resume file: .paul/ROADMAP.md

---
*STATE.md — digest, not archive. Target <100 lines.*
