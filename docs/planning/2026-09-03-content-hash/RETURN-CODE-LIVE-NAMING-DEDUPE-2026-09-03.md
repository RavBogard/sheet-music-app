# RETURN → `live-cw`: 2 restores + 5 hides applied on Daniel's ruling. WRITES, verified live.

Lane: **`live` (Code)**, host-side · Follows `RETURN-CODE-LIVE-DUPLICATE-SWEEP-2026-09-03.md` §3 and §8
**Authority: Daniel at the keyboard, 2026-09-03 02:3xZ** — *"restore both of the ones that were text/plain
stubbs. Different names for identical bytes? get rid of the one that isn't named properly. if that doesn't
decide it, your judgement rules."*
Single named owner for this run: **`live` (Code)**. No deploy; no code changed; satellite HEAD untouched at
`9933d2abef`. **No ruling id spent (rule 1).**

**Undo file written BEFORE the first write:** `L3-NAMING-DEDUPE-UNDO-2026-09-03.json`, holding prior
`status` (including *field-absent* for the four rows that never had one), prior `dedupedAt`, the mirrored
`songs/` prior status, and an explicit reversal procedure. **There is still no un-mark tool — that file is
the only reversal path.**

---

## 1 · The check that changed the plan

Daniel's naming rule decides which row to hide. Before writing, this lane asked a question the rule does not
cover: **is either row bonded to a live setlist?** [measured: `find_setlists_referencing_chart` on all 12
rows, bearer path, 02:1xZ]

**Two of the five pairs put the bond on the row the naming rule condemns:**

| pair | improperly named (→ hide) | bonds | properly named (→ keep) | bonds |
|---|---|---|---|---|
| B-minor Simple Tune | `Bminor_simpletune.pdf` | **4** | `B-minor Simple Tune` | 0 |
| Hashkivenu (Randy) | `Hashkivenu (Randy) (1)` | **1** | `Hashkivenu (Randy)` | 0 |

**So the rule was tested against the thing it could break, not assumed safe.**
[measured: `get_chart_status` on `upload-046649f0` — a row that is *currently* `duplicate` **and** bonded to
4 setlists — returned `{"status":"ok","source":"firebase-storage"}`, 02:1xZ]

**A `duplicate` mark hides a row from browse, search and the bind picker. It does not break a bond that
already exists, and it deletes no bytes.** Since every pair here is **byte-identical by sha256**, the band
sees the same chart either way. The rule was therefore safe to apply uniformly, and it was.

**Correction to this lane's own 09-02 return, which said the marked PDF was removed from "browse, search and
Perform."** Browse and search, yes. Perform, no — a bound chart still renders. The real cost of a bad mark is
that the chart cannot be *found* in order to be bound. That is still serious; it is not the same claim.

## 2 · What was written — 14 documents, 7 rows

Every row mirrored into `songs/{id}`, which existed for all 7.

**RESTORED to `active`, `dedupedAt` deleted:**

| fileId | name | mime | bytes | bonds |
|---|---|---|---|---|
| `upload-046649f0` | Barchu Walkdown | `text/plain` | 164 | **4 live setlists** |
| `upload-4f05ce1a` | Od Yavo Shalom Aleinu | `text/plain` | 260 | 0 |

**`upload-046649f0` is the one that mattered.** It was `duplicate` while four live setlists pointed at it —
Shir Shabbat Full Repertoire Packet (Jeff Lash), Shir Shabbat Crown Center Aug 7, and Kabbalat Shabbat
May 22 (×2). Bonded and unfindable at the same time.

**HIDDEN as `duplicate`, with `dedupedAt` and `canonicalFileId` set:**

| hidden | kept | sha256 | bytes |
|---|---|---|---|
| `Niggun - Full Score.pdf` | **`Niggun - Bonia Full Score`** | `60ebf618…` | 49,551 |
| `twilight.pdf` | **`Twilight (D Goldenberg)`** | `bc8f6890…` | 29,132 |
| `Hashkivenu (Randy) (1)` | **`Hashkivenu (Randy)`** | `f853ccf2…` | 22,443 |
| `gminor_spirits.pdf` | **`G-minor Spirits`** | `939c2ec4…` | 42,729 |
| `Bminor_simpletune.pdf` | **`B-minor Simple Tune`** | `2e5a9914…` | 39,599 |

The last two close the pair named in **R-0901-live-cw-4 §6**, which had been open since 09-01.

**Judgement calls, flagged because Daniel delegated them:** `Niggun - Full Score` vs
`Niggun - Bonia Full Score` was the only pair where neither name is malformed — one is simply generic and
the other identifies the tune. Kept the specific one, which is also the bonded one. The other four were
decided by the naming rule alone (a `(1)` suffix, a bare lowercase filename, two raw `snake_case` filenames).

## 3 · Verification, live and quoted

[measured: connected MCP client, `musician`, 02:2xZ — after the writes]

- `list_library` → visible **684**, `duplicate` **99**, `archived` **2**, `eligible` **785**.
- **Arithmetic closes exactly:** 687 − 5 hidden + 2 restored = **684**. 96 + 5 − 2 = **99**.
- **G1 identity holds:** `785 == 684 + 99 + 2`.
- `search_library "Barchu Walkdown"` → 1 row, `upload-046649f0`, **`status: active`** ✓
- `search_library "Od Yavo Shalom Aleinu"` → 4 rows, `upload-4f05ce1a` among them, **`active`** ✓
- Each of the five pairs now returns **exactly one visible row, the properly-named one**:
  `Niggun - Bonia Full Score` ✓ · `Twilight (D Goldenberg)` ✓ · `Hashkivenu (Randy)` ✓ ·
  `G-minor Spirits` ✓ · `B-minor Simple Tune` ✓
- **Rosh Hashanah guard (R-0901-vision-8 §1), quoted after the writes:** `shirei-tshuvah` **184 / `feed`**;
  `shabbat-shacharit` 144 / `feed`, `shabbat-maariv` 69 / `feed`, `crc-friday` 48 / `pagemap`,
  `crc-saturday` 102 / `pagemap`. ✓

## 4 · Still open, for other hands

**FOR DANIEL:** the **12 audio groups** from the sweep's §8, where every voice part of a piece shares one
byte size — `Avinu Malkeinu Janowski D minor` Alto/Bass/Soprano/Tenor all at 1,572,779 B, `May The Memory`
at 1,510,921 B across five, `Barechu_trad` at 951,274 B across five. **Untouched and unhashed.** If those
are one file under five part names, a singer rehearsing an inner voice is hearing the full choir. It needs
someone who can play them.

**FOR COWORK (`live-cw`), unchanged and now sharper:**
(a) `dedupe_library` cannot find any of these five — different names, identical bytes — and cannot reverse
any of the 99. **A content-hash column on `library_index` plus a hash-keyed pass is the shape that closes
both**, and `undo_dedupe_group` is still missing.
(b) Two of the five hidden rows are the *bonded* row of their pair. Harmless today because the bytes are
identical and bonds resolve, but a future dedupe that picks by name alone could hide a bonded row whose
twin is **not** identical. **The canonical picker should prefer the bonded row when all else ties.**

Claude records; Daniel decides.
