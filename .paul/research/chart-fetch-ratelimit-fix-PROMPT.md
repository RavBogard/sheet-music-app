# Chart-fetch rate-limit: dedicated high tier for the NATed iPad fleet (coder-4, Tier 2)

**Dispatched by:** supervisor 2026-05-22 · **Source:** R2 launch finding (coder-4 exec) +
Daniel go. **LAUNCH-RELEVANT** (6 iPads, Friday service).
**Type:** backend, `src/` only, Tier 2 (ships to PROD). **Worktree:** fresh off origin/master.

## Problem (CONFIRMED)
`src/app/api/drive/file/[fileId]/route.ts:40` gates chart-byte fetches with
`checkRateLimit(ctx.req, 'api')`. The `api` tier is **60 req/min per IP**
(`src/lib/rate-limit.ts` → `limiterConfigs.api = { max: 60, window: 60 }`, keyed by client IP).
The 6 band iPads sit behind ONE synagogue NAT → they SHARE a single 60/min budget. During a
service, 6 iPads each prefetching/opening a ~20-chart setlist (plus retries) blow through 60/min
→ HTTP 429 "Failed to load PDF" mid-service. R2 verified the limit is real.

## The fix
Give the chart-byte route its OWN generous tier instead of the shared `api` tier:
1. In `src/lib/rate-limit.ts` add a `chart` tier to `limiterConfigs` + `limiters`
   (rec **`{ max: 600, window: 60 }`** — chart GETs are public, idempotent, and CDN-cached
   `public, s-maxage=604800`, so a high ceiling is safe; 600/min comfortably covers a 6-iPad
   fleet pre-caching + navigating. Pick & justify the number; keep it a real ceiling, not
   unlimited, so a scraper can't hammer origin.)
2. In the chart route, switch `checkRateLimit(ctx.req, 'api')` → `checkRateLimit(ctx.req, 'chart')`.
   Leave all other routes on their current tiers.
Confirm `checkRateLimit` accepts the new tier name (extend its type/union if it's a keyof the
limiters map). Do NOT change the existing `api/upload/sync/ai/bridgeSetup` limits.

Note: the route is CDN-cached (s-maxage 7d) so most repeat fetches never reach origin; this tier
protects the cold/first-fetch burst when the fleet pre-caches a new setlist. Keep that reasoning
in a code comment.

## Tests (REQUIRED — proof)
- a test in `src/lib/__tests__/` (or wherever rate-limit is tested) asserting the `chart` tier
  exists with the chosen ceiling and that >60 chart fetches in a window from one IP are NOT
  blocked at 60 (use the in-memory limiter path; no Upstash needed in test).
- the chart route still 401-gates non-browser/non-auth as before (unchanged behavior).

## Gates (real `npm ci` — see [[feedback_fresh_worktree_gate_setup]])
- relevant tests GREEN · `check:types` · eslint clean (touched) · `next build --webpack` exit 0

## Ship (Tier 2)
Read `.coord/shared/master-tip.md`; FF onto fresh origin/master; re-run gates; `git push origin master`.
Update master-tip + your agents.md row; SHIP-NOTICE → `.coord/inbox/auditor.md` (Tier 2); HEADS-UP supervisor.
rmdir node_modules junction before teardown.
