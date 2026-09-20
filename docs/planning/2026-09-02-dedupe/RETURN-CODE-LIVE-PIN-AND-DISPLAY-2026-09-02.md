# RETURN → live-cw: P1 STOPPED (ruling needed) · P2 shipped

Lane: **live (Code)**, host-side · Order: `HANDOFF-CODE-LIVE-PIN-AND-DISPLAY-2026-09-02.md`
Authority: R-0902-live-cw-1 §2 · R-0831-live-pagemap-1 · R-0901-vision-8 §1 · rule 5 · rule 6 ·
R-0831-guards-2 · field note 12
Verified-against: `1bbded15f5` — **confirmed host-side at open**.
Shipped: **`86865948a4`** (P2 only) · Status: **P1 STOPPED · P2 CLOSED**

> **P1 met two of this order's own stop conditions and was not shipped.** The pinned read does
> not reproduce the committed snapshots, and the `registry.json` check fails on the current tree
> — for **all three** volumes. Nothing was regenerated, nothing in `src/data/books/` changed.

---

## P1 — STOP. The premise does not hold, and it does not hold in the direction the order expects

The order's table records `dist/` at 130/248 and `dist-app/` at 122/182 for the machzor, and
concludes the satellite's file "matches `dist-app/` and not `dist/`". **That is true for the
machzor's unit count and folio ceiling. It is false for the other two volumes, and it is false
byte-for-byte for the machzor too.**

Measured host-side, 2026-09-02, by running the script's own `trim()` over each feed **without
writing** — committed snapshot compared unit-for-unit against both feeds:

| volume | committed | `dist/` `8ab7be6` | `dist-app/` |
|---|---|---|---|
| `shabbat-maariv` | 48 units, `pages` 69 | 48 / 69 — **units BYTE-IDENTICAL** | 48 / 68 `6f61874-LICENSED` — **39 of 48 units differ** |
| `shabbat-shacharit` | 94 units, `pages` 145 | 94 / 145 — **units BYTE-IDENTICAL** | 94 / 143 `6f61874-LICENSED` — **59 of 94 units differ** |
| `shirei-tshuvah` | 122 units, `pages` **184** | 130 / 248 — different unit set | 122 / 182 `21417d9-LICENSED` — same ids, **4 units differ**, order differs |

**Two of the three committed volumes came from `dist/`** — the unpinned source this order exists
to stop reading. They reproduce from it exactly. They do **not** reproduce from `dist-app/`, and
the divergence is not a tail-page rounding: it is a systemic folio shift across **39 of 48** and
**59 of 94** units.

**The machzor reproduces from neither.** Against `dist-app/` the id set is identical (0 added, 0
dropped) but the order diverges at index 12, and **4 units disagree on folios — all four in the
Torah service**, with a clear signature:

| unit | committed | `dist-app/` |
|---|---|---|
| `torah.torah-reading-day-1@rh1` | `[97]` | `[97,98,99,100]` |
| `torah.torah-reading-day-2@rh2` | `[101,104]` | `[101,102,103,104]` |
| `torah.haftarah-day-1@rh1` | `[108,112]` | `[108,…,112]` |
| `torah.haftarah-day-2@rh2` | `[113]` | `[113,114,115]` |

The committed file records **endpoints**; `dist-app/` records the **full span**. The committed
snapshot is an older generation of the same volume.

And its `pages` is **184** while its own units reach only **182** — `trim()` computes
`pages = maxFolio`, so **no run of this script produced that number.** It was set by hand.

### Why this is a stop and not a fix

Pinning to `dist-app/` and adding the `registry.json` identity check (requirement 3) makes the
script **fail on all three volumes today** — 69≠68, 145≠143, 184≠182. Both of those are named
stop conditions. Recording `dist-app/` as the pin would also encode a claim the evidence
contradicts for two of three volumes.

**Three readings, and choosing between them is a ruling:**

1. **`dist-app/` is right and the committed snapshots are stale** — then two volumes are serving
   the unlicensed page space today and need regenerating, which is the same hazard as the 248
   problem pointing the other way, and already landed.
2. **The committed snapshots are right** — then the pin is not `dist-app/` for maariv and
   shacharit, and `LICENSED` builds are not the app carrier for every volume.
3. **The pin is per-volume** — plausible, since `dist-app/` itself is mixed-sha
   (`6f61874-LICENSED` for two volumes, `21417d9-LICENSED` for the machzor).

Only #1 changes what the band reads off a page, and only Daniel can settle it against the
physical books. **`live` never spends a ruling id (rule 1).**

### The hazard is unchanged and still live

`npm run sync:books` still reads `dist/` and would still write 248. The order's zero-cost
mitigation stands: **nobody runs it.** I did not ship a pin that always fails, because a
script that refuses on every volume would encode `dist-app/` as the answer — which is the
part that needs the ruling.

`git status --porcelain src/data/books/` → **empty.** Nothing regenerated.

## P2 — shipped

New `src/lib/library/display-name.ts` is the **one** path both read surfaces call:
`toLibraryEntry` (list_library) and `searchLibrary`. Display-side only; no stored name changed.

**The one-path guard is the point, so it is a test, not a comment.** `browse and search render
the SAME string` fails the moment either call site stops using the helper — demonstrated by
removing the browse call and watching it go red on
`expected 'Hashkivenu.pdf' to be 'Hashkivenu'`.

**Extensions stay matchable**, asserted: a query for `Hashkivenu.pdf` still returns the row,
because every filter reads the raw name. `mimeType` still rides on the browse row, so the file
type is not lost with the suffix.

The strippable set is **closed**, not "any trailing dot-token" — library names carry real dots
(`Ps. 23`, `Shalom Rav no. 2`, `Avinu Malkeinu.v2.pdf` → `Avinu Malkeinu.v2`) that a generic
rule would eat. 33 tests green across the three library suites.

### Not applied to the in-app `/library` browse — stopped, not duplicated

`SongChartsLibrary.tsx:161-162` selects the **viewer** from the name:

```ts
const isXml  = file.mimeType.includes('xml') || file.name.endsWith('.xml') || file.name.endsWith('.musicxml')
const isText = file.mimeType.includes('text/plain') || file.name.endsWith('.txt')
```

Stripping at that data boundary (`getServerLibrary`) would break **MusicXML and text chart
rendering** — the strategic chart format. The component also filters client-side on the name,
which trips the order's own "stripping changes what a query matches" stop condition.

So "both surfaces hide it" as literally written would have broken the iPad MusicXML path. Doing
it properly means stripping at each render site while the raw name still drives the viewer
choice — more surface than this order authorises, and the order says stop rather than duplicate.
**Left for a ruling.**

## Post-deploy, on the live surface

Shipped `86865948a4`; deploy observed live 130s after push.

| probe | result |
|---|---|
| `search_library("Hashkivenu.pdf")` | **1 row**, renders `Hashkivenu` — **extension still matchable** |
| `search_library("hashkivenu")` | 3 — `Hashkivenu`, `Hashkivenu (Randy)`, `Hashkivenu (Randy) (1)` |
| `search_library("Shalom Rav")` | 4 — `Shalom Rav - Full Score`, `Shalom Rav (Klepper-Freelander)`, `Shalom Rav (klepper)`, `Shalom Rav` |
| `search_library("Shema (major)")` | 1 — `Shema (major)` (one of the four groups wave 2 recovered) |
| `list_library` rows still showing an extension | **0 of 200** — was 134 of 200 before |

The `Shalom Rav` group is the clean before/after: yesterday it rendered
`Shalom Rav - Full Score.pdf` and `Shalom Rav (Klepper-Freelander).pdf`, and before §5 the
renamed row rendered `Shalom_rav`. All four now read as their song names.

**Rosh Hashanah guard (R-0901-vision-8 §1)**, re-asserted after the deploy, unchanged:

```json
{"slug":"shirei-tshuvah","title":"Shirei Tshuvah — Rosh Hashanah","tier":"feed","pages":184}
```

That 184 is the number P1 found to be hand-set. **The guard is asserting a value the producer
cannot reproduce** — it is stable, and it is correct on the deployed surface, but it is not
derived. Worth knowing before the pin is ruled on.

## Checklist

- [x] Verified-against sha confirmed host-side; family row opened under `live` with claims
- [ ] **P1 reads `dist-app/`; per-volume pin recorded — STOPPED, two stop conditions met**
- [ ] **P1 fails on `gitSha` mismatch — not shipped; the pin itself needs a ruling**
- [ ] **P1 checks `registry.json` against computed folios — would fail on all 3 volumes today**
- [x] P1 left `src/data/books/*.json` byte-identical — `git status --porcelain` empty. **The
      pinned read does NOT reproduce them; that is the stop.**
- [x] P2 one shared display path, both MCP surfaces; extensions still matchable
- [x] Build gate green; deployed
- [x] RH guard re-asserted after the deploy and quoted — 184 / `feed`
- [x] `RETURN-CODE-LIVE-PIN-AND-DISPLAY-2026-09-02.md`; `Lane: live (Code)` on the commit

## For live-cw — three things, none of them mine to decide

1. **The book pin.** Which source is authoritative per volume, given two committed volumes
   reproduce from `dist/` and the machzor from neither. Only reading #1 changes what the band
   reads off a page.
2. **`registry.json` `pages` for `shirei-tshuvah` is hand-set to 184** against a computed 182.
   Requirement 3's identity check cannot pass until that is reconciled — and the RH guard quotes
   the hand-set number.
3. **The in-app browse still shows extensions**, because its viewer selection reads them. Doing
   P2 there is a per-render-site change, not a data-boundary one.

**No ruling minted. `live` never spends a ruling id (rule 1).**

Claude records; Daniel decides.
