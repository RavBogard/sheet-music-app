# Project State

> Re-baselined 2026-06-09 at the v11.1 milestone open. v11.0 loop records live in `.paul/MILESTONES.md` § v11.0 + `.paul/milestones/v11.0-ROADMAP.md`. Prior STATE recoverable via git history.

## Project Reference

See: .paul/PROJECT.md (updated 2026-06-07)

**Core value:** The band gets the right charts + recordings on their iPads each week, and Daniel authors setlists conversationally via Claude + MCP. Now MULTI-TENANT (2nd live tenant: Brothers Lazaroff on brotherslazaroff.live).
**Current focus:** v11.1 Brothers Lazaroff Post-Launch Fixes — make the 2nd tenant's lived experience correct (branding/vocab/library clutter) + give multi-org leaders a real authoring path. (v7.1 hardening continues in parallel via `.coord/`.)

## Current Position

Milestone: **None active** (v11.2 ✅ COMPLETE 2026-06-11, tag `v11.2.0`). Running a **standalone phase** off the stress-test report's INCOMPLETE item 3.
Phase: **loginable-test-accounts** (standalone — stress-test browser-run enablement) — ✅ COMPLETE 2026-06-10 (2/2 plans, both LOOP COMPLETE).
Plan: **01 ✅** (`create_test_account({loginable})` enabled-account + one-time QR-custom-token login URL + `/test-login` consume route + qr-sessions cascade) · **02 ✅** (hourly `/api/cron/disable-expired-test-accounts` disable + `revokeRefreshTokens` + `/api/auth/session` expired-loginable rejection + checkRevoked audit confirmed clean).
Status: **Phase content-complete; committed + pushed to `master`.** Gates green every loop: tsc clean · emulator `mcp-test-tokens` 34/34 · `SKIP_ENV_VALIDATION=1 next build` clean (`/test-login` + cron route registered). UAT-PENDING (live/safe): browser persona sign-in end-to-end + AC-2 session-mint rejection deployed-surface check.
Last activity: 2026-06-10 — `/paul:apply` executed both plans; `/paul:plan` had created them after verifying deployed test-tokens/QR/session/auth code. Both Daniel decisions (2026-06-10) baked in: login = one-time custom-token URL via the QR mechanism (QR PUT-approval confirmed hard-coupled to device handoff → `/test-login`, no static secret); TTL = cron disable + `revokeRefreshTokens` + session-mint check + `verifySessionCookie(cookie,true)`.

**Tenancy model (locked 2026-06-09 — the spec everything derives from):**
- **Consumers (musicians + members):** NOT per-org-gated; anyone uses either site. The **landing-page host** determines the experience (branding/setlists/library) via the `x-org-id` proxy header / `<html data-org>`. Consistent with err-public.
- **Band leaders:** explicit `orgIds` membership (CRC / broslaz / both) set via a NEW admin toggle (today hand-set via scripts). The **authoring** tier.

## Milestone Phases (v11.2 — ACTIVE)

| Phase | Focus | Priority |
|-------|-------|----------|
| v11.2-01 | **BUG-1** `propose_setlist_changes`/`commit_staged_changes` 404 on MCP UUID-id setlists → consolidate to the shared `getSetlistById` resolver; restores stage→confirm→commit | P0 — critical path |
| v11.2-02 | **BUG-9** publish-audience org scoping — VERIFY FIRST whether `publish_setlist` recipient query filters on `orgId` (BL preview showed CRC roster size 17); add filter if absent. Side-effectful → STOP-gate before any real publish | P1 — verify-first |
| v11.2-03 | **BUG-2 + BUG-3** MCP error contract — deterministic client errors as 500 (→404/400/409) + bulk per-row bare-string errors → structured `{machine_code}` envelope | P1/P2 |
| v11.2-04 | **BUG-4 + BUG-5** publish/test-data hygiene — `preview_publish` flag unbonded `type:song` rows + `cleanup_all_test_data` sweep owner-real `isTest` setlists + dashboard `isTest` filter | P2 |
| v11.2-05 | **BUG-6 + BUG-7 + BUG-8** P3 polish — "CRC MUSIC" authed-header brand leak on broslaz · text/plain chord-over-lyric fragmentation · ISO timestamp serialization at MCP boundary | P3 |

(v11.1 phases — all ✅ COMPLETE 2026-06-09 — archived to `.paul/milestones/v11.1-ROADMAP.md` + MILESTONES.md § v11.1.)

**Root-cause evidence (traced this session, deployed code + prod Firestore):**
- **Branding:** `src/components/nav/DesktopHeader.tsx:106-107` + `MobileHeader.tsx:34-41` hardcode `/logo.jpg` + "Central Reform Congregation" alt; wordmark resolves to CRC/default congregation, not host org. broslaz congregation doc IS correct.
- **Authoring:** Daniel's MCP setlist landed `orgId:'crc'` (confirmed in prod, since DELETED at his request — `bd3b549c`, verified gone). Cause: authored via crc-pinned bearer (`getPrimaryOrgForMinting`→`orgIds[0]`='crc'); MCP forbids caller org selector (v11-06-02). Zero broslaz setlists in prod. Dashboard scoping itself works.
- **Library:** unscoped reads — `src/app/api/library/list/route.ts`, `getServerLibrary`/`getServerLibraryLean` (`src/lib/server-library.ts`), recordings subscribe (`src/lib/recordings/recordings-client.ts`). MCP `list_library`/`search_library` already filter via `rowOrg`.
- **Vocab:** v11-05-05 vocab pass missed "Plan Service/Show" + "Upcoming Services" for broslaz.

## Git State

- **cwd branch:** `master`, in sync with `origin/master` (tip `f27ae7bc5f` — **v11.2-05 phase complete: BUG-8**, session 12; Vercel auto-deploy). v11.2 phase commits: 01 `6920d61668` · 02 `6079d4e3cf` · 03-01 `54cd7ba3bc` · 03-02 `ebb520164d` · 04-01 `90774a7e76` · 04-02/phase-04 `52a3dea57d` · 05-01 `06f2db3176` · 05-02/phase-05 `f27ae7bc5f`. **tag `v11.2.0`** on the v11.2 close (annotated, on `f27ae7bc5f`). **tag `v11.1.0`** on the v11.1 close (`29d9a96878`). v11.1 phase commits: 01 `72f1cdb66e` · 02 `941e6856d1`+`8d345c2a59` · 03 `3d7471679e` · 04 `4490abe53c`. tag `v11.0.0` on the v11.0 close.
- Production branch is `master`; push `origin master` (NOT `master:main`).
- Multi-computer — `git pull` before starting next session.

## Loop Position

```
PLAN ──▶ APPLY ──▶ UNIFY        [loginable-test-accounts: both plans LOOP COMPLETE]
  ✓        ✓        ✓
```

## Execution Substrate (bongo .coord/)

- Roles: supervisor / auditor / coder (specs in `.coord/{SUPERVISOR,AUDITOR,CODER}.md`). ≤5 concurrent coder ceiling; cowork runs are Daniel-run (coders only author PROMPT.md).
- v7.1 Production Hardening continues here (cycle-13 charter `.coord/cycle-13-CHARTER.md`) — independent of the PAUL loop.

## Accumulated Context

### Decisions (binding — full set in auto-memory + `.coord/shared/decisions.md`)
- MCP-first authoring pivot (2026-05-15): browser app is the band/consumer surface only.
- `err-public` invariant (2026-05-28): never gate data from musicians/performers (holds WITHIN a tenant; hard wall ACROSS tenants).
- Always-proceed / no decision-blocks (2026-05-28): agents proceed autonomously on in-scope work.
- **v11.x AUTONOMY directive (2026-06-08, carried into v11.1):** run autonomously — waive PAUL approval/continuation gates; auto-commit + push per phase to prod `master`; bake decisions into PLANs; Firebase deploys + backfills as AUTO tasks (single-owner = executor). **QUALITY FLOOR HELD (non-negotiable):** tsc clean + tests green + AC proof every task; `SKIP_ENV_VALIDATION=1 npx next build` before declaring any shared-lib/client phase deployable; emulator-backed rules tests where rules change; /ui-ux-pro-max BLOCKING on UI phases (01/03/04); backfills get dry-run + idempotency marker + rollback. **STOP only for:** product ambiguity, an unresolvable quality-gate failure, or a discovered cross-tenant LEAK / CRC lock-out. See [[feedback_v11_autonomous_milestone]].
- **v11.1 authoring-org call RESOLVED (Daniel 2026-06-09):** authoring org = the **tenant domain the leader connects Claude Desktop to** (mint paths read the proxy's `x-org-id`, validated ∈ caller's `orgIds`, else primary-org fallback). Pins at mint time, NOT a tool arg → v11-06-02 invariant fully preserved. No manual stopgap (Daniel declined). Shipped v11.1-02-01. Canonical broslaz MCP URL: `https://www.brotherslazaroff.live/api/mcp` (www direct; apex 308-redirects).
- **v11.1-02-02 (2026-06-09):** admin org-membership set via the `/manage` People list (tri-state Band-access control, admin-only, band_leader/admin rows); `/api/admin/set-role` now writes `orgIds` to BOTH the Auth claim and the user doc (claim+doc lockstep) so People-list display + roster filtering (v11-05-02 rowOrgIds) reflect changes immediately. Control scoped to the authoring tier per Daniel (consumers stay host-derived).

### Deferred Issues
- **SERVICE_TYPE_LABELS vocab-table (v11.1-04 defer, 2026-06-09):** Shabbat Morning/Friday Night/Erev Shabbat/Rosh Hashanah labels hardcoded in SetlistCards/CreationWizard/SetlistMetaEditSheet/interview-defaults + SetlistMatrixView `<option>`s. Gated-away for broslaz (selector hidden via `hidesLiturgicalFields`) → NOT a live remnant. Convert to a vocab-driven table only if a non-synagogue tenant needs service-type categories.
- **recordings-collection org-scoping (v11.1-03 defer, 2026-06-09):** `subscribeRecordingsForSong` (RecordingBindPopover) is songId-only (no org filter) AND `/api/recordings/upload:107` hardcodes `orgId: DEFAULT_ORG_ID` → host-filtering the subscribe now would hide ALL recordings on broslaz. Fix: stamp the upload from host x-org-id, THEN host-filter the subscribe. Small follow-up; distinct from the Library-tab chart clutter (library_index audio rows ARE covered by v11.1-03).
- v11-06 residuals (low-risk, in AUDIT.md): setlistTemplates app-only; scheduling_history orgId-absent rows; users claim-based (no orgId field).
- v7.0 fold-forward backlog (`MILESTONES.md` § v7.0) — re-triage what's still live.
- ROADMAP.md / PROJECT.md / MILESTONES.md carry full historical detail intentionally (archive — collapse, don't delete); only STATE has a hard size target.

### Blockers/Concerns
- None active.
- **REUSABLE LESSON (2026-06-09): `tsc` + `vitest` do NOT catch client/server bundle-boundary breaks — only `next build` does.** v11-05 shipped a deploy that ERRORED at compile (`Can't resolve 'fs'`) because client modules imported `org/membership.ts` whose lazy `firebase-admin` import was pulled into the client bundle. Run `SKIP_ENV_VALIDATION=1 npx next build` before declaring any shared-lib/client phase deployable. Keep pure helpers (rowOrg etc.) in firebase-admin-free modules; server resolvers in `*-server.ts`.
- **REUSABLE GOTCHA: every new tenant host must be added to Firebase Auth authorizedDomains** or web sign-in silently fails (`auth/unauthorized-domain`). broslaz hosts already added (scripts/add-auth-domains.mjs).
- **Prod-script admin auth on this box:** no SA creds / no gcloud. Admin-SDK scripts convert the firebase CLI refresh-token → temp `authorized_user` ADC (firebase-tools public OAuth client) → `GOOGLE_APPLICATION_CREDENTIALS`; delete temp file after. `firebase deploy` (rules/indexes) uses the CLI directly.
- **No `(orgId, createdAt)` composite index** on `setlists` (surfaced 2026-06-09 querying prod) — `(orgId, date)` exists (v11-04-01). Add if a createdAt-ordered org query is ever needed.

### Reusable assets / endpoints
- Live isolation probe: `scripts/e2e-bl-tenant-probe.mjs` (DAVID_BEARER + CRC_BEARER). CRC bearer: `CRC_BEARER=$(node scripts/supervisor-prod-bearer.mjs)`.
- Claim-free throwaway BL bearer: `scripts/mint-throwaway-bl-bearer.mjs` (`--apply` / `--revoke <id>`) — does NOT touch David's claim (issue-bl-bearer.mjs would overwrite his orgIds → drop crc).
- MCP endpoint: `https://www.centralreform.live/api/mcp` (hit www directly; apex 307 drops auth header).

## Session Continuity

Last session: 2026-06-10 — `/paul:plan` → `/paul:apply` for the standalone **loginable-test-accounts** phase. Verified deployed code (test-tokens.ts, QR auth route + approver page, session route, auth-context/LoginClient, CASCADE_FIELDS); surfaced that consumer login is Google+QR only (no email/password) → Daniel chose the QR-custom-token URL path + cron-disable+revoke TTL. Executed both plans, all gates green, committed + pushed `1eca4b4b6a`.
Stopped at: **loginable-test-accounts phase ✅ COMPLETE + pushed to `master`. Working tree clean. No active loop.**
Next action: **`/paul:discuss-milestone`** to scope the next milestone — OR the stress-test browser run can now proceed (this tooling unblocks it) — OR resume v7.1 `.coord/` hardening (cycle-13). No blocking PAUL work.
Resume file: **.paul/HANDOFF-2026-06-10-loginable-test-accounts.md** (this pause). Phase artifacts in `.paul/phases/loginable-test-accounts/` (01/02 PLAN + SUMMARY); source `.paul/research/TOOLING-BRIEF-test-account-login.md`.
Resume context:
- `create_test_account({loginable:true})` → enabled account (no password) + one-time `/test-login?code=` URL (pre-approved single-use qr-sessions custom-token doc); TTL enforced by hourly `disable-expired-test-accounts` cron (disable + `revokeRefreshTokens`) + session-mint rejection. Default path byte-identical.
- QR PUT-approval is hard-coupled to physical-device handoff (mints for the approver's own uid) → reused only the qr-sessions store + GET-consume; public `/login` + `/qr/[code]` untouched.
- Daniel paces with "go" per PAUL step; autonomy posture binding (auto-commit+push per plan to master).
Git strategy: master (prod). `git pull` first next session (multi-computer); push `origin master` (NOT master:main).
**Open UAT-PENDING (live/safe, `.paul/UAT-PENDING.md`):** THIS phase — browser persona sign-in via a minted `loginUrl` + re-open-fails (single-use) + AC-2 expired-account session-mint rejection + admin-loginable-refused. EARLIER (unchanged) — v11.2 BL-connector reconnect → BUG-1 create→propose→commit + BUG-9 `preview_publish` BL roster size; v11.1 broslaz authed-surface checklist (nav/library/dashboard/matrix/MCP-authoring/admin-membership, CRC unchanged).

---
*STATE.md — digest, not archive. Target <100 lines.*
