# Cycle-5-fixes wave — triage + lane scoping

**Inputs:** 74 findings across cycle-5 instances A/B/C/D (HANDOFFs at
`sheet-music-app-mcp/outputs/autonomous-run/cycle-5/instance-{A,B,C,D}/`).

**Baseline tip:** `6dbc106bc` (residuals shipped silently — 2 commits on
top of `f31772fb6`; coord housekeeping caught up in this wave).

**Lane count:** 6 lanes. All parallelizable; all under 4h estimated.

**Coord protocol:** each lane = own worktree at `sheet-music-app-cycle5-fixes-<lane>/`,
own branch `feat/cycle5-fixes-<lane>`, claims file before shared edits,
SHIP-NOTICE on push, supervisor handles teardown per
`[[feedback_worktree_teardown_timing]]`.

**Coord do-not-touch (per [[project_mcp_parallel_workstream]]):** repo-root
`mcp/`, `bridge/`, `SetlistGrid.tsx`. (Note: `src/lib/mcp/` is in scope —
that's the main app's MCP tool definitions, not the parallel MCP-server
workstream.)

**Severity breakdown across the wave:**
- 5 HIGH (security/a11y/prod-impact)
- ~14 MEDIUM
- ~12 LOW
- ~30+ INFO / META

---

## Lane 1 — Security-critical (XSS + CSP + deps)

**Scope:** 4 findings. Tightly coupled (XSS fix needs CSP to be effective).

| Finding | Severity | Title | Touch |
|---|---|---|---|
| **C5D-001** | HIGH | TextScoreViewer renders chart .txt through React's unsafe-HTML prop (the "dangerously" one) with no sanitizer; stored XSS | `src/components/music/TextScoreViewer.tsx:36,69,171-178` |
| **C5D-003** | MED | CSP script-src allows the two unsafe sources (inline + eval) — defeats XSS mitigation | `next.config.*`, `middleware.*`, `vercel.json` |
| **C5D-004** | HIGH | npm audit: 1 critical (protobufjs RCE) + 24 high (entire `@opentelemetry/*` exporter family) | `package.json`, `package-lock.json` |
| **C5D-006** | MED | GitHub Actions floating major tags (@v4) — supply-chain risk | `.github/workflows/ci.yml` |

**Fix directions:**
- C5D-001: replace the unsafe-HTML prop usage with plain-text render
  inside `<div className="whitespace-pre">` (chart format is monospace
  already). Daniel-recommended over DOMPurify path.
- C5D-003: migrate to nonce-based CSP via Next.js middleware. Verify
  Firebase JS SDK doesn't require the runtime-eval source; document or
  sandbox if it does.
- C5D-004: `npm audit fix` first; if protobufjs is transitive, add
  package.json `overrides`. Verify whether `@opentelemetry/*` is dead
  weight (Sentry is the actual stack per C5D-009) — if so, drop the
  OTel dep tree entirely.
- C5D-006: SHA-pin actions with version comments; enable Dependabot for
  `github-actions` ecosystem.

**Tests:** new unit test for TextScoreViewer with malicious .txt input;
emulator suite green; `next build --webpack` clean; CSP-violation check
via `curl -sI https://www.centralreform.live/perform` post-deploy.

**Estimated:** 3-4h. Daniel-discussion items: CSP migration approach
(nonce vs hash vs document-and-defer); whether `@opentelemetry/*` is
actually dead-weight.

---

## Lane 2 — Drive + gig-packet production-impact

**Scope:** 5 findings + 1 backfill. Real prod data already silently
broken (Lechu Goldman missing from every Friday packet).

| Finding | Severity | Title | Touch |
|---|---|---|---|
| **C5C-006** | MED (HIGH-IMPACT) | gig-packet refuses Drive shortcuts as 'unsupported MIME'; DriveClient.getFile() resolves them transparently — cross-code-path inconsistency drops songs from packets | `src/lib/mcp/tools/gig-packet/**`, `src/lib/google-drive.ts` |
| **C5C-007** | MED | library_index row shows status:'active' despite Drive 404; chart-health pre-flight catches at publish but earlier prevention preferred | `src/lib/library/hygiene/*`, `src/lib/mcp/tools/reconcile-library.ts` |
| **C5C-008** | MED | `import_chart_from_drive` lacks dryRun support per F-05 dryRun-default policy | `src/lib/mcp/tools/library-upload.ts` (importChartFromDrive handler) |
| **C5C-009** | MED | `import_chart_from_drive` returns code:500 for logical 409 (dup) and 404 (file not found); machine_codes too generic | `src/lib/mcp/tools/library-upload.ts` |
| **C5C-015** | LOW | `import_chart_from_drive` on a folder ID emits 'export to PDF in Drive' hint — nonsensical for folders (only meaningful for Docs/Sheets/Slides) | `src/lib/mcp/tools/library-upload.ts` |
| — | — | One-shot backfill: re-bond library_index rows pointing at Drive shortcuts to the resolved target's fileId (or just fix the gig-packet read path; pick lower-risk) | data-only, no code |

**Fix directions:**
- C5C-006: route gig-packet's per-row fetch through
  `DriveClient.getFile()`'s transparent shortcut-resolve path (reads
  `shortcutDetails.targetId`, downloads target). Lower-risk than
  backfilling library_index — but if there are many shortcut-bonded
  rows, consider both.
- C5C-007: extend reconcile-library hygiene to flip status:'active' →
  'orphaned' when Drive bytes 404 + Storage byte absent. Reuse the
  chart-health pre-flight verdict logic.
- C5C-008: add `dryRun:boolean` schema arg + handler branch. Return
  `{predictedTitle, dedupScore, dedupMatchedRow, targetStoragePath,
  aiEnrichmentPlan, wouldCommit:false}` without writing. Match the
  `bulk_update_tracks` / `publish_setlist` dryRun contract.
- C5C-009: map upstream errors to canonical HTTP codes (409 for dup,
  404 for missing, 403 for permission). Distinguish 'file not found'
  vs 'no access' (Drive API provides distinct signals). Add
  machine_codes per dimension.
- C5C-015: branch the error message: folder → "pass a file id, not a
  folder id"; Docs/Sheets/Slides → existing export-to-PDF guidance.

**Tests:** emulator test exercising gig-packet against a mock-Drive
shortcut entity; dryRun unit test for import_chart_from_drive;
rich-envelope conformance tests for the new machine_codes.

**Estimated:** 3-4h. Daniel-discussion items: backfill scope (fix the
read path only vs re-bond library rows).

---

## Lane 3 — A11y rollup

**Scope:** 6 findings. Independent fixes; clusters naturally.

| Finding | Severity | Title | Touch |
|---|---|---|---|
| **C5B-015** | HIGH | Song-key badge fails WCAG 2 AA color contrast (axe-confirmed) — every published setlist | `src/components/setlist/key-badge.tsx` OR wherever `<span data-testid="key-badge">` lives, `src/app/globals.css` (--brand token / bg-brand/15) |
| **C5D-014** | HIGH | SearchOverlay TabsList parity bug — same root cause as cycle-4 C4-004 (Tabs with no TabsContent siblings, aria-controls dangling) | `src/components/library/SearchOverlay.tsx:109-114` |
| **C5B-001** | MED | Skip-link `href="#main-content"` has no matching target element on unauth shell — WCAG 2.4.1 fail | `src/app/layout.tsx` (root), `src/app/login/page.tsx` |
| **C5D-015** | MED | `--secondary-foreground` dark-mode contrast against `--secondary` alpha-0.4 likely fails AA — needs empirical browser-axe measurement to confirm | `src/app/globals.css` |
| **C5B-008** | LOW | Login Google sign-in button SSR'd `disabled`; no-JS users see unclickable button with no explanation | `src/app/login/page.tsx` (or wherever SignInWithGoogleButton lives) |
| **C5B-009** | MED | Login page has no link to Privacy / Terms / SMS-Consent / Changelog — GDPR/CCPA concern + pre-signin disclosure | `src/app/login/page.tsx` — needs footer with privacy/terms links |

**Fix directions:**
- C5B-015: darken `text-brand` for AA against `bg-brand/15`, OR use
  solid `bg-brand` with `text-brand-foreground` (inverse). Apply at the
  key-badge component level.
- C5D-014: replace `<Tabs><TabsList><TabsTrigger>×2</TabsList></Tabs>`
  with a plain segmented control (ToggleGroup or custom 2-button), same
  shape as cycle-4 C4-004's fix.
- C5B-001: wrap the login-card content in `<main id="main-content">`
  (or rename skip-link href to match an existing landmark). Apply at
  root layout so every unauth surface inherits.
- C5D-015: empirically measure with axe-core in dark mode on a surface
  consuming `bg-secondary` + `text-secondary-foreground`. If <4.5:1,
  bump dark `--secondary-foreground` L to ~0.90, or drop alpha on
  `--secondary`.
- C5B-008: SSR-enable the Google button (it's clickable via OAuth
  redirect pre-hydration), OR add a `<noscript>` banner. Recommend
  SSR-enable for cleaner UX.
- C5B-009: add a footer to `/login` (and `/perform` unauth landing)
  linking Privacy, Terms, SMS-Consent, Changelog.

**Tests:** axe-core sweep on `/login`, `/perform`, `/perform/setlist/<id>`,
`/library`; touch-targets test stays green; component snapshots
unchanged where applicable.

**Estimated:** 2-3h. No Daniel-discussion items expected unless C5D-015
empirical contrast is borderline.

---

## Lane 4 — Unauth perf + nav regressions

**Scope:** 6 findings. Build-time + middleware concerns.

| Finding | Severity | Title | Touch |
|---|---|---|---|
| **C5B-011** | MED | Unauth `/login` ships ~1247KB JS across 22 chunks — heavy for sign-in screen | `src/app/layout.tsx`, `next.config.*` (split-chunks), authed/unauth route-group code-split |
| **C5B-012** | MED | Unauth bundle contains d3 (7 chunks), Segment analytics (3 chunks), Drive client (layout chunk) — dead weight pre-signin | `src/components/**` (layout-level d3 importer), `src/lib/segment*`, `src/lib/drive-client` |
| **C5B-004** + **C5D-010** | MED + LOW | Vestigial paths (`/v2/*`, `/account`, `/manage/users`) regressed from clean-404 (cycle-3 b3) to login-shell HTTP 200 | `src/middleware.ts`, `src/app/not-found.tsx`, `next.config.*` |
| **C5B-005** | MED | `/sitemap.xml` omits `/perform` — main unauth landing undiscoverable to search | `src/app/sitemap.ts` (or wherever sitemap is generated) |
| **C5B-002** | LOW | Apex domain double-redirect `centralreform.live/*` → `www.centralreform.live/*` adds round-trip on every visit | `vercel.json` OR Vercel domain config |
| **C5C-003** | MED | `/library` SSR renders 'No charts in the library yet' for authed band_leader while 186 charts exist — pre-hydration flash | `src/app/library/**` |
| **C5D-007** | LOW | `robots.txt` disallows all + sitemap lists 5 public pages + `<meta name="robots" content="noindex,nofollow">` — three-way inconsistency | `src/app/robots.ts`, `src/app/sitemap.ts` |

**Fix directions:**
- C5B-011 + C5B-012: audit which chunks contain load-bearing login deps
  (Firebase Auth, Google Identity, Sentry) vs dead-weight (d3, Segment,
  Drive client, admin chrome). Move authed-only deps behind authed
  route-group code-splitting. Target: <500KB unauth bundle.
- C5B-004 / C5D-010: match `/v2/:path*`, `/account`, `/manage/users` in
  middleware BEFORE the auth-redirect fires, returning a clean 404 via
  `not-found.tsx` (or `NextResponse.json({error:'not_found'},
  {status:404})`). Restores cycle-3 b3 ratification.
- C5B-005: add `/perform` to the sitemap. Also consider removing
  `<meta name="robots" content="noindex,nofollow">` from `/perform`
  if SEO is wanted at all (paired with C5D-007 resolution).
- C5B-002: configure Vercel domain config to canonicalize at the CDN
  edge OR switch primary domain to apex. Eliminates one HTTP RTT per
  cold visit.
- C5C-003: either SSR-fetch the library catalog with the user's
  session, OR render a 'Loading…' state until the Firestore listener
  returns. Current state implies 'empty library' on every page load.
- C5D-007: decide intent (private app → drop sitemap entirely; or
  whitelist legal pages in robots.txt and remove noindex meta).

**Tests:** bundle-size guard test (CI fails if unauth bundle > target
budget); middleware unit tests for vestigial-404 matchers;
`/perform/setlist/<deeplink>` E2E to confirm no regression in
band-member journey; verify `/sitemap.xml` includes `/perform`.

**Estimated:** 3-4h. Daniel-discussion items: bundle-size target,
sitemap/robots intent (drop entirely vs surface legal pages).

---

## Lane 5 — MCP envelope drift + UX polish

**Scope:** ~10 findings. Tightly coupled — MCP-tool & API-route layer
adjacent.

| Finding | Severity | Title | Touch |
|---|---|---|---|
| **C5C-001** + **C5C-002** | MED | `/api/drive/metadata` + `/api/library/list` return flat `{error:string}` envelope on 401/403 — REG-002 drift | `src/app/api/drive/metadata/route.ts`, `src/app/api/library/list/route.ts` |
| **C5C-005** | MED | `publish_setlist` default-recipient derivation includes `test-*` prefix uids across cycle-5 sibling instances | `src/lib/mcp/tools/setlist-publish.ts` |
| **C5C-010** | LOW | `list_setlists` newest-first by write timestamp, not eventDate — counter to David's "this week's services" mental model | `src/lib/mcp/tools/setlist-read.ts` |
| **C5C-011** | LOW | `list_setlists` response shape lacks `publishedAt` flag — can't filter published vs draft without N follow-up reads | `src/lib/mcp/tools/setlist-read.ts` |
| **C5C-014** | LOW (META) | No unified "who's playing & leading this week" MCP pivot — `track.leadMusician` + `scheduling_assignments` are unjoined | NEW: `src/lib/mcp/tools/list_service_personnel.ts` + register |
| **C5C-016** | LOW | `add_track_to_setlist` returns sparse `{trackId,order}` vs `update_track` returning full track echo — inconsistency | `src/lib/mcp/tools/setlist-write.ts` |
| **C5A-003** | MED | `create_setlist` lacks `isTest:true` argument — cowork harnesses can't tag writes per cycle-5 §5 discipline | `src/lib/mcp/tools/setlist-write.ts` (create_setlist) |
| **C5A-B4-aien** | LOW | `list_review_queue.config.anthropicConfigured` field name stale post-Gemini-swap — provider discriminant missing | `src/lib/mcp/tools/library-review/list_review_queue.ts`, `src/lib/mcp/tools/ai-config.ts` |
| **C5B-006** | LOW | Unauth error envelopes leak internal endpoint names (`/api/mcp/oauth/mint-test-token`) + MCP tool vocab in `hint` fields | `src/app/api/auth/test-session/route.ts`, `src/app/api/drive/file/[fileId]/route.ts` |
| **C5B-017** | LOW | POST `/login` returns bare 405 with empty body — no JSON envelope, no Allow header | `src/app/login/page.tsx` server-action handler or middleware |
| **C5D-011** | LOW | `salvage_chart_bytes` returns code:500 for client-precondition refusals (`no_source_available`, `invalid_source_url`, etc.) — should be 422 | `src/lib/mcp/tools/library-upload.ts` (or salvage handler) |

**Fix directions:**
- C5C-001/002: wrap with `createApiHandler`'s `richError` or
  equivalent; emit machine_code `invalid_bearer` or `session_required`.
- C5C-005: in default-audience derivation, filter `^test-` (and/or
  `[TEST]` displayName prefix). If autonomous tests want test
  recipients, require explicit `recipients` array.
- C5C-010: add `sort:'recent_write' | 'recent_event'` param to
  `list_setlists` (default `recent_write` for back-compat).
- C5C-011: add `publishedAt: string | null` to `list_setlists` row
  shape.
- C5C-014: new MCP tool `list_service_personnel({setlistId|eventDate})`
  returning `{scheduling_assignments: [...], vocal_leads: distinct(track.leadMusician)}`.
- C5C-016: return full track echo from `add_track_to_setlist`.
  Consistency reduces caller's need for follow-up `get_setlist`.
- C5A-003: add optional `isTest:boolean` arg to `create_setlist`
  (defaulting false). Heuristic-on-`test-`-prefix is rejected (too
  surprising for real setlists named "test-rehearsal").
- C5A-B4-aien: rename `anthropicConfigured` → `aiProviderConfigured`
  (single name, no transitional alongside); add
  `provider:'gemini'|'anthropic'|null` discriminant on `get_ai_config`.
- C5B-006: branch error hints on caller context (in-app + bearer → full
  hint; bare HTTP unauth → generic 'Sign in to continue.'). OR just
  strip MCP refs from production envelopes entirely.
- C5B-017: return JSON envelope `{ok:false, error:{code:405,
  machine_code:'method_not_allowed', message:'Use POST
  /api/auth/test-session for programmatic sign-in.'}}`. Set Allow
  header.
- C5D-011: change `code` from 500 → 422 for precondition failures
  (`no_source_available`, `invalid_source_url`, `invalid_source_mime`,
  `source_too_large`). Reserve 500 for genuine server faults
  (`storage_upload_failed`, `firestore_write_failed`). Add unit test
  asserting code:422.

**Tests:** rich-envelope conformance unit tests on the 11 affected
endpoints/tools; multi-instance audience-filter unit test;
`list_setlists` sort + publishedAt schema test; `list_service_personnel`
new tool test against fixture roster+VL data.

**Estimated:** 3-4h. Daniel-discussion: C5B-006 strip-vs-branch hints
approach.

---

## Lane 6 — Footer/legal + observability + harness fixes

**Scope:** 5 findings + 2 harness improvements. Smaller scattered items.

| Finding | Severity | Title | Touch |
|---|---|---|---|
| **C5D-002** | MED | Footer omits Privacy / Terms / Accessibility — legal pages exist but unsurfaced | `src/components/Footer.tsx`, `src/components/v2/v2-footer.tsx` |
| **C5D-013** | INFO (META) | No Firestore `dump_collection_size` MCP + no TTL on `webVitalsObservations` (cycle-3.5 P2-017 unbounded growth) | NEW: `src/lib/mcp/tools/dump_collection_size.ts` + Firestore TTL policy |
| **C5B-META-001** + **C5A-META-003** | MED | axe-core CDN injection blocked by production CSP — harness can't run a11y matrix inline | NEW: `cycle-4/harness/lib/runAxe.mjs` bundling axe.min.js source from disk |
| **C5B-META-002** | INFO | cycle-4/harness/scripts/* not in repo; Playwright not preinstalled — every cowork run burns ~3-5min on installs | Commit `cycle-4/harness/scripts/{probe-batch.mjs,aggregate.py}` + an `install-harness.sh` bootstrap |
| **C5B-META-003** | INFO | `create_test_account` auto-generates uid as `test-<role>-<8-hex>` — caller can't impose per-instance prefix; `cleanup_all_test_data` prefix filter misses | `src/lib/mcp/tools/test-tokens.ts` (create_test_account + cleanup_all_test_data) |
| **C5C-012** + **C5C-013** | INFO (positive) | GAP-002 CLOSED (clone_setlist works) + trusted-leader rate-limit bypass confirmed | Memory updates only |
| **C5C-004** | INFO | `/monitor` denies band_leader access — memory `[[feedback_admin_rate_limit_bypass]]` mismatch | Memory update: clarify trusted-leader scope (MCP rate-limits + `/manage/*`, NOT `/monitor` which gates on bus assignment) |
| **C5D-012** | MED | Orphan baseline drift: memory says 24 known, reality is 272 (mostly supplemental UUID, not upload-*); none auto-salvageable from sampling | Memory update + scope a `reconcile_library({dryRun:true, collection:'supplemental'})` follow-up phase |

**Fix directions:**
- C5D-002: add Privacy + Terms + Accessibility links to `Footer.tsx`
  alongside Changelog. Mirror in `v2-footer.tsx`. Add an Accessibility
  statement stub at `/accessibility` if absent.
- C5D-013: add admin-only `dump_collection_size({collection, since?})`
  MCP returning `{docCount, estimatedBytes}`. Pair with Firestore TTL
  policy on `webVitalsObservations.timestamp` (e.g. 90 days).
- C5B-META-001 / C5A-META-003: commit `cycle-4/harness/lib/runAxe.mjs`
  that bundles `node_modules/axe-core/axe.min.js` source, injects via
  `page.addScriptTag({content: axeSrc})` not `{url: cdnUrl}`. Also set
  `chromium.launch({bypassCSP:true})` on harness contexts as
  defense-in-depth.
- C5B-META-002: commit `cycle-4/harness/scripts/probe-batch.mjs` +
  `aggregate.py` to repo. Write `cycle-4/harness/install-harness.sh`
  that runs `npm i playwright @axe-core/playwright` + `npx playwright
  install chromium firefox webkit --with-deps`.
- C5B-META-003: add optional `uidPrefix` arg to `create_test_account`
  emitting `test-<prefix>-<role>-<hex>`. AND add `prefix:string` arg to
  `cleanup_all_test_data` filtering on uid prefix (lets parallel cowork
  instances safely call cleanup without cross-contamination).
- Memory updates: `[[feedback_admin_rate_limit_bypass]]` clarification;
  orphan baseline refresh to 272 with sampling note (none
  auto-salvageable, recommend reconcile-driven sweep).

**Tests:** Footer link snapshot test; axe-core inline-injection
integration test in the harness; `create_test_account` uidPrefix unit
test; `cleanup_all_test_data` prefix-filter unit test (must NOT touch
non-prefix-matching test users — see
[[feedback_self_inclusion_test_fixtures]]).

**Estimated:** 2-3h. Daniel-discussion: webVitalsObservations TTL
duration (90d? 30d?); orphan reconcile dryRun scope (separate phase
after this lane).

---

## Coord housekeeping (this wave)

To be done by supervisor BEFORE dispatching lanes:

1. **Overwrite `.coord/shared/master-tip.md`** to `6dbc106bc` with
   residuals' two-commit citation. (Residuals shipped silently without
   SHIP-NOTICE — see SUPERVISOR running log).
2. **Append residuals row to `.coord/agents.md`** marking complete.
3. **Update SUPERVISOR.md running log** with cycle-5-fixes wave dispatch.
4. **All 4 cycle-5 instance bearers in §0 of cycle-5{a,b,c,d}-PROMPT.md
   are BURNED — rotate before any commit.**

## Memory updates (post-wave, supervisor handles)

Per the §6 lane 6 entries, after cycle-5-fixes lands:

- Refresh `[[feedback_admin_rate_limit_bypass]]` — add nuance that
  trusted-leader semantics apply to MCP rate-limits + `/manage/library-review`
  + `/manage/templates` review queue, NOT `/monitor` (which gates on
  bus assignment).
- Refresh orphan baseline memory: 272 orphans, dominantly supplemental
  UUID-shape, none auto-salvageable from sample.
- Add `[[feedback_cowork_real_harness]]` addendum: harness `scripts/*`
  + `node_modules/` are NOT sandbox-survival-guaranteed (cycle-5-v1
  BLOCK confirmed); commit them to repo OR ship an install-harness.sh.
- Add `[[feedback_sandbox_test_isolation]]` (NEW memory): when multiple
  cowork instances run in parallel, default-audience derivation in
  publish_setlist must filter `^test-` prefix; cleanup_all_test_data
  needs prefix filter to prevent cross-instance contamination.

---

## Dispatch order recommendation

All 6 lanes are disjoint enough to run concurrently, but Daniel can
stagger if managing 6 simultaneous coder sessions is too much:

**Wave 1 (highest impact, run first):** Lanes 1 (security) + 2
(gig-packet-prod) + 3 (a11y) — these have the HIGH findings.

**Wave 2:** Lanes 4 (unauth-perf) + 5 (MCP envelope) + 6 (footer +
harness + memory updates).

If full-parallel, all 6 at once with the standard `.coord/` protocol
(claims file + master-tip + agents.md + inbox/<lane-id>.md per
existing pattern). The push-protocol amendment for narrow lanes
(2026-05-18T21:35Z decision) covers the rebase + cherry-pick if origin
diverges during the work.
