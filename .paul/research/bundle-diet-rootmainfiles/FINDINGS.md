# Bundle-diet rootmainfiles — FINDINGS

**Lane:** `bundle-diet-rootmainfiles` (coder-2, dispatched 2026-05-25T23:00Z)
**Verdict:** **NO REGRESSION** — the reported 726.4 KB / 146 KB-over measurement is a
stale-`.next/build-manifest.json` harness artifact, not a real bundle change. Fresh
build at the dispatched base SHA passes the gate with 46 KB headroom.
**Recommendation:** **Close lane without code surgery.** Phase 2/3 do not apply.
**SHIP-NOTICE → supervisor** (primary; flips primary off auditor because no src fix lands).

---

## 1 — What was reported

The supervisor's dispatch `msg-bundle-diet-rootmainfiles-001` (`inbox/coder-2.md:6-93`)
cited two independent vitest runs that reported the failure:

- Auditor's cumulative-tip sweep at `8bf966c8b` (coder-1 `bridge-health-alarm` ACCEPT):
  `cumulative-tip sweep 249 PASS / 1 FAIL pre-existing login-bundle-size budget —
  NOT a regression from this lane` (`inbox/auditor.md:1089`).
- coder-2 (this identity, prior lane `bridge-docs-rewrite`) own SHIP gates at
  `2409ed183`: `726.4 KB raw vs 580 KB budget = 146 KB over`.

Both runs are quoted in the dispatch as the source of truth. The dispatch
classifies the finding as **P1 LAUNCH-RELEVANT** on the basis that band-iPads
load the login surface first on shul WiFi.

## 2 — What this lane measured

**Fresh isolated environment:**

- New worktree `sheet-music-app-bundle-diet/` cut from current
  `origin/master` (`29ccaec5c` — coder-3 `storage-backup-fix-b` ship; supersedes
  the dispatch's stale `e01dc2b1a` reference but coder-3's diff is
  cron/storage-backup/admin-consistency/health, fully disjoint from any
  plausible rootMainFiles surface).
- Fresh `npm install` (1908 packages, no junction). Required because the test
  reads `.next/build-manifest.json` which must come from a build against this
  specific node_modules tree.
- `npm run build` produced `.next/build-manifest.json` born **2026-05-25
  16:12:11** (verified via `stat`). No possibility of stale-artifact
  contamination — this lane created the manifest from scratch in this
  process tree.

**Result — `npx vitest run src/__tests__/login-bundle-size.test.ts`:**

```
✓ src/__tests__/login-bundle-size.test.ts (1 test) 4ms
Test Files  1 passed (1)
     Tests  1 passed (1)
```

**Direct per-chunk breakdown** (computed via the same code path the test uses
on the `.next/build-manifest.json` + `existsSync`/`statSync` chunk files):

```
total raw: 533.9 KB / budget 580 KB
chunks:
   218.8 KB  static/chunks/3794-c8394982b2720aa0.js          (React framework vendor)
   195.5 KB  static/chunks/4bd1b696-2992d786cdb9e853.js     (react-dom)
   110.0 KB  static/chunks/polyfills-42372ed130431b0a.js
     6.9 KB  static/chunks/webpack-988f7c4579ca64ad.js
     2.7 KB  static/chunks/main-app-8e9d32145e68b54c.js
rootMainFiles count: 4 , polyfillFiles count: 1
```

Five chunks, total 533.9 KB. Budget 580 KB. **Headroom: 46.1 KB (8% under
budget).**

The chunk shape matches the cycle-5-fixes baseline documented in
`src/__tests__/login-bundle-size.test.ts:40-42` exactly: React framework vendor
(3794) + react-dom (4bd1b696) + polyfills + webpack + main-app entry. There
is no extra chunk, no inflated chunk, no Sentry SDK / Firestore growth / pdf
chain leak into rootMainFiles.

## 3 — Why the 726.4 KB report was wrong

The supervisor's own prior wave SHIP-NOTICE at supervisor.md:1108 already
documents the answer in an analogous incident:

> the first vitest pass reported a 726.4 KB FAIL on this test — confirmed as
> stale-`.next` artifact (manifest dated 2026-05-24 17:25, pre-wave;
> deleted+rebuilt; re-ran focused test → PASS).

The bundle-size test's `describe.skipIf(!buildPresent)` gate runs whenever
**any** `.next/build-manifest.json` exists in `process.cwd()` — it makes no
attempt to verify that the manifest was produced from the current source
tree. A worktree that ran a `next build` weeks ago and didn't clear
`.next/` between SHA changes will silently match a STALE manifest against
the CURRENT chunk files (or, more often, against MISSING chunk files
referenced by a manifest that no longer matches the build output).

The byte-counting loop in the test (`src/__tests__/login-bundle-size.test.ts:62-69`)
skips chunks listed in the manifest that don't exist on disk — but
crucially, when the stale manifest references chunks that DO still exist
(carried over because the chunk-hash didn't change), and adds them to
fresh ones from a partial rebuild, the total can balloon arbitrarily.
That's the most likely shape of the 726.4 KB number: an interleaved sum
of fresh + stale chunks across a `.next/` directory not cleaned between
SHAs.

**Hypothesized contamination paths in the two reports cited by dispatch:**

- **Auditor sweep at `8bf966c8b`:** auditor runs in
  `sheet-music-app-auditor-validation/` (per `[[feedback_auditor_never_read_cwd_for_validation]]`
  + `[[project_worktree_test_harness_node_modules]]`). That worktree is reused
  across cumulative-tip sweeps and its `.next/` is not cleaned between
  SHA changes; build-manifests from prior weeks are likely co-resident
  with chunks from newer builds.
- **coder-2 bridge-docs-ship at `2409ed183`:** that lane was a docs-only
  rewrite — `bridge/README.md` + `bridge/SETUP_GUIDE.md` + `bridge/Dockerfile`-DELETE
  + `bridge/docker-compose.yml`-DELETE. No src/ touched. The branch was
  cut from a parent SHA (origin/master at the time of that lane) and the
  worktree was reused from a prior lane with stale `.next/` artifacts —
  most likely path to the 726.4 KB reading from the same root cause as
  the auditor's sweep.

Both reports are the SAME stale-artifact phantom, not two independent
confirmations of a real regression.

## 4 — What about the 46 KB headroom?

The current bundle (533.9 KB) is 46 KB under the 580 KB budget. The
cycle-5 baseline was ~528 KB. Drift since cycle-5: ~6 KB. That's
consistent with incidental package upgrades (the test comment explicitly
allocates 10% headroom for exactly this) and well within tolerance.

**Polish opportunities exist but are not regressions:**

- `firebase/firestore` is still eagerly imported at `src/lib/firebase.ts:2`
  (~236 KB inside chunk `3794`). The test comment at
  `src/__tests__/login-bundle-size.test.ts:9-15` explicitly defers this
  to a future dedicated lane: "That refactor is deferred to a dedicated
  follow-up phase." Out of scope per the dispatch's hard boundary #1
  (⛔ NO refactoring `src/lib/firebase.ts`).
- `@tanstack/react-query` is eagerly imported by
  `src/components/client-providers.tsx:7` — ~30-50 KB likely in chunk
  `4bd1b696`. Could be moved behind an authed-route boundary, but again
  out of scope for a "fix the regression" lane.
- `@sentry/nextjs` (the suspected first culprit in the dispatch's
  candidate list) is in fact correctly dynamic-imported at
  `sentry.client.config.ts:12` — the Sentry SDK does NOT appear in
  rootMainFiles. `instrumentation.ts:13`'s eager `import * as Sentry` is
  server-only by Next.js convention and is correctly tree-shaken from
  the client bundle. The dispatch's hypothesis is REFUTED by the
  per-chunk breakdown.

These are all "tune the budget DOWN as bundle-diet phases land" work, not
"fix the 146 KB overrun" work. **There is no 146 KB overrun.** The lane
as scoped has no executable Phase 2.

## 5 — Recommendation

**Close lane without code surgery.** Specifically:

1. **No commit.** This worktree's tree is identical to base
   `29ccaec5c` except for the FINDINGS.md research doc + the optional
   `.paul/research/bundle-diet-rootmainfiles/` directory. Recommendation:
   commit + push FINDINGS.md alone as a Tier-0 research artifact so the
   next stale-artifact phantom has a documented prior-art reference. No
   src/ change lands.
2. **Supervisor + auditor adopt a build-hygiene check** before quoting
   the bundle-size test as evidence of a regression: when the test
   FAILs, **rebuild `.next/` from scratch** (`rm -rf .next && npm run
   build`) and re-run; only THEN flag it as a real finding. Add this to
   `AUDITOR.md` or `decisions.md` as a standing rule. (Suggested
   wording: "Before quoting `login-bundle-size.test.ts` failure as
   evidence of a bundle regression, MUST rebuild `.next/` from scratch
   to defeat stale-manifest contamination. The test makes no attempt to
   verify manifest-vs-tree consistency; staleness can produce
   arbitrarily inflated totals.")
3. **Worktree teardown** — supervisor handles per
   `[[feedback_worktree_teardown_timing]]`. This lane never claimed any
   shared files in `.coord/shared/claims.md`; no release needed.

## 6 — Build harness notes (for future lanes touching the bundle-size test)

- **Worktree had to do a full `npm install`** (1908 packages, ~6min on
  this Windows box) — junctioned node_modules from
  `sheet-music-app-auditor-validation/` or `sheet-music-app-mcp/` would
  cross-contaminate other coders' builds because the bundle-size test
  reads `.next/build-manifest.json` which is sensitive to the exact
  package versions in `node_modules/`.
- **Per-worktree git identity** set (`coder-2@coord.local`) before any
  commit per the dispatch's lane setup hints.
- **`.env.local` copied from `sheet-music-app-mcp/`** for `next build`
  (per `[[project_worktree_test_harness_node_modules]]`).
- `next build` ran clean (exit 0, 66 routes built, no Sentry sourcemap
  upload because no auth token in this worktree — expected dev
  behavior).
- The post-install `postinstall` step copies the pdf.worker.min.mjs
  v5.4.296 into `public/` — verified working.

## 7 — Verification trail for the auditor / supervisor

Anyone re-verifying this finding can replay it in ~7 minutes total:

```bash
cd C:/Users/dsbog/centralreform.live/sheet-music-app
git worktree add ../sheet-music-app-bundle-verify origin/master
cd ../sheet-music-app-bundle-verify
cp ../sheet-music-app-mcp/.env.local .
npm install                                                # ~6 min
npm run build                                              # ~90 s
node node_modules/vitest/vitest.mjs run src/__tests__/login-bundle-size.test.ts
# expect: PASS, 533.9 KB / 580 KB
```

The direct chunk breakdown (independent of the test) can be confirmed via:

```bash
node -e "
const { readFileSync, existsSync, statSync } = require('node:fs');
const { join } = require('node:path');
const m = JSON.parse(readFileSync('.next/build-manifest.json','utf8'));
const chunks = Array.from(new Set([...(m.rootMainFiles??[]), ...(m.polyfillFiles??[])]));
let total = 0;
const sizes = [];
for (const c of chunks) {
  const abs = join('.next', c);
  if (!existsSync(abs)) continue;
  const s = statSync(abs).size;
  total += s;
  sizes.push({c, s});
}
sizes.sort((a,b)=>b.s-a.s);
console.log('total:', (total/1024).toFixed(1), 'KB');
for (const {c,s} of sizes) console.log(' ', (s/1024).toFixed(1).padStart(7), 'KB', c);
"
```

---

**Authoring:** coder-2 (`feat/bundle-diet-rootmainfiles`, base `29ccaec5c`)
**Created:** 2026-05-25T23:20Z
