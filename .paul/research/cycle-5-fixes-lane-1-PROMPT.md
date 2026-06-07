# Cycle-5-fixes Lane 1 — Security-critical (XSS + CSP + deps + SHA-pin)

You are `cycle5-fixes-1-sec`, a coder lane in the cycle-5-fixes
parallel wave. Source-of-truth scoping doc:
`sheet-music-app/.paul/research/cycle-5-fixes-TRIAGE.md` (Lane 1
section). Read it now before any code.

---

## §1 — Identity, branch, worktree

- **Lane ID:** `cycle5-fixes-1-sec`
- **Branch:** `feat/cycle5-fixes-1-sec`
- **Worktree:** `sheet-music-app-cycle5-fixes-1-sec/` (sibling of canonical `sheet-music-app/`)
- **Base SHA:** `6dbc106bc` (origin/master at wave dispatch)
- **Estimated:** 3-4h

## §2 — Coord startup (mandatory)

In this order:

1. Read `sheet-music-app/.coord/README.md` § "Update protocol" — focus
   on the 2026-05-18T21:35Z push-protocol amendment (cherry-pick for
   single-commit narrow lanes if origin diverges).
2. Read `sheet-music-app/.coord/shared/master-tip.md` — verify SHA.
3. Read `sheet-music-app/.coord/shared/decisions.md` — focus on the
   2026-05-18T18:45Z (REG-002 envelope sweep) + 2026-05-18T22:30Z
   (META-003) blocks.
4. Read `sheet-music-app/.coord/agents.md` — find your row (supervisor
   scaffolded it).
5. Read `sheet-music-app/.coord/inbox/cycle5-fixes-1-sec.md` if exists.
6. Read this prompt's referenced triage doc:
   `sheet-music-app/.paul/research/cycle-5-fixes-TRIAGE.md` → Lane 1
   section is your authoritative scope.
7. ACK via inbox: write a message-001 to
   `sheet-music-app/.coord/inbox/supervisor.md` confirming you've read
   the above + cut your branch from `6dbc106bc`.

## §3 — Scope (4 findings)

From triage Lane 1:

- **C5D-001 HIGH** — TextScoreViewer XSS via React's unsafe-HTML prop.
  Fix: replace with plain-text render in
  `<div className="whitespace-pre">` (chart format is monospace).
  Daniel-recommended over DOMPurify path.
- **C5D-003 MED** — CSP `script-src` allows the two unsafe sources
  (inline + eval). Fix: migrate to nonce-based CSP via Next.js
  middleware emitting per-request nonces; drop the inline source.
  Verify Firebase JS SDK doesn't require the runtime-eval source — if
  it does, document the constraint or sandbox.
- **C5D-004 HIGH** — `npm audit --omit=dev` reports 1 critical
  (protobufjs RCE: GHSA-66ff-xgx4-vchm + GHSA-xq3m-2v4x-88gg) + 24 high
  (entire `@opentelemetry/*` exporter family). Fix: `npm audit fix`
  first; if protobufjs is transitive (`npm ls protobufjs`), add
  package.json `overrides`. Verify whether `@opentelemetry/*` is dead
  weight — Sentry is the actual stack per C5D-009 — if dead, drop the
  OTel dep tree entirely.
- **C5D-006 MED** — `.github/workflows/ci.yml` actions are
  `actions/checkout@v4`, `actions/setup-node@v4`, etc. Floating major
  tags. Fix: SHA-pin with version comments
  (e.g. `actions/checkout@<sha> # v4.x`). Enable Dependabot for the
  `github-actions` ecosystem so updates are automatic.

## §4 — Hard boundaries

- **NO touch to** repo-root `mcp/`, `bridge/`, `SetlistGrid.tsx` (per
  `[[project_mcp_parallel_workstream]]`).
- **NO touch to** `src/lib/mcp/errors.ts` / `error-envelopes.ts` —
  envelope foundation is read-only.
- **NO touch to** any other lane's claimed file (check
  `shared/claims.md` BEFORE editing shared files; claim before edit
  with TTL).
- **NO mutations to real prod data.**

## §5 — Tests + build (required before push)

- New unit test for `TextScoreViewer` exercising malicious .txt input
  (script-tag payload, img-onerror payload) — must NOT execute.
- `next build --webpack` clean (TypeScript ✓; static-page generation ✓).
- Full unit suite green (`npx vitest run`). Pre-existing emulator
  failures are OK if they don't trace to your changes.
- Post-deploy verification: `curl -sI https://www.centralreform.live/perform`
  shows the new CSP without the unsafe sources (file as PASS finding
  in SHIP-NOTICE).

## §6 — Push protocol

1. Before pushing: `git fetch origin && git rebase origin/master`. If
   conflicts, resolve in your favor for your touched files; defer to
   --theirs for sibling-lane files.
2. Re-run tests + build on rebased tree.
3. Push: `git push origin feat/cycle5-fixes-1-sec:master` (FF-push to
   master per established lane pattern; SUPERVISOR will overwrite
   `master-tip.md`).
4. If origin diverged during your work with multi-commit history,
   prefer rebase over cherry-pick UNLESS your branch is a single
   logical commit — then cherry-pick per the 2026-05-18T21:35Z
   amendment.
5. SHIP-NOTICE to `sheet-music-app/.coord/inbox/supervisor.md` with:
   - Final SHA
   - Verification matrix (curl CSP check, npm audit post-fix counts,
     XSS unit test ✓, build ✓, test suite delta)
   - Open follow-ups (e.g. if OTel is actually used somewhere
     unexpectedly)
   - Worktree teardown request

## §7 — Daniel-discussion items (BLOCK if needed)

If you need a decision before proceeding, write a QUESTION to
`shared/decisions.md` queue + ping supervisor inbox + `await`:

- **CSP migration approach** — nonce-based (recommended) vs hash-based
  vs document-and-defer. Default to nonce-based unless a Firebase JS
  SDK constraint surfaces.
- **`@opentelemetry/*` removal** — if `npm ls @opentelemetry` shows
  it's not imported anywhere in `src/`, propose dropping the dep tree
  entirely (cleaner than `audit fix` patching a dead family).

## §8 — Coordination contract

- Claim shared files (`src/middleware.ts`, `next.config.*`,
  `package.json`, `vercel.json`, `.github/workflows/ci.yml`) in
  `shared/claims.md` BEFORE editing. TTL 2h.
- HEADS-UP siblings (Lane 4 unauth-perf may touch `src/middleware.ts`
  + `next.config.*` too) if your edits would block their work.
- ACK msg-001 within 5min of paste; SHIP-NOTICE on push.

Go.
