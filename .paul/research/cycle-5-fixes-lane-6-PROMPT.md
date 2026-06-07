# Cycle-5-fixes Lane 6 — Footer/legal + observability + harness fixes

You are `cycle5-fixes-6-footer-harness`, a coder lane in the
cycle-5-fixes parallel wave. Source-of-truth scoping:
`sheet-music-app/.paul/research/cycle-5-fixes-TRIAGE.md` (Lane 6).

---

## §1 — Identity, branch, worktree

- **Lane ID:** `cycle5-fixes-6-footer-harness`
- **Branch:** `feat/cycle5-fixes-6-footer-harness`
- **Worktree:** `sheet-music-app-cycle5-fixes-6-footer-harness/`
- **Base SHA:** `6dbc106bc`
- **Estimated:** 2-3h

## §2 — Coord startup (mandatory)

1. Read `sheet-music-app/.coord/README.md` + `shared/master-tip.md` +
   `shared/decisions.md` (focus 2026-05-18T19:55Z GAP-002
   `__test_delete_storage_object` precedent — establishes pattern for
   test-instrumentation MCP tools).
2. Read `sheet-music-app/.coord/agents.md` — find your row.
3. Read this prompt's referenced triage Lane 6 section.
4. ACK msg-001 to supervisor inbox.

## §3 — Scope (5 code findings + 3 memory updates + 2 harness improvements)

### Code work

- **C5D-002 MED** — `Footer.tsx` omits Privacy / Terms / Accessibility
  links. Fix: add the three links to `src/components/Footer.tsx`
  alongside Changelog. Mirror the change in
  `src/components/v2/v2-footer.tsx`. If `/accessibility` doesn't exist,
  add a stub at `src/app/(main)/accessibility/page.tsx` (or
  appropriate route group) — minimal markdown placeholder
  acknowledging the app's a11y commitments.
- **C5D-013 INFO (META becomes feature)** — NEW MCP
  `dump_collection_size({collection, since?})` (admin-only) returning
  `{docCount, estimatedBytes, oldestTimestamp, newestTimestamp}`.
  Register in `src/lib/mcp/tools/index.ts`. Pair with a Firestore TTL
  policy on `webVitalsObservations.timestamp` — apply via `firestore.rules`
  OR Firestore TTL config (depending on what's checked in). Default
  TTL 90 days — file as `daniel_discussion_required` if shorter
  preferred.
- **C5B-META-003 INFO** — `create_test_account` auto-generates uid as
  `test-<role>-<8-hex>`; caller can't impose per-instance prefix.
  `cleanup_all_test_data` lacks prefix filter — all 4 cowork instances
  refused to call it because it would cascade-delete sibling test data.
  Fix: (a) add optional `uidPrefix` arg to `create_test_account`
  emitting `test-<prefix>-<role>-<hex>`, AND (b) add `prefix:string`
  arg to `cleanup_all_test_data` filtering on uid prefix.
  Per `[[feedback_self_inclusion_test_fixtures]]`, ensure
  `cleanup_all_test_data` with a prefix does NOT touch the caller's
  own auth user even if the caller is admin (regression test).

### Harness improvements (in cycle-4/harness/)

- **C5B-META-001 + C5A-META-003 MED** — axe-core CDN injection blocked
  by production CSP. Fix: NEW
  `cycle-4/harness/lib/runAxe.mjs` exporting
  `runAxe(page, surfaceLabel)` that:
  - Reads `node_modules/axe-core/axe.min.js` source from disk
  - Injects via `page.addScriptTag({content: axeSrc})` (NOT
    `{url: cdnUrl}` — CDN is CSP-blocked)
  - Calls `page.evaluate(() => axe.run())`
  - Returns axe-result JSON
  Also patch any harness `chromium.launch()` invocations to pass
  `{bypassCSP:true}` as defense-in-depth.
- **C5B-META-002 INFO** — `cycle-4/harness/scripts/*` not in repo;
  Playwright not preinstalled in cowork sandboxes. Fix: commit
  `cycle-4/harness/scripts/probe-batch.mjs` and `aggregate.py` (lift
  from cycle-4 cowork sandbox if Daniel can provide; OR re-author
  minimal versions following the cycle-4 documented contract). Write
  `cycle-4/harness/install-harness.sh` that runs
  `npm i playwright @axe-core/playwright axe-core` +
  `npx playwright install chromium firefox webkit --with-deps`.

### Memory updates (write directly under `C:\Users\dsbog\.claude\projects\C--Users-dsbog-centralreform-live\memory\` via supervisor; do NOT do this yourself — surface in SHIP-NOTICE)

- `[[feedback_admin_rate_limit_bypass]]` — clarify scope: applies to
  MCP rate-limits + `/manage/library-review` + `/manage/templates`,
  NOT `/monitor` (which gates on bus assignment).
- Orphan baseline memory — update: 272 orphans (not 24), mostly
  supplemental UUID-shape, none auto-salvageable from sampling.
- `[[feedback_cowork_real_harness]]` — addendum: harness scripts/
  + node_modules NOT sandbox-survival-guaranteed; commit to repo OR
  ship install-harness.sh (this lane delivers both).
- NEW memory: `[[feedback_sandbox_test_isolation]]` — parallel cowork
  instances need filtered audience derivation +
  `cleanup_all_test_data` prefix filter to prevent cross-instance
  contamination.

## §4 — Hard boundaries

- **NO touch to** repo-root `mcp/`, `bridge/`, `SetlistGrid.tsx`.
- **NO touch to** `src/lib/mcp/errors.ts` / `error-envelopes.ts`.
- **NO touch to** Lane 3's `src/app/login/page.tsx` (their C5B-009
  login footer) — your Footer.tsx is the global app chrome footer,
  different surface. C5D-002 (yours) ≠ C5B-009 (Lane 3).
- **NO touch to** Lane 5's MCP tool registrations without HEADS-UP —
  your `dump_collection_size` register will be near their
  `list_service_personnel` register in `src/lib/mcp/tools/index.ts`.
- **NO write to memory files** yourself — surface to supervisor in
  SHIP-NOTICE.

## §5 — Tests + build (required before push)

- Footer link snapshot test (Privacy / Terms / Accessibility / Changelog
  all present).
- `dump_collection_size` MCP unit test against a fixture collection;
  rich-envelope conformance.
- `create_test_account` uidPrefix unit test — emits expected uid shape.
- `cleanup_all_test_data` prefix-filter unit test — MUST NOT touch
  caller's own admin user (self-inclusion path) AND MUST NOT touch
  test users whose uid doesn't match the prefix.
- Harness inline-axe integration test (in cycle-4/harness/) — runs
  axe-core against a known-violation page and expects ≥1 violation.
- `next build --webpack` clean; full unit suite green.

## §6 — Push protocol

1. `git fetch origin && git rebase origin/master`.
2. Re-run tests + emulator suite.
3. `git push origin feat/cycle5-fixes-6-footer-harness:master`.
4. SHIP-NOTICE to supervisor inbox with:
   - Final SHA.
   - Footer surface diff (Footer.tsx + v2-footer.tsx).
   - `dump_collection_size` MCP smoke test.
   - `create_test_account` + `cleanup_all_test_data` prefix-filter
     verification (including the self-inclusion regression test).
   - Harness inline-axe verified (a passing axe sweep on at least one
     surface).
   - Memory updates recommended (list of 4 items for supervisor to
     persist).
   - Worktree teardown request.

## §7 — Daniel-discussion items

- **`webVitalsObservations` TTL duration.** Default 90d; shorter
  (30d) is fine if Daniel prefers.
- **Where `scripts/probe-batch.mjs` + `aggregate.py` should come from.**
  Either (a) Daniel pastes the cycle-4 sandbox versions from his
  filesystem, OR (b) you re-author from the cycle-4 prompt's documented
  contract. Default to (b) unless Daniel surfaces the sandbox copies.
- **`/accessibility` page content.** Minimal placeholder for this lane;
  Daniel may want richer content in a future phase.

## §8 — Coordination contract

- Claim `src/components/Footer.tsx` + `src/components/v2/v2-footer.tsx`.
- Claim `src/lib/mcp/tools/test-tokens.ts` (create_test_account +
  cleanup_all_test_data — but check if it's in mcp/ which is
  do-not-touch; if so, raise a BLOCKER to supervisor).
- Claim `src/lib/mcp/tools/index.ts` (dump_collection_size register —
  HEADS-UP Lane 5).
- Claim `firestore.rules` (webVitalsObservations TTL if rules-based).
- Claim `cycle-4/harness/lib/runAxe.mjs` (NEW file).
- Claim `cycle-4/harness/scripts/{probe-batch.mjs,aggregate.py}` (NEW
  files) + `cycle-4/harness/install-harness.sh` (NEW file).

Go.
