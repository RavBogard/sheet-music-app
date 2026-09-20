# PLAN REVIEW → `L1` wave 2: the 85-row dedupe, read before it runs

Lane: **live-cw (Opus Cowork)** · Authority: **R-0901-live-cw-2 §5** (Daniel: one reviewed run)
Plan read live: `dedupe_library({dryRun: true})` at `ca7fca91ce`
[measured: live centralreform.live MCP over HTTPS from the host, CRC bearer, 2026-09-01T23:4xZ]
**84 groups · 85 rows marked · `committed: 0` · nothing written.**

## STOP — this plan is not runnable yet, and the review is what caught it

**Four ACTIVE chart rows would be marked `duplicate` behind an ARCHIVED row.**

| kept as canonical | dropped |
|---|---|
| `Shema (major).pdf` — **archived**, 2025-05-06 | `Shema (major).pdf` — *active*, 2025-07-08 |
| `Avinu Malkeinu_trad_Choir_Em.pdf` — **archived**, 2025-08-11 | `Avinu Malkeinu_trad_Choir_Em.pdf` — *active*, 2025-08-11 |
| `Oseh shalom (S&P).pdf` — **archived**, 2025-05-06 | `Oseh shalom (S&P).pdf` — *active*, 2025-07-08 |
| `V_shamru_(trad).pdf` — **archived**, 2025-07-08 | `V_shamru_(trad).pdf` — *active*, 2025-07-19 |

The canonical picker chooses by earliest `uploadedAt` and does not consider `status`. That was
harmless while archived rows were out of scope — **and R-0901-live-cw-1 §3 is what put them in.**
So this is a consequence of this desk's own ruling, surfacing on the first plan taken after it,
and it is named here rather than discovered in the catalog afterwards.

**It is the same defect class Code caught in wave 1**, when the shared extension set let a `.mp3`
stand as canonical over two real charts. The picker's own comment states the principle: when
something that should not be canonical reaches it, *"the upstream skip is the bug to fix, not the
picker tiebreak."* Here the fix is neither a skip nor a tiebreak but a rank: **an `active` row
outranks an `archived` one, and age decides only within a status.** One comparison, ahead of the
existing `uploadedAt` sort.

Everything else in the plan is sound. With that one change the four groups above flip to keeping
the active row, the marks stay at 85, and nothing else in the plan moves.

---

## The rest of the plan, decomposed so the reading is bounded

Three shapes. Only the first needs judgment.

### C · names differ beyond the extension — READ THESE  — 3 groups, 3 rows marked

| keep | source · status | drop | source · status |
|---|---|---|---|
| `Bar'chu Walkdown.pdf` | Drive · active | `Barchu Walkdown` | upload · active |
| `Oseh shalom - Nava tehila.pdf` | Drive · active | `Oseh Shalom (Nava Tehila)` | upload · active |
| `Shalom_rav` | upload · active | `Shalom Rav.pdf` | Drive · active |

### B · byte-identical names (mostly an active row beside its archived twin)  — 18 groups, 18 rows marked

| keep | source · status | drop | source · status |
|---|---|---|---|
| `Adon Olam` | upload · active | `Adon Olam` | Drive · active |
| `Avinu Malkeinu_trad_Choir_Em.pdf` | Drive · archived | `Avinu Malkeinu_trad_Choir_Em.pdf` | Drive · active |
| `Barchu (Friedman).pdf` | Drive · active | `Barchu (Friedman).pdf` | Drive · archived |
| `Barechu_trad_Choir_C.pdf` | Drive · active | `Barechu_trad_Choir_C.pdf` | Drive · archived |
| `C-Saw Niggun Score.pdf` | Drive · active | `C-Saw Niggun Score.pdf` | Drive · archived |
| `Lecha Dodi Lincoln_s Nigun.pdf` | Drive · archived | `Lecha Dodi Lincoln_s Nigun.pdf` | Drive · archived |
| `Mizmor l_David D.pdf` | Drive · active | `Mizmor l_David D.pdf` | Drive · archived |
| `Niggun 3 part choral score.pdf` | Drive · active | `Niggun 3 part choral score.pdf` | Drive · archived |
| `Oseh shalom (camp).pdf` | Drive · active | `Oseh shalom (camp).pdf` | Drive · archived |
| `Oseh shalom (S&P).pdf` | Drive · archived | `Oseh shalom (S&P).pdf` | Drive · active |
| `Shalom alechem (Goldfarb).pdf` | Drive · active | `Shalom alechem (Goldfarb).pdf` | Drive · archived |
| `Shalom Alechem Shir Shabbat.pdf` | Drive · active | `Shalom Alechem Shir Shabbat.pdf` | Drive · archived |
| `Shema (major).pdf` | Drive · archived | `Shema (major).pdf` | Drive · active |
| `Shiru L_Adonai Shir Shabbat.pdf` | Drive · active | `Shiru L_Adonai Shir Shabbat.pdf` | Drive · archived |
| `Unetaneh_Tokef 4 parts.pdf` | Drive · active | `Unetaneh_Tokef 4 parts.pdf` | Drive · archived |
| `V_shamru_(trad).pdf` | Drive · archived | `V_shamru_(trad).pdf` | Drive · active |
| `Veshamru.pdf` | Drive · active | `Veshamru.pdf` | Drive · archived |
| `Yedid Nefesh.pdf` | Drive · active | `Yedid Nefesh.pdf` | Drive · archived |

### A · same name, one row carries `.pdf` — the Drive/upload packaging pattern  — 63 groups, 64 rows marked

| keep | source · status | drop | source · status |
|---|---|---|---|
| `Achot ketana.pdf` | Drive · active | `Achot ketana` | upload · active |
| `Aleinu - .pdf` | Drive · active | `Aleinu -` | upload · active |
| `Aleinu- trad - Full Score.pdf` | Drive · active | `Aleinu- trad - Full Score` | upload · active |
| `Avinu Malkeinu - Full Score.pdf` | Drive · active | `Avinu Malkeinu - Full Score` | upload · active |
| `Avinu Malkeinu.pdf` | Drive · active | `Avinu Malkeinu` | upload · active |
| `Avinu Malkeynu Janowski - Full Score.pdf` | Drive · active | `Avinu Malkeynu Janowski - Full Score` | upload · active |
| `Avinu Shebashamayim.pdf` | Drive · active | `Avinu Shebashamayim` | upload · active |
| `Avodah Retzei.pdf` | Drive · active | `Avodah Retzei` | upload · active |
| `Avodah Ritzei - Full Score.pdf` | Drive · active | `Avodah Ritzei - Full Score` | upload · active |
| `B'sefer chayim & Hashiveinu.pdf` | Drive · active | `B'sefer chayim & Hashiveinu` | upload · active |
| `B'sefer Chayim - Full Score.pdf` | Drive · active | `B'sefer Chayim - Full Score` | upload · active |
| `B'sefer chayim.pdf` | Drive · active | `B'sefer chayim` | upload · active |
| `Barchu (Am I Awake ) - Full Score.pdf` | Drive · active | `Barchu (Am I Awake ) - Full Score` | upload · active |
| `Barchu - Full Score.pdf` | Drive · active | `Barchu - Full Score` | upload · active |
| `Benediction - Full Score.pdf` | Drive · active | `Benediction - Full Score` | upload · active |
| `Berosh Hashanah Yikateivun - Full Score.pdf` | Drive · active | `Berosh Hashanah Yikateivun - Full Score` | upload · active |
| `Bina in G.pdf` | Drive · active | `Bina in G` | upload · active |
| `Candle Blessing - Full Score.pdf` | Drive · active | `Candle Blessing - Full Score` | upload · active |
| `Come Healing - Full Score.pdf` | Drive · active | `Come Healing - Full Score` | upload · active |
| `Dis Trust - Full Score.pdf` | Drive · active | `Dis Trust - Full Score` | upload · active |
| `Dodi Li.pdf` | Drive · active | `Dodi Li` | upload · active |
| `Eitz Chayim (Old Skool).pdf` | Drive · active | `Eitz Chayim (Old Skool)` | upload · active |
| `Eitz Chayim and HashiVeinu - Full Score.pdf` | Drive · active | `Eitz Chayim and HashiVeinu - Full Score` | upload · active |
| `Esa Einai - Full Score.pdf` | Drive · active | `Esa Einai - Full Score` | upload · active |
| `Hashiveinu.pdf` | Drive · active | `Hashiveinu` | upload · active |
| `Hashkiveinu - Full Score.pdf` | Drive · active | `Hashkiveinu - Full Score` | upload · active |
| `Hayom teamtzeinu - Full Score.pdf` | Drive · active | `Hayom teamtzeinu - Full Score` | upload · active |
| `Hineni Rosenblatt.pdf` | Drive · active | `Hineni Rosenblatt` | upload · active |
| `Kedusha (compact).pdf` | Drive · active | `Kedusha (compact)` | upload · active |
| `KEDUSHAH - Full Score.pdf` | Drive · active | `KEDUSHAH - Full Score` | upload · active |
| `L'chai Olamim - Full Score (1).pdf` | Drive · active | `L'chai Olamim - Full Score (1)` | upload · active |
| `Ma Tovu (CRC) 2.pdf` | Drive · active | `Ma Tovu (CRC) 2` | upload · active |
| `Mah Tovu - Full Score.pdf` | Drive · active | `Mah Tovu - Full Score` | upload · active |
| `May it be a Good Year - Full Score.pdf` | Drive · active | `May it be a Good Year - Full Score` | upload · active |
| `May the Door - Full Score.pdf` | Drive · active | `May the Door - Full Score` | upload · active |
| `Mi Chamocha (compact).pdf` | Drive · active | `Mi Chamocha (compact)` | upload · active |
| `Mi chamocha (Moshav) morning.pdf` | Drive · active | `Mi chamocha (Moshav) morning` | upload · active |
| `Mi chamocha shur.pdf` | Drive · active | `Mi chamocha shur` | upload · active |
| `Mi Chamocha Traditional - Full Score.pdf` | Drive · active | `Mi Chamocha Traditional - Full Score` | upload · active |
| `Mi Chamochah - Full Score.pdf` | Drive · active | `Mi Chamochah - Full Score` | upload · active |
| `Mi Shebeirach - Full Score.pdf` | Drive · active | `Mi Shebeirach - Full Score` | upload · active |
| `Mi Shebeirach.pdf` | Drive · active | `Mi shebeirach.pdf` | Drive · archived |
| ↳ |  | `Mi Shebeirach` | upload · active |
| `Mi_shebeirach jazz.pdf` | Drive · active | `Mi_shebeirach jazz` | upload · active |
| `Modeh Ani Ma Tovu P'sukei - Full Score.pdf` | Drive · active | `Modeh Ani Ma Tovu P'sukei - Full Score` | upload · active |
| `Modeh_Ani F minor.pdf` | Drive · active | `Modeh_Ani F minor` | upload · active |
| `Niggun - Full Score.pdf` | Drive · active | `Niggun - Full Score` | upload · active |
| `Nigun # 5.PDF` | Drive · active | `Nigun # 5` | upload · active |
| `Od Yavo Shalom Aleinu.pdf` | Drive · active | `Od Yavo Shalom Aleinu` | upload · active |
| `Om-Ney Dm - Full Score.pdf` | Drive · active | `Om-Ney Dm - Full Score` | upload · active |
| `R'tzei - Full Score.pdf` | Drive · active | `R'tzei - Full Score` | upload · active |
| `Refa Tziri.pdf` | Drive · active | `Refa Tziri` | upload · active |
| `Shalom Rav - Full Score.pdf` | Drive · active | `Shalom Rav - Full Score` | upload · active |
| `Sim Shalom (Jim).pdf` | Drive · active | `Sim Shalom (Jim)` | upload · active |
| `Sim Shalom - Full Score.pdf` | Drive · active | `Sim Shalom - Full Score` | upload · active |
| `T'filah Adonai s'fatai - Full Score.pdf` | Drive · active | `T'filah Adonai s'fatai - Full Score` | upload · active |
| `twilight.pdf` | Drive · active | `Twilight` | upload · active |
| `Un'taneh Tokef - Full Score.pdf` | Drive · active | `Un'taneh Tokef - Full Score` | upload · active |
| `V'Shamru (Old Skool).pdf` | Drive · active | `V'Shamru (Old Skool)` | upload · active |
| `V'Shamru.pdf` | Drive · active | `V'Shamru` | upload · active |
| `Ve'al kulam - Full Score.pdf` | Drive · active | `Ve'al kulam - Full Score` | upload · active |
| `Veshameru - Full Score.pdf` | Drive · active | `Veshameru - Full Score` | upload · active |
| `Yihyu Leratzon - Full Score.pdf` | Drive · active | `Yihyu Leratzon - Full Score` | upload · active |
| `zochrenu Lehayim - Full Score.pdf` | Drive · active | `zochrenu Lehayim - Full Score` | upload · active |

---

## Two titles to repair after the run (R-0901-live-cw-2 §5)

The canonical pick keeps the worse-formed title in exactly two groups:

- `Shalom_rav` survives over `Shalom Rav.pdf` — an underscore where a space belongs.
- `Oseh shalom - Nava tehila.pdf` survives over `Oseh Shalom (Nava Tehila)` — and this one is not
  cosmetic. **The parenthetical clarifier is what R-0901-live-cw-1 §1 seeds the `arrangement`
  field from**, so the surviving row is the one `L3` can read least. Repaired by
  `edit_library_entry` in the same wave, before anything binds.

## What this run does and does not do

`status: "duplicate"` is a **mark, not a delete**. No bytes are removed and no setlist bond
changes. The 85 rows leave the browse; the 84 canonical rows stay.

**CORRECTION, 2026-09-01T23:5xZ — an earlier draft of this section said the mark is "reversible
row by row". That was an unmeasured claim by this desk and it is wrong.** Measured on the tree
[measured: `src/lib/mcp/**` on the mount]: `dedupe_library` writes `status: "duplicate"` into
`library_index` and mirrors it into `songs/{id}`; **no MCP tool writes it back.**
`edit_library_entry` cannot set `status`; `reconcile_library` skips duplicate rows outright;
`salvage_chart_bytes` reaches `active` only by re-uploading bytes onto the row. Reversal is a
re-upload heal or direct Firestore work. **Treat this run as one-way through the MCP.**

**Playback is NOT at risk, and that IS measured.** 12 of the 85 rows are bonded to live setlist
tracks — `Shema (major)` on 12 services, `V_shamru_(trad)` on 9 — but no consumer in the Perform
or gig-packet path filters on `status`, and the natural experiment already exists on this data:
**3 rows are marked `duplicate` today and still bonded to live setlists** (`Mi shebeirach.pdf`,
`Mi chamocha (Moshav) morning.pdf`, `dodi li (sher).png`) with nothing broken. The mark governs
DISCOVERY — the browse and `search_library` — not what a bonded row renders.

**Not in this run:** the eleven renames (R-0901-live-cw-2 §2) ride in the same wave as a separate,
separately-confirmed step; `moments`, bonds, setlists and the book registry are untouched; and the
Rosh Hashanah guard is asserted after, as on every wave.
