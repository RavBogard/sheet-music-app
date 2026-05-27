# infra-hygiene — F-003 RSC 503 cold-load + F-004 stale dpl in font URLs

**Lane:** `infra-hygiene` (coder-3, Tier-1 P2 NORMAL)
**Source findings:** cowork web stress-test `cowork-web-20260526a`
**Base:** `origin/master` `b38c5f8276`
**Date:** 2026-05-27
**Disposition:** **DOCUMENT — both findings are Vercel-platform-inherent and benign; no clean app-code fix exists at the hypothesized layer.** This is the dispatch's explicit fallback ("(if framework-inherent) document + add a graceful client fallback" / "document why client-unfixable"). The graceful client fallbacks the dispatch asks for already exist (see F-003 §Existing resilience).

Live deployment at investigation time: current `dpl_Au41P6u3gGP1TXKaoL3CLbmPA7Cb`; stale (cowork-observed) `dpl_3yWVHo9Y1mdNeuXjSHukYVEexJHJ`.

---

## F-003 — RSC prefetch 503 during cold load

### Cowork observation
2× GET `/setlists?_rsc=<token>` → 503, 2× GET `/perform/setlist/[id]?_rsc=<token>` → 503, plus a Firestore Listen channel 503, all in the auth/middleware handshake window. In-page retry `fetch('/setlists?_rsc=...')` (same token) → 200 `x-vercel-cache:MISS` → transient, NOT deployment-wide.

### Root cause (evidence-backed)
The 503 is **not** an app middleware short-circuit. It is a **Vercel function cold-start capacity 503** during the cold-resume parallel RSC-prefetch burst.

- `src/proxy.ts` emits **no 503 on any path** — only 307 redirects (`/login`, `/perform`, `/setlists`), `rewrite` (`/unauthorized`), or passthrough (`NextResponse.next`). Read end-to-end; the only explicit status it sets is the `405` JSON envelope for non-GET `/login`.
- `verifyRoleCookie` (`src/lib/session-role.ts`, called at `proxy.ts:255`) is **fully defensive**: every failure mode (missing secret, bad format, bad sig, expired, decode error) returns `null`. The single awaited throw site (`crypto.subtle.importKey`) would surface as a 500 `FUNCTION_INVOCATION_FAILED`, not a 503 — and only on a malformed key / runtime-crypto failure, which is not what was observed.
- The co-occurring **Firestore Listen channel 503** (Google backend, entirely outside our stack) confirms the 503s are a network/platform-layer transient during cold start, not app logic.

### Steady-state probe (this lane, live prod)
```
/setlists?_rsc=  (unauth, RSC+prefetch headers)  → 307 → /login   (×5 repeat: 307,307,307,307,307)
/perform?_rsc=   (public prefix)                  → 200 text/x-component
```
Zero 503s across 6 probes. The 503 only appears under genuine cold-start, and self-heals on warm-up / retry — exactly as the cowork in-page retry (→ 200 MISS) demonstrated.

### Why there is no clean app-code fix
- The hypothesized "middleware short-circuit" does not exist — proxy.ts never returns 503.
- A 503 on an RSC **prefetch** is harmless: Next.js's router silently discards a failed prefetch; the user-visible click simply isn't pre-warmed and re-fetches fresh. No stale shell on actual interaction.
- A 503 on a real **navigation** RSC fetch is retried by Next, then falls back to a hard (MPA) navigation. If the hard navigation also 503s (functions still cold), the browser shows Vercel's 503 page — recoverable only platform-side (warm functions), not by app code.
- React **error boundaries do not catch network 503s** — they catch render errors. So `perform/error.tsx` etc. cannot intercept this.
- **Auto-reload-on-503 is contraindicated** in this codebase: `next.config.ts` documents the 2026-05-17 Serwist/SW removal precisely because reload-recovery handlers formed self-reinforcing reload loops. Adding a new auto-reload would reintroduce that failure class.

### Existing graceful client fallback (already shipped — the dispatch's ask is met)
- `src/app/perform/setlist/[id]/loading.tsx` — skeleton during the RSC fetch (no blank flash).
- `src/app/perform/error.tsx` — **Retry** (`reset()`) + **Go Back** + Sentry capture for render-time failures on the band's hot route.
- `src/app/(main)/error.tsx` + `src/app/(main)/setlists/[id]/error.tsx` + `src/app/global-error.tsx` — sibling boundaries.
- Next.js router prefetch-failure tolerance (built-in).

### Daniel-side lever (optional, only if cold-start 503s recur or worsen)
Enable **Vercel Fluid Compute / function min-instances (warm start)** on the band-facing routes (`/setlists`, `/perform/setlist/[id]`) to eliminate cold-start capacity 503s. Project-setting, not code. Recommend only if telemetry shows the band actually hitting these (currently transient + self-healing, so likely not worth the always-on cost pre-launch).

---

## F-004 — stale deployment id in font URLs

### Cowork observation
`_next/static/media/*.woff2` served referencing TWO dpl tokens: current `dpl_Au41P...` AND stale `dpl_3yWVHo...`. Both 200; concern was a future 404 if the old deployment is pruned.

### Root cause (reproduced live)
Two facts compose:
1. **The `?dpl=` suffix is Vercel Skew Protection**, a project-level platform setting. There is **no** `deploymentId` / `assetPrefix` / skew config in `next.config.ts` or anywhere in `src/**` (grep-confirmed). Vercel injects `?dpl=<deploymentId>` on all `_next/static/*` references via `NEXT_DEPLOYMENT_ID` at build.
2. **Next.js content-hashes CSS chunks BEFORE deploymentId injection.** Proven live: the page links `/_next/static/css/7952a8c316420a0a.css?dpl=dpl_Au41P...` (current), but the served body is `Cache-Control: public,max-age=31536000,immutable`, `X-Vercel-Cache: HIT`, `Age ~25h`, `Last-Modified Tue 26 May 18:12`, and **all 23 of its internal `@font-face url()` refs carry the stale `dpl_3yWVHo...`**. The `?dpl=` query param does **not** vary the CDN cache key for immutable assets.

So: a byte-stable CSS chunk keeps the same hashed filename across deploys → Vercel's CDN serves the first-written immutable cached body (with the old deployment's dpl baked into its `url()`s) → meanwhile the freshly-rendered (private, no-cache) HTML + preload `Link` header carry the current dpl. Hence two tokens on one page.

### Why it is benign (decisive evidence)
The feared 404 essentially **cannot occur**. The font asset is content-addressed by its hashed path; the `?dpl=` is only a skew hint. Verified live, same `6c177e25b87fd9cd-s.woff2`:
```
?dpl=dpl_3yWVHo... (stale)   → HTTP 200
?dpl=dpl_Au41P...  (current) → HTTP 200
(no dpl query at all)        → HTTP 200
```
The path resolves regardless of the query param **or its absence**, because the same content-hashed font file exists under the same path in the current deployment (and every deployment that didn't change the font subset). A 404 would require BOTH (a) the font's content hash to change between deploys AND (b) the old deployment to be pruned — and even then the current deployment serves the new-hash path that the *current* CSS references. Worst realistic case: a client running on a long-cached stale CSS after a font-subset change + skew-window elapse → `@font-face url()` 404 → browser falls through to the next `src` / system font (cosmetic FOUT), never a functional break.

It also **self-heals**: any future deploy that changes CSS content rotates the chunk hash → fresh immutable object → fresh dpl url()s.

### Why there is no app-code fix
We control neither the `?dpl=` suffixing (Vercel Skew Protection) nor the CSS-chunk hashing-before-deploymentId (core Next.js build behavior). The hypothesized "fix the cache-key/emit step so all asset URLs use the current deployment" has no app-side lever: forcing per-deploy chunk-hash rotation would defeat immutable caching (anti-pattern), and Skew Protection is the platform's intended mechanism for exactly this cross-deploy reference scenario (it keeps prior assets resolvable).

### Daniel-side lever (optional)
If absolute belt-and-braces is wanted, **extend the Vercel Skew Protection retention window** (project setting; default ~12h, up to 7d / longer on Pro) to widen the margin during which any stale-dpl reference stays guaranteed-resolvable. Given the 404 is already near-impossible for content-stable fonts, this is low-value; noted for completeness.

---

## Gates
- `npx tsc --noEmit` — exit 0 (no source files changed; docs-only ship).
- `next build` — N/A: zero `src/**` / config changes, so the build surface is unaffected (the live build at `b38c5f8276` IS the gate evidence above). Re-runnable on request.
- Deployed-surface evidence: all curl probes above were run against live prod `https://www.centralreform.live` at deployment `dpl_Au41P6u3gGP1TXKaoL3CLbmPA7Cb`.

## Bottom line
- **F-003:** Vercel cold-start capacity 503, transient + self-healing; no app short-circuit (proxy.ts emits no 503, verifyRoleCookie guarded); graceful client fallbacks already shipped; optional warm-function lever is Daniel-side.
- **F-004:** Vercel Skew Protection + immutable CSS-chunk caching; benign (content-addressed fonts resolve with any/no dpl; cosmetic-only worst case; self-heals); no app-code lever; optional skew-retention lever is Daniel-side.
