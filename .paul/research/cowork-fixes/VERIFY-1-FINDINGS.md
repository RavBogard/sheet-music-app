# VERIFY-1 FINDINGS — `list_setlists` date filter returns `[]`

**Lane:** VERIFY-1 (cowork finding #1) · **Tier-0 READ-ONLY** · coder-4 · 2026-05-23
**Analyzed against:** `origin/master` @ `e9b900caa` (source via `git show`; cwd is on stale WIP branch `fix/b1-error-envelope-sweep`).
**Prod probe:** Firebase MCP, READ-ONLY, project `crcmusiccharts`, `(default)` db.

---

## VERDICT: (c) REAL BUG — reproduces on current master. Triggered by (b) data field-shape inconsistency.

NOT (a) non-repro/stale-build. The auditor's pre-read was correct that the **in-memory `from`/`to` filter is fine** — but the bug is one layer up, in the **fetch query** (`getAllSetlists`). The target doc is silently dropped *before* the filter ever sees it.

The exact reported repro reproduces on master @ `e9b900caa`, and the contrasting "works under `recent_write`" behavior is also explained — both confirmed against real prod docs.

---

## Root cause

`eventDate` is stored with **mixed Firestore types** across the `setlists` collection:
- **Newer setlists** store `eventDate` as a Firestore **Timestamp** (incl. the two the agent was looking for).
- **Older / cloned / legacy setlists** store `eventDate` as a **String** (ISO text).
- **Templates** have **no `eventDate` field at all**.

Firestore's canonical cross-type sort order ranks **Timestamp < String**. So under `.orderBy('eventDate', 'desc')` the result is:

```
[ all String-typed eventDates, desc ] , then [ all Timestamp-typed eventDates, desc ]
```

There are ≥10 string-typed eventDate docs, so a `limit:10` fetch returns **only string-typed docs** (May 13 → March). The timestamp-typed docs — **including Kabbalat Shabbat May 22 and Shavuot Yizkor May 23** — sort *after all strings* and fall outside the `limit` window. They are never fetched, so the in-memory `from`/`to` filter cannot include them → `[]`.

### Code path (origin/master @ e9b900caa)

`src/lib/mcp/tools/setlists.ts` — `listSetlists()`:
- L92  `const fetchSize = Math.min(offset + limit, MAX_SETLIST_FETCH)`  ← `limit:10` → fetchSize 10
- L94  `const orderBy = args.sort === "recent_event" ? "eventDate" : "date"`
- L95  `const all = await getAllSetlists({ limit: fetchSize, orderBy })`  ← **fetch is limited & ordered BEFORE filtering**
- L99-108 the `from`/`to` filter — correct in isolation; `serializeSetlist` makes `eventDate` an ISO string so `isoOf` works; undated rows pass. **Not the bug.**

`src/lib/server-setlists.ts` — `getAllSetlists()`:
- L91-94 `db.collection("setlists").orderBy(orderBy, "desc").limit(limit).get()`  ← **the mixed-type `orderBy('eventDate')` + `limit` is where target docs vanish.**

---

## Evidence (real prod docs, raw Firestore types via field mask)

Query mirroring the failing fetch — `setlists` `orderBy eventDate DESC limit 10` — returned **May 13 at top, descending to ~March 29; May 22 & May 23 ABSENT** despite being later dates.

Raw types (from `firestore.list_documents` with field mask — exposes stored type):

| Setlist | `eventDate` stored type | value |
|---|---|---|
| **Kabbalat Shabbat — May 22, 2026** (the "missing" one) | **timestampValue** | `2026-05-22T12:00:00Z` |
| **Shavuot Yizkor — May 23** | **timestampValue** | `2026-05-23T10:00:00Z` |
| Bar Mitzvah — Chase — May 16 | timestampValue | `2026-05-16T12:00:00Z` |
| 5/15 -- Shir Shabbat | timestampValue | `2026-05-15T19:53:47.014Z` |
| Passover — April 3 | timestampValue | `2026-04-03T18:00:00Z` |
| Behar-Bechukotai — March 28 (×2) | timestampValue | `2026-03-28T18:00:00Z` |
| Shir Shabbat — May 13 | **stringValue** | `2026-05-13T19:53:47.014Z` |
| Mother's Day | **stringValue** | `2026-05-10T05:00:00.000Z` |
| Bnei Mitzvah Morning | stringValue | `2026-05-09T05:00:00.000Z` |
| Confirmation Shabbat | stringValue | `2026-05-08T05:00:00.000Z` |
| Achrei Mot-Kedoshim — April 25 | stringValue | `2026-04-25T12:00:00.000-06:00` |
| Seui / April 18 / April 11 / April 4 / Mar 27 / Mar 21 / Mar 14 / Feb 28 … | stringValue | `…-06:00` offset ISO strings |
| Bnei Mitzvah Morning (Template) ×3, Friday Night Mar 8 ×3 | **(field absent)** | — |

### Exact repro of the report

1. **Failing path:** `list_setlists({ sort:'recent_event', from:'2026-05-22', to:'2026-05-23', limit:10 })`
   → `getAllSetlists({ orderBy:'eventDate', limit:10 })` returns the 10 most-recent **string-typed** eventDates (all ≤ May 13). None fall in `[2026-05-22, 2026-05-23]`. Timestamp-typed May 22/23 were never fetched. → **`[]`** ✓ matches report.

2. **Working path:** `list_setlists({ sort:'recent_write', limit:20 })`
   → `getAllSetlists({ orderBy:'date', limit:20 })`. `date` is timestamp-typed on nearly all docs **except one string outlier** ("Eitan Shabbat Morning 2/21", `date:{stringValue}`), which sorts first under DESC. Kabbalat Shabbat May 22 (`date` 2026-05-21, most-recent timestamp) sorts **2nd**. → returned **as the second row** ✓ exactly matches the report's "returned it as the second row."

The "Eitan" string-`date` outlier landing at row 1 is an independent confirmation that the same mixed-type mechanism governs both fields.

---

## Scope of the data inconsistency

In a 30-doc sample (most-recent by `date`): ~7 docs have **Timestamp** `eventDate`, ~17 have **String** `eventDate`, ~6 (templates) have **none**. So the bug fires for ANY `recent_event` date-window query whose target is timestamp-typed while ≥`limit` string-typed docs exist (the common case going forward, since new writes appear to produce Timestamps).

---

## Related latent bug (out of VERIFY-1 scope — flagging as follow-up)

`getUpcomingSetlists()` (`src/lib/server-setlists.ts` L21-23) does:
```ts
.where("eventDate", ">=", now).orderBy("eventDate", "asc").limit(5)
```
A Firestore range filter `>= <Timestamp>` only matches **Timestamp-typed** fields; **string-typed `eventDate` docs are excluded entirely** from "upcoming" results (and missing-field docs too). Any SSR/"upcoming services" surface built on this silently omits string-typed setlists. Same mixed-type root cause; worth folding into the same heal.

---

## Proposed fix shape (described, not coded — code lanes are POST-service)

Two complementary fixes; recommend **both** (heal removes the root cause; defensive query removes the whole class):

### 1. PRIMARY — heal `eventDate` (and the one stray `date`) to a consistent **Timestamp** type  *(Tier-2 PROD DATA WRITE)*
- One-shot MCP/script: for every setlist whose `eventDate` is a string, parse it (`Date(...)` — the offset forms like `…-06:00` parse to the correct instant) and rewrite as a Firestore Timestamp; do the same for the lone string `date` outlier. Leave template docs (no eventDate) as-is.
- Mirrors `date`, which is already Timestamp on nearly all docs, and aligns with the dashboard / `public-setlist-order` ordering logic.
- **Single named owner, `dryRun` first, post-service** (mass write — same discipline as `mimetype-backfill-heal`). Idempotent: re-running on already-Timestamp rows is a no-op.
- Also fixes the `getUpcomingSetlists` `.where('eventDate','>=')` latent bug above.

### 2. DEFENSIVE — decouple the date-window selection from the mixed-type `orderBy('eventDate')` in `listSetlists`
- When `from`/`to` (or `recent_event`) are in play, **fetch by the type-consistent `date` field up to `MAX_SETLIST_FETCH` (200)**, then **sort + filter by `eventDate` in memory**, then slice for paging. At <50 setlists this is cheap and robust against any future type drift.
- Side benefit: also fixes a second latent ordering bug — currently `limit` is applied to the fetch *before* the date filter, so `list_setlists({from,to,limit:N})` only searches within the N most-recent docs even when types are clean. Filtering before slicing removes that.

Either fix alone resolves the reported repro; #1 is the root-cause cleanup, #2 hardens the read path. Defensive #2 is `src/`-only (no data write) and could ship first if a fast in-service-safe code lane is wanted, with the heal #1 to follow post-service.

---

## Cross-refs
- TRIAGE `.coord/TRIAGE-cowork-2026-05-22.md` §B item #1
- Source finding `.paul/research/cowork-session-findings-2026-05-22.md` #1 (+ workaround #10)
- Related shipped: `library-dedupe-arrangements-fix` / `public-setlist-ordering-fix` (both date/ordering-adjacent display bugs).
- [[project_track_mimetype_gotcha]]-style asymmetry, but for setlist `eventDate` type (string vs Timestamp by write path).
