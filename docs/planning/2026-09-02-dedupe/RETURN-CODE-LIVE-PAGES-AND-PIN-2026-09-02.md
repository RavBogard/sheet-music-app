# RETURN → live-cw: pages asserted, source pinned, and one stop

Lane: **live (Code)** · Order: `HANDOFF-CODE-LIVE-PAGES-AND-PIN-2026-09-02.md`
Authority: R-0902-live-cw-2 §1 · §3 · §4 · R-0831-live-pagemap-1 · R-0831-guards-2
Verified-against `86865948a4`, confirmed host-side at open. Shipped **`8491e68678`**.
**No data written. `src/data/books/` is byte-identical — `git status --porcelain src/data/books/` returns 0 lines.**

---

## Headline

V1 and V2 both shipped. **One stop condition is hit and one is not, and the order predicted the wrong one.**

- The **machzor does NOT reproduce** from the pinned carrier — 4 units differ. That is the stop the order named as "the pin or the snapshot is wrong". It is neither: the difference has a shape, and the shape says the snapshot was hand-edited.
- The **Shabbat volumes' unit folios DO differ** — 39 of 48 and 59 of 94 units. Reported, changed nothing, as ordered.
- **My finding (b) is withdrawn.** `pages: 184` is correct and the printed PDF settles it.

And one correction back to the desk, in the same class as the two it has already logged today.

## The correction: 69 and 145 are not printed page counts

R-0902-live-cw-2 §1 generalizes from the machzor — "it is every volume, not a machzor quirk (69/68, 145/143, 184/182)". The gap is real in all three. **Its cause is not.**

I ran `trim()` over both feeds and diffed unit-by-unit against the committed snapshots:

| volume | committed `pages` | committed units == `dist/` | committed units == `dist-app/` |
|---|---|---|---|
| shabbat-maariv | 69 | **IDENTICAL** (48/48) | differs, 39 units |
| shabbat-shacharit | 145 | **IDENTICAL** (94/94) | differs, 59 units |
| shirei-tshuvah | 184 | differs (11 missing, 19 extra) | differs, **4 units** |

`dist/` yields maxFolio **69** and **145** — and those snapshots are byte-identical to it. So 69 and 145 are not printed counts that happen to sit two above the last unit. **They are `trim()`'s own `maxFolio`, written by the very line V1 deletes.** Only 184 was hand-set, and only the machzor has a printed book behind it.

The desk compared committed `pages` against `dist-app/` maxFolio and read the gap as printed-vs-last-unit. It is that for the machzor. For the two Shabbat volumes it is a *different build's* maxFolio against this build's — the two feeds paginate differently, which is the same fact §4 already records.

**This does not change V1.** `maxFolio <= pages` holds for all three either way, and `pages` must stop being computed regardless. It changes what the recorded 69 and 145 *mean*, which is a ruling.

## The upstream field already exists — and it is the wrong number

§2 says "the feed gains the field upstream". It already has one. Every feed carries `printing.pages`:

| volume | `dist-app` `printing.pages` | committed `pages` | `dist-app` maxFolio |
|---|---|---|---|
| shabbat-maariv | 75 | 69 | 68 |
| shabbat-shacharit | 151 | 145 | 143 |
| shirei-tshuvah | **188** | **184** | 182 |

188 is the machzor's **physical** count — the number the desk's own reading names alongside 184 and 182. So `printing.pages` is the sheet count including the four unnumbered front-matter pages, not the printed count. **`188 - 4 = 184` ✓.** If the same four-page front matter holds for the Shabbat volumes, their printed counts would be **71** and **147**, not the recorded 69 and 145.

I did not act on that arithmetic — one volume is not a pattern, and I have no printed Shabbat book. **But it is load-bearing:** `validateLiturgyRef` (`src/lib/books/registry.ts:99`) accepts a folio only when `floor <= folio <= entry.pages`. If the printed counts are 71 and 147, then pages 70–71 and 146–147 are being **refused today** on legitimate references. Small, live, and a ruling.

## V1 — `pages` is asserted, never computed

`trim()` set `pages = maxFolio`. It now reads the recorded value from `registry.json`, which is authoritative, carries it through untouched, and asserts **`maxFolio <= pages`** per volume. A volume with no recorded `pages` is refused outright. The "update registry.json by hand if any value changed" console line is deleted — a reminder is not a guard, and this replaces it.

The assertion is an identity, not an absolute (field note 12): the last prayer cannot fall past the last printed page, which stays true as a book changes.

## V2 — the source is pinned

`DEFAULT_FEED_DIR` is now `dist-app`, and each volume pins the `printing.gitSha` it may be regenerated from: `6f61874-LICENSED` for both Shabbat volumes, **`21417d9-LICENSED`** for the machzor — the same press commit `registry.json`'s `source` already names in prose, now machine-checked.

`--check` writes nothing and reports drift, which is how a snapshot can be measured against a feed without touching it. Every measurement in this return came from it.

## Fail branches — three, shown not promised (R-0831-guards-2)

**1. The pin, against the unpinned build.** This is the 248 reinstatement, refused at the door:

```
$ node scripts/sync-books.mjs --feed-dir dist --check
Error: shabbat-maariv: feed is built from "8ab7be6", pinned to "6f61874-LICENSED".
Refusing to regenerate a pinned volume from an unpinned build (R-0831-live-pagemap-1).      exit=1
```

**2. The `pages` identity, alone.** The pin fires first and shadows it, so I neutralised the pin in a scratch copy — all three pinned to `8ab7be6` — and ran against `dist/`. The two Shabbat volumes **pass** the identity (69<=69, 145<=145) and the machzor refuses on exactly the ordered case:

```
Error: shirei-tshuvah: feed's last unit is on folio 248, past the recorded 184 printed pages.
Either the recorded page count is stale or this is the wrong build — not resolvable here.  exit=1
```

**3. A volume with no recorded `pages`**, against a scratch registry with the field removed:

```
Error: shirei-tshuvah: registry.json records pages=undefined, not a positive integer.       exit=1
```

## STOP — the machzor does not reproduce, and the shape says why

Against the pinned carrier: 122 units, 0 missing, 0 extra, 0 name changes, **4 folio differences — all four in the Torah service, all one shape:**

| unit | committed | `dist-app` |
|---|---|---|
| `torah.torah-reading-day-1@rh1` | `[97]` | `[97,98,99,100]` |
| `torah.torah-reading-day-2@rh2` | `[101,104]` | `[101,102,103,104]` |
| `torah.haftarah-day-1@rh1` | `[108,112]` | `[108,109,110,111,112]` |
| `torah.haftarah-day-2@rh2` | `[113]` | `[113,114,115]` |

**The committed snapshot holds endpoints where the feed holds spans.** That is not a pagination drift — a re-flow moves numbers, it does not delete interior ones while keeping both ends. It reads as a hand edit, and `shirei-tshuvah.json`'s mtime (Aug 31 15:25) is the registry's, hours after the other two (Aug 30 17:36).

**What it costs, measured, and it is less than it looks.** Ten folios have no unit in the committed snapshot that have one in the feed: **98, 99, 100, 102, 103, 109, 110, 111, 114, 115** — the Rosh Hashanah Torah service. But nothing reads an interior folio today: `lookup.ts:77` uses `u.folios[0]` and `registry.ts:72` uses the minimum. Probed live, `lookup_book_page("Torah Reading")` returns folio **97** and **101** — the right starting pages, from either data.

So this is **latent, not live**. It matters for `moments.json`, which `SPEC-MOMENTS-JSON` has reading folios, and it means a future legitimate re-sync would silently restore ten pages of coverage while changing a printed book's data nine days out. **Changed nothing.**

## Shabbat volumes — unit folios differ, as the order expected

39 of 48 units (maariv) and 59 of 94 (shacharit) carry different folios in `dist-app/` than in the committed snapshots, plus one name change each. Examples: `kabbalat.psalm-96` committed `[6,7]` vs `[6,7,8]`; `awakening.hareini` committed `[11,12]` vs `[12]`. This is a systemic re-pagination between the two builds, not a tail. **Reported. Changed nothing.**

## Guards

- **Rosh Hashanah (R-0901-vision-8 §1), re-asserted after the deploy — quoted, not ticked:**
  `list_books` → `{"slug":"shirei-tshuvah","title":"Shirei Tshuvah — Rosh Hashanah","tier":"feed","pages":184}` ✓
  This guard is what catches the regression V1 removes, and §2 is right that it is doing work: it reads `entry.pages`, the same field `validateLiturgyRef` bounds on.
- `git log --oneline -1` → `86865948a4` at open, confirmed host-side.
- `npx tsc --noEmit` → **exit 0**.
- `SKIP_ENV_VALIDATION=1 npx next build --webpack` → **exit 0**.
- `git status --porcelain src/data/books/` → **0 lines**.

## For Cowork (live-cw) — three, none of them mine to decide (rule 1)

1. **What are the Shabbat volumes' `pages`?** 69 and 145 are `maxFolio` off an unpinned build, not printed counts. `printing.pages` suggests 71 and 147. `validateLiturgyRef` refuses anything above the recorded value, so this is live behaviour, not bookkeeping.
2. **The machzor's four Torah units.** Endpoints vs spans, ten folios of coverage, hand-edited by the look of it. Deliberate or lost? Until that is answered the volume cannot legitimately re-sync, and the V2 pin now makes that refusal explicit rather than silent.
3. **`printing.pages` is physical, not printed.** If `cont` is to add a printed-count field upstream, it is a new field — the existing one is already taken and means something else.

## Checklist

- [x] Verified-against sha confirmed host-side; family row opened under `live` with claims
- [x] V1 `pages` asserted, never written; `maxFolio <= pages` per volume, failing
- [x] V1 fail branch demonstrated against the machzor's `dist/` build (248 > 184)
- [x] V1 the hand-update reminder line is gone
- [x] V2 per-volume pin recorded; `dist-app/` read; mismatch fails
- [ ] **V2 machzor reproduces from the pinned feed — NO. STOPPED and reported above.**
- [x] V2 Shabbat volumes: unit folios differ (39/48, 59/94). Changed nothing
- [x] `src/data/books/` clean; build gate green; deployed
- [x] RH guard re-asserted after the deploy and quoted
- [x] `Lane: live (Code)` on the commit

**No ruling id spent.** Claude records; Daniel decides.
