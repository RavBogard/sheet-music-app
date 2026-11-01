# Bet 6: family spine (week key + Beit Mitzvah card)

Evidence: `research/tenant-and-family.md` TF-12, TF-13 and TF-16.

Daniel's decisions:
- Pursue the week-key spine and a Beit Mitzvah card on the setlist.
- "Nothing is private… names can be in there", so student names may show on the setlist.

Every change is additive. The Overlays contract fields are unchanged and only new fields are
added. `today.json` gets new optional keys only (`src/lib/today/types.ts` must keep every
existing key and type).

## 1. Week key (CRC only)
- **Setlist** gets `weekKey?: string`, formatted `"<hebrewYear>-<parashaSlug>"` (for example
  `5787-bereshit`). Holidays with no parasha use the holiday slug (`5787-sukkot-1`).
  - Computed at create and clone time, and on an `eventDate` change, from the existing Hebcal
    logic in `liturgical-calendar.ts`.
  - An advisory field only; it never drives behaviour.
  - Add an F-05 back-fill tool for existing CRC setlists (dry run by default; OPS_TOOLS).
- **Readers:**
  - `get_setlist`, `list_setlists` and `read_back_setlist` include `weekKey`.
  - `today.json` adds an optional `weekKey`, plus `parasha: {slug, name}` (names only, never text).
  - The setlist header shows a small parasha chip ("Parashat Bereshit"); CRC only.

## 2. Occasion and ceremony
- **Setlist** gets `occasion?: "bnei-mitzvah" | "holiday" | "guest" | "regular"`, and
  `ceremonyId?: string`, an opaque id from the Beit Mitzvah portal bridge.
  - Set when the bridge (`/api/integrations/beit-mitzvah/v1`) creates or links a setlist.
  - Otherwise inferred from the stricter classification in `src/lib/history/classify.ts`.
- `today.json` adds an optional `occasion`.

## 3. Beit Mitzvah card (CRC only)
- On a setlist with a `ceremonyId`, show a read-only card in the editor and on the Perform
  setlist page. It contains:
  - the student name(s), allowed per Daniel;
  - the service slot;
  - the Torah and haftarah reference names;
  - the rehearsal dates.
- The data comes from the bridge's `projection` endpoint, per `CONTRACT.md` in
  `docs/planning/2026-10-20-beit-mitzvah-service-bridge/`. Read it server-side, cache it briefly,
  and fail quietly: the card hides when the portal is unreachable.
- References are names only (for example "Genesis 1:1–2:3"), never verse text.

## Rules
- No liturgical text, ever.
- Brothers Lazaroff is unaffected: no `weekKey`, no chip, no card.
- Tests:
  - a unit test for `weekKey` computation (regular weeks, holidays, the year boundary);
  - a tenant test;
  - a today.json shape test that every old key is unchanged;
  - an emulator test for the back-fill.
- After merge, the lead runs the back-fill dry run, reviews it, then applies.
- Tell Overlays in `docs/planning/2026-09-24-overlays-asks/` with a short note,
  `OVERLAYS-NOTE-weekKey.md`, listing the new optional fields.
