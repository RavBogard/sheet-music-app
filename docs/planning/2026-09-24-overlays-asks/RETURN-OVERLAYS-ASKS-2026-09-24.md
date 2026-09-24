# Return — Overlays' four asks about the setlist import (2026-09-24)

Overlays now builds a prepared service from a centralreform.live setlist
(`prepare_service_from_setlist`). It sent four asks. Here is where each one stands.

## 1. A read-only `setlist_reader` credential — it already exists and is installed

[measured: `list_setlist_reader_bearers` on `/api/ops/mcp`, 2026-09-24]

| field | value |
|---|---|
| tokenId | `Csm0Fm1bGLXej8gshUjM` |
| purpose | `crc overlays setlist import (Prepared services, 2026-09-14)` |
| allowedTools | `list_setlists`, `get_setlist`, `get_congregation_context` — nothing else |
| orgId | `crc` |
| minted | 2026-09-14T12:45:57Z, no expiry, not revoked |
| lastUsedAt | 2026-09-14T17:19:40Z |

The scope is enforced at the request layer (`src/lib/mcp/scoped-bearer-gate.ts`): any other tool gets
`forbidden_scope` before the server dispatches it, and `tools/list` only shows the three.

[measured: `vercel env ls` in `~/crc-overlays-vercel`, project `crc-overlays`] Overlays' Vercel project
has had `CRC_LIVE_READ_TOKEN` and `CRC_LIVE_BASE_URL` in **Production** since 2026-09-14. So the "not
set up" answer can only come from an environment without them: local, preview, or the TBI deployment.
I did not decrypt the value to check it is this token. The dates line up (created the same day, last used
that afternoon).

One thing doesn't fit. Overlays says its one real read was the 19 September Ha'azinu setlist, but this
credential's `lastUsedAt` is the 14th. So that read went through some other bearer, probably an admin
one. That's worth Overlays checking. Nothing new was minted, so no secret went into chat or into this file.

## 2. Book and page identity

**What each `book` value is:**

| `liturgyRef.book` | the printed booklet | Overlays' matching source (same shireishabbat feed) |
|---|---|---|
| `crc-friday` | CRC Friday Siddur (Kabbalat Shabbat), pp. 2–48 | `legacy-shabbat-evening` (`dist-app/legacy-shabbat-evening-feed.json`) |
| `crc-saturday` | CRC Saturday Siddur (Shabbat morning), pp. 50–101 | `legacy-shabbat-morning` (`dist-app/legacy-shabbat-morning-feed.json`) |

**`folio` is the page number printed in the booklet.** It is also the feed's `printedFolio`, **not** its
`folios` field. The feeds' `folios` restart at 1 because they count the reader edition, and they disagree
with the printed page on 73 of 78 evening units and 95 of 95 morning units
[inherited: RETURN-CODE-AUDIT-2026-09-19-W3 §(n), measured on the feeds]. Saturday continues Friday's
numbering, so the two books never share a page number.

**Unit ids — landed today, `0ac23889`, deployed.** Booklet rows now carry the legacy feed's unit id next
to the book and page:

```json
{ "book": "crc-saturday", "unitId": "awakening.modeh-ani@legacy-shabbat-morning", "folio": 51 }
```

The row also carries `momentId` (`"modeh-ani"`). `book` stays the booklet, because that's the book in the
room. The id names its own feed in its suffix. How it works:

- The crosswalk goes through `moments.json` only: the lookup's draft unit gives a moment, and the
  moment's `legacy-shabbat-*` occurrence gives the id. That id is used **only if it prints on the row's
  own page**. Nothing is matched by name. Anything else leaves the row page-only, as before.
- Every write path uses it: bind-on-type, `propose_liturgy_bindings`, service frames and templates.
- Existing rows that already had a page get the id through the new `identified` bucket of
  `propose_liturgy_bindings`. It adds only `liturgyRef.unitId` and `momentId`. The page and row order
  are never touched.

**Run on the Ha'azinu setlist** (`cd16ef0f-d874-47fc-9085-d85fdcc2054d`): a dry run first, then a real
run. 13 rows written: 12 identified, plus Kedushah, which had no page and got p.74 by an exact
match. [measured: `get_setlist` before and after] The setlist has 35 rows before and after, 0 pages
moved, 0 rows reordered, and 13 rows now carry both `unitId` and `momentId`.

**Coverage and gaps.** [measured: `src/lib/books/__tests__/companion.test.ts` and a scratch script over
the committed data] 16 of 27 Friday and 33 of 38 Saturday confirmed lookup entries crosswalk. The other
16 have no legacy unit for their moment on that page, and they stay page-only. Overlays should keep its
title fallback for those:

- Friday: Lighting the Candles 5, Shalom Aleichem 6, L'cha Dodi 8, V'ahavta & Tzitzit 16,
  Mi Chamocha 18, Hashkivenu 20, The Silent Amidah 23, Modim 29, Elohai N'tzor 31, Priestly Blessing 45,
  Kiddush 46.
- Saturday: Eilu D'varim 57, The Sh'ma 63 (the feed prints its Sh'ma at 64), V'ahavta & Tzitzit 65,
  Ein Kamocha 83, Birkat Kohanim 100.

Most of these are the same prayer under a different moment stem: `candles-candle-blessing`,
`lchah-dodi`, `hashkiveinu`, `hodaah`, `kiddush-evening`. The fix belongs in the moments producer
(`shireishabbat/build/tools/emit_moments.py`) as merges. It does not belong in a name-matcher here. The
Sh'ma 63/64 split is a page question like "Returning the Torah" p.90/89, and it is **for Daniel**.

## 3. TBI — no tenant planned

centralreform.live has two orgs: `crc` and `brotherslazaroff` (`src/lib/org/registry.ts`). No TBI org
exists or is planned. The nearest ruling is Idea 13 (RULINGS-INTEGRATION-2026-09-14): the family as a
product other shuls can install is "love this so much, but not right now". So TBI should build its
services another way. If Daniel ever opens a TBI tenant, it would get its own `setlist_reader` minted
from a TBI-org bearer, because a crc bearer cannot mint for another org.

## 4. Field stability — promised, and written into `CLAUDE.md`

Everything Overlays reads exists today with those names [measured: `get_setlist` on Ha'azinu]. The
repo's `CLAUDE.md` now has a standing line saying not to rename or retype them without telling
Overlays first. Three notes:

- `date` is when the setlist was last touched, not the service day. **`eventDate` is the service date.**
- `type` has one more value than Overlays listed: `transition`. The full set is `song | header |
  reading | prayer | transition | note`.
- `liturgyRef` may now carry `unitId` (above), and after a book switch `stale: true`, meaning the page
  couldn't be re-found in the new book. Tracks also carry `momentId`. All of these are additions.

## Verification

`npx tsc --noEmit` is clean. The full `vitest run` passes: 4,954 tests, 31 skipped. The
`mcp-liturgy-bindings` and `mcp-outline-fields` emulator suites pass: 33 tests. Deployed
`0ac23889`, confirmed by `/api/version`, before the production run.

## Addendum — the Sh'ma is p.64 (R-0924-overlays-1)

Daniel, 2026-09-24: the printed Saturday booklet shows the Sh'ma on **p.64**, not 63. The `crc-saturday`
pagemap entry "Kriyat Sh'ma", row 17 "The Sh'ma" in `fixed-liturgy.crc-saturday.json`,
`fixed-liturgy.shabbat-shacharit.json` and `template-rows.saturday.json`, and both booklet notes now
say 64. "The One" (Echad Yachid) stays at p.63. As a result the Sh'ma crosswalks to
`shma.the-shma@legacy-shabbat-morning`, and Saturday coverage goes from 33 to 34 of 38. The ruling is
appended to `shireishabbat/liturgy-map/DECISIONS-LOG.md` but **not committed**: that file also holds
the print session's uncommitted R-0922-print-13..20, and committing it would carry them too.

Production rows corrected to p.64 with `shma.the-shma@legacy-shabbat-morning` (momentId `the-shma`)
[measured: `get_setlist` / `get_template` before and after, 2026-09-24]: Ha'azinu 9/19 "Sh'ma (major)",
Nitzavim-Vayeilech 9/5 "Shema (major)", template "Randy Shabbat morning" row 8, and template "B'nai Mitzvah
service" row 9. Row counts and order are unchanged; nothing else changed. Those were the only rows on
`crc-saturday` p.63 across all 87 setlists and 4 templates.
