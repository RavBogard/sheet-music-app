# RETURN ← `live` (Code): the join ships. **The negative failed first, on its own terms — and the live row that motivated the order is `archived` in `library_index` with NO `status` field in `songs` at all.**

Lane: **live (Code)** · Order: `HANDOFF-CODE-LIVE-STATUS-JOIN-2026-09-05.md` (LIGHT, program wave 7)
Authority: `R-0904-live-cw-34` §1–§4 · rule 18 · `R-0831-guards-2` · `-30` §3(c)
Status: **CLOSED. F1–F3 complete.** One commit, no deploy (none ordered).
HEAD at open: `5430972c66` · HEAD at close: see §6.

---

## 1 · Re-verification at open — every cited line, against my own HEAD

The order asked for this explicitly: `live-cw` read `sheet-music-app/**` off a files-only mount with no `.git`.
Re-measured at `5430972c66`:

| Order's citation | At my HEAD |
|---|---|
| `LibraryW02Fields` `library.ts:311` | **exact** — and it carries no `status` field |
| `loadLibraryW02Map` second pass `:383` | **exact** — `map.set(d.id, {...})` at `:392` |
| `:376` stem pre-pass reads `data.status` and throws it away | **exact** |
| `:536` `if (s.status === "archived")` | **exact** |
| `:541` `if (s.status === "duplicate")` | **exact** |
| `:542` `if (!args.includeOrphaned && s.status === "orphaned")` | **exact** |

§1's characterisation holds in full: the scan is already paid for, `w02Map.get(s.id)` already supplies
`name`/`indexTitle`/`mimeType` **two lines below the status gate**, and the gate simply never asked it.

## 2 · F2 ran BEFORE F1, and the order's NEXT says otherwise — I state the departure

The order's NEXT reads F1 → F2 → F3. §3 requires the negative to fail against **unmodified** `library.ts`
(`R-0831-guards-2`; `-38`'s finding (2)). A red run after the fix proves nothing, so I wrote and ran the test file
first. **Only the moment of execution moved; the deliverable ordering did not.**

**Before F1, against unmodified `library.ts`: `5 failed | 5 passed (10)`.** The five reds were exactly the five
divergence cases, each failing on its own terms rather than at a wait:

- `hides a row archived in library_index while songs still reads active` — returned `["archived-row"]`, expected `[]`
- `hides it when the songs row carries no status at all` — returned `["archived-row"]`, expected `[]`
- `hides a row marked duplicate in library_index while songs reads active` — returned `["dupe-row"]`, expected `[]`
- `hides a row orphaned in library_index while songs reads active` — returned `["orphan-row"]`, expected `[]`
- `SHOWS a row active in library_index whose songs mirror says archived` — returned `[]`, expected `["live-row"]`

The five greens before the fix are the fall-back cases, and **they had to be green before AND after** — they pin the
behaviour F1 must not disturb. **After F1: `12 passed (12)`.** The two extra cases are §5's.

## 3 · F1 — the two sites, and a third the order did not anticipate

**Site 1 — `library.ts:311`, `LibraryW02Fields` gains `status?: string`**, populated in the row loop as
`status: typeof data.status === "string" ? data.status : undefined`, the same shape as `composer`/`arranger`/
`notationSource`. **No `?? "active"`** — an absent value joins as `undefined`, per §1(b).

**Site 2 — the filter predicate.** One binding above the three gates:

```ts
const status = w02Map.get(s.id)?.status ?? s.status
if (status === "archived") return false
if (status === "duplicate") return false
if (!args.includeOrphaned && status === "orphaned") return false
```

**Site 3 — the one the order did not name, and it would have been a regression.** The `.map()` that merges the join
onto the row spreads the whole W-02 object: `const { enrichment, ...rest } = w02; return { ...s, ...rest, ... }`.
Adding `status` to `LibraryW02Fields` therefore put it into `rest` — so the joined value would have **rewritten the
wire's `status`**, and for any `library_index` row carrying no status field it would have spread **`undefined` over a
perfectly good `songs` value**, erasing it. I destructured it out (`const { enrichment, status: _joinedStatus, ...rest }`)
and pinned both halves in test.

**This was a scope call, and I made it on the order's own words rather than handing back** (`R-0904-vision-12` §1 —
and this was not even an instrument stop). §2 says *"This order touches only the status predicate"*; making the wire
`status` authoritative is a change to the output shape, not the predicate. **The alternative I did not take: let the
joined value ride onto the wire.** It is arguably the more correct end state and follows straight from `-34` §1 — but
it changes what every `search_library` caller reads, it is unordered here, and it cannot be taken without also fixing
the `undefined`-erasure. **FOR `live-cw`: this is a real decision, not a detail — see §7(1).**

## 4 · The file, and the two neighbours it must not disturb

New: `src/lib/mcp/tools/__tests__/library-status-join.test.ts`, **12 cases in 3 describes**. Its own file for the
reason `library-search-join.test.ts` gives for being separate from `library.test.ts` — it needs a populated
`library_index`, here with a status that **diverges** from `songs`.

`library-search-join.test.ts` **untouched** (§2 requires it), including its `no-index-row` case. Both neighbours
green: **`3 files, 42 passed`**.

**Fail branch (§3), both directions pinned:** a `library_index` row that exists but carries **no `status` field** is
distinct from **no row at all**. Both fall through to `s.status` — the `??` handles it, and a test proves it rather
than assuming it. **No case failed to fail cleanly, so `-30` §3(c) never came near being tested: no line was added to
`ci/gated-suite-exclusions.txt`, and the debt stays at TWO.**

## 5 · Gated suite — the delta is exactly my own file, nothing else moved

| | Before (desk baseline, `5430972c66`) | After |
|---|---|---|
| Files | `344 passed \| 6 skipped (350)` | **`345 passed \| 6 skipped (351)`** |
| Tests | `3977 passed \| 78 skipped (4055)` | **`3989 passed \| 78 skipped (4067)`** |

**+1 file and +12 tests — my new file and its twelve cases, to the unit.** No other count moved, so no caller of
`searchLibrary` elsewhere in the suite depended on the mirror. `npx tsc --noEmit` exit **0**.

Line endings: `library.ts` and the new test are **pure LF, 0 CRLF**, matching `library-search-join.test.ts` byte-for-byte
in that respect. The `LF will be replaced by CRLF` warning is `core.autocrlf true` doing its ordinary thing for a
`.ts` file; **no mixed endings were introduced** — measured, not assumed.

## 6 · `Tu Bishvat` — read, not assumed, and it is the order's own shape exactly

§4 asked whether `1WNBHOQhMyr8Aokyp1ECGCibyUZr0UnFT` now resolves `archived` through search. **Read both docs
directly:**

- `library_index/1WNBHOQhMyr8Aokyp1ECGCibyUZr0UnFT` → **`status: "archived"`**, `name: "Tu Bishvat.pdf"`,
  `stem: "tu bishvat"`, updated `2026-09-03T20:30:12Z`.
- `songs/1WNBHOQhMyr8Aokyp1ECGCibyUZr0UnFT` → **no `status` field at all.** `orgId: "crc"`, title `Tu Bishvat.pdf`.

**That is `-34` §1(c)'s measured shape, on the live row**: `server-songs.ts:136`'s G-15 default reads the absent field
as `"active"`, and my test case *"hides it when the songs row carries no status at all"* is literally this row.

**The deployed surface still returns it, and I probed rather than inferred.** `search_library {query: "Tu Bishvat"}`
against `https://www.centralreform.live/api/mcp` returns one row — **`"status": "active"`** on the wire, the
fabricated value in the open.

**So the honest answer to §4 is: not yet, and not until a deploy.** The join hides it under test at 12/12; the live
row changes the moment this ships and not before. **No deploy is ordered here and I did not take one.** Stated as its
own line, per §4: **my desk's NEXT does not want a solo deploy for this** — it batches cleanly with whatever rides
next, and the RH guard assertion (`shirei-tshuvah` 184/`feed`) belongs to that wave, not this one.

## 7 · FOR `live-cw`

1. **The wire `status` decision (§3, site 3).** The gate is authoritative; **the wire is still the mirror.** A
   `search_library` caller reading `row.status` today reads G-15's fabrication — as the Tu Bishvat probe shows in
   plain sight. Making it authoritative is one line (drop the destructure) plus the `undefined`-erasure guard, but it
   changes what every caller reads and belongs in a ruling, not in my judgment. **I took the narrow shape and pinned
   it so the change is a deliberate act, not a drift.**
2. **`server-songs.ts:136`'s G-15 default is untouched** (§1 put it out of scope) and is now the only remaining
   fabricator of `"active"` in this path. `-34` §1(b) named it; nothing here repairs it.
3. **`-34` §4's census void is now liftable in code but not in production** — the join exists, the deploy does not.
4. **The divergence class was 2 of 2 (100%) when last measured.** I did not re-take that count — it is
   instrument-dependent and no order asked. `Tu Bishvat` is confirmed still diverged as of this hour.

## 8 · What this return does not claim

No deploy. No ruling minted — `-34` already ruled the join, and I mint no ids. `songs/{id}` was not written.
`ci/gated-suite-exclusions.txt` was not touched under any branch. Waves 4, 5 and 6 are untouched and remain
unordered. The census in `-34` §4 is not re-taken.
