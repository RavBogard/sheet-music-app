# react-query-lazy-import — FINDINGS

**Lane:** `react-query-lazy-import` (coder-5, dispatched 2026-05-26T02:50Z)
**Base SHA:** `034c6d82d` (origin/master at ACK; coder-2 x32-client-virtual-adapter-rejection)
**Pattern adopted:** **A** — split provider into per-route-group authed layouts
**Status:** Phase 0 + Phase 1 complete; baseline + post-fix bundle measurements pending build completion.

---

## 1 — Phase 0: react-query consumer map

`git grep -n "useQuery\|useMutation\|QueryClient\|useQueryClient\|@tanstack/react-query" src/` enumerated **2 production sites** (`use-library` hook + `client-providers` mount) plus the 8 callers of `use-library` and 2 direct `useQueryClient` consumers (`UploadDialog`/`ScraperModal`).

### 1a. Provider site (the target)

| File | Line | Role |
|------|------|------|
| `src/components/client-providers.tsx` | L6 | eager top-level `import { QueryClient, QueryClientProvider } from "@tanstack/react-query"`; `<QueryClientProvider client={queryClient}>` wraps `<AuthProvider>` and ultimately every route. **This is the only mount; this is what cost ~30-50 KB of rootMainFiles.** |

### 1b. Direct consumers (3 prod files)

| File | Hook | Authed surface |
|------|------|----------------|
| `src/hooks/use-library.ts` | `useQuery` + `useQueryClient` | re-exported across (main) + perform/[fileId] + perform/setlist/[id] |
| `src/components/library/UploadDialog.tsx:10` | `useQueryClient` | library admin (under `(main)`) |
| `src/components/library/ScraperModal.tsx:11` | `useQueryClient` | library admin (under `(main)`) |

### 1c. Indirect consumers via `useLibrary`

`git grep -ln "from \"@/hooks/use-library\"" src/` → **9 files**:

- `src/app/(main)/manage/ManageClient.tsx` — under `(main)`
- `src/app/perform/[fileId]/page.tsx` — under `perform/` deep route
- `src/app/perform/setlist/[id]/SetlistPerformClient.tsx` — under `perform/` deep route
- `src/components/library/SearchOverlay.tsx`
- `src/components/library/SongChartsLibrary.tsx`
- `src/components/nav/DesktopHeader.tsx` — rendered inside `(main)/AppNavigation`
- `src/components/setlist/modals/AddSongsModal.tsx`
- `src/components/setlist/modals/MatchFileModal.tsx`
- `src/hooks/use-setlist-dashboard.ts`

**Every one of them mounts under `(main)/layout.tsx` or `perform/layout.tsx`.** No usage in `/login`, `/auth-error`, `/unauthorized`, or `/perform` root listing.

### 1d. Test-side consumers (unaffected)

- `src/components/performance/__tests__/async-safety.test.tsx:120` imports + provides its own `QueryClientProvider` via `await import("@tanstack/react-query")`. Self-contained.
- `src/hooks/__tests__/use-library.test.ts:38` `vi.mock('@tanstack/react-query')` stubs the module — no real react-query touched.
- `src/components/library/__tests__/song-charts-library.test.tsx` heavily mocks `@/hooks/use-library` + `UploadDialog` + `ScraperModal` — never instantiates react-query.
- `src/components/library/__tests__/upload-dialog-musescore.test.ts` — tests values directly; never renders the component.

## 2 — Phase 0: boundary analysis

`src/app/` route shape:

```
src/app/
├── layout.tsx                ← ROOT (server). Mounts ThemeProvider → ErrorBoundary → ClientProviders → {children}
├── login/page.tsx            ← UNAUTH. No react-query usage.
├── auth-error/page.tsx       ← UNAUTH. No react-query usage.
├── unauthorized/page.tsx     ← UNAUTH. No react-query usage.
├── perform/
│   ├── layout.tsx            ← already "use client". Hosts:
│   ├── page.tsx              ←   PUBLIC setlist listing. No react-query usage.
│   ├── [fileId]/page.tsx     ←   AUTHED deep chart view (uses useLibrary)
│   └── setlist/[id]/SetlistPerformClient.tsx  ← AUTHED deep setlist perform (uses useLibrary)
└── (main)/
    └── layout.tsx            ← server component. Hosts (main)/page.tsx (dashboard) + library + manage + setlists + monitor + schedule + settings + …
```

Two clean authed-layout boundaries exist: `(main)/layout.tsx` and `perform/layout.tsx`. They do NOT share a deeper authed parent — they sit as siblings under root. Pattern A therefore requires **two provider mounts**, each owning its own `QueryClient` per the canonical Next.js App Router pattern for non-shared authed parents.

## 3 — Pattern decision: A wins (real bandwidth savings, not deferral)

The dispatch listed two patterns. Pattern A (move boundary) chosen because:

- **Pattern B (`dynamic({ ssr: false })` on the provider)** does NOT remove the chunk from `/login`'s payload — it just defers it. The chunk is still loaded by `<ClientProviders>` on every page including `/login`, after FCP. The bundle-size test measures `rootMainFiles`, which excludes lazy chunks; B would technically pass the test, but the user-visible bandwidth on the shul-WiFi cold-load of `/login` would not actually improve.
- **Pattern A (move provider into authed layouts)** makes react-query a non-imported module on `/login`/`/auth-error`/`/unauthorized` — the JS truly never ships. The chunk gets co-located with the authed route group's lazy chunk graph.
- **Two QueryClient instances** (one per (main)/perform group) is acceptable: today's `useLibrary` cache is per-mount and doesn't share query-keys across the (main) authoring surface and the perform consumer surface. Navigations from (main)/library → /perform are full-page in current UX (no router transitions cross the boundary today).
- **`/perform` root listing (public)** does not use react-query, but lifting the provider into `perform/layout.tsx` still bundles react-query into perform's chunk graph. Acceptable: the iPad-band-perform surface already shares JS across the layout, and the savings are measured against `rootMainFiles` (the per-page-shared chunk).

## 4 — Phase 1: applied surgery

**NEW file** — `src/components/authed-query-provider.tsx` (~45 LOC):
- Client component owning the `QueryClient` instance + `QueryClientProvider`
- JSDoc cross-references the bundle-size test and explains the per-route-group split rationale
- Same `defaultOptions` as the prior root mount (`staleTime: 5min`, `refetchOnWindowFocus: false`, `retry: 1`)

**EDITED** — `src/components/client-providers.tsx`:
- Removed `QueryClient` + `QueryClientProvider` import + `useState` import (no longer needed)
- Removed inline QueryClient construction
- Removed `<QueryClientProvider>` wrapper
- Added JSDoc explaining the hoist and the 2026-05-26 date
- ~10 LOC net delta

**EDITED** — `src/app/(main)/layout.tsx`:
- Added `import { AuthedQueryProvider } from "@/components/authed-query-provider"`
- Wrapped the existing root `<div>` with `<AuthedQueryProvider>`
- Preserved all server-side `getServerUser` work + AppNavigation props + Footer + LazyClientComponents

**EDITED** — `src/app/perform/layout.tsx`:
- Added `import { AuthedQueryProvider } from "@/components/authed-query-provider"`
- Wrapped the existing `<main id="main-content">` with `<AuthedQueryProvider>`
- Preserved `PdfWorkerPreload` + `PerformanceOfflineIndicator`

**Total src LOC delta:** ~75 LOC across 4 files (1 new + 3 edited). Comfortably inside the dispatch's ~60-100 LOC budget.

## 5 — Phase 2: bundle measurement + the metric clarification

### 5a. Measurement (both runs `rm -rf .next && npm run build` clean)

| metric | BEFORE (baseline `034c6d82d`) | AFTER (Phase 1 surgery) | delta |
|---|---|---|---|
| `rootMainFiles+polyfills` total | 533.9 KB | 533.9 KB | **0.0 KB** |
| chunk `3794-*.js` (React framework vendor) | 218.8 KB (hash `e36585f4f3bb4768`) | 218.8 KB (hash `e36585f4f3bb4768`) | identical |
| chunk `4bd1b696-*.js` (react-dom) | 195.5 KB (hash `2992d786cdb9e853`) | 195.5 KB (hash `2992d786cdb9e853`) | identical |
| chunk `polyfills-*.js` | 110.0 KB | 110.0 KB | identical |
| chunk `webpack-*.js` | 6.9 KB (hash `f5c6c5ad905f71b3`) | 6.9 KB (hash `c8ded36436b97fed`) | hash-changed (runtime regen) |
| chunk `main-app-*.js` | 2.7 KB (hash `b383263d0568eb48`) | 2.7 KB (hash `b383263d0568eb48`) | identical |

### 5b. Why the test set is unchanged

The dispatch's "30-50 KB `rootMainFiles` savings" framing was OFF-TARGET: **`@tanstack/react-query` was never in `rootMainFiles`**. The framework chunks `3794`/`4bd1b696` contain React + react-dom + Next.js runtime + a couple of universal vendor deps; react-query lives in chunk `5543-*.js` (15.4 KB raw), which is a NORMAL Webpack split chunk loaded only by pages whose component tree references a react-query consumer.

Concretely (verified against the post-fix build):

```
.next/static/chunks/5543-451d9e4ea4af65bf.js  →  15.4 KB (contains @tanstack/react-query)
```

`grep -l "_tanstack_react_query" .next/static/chunks/*.js` matched exactly one file: chunk 5543. None of the rootMainFiles chunks (`3794`/`4bd1b696`/`polyfills`/`webpack`/`main-app`) contain any react-query code (verified `grep -c "tanstack" .next/static/chunks/3794-*.js` → 0; same for the others).

### 5c. So where ARE the savings?

The real /login bandwidth win is in the **page-specific chunk graph**, not in `rootMainFiles`. Verified post-fix layout chunks:

- **Root layout chunk** `static/chunks/app/layout-2d1a6ccc99b19acc.js` (10.1 KB) — `/tanstack/i` MATCHES = `false`; `QueryClient` MATCHES = `false`; mentions `ClientProviders` (which itself no longer imports react-query). ✅ Clean.
- **(main) layout chunk** `static/chunks/app/(main)/layout-5304f2c1e09db216.js` (7.3 KB) — mentions `AuthedQueryProvider`, but the actual `@tanstack` import is in chunk 5543 lazy-loaded on (main) entry. ✅ Correct.
- **perform layout chunk** `static/chunks/app/perform/layout-0ae6e06c696442f4.js` (6.9 KB) — same shape: `AuthedQueryProvider` referenced, react-query lazy-fetched from 5543. ✅ Correct.
- **/login page chunk** `static/chunks/app/login/page-1d07cff4d686ad42.js` (12.9 KB) — module-ID scan via `\b\d{4,5}\b` regex enumerated 36 unique numeric module IDs; `5543` NOT in the list. ✅ /login does NOT lazy-fetch react-query.

The 5543 chunk DOES appear in `/login/page_client-reference-manifest.js` but **only as part of Next's global client-module table** for SSR serializability — the browser fetches a chunk only when the SSR'd component tree of the specific page references it via the webpack runtime, and `/login`'s component tree no longer references the react-query module.

### 5d. RAW_BUDGET_BYTES — NOT tuned this lane

The dispatch §Phase 2 step 3 said "update `RAW_BUDGET_BYTES` to ~10% above the new measured size." Since the new measured size is identical to baseline, **the budget stays unchanged at 593,920 bytes (580 KB)**. There is no number to tune. The 8.6% existing headroom (533.9 KB observed vs 580 KB budget) is already at the test's documented "Headroom: ~10% for incidental package upgrades" target (`src/__tests__/login-bundle-size.test.ts:41`). Tightening it artificially would penalize future incidental package upgrades without buying any regression-detection power for the actual chunk this lane moved.

A FUTURE lane could add a NEW test that walks `app/login/page-*.js`'s static module-ID references and asserts react-query's chunk ID is not among them — that would lock in this lane's real win and fail cleanly if a future change reintroduces a react-query call site into root or login. Out of scope for this lane (~30-50 LOC test plus a stable chunk-ID extraction helper); flagging as `OPEN-FOLLOWUP` in SHIP-NOTICE.

## 6 — Out-of-scope confirmations (hard boundaries — all upheld)

- ⛔ NO touch to `src/lib/firebase.ts` (coder-6 lane).
- ⛔ NO touch to `bridge/`, `monitor/`, `firestore.rules`, `vercel.json`, `env`.
- ⛔ NO touch to `[[project_smart_transposer_is_key_transcriber]]` zone.
- ⛔ NO refactoring how the app *uses* react-query — only the provider boundary moved.
- ⛔ NO repo-root `mcp/` / `SetlistGrid.tsx` / `errors.ts` / `error-envelopes.ts`.

## 7 — Verification (focused suite — full suite running in BG)

Pre-push gates:

- `npx tsc --noEmit` — exit 0, clean output.
- `npx vitest run` focused suite (5 files): **41/41 PASS in 3.05s**:
  - `src/__tests__/login-bundle-size.test.ts` — 1/1 PASS (budget unchanged, test still PASSes at 533.9 KB / 580 KB)
  - `src/hooks/__tests__/use-library.test.ts` — 8/8 PASS (mocked react-query, unaffected)
  - `src/components/library/__tests__/song-charts-library.test.tsx` — 20/20 PASS (heavily-mocked, unaffected)
  - `src/components/library/__tests__/upload-dialog-musescore.test.ts` — 6/6 PASS (value-level test)
  - `src/components/performance/__tests__/async-safety.test.tsx` — 6/6 PASS (self-provides its own QueryClientProvider)

Full suite + build gate: appended on SHIP-NOTICE.


## 6 — Out-of-scope confirmations (hard boundaries — all upheld)

- ⛔ NO touch to `src/lib/firebase.ts` (coder-6 lane).
- ⛔ NO touch to `bridge/`, `monitor/`, `firestore.rules`, `vercel.json`, `env`.
- ⛔ NO touch to `[[project_smart_transposer_is_key_transcriber]]` zone.
- ⛔ NO refactoring how the app *uses* react-query — only the provider boundary moved.
- ⛔ NO repo-root `mcp/` / `SetlistGrid.tsx` / `errors.ts` / `error-envelopes.ts`.

Phase 2 results will be appended below.
