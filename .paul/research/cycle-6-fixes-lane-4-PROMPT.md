# Cycle-6-fixes Lane 4 — npm audit pass (security carry-forward)

> **Coder lane prompt** — not a cowork instance prompt. Focused
> dependency-upgrade lane. Multi-commit OK (one per dep-cluster);
> coordinate via `package-lock.json` churn.
>
> **Part of cycle-6-fixes Wave A** (3 parallel lanes: 0 / 1 / 4).
> Siblings: Lane 0 (MCP test-tooling unblock), Lane 1 (gig-packet fix).
>
> No MCP bearer needed — this lane is `npm audit` + dependency bumps;
> no MCP probes required to verify.

---

## §0 — Identity, branch, scope

**Lane:** `cycle6-fixes-lane-4-npm-audit`
**Branch:** `feat/cycle6-fixes-4-npm-audit` (cut from `origin/master`)
**Output:** master push when SHIP-NOTICE acceptable. Multi-commit acceptable for separable dep-clusters; single combined commit also OK if `npm audit fix --dry-run` resolves cleanly in one shot.

**Scope:** close C5D-004 / C6D-001 — `npm audit --production` reports 1 critical + 24 high + 4 moderate + 8 low vulnerable packages at master tip. Cycle-5 cowork reported this; cycle-5-fixes never closed it; cycle-6 Instance D confirmed STILL-APPLIES. Bring back to 0 critical + 0 high.

**SHIP-NOTICE protocol (Daniel-ratified 2026-05-19):** include `## Repros` section per §6 below. Auditor BLOCK-TEARDOWNs without it.

---

## §1 — Starting state (verified at supervisor pre-flight 2026-05-19)

Instance D pulled `npm audit --production --json` at master `3e640a905`:
- 1 critical
- 24 high
- 4 moderate
- 8 low
- 37 total vulnerable distinct packages

**Cluster characterization:**
- ~16 of 37 are `@opentelemetry/*` — single root advisory cascading through the OpenTelemetry exporter family.
- High-impact remainder: `axios`, `follow-redirects`, `fast-xml-parser`, `next` (framework runtime), `firebase-admin`.
- The Lane 1 prompt-cited "Lane 1 baseline 0C+0H+2M+8L" is stale relative to cycle-5; this isn't fresh drift, it's never-closed carry-forward.

---

## §2 — Approach

**Phase 1 — Scope the auto-resolvable subset:**

```bash
cd sheet-music-app
git fetch origin && git checkout -b feat/cycle6-fixes-4-npm-audit origin/master
npm install
npm audit fix --dry-run --production > /tmp/audit-fix-dry-run.txt
cat /tmp/audit-fix-dry-run.txt
```

Capture what auto-resolves vs what requires major-version bumps.

**Phase 2 — Apply auto-resolves first:**

```bash
npm audit fix --production
npm install
npm run test:emulator   # baseline green check
npm run test            # unit suite (known pre-existing failures carry forward; diff vs baseline only)
npx next build --webpack   # build clean
```

Commit if green. Commit message: `fix(deps): cycle-6-fixes Lane 4 phase 1 — npm audit fix auto-resolvable subset`.

**Phase 3 — Manual bumps for what didn't auto-resolve:**

For each remaining critical/high, individually:
1. Check `npm view <pkg> versions` for the safe target.
2. `npm install <pkg>@<target>` (or `npm install <pkg>@latest` if breaking changes are documented in upstream changelog and you can verify our usage is unaffected).
3. Run full suite + build between bumps (catch regressions per-cluster, not per-omnibus).
4. If a bump requires code change (API surface drift): scope the change minimally, document in the commit message, surface to Daniel in SHIP-NOTICE if non-obvious.

**Cluster strategy for the @opentelemetry/* group:** bump the root @opentelemetry package — let transitive resolution carry the rest. Verify the family transitively bumps via `npm ls @opentelemetry/*`.

**Framework-level bumps (next, firebase-admin):** these may require careful follow-through. Coordinate with `vercel:next-upgrade` skill if `next` bump is needed; document any code changes needed for API drift. **If a major framework bump is needed and looks risky, STOP and surface to Daniel** — do not silently ship a framework bump that could break unrelated behavior.

**Phase 4 — Verify final state:**

```bash
npm audit --production --json | jq '.metadata.vulnerabilities'
```

Expected: `{critical:0, high:0, moderate:<=4, low:<=8}` (medium/low are POLISH, not gating).

---

## §3 — Hard boundaries

- DO NOT skip the test suite between dep clusters. Each cluster gets its own green checkpoint.
- DO NOT commit a `package-lock.json` that has more vulnerabilities than the starting state.
- DO NOT modify code beyond the minimum required to absorb a dep bump's API drift. If significant refactor is needed, surface to Daniel as a CONCERN before continuing.
- DO NOT bump dependencies that have no advisory hit just because they're outdated. POLISH C6D-002 (major-version drift on 5 deps) is NOT in this lane's scope.
- DO NOT touch `bridge/**` (CRIT-003 deferred).
- DO NOT push if any cluster bump introduces NEW test failures vs the pre-bump baseline.

---

## §4 — Phases

- **P0** — branch + baseline `npm audit --production --json` capture + baseline tests green
- **P1** — `npm audit fix --dry-run`; report scoped subset
- **P2** — `npm audit fix` (auto-resolvable); test + build clean; commit
- **P3** — manual bumps cluster-by-cluster; test between each
- **P4** — final `npm audit` confirmation; SHIP-NOTICE prep with `## Repros`

---

## §5 — Acceptance criteria

- `npm audit --production` final state: 0 critical, 0 high.
- `npm run test:emulator` green (44 files / 603 tests / 0 failures baseline).
- `npm run test` (unit) — no NEW failures vs pre-bump baseline (pre-existing ~66 failures carry forward unchanged).
- `npx next build --webpack` clean.
- If any cluster required code change: change is minimal + commented; SHIP-NOTICE Body documents per-cluster what changed and why.

---

## §6 — Repros to paste in SHIP-NOTICE `## Repros` section

```
### REPRO-L4-npm-audit (C5D-004 / C6D-001 carry-forward close)
preconditions: fresh clone of master tip, npm install completed
steps:
  cd sheet-music-app && npm audit --production --json | jq '.metadata.vulnerabilities'
expected: {info:0, low:<=8, moderate:<=4, high:0, critical:0, total:<=12}
observed_pre_fix: {info:0, low:8, moderate:4, high:24, critical:1, total:37}

### REPRO-L4-regression-baseline (must hold post-bumps)
preconditions: fresh clone of master tip post-Lane-4 ship, npm install completed
steps:
  cd sheet-music-app
  npx vitest run --config vitest.emulator.config.ts   # emulator
  npx vitest run                                       # unit
  npx next build --webpack                             # build
expected:
  - emulator: 44 files / 603 tests / 0 failures (or higher counts; 0 failures)
  - unit: no NEW failures vs pre-bump baseline
  - build: clean (modulo documented .env.local cron carry-forward)
observed_pre_fix: same baseline; this REPRO is the regression-guard, not the close
```

If any code changes were needed for a dep-bump's API drift, ADD a third REPRO block describing the affected surface + pre/post behavior.

---

## §7 — Standing rules

- Lock-file churn is expected and acceptable; review for unexpected dep adds (transitive new deps merit a glance).
- Bumps to framework-level deps (next, firebase-admin) require Daniel CONCERN-surface if the upgrade path is non-trivial.
- F-05 dryRun-default and trusted-leader semantics unchanged (this lane doesn't touch MCP).
- Bridge untouched.
- Commit messages: `fix(deps): cycle-6-fixes Lane 4 cluster-<name> — <pkg(s)> @ <version>` per cluster.
- Worktree teardown after auditor ACCEPT + Daniel go-ahead.

---

## §8 — Go signal

1. Acknowledge + start P0.
2. Capture baseline `npm audit` JSON.
3. P1 dry-run → P4 verify.
4. File SHIP-NOTICE with `## Repros` documenting per-cluster what bumped.

Daniel walks away after P0 confirmation; auditor + teardown handle the back end.

Go.
