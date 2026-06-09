# Project State

> Re-baselined 2026-06-07. Prior 1255-line STATE recoverable from git history (`git show HEAD~1:.paul/STATE.md` relative to the re-baseline commit).

## Project Reference

See: .paul/PROJECT.md (updated 2026-06-07)

**Core value:** The band gets the right charts + recordings on their iPads each week, and Daniel authors setlists conversationally via Claude + MCP.
**Current focus:** v11.0 Brothers Lazaroff Multi-Tenant — make the app multi-tenant so David Lazaroff gets his own org-scoped instance on brotherslazaroff.live. (v7.1 hardening continues in parallel via `.coord/`.)

## Current Position

Milestone: **v11.0 Brothers Lazaroff Multi-Tenant** (ACTIVE — created 2026-06-08 via /paul:milestone)
Phase: **v11-04 BL consumer surface + onboarding ✅ COMPLETE (3/3, 2026-06-09)** → next: **v11-05 cross-tenant collection scoping** (NOT STARTED — ready to plan/discuss). v11-01 ✅ · v11-02 ✅ · v11-02b ✅ · v11-03 ✅ · v11-04 ✅. **6 numbered phases** (Daniel SPLIT 2026-06-08).
Plan: **v11-04-03 ✅ LOOP COMPLETE + SHIPPED + LIVE-VERIFIED** (`feat(v11-04-03)` `6b1ba7f189` pushed origin master, Vercel prod live ~05:00; deployed probe: BL /api/setlists/page → `items:[]` (zero CRC leak), CRC unchanged (returns its setlists)). Org-scoped the authed dashboard reads: opt-in `org` on getSetlistsPage/getUpcoming/getRecent + both getSetlistsPage callers thread `x-org-id` + the 4 client subscribeToAllSetlists callers pass `useOrg()`. **DEFERRED/FLAG → v11-05:** in-app CreationWizard setlist-create orgId stamping (an in-app-created BL setlist would be invisible in the scoped dashboard; MCP create already stamps). v11-04 decomposition: **01 ✅** web-read scoping · **02 ✅** branding/metadata · **03 ✅** authed-read scoping.
Status: **v11-04 PHASE COMPLETE — all 3 plans shipped + live-verified.** Cross-tenant READ surface fully closed (public /perform + consumer branding + authed dashboard). BL on brotherslazaroff.live: own branding/metadata, BL-only reads, sign-in working. CRC provably unchanged throughout. Authed-dashboard UX confirmation for David → UAT-PENDING.
Last activity: 2026-06-09 — v11-04-02 + v11-04-03 both applied/verified/shipped in one session. This session: /paul:resume → applied v11-04-02 (branding) + live-verified → planned+applied v11-04-03 (authed-read scoping) + live-verified → v11-04 phase complete. 5 commits pushed (f50060e387, 67425d3fda, 317f2d58a7, 6b1ba7f189 + this phase-close). tsc clean; full suite 3304/0; eslint 0.

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
PLAN ──▶ APPLY ──▶ UNIFY        [v11-04 PHASE COMPLETE (3/3) — next: PLAN v11-05]
  ✓        ✓        ✓     (v11-04-01/02/03 all SHIPPED + LIVE-VERIFIED)
```
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

Last session: 2026-06-09 — `/paul:resume` → applied v11-04-02 (consumer branding/metadata) + live-verified → planned + applied v11-04-03 (authed-dashboard read scoping) + live-verified → **v11-04 phase COMPLETE (3/3)**. /ui-ux-pro-max loaded (BLOCKING, both UI plans). 5 commits pushed to origin master. tsc clean throughout; full suite 3304/0; eslint 0.
Stopped at: v11-04 PHASE COMPLETE + SHIPPED + LIVE-VERIFIED. Last commit `feat(v11-04-03)` `6b1ba7f189` + phase-close docs commit. Deployed probe: BL /api/setlists/page `items:[]`, CRC unchanged. Working tree clean (after this STATE bump).
Next action: **/paul:plan v11-05** (cross-tenant collection scoping) — likely needs /paul:discuss-phase first (spans many subsystems): templates READ/LIST + roster/musicians + congregation + service-personnel R+W scoping; CreationWizard/perform-view/display-card vocab (deferred from v11-03/04); AND the in-app CreationWizard **setlist-create orgId stamping** flagged by v11-04-03 (an in-app-created BL setlist currently won't appear in the now-scoped dashboard — MCP create already stamps). Decompose into vertical slices. Then **v11-06** = isolation audit (use scripts/e2e-bl-tenant-probe.mjs).
Resume file: none (v11-04 phase complete; all plans closed).
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
