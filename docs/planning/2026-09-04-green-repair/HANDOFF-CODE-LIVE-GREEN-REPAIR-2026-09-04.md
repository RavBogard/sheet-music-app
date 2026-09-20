# ORDER → `live` (Code): repair the red baseline, five files, one cause each — and leave the nineteenth test RED

Lane: **live-cw (Opus Cowork)** · Executor: **`live`**, host-side in `~/CentralReform.live` (rule 8 addendum)
Authority: **R-0904-live-cw-17** (the repair order: cheapest-and-least-designed first; class 2 is OUT of this
order; success is 19 → 1) · **R-0904-live-cw-18** (scope to a landmark, do not widen a matcher; and add the
test that would notice the hero's disappearance) · **R-0904-live-cw-19** (a re-derived expectation keeps one
invariant that could still FAIL, stated per test) · **R-0904-live-cw-20** (the class-2 row and its test are
untouchable; the value is Daniel's) · **R-0904-live-cw-13** §3 (measured per test; **no test turned green by
deletion**) · **R-0904-live-cw-16** §3 (a suite count is quoted with its line's label) · **R-0903-live-cw-9**
(a guard that can only pass vacuously is retired or made to fire; every guard reports its denominator).
Status: **DISPATCHABLE.**
Verified-against: `cdf1c37386` [inherited: your 14:3xZ row — promoted 2026-09-04T09:20:07, read off
`/api/version`]. Every source line cited below was **re-measured at the working tree at 14:2xZ–14:3xZ by this
desk** (`-12` §3: a cited line is re-measured at the HEAD it will be executed at, never copied forward).
**Re-verify by content before the first edit** — and if any cited line has moved, say so in the return and
use what you measure, not what I wrote.
Tier: LIGHT — test files, plus **two `data-testid` attributes** in one component. **No behaviour changes.
NO DEPLOY in this order. No catalog row changes state. No workflow file and no repository setting is touched.**

NEXT: R1 → R2 → R3 → R4 → per-test measurement → STOP. **Do not deploy. Do not open the gate question.**

- [ ] **R1 · `src/lib/mcp/tools/__tests__/library.test.ts`** — 2 tests, flip to E1's `"unknown"`.
- [ ] **R2 · `src/lib/__tests__/sync-engine-songs-mirror.test.ts`** — 3 tests; **S5 inverts, S1/S4 get chart-shaped fixtures or you STOP.**
- [ ] **R3 · `.../__tests__/public-view.test.tsx` + `.../__tests__/perform-cls.test.tsx`** — 6 tests, scoped to the listing, **plus ONE NEW test asserting the hero.**
- [ ] **R4 · `src/lib/books/__tests__/lookup.test.ts` + `src/lib/mcp/tools/__tests__/books.test.ts` + `src/lib/books/__tests__/registry.test.ts`** — 7 tests, re-derived, **each with its still-failable invariant stated.**
- [ ] **G1 · the nineteenth test is STILL RED** and still reads the declared-count invariant, untouched.
- [ ] **G2 · no test deleted, renamed, skipped or marked expected-fail; the skipped count did not rise; the Tests total did not fall.**
- [ ] **G3 · every repaired file run ALONE as well as in the suite**, counts reported both ways, before and after.
- [ ] **G4 · `tsc --noEmit` clean**, and `next build` green (R3 edits a component).
- [ ] **G5 · the unit suite's own two lines quoted verbatim with their labels**, before and after.
- [ ] **Return** `RETURN-CODE-LIVE-GREEN-REPAIR-2026-09-04.md` + a CLOSED board row.

---

## Why this order exists, and what it deliberately is not

Your GREEN-BASELINE wave did the thing that made this possible: it measured 19 failing tests, traced them to
**five** deliberate app changes, and **repaired nothing**. `R-0904-live-cw-13` ordered the measure-then-repair
split; this is the second half.

**Two things this order is not.** It is not a green-suite order — `R-0904-live-cw-17` §3 makes **18 of 19**
the success criterion, and the nineteenth staying red is a **pass**, not a shortfall. And it is not the gate:
`R-0904-live-cw-21` rules how a promotion should be gated and reserves the switch to Daniel, so nothing here
goes near `.github/workflows/**`, `vercel.json`, or branch protection.

**The failure mode to fear is not a missed repair; it is a repair that improves the number.** Four of the five
blocks could be "fixed" in ten minutes by making the assertions weaker, and the suite would read green while
testing less than it does today. Every guard below exists for that.

---

## R1 · `library.test.ts` — two expectations flipped to a ruling this desk already made

Rows 18–19: both assert `"score"` where `chartFormatClass` now answers `"unknown"`.

```bash
sed -n '72,75p' src/lib/mcp/tools/library.ts
```

Observed at the mount, 2026-09-04 14:3xZ, working tree at `cdf1c37386`: line 72 is
`export function chartFormatClass(mime: string | null | undefined): string {`, line 73 the comment
`// E1 (R-0904-live-cw-3): an unknown class is not a matching class.`, and **line 74 is
`if (!m) return "unknown"`.** The ruling is named in the source.

**Do:** flip the two expectations to `"unknown"`, and in each test's body or title record *why* — a mime-less
row groups with nothing. **Safe:** 0 of 892 catalog rows carry an empty `mimeType`, which you measured
yourself last wave, so no caller is behind this.

**Do not:** delete either test. They are the only assertions that E1 holds at the boundary.

---

## R2 · `sync-engine-songs-mirror.test.ts` — S5 inverts; S1 and S4 are a trap

Rows 1–3. The cause is the v11.5-04-02 ingestion filter:

```bash
sed -n '140,150p' src/lib/sync-engine.ts
```

Observed at the mount, 2026-09-04 14:3xZ, working tree at `cdf1c37386`: the comment at `:140`–`:145` ends *"Folders were previously written
to library_index too — now excluded here uniformly"*; the filter is
`const ingestFiles = allFiles.filter((f) => !isNonChartArtifactShape({ name: f.name, mimeType: f.mimeType }))`
at **`:146`–`:148`**; and **`stats.skippedNonChart = allFiles.length - ingestFiles.length` is at `:149`** — so
the counter B4 proposed asserting genuinely exists.

**S5 only** — titled *"non-chart MIME types ARE mirrored — no MIME filter"* — inverts: it asserts the drop and
`stats.skippedNonChart`, and its **title changes to say what it now tests.** A test whose name promises the
opposite of its assertion is worse than a red one.

**S1 (Drive shortcut mirrors) and S4 (empty name, library still writes) are `R-0904-live-cw-17` §2.** They are
failing as write-count zeros because their fixtures are non-chart shapes dropped before the behaviour each one
is named for is ever reached. **Give them chart-shaped fixtures so the shortcut / empty-name mirror is actually
exercised.** If a shortcut or an empty-name row cannot be made chart-shaped enough to reach the mirror, then
this order cannot repair that test: **STOP, leave it red, and return which one and why.** Asserting 0 writes
for a test titled for the mirror deletes a behaviour and reports it as a repair.

The four scenarios in that file which assert writes for a PDF and for an existing row **pass today** — writes
happen; only the non-chart contract inverted. Keep them green and say so.

---

## R3 · the F1 hero — scope to the listing, and add the test nobody wrote

Rows 4–9, six tests across two files, **one cause.** Measured at the mount, 2026-09-04 14:2xZ:

```bash
grep -n "upcoming.length > 0 && (() =>\|Go to next service\|<section\|MAX_PUBLIC_SERVICES = " \
  src/components/performance/PublicSetlistListing.tsx src/components/performance/public-setlist-order.ts
```

Observed at the mount, 2026-09-04 14:2xZ, working tree at `cdf1c37386`: the hero opens at **`PublicSetlistListing.tsx:261`** (`{upcoming.length > 0 && (() => {`), its
`<Link>` at **`:267`** carries **`aria-label={\`Go to next service: ${next.name}\`}`**, its title `<h2>` is at
**`:278`**; the two lists are `<section>` elements at **`:298`** (heading `Upcoming` at `:300`) and **`:308`**;
and **`MAX_PUBLIC_SERVICES = 5` at `public-setlist-order.ts:13`**, applied at `:90`–`:92`. **The cap did not
move. The hero is the sixth `<a>`, and the soonest service is in the DOM twice.**

**Do, per `R-0904-live-cw-18` §2 — scope, do not widen.** Add
**`data-testid="upcoming-list"` to `:298` and `data-testid="past-list"` to `:308`** — two attributes, no
behaviour, and it is this file's own convention (`data-testid="signin-reserve"` already at `:225`, observed at
the mount). Then wrap every service-title query in the six tests with `within(...)` on the right section, and
make the cap assertion count links **inside the upcoming section**. Second choice only if a snapshot objects:
`getByText("Upcoming").closest("section")` — worse, because the past section's heading is
`label(org, 'pastSection')` and therefore org-dependent.

**Refused as the primary route:** `getAllByText(...)` with an expected count of 2. It writes the hero's current
render-site count into six unrelated tests, and the next time the hero moves all six break again — which is how
this baseline was built.

**And the thing the baseline did not find, which you must add (`-18` §3).** I went looking for a test that
asserts the hero renders and **there is none in the tree:**

```bash
grep -rl "Go to next service" src --include=*.test.ts --include=*.test.tsx
```

Observed at the mount, 2026-09-04 14:3xZ, working tree at `cdf1c37386`: **one file, `src/components/performance/__tests__/public-setlist-order.test.ts`**,
and its only F1 reference is `:52`, a `describe` over the pure selector `firstUpcomingSetlist` — **not the DOM.**
`src/app/perform/__tests__/page.test.tsx:144` caps the SSR **prop**, not the markup. So today, if these six are
repaired and the hero is later deleted, **all six go green and F1 disappears in silence.**

**Add ONE test** (in `public-view.test.tsx`) asserting the hero by its accessible name — `Go to next service:
<soonest upcoming>` — and that the soonest service's title appears **twice** in the document, once in the hero
and once in the list. Six tests may only stop caring about a node in the same wave one test starts caring
about it. This raises the Tests total by one; that is expected and it is the only increase this order makes.

**Do not:** change `MAX_PUBLIC_SERVICES`, touch `public-setlist-order.ts`'s logic, or alter the hero's markup
beyond the two `data-testid` attributes on the two sibling `<section>`s. `page.test.tsx:144` passes today —
keep it passing and report it.

---

## R4 · the three book files — re-derive, and state what could still fail

Rows 10–13 and 15–17, seven tests pinning literal folios, unit counts and match totals against a feed
**generated** from the Typst build.

**Named in full (`R-0904-live-cw-10`), because this tree has two of them:** the file in scope is
**`src/lib/books/__tests__/registry.test.ts`**. There is a second, green, out-of-scope
`src/lib/org/__tests__/registry.test.ts` — observed at the mount, 2026-09-04 14:2xZ, by
`find . -name registry.test.ts -not -path ./node_modules/*`, which returns both. **Do not touch the `org` one.**

**Do, per `R-0904-live-cw-19`:** re-derive each expectation from the registry the test already imports, or
state it as a relationship. **Do not re-baseline the literals** — these three files have re-broken on every
feed regeneration and a fresh set of numbers is a promise to break again the next time `corpus` rebuilds a book.

**And the guard that makes this a repair rather than a surrender (`-19` §2, `R-0903-live-cw-9`):** a test that
derives its expectation from the same source the code reads can only pass. **Each of the seven keeps at least
one assertion the current data could still violate** — folios strictly ascending, the returned length,
`folio <= entry.pages`, non-empty results, the stop-and-ask firing on genuinely disagreeing folios — **and the
return states, per test, in one line, what would still make it fail.** A re-derived test you cannot answer that
for is reported, not shipped.

**`registry.test.ts:175` is the model and it is OFF LIMITS (`R-0904-live-cw-20` §3).** It is a relationship, it
derives both sides from the data, and **it is the one test in this whole baseline that caught a real defect.**
It may not be touched, re-scoped, softened, skipped or "fixed". It stays red. Seven stale literals found nothing
in three months; that one invariant found the thing — which is the entire argument for this section.

---

## Guards

**G1 · the nineteenth is still red.** After R1–R4, `src/lib/books/__tests__/registry.test.ts:175` still fails
and still asserts a unit's folio against its book's declared page count. Quote its failure line in the return.
**A green suite here is a FAILED order** (`R-0904-live-cw-17` §3, `-20` §3).

**G2 · nothing turned green by deletion.** Report, as counts you observed: test files deleted **0**, tests
deleted **0**, tests renamed **0** (S5's title change excepted and named), `.skip` / `.only` / `.todo` /
`it.fails` / `describe.skip` added **0**. **The skipped count must not rise** above the baseline's, and the
**Tests total must not fall below 4,087** — R3 adds one, so expect 4,088.

**G3 · measured per test, alone and in the suite** (`-13` §3). For each of the five blocks: the file run on its
own before and after, and the whole suite before and after. Eighteen named tests move red → green. Any test that
was green and is now red is a STOP.

**G4 · `tsc --noEmit` clean, and `next build` green** — R3 edits a component, so the build must be exercised even
though **this order does not deploy.**

**G5 · quote the suite's own two lines verbatim, with their labels** (`-16` §3): the **Test Files** line and the
**Tests** line, before and after. No arithmetic across the two.

**G6 · zero catalog writes.** No tool in this order writes a row. If any step appears to require one, that is a
defect in this order: **STOP and return it.**

---

## What this order does NOT touch

`.github/workflows/**`, `vercel.json`, branch protection, any repository setting — **the gate is
`R-0904-live-cw-21` and it is Daniel's.** `src/data/books/*.json` — **the class-2 value is `-20` §4 and it needs
a printed page.** `src/lib/org/__tests__/registry.test.ts`. `MAX_PUBLIC_SERVICES` and
`public-setlist-order.ts`'s logic. `ERROR_CODE_MAP` and the 100 unmapped codes (`-22`). The 38 unreachable-byte
rows. The 16 bonded non-active rows. The seven pairs — **no mark on any of them.** `moments.json` / L3.
**No deploy.**

## Return

`RETURN-CODE-LIVE-GREEN-REPAIR-2026-09-04.md`, plus a CLOSED board row. Report per test, not per file. If a
block cannot be repaired within its ruling, **leave it red and say which ruling stopped you** — a red test with
a reason is worth more to this family than a green one without.

*Claude records; Daniel decides.*
