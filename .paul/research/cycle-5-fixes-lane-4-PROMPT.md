# Cycle-5-fixes Lane 4 — Unauth perf + nav regressions

You are `cycle5-fixes-4-unauth-perf`, a coder lane in the cycle-5-fixes
parallel wave. Source-of-truth scoping:
`sheet-music-app/.paul/research/cycle-5-fixes-TRIAGE.md` (Lane 4).

---

## §1 — Identity, branch, worktree

- **Lane ID:** `cycle5-fixes-4-unauth-perf`
- **Branch:** `feat/cycle5-fixes-4-unauth-perf`
- **Worktree:** `sheet-music-app-cycle5-fixes-4-unauth-perf/`
- **Base SHA:** `6dbc106bc`
- **Estimated:** 3-4h

## §2 — Coord startup (mandatory)

1. Read `sheet-music-app/.coord/README.md` + `shared/master-tip.md` +
   `shared/decisions.md` (focus 2026-05-18T00:20Z b3 vestigial-404
   working-as-intended ratification — this lane RESTORES that contract;
   also fixes-perf-rsc UNAUTH-009 RSC work at `ca221b67f`).
2. Read `sheet-music-app/.coord/agents.md` — find your row.
3. Read this prompt's referenced triage Lane 4 section.
4. ACK msg-001 to supervisor inbox.

## §3 — Scope (6-7 findings)

From triage Lane 4:

- **C5B-011 MED** — Unauth `/login` ships ~1247 KB JS across 22 chunks.
  Goal: <500 KB unauth bundle. Audit which chunks are load-bearing
  (Firebase Auth, Google Identity, Sentry) vs dead-weight in the
  unauth path.
- **C5B-012 MED** — Unauth bundle contains d3 (7 chunks), Segment
  analytics (3 chunks), Drive client (layout chunk). Fix: move
  authed-only deps behind authed route-group code-splitting via
  dynamic imports. The d3 import is likely from a layout-level
  component — find and gate it; Segment can `defer` load or queue
  events until post-auth; Drive client should only be imported in
  routes under `(authed)`.
- **C5B-004 + C5D-010 MED+LOW** — Vestigial paths `/v2/*`, `/account`,
  `/manage/users` regressed from clean-404 (cycle-3 b3 ratification)
  to login-shell HTTP 200. Fix: match these in `src/middleware.ts`
  BEFORE the auth-redirect fires, returning clean 404 via
  `not-found.tsx` (or `NextResponse.json({error:'not_found'},
  {status:404})`).
- **C5B-005 MED** — `/sitemap.xml` omits `/perform`. Fix: add `/perform`
  to the sitemap generation in `src/app/sitemap.ts`. Pair with
  C5D-007 decision.
- **C5B-002 LOW** — Apex `centralreform.live/*` 307→`www.centralreform.live/*`.
  Fix: configure Vercel domain config to canonicalize at CDN edge OR
  switch primary domain to apex. Eliminates one HTTP RTT per cold
  visit.
- **C5C-003 MED** — `/library` SSR renders "No charts in the library
  yet" for authed band_leader while 186 charts exist. Fix: either
  SSR-fetch the library catalog with the user's session, OR render a
  `Loading…` state until the Firestore listener returns.
- **C5D-007 LOW** — `robots.txt` Disallow: / + sitemap lists 5 public
  pages + every page has `<meta name="robots" content="noindex,nofollow">`
  — three-way inconsistency. Decide: private app → drop sitemap
  entirely; OR whitelist legal pages in robots.txt and remove noindex
  meta. Daniel-discussion item.

## §4 — Hard boundaries

- **NO touch to** repo-root `mcp/`, `bridge/`, `SetlistGrid.tsx`.
- **NO touch to** Lane 1's `src/middleware.ts` (CSP nonce work) without
  HEADS-UP — they may need to layer your vestigial-404 matcher before
  their CSP middleware. Coordinate via claims.md.
- **NO touch to** `next.config.*` without HEADS-UP to Lane 1
  (chunk-split tuning may conflict with their CSP edits).
- **NO removal of** the cycle-3.5 P2-012 viewport unlock
  (`maximumScale`) or P2-013 SSR skeleton (`/login`) — those are
  ratified ships.

## §5 — Tests + build (required before push)

- Bundle-size guard test (new) — fail CI if unauth `/login` bundle
  total > 500 KB raw or > 200 KB gzipped.
- Middleware unit tests for vestigial-404 matchers — `/v2/random-junk`
  + `/account` + `/manage/users` return 404 BEFORE auth-redirect fires.
- `/perform/setlist/<deeplink>` E2E (curl-grep) to confirm no
  regression in band-member journey (SSR track list still present).
- Verify `/sitemap.xml` includes `/perform`.
- `next build --webpack` clean; full unit suite green.
- Post-deploy: re-measure unauth bundle size + confirm <500 KB.

## §6 — Push protocol

1. `git fetch origin && git rebase origin/master`.
2. Re-run tests + bundle-size guard.
3. `git push origin feat/cycle5-fixes-4-unauth-perf:master`.
4. SHIP-NOTICE to supervisor inbox with:
   - Final SHA.
   - Pre/post bundle-size comparison (KB raw + gzipped + chunk count).
   - Vestigial-404 verdict per path (curl HTTP status).
   - `/perform` in sitemap verified.
   - Apex-redirect fix verification (curl `centralreform.live/` —
     either no 307 OR canonicalized at edge with no extra hop).
   - C5C-003 `/library` SSR fix verification (curl as band_leader
     shows accurate state).
   - C5D-007 robots/sitemap intent — what you picked + why.
   - Worktree teardown request.

## §7 — Daniel-discussion items

- **Bundle-size target.** <500 KB raw is the cycle-5 prompt's
  implicit ask. Confirm or adjust before optimizing.
- **C5D-007 robots/sitemap intent.** Private app → drop sitemap
  entirely OR whitelist legal pages + remove noindex meta. Default to
  the latter if Daniel doesn't reply within the lane window.

## §8 — Coordination contract

- Claim `src/middleware.ts` (vestigial-404 matchers — HEAVY edits;
  coordinate with Lane 1).
- Claim `next.config.*` (chunk-split tuning — coordinate with Lane 1).
- Claim `src/app/sitemap.ts` + `src/app/robots.ts`.
- Claim `src/app/layout.tsx` (if you need to dynamic-import
  layout-level d3 — HEADS-UP Lane 3 which may touch root layout for
  skip-link C5B-001).
- Claim `src/app/library/**` (C5C-003 SSR fetch / loading state).
- HEADS-UP Lane 1 (security) — they'll be in `src/middleware.ts` for
  CSP nonces. Plan to interleave.

Go.
