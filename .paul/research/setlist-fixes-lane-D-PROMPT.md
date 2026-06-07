# Lane D — Token-match library search (find songs by name variants / partial queries)

**Wave:** setlist-fixes (from Shavuot-Yizkor live-session bug report, 2026-05-20)
**Risk tier:** 1 (standard — changes high-traffic search match semantics; strong regression discipline)
**Base SHA:** `a5fcc3132` (verify against `.coord/shared/master-tip.md`)
**Lane id:** `setlist-fixes-d-token-search`
**Est:** ~2–3 hr

Closes **Bug 3** — Daniel-ratified approach is **per-token AND-match** (NOT Levenshtein /
phonetic fuzz). This is the deliberately-narrow first step on the cycle-10 fuzzy-search item.

---

## Why

Searches that should obviously hit returned 0 results:
- `Eitz chayim Weisberg` → 0, actual entry "Eitz chayim - Weisenberg.pdf".
- Multi-word queries fail because matching is a **contiguous substring** test.

`searchLibrary` (`library.ts:278`) normalizes query + title (NFKD diacritic-fold + lowercase
+ collapse `[_\s\-]` → space, `normalizeForSearch` at `:269-276`) then does
`normalizeForSearch(s.title).includes(q)` at **`:297`**. So the WHOLE query must appear as one
contiguous run. "eitz chayim weisberg" is not a substring of "eitz chayim weisenberg" and the
tokens are never matched independently.

## The ratified approach: per-token AND-match (and ONLY that)

- Split the normalized query into whitespace tokens. A row matches when **every** query
  token appears as a substring somewhere in the normalized title. So "eitz chayim weisberg"
  → tokens `[eitz, chayim, weisberg]`; the row "eitz chayim weisenberg" matches on `eitz` +
  `chayim` but NOT `weisberg` (one letter off).
  - That last gap ("weisberg" vs "weisenberg") is a **typo**, and Daniel explicitly chose
    token-match FIRST, Levenshtein NOT YET. So this query still misses on the typo — that's
    expected and acceptable for this lane. What token-match DOES fix: dropped/extra words,
    word-order, and "title + composer" queries where each token is spelled correctly
    (e.g. "weisenberg eitz chayim" now finds "Eitz chayim - Weisenberg").
  - Keep single-token queries behaving exactly as today (a single token's substring test ==
    the old `.includes`), so this is a strict superset — nothing that matched before stops
    matching.

## Scope (verified targets) — `src/lib/mcp/tools/library.ts`

- Replace the line **`:297`** predicate `if (q && !normalizeForSearch(s.title).includes(q))
  return false` with a per-token AND-match over `normalizeForSearch(s.title)`. Tokenize the
  already-normalized `q` (it's normalized at `:283`). Empty query still returns all (current
  behavior). Add a short comment explaining the token-AND semantics.
- Leave ranking (`rankBias`, contextHint boost, `compareRanked`) untouched — only the
  FILTER predicate changes.

## CRITICAL — do NOT touch dedup
- The dedup grouping path uses a DIFFERENT normalization (`normalizedName`, NFKD + strip ALL
  non-alphanumerics, `library.ts:~628-760` / `:680`). Memory flagged that loosening match
  "hits dedup too" — that risk is for phonetic/Levenshtein applied to dedup grouping. **Your
  token-AND change is in `searchLibrary`'s filter ONLY and must NOT alter `normalizedName`,
  `groupByNormalizedName`, `dedupeLibraryIndex`, or the dedup threshold (0.85).** Confirm in
  your SHIP-NOTICE that dedup grouping behavior is byte-identical (run the dedupe emulator
  tests and show they're unchanged).

## Optional (reduces shared-file contention — SKIP unless trivial)
- You MAY update the `search_library` tool DESCRIPTION in `index.ts` (~line 273, in
  `registerReadTools`) to mention token matching. If you do, you join the `index.ts`
  cherry-pick coordination with Lanes A+B (claim it `(worktree-isolated; ship-order coord
  only)`, HEADS-UP them). **Recommended: skip it** — keep this lane's footprint to
  `library.ts` so you have zero cross-lane file overlap and can ship independently.

## Out of scope / hard rules
- Do NOT touch `bridge/**`, repo-root `mcp/`, `SetlistGrid.tsx`, `errors.ts`,
  `error-envelopes.ts`.
- Do NOT add Levenshtein, phonetic matching, or any fuzzy distance — that's a future lane
  pending Daniel's deeper tradeoff call. Token-AND only.
- Stay out of `clone-setlist.ts`, `setlist-write.ts`, `liturgical-templates.ts`.

## Tests + ship
- Unit/emulator tests for: multi-token query finds a row where tokens are non-contiguous
  ("weisenberg eitz chayim" → "Eitz chayim - Weisenberg"); single-token query unchanged;
  a query with a token absent from the title does NOT match; empty query returns all;
  diacritic + underscore behavior preserved. PLUS a dedup-unchanged regression assertion.
- Gates: `npm run test` (0 fail), `npm run test:emulator` (0 fail),
  `next build --webpack` `SKIP_ENV_VALIDATION=1` (exit 0).
- Push `feat/setlist-fixes-d-token-search:master`, OVERWRITE `master-tip.md`, SHIP-NOTICE to
  `.coord/inbox/auditor.md` + copy to `supervisor.md`. If you kept to `library.ts` only,
  cherry-pick onto fresh origin/master per the narrow-lane caveat (no index.ts claim needed).

## Deployed-surface REPRO (required in SHIP-NOTICE)
Against prod `/api/mcp` with your bearer: `search_library({query:"weisenberg eitz chayim"})`
returns the "Eitz chayim - Weisenberg" row (was 0 before); a single-word search you know
worked before still works; and a nonsense multi-token query returns nothing. Paste results.
