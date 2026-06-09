# Project State

> Re-baselined 2026-06-09 at the v11.1 milestone open. v11.0 loop records live in `.paul/MILESTONES.md` § v11.0 + `.paul/milestones/v11.0-ROADMAP.md`. Prior STATE recoverable via git history.

## Project Reference

See: .paul/PROJECT.md (updated 2026-06-07)

**Core value:** The band gets the right charts + recordings on their iPads each week, and Daniel authors setlists conversationally via Claude + MCP. Now MULTI-TENANT (2nd live tenant: Brothers Lazaroff on brotherslazaroff.live).
**Current focus:** v11.1 Brothers Lazaroff Post-Launch Fixes — make the 2nd tenant's lived experience correct (branding/vocab/library clutter) + give multi-org leaders a real authoring path. (v7.1 hardening continues in parallel via `.coord/`.)

## Current Position

Milestone: **v11.1 Brothers Lazaroff Post-Launch Fixes — 🚧 IN PROGRESS (opened 2026-06-09).** 4 phases, 0 complete.
Phase: **v11.1-02 (Multi-org membership + authoring) — IN PROGRESS (1 of 2 plans done).** 02-01 authoring slice ✅ LOOP COMPLETE; **02-02 (admin org-membership toggle UI) = next, needs PLAN.**
Plan: **v11.1-02-01 ✅ LOOP COMPLETE** — host-derived authoring bearer (Build B). SUMMARY: `.paul/phases/v11.1-02-multiorg-authoring/v11.1-02-01-SUMMARY.md`.
Status: **v11.1-02-01 SHIPPED — pushed (`20d1adef33`), Vercel auto-deploy in flight; UAT queued.** Canonical broslaz MCP URL verified: `https://www.brotherslazaroff.live/api/mcp` (www direct; apex 308-redirects). package.json 11.0.0.
Last activity: 2026-06-09 — APPLY v11.1-02-01: host-derived authoring org (`resolveMintOrg`); both mint paths read host `x-org-id` validated ∈ orgIds. emulator 9/9 + arg-injection invariant green + suite 3323/0 + next build clean. Committed `941e6856d1`; UAT queued.

**Tenancy model (locked 2026-06-09 — the spec everything derives from):**
- **Consumers (musicians + members):** NOT per-org-gated; anyone uses either site. The **landing-page host** determines the experience (branding/setlists/library) via the `x-org-id` proxy header / `<html data-org>`. Consistent with err-public.
- **Band leaders:** explicit `orgIds` membership (CRC / broslaz / both) set via a NEW admin toggle (today hand-set via scripts). The **authoring** tier.

## Milestone Phases (v11.1)

| Phase | Focus | Priority |
|-------|-------|----------|
| v11.1-01 | Org-aware authed branding — DesktopHeader/MobileHeader wordmark+logo org-aware (hardcode `/logo.jpg` + CRC congregation today); CRC byte-identical | P0 |
| v11.1-02 | Multi-org membership toggle (orgIds CRC/broslaz/both) + MCP authoring target-org for "both" leaders (preserve v11-06-02 single-org lock) | P0 — critical path (unblocks Daniel's broslaz authoring) |
| v11.1-03 | Library generic-tab visibility — host-filter 4 unscoped reads + Shared flag + admin All-sites toggle + org-neutral broslaz tab labels; display-only | P1 |
| v11.1-04 | broslaz liturgical vocab sweep ("Plan Service/Show", "Upcoming Services"); CRC byte-identical | P1 |

**Root-cause evidence (traced this session, deployed code + prod Firestore):**
- **Branding:** `src/components/nav/DesktopHeader.tsx:106-107` + `MobileHeader.tsx:34-41` hardcode `/logo.jpg` + "Central Reform Congregation" alt; wordmark resolves to CRC/default congregation, not host org. broslaz congregation doc IS correct.
- **Authoring:** Daniel's MCP setlist landed `orgId:'crc'` (confirmed in prod, since DELETED at his request — `bd3b549c`, verified gone). Cause: authored via crc-pinned bearer (`getPrimaryOrgForMinting`→`orgIds[0]`='crc'); MCP forbids caller org selector (v11-06-02). Zero broslaz setlists in prod. Dashboard scoping itself works.
- **Library:** unscoped reads — `src/app/api/library/list/route.ts`, `getServerLibrary`/`getServerLibraryLean` (`src/lib/server-library.ts`), recordings subscribe (`src/lib/recordings/recordings-client.ts`). MCP `list_library`/`search_library` already filter via `rowOrg`.
- **Vocab:** v11-05-05 vocab pass missed "Plan Service/Show" + "Upcoming Services" for broslaz.

## Git State

- **cwd branch:** `master`, IN SYNC with `origin/master` (tip `02a6bcb27c`; tag `v11.0.0` pushed). Tree clean at milestone open.
- Production branch is `master`; push `origin master` (NOT `master:main`).
- Multi-computer — `git pull` before starting next session.

## Loop Position

```
PLAN ──▶ APPLY ──▶ UNIFY        [v11.1-02-01 — LOOP COMPLETE 2026-06-09; v11.1-02-02 next]
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
- **v11.1 authoring-org call RESOLVED (Daniel 2026-06-09):** authoring org = the **tenant domain the leader connects Claude Desktop to** (mint paths read the proxy's `x-org-id`, validated ∈ caller's `orgIds`, else primary-org fallback). Pins at mint time, NOT a tool arg → v11-06-02 invariant fully preserved. No manual stopgap (Daniel declined). Implemented in v11.1-02-01.

### Deferred Issues
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

Last session: 2026-06-09 — /paul:resume (v11.0 was complete) → Daniel surfaced 4 post-launch issues on brotherslazaroff.live → triaged each against deployed code (Explore agents) + prod Firestore (firebase MCP): confirmed branding leak, library leak, and the missing-setlist root cause (orgId:'crc'); DELETED the throwaway setlist `bd3b549c` (verified gone) per Daniel; locked the two-tier tenancy model → /paul:discuss-milestone → /paul:milestone created v11.1 (4 phases).
Stopped at: **v11.1-02-01 LOOP COMPLETE + SHIPPED** (host-derived authoring; broslaz MCP URL `https://www.brotherslazaroff.live/api/mcp`). Daniel's UAT (connect Claude Desktop to broslaz URL, author a test setlist) queued in UAT-PENDING — non-blocking.
Next action: **`/paul:plan` for v11.1-02-02** (admin org-membership toggle UI — set a leader's `orgIds` CRC/broslaz/both over the existing `/api/admin/set-role` orgIds support; **/ui-ux-pro-max BLOCKING**; no admin UI exists yet — a `/settings` route exists as a reference). Then phases 01/03/04.
Resume file: .paul/phases/v11.1-02-multiorg-authoring/v11.1-02-01-SUMMARY.md.
Git strategy: master (prod), in sync with origin/master (tip `02a6bcb27c`). `git pull` first next session (multi-computer); push `origin master`.

---
*STATE.md — digest, not archive. Target <100 lines.*
