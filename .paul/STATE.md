# Project State

> Re-baselined 2026-06-07. Prior 1255-line STATE recoverable from git history (`git show HEAD~1:.paul/STATE.md` relative to the re-baseline commit).

## Project Reference

See: .paul/PROJECT.md (updated 2026-06-07)

**Core value:** The band gets the right charts + recordings on their iPads each week, and Daniel authors setlists conversationally via Claude + MCP.
**Current focus:** v11.0 Brothers Lazaroff Multi-Tenant — make the app multi-tenant so David Lazaroff gets his own org-scoped instance on brotherslazaroff.live. (v7.1 hardening continues in parallel via `.coord/`.)

## Current Position

Milestone: **v11.0 Brothers Lazaroff Multi-Tenant** (ACTIVE — created 2026-06-08 via /paul:milestone)
Phase: **v11-05 cross-tenant collection scoping — PLANNING (2026-06-09)**. v11-01 ✅ · v11-02 ✅ · v11-02b ✅ · v11-03 ✅ · v11-04 ✅ COMPLETE (3/3). **6 numbered phases** (Daniel SPLIT 2026-06-08).
Plan: **v11-05-01 ✅ · v11-05-02 (Roster/users) ✅ LOOP COMPLETE — both committed local. Next: PLAN v11-05-03 (scheduling_assignments).** **v11-05 slice map (RENUMBERED — roster split into users + assignments; baked decisions: per-collection slices · backfill-before-filter-flip · vocab in-scope · MULTI-ORG membership via orgIds[] on user docs+claim, array-contains):** **01 ✅** Templates · **02** Roster `users` (orgIds[] mirror at sync-claims + array-contains filter on list_musicians/suggest_band/suggest-band route; backfill + David claim→['crc','brotherslazaroff']) · **03** `scheduling_assignments` (org from setlist; scope subscribeToAllUpcomingAssignments/suggestBand/history) · **04** Congregation singleton `config/congregation` → per-org refactor · **05** CreationWizard setlist-create orgId stamp + de-synagogue vocab (UI → /ui-ux-pro-max BLOCKING). (`musician_availability` DEAD; service-personnel = read-join → inherits.)
Status: **v11-05-02 (Roster/users) ✅ LOOP COMPLETE — committed local.** users roster org-scoped (in-memory membership filter, multi-org, CRC-safe-by-default); orgIds claim mirrored to user doc at sync-claims; backfill + David-claim scripts deferred to phase close. v11-05-01 ✅ also local.
Last activity: 2026-06-09 — applied+qualified v11-05-02 (tsc 0; full suite 3311/0; eslint 0; mcp-roster emulator 46/46 incl. 2 org cases; sync-claims+membership unit 16/16). DEVIATION: in-memory org filter (vs array-contains) — CRC-safe without backfill; emulator tests relocated to the proven mcp-roster harness. Committed local e166be2928 (01) + this (02).

Parallel track: **v7.1 Production Hardening** remains ACTIVE via the bongo `.coord/` system (cycle-13 in flight) — independent of the PAUL loop, which now tracks v11.0. App is at `10.1.0` (package.json).

Progress:
- v11.0: [███████░░░] ~67% — 4 of 6 phases done (v11-01/02/03/04 ✅; +v11-02b); BL live + branded + tenant-isolated reads on brotherslazaroff.live. Remaining: v11-05 collection scoping, v11-06 isolation audit.
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
PLAN ──▶ APPLY ──▶ UNIFY        [01 ✅ · 02 ✅ · 03 ✅ (local) — v11-05-04 PLAN ✓, awaiting APPLY]
  ✓        ○        ○     (3 of 5 loop-complete; v11-05-04 plan created 2026-06-09)
```
v11-05-04 PLAN: `.paul/phases/v11-05-collection-scoping/v11-05-04-PLAN.md` (complex/autonomous). Congregation singleton `config/congregation` → per-org via doc-id NAMESPACING (crc = bare 'congregation' = ZERO migration; others = `congregation__{org}`), mirroring v11-05-01's liturgical-key pattern. 3 tasks: (1) `congregationDocId(org)` helper in registry.ts + thread org through getServerCongregationConfig(server-auth:98) + print-pipeline:662 + roster suggestBand:812 + suggest-band route:51 + MCP getCongregationContext (orgFrom @ index.ts:510); (2) client congregation-store.ts reads `coerceOrgId(document.documentElement.dataset.org)` → congregationDocId (no React-context/provider-ordering risk); (3) seed `config/congregation__brotherslazaroff` (scripts/seed-bl-congregation.mjs, dry-run-first) + emulator/unit org cases. Missing per-org doc → DEFAULT fallback (graceful). NO vocab/visual change (→ v11-05-05); /ui-ux-pro-max NOT required (data/store wiring). v11-05-03 ✅ committed local `9568fdc7a4` + docs `f294812ace`. (Phase = 3 of 5; file-count heuristic misfires — 05 still to plan.)
v11-05-03 APPLY DONE (all 3 tasks PASS): tsc 0 · eslint 0 · full suite **3312/0** · mcp-roster emulator **50/50** (+4 org cases: create-stamp AC-1, listPending + list_musicians_on_date scoping) · backfill-assignment-orgids.mjs node-check clean. Files: types/models.ts (+orgId) · org/membership.ts (+rowOrg single-org helper) · scheduling/assignment-service.ts (stamp orgId in-tx from setlist) · scheduling-firebase.ts (subscribeToAllUpcomingAssignments org param+filter) · suggest-band/history/remind routes (org filter) · roster.ts (listPending/list_musicians_on_date/suggestBand scoped) · service-personnel.ts (both setlist-resolution paths walled) · mcp/tools/index.ts (orgFrom wired ×3) · use-calendar-data.ts + schedule/page.tsx (useOrg threaded) · +scripts/backfill-assignment-orgids.mjs. DEVIATIONS (both audit-defensive, strictly safer): remind scoped BOTH branches (not just no-setlistId); service-personnel walls the setlistId path too (not-found). Prod backfill dry-run = phase-close (SOFT, CRC-safe un-run).
v11-05-03 PLAN: `.paul/phases/v11-05-collection-scoping/v11-05-03-PLAN.md` (complex/autonomous). scheduling_assignments READ+WRITE org-scoping — org denormalized from parent setlist; in-memory rowOrg(crc-default) filter (single orgId, NOT orgIds[]). 3 tasks: (1) stamp orgId at create + rowOrg helper + type; (2) filter cross-tenant reads (client subscribeToAllUpcomingAssignments + web suggest-band/history[+scheduling_history]/remind-all + MCP listPendingAssignments/list_musicians_on_date/suggestBand/list_service_personnel); (3) backfill-assignment-orgids.mjs (setlist-join, SOFT gate) + mcp-roster emulator cases. INHERIT/intentional (no change): musicianUid/setlistId-scoped reads + cron (all-tenant by design). **NEW collection found vs inventory: `scheduling_history` (history route) — also backfilled.**
⚠️ **PHASE-CLOSE DEPLOY GATE (batch — Daniel chose batch-at-close 2026-06-09):** run scripts (dry-run→inspect→--apply) THEN push the phase. Items:
  - **v11-05-01 (HARD gate):** `node scripts/backfill-orgid-v11.mjs --apply` — the `list_templates` equality filter `where('orgId','==',org)` makes the 3 CRC templates vanish unless stamped FIRST.
  - **v11-05-02 (SOFT — CRC-safe-by-default):** roster filter is in-memory w/ missing-orgIds→['crc'], so CRC is safe with NO backfill. But to make BL's roster correct: `node scripts/backfill-user-orgids.mjs --apply` (tag BL members) + `node scripts/fix-david-orgids-claim.mjs --apply` (David → ['crc','brotherslazaroff']).
  - **v11-05-03 (SOFT — CRC-safe-by-default):** assignment reads filter in-memory w/ missing-orgId→'crc'. New assignments stamp orgId at create; to stamp LEGACY rows from their setlist: `node scripts/backfill-assignment-orgids.mjs` (dry-run → inspect per-org counts) then `--apply`. Covers scheduling_assignments + scheduling_history.
Everything committed LOCAL, **NOT pushed**.
**v11-05 COLLECTION INVENTORY (verified 2026-06-09, Explore agent — drives the slices; trust over memory):**
- **Templates = 2 collections:** `setlistTemplates` (MCP/admin, has `ownerId` not `orgId`; reads 186/251/467/550/771, writes 353/506/555/675 in `src/lib/mcp/tools/templates.ts`) + `templates` (client liturgical slot overrides, doc-id=liturgical key, full-collection onSnapshot in `src/lib/template-firebase.ts`).
- **Roster:** `users` (27+ reads; cross-tenant `listMusicians` roster.ts:206 + `/api/scheduling/suggest-band`:37) · `scheduling_assignments` (cross-tenant `subscribeToAllUpcomingAssignments` scheduling-firebase.ts:80 + `suggestBand` roster.ts:776) · `musician_availability` = **DEAD** (only test-cleanup refs, no active code). User doc has `musicianProfile` but **no orgId / no orgIds[]** — membership shape lives on the auth claim (`orgIds:[]`), NOT the user doc; v11-05-02 must decide the roster filter source.
- **Congregation = singleton `config/congregation` doc (NOT a collection):** reads in congregation-store.ts:96, suggest-band:45, roster.ts:781, print-pipeline.ts:662, server-auth.ts:102; write migrations.ts:26. Multi-tenant needs a per-org refactor (e.g. `config/congregation__{orgId}`) — architectural, v11-05-03.
- **Service-personnel: NO collection** — read-join over `scheduling_assignments`+`tracks`+`users` (`src/lib/mcp/tools/service-personnel.ts`); inherits scoping once roster is scoped.
- **Backfill** (`src/lib/org/backfill-orgid.ts` TENANT_COLLECTIONS) covers setlists/tracks/library_index/songs/recordings only — NONE of the v11-05 collections. Prod wrapper `scripts/backfill-orgid-v11.mjs`.
v11-04 plans: **01 ✅ LOOP COMPLETE + SHIPPED + LIVE-VERIFIED** (`feat(v11-04-01)` `c606992756`; prod probe: BL /perform shows ZERO CRC setlists, CRC unchanged — the screenshotted leak is FIXED) · **02 ✅ LOOP COMPLETE + SHIPPED + LIVE-VERIFIED** (`feat(v11-04-02)` `f50060e387`; prod probe: BL /perform tab title + "Brothers Lazaroff" wordmark org-aware, CRC byte-identical — the last visible CRC remnant is closed) · **03 ⏳ NEXT (needs PLAN)** onboarding + authed-dashboard read scoping (getUpcoming/getRecent/getSetlistsPage + non-/perform subscribeToAllSetlists callers: DashboardClient, SetlistDrawer, use-add-to-setlist, use-setlist-dashboard) + e2e UAT.
**v11-04 LIVE FINDINGS (2026-06-08, prod probe + Daniel screenshot):** brotherslazaroff.live www routing+navy chrome CORRECT, but consumer surface leaks CRC: (1) `getAllSetlists` unscoped → `/perform` shows CRC setlists [→ v11-04-01], (2) `PublicSetlistListing` hardcodes "CRC Music" wordmark [→ v11-04-02], (3) root-layout static metadata = "Central Reform Congregation" tab title [→ v11-04-02], (4) apex on Squarespace "Coming Soon" [→ OPS/Daniel]. CONTEXT.md has full detail. Note: /perform was ISR `revalidate=60` path-keyed (shared across both hosts) → v11-04-01 makes it per-host dynamic.
v11-03 (✅ COMPLETE — 3 vertical plans, phase commit `feat(v11-03)` pushed to prod):
- **v11-03-01** ✅ org-context foundation: proxy `x-org-id` → `<html data-org>` + `OrgProvider`/`useOrg` (defaults crc outside provider). No visual change.
- **v11-03-02** ✅ BL navy dark+photographic chrome: scoped `[data-org="brotherslazaroff"]`+`.dark[data-org=...]` CSS-var block (hue 252 vs CRC 275), `forcedTheme=dark`, `getOrgBranding()`, org-aware login hero/wordmark. CRC untouched.
- **v11-03-03** ✅ vocab + UI trim: `label(org,key)` + `hidesLiturgicalFields()`; SetlistMetaEditSheet hides service-type+rabbi for BL, band vocab. CRC unchanged. **DEFERRED to v11-04:** CreationWizard/perform/display-card vocab (needs org-scoped congregation+templates).
Final gate: tsc clean; full unit 3292/0; eslint 0 err.
**LIVE-VERIFIED 2026-06-08 on brotherslazaroff.live:** `<html data-org="brotherslazaroff">` + "Brothers Lazaroff" wordmark render; CRC still `data-org="crc"`. Required a hotfix `fix(v11-03)` `30bc6c7483`: layout/login were passing the `x-org-id` header (an org id) through `resolveOrgIdByDomain` (matches DOMAINS) → fell to crc default; CRC masked it. Fix = new `coerceOrgId()` (validate as org id). **Lesson: host→org seam needs a deployed-surface probe; CRC-default masks BL misresolution, and no-local-dev means prod is the only place it shows.**
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
- **RESOLVED 2026-06-09 (prod-config, no code): BL Google sign-in was broken** — `brotherslazaroff.live`/`www.` weren't in Firebase Auth → Authorized domains, so signInWithPopup threw `auth/unauthorized-domain` (proven live via Playwright). Fixed by adding both via new `scripts/add-auth-domains.mjs` (Identity Toolkit admin API, firebase-CLI-token auth). Re-verified live: sign-in now reaches Google OAuth. **REUSABLE GOTCHA: every new tenant host must be added to authorizedDomains** (project-wide config) or web sign-in silently fails. authorizedDomains now: localhost, crcmusiccharts.firebaseapp.com, crcmusiccharts.web.app, sheet-music-app.vercel.app, centralreform.live, brotherslazaroff.live, www.brotherslazaroff.live.
- **Prod-script auth note (reusable):** this box has NO Firebase Admin SA creds in `.env.local` and no gcloud. Admin-SDK prod scripts authenticate by converting the firebase CLI login's refresh token (`~/.config/configstore/firebase-tools.json` → `tokens.refresh_token`) into a temp `authorized_user` ADC json (with the public firebase-tools OAuth client_id/secret) and pointing `GOOGLE_APPLICATION_CREDENTIALS` at it; delete the temp file after. `firebase deploy` (rules/indexes — v11-01-04) uses the CLI directly, so it needs no ADC. The runner now supports cert(.env.local) OR applicationDefault(GOOGLE_APPLICATION_CREDENTIALS).

## Session Continuity

Last session: 2026-06-09 (cont.) — v11-05-01/02/03 all full loops, committed local, unpushed (ahead 4). Decisions baked: deploy=batch-at-close; roster=multi-org via doc.orgIds; assignments=single orgId from setlist.
Stopped at: v11-05-04 PLAN created (3 of 5 loop-complete; 04 awaiting APPLY). Commits e166be2928 (01) · 87483e29b9 (02) · 9568fdc7a4 + f294812ace (03). NOT pushed (ahead 5).
Next action: **/paul:apply .paul/phases/v11-05-collection-scoping/v11-05-04-PLAN.md** (autonomous; congregation per-org doc-id namespacing — best run with fresh context given breadth: client store + 5 server reads + seed + tests). Then 05 (creation-wizard+vocab, /ui-ux-pro-max BLOCKING) → phase-close scripts (backfill-orgid-v11 HARD + user-orgids + david-claim + assignment-orgids + seed-bl-congregation) + push → **v11-06** isolation audit.
v11-05-03 plan grounding (verified vs deployed code 2026-06-09): create path = assignMusiciansService (one site, HTTP+MCP both delegate) reads setlist in-tx → stamp orgId. Cross-tenant reads to scope: client subscribeToAllUpcomingAssignments (scheduling-firebase.ts:76); web suggest-band:46 (playcount/window) + history:30 (assignments analytics + scheduling_history:18) + remind:28 (no-setlistId branch only); MCP listPendingAssignments(563) + list_musicians_on_date(449, scope matchedSetlists) + suggestBand recentSnap(797) + list_service_personnel(sibling). INHERIT (no change): suggest route(setlistId), calendar-feed(uid), suggestMusicians assignments(setlistId), new-song-detector(uid), cron/scheduling-reminder(ALL-tenant by design — reminders to musicians, no caller leak), fan-outs(profile/setlist rename+delete). Single orgId via new rowOrg helper in membership.ts.
Resume file: **.paul/HANDOFF-2026-06-09.md** (refreshed session-2 pause — full resume context) → then v11-05-0{1,2}-SUMMARY + CONTEXT. PAUSED at context-limit 2026-06-09.
Git strategy: master (prod), tree clean, in sync with origin/master. Everything this session committed+pushed.
Resume context:
- **v11-03 taste calls (Daniel 2026-06-08, in CONTEXT.md):** dark+photographic BL chrome · pull brand from brotherslazaroff.com (navy accent + live-performance photos, rendered on dark canvas — note their *site* is light/navy, app chrome is dark) · per-tenant conditional vocab/UI (CRC literally unchanged).
- **Foundation seam:** `src/proxy.ts` forwards `x-org-id` (mirror of existing `x-nonce`); `resolveOrgIdByDomain` in `src/lib/org/registry.ts` already maps brotherslazaroff.live→brotherslazaroff (strips www.). New client `src/lib/org/org-context.tsx` (`OrgProvider`/`useOrg`); `<html data-org>` is the CSS hook for 02.
- DNS: separate ops doc `docs/brotherslazaroff-domain-setup.md` — Daniel does the Vercel + Squarespace clicks.
- v11-02 + v11-02b done: MCP tenant wall live + proven (caller-org seam orgFrom/rowOrg/stampOrg in src/lib/mcp/org-context.ts; reads + writes isolated); self-service minting org-aware (getPrimaryOrgForMinting in src/lib/org/membership.ts). David's bearer + claim issued; he can self-onboard.
- Canonical prod MCP endpoint: **https://www.centralreform.live/api/mcp** (apex 307→www; curl -L drops the auth header — hit www directly). Reusable e2e probe at scripts/e2e-bl-tenant-probe.mjs (DAVID_BEARER + CRC_BEARER env) — for the v11-05 isolation audit.
- DEFERRED to v11-04 (still cross-tenant): templates READ/LIST scoping, roster/musicians, congregation, service-personnel — read+write.
- UAT-PENDING: David's UX confirmation (self-onboard via login OR the manual bearer tokenId 93JMXhT1OspFsWDMmb9V). Server-side isolation proven.
- Local `next build` fails on `/api/cron/aggregate-corrections` (missing CRON_SECRET in .env.local — Vercel-injected) — NOT a code issue; rely on the Vercel build with env. Prod-script auth: firebase-CLI-token → temp ADC.

---
*STATE.md — digest, not archive. Target <100 lines.*
