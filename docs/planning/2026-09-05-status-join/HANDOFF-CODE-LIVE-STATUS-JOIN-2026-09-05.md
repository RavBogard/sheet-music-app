# ORDER → `live` (Code): join `library_index.status` into `searchLibrary()`'s filter — the JOIN `-34` ruled, program wave 7

Lane: **live-cw (Opus Cowork)** · **Executor: `live`**, host-side in `~/CentralReform.live`
Authority: **R-0904-live-cw-34** §1 (`library_index.status` is the source of truth, `songs.status` a mirror that
cannot represent "unknown") · §2 (the repair is `searchLibrary()` JOINING `library_index.status`, not a better
mirror) · §3 (Tu Bishvat `1WNBHOQhMyr8Aokyp1ECGCibyUZr0UnFT` stays unrepaired by hand — this join is what corrects
it) · §4 (`search_library` census is void on non-active status until this ships) · rule 18 · `R-0831-guards-2`
(a guard is shown to fail, not promised) · `-30` §3(c) (no line to `ci/gated-suite-exclusions.txt`, ever).
Status: OPEN — dispatchable now, no precondition.
Verified-against: `26f7c6e` [board: `live`'s 2026-09-05 17:4xZ CLOSED row, its own HEAD after LIFE 2 WAVE 1] —
re-verify at open: this desk did not read `sheet-music-app/**`'s `.git` (files-only mount), so the lines below
are read off the working tree at this mount, 2026-09-05, and `live` re-measures against its own HEAD before
writing a byte.
Tier: LIGHT — one file's filter predicate plus the map that already runs beside it, one new test file.
NEXT: F1 (join), then F2 (fail-branch test), then F3 (return). Do not reorder.

---

## 1 · What's measured, precisely

`searchLibrary()` (`sheet-music-app/src/lib/mcp/tools/library.ts:521`) already loads `library_index` once per
call via `loadLibraryW02Map()` (`:351`) and already joins it — `w02Map.get(s.id)` supplies `name`, `indexTitle`,
`mimeType`, `composer`, etc. onto the `songs`-sourced row before the non-chart-artifact filter runs. **The status
gate never reads that map.** Its three status checks are all against `s.status` — the field from `getAllSongs()`,
i.e. `songs/{id}.status` — the mirror `-34` §1 ruled non-authoritative:

- `library.ts:536` — `if (s.status === "archived") return false`
- `library.ts:541` — `if (s.status === "duplicate") return false`
- `library.ts:542` — `if (!args.includeOrphaned && s.status === "orphaned") return false`

`LibraryW02Fields` (`library.ts:311-341`) has no `status` field, and `loadLibraryW02Map`'s per-row `map.set(...)`
(`:392-434`) never copies `data.status` in — the only place that function reads `data.status` at all is the
stem-counting pre-pass (`:376`, `if (data.status === "orphaned") continue`), which never reaches the returned map.
So the join infrastructure `-34` §2 called "nearly free" is exactly that: the scan is already paid for, the field
is read once for an unrelated purpose and thrown away, same shape as the `name`/`indexTitle` fields already
joined two lines below it.

`server-songs.ts:136`'s `rec.status = typeof data.status === "string" ? data.status : "active"` (the G-15 default
`-34` §1(b) names) is UNCHANGED by this order — it is `getAllSongs()`'s own defect and out of scope; the fix
routes around it by never trusting `s.status` for the gate once a `library_index` row exists.

## 2 · F1 — join `library_index.status`, fall back to `s.status` only when no row exists

- [ ] Add `status?: string` to `LibraryW02Fields` (`library.ts:311`), populated in `loadLibraryW02Map`'s row loop
  (`:392`) as `status: typeof data.status === "string" ? data.status : undefined` — the same
  `typeof … === "string" ? … : undefined` shape already used for `composer`/`arranger`/`notationSource` two
  lines above it. **Do not default to `"active"` here** — that is the exact fabrication `-34` §1(b) named as the
  defect; an absent `library_index.status` must join as `undefined`, not a value.
- [ ] In `searchLibrary`'s filter (`:536,541,542`), read the joined status ahead of `s.status`:
  `const status = w02Map.get(s.id)?.status ?? s.status` — and gate `archived` / `duplicate` / `orphaned` on
  `status`, not `s.status`. A row with no `library_index` entry at all falls back to the `songs` value exactly as
  today (the existing "no-index-row" case in `__tests__/library-search-join.test.ts` must keep passing
  unmodified — do not touch that file).
- Nothing about the name/title join (`R-0901-live-cw-4` §5, already shipped, `HANDOFF-CODE-LIVE-SEARCH-JOIN-2026-09-02.md`)
  changes. This order touches only the status predicate.

## 3 · F2 — the fail branch, shown not promised (`R-0831-guards-2`)

- [ ] Add a new test file (do not extend `library-search-join.test.ts` — same reason that file gives for being separate
from `library.test.ts`: this needs a populated `library_index` with a status that diverges from `songs`).
Seed the shape `-34` §1(c) measured: a row with `songs/{id}.status` absent (or stale `"active"`) and
`library_index/{id}.status: "archived"`. Before F1 lands, `searchLibrary` must return that row (proving the
defect is real, not asserted); after F1, it must not. Run the negative case FIRST against unmodified `library.ts`
and confirm it fails before writing the fix — the discipline `-38`'s finding (2) and `R-0831-guards-2` both name.
State the before/after result in the return, not just the final green run.

**Fail branch:** if `library_index/{id}` has no `status` field at all (row exists, field genuinely absent —
distinct from "no library_index row"), the joined value is `undefined` and the gate must fall through to
`s.status` for that row (same `??` above handles this automatically; a test proves it rather than assuming it).
If any case can't be made to fail cleanly, STOP and report which — never add a line to
`ci/gated-suite-exclusions.txt` to route around it (`-30` §3(c), absolute).

## 4 · F3 — return

- [ ] State: the two file:line sites changed, the new test file's name and case count, the before/after of the negative
case in §3, and whether `Tu Bishvat` `1WNBHOQhMyr8Aokyp1ECGCibyUZr0UnFT` now resolves `archived` through search
(read it, do not assume it — `-34` §3 left that row untouched on purpose, waiting for exactly this). No deploy is
ordered here; if `live`'s own NEXT wants one, say so as a separate line, not folded into this return.

## 5 · What this order does NOT authorize

Waves 4 (error-code family map), 5 (38 unreachable-byte rows), and 6 (16 bonded non-active rows, void per `-34`
§4, to be re-taken through `list_library`) are untouched by this order and do not block it — `-34` names this
join as its own remaining unauthored piece, independent of the other three. No ruling is made or implied here;
`-34` already ruled the join. Do not touch `ci/gated-suite-exclusions.txt` under any branch of this order.
