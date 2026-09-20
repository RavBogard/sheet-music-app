# ORDER → Code: search reads the name the browse shows

Lane: **live (Code)**, host-side · From: **live-cw (Opus Cowork)**
Executor: **live (Code)**, in `~/CentralReform.live/sheet-music-app`, git host-side (rule 8 addendum)
Status: **DISPATCHABLE**
Tier: CLOSED — edits `src/**` and deploys. **No data write of any kind.**
Verified-against: `1cdd4f7425` [inherited: `RETURN-CODE-LIVE-HYGIENE-2-2026-09-01.md`].
**Confirm host-side at open.**

Authority: **R-0901-live-cw-4 §5** · R-0901-live-cw-2 §5 · R-0831-guards-2

---

## The defect, in one sentence

`edit_library_entry` writes the new name into `library_index/{rowId}` and never mirrors it into
`songs/{id}`, while `searchLibrary` builds its result set from `getAllSongs()` and both **filters
and displays** on `songs.title` — so every chart Daniel has ever renamed is findable only by the
name he can no longer see.

**Observed** by this desk through the `CRC Music` connector at HEAD `1cdd4f7425`,
2026-09-02T01:3xZ: `search_library("Oseh Shalom (Nava Tehila)")` **returned zero rows**, while the
browse displays exactly that name for the row. That row is the one R-0901-live-cw-2 §5 renamed so
its parenthetical clarifier could seed `arrangement` for `L3`, which is how the drift surfaced.
`live` **reported** 22 of 23 curated rows drifted across the census in the wave-2 return.

## The work

`searchLibrary` prefers `library_index.name` over `songs.title` — for the **filter** and for the
**displayed title**, not one or the other; a row that matches on the current name and then renders
the old one is the same defect wearing a different face.

**The read side only.** Do not mirror `title` on write, and do not backfill `songs.title`.
R-0901-live-cw-4 §5 rules that `songs.title` becomes a second, unread copy: the join repairs all
22 drifted rows with **zero rows written**, and a backfill is the class of mass production write
this program has now twice stopped to review. Mirroring on write is not rejected on the merits and
may follow in its own wave.

**Do not widen into the neighbour.** `searchLibrary`'s `loadLibraryW02Map` also computes
`siblingsInCatalog` across all tenants (R-0901-live-cw-2 §6a). It is in the same function, it is
read-only, it measured at zero effect, and it is deliberately parked for `L3`'s design — where the
question is not "scope it" but what the confidence signal should be computed over at all. Touching
it here would settle that by accident.

## Guards

**The fail branch, shown not promised (R-0831-guards-2).** A test seeding a row whose
`library_index.name` and `songs.title` differ, asserting that the pre-change search does NOT find
it by its current name and the shipped one does, **and** that the returned title is the current
one. Neutralising the join must turn it red.

**Do not regress the stale name into a false negative.** A row found by its OLD name today should
be reported either way — say in the return which behaviour you shipped and why. This desk has no
ruling on it and does not need one before you measure it; `live` chooses and states the choice.

**Post-deploy, on the live surface**, the six names `live` spot-checked in the wave-2 return, each
queried by the name the browse displays. All six **returned 0 rows** before this change; all six
must return their row after. Quote the before/after in the return.

**Rosh Hashanah guard (R-0901-vision-8 §1):** `list_books` → `shirei-tshuvah` **184 pages, tier
`feed`**, asserted after the deploy. This desk **observed** that value at HEAD `1cdd4f7425`,
2026-09-02T01:3xZ, before writing this order.

Checks the executor runs and records — **no observed value is supplied here, deliberately:**

```text
git log --oneline -1                              # confirm the Verified-against sha
npx tsc --noEmit
SKIP_ENV_VALIDATION=1 npx next build --webpack
```

## Checklist

- [ ] Verified-against sha confirmed host-side; family row opened under `live` with claims
- [ ] Join shipped for BOTH the filter and the displayed title
- [ ] Fail-branch test; neutralising the join turns it red
- [ ] Old-name behaviour measured and stated
- [ ] Build gate green; deployed
- [ ] Six spot-check queries: 0 rows before, their row after — quoted in the return
- [ ] RH guard re-asserted after the deploy
- [ ] `RETURN-CODE-LIVE-SEARCH-JOIN-*.md` at this root; `Lane: live (Code)` on every commit (rule 13)

## Stop conditions

Stop and return, do not decide, if: the join cannot be done without a write; `siblingsInCatalog` or
any other W-02 signal has to move to make it work; the six spot checks do not all come right; or a
ruling looks needed. **`live` never spends a ruling id (rule 1).**

Claude records; Daniel decides.
