# Milestones

> **⚠️ 2026-05-15 AUTHORING-MODEL PIVOT** — milestones below are HISTORICAL. Since 2026-05-15 the project's active primary workstream is the MCP server (Daniel's primary author surface). Future milestones should be scoped around MCP authoring completeness + band/consumer surface polish, not in-app library UI work. See `project_mcp_status.md` and `user_mcp_is_primary_author_workflow.md` in auto-memory.

Completed milestone log for this project.

| Milestone | Completed | Duration | Stats |
|-----------|-----------|----------|-------|
| v0.1 UI/UX Redesign | 2026-03-08 | 1 day | 6 phases, 12 plans |
| v1.0 Full Launch | 2026-03-08 | 1 day | 5 phases, 12 plans |
| v1.1 UI/UX Hardening | 2026-03-09 | 1 day | 11 phases, 19 plans |
| v1.2 Library, Manage & Monitor Overhaul | 2026-03-09 | 1 day | 9 phases, 10 plans |
| v1.3 Bugsweep & Backend Hardening | 2026-03-10 | ~76 min | 4 phases, 7 plans |
| v1.3.1 Regression Fixes | 2026-03-10 | ~8 min | 1 phase, 1 plan |
| v1.4 Fixes & Library Management | 2026-03-10 | ~1 hr | 5 phases, 5 plans |
| v1.5 Codebase & UI/UX Hardening | 2026-03-10 | 1 day | 6 phases, 11 plans |
| v1.6 Stability & Regression Audit | 2026-03-11 | 1 day | 4 phases, 4 plans |
| v1.7 Critical Bug Fixes | 2026-03-11 | 1 day | 5 phases, 5 plans |
| v1.8 Mobile UX Overhaul | 2026-03-11 | 1 day | 3 phases, 3 plans |
| v1.9 Auth Stability & Deferred Cleanup | 2026-03-11 | 1 day | 5 phases, 4 plans |
| v2.0 Schedule & Workflow Fixes | 2026-03-11 | 1 day | 3 phases, 3 plans |
| v2.5 Bugsweep & Test Coverage | 2026-03-12 | 2 days | 19 phases, 30 plans |
| v2.6 Deprecation Cleanup, Tech Debt & Setlist UX | 2026-03-12 | 1 day | 3 phases, 3 plans |
| v3.0 Live Setlist Sync | 2026-03-30 | 1 session | 3 phases, 5 plans |
| v3.1 Post-v3.0 Bugsweep & Hardening | 2026-03-31 | 1 session | 5 phases, 7 plans |
| v3.2 Mobile Admin & Responsive Fixes | 2026-03-31 | 1 session | 2 phases, 2 plans |
| v3.3 Live Mode Activation | 2026-04-04 | absorbed | absorbed into v3.4 |
| v3.4 Fixes & Live Mode Activation | 2026-04-04 | 1 session | 3 phases, 2 plans |
| v4.0 Live Swap Redesign | 2026-04-04 | 1 session | 3 phases, 3 plans |
| v4.4 Deferred Audit Sweep — Architectural Polish | 2026-04-15 | 1 session | 5 phases shipped (3 deferred to v4.5), 5 plans |
| v5.0-hotfix Track-Edit Save-Loss Fix | 2026-04-27 | 1 session (~6h) | 1 phase, 4 plans |
| v5.1 Editor UX Polish (Band-Onboarding Gate) | 2026-04-27 | 1 session (~4h) | 4 phases, 4 plans |
| v5.2 Band-Onboarding Hardening | 2026-04-30 | 1 session | 5 phases, 5 plans (PENDING-UAT at close) |
| v5.3 Editor UX Repair (rescoped 2026-05-02 to insert v5h3 hotfix) | 2026-05-02 | 1 session (~12h wall-clock) | 4 phases, 7 plans (PENDING-UAT at close — UAT discipline waiver per Daniel) |
| v5.4 Hotfix + Harness Fidelity | 2026-05-12 | ~4 days (2026-05-08 → 2026-05-12) | 2 phases shipped + 1 partial (3 deferred fold-forward to v6.0), 4 plans + 8 P0 patches + 2 cleanups, ~18 commits (PENDING-UAT at close — Daniel-loop discipline; HFG counter 1/3 carried into v6.0) |
| v6.0 Tracks Single-Source-of-Truth | 2026-05-13 | ~2 days (2026-05-12 → 2026-05-13) | 12 phases LOOP COMPLETE (10 original + 2 emergent close-gates v60-11/v60-12), 24 plans, 25 commits (PENDING-UAT at close — 5th consecutive use of v51-04 codified pattern; HFG counter 0/3 held throughout via emulator coverage) |
| v7.0 Document-Driven Setlist Creation | 2026-05-14 | ~1.5 days (2026-05-13 milestone open → 2026-05-14 close) | 9 phases LOOP COMPLETE (8 roadmap + v70-09 out-of-sequence polish), 16 plans, 2 bundled phase commits at master HEAD (v70-07 `4668e2a8` + v70-08 `f3f86c41`); PENDING-UAT at close (6th consecutive v51-04 use); HFG counter 0/3 held; constraint 12 satisfied (end-of-milestone audit ran, 9 P1s remediated in-phase) |
| v11.0 Brothers Lazaroff Multi-Tenant | 2026-06-09 | ~2 days (2026-06-08 → 2026-06-09) | 7 phases (v11-01..06 + v11-02b), 23 plans; 2nd live tenant brotherslazaroff.live fully tenant-isolated; close-gate AUDIT.md GO; live prod probe 19/19; tip `2a8441d6e5` |
| v11.1 Brothers Lazaroff Post-Launch Fixes | 2026-06-09 | ~1 session | 4 phases, 5 plans; broslaz reads as a band across the authed surface (branding/library/vocab) + multi-org authoring path; CRC byte-identical; tag `v11.1.0`; tip `4490abe53c` |

---

## ✅ v11.1 Brothers Lazaroff Post-Launch Fixes

**Completed:** 2026-06-09 · **Duration:** ~1 session (4 PAUL loops back-to-back)

### Stats

| Metric | Value |
|--------|-------|
| Phases | 4 (v11.1-01, 02, 03, 04) |
| Plans | 5 |
| Files changed | ~20 (nav, library read paths, org vocab/branding, admin set-role, + tests) |
| Version | 11.0.0 → **11.1.0** (tag `v11.1.0`) |

### Key Accomplishments

- **Brothers Lazaroff now reads as a band across the entire authenticated surface** — own wordmark + navy "BL" monogram (nav), own charts only (library tab + bind-picker + header search), band-voice headers ("Upcoming Shows" / "Create New Set" / "Set Matrix"). CRC byte-identical throughout.
- **Multi-org authoring path is real:** host-derived MCP bearer (org stamped from the connection domain's `x-org-id`, validated ∈ caller's orgIds) + an admin tri-state "Band access" toggle in `/manage → People` writing `orgIds` to claim + doc.
- **Library host-isolation at the fetch layer** — `getServerLibrary(orgId)` + `/api/library/list` rowOrg filter, so tab + picker + search all inherit it from one point; admin "All sites" escape hatch; display-only (direct chart access never gated — err-public).
- v11-06-02 no-arg-injection MCP isolation invariant preserved throughout; full quality floor held every phase (tsc clean · suite 3339/0 · `next build` clean · /ui-ux-pro-max on UI phases).

### Key Decisions

- **Authoring org = the tenant domain the leader connects Claude Desktop to** (pinned at mint by host `x-org-id`, not a tool arg) — preserves the v11-06-02 invariant.
- **Empty `logoUrl` → brand-colored initials monogram** (auto-upgrades to `<img>` if an asset is ever set) rather than shipping a BL image now.
- **Library: Shared flag DEFERRED** (libraries disjoint today); filter scope = tab + authoring + search with an admin All-sites toggle.
- **Vocab: SERVICE_TYPE_LABELS table DEFERRED** (gated-away for broslaz via `hidesLiturgicalFields` — not a live remnant).

### Deferred (carried forward)

- recordings-collection org-scoping (`/api/recordings/upload` hardcodes `orgId:crc` → fix the stamp, then host-filter the per-song subscribe).
- SERVICE_TYPE_LABELS → vocab-driven table (only if a non-synagogue tenant needs service-type categories).

### UAT

- MCP authoring connection verified working live (Daniel, 2026-06-09). Remaining hands-on UAT (nav/library/dashboard visual confirmation on the live tenant + CRC-unchanged) folded into normal use — non-blocking.

---

## ✅ v11.0 Brothers Lazaroff Multi-Tenant

**Completed:** 2026-06-09 · **Duration:** ~2 days (2026-06-08 → 2026-06-09)

Turned the single-tenant CRC app into a multi-tenant platform whose first second tenant is **Brothers Lazaroff** (David Lazaroff), live on `brotherslazaroff.live` — own org-scoped library + setlists + roster + congregation branding, authored via Claude + MCP, within the SAME app + Firebase (`crcmusiccharts`). CRC data backfilled to a default `crc` org, behavior-neutral.

### Stats
| Metric | Value |
|--------|-------|
| Phases | 7 (v11-01, 02, 02b, 03, 04, 05, 06) |
| Plans | 23 |
| Close | AUDIT.md verdict GO; live prod probe 19/19; tip `2a8441d6e5` |

### Phases
- **v11-01** Tenant foundation — `orgId` on songs/library_index/setlists/tracks/recordings; tenant registry; CRC backfill (2105 docs); org-scoped Firestore rules (write-isolation, no lock-out) + emulator coverage.
- **v11-02** MCP org-scoping — caller org from the bearer token doc → `orgFrom(extra)`; reads + writes tenant-walled (not-found wall, no existence leak); David's BL bearer + claim issued; live e2e 12/12.
- **v11-02b** Org-aware self-service token minting (`getPrimaryOrgForMinting`).
- **v11-03** `brotherslazaroff.live` domain + navy/dark branding + de-synagogued vocab (CRC byte-identical).
- **v11-04** BL consumer surface (perform/print) + org-aware metadata/wordmark + authed-dashboard read scoping.
- **v11-05** Cross-tenant collection scoping (templates / roster `users` + `scheduling_assignments` / congregation per-org doc / service-personnel) R+W + in-app setlist-create orgId stamp + CreationWizard vocab.
- **v11-06** Cross-tenant isolation security audit (close gate) — three adversarial axes ALL closed: Firestore-rules leakage (scheduling_assignments/_history hardened via `orgReadOk`; per-org congregation branding wildcard; rules deployed), MCP org-scope escape (no-arg-injection invariant CI-locked), host-spoof (`verifyBearer` bearer-authoritative, ignores spoofed `x-org-id`). leadHistory tenant-scoped. Live prod probe **19/19**; `AUDIT.md` verdict **GO**.

### Key Decisions
- Caller org sourced from the MCP bearer token doc, NOT the auth claim or any request header (un-spoofable).
- Write-isolation over write-requirement in rules (client paths omit orgId → hard-require would lock out CRC).
- `err-public` holds WITHIN a tenant; hard wall ACROSS tenants. Setlist names public-by-design (leadHistory scoping was UX, not security).
- Per-org congregation via doc-id namespacing (`config/congregation__{org}`; crc = bare doc, zero migration).
- Residuals accepted (defense-in-depth, low risk): setlistTemplates app-only (no client read path); scheduling_history orgId-absent rows; users claim-based (no orgId field). See `.paul/phases/v11-06-isolation-audit/AUDIT.md`.
- Ran fully autonomously per Daniel's v11.0 autonomy directive (auto-commit/push per phase, deploys/probes as AUTO tasks; quality floor held).

---

## 🚧 v7.1 Production Hardening & MCP Authoring Surface

**Status:** ACTIVE (cycles 1–12 landed; cycle-13 in flight). PAUL re-baselined 2026-06-07 to capture this campaign — the work ran outside the PAUL loop via the bongo `.coord/` parallel-agent system (supervisor / auditor / coder roles), so this entry is reconstructed from git history (`f3f86c41..master`) + `.coord/` charters rather than from PLAN/SUMMARY dirs.

**Span:** 2026-05-14 (v7.0 close `65dd9724f8`) → ongoing. **439 commits** on `master` since v7.0.
**Master tip at re-baseline:** `467e788ed5` (local) / `ad16769505` (origin, +1 ahead — local pull due).
**App version:** still `7.0.0` in `package.json` — "v7.1" is a PAUL-tracking label for the hardening campaign, not a released semver bump.

### What this milestone is

A sustained production-hardening campaign to make the app "bulletproof and easy" for band onboarding (6× 11" iPads, Perform mode). Two intertwined threads:

1. **MCP authoring surface** (the 2026-05-15 authoring-model pivot — Daniel authors via Claude Desktop + MCP, not the in-app UI). Grew from the v7.0 `setlist-write.ts` module to **108 live MCP tools** via stress-fix waves 1–6, the CF1/CF2/CF3 tool families, and per-cycle additions.
2. **Cowork stress-test cycles 1–13** — the established cadence (`project_cowork_sweep_cycle`): autonomous cowork run → multi-axis findings report → parallel-agent fix wave → repeat.

### Cycle arc (phases, in PAUL terms)

| Cycle | Theme | Representative work |
|-------|-------|---------------------|
| MCP waves 1–6 + CF1/2/3 | MCP server buildout | stress-fix waves, monitor-control tools, chart-ingestion (upload/scrape/save), `update_track`/`bulk_update_tracks`, `download_chart`/`generate_gig_packet`, `import_chart_from_drive`, chunked-upload, `list_library`/`list_setlists`/`publish_setlist` |
| 1–5 | Broad bug/feature/security/usability sweeps | rich error-envelope hygiene, dedup (Unicode-safe normalizedName), orphan marking, `verify_setlist_charts`, force-gate `force_required` migration, a11y/WCAG AA contrast |
| 6–7 | Bond hygiene + data integrity | bond audits, divergence detail, catalog dual-read close (key/bpm → `songs.defaults`), driveFileId/library_index backfills (271/281/350/241 rows) |
| 8–10 | iPad-WebKit + usability-first reframe | offline-IDB self-resolve (TextScoreViewer/AudioViewer blob-url fix), wake-lock, idle precache, ≥44px tap targets, songCount denormalization, delete_chart 409 |
| bridge v10.x | studio-bridge releases | v10.0.6/10.0.7, tray health color, periodic self-test + update banner, X32 virtual-adapter rejection, admin housekeeping MCP tools |
| 11 | Musician-shadow / sanctuary-conditions stress | SSR-prefetch public landing, active-track-in-URL persistence, TRANSPOSE state display, err-public gate relaxation |
| 12 | Saturday-readiness hybrid one-PROMPT | `splitPublicSetlists` SSR boundary, narrow `/perform/*` shell-cache SW, section-bookmark fallback, run-1/run-2 REPORTs |
| 13 | 4-axis parallel cowork-stress design (**IN FLIGHT**) | leader-broadcast (A3) · MCP-authoring round-trip · real-WebKit re-verify · bond-hygiene + picker UX. Phase 2 design → Phase 3 Daniel-run → Phase 4 fix wave. |

### Cross-cutting hardening

- **PDF serverless:** pdfjs-dist v5 DOMMatrix module-load break fixed — text-only → `unpdf`, positional → hand-rolled DOMMatrix polyfill (`feedback_pdfjs_serverless_engine_choice`).
- **MusicXML:** capo panel + detected-key header + leader match-button + transpose-jank fixes (scroll-restore, adaptive debounce).
- **Storage backup:** dormant-tick heartbeat, tickStale/missing-aged alarms, per-row time-budget, Drive error capture.
- **Ops/observability:** `/api/health` + `/api/version`, App Router `sitemap.xml`, admin-consistency cron `*/15`, `/api/auth/test-session` for autonomous browser audits.
- **Test/harness:** in-sandbox Playwright stress harness (`cycle-4/harness/`), parallel-load flake-baseline consolidation, `tsc --noEmit` driven to 0 errors, login-bundle per-route regression guards.

### Key decisions (reconstructed — full detail in auto-memory + `.coord/shared/decisions.md`)

- **MCP-first authoring pivot** (2026-05-15) — `user_mcp_is_primary_author_workflow`. Browser app is the band/consumer surface only.
- **`err-public` invariant** (BINDING 2026-05-28) — never gate data from musicians/performers; mild confusion ≪ service-block.
- **No-Saturday framing** (BINDING 2026-05-28) — stop scoping triage around service gates; paper fallback is implicit.
- **Always-proceed / no decision-blocks** (BINDING 2026-05-28) — agents proceed autonomously on in-scope work.
- **Strict dedup** at 0.85 + `force: true` override; `dryRun` is observability (returns full report, no `force`).
- **Bongo `.coord/` is the execution substrate** — supervisor/auditor/coder roles; ≤5 concurrent coder ceiling; cowork runs are Daniel-run (coders only author PROMPT.md).

### Open at re-baseline

- **cycle-13 in flight** — 4 design lanes (13a/b/c/d) → Daniel-run cowork → Phase-4 fix wave.
- **Local master behind origin by 1 commit** — `git checkout master && git pull` before next work.
- **cwd parked on stale `fix/b1-error-envelope-sweep`** (321 behind master) — switch to master.
- **`package.json` unbumped at 7.0.0** — decide whether to formalize a semver bump at milestone close.
- **v7.0 fold-forward backlog** (below) — largely superseded by the iPad/MCP cycle work; re-triage what's still live.

---

## ✅ v7.0 Document-Driven Setlist Creation

**Completed:** 2026-05-14
**Duration:** ~1.5 days (2026-05-13 milestone open via /paul:complete-milestone of v6.0 → 2026-05-14 close)
**Status:** Closed via `/paul:complete-milestone` with PENDING-UAT marker per v51-04 codified pattern (6th consecutive: v5.3 → v5.4 → v6.0 → v7.0). Master HEAD `f3f86c41`; 2 commits ahead of origin (push at milestone close per Daniel's "always push to production" preference). Daniel-loop UAT continues against the deployed build over the upcoming worship cycle (Fri PM + Sat AM); failures route to in-phase follow-up plans per the v51-04 rule.

### Stats

| Metric | Value |
|--------|-------|
| Phases | 9 LOOP CLOSED (v70-01..v70-08 + v70-09 polish) |
| Plans | 16 (2 + 1 + 2 + 1 + 1 + 1 + 3 + 4 + 1 across the 9 phase dirs) |
| Phase commits | 2 bundled at master HEAD: `4668e2a8` feat(v70-07) + `f3f86c41` feat(v70-08); plus 1 interim push during v70-07 for MCP coordination |
| Audit findings | 0 P0 · 9 unique P1 · 22 P2 · 15 P3 (v70-08-AUDIT.md, 5 parallel dimension agents) |
| P1 remediation | All 9 P1s closed in-phase across v70-08 plans 02-04 (constraint 12 satisfied) |
| Tests added | +ImporterModal.a11y (2) + extract-document page-cap tests (2) + extract-structure / resolve / commit suites carried forward green |
| Harness Fidelity Gate counter | Held at 0/3 throughout v7.0 — v70-02 emulator rules test (10/10) + v70-07-01 emulator commit test (56/56) covered the data-layer phases without a clause-(b) waiver. Counter carried into v7.1 at 0/3. |
| Build status at close | `next build` ✓ EXIT 0 on every plan; type-check clean |
| Production deploy | NOT YET — master 2 commits ahead of origin; `git push origin master` is the milestone-close action |

### Key Accomplishments

- **End-to-end doc-driven setlist creation shipped.** Daniel feeds any service-outline document (.docx / .pdf / .txt — May 15 Shir Shabbat canary) and the system produces a complete chart-bound setlist: `extract-document` (mammoth/pdfjs) → `extract-structure` (Gemini, Zod-validated `{ sections, tracks }`) → `resolve` (fuzzy library match + recording candidates) → structured interview form → read-only preview → `commit-document` (atomic batch via the new shared `setlist-write.ts` module).
- **New `recordings/{id}` data domain.** Firestore collection + rules + composite index + Storage path, plus per-track recording-bind UI (`RecordingBindPopover` + `RecordingCell` on `MobileRowCard`) with inline `<audio>` playback and band-leader uploads.
- **Image-chart support.** PNG / JPEG / HEIC charts end-to-end — `heic-convert` upload + `ImageScoreViewer` viewer + print-pipeline image embed (aspect-fit, 18pt margins) — with AI chord detection + transposition correctly disabled for image charts.
- **Setlist metadata editor.** Pencil button in `SetlistGridTopBar` → `SetlistMetaEditSheet` (name / eventDate / serviceType / rabbi) — closes long-standing Issue 2 with a non-engine change-only `applyEdit` patch.
- **Per-track media affordances.** Chart click-through (new-tab link to the Storage-backed serving URL) + recording-bind popover, both correctly isolated from the row tap-to-edit handler via `stopPropagation`.
- **Best-practice audit ran + the P1s were remediated.** 5 parallel scope-narrowed dimension agents (security / accessibility / performance / code-quality / UX-consistency) → synthesized `v70-08-AUDIT.md`. Zero P0 — the v7.0 surface held up. P1 remediation across plans 02-04: band_leader role gates on the 3 upstream doc-import routes, real Zod schemas replacing `z.array(z.any())`, MIME + 50-page caps, `recordings/file/[id]` real `__session`-cookie auth boundary (replacing the forgeable `Sec-Fetch-*` heuristic), ImporterModal keyboard-reachable file dropzones (the cascading P1), `getServerLibraryLean` projected + cached fetch for the resolve hot path, ImporterModal `AbortController` so closing the modal cancels in-flight work, `commit-document` `maxDuration` + a single atomic batch write, and `import 'server-only'` guards on the mammoth/heic-convert modules.
- **MCP workstream proven compatible.** Daniel's parallel MCP-server lane (handoff 2026-05-14) shipped throughout v7.0 without conflict — the shared `setlist-write.ts` module (authored in v70-07-01, interim-pushed) became the single server-side write path consumed by both milestone work + the MCP write tools. Lane discipline (do-not-touch zones, coordinate on shared files) held.

### Key Decisions (12 locked at /paul:discuss-milestone 2026-05-13 + emergent during v7.0)

1. **Recording storage = Firebase Storage** (matches the v1.6 chart pattern) — no separate provider.
2. **Doc formats v7.0 = .docx + .pdf + .txt only.** Image OCR DEFERRED to v7.1.
3. **Interview UX = structured form (NOT chat).** Required fields (service date), optional fields (rabbi), inferred fields (service type with user confirmation).
4. **Recording attribution = `notes` field** on the recording doc (free-form string). No formal "performer" model in v7.0.
5. **Recordings model = NEW `recordings/{id}` collection** (NOT an embedded array on songs) — independent lifecycle + composite index on `(songId, createdAt)`.
6. **AI extraction = Gemini API + Zod validation.** Malformed extractions surface with the raw model output for human review (422 + `raw` field).
7. **Library resolution = fuzzy match with confidence scoring.** Levenshtein, 0.82 threshold (mirrors the existing `import/parse` route). Low-confidence → interview proposal.
8. **Missing-chart pipeline reuses `/api/library/upload`** from v60-09. No new upload route for setlist-import.
9. **Service date is REQUIRED.** Auto-suggested from the document filename, user adjusts.
10. **Service type is auto-inferred** from doc keywords and confirmed by the user.
11. **Image-chart support = PNG + JPEG + HEIC.** AI chord detection + transposition disabled with explanation tooltip.
12. **End-of-milestone best-practice audit BLOCKS milestone close.** Satisfied 2026-05-14 — 5 parallel dimension agents → 0 P0 · 9 unique P1 (all remediated in-phase) · 22 P2 + 15 P3 fold-forward.

### Emergent decisions (during v7.0 execution)

- **v70-06 scoped propose-only** (Daniel-confirmed 2026-05-14). The resolve route is a pure compute pass returning annotated proposals; v70-07's commit step does all persistence. The original "pre-creates recordings/* docs" wording was superseded — no orphaned-doc risk.
- **v70-07 split into 3 plans** (Daniel-confirmed 2026-05-14). Plan 01 = server-callable `setlist-write.ts` module + `import/execute` refactor (MCP coordination point, interim-pushed); plan 02 = ImporterModal "Upload Document" option + interview form + preview; plan 03 = commit wiring + e2e. The MCP write tools consume the same module.
- **v70-09 pulled forward + back** (Daniel-directed 2026-05-14). Setlist metadata editor jumped ahead of v70-06 to close Issue 2, then sequence resumed.
- **v70-08-04 added a vitest `server-only` alias** (auto-fix). The `server-only` npm package throws under jsdom — aliased to a no-op stub so the audit-mandated guards coexist with the test suite. New pattern.
- **v70-08-02 fixed `recordings/file/[id]` properly** (not folded forward). The audit offered a fold-forward option, but the session-cookie infra already existed (`verifySessionCookie` via Firebase Admin), so the proper fix was the right scope.

### Fold-forward to v7.1

P2/P3 items from `v70-08-AUDIT.md` routed to v7.1 / backlog (NOT in v7.0 plans):

- **ImageScoreViewer a11y** — required `alt` prop, `role=status`/`alert` on load/error, an explicit Retry control (the audit P2 + P3 cluster).
- **Dead `SetlistGrid.tsx` TanStack-table block** — several hundred lines + ~41 stale tests. Sizable; deserves a dedicated cleanup phase.
- **Duplicated Levenshtein matcher** — `resolve.ts` ↔ `import/parse/route.ts`. Extract a shared module.
- **3-route doc-import chain collapse** — option (a) from the audit: collapse `extract-document → extract-structure → resolve` into one orchestration route so the document text never leaves the server. Or persist text/structure server-side keyed by import-session id.
- **`Recording.durationSeconds`** in the model + UI but never written by the upload route — populate it or drop the field.
- **`/api/drive/file` weak `Sec-Fetch-*` auth** — the inheritance source for the `recordings/file/[id]` finding. v70-08-02 deliberately did NOT rewire it (out of named audit scope); same proper fix applies.
- **`recordings/upload`** — verify `songId` exists; add `title`/`notes` length caps.
- **Bounded-concurrency PDF parsing** — currently strictly sequential (within the 50-page cap from v70-08-02).
- **`inferServiceType` short-circuit** — currently builds one big concatenated string; short-circuit on the first keyword hit.
- **Touch-target sizing baseline** — 40px → 44px on non-coarse pointers; MobileRowCard hand-rolled buttons → shared `Button`.
- **ImporterModal polish P3s** — iPad-portrait scroll on the input step, mutually-exclusive visual cue, processing-step cancel affordance.
- **Test-coverage gaps** — `commit-document` route handler, ImporterModal doc-import handlers.
- **A unified `extractApiError` helper** to unify ImporterModal's two error-parsing idioms.

### PENDING-UAT (carry-forward)

- `.paul/UAT-PENDING.md` accumulates human-verify checkpoints across v70-01 (AC-3/AC-4 + print pipeline), v70-03 (chart click-through + recording-bind UX), v70-07 (full doc-import flow on the May 15 Shir Shabbat canary), v70-08-03 (visual polish: bg-brand CTAs, formatted preview date, RecordingBindPopover loading row, amber missing-chart contrast).
- Daniel verifies against the deployed build over the upcoming worship cycle. Failures route to in-phase follow-up plans per the v51-04 codified pattern.
- HFG-held emulator test (`commit.emulator.test.ts` for the v70-08-04 atomic-batch refactor) — recommend an emulator run at milestone close; the batching change is a pure refactor verified by `next build` + types.

### Patterns established

- **3-route AI pipeline shape** — `extract-X` → `extract-Y` → `resolve` as a chain of independent never-throws server libs + thin route wrappers; each step has its own discriminated `{ ok: true | false }` result. Reusable for any future server-side AI structuring.
- **One server-side write path** — `setlist-write.ts` (`createSetlistServerSide` + `updateSetlistServerSide`) is consumed by both the milestone work + the MCP write tools. Single source of truth for setlist persistence on the server.
- **`getServerLibraryLean` + `__resetServerLibraryCache`** — a projected + module-TTL-cached read for hot paths, with a test-reset hook. Reusable.
- **`AbortController` + `signal` across a chained `apiFetch` flow** — closing the UI cancels in-flight server work. Reusable for any multi-step async user flow.
- **`<label htmlFor>` + `sr-only` `<input>` for keyboard-accessible file uploads** — proven in RecordingBindPopover, generalized in ImporterModal.
- **`loaded` flag + Loader2 row for async list surfaces** — no more false "empty" flashes between mount and first snapshot.
- **`import 'server-only'` guards + vitest alias stub** — heavy server-only deps (mammoth/heic-convert) cannot silently land in a client bundle, and tests still pass.
- **`verifySessionCookieRequest`** — a real `__session`-cookie auth boundary for file-serving routes (not the forgeable `Sec-Fetch-*` heuristic).
- **Best-practice audit via parallel dimension agents** — 5 scope-narrowed agents (security / a11y / performance / code-quality / UX-consistency) → synthesizer → routed punch list. Reusable for future end-of-milestone audits.
- **`UAT-PENDING.md` accumulator** (codified earlier; 6th milestone use here) — human-verify checkpoints don't block APPLY; they accumulate for milestone-end verification.

---

## ✅ v6.0 Tracks Single-Source-of-Truth

**Completed:** 2026-05-13
**Duration:** ~2 days (2026-05-12 milestone open → 2026-05-13 close)
**Status:** Closed via `/paul:complete-milestone` with PENDING-UAT marker per v51-04 codified pattern (5th consecutive: v5.3 → v5.4 → v6.0). Master HEAD `04499a4`. Daniel-loop UAT continues against deployed commits over the upcoming worship cycle (Fri PM + Sat AM); failures route to in-phase follow-up plans per v51-04 rule.

### Stats

| Metric | Value |
|--------|-------|
| Phases | 12 LOOP COMPLETE (10 original from milestone design + 2 emergent close-gates v60-11 + v60-12 added 2026-05-13 after UAT-class bugs surfaced) |
| Plans | 24 (one per phase except v60-04 = 3 / v60-06 = 8 / v60-07 = 4) |
| Total commits in milestone | 25 across the v6.0 window (2026-05-12 v60-01 first commit → 2026-05-13 `04499a4` v60-12 close) |
| Tests added | +44 within v6.0 (1597 v5.4 baseline → 1636 v6.0 close; +9 from v60-11 / v60-12 emergent phases alone) |
| 52-failure baseline | Held EXACTLY from v60-09 (1615/52) through v60-11 (1636/52) through v60-12 (1636/52) — every phase preserved the baseline as an explicit AC |
| Production data writes | 131 chart docs created in `songs/*` (v60-11 backfill of MIME-filter-excluded shortcuts); 5 setlists migrated via `scripts/backfill-tracks-v60.ts --apply` (v60-06); 22 consumer sites migrated to denorms (v60-08); 4 firestore.rules deploys via `firebase deploy --only firestore:rules` |
| Harness Fidelity Gate counter | Held at 0/3 THROUGHOUT v6.0 — every data-layer phase (v60-03/04/05/06/07/08/09/11/12) shipped emulator-backed coverage. Counter reset from 1/3 → 0/3 at v60-03 (Java JDK 21 + emulator canary green). No clause-(b) waivers consumed across 12 phases. |
| /ui-ux-pro-max gate | BLOCKING for v60-01/02 (Wave 1 UX) / v60-05 (perf-view + editor reads) / v60-06 (dashboard) / v60-09 (picker filter) / v60-10 (Mobile AddBar); satisfied for all. NOT applicable to v60-03 (infra) / v60-04 (server-side) / v60-07 (writer removal) / v60-08 (cleanup) / v60-11 (data-layer) / v60-12 (auth-rules) per SPECIAL-FLOWS.md. |
| Master HEAD at close | `04499a4` feat(v60-12-01): public read on tracks/* + perf-view hook + emulator rules test; close incognito-perform bug |

### Key Accomplishments

- **The v50-05 tracks migration is finally complete.** Top-level `tracks/{id}` is now the SOLE source for "the live track list" across the entire codebase. Every reader routes through one of three helpers (`getTracksForSetlist` server / `getTracksForSetlistClient` client / `fetchTracksForSetlistClient` Web-SDK direct) — no more embedded-array fallback, no more half-migrated dual-source state, no more class of regressions that has dominated 2026-04..05. The architectural-audit antidote Daniel demanded at v5.4 close ("stop with the bandaids. I want a real plan and a real fix") shipped end-to-end.

- **Wave 1 (orthogonal UX) — v60-01 + v60-02.** SyncIndicator conflict-pill rewired to silent last-write-wins + Sentry capture (sole-admin app; true two-writer conflicts essentially impossible; user fatigue with modals takes priority); pagehide/visibilitychange blur protection for mid-edit text (closes the kitchen-sink-harness-undetectable iPad save-loss class first hit at v5h-01 then v5h3 then v50-07).

- **Wave 2 (HFG reset) — v60-03.** Java JDK 21 + emulator canary green; HFG counter reset from 1/3 → 0/3 via working-tree revert-and-fail-then-restore proof; v53-02 clause-(b) waiver RESOLVED; v5h3-01-04 postmortem Action #2 CLOSED after carrying for ~6 weeks. Counter then held at 0/3 across the remaining 9 phases — every data-layer phase shipped real-Firestore emulator coverage instead of waivers.

- **Wave 3 (migration spine) — v60-04 + v60-05 + v60-06 + v60-07 + v60-08 across ~12 plans.** Server-reader spine first (publish / print / public / personal / email-packets / matrix / resend — all route through `getTracksForSetlist`). Client-reader inventory next (3 patterns: Dexie-aware single + Dexie bulk via `useDexieTracksForSetlists` + Web-SDK direct-fetch `fetchTracksForSetlistClient`). Dashboard denormalization (`trackCount` + `songCount` + `fileIds[]` cascaded atomically via SetlistGridHydrator). 15-setlist historical backfill via `scripts/backfill-tracks-v60.ts` (apply/dry-run/rollback triad reusing migrate-v50 MigrationFirestore abstraction); production --apply: 5 migrated / 5 skip-hydrated / 5 skip-empty / 0 errors. Writer removal: 7 write sites stripped of embedded-array writes (W1-W7) + opportunistic `FieldValue.delete()` for hydrated docs in the same transaction (zero extra round-trips). Cleanup: dropped reader fallback from server + client helpers; dropped `tracks` field from both Zod schema AND hand-defined `Setlist` interface; 22 consumer sites across 10 files migrated to denorms in a single Daniel-approved spec-issue expansion ("≤2 consumer sites" estimate proved off by an order of magnitude).

- **Wave 4 (v5.4 fold-forwards) — v60-09 + v60-10 (parallel sessions).** v54-03 cross-device library sync delivered via new `subscribeSongsLibrary` continuous listener (replaces v53-02-01's one-shot `primeSongsLibrary`); write-side parity in rename/archive/upload routes via `Promise.allSettled` non-fatal songs mirror; LocalSong gains `status?: 'active' | 'archived'`; picker filter at Dexie query layer per /ui-ux-pro-max consult; emulator-backed listener round-trip coverage 5/5. Mobile AddBar variant delivered via coarse-pointer sticky-bottom CSS (`[@media(pointer:coarse)]:fixed`) — no first-paint flash on iPad — + new `useVirtualKeyboardOpen` hook (visualViewport.resize listener, 150px threshold) + Tailwind `hidden` for keyboard-up state. Both phases zero file overlap; sequential commits (v60-10 first, v60-09 rebased + second).

- **Wave 5 (emergent close-gate) — v60-11.** Daniel UAT post-v60-09 push surfaced "Lechu Goldman" picker visibility bug — 134 Drive shortcuts in `library_index` but not in `songs/*` (v54-01-01 bootstrap MIME filter excluded them). Fixed by extending `syncLibraryIndex` with a parallel `songsBatch` mirror at the chunk-commit site (no MIME filter, no status writes — status owned by archive route; cron can't clobber). One-off backfill script seeded the 131 historical missing docs (134-gap minus 3 empty-name skips). Pre-APPLY architectural audit (per `feedback_no_paul_audit` memory — /paul:audit broken in this repo so manual audit inline) caught 5 spec issues (A1 title strip / A2 status clobber / B1 batch pattern / B2 scope-name / C2 void prefix) — all patched into PLAN before code touched. Bundled subscribe.ts self-heal (missing `recoverFromFirestoreShutdown` call vs 5 sibling listeners).

- **Wave 6 (emergent close-gate) — v60-12.** Daniel UAT during v7.0 planning surfaced "No tracks yet" on the public perform view at centralreform.live — `tracks/{trackId}` required `isMember()` to read AND `useSetlistPerformance` skipped the snapshot listener for unauthenticated users (citing a stale comment that lied about the page rendering an error for public users). Fixed both layers + added `@firebase/rules-unit-testing` dev dep + first emulator-backed rules test in the project (8 scenarios: read × write × auth-context matrix). Production rules deployed; incognito visitors now see tracks.

- **Architectural-audit + manual-audit patterns paid off repeatedly.** /paul:audit (per-PLAN) is broken in this repo (feedback_no_paul_audit). Manual architectural audit inline caught 5 spec issues on v60-11 (would have been APPLY-time DRIFT/GAP) and 5 architectural concerns on v60-12 (all cleared before code touched). Pattern established: read PLAN + cross-check against source files + classify findings as BLOCKING/MEDIUM/LOW + patch PLAN before APPLY rather than auto-fix during APPLY.

- **Daniel-loop UAT discipline (codified v51-04) validated 6+ times across v6.0.** Caught UAT Issue 1 (v60-09 push → v60-11), UAT Issue 2 (mid-v60-11 push → v60-12 candidate; pending Daniel's clear-site-data diagnostic), Issue 3 (latent subscribe.ts self-heal omission folded into v60-11). Pattern: emergent close-gate phases get added to the milestone rather than deferred; "every milestone closes" discipline preserved.

- **No engine touches across v6.0 client phases.** v60-03 emulator infra alone touched engine-adjacent surfaces; the migration spine (v60-04..v60-08) routed all reads through helpers + all writes through existing `applyEdit` fanout. The kitchen-sink-harness fidelity gap that drove v5h-01 + v5h3 + v50-07 doesn't reappear because every data-layer phase has emulator-backed coverage as a precondition.

### Key Decisions (12 locked at /paul:discuss-milestone 2026-05-12 + emergent during v6.0)

| Date | Decision | Phase | Impact |
|------|----------|-------|--------|
| 2026-05-12 | Option A (finish v50-05 tracks migration) over Option B (rollback) | v6.0 design | Top-level `tracks/{id}` becomes single source of truth. Synthesized from `RESEARCH/TRACKS-MIGRATION-AUDIT-2026-05-12.md`; 27 writers + 26 readers + 5 subscriptions catalogued. |
| 2026-05-12 | Major-version bump v6.0 (not v5.5) for the data-model nature of the migration | v6.0 design | Top-level tracks SSOT replaces half-migrated dual-source state — the dominant regression source since v50-05. |
| 2026-05-12 | 15-setlist historical backfill (not full-library) | v6.0 design | Scope bounded; Daniel-approved at /paul:discuss-milestone; 5 migrated / 5 skip-hydrated / 5 skip-empty in production. |
| 2026-05-12 | Conflict retry → silent last-write-wins + Sentry capture (no user-facing modal) | v60-01 | Sole-admin app; true two-writer conflicts essentially impossible; user fatigue with modals > edge-case fidelity. |
| 2026-05-12 | Browser-smoke before phase close MANDATORY in v6.0 | v6.0 design | User instruction made permanent. Vitest green is necessary but not sufficient; each phase ships a Daniel-runs-this-in-Safari checklist as AC-N. PENDING-UAT marker preserved as the close pattern. |
| 2026-05-12 | v60-03 Java install + emulator canary BLOCKS Wave 3 engine phases | v60-03 | HFG counter must reset to 0/3 before any engine-adjacent phase ships. Resolved v53-02 clause-(b) waiver + closed v5h3-01-04 postmortem action #2. |
| 2026-05-12 | v54-03 cross-device library sync + Mobile AddBar variant fold INTO v6.0 (not deferred to v6.1) | v60-09 + v60-10 | Lands the app in a coherent end state — data model + library sync + mobile add-track all shipped in the same milestone. |
| 2026-05-12 | Immediate `FieldValue.delete()` strip on writer touch, NOT a sweeping cleanup | v60-07 | Smaller surface; each writer naturally drops the field as it touches the doc; no risk of cleanup-script orphaning. |
| 2026-05-13 | Daniel-approved mid-APPLY spec expansion (v60-08 from "≤2 consumer sites" to 22 across 10 files) | v60-08 | First production exercise of "spec-issue diagnostic at mid-APPLY" — pause, present scope reality, let user choose expand vs defer. Pattern: when "≤N estimate" proves off by 10x, surface the choice. |
| 2026-05-13 | songs/* mirror at sync-engine site drops MIME filter; status field owned by archive route | v60-11 | Architectural-audit-caught: A1 title strip + A2 status clobber + B1 batch pattern both BLOCKING before any code. Pattern: pre-APPLY audit reads PLAN + cross-checks against source. |
| 2026-05-13 | Public-read on tracks/{trackId} (Option A simple) vs parent-doc visibility check (Option B) | v60-12 | Setlists already publicly readable; tracks are natural extension. Option B would require `public: true` flag + backfill + dashboard logic — out of scope. |
| 2026-05-13 | @firebase/rules-unit-testing dev dep + 8-scenario rules test pattern | v60-12 | First emulator-backed rules test in the project; reusable template (read × write × auth-context matrix) for future rules edits. |
| 2026-05-13 | Close v6.0 with PENDING-UAT marker per v51-04 codified pattern | v6.0 close | 5th consecutive use (v5.0/v5.2/v5.3/v5.4/v6.0). Daniel "go" override; UAT continues against deployed commits; failures route to in-phase follow-up plans. |

### Patterns Established (carry to v7.0 + beyond)

- **Pre-APPLY manual architectural audit** (per `feedback_no_paul_audit` since /paul:audit is broken in this repo) — read PLAN + cross-check against source files + classify findings as BLOCKING/MEDIUM/LOW + patch PLAN before APPLY rather than auto-fix during APPLY. Proven on v60-11 (5 findings) and v60-12 (5 findings).
- **Emulator-backed coverage as HFG-preserving alternative to clause-(b) waivers** for engine-adjacent / listener / rules phases. Counter held 0/3 across all v6.0 data-layer phases via this discipline.
- **Parallel batch pairs committed via `Promise.allSettled`** for non-fatal secondary writes (v60-09 rename/archive/upload routes + v60-11 sync-engine mirror).
- **Status-field ownership boundary** — each Firestore field has a sole writer; other writers respect via `.set({ merge: true })` with no conflicting field in their payload (codified at v60-11 audit; carry to v7.0 recordings model).
- **Sibling-listener resilience contract** — every Firestore onSnapshot error handler calls `recoverFromFirestoreShutdown` (codified at v60-11; verified at v60-12 hook update).
- **Spec-issue diagnostic at mid-APPLY** — when an estimate is off by 10x, pause and surface the scope-reality choice (expand vs defer); used at v60-08 (22 consumer sites vs ≤2 estimate).
- **Emergent close-gate phases inside a milestone close path** — v60-11 + v60-12 both added during v6.0 PENDING-UAT close window after UAT-class bugs surfaced; pattern reusable when "every milestone closes" + "Daniel-loop UAT" combine.
- **Combined single-commit per phase** with entire `.paul/phases/{phase}/` dir staged together (per memory `feedback_paul_phase_commits`).
- **Firebase CLI as automated task** (per memory `feedback_firebase_cli`) — `firebase deploy --project crcmusiccharts` is automatable; NOT a human-action checkpoint.

---

## ✅ v5.4 Hotfix + Harness Fidelity

**Completed:** 2026-05-12
**Duration:** ~4 days (formalized 2026-05-08; closed 2026-05-12 afternoon after architectural audit + v6.0 reconciliation)
**Status:** Closed with PENDING-UAT marker per the v51-04 codified pattern (4th milestone consecutive). v54-01 + v54-01-02 + v54-01-03 + v54-02-01 LOOP COMPLETE; v54-02-02 emulator canary + v54-03 cross-device library sync + Mobile AddBar variant DEFERRED with **fold-forward labels into v6.0** (v60-03 / v60-09 / v60-10). The 8 P0 patches on 2026-05-12 are PENDING-UAT against deployed commits over the upcoming worship cycle alongside v5.0 + v5.2 + v5.3 + v54-01 carry-over. Daniel halted band-aid patching mid-session 2026-05-12 ("stop with the bandaids. I want a real plan and a real fix"); the architectural-audit antidote produced `.paul/MILESTONE-CONTEXT.md` locking 12 decisions for v6.0 — Tracks Single-Source-of-Truth.

### Stats

| Metric | Value |
|--------|-------|
| Phases | 2 shipped (v54-01 picker bootstrap + thead hotfix / v54-02 harness fidelity infra) + 1 partial (v54-02 Plan 02 deferred) ; 3 fold-forward to v6.0 (v54-02-02 → v60-03 / v54-03 → v60-09 / Mobile AddBar → v60-10) |
| Plans shipped | 4 (v54-01-01 `a693d23` / v54-01-02 `6735f48` / v54-01-03 trackCount reconciler / v54-02-01 emulator infra) |
| Out-of-band P0 patches (2026-05-12) | 8 (`6cd2c4e` tombstones / `c9e92a5` SSR top-level read / `ed63efc` modal version-mismatch filter / `5601726` cascade trackCount / `b0e7033` legacy-stamp self-heal / `7421c51` test expectations / `a0c61cc` modal force-disabled / `4ee6e70` library mirror) |
| Cleanups bundled (2026-05-12) | 2 (`146b40b` T2.6.a unused imports / `6b83ec4` T2.6.d deprecated clearFailedOutboxRows alias) |
| Total commits in milestone | ~18 across v5.4 window (4 phase plan commits + 8 P0 patches + 2 cleanups + audit/pause/wip commits) |
| Tests added | +20 within v5.4 (1597 → 1615 v54-01-01 bootstrap +18; +2 v54-01-02 fileId-on-pick regression; +2 v54-01-03 trackCount reconciler; +2 v54-02-01 emulator canary excluded from main config) |
| Production data writes | 364 chart docs created in `songs/*` + 385 setlist tracks back-stitched with songId |
| Harness Fidelity Gate counter | Held at 1 of 3 (clause-(b) waiver from v53-02 carried). v54-02-02 emulator canary deferred → fold-forward to v60-03 which resets the counter before Wave 3 v6.0 client phases. |
| /ui-ux-pro-max gate | BLOCKING for v54-01 thead repair (satisfied at checkpoint:decision); not applicable to v54-02 infra or P0 sync patches. |
| Master HEAD at close | `9914c17` (paul pause commit) — last code commit `4ee6e70` pushed; tree clean against origin. |

### Key Accomplishments

- **v54-01 — Picker bootstrap + thead hotfix end-to-end across 3 plans.** New `scripts/bootstrap-songs.ts` (firebase-admin + MigrationFirestore adapter reuse + 2-segment marker doc `system/v54SongsBootstrap` + snapshot collection `migrations/v54-bootstrap/snapshot/{songId}` for sticky-memory-safe rollback; CLI flags `--dry-run`/`--apply`/`--rollback`/`--force`/`--no-backstitch`) populated 364 chart docs in production `songs/*` (94 CRC + 272 Shireinu; matches Daniel's expected count within ±2 after a MIME-type filter excluded 89 non-chart entries from library_index's 455 active rows). Back-stitch wrote `songId` on 385 setlist tracks via `track.fileId === songs/{id}` mapping. Closes the deferred v50-07-02b sub-phase that v53-02-01-SUMMARY §212 explicitly flagged. Spreadsheet thead overlap repaired by removing v53-02-01's `overflow-x-auto` wrapper (CSS scroll container was breaking sticky-thead viewport-pinning) and bumping `top-[3.25rem]` → `top-[3.75rem]` per v51-02-01-DESIGN-CONTRACT.md:18 lockstep. /ui-ux-pro-max BLOCKING gate satisfied at checkpoint:decision (locked path-a sticky on th/td directly over path-b display:grid; ~10 LOC vs 150-300). v54-01-02 follow-up (`6735f48`) fixed perform-view click regression — handlePickSong + handleBindChart now write `track.fileId = song.id` alongside `track.songId` so newly-picked tracks pass the `hasFile` clickability gate at SetlistRow.tsx:47 (UAT-routed via v51-04 same-phase pattern). v54-01-03 (trackCount reconciler) closed a second UAT regression — dashboard cards showed "0 songs" because `setlist.trackCount` was only written at create-time; SetlistGridHydrator now subscribes to live Dexie tracks count via `useLiveQuery` and patches `setlists/{id}.trackCount` when drift detected (800ms debounce, ref-tracked last-written, no engine touch).
- **v54-02-01 — Firebase Local Emulator Suite infrastructure shipped.** `firebase.json` gained an `emulators` block (Firestore 8080 / Auth 9099 / UI 4000 / `singleProjectMode: true`); separate `vitest.emulator.config.ts` with `*.emulator.test.{ts,tsx}` glob and main `vitest.config.ts` excludes it; new `npm run test:emulator(:ci)` scripts using `firebase emulators:exec`; CI emulator-tests job in `.github/workflows/ci.yml` (`actions/setup-java@v4` temurin/21 + `actions/cache@v4` for emulator JARs); one canary test proving emulator round-trip (`engine.emulator.test.ts` writes a doc, observes real `serverTimestamp()` Timestamp). Side-fix bundled: `package.json` version `0.2.6` → `5.4.0` (eliminates regression baseline that `update-build-info.js` was computing from on shallow clones) + `scripts/update-build-info.js` no longer recomputes version when `git describe` fails (preserves `pkg.version` as-is, breaks the regression loop). Closes the deferred "Pre-existing local-only state cleanup" sub-phase from v5.4 ROADMAP. **v54-02-02 H-SL-7 regression canary DEFERRED** — `winget install Microsoft.OpenJDK.21 --scope user` failed on author's machine; iterating against CI alone was deemed too error-prone for sync-engine-adjacent tests; Plan 02 folds forward into v6.0 as v60-03 (Java JDK 21 install + canary green; HFG counter reset to 0/3 before Wave 3 client phases).
- **8 P0 patches shipped 2026-05-12 morning before the architectural pivot.** Daniel reported in production: deleted tracks resurrecting, library-added tracks invisible, aggressive merge popups. `6cd2c4e` stops clearing tombstones on delete-commit success (engine.ts). `c9e92a5` makes SSR read from top-level `tracks/{id}` when `setlists/{S}.hydrated === true` (page.tsx). `ed63efc` filters reconciliation modal to version-mismatch rows only (later superseded). `5601726` folds `trackCount` into the cascade's `hydrated:true` setlist update (SetlistGridHydrator.tsx). `b0e7033` makes the engine silently retry VersionMismatchError when `remote=undefined && attempts==0` (silent self-heal of legacy unstamped docs). `7421c51` updates test expectations to match new behavior. `a0c61cc` force-disables the reconciliation modal entirely (`hasConflict = false` unconditional) — pragmatic stop-gap until v60-01 properly rewires the SyncIndicator click path. `4ee6e70` makes the library "Add to setlist" path mirror writes into top-level `tracks/{id}` (use-add-to-setlist.ts) — the start of the dual-write bridge that v6.0 will decommission.
- **Dead-code sweep (2026-05-12 morning).** `146b40b` deleted unused `isMobile` + `useMediaQuery` import in SetlistGrid.tsx (T2.6.a from the FIX-PLAN-V2 backlog); `6b83ec4` dropped the deprecated `clearFailedOutboxRows` alias in `src/lib/sync/cleanup.ts` (T2.6.d).
- **Architectural audit + v6.0 reconciliation (2026-05-12 afternoon).** User explicit instruction halted further patching: *"stop with the bandaids. I want a real plan and a real fix. with real research."* Launched four parallel scope-narrowed audit agents + one synthesizer producing `RESEARCH/audit-writes.md` (27 production writers W1–W27), `RESEARCH/audit-reads.md` (26 production read sites + 5 subscriptions R1–R26 + R-Sub1–Sub5), `RESEARCH/audit-sync.md` (sync mechanics + 4 hot-path traces), `RESEARCH/audit-hotpaths.md` (6 end-to-end user scenarios), and the synthesized `RESEARCH/TRACKS-MIGRATION-AUDIT-2026-05-12.md` design doc recommending Option A (finish the v50-05 migration). `/paul:discuss-milestone` reconciled the v5.4 deferrals against the migration scope; user locked 12 decisions; `.paul/MILESTONE-CONTEXT.md` defines v6.0 — Tracks Single-Source-of-Truth (10 phases in 4 waves, with v54-02-02 / v54-03 / Mobile AddBar folded forward as v60-03 / v60-09 / v60-10). Patterns established: "scope-narrowed parallel audit agents + synthesizer" as the antidote to band-aid drift; "fold-forward labels on milestone reconciliation" so deferred-but-relevant phases get explicit reassignment in the new milestone instead of living orphaned in the old one's deferred bucket.

### Key Decisions

| Date | Decision | Phase | Impact |
|------|----------|-------|--------|
| 2026-05-08 | v5.4 milestone formalized; inaugural phase = v54-01 (picker bootstrap + thead hotfix bundled) | v5.4 | v5.3 PENDING-UAT regressions take priority over deferred Harness Fidelity Gate phase (which becomes v54-02) |
| 2026-05-08 | songs/{libId} = library_index doc id directly | v54-01-01 | Back-stitch trivializes (track.fileId === song.id); v50-04's "distinct songId" was theoretical, never shipped. All future song-catalog work assumes 1:1 mapping with library_index for chart-shaped rows. |
| 2026-05-08 | Bootstrap back-stitch ON by default, `--no-backstitch` opts out | v54-01-01 | ~385 legacy tracks (54%+) get sticky-memory-ready immediately; escape hatch preserved. |
| 2026-05-08 | Path-a (drop overflow-x-auto, sticky on th/td directly) over path-b (display:grid) at /ui-ux-pro-max checkpoint:decision | v54-01-01 | Smallest-fix bias for hotfix; preserves cell boundary locks; HFG counter stays at 1/3; ~10 LOC vs 150-300. |
| 2026-05-08 | MIME-type filter (PDF + MusicXML only) added mid-phase when production dry-run showed 455 candidates vs 366 expected | v54-01-01 | Filter excludes 19 folders + 57 audio + 8 docs + 4 octet-stream + 3 spreadsheets etc.; final 364 matches Daniel's CRC+Shireinu count within ±2. Picker stays sheet-music-only. |
| 2026-05-08 | v54-01 closed PENDING-UAT per Daniel "go" override | v54-01-01 | 4th use of v51-04 codified pattern (v5h3-01 / v53-02 / v53-03 / v54-01). UAT continues against `a693d23` over upcoming worship cycle. |
| 2026-05-08 | Single-source invariant: songs.id === songs.fileId === library_index.id; both picker write paths must respect it | v54-01-02 | UAT regression fix wrote `track.fileId = song.id` alongside `track.songId` instead of falling back to songId at the read site. Pattern: write paths enforce invariants explicitly; do not rely on read-site fallbacks. |
| 2026-05-09 | trackCount reconciler in SetlistGridHydrator (not in each track-mutating handler) | v54-01-03 | Single coupling point; fixes legacy setlists automatically on next open; no engine touch; 800ms debounce + ref-tracked last-written prevents listener-echo write loop. Pattern reusable for any derived-state field that's currently stale on legacy docs. |
| 2026-05-08 | v54-02 ships emulator infra alone; canary deferred behind Java install | v54-02-01 | Counter NOT reset (Plan 01 alone doesn't satisfy "both plans ship + CI proves canary catches v5h3-01-class regression"). Pattern: harness phases can split when local-prereqs block iteration; defer the iteration-heavy plan, ship the standalone-reviewable infra. |
| 2026-05-08 | Bumped `package.json` 0.2.6 → 5.4.0 as side-fix; fixed `update-build-info.js` skip-bump on shallow clones | v54-02-01 | Closes the deferred "Pre-existing local-only state cleanup" sub-phase from v5.4 ROADMAP. Pattern: bundle local-state side-fixes when an adjacent phase exposes them naturally. |
| 2026-05-12 | Halt band-aid patching mid-session; require architectural audit before any new code | v5.4 milestone | User explicit instruction. Four parallel scope-narrowed audit agents + one synthesizer produced `TRACKS-MIGRATION-AUDIT-2026-05-12.md`. Pattern: when patches reveal a half-migrated data model, freeze code and run a writes/reads/sync/hot-paths audit before more bandages. |
| 2026-05-12 | Option A (finish v50-05 tracks migration) over Option B (rollback) | v6.0 design doc | Synthesized recommendation; 12 decisions locked at /paul:discuss-milestone. Top-level `tracks/{id}` becomes single source of truth in v6.0. |
| 2026-05-12 | v5.4 closes cleanly via /paul:complete-milestone BEFORE v6.0 opens | v5.4 milestone | Reconciliation Q1. Preserves "every milestone closes" discipline. v54-02-02 / v54-03 / Mobile AddBar fold-forward into v6.0 as v60-03 / v60-09 / v60-10 instead of staying as zombie deferrals. |
| 2026-05-12 | Major-version bump v6.0 (not v5.5) for the data-model nature of the migration | v6.0 design doc | Reconciliation Q4. Top-level tracks SSOT replaces half-migrated dual-source state that's been the dominant regression source since v50-05. |
| 2026-05-12 | v60-03 Java install + emulator canary BLOCKS Wave 3 engine phases | v6.0 design doc | Reconciliation Q2. HFG counter must reset to 0/3 before any engine seam phase ships. Resumes binding deferral from v5h3-01-04 postmortem. |
| 2026-05-12 | v54-03 cross-device library sync + Mobile AddBar variant fold INTO v6.0 (not deferred to v6.1) | v6.0 design doc | Reconciliation Q3. Lands the app in a coherent end state — data model + library sync + mobile add-track all shipped in the same milestone. |
| 2026-05-12 | Browser-smoke before phase close mandatory in v6.0 | v6.0 design doc | User instruction this session — "stop with the bandaids" made permanent. Vitest green is necessary but not sufficient; each phase ships a Daniel-runs-this-in-Safari checklist as AC-N. |
| 2026-05-12 | Conflict retry → silent last-write-wins + Sentry capture (no user-facing modal) | v6.0 design doc | Reconciliation locked decision #4. Sole-admin app; true two-writer conflicts essentially impossible; user fatigue with modals takes priority over edge-case fidelity. |

---

## ✅ v5.3 Editor UX Repair (rescoped 2026-05-02 to insert v5h3 hotfix)

**Completed:** 2026-05-02
**Duration:** ~12h wall-clock end-to-end (single session; v53-01 research → v5h3 hotfix → v53-02 → v53-03 all shipped same day)
**Status:** Closed with PENDING-UAT marker on 4 of 4 phases per Daniel "push and finish the milestone" judgment call — explicit override of the v51-04-codified "UAT closes the milestone" rule. Daniel-loop UAT continues against deployed commits over the upcoming weekly worship cycle (Friday evening + Shabbat morning); failures route to in-phase follow-up plans (v5*-02) per v51-04 rule. v5.0 + v5.2 milestones remain in their own PENDING-UAT close paths.

### Stats

| Metric | Value |
|--------|-------|
| Phases | 4 (v53-01 research / v5h3-01 save-loss recurrence hotfix / v53-02 chart-bind + sticky-right ChartCell / v53-03 polymorphic Add menu); v53-04 ❌ COLLAPSED |
| Plans | 7 (v53-01-01 research / v5h3-01-01 research / v5h3-01-02 instrumentation / v5h3-01-03 H-SL-7 fix `36e9fa1` / v5h3-01-04 postmortem + binding harness-fidelity gate / v53-02-01 chart-bind `bc754b4` / v53-03-01 polymorphic Add `3a321c9`) |
| Tests added | +69 within v5.3 (suite 1528 → 1597; v53-01 0 / v5h3-01 +32 / v53-02 +15 / v53-03 +22). Cumulative since v5.0 ship: 1474 → 1597 (+123) |
| Source files modified | ~14 unique across milestone (overlap on SetlistGrid.tsx + ChartBindPopover.tsx + AddRowPlaceholder.tsx; new: AddBar.tsx + cleanup.ts + sentry-capture.ts + edit-log writes) |
| Commits | ~12-15 across the milestone (shallow git log shows 7 most recent; older include v53-01 research-synthesis, v5h3-01 instrumentation `1d8d94c`, v5h3-01-03 H-SL-7 fix `36e9fa1`, v5h3-01-04 postmortem) |
| /ui-ux-pro-max gate | BLOCKING for v53-02 + v53-03 (UI-touching); satisfied. Optional for v53-01 + v5h3-01 (research / instrumentation / postmortem). |
| Harness Fidelity Gate | Codified during this milestone (v5h3-01-04 postmortem). Counter at 1 of 3 after milestone close (v53-02 used clause-(b) waiver for SetlistGridHydrator priming-adjacent additive getDocs; v53-03 unchanged). Gate's binding semantics + auto-escalation now operating in production. |

### Key Accomplishments

- **v53-01 — Recursive research front-loaded.** 3 parallel dan-researcher tracks (Track A ChartBind diagnosis HIGH confidence + Track B old-editor archaeology with verdicts table + Track C polymorphic Add option set + chart-peek option set DROPPED per Daniel) + iPad UAT capture (NOT deferred). UAT surfaced **save-loss recurrence** (same class as v5h-01 2026-04-27) — RESCOPE recommendation accepted; v5h3 hotfix inserted BEFORE v53-02..04. Daniel-loop UAT discipline (codified v51-04) validated for the FIRST TIME against a research-phase UAT — caught the bug before any v5.3 code shipped.
- **v5h3-01 — Save-loss recurrence diagnosed + fixed end-to-end same day.** Round-1 research (6 hypotheses) ruled out 3 by code-scan (H-SL-2/3/4); HUMAN-ACTION production capture deferred per Daniel "continue autonomously". Round-2 selection: instrumentation Option B → v5h3-01-02 shipped Sentry breadcrumbs at 5 hot write paths + IndexedDB `edit_log` table + upload-on-mount (commit `1d8d94c`). Mid-execution Daniel UAT surfaced reconciliation-modal evidence → NEW H-SL-7 (HIGH confidence). Pivoted plan from "instrumentation only / wait" → "diagnose + ship targeted fix today". v5h3-01-03 H-SL-7 fix shipped (commit `36e9fa1`): engine writeback now threads server `updatedAt` into pending outbox rows for same `(collection, docId)`; rapid same-doc edits no longer trigger phantom VersionMismatchError; v50-06-02 reconciliation contract preserved (AC-3 explicit test). v5h3-01-04 postmortem at `.paul/postmortems/v5h3-01-save-loss-recurrence.md` + binding **Harness Fidelity Gate** subsection added to PROJECT.md §Constraints (escalates v5h-01 §5 action item #2 from "opportunistic" → BLOCKING for any future data-flow phase; v5.4 phase 1 ship target).
- **v53-02 — Chart binding picker fix + ChartCell discoverability.** cmdk value-format fix at both substrate sites (ChartBindPopover.tsx + AddRowPlaceholder.tsx — `${title} ${id}` concat → `${title}` only); typing-to-filter restored end-to-end. New "Recent" CommandGroup above "Library" in ChartBindPopover (cap 5; sorted by `songs.recent[0].performedAt` desc; reads existing v50-04 fields — NO Dexie schema bump). New `src/lib/songs/prime.ts` library priming helper + SetlistGridHydrator fire-once-per-mount post-hydration effect (one-shot getDocs; NO new snapshot listener; per-mount sentinel; fail-soft). Chart `<th>` and `<td>` carry `sticky right-0` against existing overflow-x-auto wrapper (locked at checkpoint:decision after /ui-ux-pro-max consultation; standard Excel/Sheets pin-column pattern; preserves muscle memory; always visible regardless of horizontal scroll). z-index recipe (header z-20, body z-5, thead z-10) wins both vertical occlusion + horizontal sibling stacking. **Harness Fidelity Gate first production exercise** — waiver counter 1 of 3 (SetlistGridHydrator priming-adjacent touch; additive one-shot getDocs; no engine path; UAT closes the gap). Commit `bc754b4`.
- **v53-03 — Polymorphic Add menu (split-button) restored.** Daniel-locked Option B at /paul:discuss-phase: primary indigo "+ Song" CTA (with `text-indigo-300` Plus icon) opens AddRowPlaceholder picker (Recent / Library / Custom three CommandGroups — same v53-02 substrate pattern; cmdk filters all groups together; `value={song.title}` only). Sibling chevron Popover reveals 5 colored tiles (Section muted / Reading amber-300 / Prayer blue-300 / Transition emerald-300 / Stage note muted) — one tap inserts row of that TrackType via single applyEdit('set','tracks',...) write path. Tile size ≥48 fine / ≥56 coarse with gap-2 (≥8px touch-spacing); aria-label="Add track of another type" on icon-only chevron; jest-axe ZERO violations on rest + chevron-open states. Long-press disambiguation: explicit `onContextMenu` preventDefault on chevron + every tile + primary trigger (defense-in-depth against v50-05-04 row contextmenu synthesizer; AddBar lives outside row scope, but cost-zero defense applied). Restores Daniel's biggest post-v50-02-amputation regret — *"the old 'add' menu was MUCH better."* Commit `3a321c9`.
- **Three Daniel-stated v5.3 high-friction surfaces all closed.** (1) ChartBind picker filter broken → fixed at both substrate sites in v53-02. (2) ChartCell off-screen on iPad ("scroll way to the right") → sticky-right pin-column in v53-02. (3) Single-purpose Add affordance → polymorphic split-button + 5 tiles in v53-03. Chart-verification peek explicitly DROPPED per Daniel mid-milestone ("don't worry about this. Fix the other pieces.").
- **Daniel-loop UAT discipline (codified v51-04) validated repeatedly.** Worked at v53-01 research-phase capture (caught save-loss recurrence before any v5.3 code shipped) AND mid-execution at v5h3-01-02 (caught reconciliation-modal evidence; pivoted plan to ship same-day H-SL-7 fix). Pattern proven across 3 distinct invocation contexts (v51-04 codification; research-phase UAT; mid-execution UAT). v5.3 ships with PENDING-UAT marker on all 4 phases — Daniel-loop continues over the upcoming worship cycle; failures route to v5*-02 follow-up plans per v51-04 rule.
- **Harness Fidelity Gate codified + binding from v5.3 onward.** Twice-implicated kitchen-sink harness fidelity gap (v5h-01 + v5h3) escalated to BLOCKING for any future data-flow phase. PROJECT.md §Constraints "Harness Fidelity Gate" subsection establishes binding semantics: any plan touching protected-list files (sync engine / Dexie schema / snapshot-listener / lazy-hydration / perf-view / cells/ / firestore.rules) MUST land AFTER remediation OR carry a documented waiver under boundaries SCOPE LIMITS. Three waivers in a row triggers re-prioritization to v5.4 phase 1 (Firebase Local Emulator Suite integration + thin RTL editor↔perf-view test pair). v53-02 used the first waiver; v53-03 unchanged (counter stays at 1 of 3).
- **v53-04 collapsed cleanly.** Original phase scope was "whatever Track B surfaces beyond polymorphic Add menu as port-back-worthy"; Track B's only remaining candidate (chart-preview port-back from `SongRow` collapsed-state file-name link) died with chart-verify drop earlier same day. Net zero remaining scope; phase removed from ROADMAP table; empty directory removed; v5.3 milestone shape became 4 implementation phases (v53-01 / v5h3-01 / v53-02 / v53-03).

### Key Decisions

| Decision | Phase | Impact |
|----------|-------|--------|
| RESCOPE v5.3 mid-milestone to insert v5h3 hotfix BEFORE v53-02..04 | v53-01 → milestone | First production exercise of in-milestone rescope based on Daniel-loop UAT signal. Pattern: if research-phase UAT surfaces NEW high-severity findings outside plan scope, synthesis MUST recommend rescope (not approve, not round-2). Pattern carries to all future milestones. |
| Engine writeback threads server `updatedAt` into pending outbox rows for same (collection, docId) | v5h3-01-03 | Closes H-SL-7 phantom-VersionMismatch class without touching v50-06-02 reconciliation contract; surgical fix landed same-day mid-milestone. AC-3 explicit test guards the contract. |
| Harness Fidelity Gate binding from v5.3 onward (PROJECT.md §Constraints) | v5h3-01-04 → milestone | Twice-implicated kitchen-sink harness fidelity gap escalated to BLOCKING. Binding semantics + waiver clause + 3-strike auto-escalation now operating. v5.4 phase 1 = Firebase emulator + RTL pair. Counter discipline: v53-02 used clause-(b) waiver; counter at 1 of 3. |
| Recent ranking via existing v50-04 SongRecentEntry.performedAt (NO Dexie schema bump) | v53-02-01 | Discovered during plan-time tech reads; avoided v3→v4 schema migration risk; reduced Harness Fidelity Gate waiver scope; pattern: check existing types BEFORE proposing new ones. |
| Sticky-right ChartCell column (locked at checkpoint:decision after /ui-ux-pro-max consultation) | v53-02-01 | Standard Excel/Sheets pin-column pattern; preserves muscle memory; always visible regardless of horizontal scroll. Documented z-index recipe (header z-20, body z-5, thead z-10) reusable for future spreadsheet pin-columns. |
| Option B split-button for polymorphic Add (NOT Option A grouped CommandList) | v53-03-01 | Daniel-locked at /paul:discuss-phase per Track B "muscle memory + colored type tiles are the discoverability cue" finding; literal port of d8c0442 AddBar shape into v50-05 substrate. ~+180 LOC vs ~+50 LOC for Option A. |
| Ported icon colors (amber Reading / blue Prayer / emerald Transition / muted Header+Note) | v53-03-01 | Daniel-locked per Track B finding — colored icon vocabulary is "the discoverability cue Daniel misses since v50-02 amputation." Color is enhancement on top of icon shape + text label (satisfies ux-pro-max Color-Only HIGH rule). |
| Long-press disambiguation as defense-in-depth on chevron + tiles + primary trigger | v53-03-01 | AddBar lives outside row scope; positional analysis says no v50-05-04 conflict; cost-zero `onContextMenu` preventDefault applied anyway. Pattern reusable for any tappable element near a row-context-menu surface. |
| Recent / Library / Custom three-CommandGroup picker is canonical | v53-02 + v53-03 | Two consumers (ChartBindPopover + AddRowPlaceholder); pattern reusable for any future cmdk picker that needs frequency-based + alphabetical + free-text choice surfaces. |
| Daniel-loop UAT discipline validated 3x in single milestone | v53-01 + v5h3-01-02 + v53-03 | Worked at research-phase capture / mid-execution pivot / sight-unseen approval contexts. Pattern proven across 3 distinct invocation modes. v5*-02 follow-up routing rule continues to govern UAT failures. |
| v5.3 closed with PENDING-UAT marker per Daniel "push and finish the milestone" | milestone close | Explicit override of v51-04-codified "UAT closes the milestone" rule. Daniel judgment call — pattern: user explicit instruction always trumps standard discipline; UAT continues against deployed commits over upcoming worship cycle; failures route to in-phase follow-up plans. |
| v53-04 collapsed cleanly at milestone close | v53-04 | Net zero remaining scope after chart-verify drop; phase removed from roadmap; empty directory removed; v5.3 became 4 phases instead of 4-with-collapse. Pattern: phases can be removed during milestone if scope evaporates; preserve original rationale for archive. |

---

## ✅ v5.1 Editor UX Polish (Band-Onboarding Gate)

**Completed:** 2026-04-27
**Duration:** ~4h end-to-end (single session, started 15:30Z, completed 19:32Z)

### Stats

| Metric | Value |
|--------|-------|
| Phases | 4 (v51-01 / v51-02 / v51-03 / v51-04) |
| Plans | 4 (one per phase — all vertical slices) |
| Files modified | ~24 across plans (some overlap on SetlistGrid.tsx between v51-01, v51-02, v51-04) |
| Tests added | +32 across the milestone (1481 → 1513) |
| Commits | 7 (v51-01: `6671254` / `c11a5c4` / `304e940`; v51-02: `c40d880` / `05ddafb`; v51-03: `f30e819` / `6c5040a`; v51-04: `233d8b5` / `b023ea0`) plus the wip plan commit `d4f7093` |
| /ui-ux-pro-max gate | BLOCKING for every phase (per SPECIAL-FLOWS.md); satisfied for all 4 |

### Key Accomplishments

- **v51-01 — Picker rework across all 6 dropdown sites.** TouchOrPopover Sheet branch removed → always-anchored Radix Popover; `onOpenAutoFocus(preventDefault)` on `(pointer:coarse)` so cmdk CommandInput stays visible without auto-popping the iPad system keyboard. DropdownCell gained `mode='discrete'|'searchable'` + `renderPickerContent` slot; discrete mode skips CommandInput entirely (Key + Type + Bulk-Key/Type + AddRow); searchable mode keeps CommandInput unfocused on touch (Lead + ChartBind + Bulk-Lead + AddRow library lookup). KeyCell rewritten with KEY_OPTIONS_MAJOR + KEY_OPTIONS_MINOR chromatic ascending C→B; Radix Tabs (shadcn) for Major | Minor with smart default tab inference (ends-in-m → Minor); 44px tap targets + 8px row spacing + selected-state font-semibold + indigo highlight on `(pointer:coarse)` for stage-distance scanability. Storage values preserved verbatim (no Firestore migration); display labels unify enharmonics as `C♯/D♭`. Symmetric "no keyboard until deliberate tap" rule across all 6 sites.
- **v51-02 — Editor readability + visual hierarchy locked.** Option B Comfortable Dense shipped after /ui-ux-pro-max consultation surfaced 3 implementable option sets in `v51-02-01-DESIGN-CONTRACT.md` (A Tight Compact / B Comfortable Dense / C Hierarchical Spacious). Decision: 44px desktop / 48px tablet outer rows (down from ~56/68); column widths narrowed (type 120→104, key 80→72, bpm 72→64; lead capped 156, notes 220 so title flex-fills as primary tier); tier-class hierarchy via redundant cues (weight + color): T1 title `text-sm font-semibold text-foreground`, T2 key `text-sm font-medium tabular-nums text-indigo-200`, T3 lead/type/bpm `text-[13px] font-normal text-muted-foreground` (bpm tabular-nums), T4 notes `text-xs font-normal text-muted-foreground/75`. Section rows framed with `bg-indigo-500/[0.08] + border-l-2 border-indigo-400/50 + border-t border-indigo-500/25` and smallcaps title banner; selection opacity 5%→8%. Single-file implementation (SetlistGrid.tsx); mobile parallel render path (MobileCardList from v50-05-05) + picker internals from v51-01 + sync engine + perf-view + firestore.rules all boundary-locked with empty diff.
- **v51-03 — Smart create-setlist wizard with date-aware Clone CTA.** Three priority-ordered offers in a card-framed pre-form strip the moment a service date is picked: **Clone last {service-name} ({date})** primary brand-colored CTA + **Use a template** + **Start from scratch** as text-link options (≥44px tap targets). New `findLastMatchingService(serviceType, beforeDate?)` on createSetlistService queries the 20 most-recent setlists, infers each candidate's effective service type from `templateType` (with `'festival'` fan-out matching sukkot/simchat_torah/passover/shavuot specific types) or falls back to `getServiceContext(eventDate).type` for legacy setlists. New generic `cloneSetlist(source, targetDate)` extracted; legacy `cloneForNextWeek(source)` refactored as a thin wrapper preserving its public surface so EmptyState's "Make next week's" CTA is untouched. `useCreationWizard` exposes `mode` ('idle'|'clone'|'template'|'scratch') / `cloneSource` / `cloneSourceLoading`; useEffect on eventDate triggers the lookup with auto-default-to-clone-when-mode='idle' (handleTemplateSelect locks mode='template' BEFORE setEventDate so the lookup effect respects explicit user intent). Sticky-memory contract from v50-04 verified intact — cloned tracks are byte-identical copies; new ChartBindPopover bindings still pull fresh sticky values via `seedTrackFromSong` at READ time; `defaults.ts` NOT modified. 90% weekly use case (clone last week's Erev Shabbat) is now one click after picking a date.
- **v51-04 — "Vocal Lead" terminology + Daniel-loop UAT codification + gig-packet print smoke.** Six-surface "Lead" → "Vocal Lead" terminology rename across the editor (SetlistGrid column header), batch-edit popover (BulkPopover label/aria/placeholder/emptyHint), mobile edit sheet (field label + input aria-label), importer modal (preview-table `Key/Lead` → `Key/Vocal Lead` + performer-cell placeholder), and gig-packet print pipeline (cover-page column header + colLead x-coord shift left 20pt for "Vocal Lead" header to fit at 10pt Helvetica-Bold without overflowing colTransKey/colNotes). Internal identifiers preserved verbatim per boundary lock: `leadMusician` (DB field), `lead` (patch alias), `setlistLeads`/`libraryLeads`/`knownLeads` (autocomplete arrays), `LeadCell` component, `setLead`/`commitLead` handlers, `isLeader`/`onLeaderSetPosition` (perform-mode band leader controlling perf-view position broadcasting — distinct concept), `band_leader` UserRole literal in roles.ts, `"Led by: ${rabbi}"` print line at print-pipeline.ts:257. New `testId?: string` prop on BulkPopoverProps decouples user-facing label from testid stem; the Vocal Lead bulk passes `testId="lead"` to preserve `batch-action-lead-trigger` / `batch-action-lead-popover` testid stability. PROJECT.md gained "UAT Discipline (data-flow fixes)" subsection codifying the Daniel-loop UAT cadence per postmortem v5h-01 §5 action item #4. Gig-packet print smoke verified end-to-end on a real Erev Shabbat / Shabbat morning setlist with mixed track types + assigned musicians + rabbi: cover page lists every track in order, "Led by: {rabbi}" intact, eventDate + setlist title correct, per-musician transpositions render at correct semitone offsets.
- **Band-onboarding gate cleared.** Done definition met across all 4 phases: clean iPad flow + tighter editor density + smart date-aware setlist creation + consistent "Vocal Lead" terminology + project-level UAT discipline + verified print pipeline. Daniel approved each phase's HUMAN-VERIFY checkpoint post-deploy. Ready to invite the band.

### Key Decisions

| Decision | Phase | Impact |
|----------|-------|--------|
| Radix Tabs for Major / Minor key picker (chromatic order C→B inside each tab) | v51-01-01 | Symmetric "no keyboard until deliberate tap" rule across all 6 dropdown sites; informed by /ui-ux-pro-max database (shadcn Tabs primitive + "Hover vs Tap" HIGH-severity rule). Future picker work follows the same shape |
| Locked Option B Comfortable Dense for editor density (44/48 outer rows) | v51-02-01 | DESIGN-CONTRACT.md surfaced 3 options via /ui-ux-pro-max consultation; B chosen for meaningful density tightening + section framing + tablet tap comfort + lowest implementation risk + redundant tier hierarchy cues (weight AND color). Future tier swaps are single-line edits to TIER1_TITLE/TIER2_KEY/etc. constants in SetlistGrid.tsx |
| Section-row detection uses isSectionRow(t) covering 'header' OR 'section' | v51-02-01 | TrackType union (src/types/models.ts) defines 'header'; TypeCell picker writes 'section'. Pre-existing mismatch defensively double-checked rather than fixed — future plan touching the type column should reconcile (out of v51-02 scope per boundaries) |
| Skip shadcn Tooltip dependency in CreationWizard offer strip | v51-03-01 | Tooltip primitive absent from src/components/ui/. AC-5 explicitly allowed hide-with-explanatory-text alternative. Avoiding a new dependency for a single disabled-state caption keeps the no-dep budget |
| Service-type matching is a pure exported helper (`setlistMatchesServiceType`) | v51-03-01 | The riskiest part is the `templateType` (6 values) → `ServiceType` (11 values) resolution + festival-bucket fan-out + legacy fallback to `getServiceContext(eventDate)`. Extracting it as a pure function lets 6 of 13 tests run zero-mock against this logic |
| Festival templateType matches sukkot / simchat_torah / passover / shavuot specific service types | v51-03-01 | Legacy data shape: `templateType` was added with only 6 buckets including `'festival'` as a catch-all; ServiceType later expanded to 11 specific holiday types. Treating `'festival'` as a multi-match bucket means a Sukkot user request matches an old festival-tagged setlist without requiring a data migration |
| Mode auto-defaults to 'clone' only when current mode is 'idle' | v51-03-01 | `handleTemplateSelect` calls `setMode('template')` BEFORE `setEventDate(baseDate)` so when the eventDate effect fires, it sees mode≠'idle' and skips the auto-flip. Prevents "user picked a template, lookup fired, mode flipped to clone" footgun |
| Add `testId` prop to components with label-derived testids before renaming labels | v51-04-01 | When BulkPopover's testid stem was auto-derived from `label.toLowerCase()`, renaming `label="Lead"` → `label="Vocal Lead"` broke `batch-action-lead-trigger`. Adding an additive `testId?` prop with `idStem = testId ?? String(label).toLowerCase()` resolution preserves the test seam |
| Codify Daniel-loop UAT cadence in PROJECT.md as a project-level discipline | v51-04-01 | After v5.0-hotfix track-edit save-loss (kitchen-sink harness 1468/1468 green missed missing tracks/{id}+songs/{id} firestore.rules; Daniel UAT against real production caught it as path "P"), institutionalize the UAT cycle for every data-flow-touching fix |
| Pre-flight column-width math when renaming PDF column headers | v51-04-01 | 10pt Helvetica-Bold word widths: 'Lead' ~24pt, 'Vocal Lead' ~52pt — so a +28pt header needs a ~20pt left-shift of the column origin. Pattern: any future PDF header text rewrite checks adjacent x-coordinates first |

---

## ✅ v5.0-hotfix Track-Edit Save-Loss Fix

**Completed:** 2026-04-27
**Duration:** ~6h end-to-end on 2026-04-27

### Stats

| Metric | Value |
|--------|-------|
| Phases | 1 (v5h-01) |
| Plans | 4 (3 PLAN files; v5h-01-03 was an architectural pivot from a planned execute fix) |
| Files modified | ~10 (firestore.rules + 3 test files + 3 source files + models.ts + postmortem + state docs) |
| Tests added | +7 across the hotfix (1474 → 1481) |
| Production data loss | 0 confirmed |
| Affected users | 1 (Rabbi Daniel; band not yet onboarded) |
| Commits | `0c2921d` fix, `92b1902` perf-view final, `62298c0` postmortem + phase close |

### Key Accomplishments

- **Root cause identified despite 3 wrong handoff hypotheses.** Production capture (DevTools → IndexedDB → `crc-local`/`outbox`) revealed the bug was NOT engine-side (LWW underflow / writeback miss / serverTimestamp race all ruled out). Actual cause: missing `match /tracks/{trackId}` + `match /songs/{songId}` blocks in `firestore.rules` from v50-05 cutover; default-deny silently rejected every track write; per-doc drain ordering blocked subsequent edits behind failed `set` rows; SetlistGridHydrator re-primed legacy embedded `setlists/{id}.tracks[]` over stuck-pending local edits.
- **E+F+B defense-in-depth fix shipped (commit `0c2921d`).** Rules deployed via `firebase deploy --only firestore:rules` to crcmusiccharts; SetlistGridHydrator outbox-pending guard around `db.{setlists,tracks}.put`; snapshot-listener strict-equality LWW guard preserving local row when `updatedAt` is undefined; `property-failures.test.ts` AC-1 regression-locked.
- **Diagnostic chain closed AC-4 same day.** 142 stuck outbox rows (46 failed + 96 pending blocked behind them); auth token stale post-rules-deploy → sign-out/in restored `role: "admin"`; reset-and-drain snippet flipped 46 failed → pending → engine retried with fresh token → cell-edits started persisting.
- **Perf-view architectural refactor (commit `92b1902`).** 4 iterations: `f83d75d` reverted (returned `[]` during initial mount), `8971223` superseded (`metadata.fromCache` is source not freshness), `4aa6840` superseded (correct gate signal but architectural divergence remained), then `92b1902` — `useSetlistPerformance` rewritten to read tracks from Dexie via `useLiveQuery` + mount snapshot-listener + retain embedded fallback ONLY for unhydrated legacy setlists. Editor and perf-view now share the same data path; cache-vs-server-fresh class of bugs eliminated by construction. 18 brittle onSnapshot mock tests replaced with 15 focused tests using `fake-indexeddb` + listener test seam.
- **Daniel UAT 2026-04-27 confirmed editor + perf-view working end-to-end.** "worked!"
- **Postmortem captured 5 lessons + 5 action items** at `.paul/postmortems/v5h-01-save-loss.md`: cutover-plan rules-audit gap proposal (gate to add to PAUL/CARL planning); kitchen-sink harness fidelity gaps named with remediation options (Firebase emulator + thin RTL editor↔perf-view test pair recommended); perf-view 4-iteration architectural-rethink lesson (`metadata.fromCache` is source not freshness; 2-3-strikes architectural-rethink rule); auth-claim staleness incident; Daniel-loop UAT cadence as v5.x norm; Issue 2 (iPad key-picker UI) routing rule (tap-target/sheet → v50-05-04 regression; "feels janky" → v5.1 UX overhaul).

### Key Decisions

| Decision | Phase | Impact |
|----------|-------|--------|
| Read perf-view tracks from Dexie via useLiveQuery (not Firestore directly) | v5h-01-03 | Eliminates cache-vs-server-fresh class of bugs by construction; unifies editor + perf-view data path |
| Mount snapshot-listener inside perf-view (not just editor) | v5h-01-03 | Covers iPad-only perf-view sessions on stage; cross-device updates flow Firestore → Dexie → useLiveQuery |
| Embedded fallback ONLY when `setlistData?.hydrated !== true` | v5h-01-03 | Hydrated setlists post-cascade have stale embedded by design; falling back would show pre-migration keys forever |
| E+F+B defense-in-depth (rules + Hydrator outbox guard + listener LWW) over E-only | v5h-01-02 | Rules close the door; outbox guard + LWW prevent recurrence if a similar gap reappears in a future cutover |
| Architectural fix over patches when 2-3 hook iterations don't close UAT | v5h-01-03 | "2-3-strikes architectural-rethink rule" codified in postmortem; saved retroactively from this iteration cycle |
| Postmortems live at `.paul/postmortems/{phase-id}-{topic}.md` | v5h-01-04 | Naming convention preserved (mirrors `v50-07-save-loss-investigation.md`); cross-referenceable from SUMMARYs |
| Auth-claim auto-refresh on rules-version change OUT of scope | v5h-01-04 | Firebase doesn't expose rules-version; complexity not worth rare scenario; documented for awareness |

---

## ✅ v4.4 Deferred Audit Sweep — Architectural Polish

**Completed:** 2026-04-15
**Duration:** 1 session

### Stats

| Metric | Value |
|--------|-------|
| Phases shipped | 5 of 8 (Phase 4 deferred P2; Phases 7+8 deferred to v4.5) |
| Plans | 5 |
| Files modified | ~30 |
| Tests added | +37 (1287 → 1324) |
| Commits | ~24 (5 phase summaries + atomic task commits) |

### Key Accomplishments

- **Phase 1 — Data-layer atomicity**: scheduling assign/decline transactions (DL-001/002/003/012/013/014) consolidated; eliminated split-write races
- **Phase 2 — Denormalization reconciliation**: user-rename + setlist-rename fan-out (DL-010) so musicianName/userName never goes stale on assignments
- **Phase 3 — Client async safety**: 11 AbortController sites + 3 stale-closure refs + PDFViewer retry cap (3) + 5-test regression suite
- **Phase 5 — Observability**: request-ID end-to-end via AsyncLocalStorage; chat SSE meta/heartbeat/done frames; api-client surfaces server requestId on errors (closes L-001 + S-004)
- **Phase 6 — Modal state hygiene**: EditDetails/NamePrompt re-seed on open; UserRow role-confirm reset; CollapsibleSection localStorage opt-in (storageKey); SwapPicker selection/query reset (closes UX-001/002/011/015/018 — last R2B "must fix before release" items)
- **Band-onboarding UX gate cleared**: All P0/P1 audit findings closed; app ready for first-band rollout

### Key Decisions

| Decision | Phase | Impact |
|----------|-------|--------|
| Phases 4, 7, 8 deferred to v4.5 (P2 cosmetic vs. real user feedback) | Milestone close | Ship now, polish post-onboarding |
| AsyncLocalStorage for request-ID propagation (no manual plumbing) | Phase 5 | Logger auto-tags every call within a request scope |
| globalThis.__requestIdGetter__ resolver instead of static import | Phase 5 | Prevents `node:async_hooks` leaking into client bundle |
| Chat SSE: meta/heartbeat/done frames are additive (assistant token format byte-identical) | Phase 5 | ChatPanel parser unchanged; existing tests pass unmodified |
| CollapsibleSection localStorage opt-in via storageKey prop | Phase 6 | Backward compatible; no surprise persistence |
| EditDetails re-seed deps narrowed to [isOpen] only | Phase 6 | Prior implementation clobbered in-progress edits on parent re-render |
| ref-stabilise onDismiss/onClose to prevent stale closures (TempoFlash, PDFOverlay) | Phase 3 | Latest callback fires, not the one captured at mount |
| PDFViewer retry cap = 3 attempts (terminal error on exhaustion) | Phase 3 | Prevents infinite thrash on broken charts |

---

## ✅ v3.4 Fixes & Live Mode Activation

**Completed:** 2026-04-04
**Duration:** 1 session across 2 plans + 1 bugfix

### Key Accomplishments

- LeaderConsole mounted on performance page as collapsible panel (absorbs v3.3)
- Admin/band_leader can delete any public setlist (UI + Firestore rules)
- Print cover page includes all items (readings, prayers, transitions) — not just songs
- "Led by: {rabbi}" shown on print cover page when rabbi field is set
- CSP updated to allow hebcal.com for liturgical calendar
- Fixed Firestore undefined rejection in cloneForNextWeek

### Key Decisions

| Decision | Phase | Impact |
|----------|-------|--------|
| Collapsible panel for LeaderConsole | P1 | Doesn't dominate screen for non-leaders |
| Band leaders can delete public setlists only | P2 | Consistent with update permissions |
| Cover page shows ALL items, not just songs | P2 | Full order of service visible on outline |
| Rabbi field as "Led by:" (not creator) | P2 | Service attribution to actual leader |
| Spread operator to omit undefined rabbi | Bugfix | Firestore rejects undefined values |

---

## ✅ v3.0 Live Setlist Sync

**Completed:** 2026-03-30
**Duration:** 1 session across 5 plans

### Stats

| Metric | Value |
|--------|-------|
| Phases | 3 |
| Plans | 5 |
| Files created | 10 |
| Files modified | 12 |

### Key Accomplishments

- Song group tagging system with liturgicalSlot + config/songGroups Firestore document
- canLiveSwap permission model mirroring soundEngineer (profile + custom claims + auth context)
- Firestore security rules with field-level restrictions (affectedKeys().hasOnly) and rate limiting
- swapLiveTrack() atomic swap function (tracks + liveState in single updateDoc)
- SwapButton on eligible SetlistRows (amber, 44px touch target, live mode only)
- SwapBottomSheet with 3-tap swap flow (56px alternatives, "Swap Now")
- SwapToast receiver notification (4s auto-dismiss, dedup via swapId)
- Offline connectivity indicator in performance view
- Admin UI: canLiveSwap toggle in UserRow + Song Groups tab with template seeding
- 4-round recursive research (12 agents) informing architecture decisions

### Key Decisions

| Decision | Phase | Impact |
|----------|-------|--------|
| Hybrid song grouping (tag + config doc) | P1 | No sync issues, client-side filtering |
| canLiveSwap mirrors soundEngineer pattern | P1 | Consistent permission model |
| affectedKeys().hasOnly() for field-level rules | P1 | Swap users restricted to tracks/liveState only |
| 3-tap flow without separate confirm button | P2 | Fastest possible with safety |
| SwapToast dedup via swapId ref | P2 | Prevents re-showing on re-renders |
| navigator.onLine for offline detection | P3 | Simpler than Firestore fromCache |

---

## ✅ v2.6 Deprecation Cleanup, Tech Debt & Setlist UX

**Completed:** 2026-03-12
**Duration:** ~1 day across 3 plans

### Stats

| Metric | Value |
|--------|-------|
| Phases | 3 |
| Plans | 3 |

### Key Accomplishments

- Setlist row layout — key badge next to title, inline amber notes, dual-tint alternating rows
- Next.js & Sentry deprecation cleanup — proxy.ts rename, instrumentation-client migration, global-error with Sentry
- Technical debt — leader→band_leader Firestore migration script, build-info git describe cleanup

### Key Decisions

| Decision | Phase | Impact |
|----------|-------|--------|
| bg-white/[opacity] for dark-mode alternating rows | P1 | Predictable alpha on dark backgrounds |
| Dual-tint rows (0.03/0.07) | P1 | Both rows readable |
| Next.js 16 proxy requires export function proxy() | P2 | Not just a file rename |

---

## ✅ v2.5 Bugsweep & Test Coverage

**Completed:** 2026-03-12
**Duration:** ~2 days across 30 plans

### Stats

| Metric | Value |
|--------|-------|
| Phases | 19 |
| Plans | 30 |
| Commits | 55 |

### Key Accomplishments

- **Type safety & error handling:** Eliminated all `as any` casts, fixed empty catches, added notification tracking, moved CORS to env
- **Comprehensive test coverage:** 1117 tests — data layer, API routes, hooks (221 tests across 17 hooks), components (116 tests), AI/integration (53 tests)
- **SW removal & Firestore recovery:** Fixed production IndexedDB crash, fully removed PWA/service worker, uninstalled next-pwa
- **Annotation feature removed:** Simplified chart viewer by removing unused drawing tools
- **Mobile action bar redesign:** MobileTabBar rewritten as Search/Setlist/Monitor action bar with Fuse.js search
- **Tablet performance UX:** Three-tier responsive layout, 44px touch targets, swipe-while-zoomed, 15s auto-hide
- **Bug fixes & race conditions:** Firestore notification rule tightened, N+1 batch fetch, AbortController for offline, 8 bugs fixed
- **Setlist-only print option:** Cover page toggle for quick one-page song list prints
- **Design tokens & accessibility:** Hardcoded colors replaced with tokens, 20 icon-only buttons labeled
- **Backend hardening:** Firestore transactions for admin ops, rate limiting, ApiErrorResponse standardization, config/admins doc
- **Final audit:** Zero tsc errors, zero ESLint warnings, 1117 tests passing, production build verified

### Key Decisions

| Decision | Phase | Impact |
|----------|-------|--------|
| Mock objects exported from helpers, vi.mock() stays in test file | P3 | Vitest hoisting compatibility |
| PWA/SW fully removed, next-pwa uninstalled | P6.1 | SW caused stale deploys; venue has wifi |
| Annotation feature removed entirely | P7 | Unused; simplifies toolbar |
| Fuse.js for MobileTabBar search over library store | P10.1 | No API round-trip for song search |
| Three-tier responsive: default → md: → lg: | P13 | Tablet gets dedicated layout |
| coverOnly early-return in print pipeline | P15 | Skips all PDF processing for cover-only prints |
| WriteBatch for delete-user, runTransaction for set-role | P18 | Atomic admin operations |
| config/admins Firestore doc for super-admin bootstrap | P18 | Replaces hardcoded UID in rules |

---

## v1.4 Fixes & Library Management

**Completed:** 2026-03-10
**Duration:** ~1 hr across 5 plans

### Stats

| Metric | Value |
|--------|-------|
| Phases | 5 |
| Plans | 5 |
| Files changed | 14 |

### Key Accomplishments

- Library management: rename songs (displayName overlay), unlink charts from tracks, restore archived songs
- Prominent key badge in setlist editor (text-sm, font-semibold, bg-brand/20)
- 5 monitor buses as default for CRC's X32 setup
- Print gig packet fixes: iframe-based printing (no black screen), eventDate support, token retry
- PDF health scanner: workerless pdfjs eliminates false positives, strict mimeType filter
- Full codebase audit: 7 critical, 11 high, 17 medium, 8 low findings catalogued
- Recommended v1.5 phase structure based on audit findings

### Key Decisions

| Decision | Phase | Impact |
|----------|-------|--------|
| displayName overlay for song rename (Firestore, not Drive) | Phase 1 | Preserves Drive filenames |
| Iframe over window.open for PDF printing | Phase 3 | Reliable cross-browser printing |
| apiFetch throws on token failure | Phase 3 | Surfaces auth issues early |
| Workerless pdfjs for scanner | Phase 4 | Eliminates worker URL dependency |

---

## v1.3.1 Regression Fixes

**Completed:** 2026-03-10
**Duration:** ~8 min across 1 plan

### Stats

| Metric | Value |
|--------|-------|
| Phases | 1 |
| Plans | 1 |
| Files changed | 6 |

### Key Accomplishments

- Cache-busted PDF worker URL (`pdf.worker.min.{version}.mjs`) eliminates stale worker mismatch after deploys
- Ref-based uid tracking in useMonitorConnection prevents effect churn during iPad auth token refresh
- visibilitychange listener reconnects monitor after iOS Safari tab suspension
- 5s teardown debounce accommodates iPad suspension timing
- Dev script parity with build (copy-pdf-worker runs in both)

### Key Decisions

| Decision | Phase | Impact |
|----------|-------|--------|
| pdfjs.version in worker URL for cache busting | Phase 1 | Prevents stale worker mismatch after deploys |
| Ref-based uid tracking in useMonitorConnection | Phase 1 | Prevents effect churn during iPad auth token refresh |
| visibilitychange as iOS Safari reconnection trigger | Phase 1 | beforeunload doesn't fire on iOS Safari |

---

## v1.3 Bugsweep & Backend Hardening

**Completed:** 2026-03-10
**Duration:** ~76 min across 7 plans

### Stats

| Metric | Value |
|--------|-------|
| Phases | 4 |
| Plans | 7 |
| Files changed | 40+ |

### Key Accomplishments

- Produced comprehensive codebase audit with 20+ findings categorized by severity
- Fixed QR auth token binding vulnerability and AI concurrency deadlock
- Added rate limiting to unauthenticated endpoints and fire-and-forget notification safety
- Standardized error responses via createApiHandler pattern on key routes
- Added Zod validation, StorageResult pattern, and BroadcastChannel cache invalidation
- Fixed dependency array bugs on 7 hooks eliminating stale closures in live performance
- Added unmount safety (isMountedRef, AbortController, cancelled flags) to 4 async hooks
- Implemented ref-counted monitor connection with debounced teardown
- Added error boundaries to 4 crash-prone components (admin sections, setlist editor)
- Eliminated 14 dangerous `as any` casts by fixing root type signatures

### Key Decisions

| Decision | Phase | Impact |
|----------|-------|--------|
| withAiSlot as preferred AI concurrency API | Phase 2 | Pattern for all future AI callers |
| Drive timeout via Promise.race | Phase 2 | googleapis doesn't support AbortSignal |
| uploadToStorage keeps throwing, reads get StorageResult | Phase 3 | Consistent pattern for Storage callers |
| BroadcastChannel for cross-tab cache invalidation | Phase 3 | Tabs stay in sync after library sync |
| Ref-based callbacks for effect dep stability | Phase 4 | Pattern for all hooks with callback deps |
| Broadened useSafeFirestoreSync ref type to DocumentData | Phase 4 | Eliminates all caller as any casts |

---
