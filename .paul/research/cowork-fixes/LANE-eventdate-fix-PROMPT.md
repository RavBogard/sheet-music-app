# LANE — eventDate type-consistency fix (cowork #1 follow-through) — coder-2

**Tier 2. Ships the src fix to prod tonight (full-send). The data HEAL is a script
that runs post-service (Daniel, dryRun-first).** Read the root cause first:
`.paul/research/cowork-fixes/VERIFY-1-FINDINGS.md` (coder-4's verified diagnosis).

## Root cause (verified, reproduces on master @ e9b900caa)
`eventDate` is stored with **MIXED Firestore types** (newer setlists = Timestamp,
older/cloned = String, templates = none). Firestore sorts Timestamp < String, so
`getAllSetlists({orderBy:'eventDate'})` → `.orderBy('eventDate','desc')`
(`src/lib/server-setlists.ts` ~L91-94) puts ALL string-typed above ALL
timestamp-typed; with `limit:10` the fetch returns only string-typed rows and the
real targets (Kabbalat Shabbat, Shavuot — Timestamp-typed) **drop at the FETCH layer
BEFORE the in-memory filter** (`src/lib/mcp/tools/setlists.ts` ~L99-108). That's why
`list_setlists` returned `[]` and agents concluded setlists don't exist. There's also
a **latent `getUpcomingSetlists` `.where('eventDate','>=')` bug** (a `>=` range query
on mixed types misbehaves the same way).

## Part A — DEFENSIVE src fix (ships now)
Make the fetch robust to mixed `eventDate` types so nothing drops:
- In `getAllSetlists` (server-setlists.ts): fetch by a **consistent field** (the
  `date` field is more uniformly present) to a safe MAX, then **sort + filter
  `eventDate` in-memory** — which also fixes the **limit-before-filter** ordering bug.
  Confirm against VERIFY-1-FINDINGS' exact line refs.
- Audit `getUpcomingSetlists` for the same `.where('eventDate','>=')` mixed-type
  hazard and make it type-robust too.
- Verify `list_setlists`/`recent_event`/the authed dashboard fetch still return the
  right rows. Regression test: a mixed-type corpus (Timestamp + String + missing
  eventDate) where the in-window timestamp-typed setlist is NOT dropped under `limit`.

## Part B — eventDate→Timestamp HEAL (build now, RUN post-service)
Build `scripts/heal-eventdate-types.mjs` (NOT an MCP tool → avoids the `index.ts` that
coder-5/6 are editing): normalize every setlist's `eventDate` to a Firestore Timestamp
(parse the existing String/`date`). **`--dry-run` DEFAULT** ([[feedback_dryrun_is_observability]]):
prints the full per-doc before/after + count, writes nothing. Idempotent. ★ The actual
prod RUN is **Daniel's single-owner, dryRun-first** step **post-Saturday-AM service**
([[feedback_single_owner_destructive_runs]]) — do NOT run it on prod in this lane.

## Gates + ship
Real `npm ci`: the mixed-type regression test + existing setlist tests · check:types ·
eslint · `next build --webpack` exit 0. Cut FRESH worktree off `origin/master`; claim
`server-setlists.ts` + `setlists.ts` (+ `scripts/heal-eventdate-types.mjs`). **Disjoint
from coder-6** (library.ts) — but if you must touch `index.ts`, coordinate (you
shouldn't need to; the heal is a script). SHIP-NOTICE → inbox/auditor.md (Tier 2).
**Action required:** ACK in inbox/supervisor.md (`from coder-2`), then build.
