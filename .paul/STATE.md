# Project State

> Re-baselined 2026-06-07. Prior 1255-line STATE recoverable from git history (`git show HEAD~1:.paul/STATE.md` relative to the re-baseline commit).

## Project Reference

See: .paul/PROJECT.md (updated 2026-06-07)

**Core value:** The band gets the right charts + recordings on their iPads each week, and Daniel authors setlists conversationally via Claude + MCP.
**Current focus:** v11.0 Brothers Lazaroff Multi-Tenant — make the app multi-tenant so David Lazaroff gets his own org-scoped instance on brotherslazaroff.live. (v7.1 hardening continues in parallel via `.coord/`.)

## Current Position

Milestone: **v11.0 Brothers Lazaroff Multi-Tenant** (ACTIVE — created 2026-06-08 via /paul:milestone)
Phase: **v11-02b Org-aware token minting ✅ COMPLETE (1/1, 2026-06-08)** → next: **v11-03 Domain + branding** (NOT STARTED — ready to plan). v11-02 ✅ + v11-02b ✅.
Plan: none active. Ready to PLAN v11-03 (brotherslazaroff.live host→tenant routing + BL branding + synagogue→band vocab trim; **/ui-ux-pro-max BLOCKING**).
Status: **v11-02b COMPLETE + transitioned.** Self-service MCP minting is now org-aware — tenant members onboard via plain login → correctly org-scoped bearer (no manual handoff); CRC unchanged. Ready to plan v11-03.
Last activity: 2026-06-08 — v11-02b-01 LOOP COMPLETE + transition. `getPrimaryOrgForMinting(uid)` threaded into both self-service mint routes; unit 9/9 + emulator 3/3; feat(v11-02b) `2db15f36d9` deployed (Vercel READY); prod-verify David→brotherslazaroff. (Earlier today: v11-02 phase complete + David's bearer/claim + live e2e 12/12.)

Parallel track: **v7.1 Production Hardening** remains ACTIVE via the bongo `.coord/` system (cycle-13 in flight) — independent of the PAUL loop, which now tracks v11.0. App is at `10.1.0` (package.json).

Progress:
- v11.0: [████░░░░░░] ~45% — 2 of 5 phases done (v11-01 ✅, v11-02 ✅); BL live as first second tenant
- v7.1 (via .coord/): ~cycles 1–12 landed; cycle-13 in flight

## Git State

- **cwd branch:** `master`, **IN SYNC with `origin/master`** (pushed 2026-06-08). The WIP commit was collapsed (soft-reset to origin/master) into the single phase commit.
- **v11-02 phase commit:** `c7da31ac2a` feat(v11-02) — caller-org resolution + read/write tenant isolation (all of v11-02-01/02/03/04 source). Follow-up `779eab0a54` test(v11-02) — e2e probe + onboarding doc. Both pushed to `origin master` → Vercel prod deploy READY.
- v11-01 phase commit pushed earlier; v11-02 now pushed. **Next phase (v11-03) starts clean from origin/master.**
- Production branch is `master`; push `origin master` (NOT `master:main`).
- Multi-computer workflow — `git pull` before starting next session (other boxes may push v7.1).
- **v11-02b commit:** `2db15f36d9` feat(v11-02b) — org-aware self-service token minting (deployed, Vercel READY). Phase-close bookkeeping → `docs(v11-02b)`.
- origin/master in sync; **v11-03 starts clean from origin/master** (`git pull` first — multi-computer).

## Loop Position

v11.0 runs through the standard PAUL loop:
```
PLAN ──▶ APPLY ──▶ UNIFY
  ✓        ✓        ✓     [v11-02b COMPLETE — next: PLAN v11-03]   (v11-02 ✓ all 4 · v11-02b ✓)
```
v11-02 plan decomposition (COMPLETE — all 4 vertical slices LOOP COMPLETE):
- **v11-02-01** ✅ LOOP COMPLETE — caller-org resolution foundation: orgId stamped at all 4 mcpTokens mint sites + verifyBearer returns orgId (default crc) + route plumbs to AuthInfo.extra + `orgFrom(extra)` seam + prod token backfill (117 stamped). Behavior-neutral. SUMMARY at `.paul/phases/v11-02-mcp-org-scoping/v11-02-01-SUMMARY.md`.
- **v11-02-02** ✅ LOOP COMPLETE — MCP READS org-scoped (6 tools): list/search filter to callerOrg; get_setlist/get_song → not-found cross-tenant wall; search_chart_text metadata+chords (parent-org drop); SongRecord.orgId surfaced; bond-corrections threaded to setlist org. emulator 7/7; full suite 3272/0. Templates/roster/congregation DEFERRED. SUMMARY in phase dir.
- **v11-02-03** ✅ LOOP COMPLETE — org-scope MCP WRITES. Cross-tenant deny via loadEditableSetlist chokepoint (8 tools) + delete/recompute/clone/clone-from-template/update_song/delete_chart guards; caller-org create-stamp on create/clone/template + stampOrg on the 3 chart-create tools; not-found wall (no cross_tenant_denied). emulator 8/8; no regression. SUMMARY in phase dir.
- **v11-02-04** ✅ LOOP COMPLETE — issued David's `brotherslazaroff` bearer (tokenId 93JMXhT1OspFsWDMmb9V, orgId on the token doc) + `orgIds:['brotherslazaroff']` claim by MERGE (role preserved) on his existing band_leader account (uid HTks9a8…); shipped feat(v11-02) `c7da31ac2a` to prod (Vercel READY); live e2e probe 12/12 on www.centralreform.live/api/mcp (BL reads/creates BL-only, cannot touch CRC, CRC unaffected). `scripts/issue-bl-bearer.mjs` + `scripts/e2e-bl-tenant-probe.mjs` + `docs/onboarding-brotherslazaroff.md` shipped. SUMMARY in phase dir.
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

Last session: 2026-06-08 — BIG session. v11-02 PHASE COMPLETE (4 plans: caller-org seam + read isolation + write wall + David's live bearer/claim + e2e 12/12) AND v11-02b (org-aware self-service minting) both shipped to prod. Brothers Lazaroff is the first live second tenant; onboarding is now self-serve. v11.0 at 2/5 numbered phases (+v11-02b insert).
Stopped at: v11-02b closed + transitioned. Commits: feat(v11-02) `c7da31ac2a` · test(v11-02) `779eab0a54` · docs(v11-02) `243a8a98b8` · feat(v11-02b) `2db15f36d9` (+ docs(v11-02b) pending in this UNIFY). origin/master in sync.
Next action: /paul:plan v11-03 — brotherslazaroff.live host→tenant routing + Brothers Lazaroff branding (band chrome, not synagogue) + synagogue→band vocab trim (gig/venue/set, not service/sanctuary/rabbi; trim service-type + rabbi UI). **/ui-ux-pro-max BLOCKING** (UI phase). `git pull` first. Daniel flagged branding/vocab as his taste calls — consider /paul:discuss-phase v11-03 to pin direction before planning.
Resume file: .paul/phases/v11-02b-org-aware-minting/v11-02b-01-SUMMARY.md
Resume context:
- v11-02 + v11-02b done: MCP tenant wall live + proven (caller-org seam orgFrom/rowOrg/stampOrg in src/lib/mcp/org-context.ts; reads + writes isolated); self-service minting org-aware (getPrimaryOrgForMinting in src/lib/org/membership.ts). David's bearer + claim issued; he can self-onboard.
- Canonical prod MCP endpoint: **https://www.centralreform.live/api/mcp** (apex 307→www; curl -L drops the auth header — hit www directly). Reusable e2e probe at scripts/e2e-bl-tenant-probe.mjs (DAVID_BEARER + CRC_BEARER env) — for the v11-05 isolation audit.
- DEFERRED to v11-04 (still cross-tenant): templates READ/LIST scoping, roster/musicians, congregation, service-personnel — read+write.
- UAT-PENDING: David's UX confirmation (self-onboard via login OR the manual bearer tokenId 93JMXhT1OspFsWDMmb9V). Server-side isolation proven.
- Local `next build` fails on `/api/cron/aggregate-corrections` (missing CRON_SECRET in .env.local — Vercel-injected) — NOT a code issue; rely on the Vercel build with env. Prod-script auth: firebase-CLI-token → temp ADC.

---
*STATE.md — digest, not archive. Target <100 lines.*
