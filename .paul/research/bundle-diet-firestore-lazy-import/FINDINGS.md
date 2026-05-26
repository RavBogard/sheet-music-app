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

---

## 6 — Phase 1.5 + 1.6 + methodology-over-count discovery (coder-1 follow-up, 2026-05-26T04:30Z)

**Continuation of this lane as `firestore-lazy-import-refactor`** (re-dispatched per supervisor option-P 04:00Z). After Phase 1-4 mechanical caller migration, Option B (auth-context.tsx dynamic import of users-firebase) and Option C-1 (congregation-store.ts dynamic import of `doc`/`onSnapshot` from firebase/firestore) BOTH applied cleanly per ratified RULINGs, but neither moved the `login-full-payload-size.test.ts` measurement (1602 KB → 1600 KB → 1600.3 KB across the three checkpoints; all within ±0.3 KB measurement noise). Empirical investigation traced the cause to a **fundamental over-count in the test's measurement methodology**, not to incomplete refactor coverage.

### 6.1 — What the test measures

`src/__tests__/login-full-payload-size.test.ts` regex-extracts every chunk filename mentioned anywhere in `.next/server/app/login/page_client-reference-manifest.js`:

```ts
const loginManifestSrc = readFileSync(LOGIN_CLIENT_MANIFEST, 'utf8')
const chunkCandidates = Array.from(
    new Set(loginManifestSrc.match(/[a-zA-Z0-9_-]+-[a-z0-9]+\.js/g) ?? []),
)
const loginChunks = chunkCandidates
    .map((c) => `static/chunks/${c}`)
    .filter((p) => existsSync(join(NEXT_DIR, p)))
```

### 6.2 — What that manifest actually contains

`page_client-reference-manifest.js` is **Next.js's globally-aggregated client-module registry**, keyed by absolute filesystem path, so the React server runtime can resolve any `"use client"` reference it encounters during streaming. It is NOT a per-route preload list. Empirically, /login's manifest references 6 distinct client modules whose `chunks` arrays include `d94474cc-*.js`, but none of which is reachable from /login's static graph:

```
entry id   filesystem path
58162      src\components\authed-query-provider.tsx
72539      src\components\Footer.tsx
50688      src\components\layout\LazyClientComponents.tsx
86123      src\components\layout\PageTransition.tsx
76142      src\components\nav\AppNavigation.tsx
94611      src\app\(main)\DashboardClient.tsx
```

These are all (main)-area or authed-only client components, mounted under `(main)/layout.tsx` or `perform/layout.tsx`. Their presence in /login's `page_client-reference-manifest.js` is by Next.js's serialization design — the manifest is a global registry replicated per-route — not because /login statically reaches them.

### 6.3 — What /login's REAL per-route preload list contains

Next.js App Router emits the actual per-route preload directive at the bottom of each route's compiled page chunk:

```
.next/static/chunks/app/login/page-aaa9c5c90b97f92a.js
…last line: …,e=>{e.O(0,[5563,8409,7458,7737,1305,2735,8441,3794,7358],()=>e(e.s=46427)),_N_E=e.O()}]);
                            ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
                            numeric chunk-IDs the page module preloads
```

Resolving these IDs (+ rootMainFiles + polyfills, deduped) yields /login's REAL cold-start preload graph:

```
TOTAL real cold-start: 728.9 KB across 11 chunks
   217.2 KB  [ROOT         ]  static/chunks/3794-3e29288ed8954e61.js
   195.2 KB  [ROOT         ]  static/chunks/4bd1b696-df4c0fb946159b6a.js
   131.5 KB  [PRELOAD[7458]]  static/chunks/7458-911a7c405caa7d04.js
   110.0 KB  [POLY         ]  static/chunks/polyfills-42372ed130431b0a.js
    24.7 KB  [PRELOAD[8409]]  static/chunks/8409-a60ef4e8d3f496e7.js
    17.8 KB  [PRELOAD[7737]]  static/chunks/7737-fbdb84c1ac2bd115.js
    10.7 KB  [PRELOAD[1305]]  static/chunks/1305-409a641f8d5f22e1.js
     7.5 KB  [PAGE         ]  static/chunks/app/login/page-aaa9c5c90b97f92a.js
     7.3 KB  [PRELOAD[2735]]  static/chunks/2735-6d4705a05e88690f.js
     6.6 KB  [ROOT         ]  static/chunks/webpack-64f9705a127ca9f2.js
     0.5 KB  [ROOT         ]  static/chunks/main-app-27b47e96991b053d.js

d94474cc present? false
1531-prefix present? false
```

**`d94474cc-*.js` and `1531-*.js` are NOT in /login's real cold-start preload list.** They never were — the regex-extract methodology was counting (main)/* + perform/* module entries' chunks as if /login preloaded them.

### 6.4 — Test methodology over-count quantification

| Methodology                                          | /login cold-start | Status |
|------------------------------------------------------|-------------------|--------|
| `login-full-payload-size.test.ts` (regex-extract)    | 1600.3 KB / 37 chunks | Over-counted by 871.4 KB (119.6%) |
| Per-route e.O directive (correct)                    |   728.9 KB / 11 chunks | Ground truth |

### 6.5 — coder-2's `extractLoginChunkGraph()` helper is per-route-aware (✓)

`src/__tests__/helpers/page-chunk-graph.ts` correctly parses the `e.O(0, [<ids>], …)` preload directive from the per-route page chunk and resolves each ID against `.next/static/chunks/<id>-<hash>.js`. This methodology IS the correct one — the test `src/__tests__/login-import-graph-regression.test.ts` built on it is therefore trustworthy. The FORBIDDEN_MODULES list it gates can be safely appended to.

### 6.6 — Practical consequence + what this lane ships

- **Phase 1-4 (caller migration), Option B (auth-context), Option C-1 (congregation-store) are all genuine architectural improvements** — no eager firestore SDK symbols at module-top anywhere they were previously eager. This locks against future eager-firestore-import drift, even if invisible to today's `login-full-payload-size.test.ts`.
- **The lane's stated "~230 KB cold-start savings" goal is unverifiable with current tooling.** The ground-truth cold-start cost was 946 KB (or 729 KB deduped) the whole time, not the 1615 KB the original lane-B baseline implied.
- **Ship Option D-a per supervisor RULING msg-firestore-refactor-ruling-confirm-then-option-d-a 08:55Z:** lock the architectural cleanup in, tune `RAW_BUDGET_BYTES` DOWN modestly to 1700 KB (~6% above current over-counted 1600.3 KB measurement; locks any future REAL regression at the existing test's measurement granularity), append `firebase/firestore` to `FORBIDDEN_MODULES` (via coder-2's per-route-aware helper) with signature `WebChannel` (uniqueness-verified: appears only in 1531 + d94474cc, neither of which is in /login's real preload list).
- **Fresh follow-up lane `bundle-size-test-methodology-fix`** scoped by supervisor — replace `login-full-payload-size.test.ts`'s regex-extract with a per-route SSR-preload reader, update memory with `[[feedback_login_payload_test_overcounts]]`.

### 6.7 — Why `WebChannel` over `initializeFirestore` as the FORBIDDEN signature

Signature uniqueness scan across all `.next/static/chunks/*.js`:

```
initializeFirestore   hits (3): 1305-*.js, 1531-*.js, d94474cc-*.js
WebChannel            hits (2): 1531-*.js, d94474cc-*.js
persistentLocalCache  hits (2): 1305-*.js, 1531-*.js
FirestoreSettings     hits (0):
```

`initializeFirestore` and `persistentLocalCache` BOTH appear in chunk `1305-*.js`, which IS in /login's REAL preload list — but as JS identifier strings from `src/lib/firebase.ts`'s dynamic-import destructure (`const { initializeFirestore, getFirestore, persistentLocalCache, ... } = await import("firebase/firestore")`), NOT as firestore SDK runtime code. Using these as FORBIDDEN signatures would yield a false-positive on the current GREEN build. `WebChannel` appears only in firestore SDK chunks themselves (the SDK's transport class) — clean unique signature.

### 6.8 — Open follow-ups not closed by this lane

- C-2 architectural decision (hoist `useCongregationStore.init()` into authed-only provider) — separate ratified scope.
- Audit any other auth-only `firebase/firestore` static-importer reachable from /login if a future probe finds one (the over-counting was masking this side of the question; with real-preload measurement now in hand, future bundle-diet lanes can probe accurately).
- Bundle-diet methodology lane (supervisor-scoped) — replace regex-extract.

---

**Phase 1.5+1.6+methodology authoring:** coder-1 (`feat/firestore-lazy-import-refactor`, base `9d8a75d7d` → rebased forward at ship time)
**Ship:** 2026-05-26T~05:00Z (Option D-a, per supervisor RULING `msg-firestore-refactor-ruling-confirm-then-option-d-a`)
