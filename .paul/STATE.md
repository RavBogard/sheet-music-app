# Project State

> Re-baselined 2026-06-07. Prior 1255-line STATE recoverable from git history (`git show HEAD~1:.paul/STATE.md` relative to the re-baseline commit).

## Project Reference

See: .paul/PROJECT.md (updated 2026-06-07)

**Core value:** The band gets the right charts + recordings on their iPads each week, and Daniel authors setlists conversationally via Claude + MCP.
**Current focus:** v11.0 Brothers Lazaroff Multi-Tenant — make the app multi-tenant so David Lazaroff gets his own org-scoped instance on brotherslazaroff.live. (v7.1 hardening continues in parallel via `.coord/`.)

## Current Position

Milestone: **v11.0 Brothers Lazaroff Multi-Tenant** (ACTIVE — created 2026-06-08 via /paul:milestone)
Phase: **v11-02 MCP org-scoping (IN PROGRESS — 3/4 plans)** — v11-01 ✅; v11-02-01 ✅; v11-02-02 ✅; v11-02-03 LOOP COMPLETE ✅.
Plan: **v11-02-04 created, ready for APPLY** (`.paul/phases/v11-02-mcp-org-scoping/v11-02-04-PLAN.md`) — issue David's BL bearer + merged orgIds claim, ship feat(v11-02) to prod, live tenant-isolation e2e. LAST plan in v11-02. Decisions baked: David=existing band_leader account (resolve+confirm uid); executor=this box (Daniel-authorized "you run it"). Phase commit FOLDED INTO APPLY Task 2 (deploy must precede the live e2e), not the UNIFY transition.
Status: v11-02-04 PLAN created (3 tasks, autonomous, prod deploy + prod credential writes). Ready for APPLY.
Last activity: 2026-06-08 — v11-02-03 LOOP COMPLETE. loadEditableSetlist org chokepoint (8 setlist tools) + delete/recompute/clone/clone-from-template/update_song/delete_chart guards + create-stamp on create/clone/template + stampOrg on 3 chart-create tools; 18 index write sites threaded orgFrom(extra); new org-scope-writes.emulator.test.ts (8/8). Decision baked: not-found wall (NOT cross_tenant_denied). NOT committed (phase commit at v11-02 transition after v11-02-04).

Parallel track: **v7.1 Production Hardening** remains ACTIVE via the bongo `.coord/` system (cycle-13 in flight) — independent of the PAUL loop, which now tracks v11.0. App is at `10.1.0` (package.json).

Progress:
- v11.0: [███░░░░░░░] ~33% — 1 of 5 phases done (v11-01 ✅) + v11-02 at 3/4 plans (write wall closed)
- v7.1 (via .coord/): ~cycles 1–12 landed; cycle-13 in flight

## Git State

- **cwd branch:** `master`, **AHEAD of `origin/master` by 1** — local `wip(v11-02): paused at 2/4` commit (v11-02-01 + v11-02-02, NOT pushed; `git log -1` for the hash). origin/master tip is the v7.1 `.coord/` line (was `8feb47afff` at session start).
- **WIP checkpoint, not the phase commit.** At v11-02 transition (after v11-02-04), squash/amend the wip commit into the single `feat(v11-02)` commit, then push `origin master`.
- v11-01 phase commit already pushed earlier.
- Production branch is `master`; push `origin master` (NOT `master:main`).
- Multi-computer workflow — `git pull` before starting; this WIP commit is local to this box.

## Loop Position

v11.0 runs through the standard PAUL loop:
```
PLAN ──▶ APPLY ──▶ UNIFY
  ✓        ○        ○     [v11-02-04 PLAN created — next: APPLY (last in phase; deploy folds in)]  (01 ✓✓✓ · 02 ✓✓✓ · 03 ✓✓✓)
```
v11-02 plan decomposition (complex phase — 4 vertical slices, autonomous milestone auto-proceeds plan→plan):
- **v11-02-01** ✅ LOOP COMPLETE — caller-org resolution foundation: orgId stamped at all 4 mcpTokens mint sites + verifyBearer returns orgId (default crc) + route plumbs to AuthInfo.extra + `orgFrom(extra)` seam + prod token backfill (117 stamped). Behavior-neutral. SUMMARY at `.paul/phases/v11-02-mcp-org-scoping/v11-02-01-SUMMARY.md`.
- **v11-02-02** ✅ LOOP COMPLETE — MCP READS org-scoped (6 tools): list/search filter to callerOrg; get_setlist/get_song → not-found cross-tenant wall; search_chart_text metadata+chords (parent-org drop); SongRecord.orgId surfaced; bond-corrections threaded to setlist org. emulator 7/7; full suite 3272/0. Templates/roster/congregation DEFERRED. SUMMARY in phase dir.
- **v11-02-03** ✅ LOOP COMPLETE — org-scope MCP WRITES. Cross-tenant deny via loadEditableSetlist chokepoint (8 tools) + delete/recompute/clone/clone-from-template/update_song/delete_chart guards; caller-org create-stamp on create/clone/template + stampOrg on the 3 chart-create tools; not-found wall (no cross_tenant_denied). emulator 8/8; no regression. SUMMARY in phase dir.
- **v11-02-04** TBD (LAST plan in v11-02) — issue David's brotherslazaroff bearer + orgIds claim + onboarding doc + live e2e verification. At its UNIFY: phase transition → squash WIP into `feat(v11-02)` + push origin master.
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

Last session: 2026-06-08 — v11-02-03 full PLAN→APPLY→UNIFY (org-scope MCP WRITES). v11-02-01/02 also full loops (caller-org foundation + 117-token backfill; 6 read tools isolated). Phase v11-02 at 3/4 — MCP tenant wall now complete on BOTH read + write paths.
Stopped at: v11-02-03 LOOP COMPLETE. v11-02-01/02/03 work all uncommitted/WIP-local (v01+02 in WIP commit `4333c15454`; 03 staged in working tree) — squash into feat(v11-02) at phase transition (after v11-02-04).
Next action: /paul:plan v11-02-04 — issue David's `brotherslazaroff` bearer (mint sites stamp orgId per v11-02-01) + `orgIds:['brotherslazaroff']` claim + onboarding doc + live e2e (David authors a BL setlist via MCP, lists only BL, cannot see/mutate CRC). This is the LAST plan in v11-02; its UNIFY runs the phase transition (squash WIP → `feat(v11-02)`, push origin master).
Resume file: .paul/phases/v11-02-mcp-org-scoping/v11-02-03-SUMMARY.md
Resume context:
- Seam: orgFrom(extra)+rowOrg(orgId)+stampOrg(db,fileId,org) in src/lib/mcp/org-context.ts. Reads (02) + writes (03) both done.
- Write wall: loadEditableSetlist(db,id,uid,org) is THE setlist-write chokepoint; per-tool guards on delete/recompute/clone/clone-from-template/update_song/delete_chart; creates stamp caller org. Not-found wall (no cross_tenant_denied).
- DEFERRED to v11-04 (still cross-tenant): templates READ/LIST scoping, roster/musicians, congregation, service-personnel — read+write. (v11-02-03 stamps only the setlist cloned OUT of a template.)
- Prod-script auth on this box: firebase-CLI-token → temp ADC (Blockers/Concerns note). v11-02-04 needs this for the bearer-mint/claim prod write.

---
*STATE.md — digest, not archive. Target <100 lines.*
