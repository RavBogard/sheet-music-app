# Project State

> Re-baselined 2026-06-09 at the v11.1 milestone open. v11.0 loop records live in `.paul/MILESTONES.md` § v11.0 + `.paul/milestones/v11.0-ROADMAP.md`. Prior STATE recoverable via git history.

## Project Reference

See: .paul/PROJECT.md (updated 2026-06-07)

**Core value:** The band gets the right charts + recordings on their iPads each week, and Daniel authors setlists conversationally via Claude + MCP. Now MULTI-TENANT (2nd live tenant: Brothers Lazaroff on brotherslazaroff.live).
**Current focus:** v11.1 Brothers Lazaroff Post-Launch Fixes — make the 2nd tenant's lived experience correct (branding/vocab/library clutter) + give multi-org leaders a real authoring path. (v7.1 hardening continues in parallel via `.coord/`.)

## Current Position

Milestone: **v11.1 Brothers Lazaroff Post-Launch Fixes — 🚧 IN PROGRESS (opened 2026-06-09).** 4 phases, **1 complete (v11.1-02 ✅).**
Phase: **v11.1-02 (Multi-org membership + authoring) — ✅ COMPLETE 2026-06-09 (2/2 plans).** Next phase = **v11.1-01 (Org-aware authed branding, P0) — needs PLAN.**
Plan: **v11.1-02 both plans LOOP COMPLETE + SHIPPED.** 02-01 host-derived authoring bearer (`941e6856d1`); 02-02 admin org-membership toggle (`d466160601`). SUMMARYs in the phase dir.
Status: **Phase v11.1-02 transitioned (PROJECT.md evolved, ROADMAP phase→complete). Ready to plan v11.1-01.** On `master`, in sync with origin (tip after phase commit). package.json 11.0.0.
Last activity: 2026-06-09 — v11.1-02-02 APPLY+UNIFY (admin org-membership toggle; orgIds→claim+doc lockstep; /ui-ux-pro-max; unit 4/4; suite 3327/0; next build clean) → phase transition.

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

- **cwd branch:** `master`, in sync with `origin/master`. v11.1-02 shipped: `941e6856d1` (02-01) + `8d345c2a59` (02-02 + UAT) + the phase-transition commit. tag `v11.0.0` on the v11.0 close.
- Production branch is `master`; push `origin master` (NOT `master:main`).
- Multi-computer — `git pull` before starting next session.

## Loop Position

```
PLAN ──▶ APPLY ──▶ UNIFY        [v11.1-02 — PHASE COMPLETE 2026-06-09; next phase v11.1-01]
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
Stopped at: **Phase v11.1-02 COMPLETE + transitioned** (both plans shipped; PROJECT.md evolved; ROADMAP phase→complete). Multi-org authoring path is live: admin grants `orgIds` membership in /manage → leader authors per-tenant via that tenant's MCP URL.
Next action: **`/paul:plan` for v11.1-01 (Org-aware authed branding, P0)** — make DesktopHeader/MobileHeader wordmark+logo resolve from the host org (broslaz still shows "CRC Music" + /logo.jpg on its authed nav); broslaz congregation doc already correct; CRC byte-identical; **/ui-ux-pro-max BLOCKING**. Then v11.1-03 (library visibility, P1) + v11.1-04 (vocab, P1).
Resume file: **.paul/HANDOFF-2026-06-09-v11.1-02-complete.md** (full session-6 handoff) → next is `/paul:plan` v11.1-01. Milestone reference: .paul/ROADMAP.md.
Git strategy: master (prod), in sync with origin/master (tip `648c0a3278`). `git pull` first next session (multi-computer); push `origin master`.
Standing UAT-PENDING (non-blocking): Daniel — connect Claude Desktop to `https://www.brotherslazaroff.live/api/mcp` + author a test setlist; admin — set a leader's Band access in /manage → People.

---
*STATE.md — digest, not archive. Target <100 lines.*
