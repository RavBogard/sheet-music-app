# Project State

> Re-baselined 2026-06-09 at the v11.1 milestone open. v11.0 loop records live in `.paul/MILESTONES.md` § v11.0 + `.paul/milestones/v11.0-ROADMAP.md`. Prior STATE recoverable via git history.

## Project Reference

See: .paul/PROJECT.md (updated 2026-06-07)

**Core value:** The band gets the right charts + recordings on their iPads each week, and Daniel authors setlists conversationally via Claude + MCP. Now MULTI-TENANT (2nd live tenant: Brothers Lazaroff on brotherslazaroff.live).
**Current focus:** **v11.5 — Bulletproof Performance** 🚧 (5 phases; oracle `docs/ACCESS-POLICY.md` v0.4; brief `.paul/research/MILESTONE-BRIEF-v11.5-bulletproof-performance.md`). Doctrine: bulletproof > novel; web app = performance + quick edits. **Phase v11.5-01 ✅ COMPLETE 3/3.** Now in **Phase v11.5-02 (performance surface)** — **Plan 01 (H3 seekable audio) ✅ SHIPPED `c687db99ee`** (1 of 4 plans). Next action: **`/paul:plan` Plan v11.5-02-02 (H7/F1 — TTFB verify-first + "tonight" entry)**. v7.1 hardening continues in parallel via `.coord/`.

## Current Position

Milestone: **🚧 v11.5 — Bulletproof Performance** (OPENED 2026-06-11; 5 phases; oracle `docs/ACCESS-POLICY.md` **v0.4**; brief `.paul/research/MILESTONE-BRIEF-v11.5-bulletproof-performance.md`; context `MILESTONE-CONTEXT.md` consumed + deleted). Phase dirs created under `.paul/phases/v11.5-0{1..5}-*`. (v11.4 ✅ tag `v11.4.0`; v11.3 ✅ `v11.3.0`; v11.2 ✅ `v11.2.0`.)
Phase: **v11.5-01 ✅ COMPLETE 3/3 (2026-06-12) — transitioned to v11.5-02 of 5.** Closed: H4 (Perform-nav branding leak) · H5 (anon chord-cache PATCH 401) · H9 (band_leader library-edit + cross-tenant wall). **Next phase: v11.5-02 — The performance surface (headline)** [P1] — H1 (landscape auto-fit + per-chart calibration) + F2 (in-Perform leader-only key change) + H7/F1 (`/perform` cold-open TTFB; root-cause first) + H3 (seekable audio). UAT-heaviest (7-tablet fleet); /ui-ux-pro-max BLOCKING.
Plan: **v11.5-02-01 (H3 seekable audio) ✅ SHIPPED `c687db99ee` (PLAN→APPLY→UNIFY closed).** Phase v11.5-02 split into 4 plans (Daniel picked H3 first): **01 = H3 ✅** (audio HTTP Range) · 02 = H7/F1 (TTFB verify-first + "tonight") · 03 = F2 (in-Perform leader key change) · 04 = H1 (landscape auto-fit + per-chart calibration). Plan 01 shipped: pure `byteRangeResponse` helper wired into `/api/drive/file/[fileId]` (AudioViewer's source) + `/api/recordings/file/[id]` → 206/Accept-Ranges/Content-Range/416; no-Range GETs byte-identical; auth/404/502 gates untouched.
Status: **Plan 01 (H3) loop CLOSED. Ready to PLAN Plan 02 (H7/F1).** (Verify: helper unit 10/10 + recordings route 4/4; tsc adds 0 errors; `next build --webpack` exit 0.)
Last activity: 2026-06-14 — **`/paul:apply` → `/paul:unify` Plan v11.5-02-01 (H3)**: shipped seekable audio (`c687db99ee`), wrote SUMMARY, appended iPad-seek UAT, archived the 2026-06-13 handoff. Pushed to master.

**Tenancy model (locked 2026-06-09 — the spec everything derives from):**
- **Consumers (musicians + members):** NOT per-org-gated; anyone uses either site. The **landing-page host** determines the experience (branding/setlists/library) via the `x-org-id` proxy header / `<html data-org>`. Consistent with err-public.
- **Band leaders:** explicit `orgIds` membership (CRC / broslaz / both) set via a NEW admin toggle (today hand-set via scripts). The **authoring** tier.

## Milestone Phases (v11.5 — 🚧 1 of 5 complete)

| Phase | Focus | Priority |
|-------|-------|----------|
| v11.5-01 | ✅ **COMPLETE 3/3 (2026-06-12)** — Tenancy + anon correctness: H4 (Perform-nav leak `180c9b666e`) + H5 (anon chord-cache PATCH `cd97ab21a3`) + H9 (band_leader library-edit + cross-tenant wall `d7cbb1a4e0`). | **P0/P1** |
| v11.5-02 | **The performance surface (headline)** — H1 (landscape auto-fit + per-chart calibration override) + F2 (in-Perform leader-only shared key change) + H7/F1 (`/perform` cold-open TTFB + "tonight" entry; root-cause TTFB first) + H3 (seekable audio / HTTP Range). UAT-heaviest (7-tablet fleet). | P1 |
| v11.5-03 | **Photo-of-paper-chart import** (funded L, own phase) — MCP path: photo → deskew/crop/normalize → org-stamped library row (provenance "photo import") → bonded. Image normalization first, NOT OCR. VERIFY-FIRST `scrape_chart_from_url`/`salvage_chart_bytes` reuse. | P1 |
| v11.5-04 | **Hygiene & harness** — M-11 (`contact_not_found`→404) · M-10 (publish schema doc) · library junk filter (browse + bind-picker) + orphan delete (VERIFY-FIRST cascade) + ingestion guard · H8 (bus-assignment cascade) · F-8 (`create_test_account` orgIds) · M-12 (chunk TTL ~60m) · test `.docx` fixture · BL-tier bearer doc. | P2 |
| v11.5-05 | **Consumer polish quick wins** — Q3 (QR-aware error copy) · Q4 (anon `/setlists` hide writes + suppress junk drafts) · Q5 (no raw filenames on consumer surfaces) · Q6 ("Public sets" vocab) · F4 (key badges on broslaz rows). | P3 |

**Spec:** `.paul/research/MILESTONE-BRIEF-v11.5-bulletproof-performance.md` (ratified — implements). Oracle `docs/ACCESS-POLICY.md` **v0.4**. **No hard cross-phase ordering** (unlike v11.4's picker-first); phases ordered smallest-first within severity band. **/ui-ux-pro-max BLOCKING** on UI-touching phases (01/02/03/05). **Verify-first** flags: H4 layout, H7 TTFB, photo-import infra reuse, library-cascade. **UAT (7-tablet iPad fleet, before close):** H1 / F2 / photo-import. **Stress-prompt cells:** H4 + library-junk filter. **Deferred (list stands):** H2 page-pedals SKIPPED; F3/F5/identity-deepening + STATE infra-adjacents → v11.6 (04 may fold infra-adjacents opportunistically). CRC byte-identical.

(v11.4 ✅ COMPLETE 2026-06-11 tag `v11.4.0` — archived `.paul/milestones/v11.4.0-ROADMAP.md` + MILESTONES.md § v11.4. v11.3 ✅ 2026-06-10 tag `v11.3.0`. v11.2 ✅ 2026-06-11 tag `v11.2.0`. v11.1 ✅ 2026-06-09.)

## Git State

- **cwd branch:** `master`. **Phase v11.5-02 IN PROGRESS (1/4) — Plan 01 (H3 seekable audio) `c687db99ee`** (byte-range helper + both audio routes + unit/route tests + SUMMARY + UAT + handoff archive). Pushed to `origin master`. Prior: **Phase v11.5-01 COMPLETE — phase-close commit `b3821bc26c`** (`feat(v11.5-01)`: PROJECT/ROADMAP/STATE/paul.json evolve + 02/03 plans+summaries + handoff archive). Phase fix commits: H4 `180c9b666e` · H5 `cd97ab21a3` · H9 `d7cbb1a4e0`; docs `046c983dcf`/`88dff486a2`; H9 reg `3e068c8829`; pause `575a403ccb`. All pushed to `origin master`. Prior: **v11.4 milestone close** (`chore(release): v11.4.0`; version → 11.4.0, oracle → v0.4, PROJECT/ROADMAP/MILESTONES evolve + archive; **annotated tag `v11.4.0`**). v11.4 phase commits: 01 `80ea721508` · 02 `f03b48db88` · 03 `fb055b4b5d` · 04-01 `ba826730d7` · 04-02 `47e83088a1` · phase-close `eeb393097b`. Prior: **v11.3 milestone close release** `628984639b` [`chore(release): v11.3.0`; **tag `v11.3.0`**]. Phase commit: v11.3-05 `3258d792b3` (pushed `92e809401d..3258d792b3`). Prior: v11.3-04 `c0b0ab3367` · v11.3-03 `4fe1748318` · v11.3-02 `89f4af7fd2` · v11.3-01 `bc8f935aa2` · v11.2 `f27ae7bc5f`. v11.2 phase commits: 01 `6920d61668` · 02 `6079d4e3cf` · 03-01 `54cd7ba3bc` · 03-02 `ebb520164d` · 04-01 `90774a7e76` · 04-02/phase-04 `52a3dea57d` · 05-01 `06f2db3176` · 05-02/phase-05 `f27ae7bc5f`. **tag `v11.2.0`** on the v11.2 close (annotated, on `f27ae7bc5f`). **tag `v11.1.0`** on the v11.1 close (`29d9a96878`). v11.1 phase commits: 01 `72f1cdb66e` · 02 `941e6856d1`+`8d345c2a59` · 03 `3d7471679e` · 04 `4490abe53c`. tag `v11.0.0` on the v11.0 close.
- Production branch is `master`; push `origin master` (NOT `master:main`).
- Multi-computer — `git pull` before starting next session.

## Loop Position

```
PLAN ──▶ APPLY ──▶ UNIFY        [v11.5-02-01 (H3 seekable audio) ✅ loop CLOSED — c687db99ee. Next: PLAN Plan 02 (H7/F1)]
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
- **v11.3-02 (2026-06-11):** agent chart-upload — `import_chart_from_drive` converts Google Docs (export) + `.docx`/Office (convert-on-copy) → PDF server-side (`DriveClient.fetchAsPdf` + `driveSourceIsConvertible`); inline chunked upload (`begin/append/commit_chunked_chart_upload`) on `upload_sessions`, commit delegates to `finalizeChartUpload` + org-stamps. Append NOT rate-limited (only begin+commit) to survive the 10/min cap on multi-chunk files. Cowork sandbox PUT-proxy out of scope (Anthropic-side).
- **v11.4-03 surface RATIFIED (Daniel 2026-06-11):** "remembered ad-hoc recipients" (D8 item 3) ships as **MCP contacts, NOT browser UI**. Finding that drove it: the browser `PublishDialog` recipient picker is ORPHANED — rendered nowhere in `src` (zero JSX/import refs except its own test; `SetlistGrid` only has a read-only drift banner; git shows it last touched by the v11.4-01 commit, never wired to a page). MCP `publish_setlist` already accepts email-only ad-hoc `recipients[]`, so the gap was persistence/reuse, not sending. → new org-scoped `contacts` collection + MCP CRUD + `preview_publish.savedContacts`. No further PublishDialog investment (browser publish is effectively MCP-only). (Note: v11.4-01's browser AC-4/AC-5 code shipped correct+tested but against this unmounted dialog.)
- **v11.1-02-02 (2026-06-09):** admin org-membership set via the `/manage` People list (tri-state Band-access control, admin-only, band_leader/admin rows); `/api/admin/set-role` now writes `orgIds` to BOTH the Auth claim and the user doc (claim+doc lockstep) so People-list display + roster filtering (v11-05-02 rowOrgIds) reflect changes immediately. Control scoped to the authoring tier per Daniel (consumers stay host-derived). **← PARTIALLY SUPERSEDED by v11.4-04 (see next).**
- **H9 band_leader library-edit lockout RATIFIED (Daniel 2026-06-12, field-reported by David):** `edit_library_entry`/`edit_enrichment` (only in-place editor of tags/title/collection/key/bpm/leadMusician) is `assertAdmin`-gated (`library-review.ts:634`); band_leaders' only metadata write is `update_song` (key/bpm) → they can't re-tag without delete-and-re-import (breaks gig bonds; impossible for direct-uploads w/o Drive source). Contradicts v11.4-04 (band_leaders = authoring tier). **Fix (Plan v11.5-01-03, STOP-gate):** relax gate → admin-OR-band_leader for curation-safe subset (tags/title/key/bpm/leadMusician; `collection` stays admin-only) + **add org-scoping** (`row.org ∈ caller orgIds`) since `library-review.ts` has ZERO tenancy check today. **Immediate field unblock (Daniel chose):** temp-bump David to admin via `/api/admin/set-role` (orgIds-PRESERVING; NEVER `scripts/set-role.js` — it clobbers claims to `{role}` only, wiping orgIds). Revert David to band_leader once Plan 03 ships.
- **v11.4-04 membership scope RATIFIED (Daniel 2026-06-11):** org membership (`orgIds`) applies to **EVERYONE, incl. band_leaders/admins → default-both grants cross-tenant AUTHORING to all leaders** (David authors CRC, CRC leaders author BL). Chosen with the warning shown — a deliberate "one unified team authors both bands" call. SUPERSEDES the v11.1-02-02 "scoped to authoring tier / consumers host-derived" framing for the membership-data axis: the Band-access toggle opens to ALL non-pending rows (Plan 01); the default-both backfill stamps every person both (Plan 02). `rowOrgIds`/`getOrgIdsFromClaims` default STAYS `['crc']` (CRC-safety net — "both" is explicit data, NOT a flipped global default). Plan-02 backfill = per-user snapshot + human-run prod apply (mass auth-claims write).

### Deferred Issues
- **SERVICE_TYPE_LABELS vocab-table (v11.1-04 defer, 2026-06-09):** Shabbat Morning/Friday Night/Erev Shabbat/Rosh Hashanah labels hardcoded in SetlistCards/CreationWizard/SetlistMetaEditSheet/interview-defaults + SetlistMatrixView `<option>`s. Gated-away for broslaz (selector hidden via `hidesLiturgicalFields`) → NOT a live remnant. Convert to a vocab-driven table only if a non-synagogue tenant needs service-type categories.
- **recordings-collection org-scoping (v11.1-03 defer, 2026-06-09):** `subscribeRecordingsForSong` (RecordingBindPopover) is songId-only (no org filter) AND `/api/recordings/upload:107` hardcodes `orgId: DEFAULT_ORG_ID` → host-filtering the subscribe now would hide ALL recordings on broslaz. Fix: stamp the upload from host x-org-id, THEN host-filter the subscribe. Small follow-up; distinct from the Library-tab chart clutter (library_index audio rows ARE covered by v11.1-03).
- **anon chord-cache writes are not org-scoped (v11.5-01-02 defer, 2026-06-12):** the anon `POST` (chordData) + the now-anon `PATCH` (nativeKey/lastUsed*) on `/api/library/chord-cache` write by `fileId` with NO tenancy check → a broslaz-anon write to a CRC chart's `fileId` crosses the tenant wall. Benign derived/display data (overwritable, rate-limited) + matches the pre-existing anon-POST gap, so deferred. Fix: org-scope BOTH writes together (resolve the row's `orgId` vs the host `x-org-id`).
- **finalize_chart_upload (signed-URL path) does not org-stamp (v11.3-02-02 defer, 2026-06-11):** the chunked `commit` stamps its result, but the signed-URL `finalize_chart_upload` flow shares finalize's missing-stamp gap → its uploads land default-org. Small follow-up: add `org` param to `finalizeChartUpload` + pass `orgFrom(extra)` in its handler. Out of scope of v11.3-02 to keep that path byte-stable.
- **/perform cold-start TTFB residual (v11.3-04-03 defer, 2026-06-10):** streaming took the Firestore query off the first-byte path, but field cold TTFB (1633ms vs synthetic 214ms) is dominated by Vercel serverless cold-start + real-user geo — an INFRA lever, not app code. If the post-deploy slice-probe re-run shows TTFB still high, action a Vercel fluid-compute / keep-warm / region follow-up; do NOT re-churn `/perform` app code.
- v11-06 residuals (low-risk, in AUDIT.md): setlistTemplates app-only; scheduling_history orgId-absent rows; users claim-based (no orgId field).
- v7.0 fold-forward backlog (`MILESTONES.md` § v7.0) — re-triage what's still live.
- ROADMAP.md / PROJECT.md / MILESTONES.md carry full historical detail intentionally (archive — collapse, don't delete); only STATE has a hard size target.

### Blockers/Concerns
- None active.
- **REUSABLE LESSON (2026-06-11): a Next.js App Router `route.ts` may ONLY export HTTP handlers (GET/POST/…) + route config — exporting a helper (e.g. `export function generateCode`) fails the prod build's route-type check (`"X" is not a valid Route export field`). `tsc --noEmit` AND a default-bundler `next build` did NOT catch it (cache/bundler diff); `next build --webpack` (what Vercel runs) DOES. Keep route helpers in a sibling module (e.g. `./code.ts`) and import them. Caught when BUG-13's first deploy `e8b22b2` ERRORED on Vercel; fixed `0fd67114`. Verify route-touching changes with `SKIP_ENV_VALIDATION=1 npx next build --webpack` before declaring deployable.**
- **REUSABLE LESSON (2026-06-09): `tsc` + `vitest` do NOT catch client/server bundle-boundary breaks — only `next build` does.** v11-05 shipped a deploy that ERRORED at compile (`Can't resolve 'fs'`) because client modules imported `org/membership.ts` whose lazy `firebase-admin` import was pulled into the client bundle. Run `SKIP_ENV_VALIDATION=1 npx next build` before declaring any shared-lib/client phase deployable. Keep pure helpers (rowOrg etc.) in firebase-admin-free modules; server resolvers in `*-server.ts`.
- **REUSABLE GOTCHA: every new tenant host must be added to Firebase Auth authorizedDomains** or web sign-in silently fails (`auth/unauthorized-domain`). broslaz hosts already added (scripts/add-auth-domains.mjs).
- **Prod-script admin auth on this box:** no SA creds / no gcloud. Admin-SDK scripts convert the firebase CLI refresh-token → temp `authorized_user` ADC (firebase-tools public OAuth client) → `GOOGLE_APPLICATION_CREDENTIALS`; delete temp file after. `firebase deploy` (rules/indexes) uses the CLI directly.
- **No `(orgId, createdAt)` composite index** on `setlists` (surfaced 2026-06-09 querying prod) — `(orgId, date)` exists (v11-04-01). Add if a createdAt-ordered org query is ever needed.

### Reusable assets / endpoints
- Live isolation probe: `scripts/e2e-bl-tenant-probe.mjs` (DAVID_BEARER + CRC_BEARER). CRC bearer: `CRC_BEARER=$(node scripts/supervisor-prod-bearer.mjs)`.
- Claim-free throwaway BL bearer: `scripts/mint-throwaway-bl-bearer.mjs` (`--apply` / `--revoke <id>`) — does NOT touch David's claim (issue-bl-bearer.mjs would overwrite his orgIds → drop crc).
- MCP endpoint: `https://www.centralreform.live/api/mcp` (hit www directly; apex 307 drops auth header).

## Session Continuity

Last session: 2026-06-14 — **Shipped Plan v11.5-02-01 (H3 seekable audio) `c687db99ee`** via `/paul:apply`→`/paul:unify`: pure `byteRangeResponse` helper + both audio routes return 206/Accept-Ranges/Content-Range/416; no-Range GETs byte-identical; auth gates untouched. 10 helper unit + 4 recordings route tests; `next build --webpack` exit 0. Pushed to master.
Stopped at: **Plan 01 (H3) loop CLOSED. At the within-phase plan boundary (Plan 01 → Plan 02 of v11.5-02). NOT a phase boundary — 3 plans remain.**
Next action: **`/paul:plan` Plan v11.5-02-02 (H7/F1)** — `/perform` cold-open TTFB **verify-first** (re-run `node scripts/v11-3-04-webvitals-slice.mjs`; likely infra-bound → Vercel ticket, not app churn) + build the F1 "jump to tonight's set" entry. Remaining v11.5-02: **02 H7/F1** (next) · 03 F2 (in-Perform leader key change, /ui-ux-pro-max+UAT) · 04 H1 (landscape auto-fit + per-chart calibration, biggest, /ui-ux-pro-max+heaviest UAT). **Operational (Daniel's discretion):** revert David admin→band_leader (he said "David is fine").
Resume file: **.paul/phases/v11.5-02-performance-surface/v11.5-02-01-SUMMARY.md** (H3 outcome + the node-env Range-header test gotcha). Then ROADMAP § Phase v11.5-02. (Prior handoff archived to `.paul/handoffs/archive/HANDOFF-2026-06-13.md`.)
Git strategy: master (prod). All committed + pushed through the pause commit (Plan 01 + handoff + STATE). `git pull` first next session (multi-computer); push `origin master` (NOT master:main).
**Deferred UAT (RUM):** v11.3-04 field TTFB/FCP — re-run `node scripts/v11-3-04-webvitals-slice.mjs` after ~1–7d traffic vs 1633/3551 baseline; if still high → Vercel infra follow-up (Deferred Issues), not app code.
**Reusable (this phase):** `scripts/v11-3-03-library-orphan-sweep.mjs` (admin-SDK via firebase-CLI refresh-token ADC; `--diagnose` / dry-run / `--apply`) — kept for future test-data hygiene probes. `sweep_orphan_test_data` now covers library_index orphans.
Resume file: **.paul/HANDOFF-2026-06-10-v11.3-03-complete.md** (full context); then ROADMAP § Phase v11.3-04. Oracle: `docs/ACCESS-POLICY.md` v0.3. **(PAUSED 2026-06-10 at the v11.3-03 → v11.3-04 phase boundary.)**
**v11.3-04 note (BUG-2):** /perform perf regression — p75 LCP 2600/FCP ~3100/TTFB ~1450ms + CLS 0.15→0.2. VERIFY-FIRST characterize cold vs steady (suspect chart-image reflow for CLS) before fixing; comparator /setlists CLS 0.02. UI-touching route → **/ui-ux-pro-max BLOCKING** during APPLY.
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
