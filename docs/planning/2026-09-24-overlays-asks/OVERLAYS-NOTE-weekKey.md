# Note to Overlays — the family week key (BET-6, 2026-10-31)

New optional fields only. Nothing Overlays reads today changed name or type:
setlist `id, name, date, eventDate, tracks[]` and the track fields are as before.

## On `get_setlist`, `list_setlists` and `read_back_setlist` (CRC only)

| field | type | meaning |
|---|---|---|
| `weekKey` | string, optional | `"<hebrewYear>-<slug>"`, e.g. `5787-bereshit`. A holiday with no parasha uses the holiday slug, e.g. `5787-sukkot-1`, `5787-shmini-atzeret`. Computed from Hebcal (Diaspora) for the service's day in Chicago. Advisory: absent when unknown, or when the date moved since it was computed. |
| `parasha` | `{ slug, name }`, optional | `get_setlist` and `read_back_setlist` only. The weekly portion's slug and transliterated name (`{ "slug": "bereshit", "name": "Bereshit" }`). Absent on a holiday week. Names only, never text. |
| `occasion` | `"bnei-mitzvah" \| "holiday" \| "guest" \| "regular"`, optional | Set by the Beit Mitzvah bridge on the services it creates or links; otherwise inferred from the service class. Absent when the service cannot be classified. |

`get_setlist` also passes through the stored `ceremonyId` (the Beit Mitzvah portal's opaque ceremony
UUID, no names) and the stored `weekKeyDay` is hidden. Join on `weekKey`, not on `ceremonyId`.

## In `today.json` (`public/today/crc.json`), per service

The same three optional keys: `weekKey`, `parasha: { slug, name }` and `occasion`. Every existing key
keeps its name and value (`src/lib/today/__tests__/today-family-keys.test.ts`). Brothers Lazaroff's
file gains nothing.

## Suggested use

Name a service record from `weekKey` (or show "Parashat <name>") instead of typing the week, and let
"Today's order" say "B'nei Mitzvah" from `occasion`. The Haftarah plugin can key its week on the same
string.
