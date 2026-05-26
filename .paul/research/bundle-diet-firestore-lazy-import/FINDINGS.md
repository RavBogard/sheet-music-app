# Bundle-diet firestore-lazy-import — FINDINGS

**Lane:** `bundle-diet-firestore-lazy-import` (coder-6, dispatched 2026-05-26T02:30Z; **SHIPPED as Lane B test-extension only per supervisor option-P ratify 04:00Z** — firestore refactor itself re-dispatched separately as `firestore-lazy-import-refactor` Tier-1 ~4-6h lane).
**Base SHA at ship:** `59e0448c7` (rebased forward from initial `35177f0c8` after `42b38044c` `refactor(client-providers)` + `59e0448c7` `formatError` landed mid-lane).
**Phase 0 outcome:** Dispatch premise REFUTED on the measurement side; underlying band-iPad cold-start goal still HOLDS. Lane B (this ship) lands the regression-guard test that catches the firestore lazy-import win when the deferred follow-up lane lands.

---

## 1 — What the dispatch claimed

> `src/lib/firebase.ts:2` eagerly imports `firebase/firestore` at module top — ~236 KB of the rootMainFiles client JS chain. Every unauth import path (including `/login`) drags it in.
>
> Recent measurements (coder-2's bundle-diet research at `4cc575444`): fresh build = 533.9 KB / 580 KB budget. Goal of this lane: drop to <400 KB (estimated ~300 KB once firestore is lazy) so the budget can be tuned DOWN.

Two implicit premises:

- **P1** — firestore SDK is bundled inside rootMainFiles.
- **P2** — lazy-loading firestore from `firebase.ts` will shrink rootMainFiles by ~236 KB.

Both are **incorrect** as Phase-0 measurement shows.

## 2 — What this lane measured (fresh build at `35177f0c8`, confirmed again at `59e0448c7`)

Fresh isolated worktree `sheet-music-app-bundle-diet-firestore/`, fresh `npm install`, `rm -rf .next && npm run build`. Confirmed reproducible.

**rootMainFiles slice (what the existing bundle-size test measures, at both SHAs):**

```
total raw: 533.9 KB / budget 580 KB
chunks:
   218.8 KB  static/chunks/3794-*.js
   195.5 KB  static/chunks/4bd1b696-2992d786cdb9e853.js
   110.0 KB  static/chunks/polyfills-42372ed130431b0a.js
     6.9 KB  static/chunks/webpack-*.js
     2.7 KB  static/chunks/main-app-*.js
```

Exact match with coder-2's prior measurement at `4cc575444` (no drift since).

**Per-chunk content probe of rootMainFiles** (grep for firestore signatures, captured via `scripts/probe-chunks.mjs` — see patch file for the canonical probe utility):

| chunk | size | initializeFirestore | Firestore | persistentLocalCache | WebChannel | GoogleAuthProvider | firebase | firestore |
|---|---|---|---|---|---|---|---|---|
| 3794-* | 218.8 KB | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| 4bd1b696-* | 195.5 KB | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| main-app-* | 2.7 KB | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| polyfills-* | 109.9 KB | 0 | 0 | 0 | 0 | 0 | 0 | 0 |

**Firestore SDK lives in a SEPARATE chunk, not in rootMainFiles:**

```bash
$ grep -l "initializeFirestore\|persistentLocalCache" .next/static/chunks/*.js
.next/static/chunks/d94474cc-e7ba7be0e0bdd8e0.js   (236.4 KB → 230.9 KB on disk)
```

This `d94474cc` chunk **IS** referenced by `/login/page_client-reference-manifest.js` — so /login DOES preload it on cold-start. But it has never been in `rootMainFiles`.

## 3 — Why coder-2's "236 KB inside chunk 3794" reading was wrong

Coder-2's prior FINDINGS § 4 stated:
> `firebase/firestore` is still eagerly imported at `src/lib/firebase.ts:2` (~236 KB inside chunk `3794`).

That was an inference from the test comment (`src/__tests__/login-bundle-size.test.ts:9-13`) carried forward without re-verifying. The test comment itself was a mistake: chunk 3794 (218.8 KB) cannot physically contain a 236 KB firestore payload, and direct grep confirms it contains zero firestore signatures.

The test comment SHOULD have said: "firestore is split into its own chunk `d94474cc-*.js` (~236 KB), eagerly preloaded by `/login`'s client-reference manifest — making it lazy would defer that preload until a `getDb()` caller runs." **This lane's comment fix on `src/__tests__/login-bundle-size.test.ts:9-13` corrects exactly this** (per supervisor § "Memory clean-up note").

## 4 — Real /login cold-start cost on a band iPad

The bundle-size test only measures rootMainFiles. But the actual cold-start payload for `/login` is rootMainFiles PLUS all chunks listed in `/login/page_client-reference-manifest.js`. The 32 extra chunks (including the 230.9 KB firestore chunk + a 196.1 KB chunk-8754 + the React Query / Sentry / etc. infrastructure) account for the original C5B-011 ~1247 KB measurement and are what actually hits the wire on a band-iPad cold visit.

Measured at base `59e0448c7`:

```
TOTAL /login full payload (union): 1615.7 KB across 37 chunks
  rootMainFiles + polyfills slice:    533.9 KB
  /login-extras slice:               1081.8 KB

Top extras:
  230.9 KB  d94474cc-*.js   ← firestore SDK
  196.1 KB  8754-*.js
   94.3 KB  2390-*.js
   84.5 KB  5b86099a-*.js
   56.4 KB  8079-*.js
   ...
```

**Making firestore lazy moves the 230 KB firestore chunk out of /login's preload graph** (it becomes a dynamic-import-only chunk, loaded later when an authenticated path actually calls `getDb()`). The win is real — just not visible in the existing `login-bundle-size.test.ts` rootMainFiles-only metric.

## 5 — Caller graph (Phase 0 baseline for the future firestore-refactor lane)

`grep -rln 'from "@/lib/firebase"\|from "./firebase"' src/` → **34 files** total. Breakdown:

**Imports `db` (will need `getDb()` migration) — 28 files (~102 raw `db` references):**

| LOC count | file |
|---|---|
| 13 | src/lib/setlist-firebase.ts |
| 10 | src/lib/users-firebase.ts |
|  7 | src/lib/musician-profile.ts |
|  6 | src/lib/alert-store.ts |
|  5 | src/lib/template-firebase.ts |
|  5 | src/hooks/use-upcoming-prep.ts |
|  4 | src/hooks/use-setlist-performance.ts |
|  4 | src/app/(main)/monitor/MonitorClient.tsx |
|  3 | src/lib/song-preferences.ts |
|  3 | src/lib/setlist-audit.ts |
|  3 | src/lib/push-notifications.ts |
|  3 | src/lib/firestore-monitor-client.ts |
|  3 | src/hooks/use-library.ts |
|  3 | src/components/nav/MobileTabBar.tsx |
|  3 | src/components/monitor/DefaultChannelPicker.tsx |
|  3 | src/components/admin/SoundSystemSection.tsx |
|  2 | src/lib/recordings/recordings-client.ts |
|  2 | src/lib/congregation-store.ts |
|  2 | src/lib/client-tracks.ts |
|  2 | src/hooks/use-monitor-connection.ts |
|  2 | src/hooks/use-monitor-access.ts |
|  2 | src/components/monitor/QuickMonitorPanel.tsx |
|  2 | src/components/monitor/BusAssignmentPanel.tsx |
|  2 | src/components/dashboard/TaskCards.tsx |
|  2 | src/components/dashboard/OnboardingCard.tsx |
|  2 | src/components/admin/people/AccessAuditLog.tsx |
|  2 | src/components/admin/TemplatesSection.tsx |
|  2 | src/components/admin/LibraryDataSection.tsx |

**Imports only `auth` / `googleProvider` / `clearFirestoreIndexedDB` / `recoverFromFirestoreShutdown` (NO migration needed) — 6 files:**

- src/app/qr/[code]/page.tsx
- src/components/auth/QRSignIn.tsx
- src/components/error-boundary.tsx
- src/hooks/use-safe-firestore-sync.ts
- src/lib/api-client.ts
- src/lib/auth-context.tsx

**Module-load-time `db` usage check:** spot-checked the highest-density `db`-using files (setlist-firebase, users-firebase, alert-store, congregation-store). Every reference is inside an async function or event handler — no top-level `const ref = collection(db, ...)` patterns. Pattern (A) async `getDb()` composes without restructuring caller modules.

**Test mocks affected:** `vi.mock('@/lib/firebase')` patterns in **18 client-side test files** expose `db` as a sync property; converting to `getDb` async-fn requires updating each mock (`getDb: vi.fn(async () => ({...}))` shape, ~3-7 LOC per file).

## 6 — Why Lane B over the original full-refactor scope

Original dispatch budgeted 100-200 LOC src + 30-60 LOC tests. Phase 0 + initial Phase 1/2 pilot (firebase.ts refactor + 3 lib/*.ts callers migrated cleanly) exposed the real scope: ~28 callers × multi-LOC each + 18 test mocks + `subscribeWithDb()` cancellation-token helper for `onSnapshot`-style callers = **~400-580 LOC across ~46 files, 4-6h end-to-end**. There's no clean partial-ship path because removing `db` from `firebase.ts`'s exports breaks every caller atomically.

Supervisor took Option P (2026-05-26T04:00Z, msg-from-supervisor-bundle-diet-firestore-option-p-ratify):

- **Ship-velocity:** Lane B (the test-extension) is a clean Tier-1 single-commit ship landable in this session. Defers no value.
- **Scope clarity:** the firestore-refactor's REAL scope deserves a fresh explicit dispatch reflecting the discovered reality in the budget + boundary spec.
- **Lowest-idle dispatch:** the refactor goes to the lowest-idle integer when supervisor capacity opens, not necessarily back to coder-6.

## 7 — What landed in THIS lane (Lane B — test-extension)

- **NEW `src/__tests__/login-full-payload-size.test.ts`** — measures rootMainFiles + polyfills + chunks referenced by `.next/server/app/login/page_client-reference-manifest.js`, deduped + summed. Budget: 1800 KB raw (~10% above current 1615.7 KB / 37-chunk measurement at `59e0448c7`). Documents the ~20% projected headroom for the future firestore-refactor lane to tune DOWN to ~1500 KB once the 230 KB firestore SDK chunk leaves /login's preload graph. Companion file to the existing `login-bundle-size.test.ts` rootMainFiles guard (kept intact). PASSES at ship at `59e0448c7`.
- **`src/__tests__/login-bundle-size.test.ts` comment fix** — corrected the misleading "firestore is in the baseline (~236 KB)" claim. New comment explains the firestore SDK chunk is in `/login`'s preload graph (`page_client-reference-manifest.js`-referenced) but NOT in rootMainFiles, and that the companion full-payload test is the metric that catches firestore-lazy-import savings. Adds the build-hygiene `rm -rf .next` reminder per `4cc575444` FINDINGS.
- **`.paul/research/bundle-diet-firestore-lazy-import/wip-foundation.patch`** — preserved WIP from initial Phase-1/2 attempt (firebase.ts Pattern (A) refactor + `subscribeWithDb` helper + 3 lib/*.ts caller migrations: setlist-firebase, users-firebase, musician-profile). Future `firestore-lazy-import-refactor` lane is expected to `git apply` this patch as its starting point. Saved as text-in-tree (not a stash) per supervisor's "patch-file approach" guidance — surfaces in git history, doesn't depend on a Windows stash file-handle.

## 8 — Out of scope (deferred to follow-up lane `firestore-lazy-import-refactor`)

- `src/lib/firebase.ts` refactor (Pattern (A) + `subscribeWithDb` helper) — partial work in patch file.
- 28 src callers `db` → `await getDb()` (lib/*.ts, hooks/*, components/*, app/(main)/monitor/MonitorClient.tsx).
- 18 client-side test mock files (`vi.mock('@/lib/firebase')` → `getDb: vi.fn(async () => ({...}))` shape).
- Re-run + validate `login-full-payload-size.test.ts` PASSES at new, lower measurement; tune `RAW_BUDGET_BYTES` DOWN to ~1500 KB.
- DevTools-Network smoke confirming `d94474cc-*.js` (or its successor firestore chunk) no longer preloads on cold /login.

## 9 — Verification trail

Replay (~7 min) at any base SHA:

```bash
cd C:/Users/dsbog/centralreform.live/sheet-music-app
git worktree add ../sheet-music-app-bundle-verify origin/master
cd ../sheet-music-app-bundle-verify
cp ../sheet-music-app-mcp/.env.local .
npm install                                                                # ~6 min
rm -rf .next && npm run build                                              # ~90 s
npx vitest run src/__tests__/login-bundle-size.test.ts \
                src/__tests__/login-full-payload-size.test.ts
# expect both PASS
```

Direct chunk-graph measurement (independent of test):

```bash
node -e "
const { readFileSync, existsSync, statSync } = require('node:fs');
const { join } = require('node:path');
const m = JSON.parse(readFileSync('.next/build-manifest.json','utf8'));
const root = new Set([...(m.rootMainFiles??[]), ...(m.polyfillFiles??[])]);
const loginMan = readFileSync('.next/server/app/login/page_client-reference-manifest.js','utf8');
const cands = Array.from(new Set(loginMan.match(/[a-zA-Z0-9_-]+-[a-z0-9]+\.js/g) || []));
const loginChunks = cands.map(c => 'static/chunks/' + c).filter(p => existsSync(join('.next', p)));
const all = Array.from(new Set([...root, ...loginChunks]));
let total = 0, totalRoot = 0;
for (const c of all) {
  const abs = join('.next', c);
  if (!existsSync(abs)) continue;
  const s = statSync(abs).size;
  total += s;
  if (root.has(c)) totalRoot += s;
}
console.log('/login full payload:', (total/1024).toFixed(1), 'KB,', all.length, 'chunks');
console.log('  rootMainFiles slice:', (totalRoot/1024).toFixed(1), 'KB');
console.log('  /login-extras slice:', ((total-totalRoot)/1024).toFixed(1), 'KB');
"
```

---

**Authoring:** coder-6 (`feat/bundle-diet-firestore-lazy-import`, base `59e0448c7`)
**Lane B ship:** 2026-05-26T~04:10Z
