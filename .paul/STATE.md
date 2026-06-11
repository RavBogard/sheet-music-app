# Project State

> Re-baselined 2026-06-09 at the v11.1 milestone open. v11.0 loop records live in `.paul/MILESTONES.md` § v11.0 + `.paul/milestones/v11.0-ROADMAP.md`. Prior STATE recoverable via git history.

## Project Reference

See: .paul/PROJECT.md (updated 2026-06-07)

**Core value:** The band gets the right charts + recordings on their iPads each week, and Daniel authors setlists conversationally via Claude + MCP. Now MULTI-TENANT (2nd live tenant: Brothers Lazaroff on brotherslazaroff.live).
**Current focus:** v11.3 Worthiness & Access — close the post-stress-test anon-read / agent-upload / hygiene / perf / polish findings (oracle `docs/ACCESS-POLICY.md` v0.3). Phases v11.3-01 (anon access), v11.3-02 (agent chart-upload), v11.3-03 (harness & hygiene) ✅ shipped; next is v11.3-04 (/perform performance — BUG-2). (v7.1 hardening continues in parallel via `.coord/`.)

## Current Position

Milestone: **🚧 v11.3 — Worthiness & Access** (OPEN 2026-06-10; 5 phases, plans TBD). Created via `/paul:milestone` from `.paul/research/MILESTONE-BRIEF-2026-06-10-worthiness-access.md`. Oracle: `docs/ACCESS-POLICY.md` **v0.3**. (v11.2 ✅ COMPLETE 2026-06-11, tag `v11.2.0`; standalone loginable-test-accounts phase ✅ COMPLETE 2026-06-10.)
Phase: **v11.3-04 /perform performance** (P2) — Not started. (v11.3-03 ✅ COMPLETE 2/2 2026-06-10; v11.3-02 ✅; v11.3-01 ✅. 3/5 phases done.)
Plan: **None active.** Next: `/paul:plan` for v11.3-04 (BUG-2 — p75 LCP 2600/FCP ~3100/TTFB ~1450ms + CLS 0.15→0.2; VERIFY-FIRST cold vs steady, suspect chart-image reflow).
Status: **Phase v11.3-03 ✅ COMPLETE — committed + pushed to `master`.** BUG-9 + BUG-7 + BUG-1 in one `feat(v11.3-03)` commit; gates green; CRC byte-identical. BUG-1 prod was already clean (durable orphan-sweep coverage shipped). Ready to plan v11.3-04.
Last activity: 2026-06-10 — `/paul:unify` v11.3-03-02 + phase-close transition: SUMMARY written, PROJECT/ROADMAP evolved, phase committed + pushed (Vercel auto-deploy).

**Tenancy model (locked 2026-06-09 — the spec everything derives from):**
- **Consumers (musicians + members):** NOT per-org-gated; anyone uses either site. The **landing-page host** determines the experience (branding/setlists/library) via the `x-org-id` proxy header / `<html data-org>`. Consistent with err-public.
- **Band leaders:** explicit `orgIds` membership (CRC / broslaz / both) set via a NEW admin toggle (today hand-set via scripts). The **authoring** tier.

## Milestone Phases (v11.3 — ACTIVE)

| Phase | Focus | Priority |
|-------|-------|----------|
| v11.3-01 | **BUG-5 + BUG-4** Anon access correctness — anon Storage-backed (`upload-*`) chart deep links return 401 (VERIFY-FIRST cold-device) + anon transpose/AI-scan dead-end → anon path for scan + chord-cache with abuse rate-limits (D-Q2). Don't regress authed transpose; don't double-punish F-6 429s | **P1** — prime-directive |
| v11.3-02 | Agent chart-upload path — `import_chart_from_drive` accepts `.docx` + Google Docs, converts to PDF server-side (refs not bytes); secondary chunked inline `upload_chart`. Cowork sandbox proxy out of scope | **P1** — David's report |
| v11.3-03 | **BUG-9 + BUG-7 + BUG-1** Harness & hygiene — `/test-login` missing from `proxy.ts` `publicPrefixes` + QR malformed-code 500→4xx + orphan `[role-*]` library_index rows (VERIFY-FIRST revoke/cleanup cascade coverage) | P2 |
| v11.3-04 | **BUG-2** /perform performance — p75 LCP 2600/FCP ~3100/TTFB ~1450ms + CLS regressed 0.15→0.2 (VERIFY-FIRST cold vs steady; suspect chart-image reflow). Comparator /setlists CLS 0.02 | P2 |
| v11.3-05 | **BUG-6 + F-6** P3 polish — broslaz PWA manifest serves app shell (proxy matcher) + cold-load `/api/auth/qr`+`/api/web-vitals` 429 self-heal (rate-limit tuning / backoff) | P3 |

**Oracle:** `docs/ACCESS-POLICY.md` v0.3 — a finding is a bug only if it contradicts a cell. **Scope walls:** D8 publish/notify → v11.4; BUG-3/BUG-8/Policy-Q1 closed (D7/D4-rev1/D-Q1, no code); F-4 + Cowork proxy out; D2 anon recordings stays the ⚠️ veto cell (BUG-5 is charts only).

(v11.2 phases — all ✅ COMPLETE 2026-06-11 — archived to `.paul/milestones/v11.2.0-ROADMAP.md` + MILESTONES.md § v11.2. v11.1 ✅ 2026-06-09 — `.paul/milestones/v11.1-ROADMAP.md`.)

**Root-cause evidence (traced this session, deployed code + prod Firestore):**
- **Branding:** `src/components/nav/DesktopHeader.tsx:106-107` + `MobileHeader.tsx:34-41` hardcode `/logo.jpg` + "Central Reform Congregation" alt; wordmark resolves to CRC/default congregation, not host org. broslaz congregation doc IS correct.
- **Authoring:** Daniel's MCP setlist landed `orgId:'crc'` (confirmed in prod, since DELETED at his request — `bd3b549c`, verified gone). Cause: authored via crc-pinned bearer (`getPrimaryOrgForMinting`→`orgIds[0]`='crc'); MCP forbids caller org selector (v11-06-02). Zero broslaz setlists in prod. Dashboard scoping itself works.
- **Library:** unscoped reads — `src/app/api/library/list/route.ts`, `getServerLibrary`/`getServerLibraryLean` (`src/lib/server-library.ts`), recordings subscribe (`src/lib/recordings/recordings-client.ts`). MCP `list_library`/`search_library` already filter via `rowOrg`.
- **Vocab:** v11-05-05 vocab pass missed "Plan Service/Show" + "Upcoming Services" for broslaz.

## Git State

- **cwd branch:** `master`, in sync with `origin/master` (tip `89f4af7fd2` — **v11.3-02 phase complete: agent chart-upload path** [Drive convert + chunked inline]; pushed `da68316dbb..89f4af7fd2` 2026-06-11; Vercel auto-deploy). Prior: v11.3-01 `bc8f935aa2` · v11.2 `f27ae7bc5f`. v11.2 phase commits: 01 `6920d61668` · 02 `6079d4e3cf` · 03-01 `54cd7ba3bc` · 03-02 `ebb520164d` · 04-01 `90774a7e76` · 04-02/phase-04 `52a3dea57d` · 05-01 `06f2db3176` · 05-02/phase-05 `f27ae7bc5f`. **tag `v11.2.0`** on the v11.2 close (annotated, on `f27ae7bc5f`). **tag `v11.1.0`** on the v11.1 close (`29d9a96878`). v11.1 phase commits: 01 `72f1cdb66e` · 02 `941e6856d1`+`8d345c2a59` · 03 `3d7471679e` · 04 `4490abe53c`. tag `v11.0.0` on the v11.0 close.
- Production branch is `master`; push `origin master` (NOT `master:main`).
- Multi-computer — `git pull` before starting next session.

## Loop Position

```
PLAN ──▶ APPLY ──▶ UNIFY        [Phase v11.3-03 ✅ COMPLETE + committed — ready to PLAN v11.3-04]
  ○        ○        ○
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
- **v11.3-02 (2026-06-11):** agent chart-upload — `import_chart_from_drive` converts Google Docs (export) + `.docx`/Office (convert-on-copy) → PDF server-side (`DriveClient.fetchAsPdf` + `driveSourceIsConvertible`); inline chunked upload (`begin/append/commit_chunked_chart_upload`) on `upload_sessions`, commit delegates to `finalizeChartUpload` + org-stamps. Append NOT rate-limited (only begin+commit) to survive the 10/min cap on multi-chunk files. Cowork sandbox PUT-proxy out of scope (Anthropic-side).
- **v11.1-02-02 (2026-06-09):** admin org-membership set via the `/manage` People list (tri-state Band-access control, admin-only, band_leader/admin rows); `/api/admin/set-role` now writes `orgIds` to BOTH the Auth claim and the user doc (claim+doc lockstep) so People-list display + roster filtering (v11-05-02 rowOrgIds) reflect changes immediately. Control scoped to the authoring tier per Daniel (consumers stay host-derived).

### Deferred Issues
- **SERVICE_TYPE_LABELS vocab-table (v11.1-04 defer, 2026-06-09):** Shabbat Morning/Friday Night/Erev Shabbat/Rosh Hashanah labels hardcoded in SetlistCards/CreationWizard/SetlistMetaEditSheet/interview-defaults + SetlistMatrixView `<option>`s. Gated-away for broslaz (selector hidden via `hidesLiturgicalFields`) → NOT a live remnant. Convert to a vocab-driven table only if a non-synagogue tenant needs service-type categories.
- **recordings-collection org-scoping (v11.1-03 defer, 2026-06-09):** `subscribeRecordingsForSong` (RecordingBindPopover) is songId-only (no org filter) AND `/api/recordings/upload:107` hardcodes `orgId: DEFAULT_ORG_ID` → host-filtering the subscribe now would hide ALL recordings on broslaz. Fix: stamp the upload from host x-org-id, THEN host-filter the subscribe. Small follow-up; distinct from the Library-tab chart clutter (library_index audio rows ARE covered by v11.1-03).
- **finalize_chart_upload (signed-URL path) does not org-stamp (v11.3-02-02 defer, 2026-06-11):** the chunked `commit` stamps its result, but the signed-URL `finalize_chart_upload` flow shares finalize's missing-stamp gap → its uploads land default-org. Small follow-up: add `org` param to `finalizeChartUpload` + pass `orgFrom(extra)` in its handler. Out of scope of v11.3-02 to keep that path byte-stable.
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

Last session: 2026-06-10 — `/paul:resume` (reconciled, archived consumed handoff to `.paul/handoffs/archive/HANDOFF-2026-06-11-v11.3-02-complete.md`) → `/paul:plan` v11.3-03-01.
Stopped at: **Phase v11.3-03 ✅ COMPLETE + committed + pushed to `master`.** 2/2 plans LOOP COMPLETE. Working tree clean after the phase commit. 3/5 v11.3 phases done.
Next action: **`/paul:plan` for v11.3-04 /perform performance** (BUG-2) — p75 LCP 2600 / FCP ~3100 / TTFB ~1450ms + CLS regressed 0.15→0.2 on the highest-traffic route. **VERIFY-FIRST:** cold-load vs steady-state composition; suspect chart-image reflow for the CLS regression. Healthy comparator: /setlists LCP 1.1s / CLS 0.02. Each fix gets a regression cite.
**Reusable (this phase):** `scripts/v11-3-03-library-orphan-sweep.mjs` (admin-SDK via firebase-CLI refresh-token ADC; `--diagnose` / dry-run / `--apply`) — kept for future test-data hygiene probes. `sweep_orphan_test_data` now covers library_index orphans.
Resume file: **.paul/phases/v11.3-03-harness-hygiene/v11.3-03-01-PLAN.md**; ROADMAP § Phase v11.3-03. Oracle: `docs/ACCESS-POLICY.md` v0.3.
**Plan-02 carry (BUG-1, do NOT lose):** `CASCADE_FIELDS` already cascades `library_index` by `uploadedBy`, and `sweep_orphan_test_data` covers orphan setlists/templates **but NOT library_index** → the two `[role-*]` orphans are owner-record-absent rows the sweep can't reach. Plan 02 = extend the orphan sweep to `library_index` (+ emulator test citing the cell) **then** delete the two prod orphans (prod data op → single-owner executor). VERIFY-FIRST live probe of the two rows before deletion.
Resume context:
- Oracle-bound: a finding is a bug only if it contradicts a v0.3 ACCESS-POLICY cell; err-public prime directive holds.
- Scope walls (ratified): D8 publish/notify → v11.4; BUG-3 (RUM) / BUG-8 (member library) / browser Policy-Q1 closed by policy (no code); F-4 dup setlist + Cowork sandbox proxy out of scope; D2 anon **recordings** is the ⚠️ veto cell — BUG-5 is charts only, don't widen Phase 01 into recordings.
- Every fixed BUG gets a regression test citing the coverage-table cell it covers (Phase 01 + 03 re-verifiable via the stress prompt's cells).
- Daniel paces with "go" per PAUL step; autonomy posture binding (auto-commit+push per phase to master; quality floor held; /ui-ux-pro-max blocking on UI-touching phases).
- Carry-forward UAT (non-blocking, append to UAT-PENDING): anon recordings playback (D2), leader-crc UI authoring wall on broslaz (data ✅), Pass B offline degradation, leader create→reorder→delete in UI, QR single-use e2e — plus existing loginable-test-account items.
Git strategy: master (prod). `git pull` first next session (multi-computer); push `origin master` (NOT master:main).
**Open UAT-PENDING (live/safe, `.paul/UAT-PENDING.md`):** THIS phase — browser persona sign-in via a minted `loginUrl` + re-open-fails (single-use) + AC-2 expired-account session-mint rejection + admin-loginable-refused. EARLIER (unchanged) — v11.2 BL-connector reconnect → BUG-1 create→propose→commit + BUG-9 `preview_publish` BL roster size; v11.1 broslaz authed-surface checklist (nav/library/dashboard/matrix/MCP-authoring/admin-membership, CRC unchanged).

---
*STATE.md — digest, not archive. Target <100 lines.*
