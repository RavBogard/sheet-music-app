# RETURN → live-cw: search reads the name the browse shows

Lane: **live (Code)**, host-side · Order: `HANDOFF-CODE-LIVE-SEARCH-JOIN-2026-09-02.md`
Authority: **R-0901-live-cw-4 §5** · R-0901-live-cw-2 §5 · R-0831-guards-2
Verified-against: `1cdd4f7425` — **confirmed host-side at open**, `git log --oneline -1`.
Shipped: **`1bbded15f5`** · Status: **CLOSED**

---

## What shipped

`searchLibrary` resolves the display name through **exactly the precedence `toLibraryEntry`
uses** — `library_index.name ?? library_index.title ?? songs.title` — and applies it to **both**
the filter and the returned title.

Reading `toLibraryEntry` first was worth the two minutes: the browse's fallback is
`data.name || data.title`, where `data.title` is **`library_index`'s own** title field, not
`songs.title`. Joining only `name` would have left the two surfaces disagreeing on any row that
carries no `name`. `indexTitle` is now read from the `library_index` scan that
`loadLibraryW02Map` already performs — no second read — and is stripped from the wire shape
alongside `name` and `mimeType`.

**Zero rows written.** No mirror on write, no backfill, exactly as §5 ruled.

**Did not touch `siblingsInCatalog`.** It sits in the same function and is parked for `L3`.

## The old-name choice, measured and stated

The order left this to `live`. **Old names still match:** `songs.title` is kept as an alternate
candidate rather than replaced, so the change is a **strict superset** — nothing findable today
stops being findable.

Two reasons. Search is a discovery surface where the harm being repaired *is* the false negative,
and erring toward findable over gated is the standing posture on this repo. And the codebase
already reasoned this way once, in the token-matching comment three lines up: the L-003 change
was justified as "a strict superset — nothing that matched before stops." The same argument
applies unchanged.

The stale name is only ever a **match** key, never a **display** value: a row found by its old
name still renders its current one. That is asserted in the tests.

## Guards

**Fail branch, shown not promised (R-0831-guards-2).** New file
`src/lib/mcp/tools/__tests__/library-search-join.test.ts`, 6 tests, seeding a row whose
`library_index.name` (`Oseh Shalom (Nava Tehila)`) and `songs.title` (`Oseh Shalom`) differ —
the live case. Neutralising **either half** of the join turns **5 of 6 red**:

```
× finds the row by the CURRENT name        AssertionError: expected [] to deeply equal [ '1-NavaOsehShalomRow' ]
× returns the CURRENT name as the title    AssertionError: expected undefined to be 'Oseh Shalom (Nava Tehila)'
× still finds the row by its OLD name      AssertionError: expected 'Oseh Shalom' to be 'Oseh Shalom (Nava Tehila)'
✓ falls back to songs.title, no index row  ← the control: MUST stay green
× resolves through library_index.title     AssertionError: expected [] to deeply equal [ '1-NavaOsehShalomRow' ]
× does not leak indexTitle onto the wire
```

The one that stays green is the control — a row with no `library_index` entry must keep falling
back to `songs.title`, and it does not depend on the join.

Lives in its own file: `library.test.ts` deliberately lets `loadLibraryW02Map` fail-soft into an
empty map, and this needs a populated `library_index`. Both suites green together, **23 passed**.

**Build gate**, host-side, all green:

```
git log --oneline -1   → 1cdd4f7425   (Verified-against confirmed)
npx tsc --noEmit       → exit 0
SKIP_ENV_VALIDATION=1 npx next build --webpack → completed
```

## Post-deploy, on the live surface

Shipped `1bbded15f5`; deploy observed live 129s after push. Each name queried **exactly as the
browse displays it**, before on `1cdd4f7425` and after on `1bbded15f5`, same script:

| queried by its current name | before | after |
|---|---|---|
| `Kedusha: High Holidays Reform (Nava Tehila)` | **0** | **1** ✓ |
| `Surrender: Chants (Sykes)` | **0** | **1** ✓ |
| `Oseh Shalom (Nava Tehila)` | **0** | **1** ✓ |
| `Adonai S'fatai (trad)` | **0** | **1** ✓ |
| `Shir Shabbat Packet — Cover & Tune List` | **0** | **1** ✓ |
| `Shalom Rav` | 4, none the renamed row | 4, **the renamed row now renders `Shalom Rav`** ✓ |

The sixth is the display half proving itself. `Shalom Rav` always *matched* — the stale
`Shalom_rav` normalizes to the same tokens — but it **rendered under the name Daniel could no
longer see**, which is why the wave-2 return recorded it as "none of them the renamed row." It
now renders its current name. Had only the filter been joined, this row would have looked fixed
and not been.

**Regression probe**, ordinary queries, all healthy: `lecha dodi` 11 · `mi chamocha` 14 ·
`avinu malkeinu` 9 · `hashkivenu` 3 · `shema` 1 (`Shema (major).pdf` — one of the four groups
wave 2 recovered, findable and visible). The superset property means a count can only hold or
grow, and none fell.

**Rosh Hashanah guard (R-0901-vision-8 §1)**, asserted **before** the push and **re-asserted
after** the deploy, unchanged both times:

```json
{"slug":"shirei-tshuvah","title":"Shirei Tshuvah — Rosh Hashanah","tier":"feed","pages":184}
```

## One observed consequence, not a defect — for `live-cw`

**Search titles now carry file extensions.** `Shalom Rav - Full Score` renders as
`Shalom Rav - Full Score.pdf`; `Hashkivenu` as `Hashkivenu.pdf`. This is not drift — it is the
ruling working. `library_index.name` is the raw filename and `songs.title` was a cleaned copy,
so the two surfaces disagreed on extensions as well as on renames. **Measured: 134 of the first
200 browse rows carry an extension in the name the browse already displays.** Search now shows
what the browse shows, which is what §5 asked for.

Flagged because it is **user-visible on Daniel's authoring surface and was not anticipated in
the order**: results look different today than yesterday. Not fixed here — stripping extensions
in search would re-open the disagreement §5 just closed, and whether the *browse* should show
them is a display-policy call for a desk that mints ids. **`live` never spends a ruling id
(rule 1).**

## Checklist

- [x] Verified-against sha confirmed host-side; family row opened under `live` with claims
- [x] Join shipped for BOTH the filter and the displayed title
- [x] Fail-branch test; neutralising the join turns it red (5 of 6; control stays green)
- [x] Old-name behaviour measured and stated — superset, old names still match
- [x] Build gate green; deployed
- [x] Six spot-check queries: 0 rows before, their row after — quoted above
- [x] RH guard re-asserted after the deploy — 184 / `feed`
- [x] `RETURN-CODE-LIVE-SEARCH-JOIN-2026-09-02.md`; `Lane: live (Code)` on the commit (rule 13)

**No stop condition met.** The join needed no write, no W-02 signal moved, all six came right.

Claude records; Daniel decides.
