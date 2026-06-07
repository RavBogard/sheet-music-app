# VERIFY-1 — `list_setlists` date filter returns `[]` (cowork finding #1)

**Tier-0 READ-ONLY. VERIFY-FIRST — do NOT blind-fix.** Safe to run during the
service window (read-only, zero writes, zero commits).

## The report (cowork session 2026-05-22)
`list_setlists` with a date window (under `sort:recent_event`) returned `[]` even
though a setlist with an in-range `eventDate` existed → the agent wrongly concluded
the setlist didn't exist. High urgency: agents keep drawing this false conclusion.

## Auditor's pre-read of current master (your starting point, confirm or break it)
`src/lib/mcp/tools/setlists.ts` date filter uses `isoOf(eventDate) ?? isoOf(date)`
and passes when `from ≤ t ≤ to` **independent of `sort`** → the "filter keyed on
write-timestamp under recent_event" hypothesis looks CONTRADICTED on master, and
the reported window's math passes (eventDate `05-22T12:00Z` ∈ [05-22, 05-23]). So
**master already looks correct.** Likely real cause: (a) the cowork session hit an
EARLIER deployed build (master churned heavily 5/22), or (b) an `eventDate`
field-shape mismatch on that SPECIFIC prod doc (Firestore silently drops docs with
missing/oddly-typed `eventDate` on `.orderBy('eventDate')` in
`getAllSetlists({orderBy:'eventDate'})`).

## What to do
1. Read `src/lib/mcp/tools/setlists.ts` (the `list_setlists` handler + date filter)
   and the fetch layer `getAllSetlists`/the `.orderBy('eventDate')` path on current
   `origin/master`. Confirm the filter logic + whether `sort` affects inclusion.
2. **Repro against the REAL prod data (READ-ONLY):** via Firebase MCP / read-only,
   inspect the actual setlist docs around the reported window — check each
   `eventDate` field's PRESENCE + TYPE (Firestore Timestamp vs string vs missing)
   and whether the `.orderBy('eventDate')` query would silently drop any. Identify
   the specific doc(s) the session was looking for and why they did/didn't return.
3. Classify the outcome: **(a) non-repro on master** (stale-build artifact → close,
   no code fix), **(b) real field-shape data issue** (→ propose a data-heal +/or a
   defensive query that doesn't drop odd-typed eventDate rows), or **(c) a real
   filter/sort bug** (→ pin the exact line + propose the fix shape).

## Deliverable
`.paul/research/cowork-fixes/VERIFY-1-FINDINGS.md`: the verdict (a/b/c) with
evidence (filter logic file:line + the real prod doc field values), and IF a fix is
warranted, the proposed shape (described, not coded — code lanes are post-service).

Analyze via a fresh worktree off `origin/master` (canonical cwd is a stale WIP
branch). SHIP-NOTICE (Tier-0) → `inbox/supervisor.md`.
