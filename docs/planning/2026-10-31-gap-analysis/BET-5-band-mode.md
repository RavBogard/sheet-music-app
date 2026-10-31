# Bet 5: Brothers Lazaroff band mode (the gig model)

Evidence: `research/tenant-and-family.md` (TF ids).

Decisions:
- BL wording uses its own branding (shipped in #32).
- Gig fields (the lead's call; Daniel had no preference): venue, address, load-in, soundcheck,
  start, end, and set lengths with a running total.
- No fee field.

Everything is additive and optional. CRC is unaffected unless stated. The Overlays contract
fields are unchanged, and nothing new is emitted to `today.json`.

## Shared data model
- **Setlist** `gig?: { venue?, address?, loadIn?, soundcheck?, start?, end?, contact?, notes?,
  setTargets?: [{ headerRowId?, minutes }] }`.
  - Times are `HH:mm`, in the tenant's local time.
  - `contact` is free text.
- **Track:**
  - `durationSec?: number` is set by the author or copied from the song's `durationSec`.
  - `segue?: boolean` means the song runs straight into the next one.
  - `singerKeys?: [{ musician: string, key: string }]` records a key per singer. Never choose a
    key for anyone.
- **Song** (library or `songs` doc): `durationSec?: number`, the default length.
- **Contact:** `instrument?: string` and `transposition?: "C"|"Bb"|"Eb"|"F"|"bass"`.
- **Set totals:** sets are the rows between header rows. The total for a set is the sum of its
  rows' `durationSec`. Rows with no duration are counted and reported as "n songs untimed".

## PR B5a: data + MCP (`src/lib/**`, `src/types/**`, MCP tools, `firestore.rules` only if needed)
1. **Types and writes.**
   - Add the fields above, with zod validation in the write paths.
   - `update_setlist` takes `gig`.
   - `update_track` takes `durationSec`, `segue` and `singerKeys`.
   - `update_song` takes `durationSec`.
   - Contacts take `instrument` and `transposition`.
2. **Totals.** A pure `setTotals(tracks, gig)` returns `[{ header, seconds, untimed, targetMinutes?, overUnderSec? }]`.
   - `read_back_setlist` and `get_setlist` include `setTotals` for band tenants (and for CRC
     when durations exist).
3. **TF-05, draft for a band tenant.**
   - `draft_service` for band tenants accepts `basedOnSetlistId` (a past gig) and drafts from
     its order, with every song open except standing choices under the gig scope.
   - It never asks about rabbis. Band wording throughout.
4. **TF-08, BL agent guide.**
   - A short `agentGuide` for BL in `config-code.ts`: a set is for a show; to reuse a past gig,
     pass `basedOnSetlistId`; "keep it" is remembered across gigs; ignore the books, rabbi and
     honors tools.
   - Plain facts only.
   - Update the golden.
5. **TF-09, parts for subs.** `email-packets` / `generate_gig_packet` builds a transposed part
   per contact by `transposition`. Packets go out only when the leader runs the tool, and
   nothing is sent automatically.
6. **Tests:** setTotals as a unit test. A tenant test: CRC setlists without the new fields
   behave exactly as before, and BL cannot read CRC gig data. An emulator test for the writes.

## PR B5b: band UI (`src/app/**`, `src/components/**`), built on B5a's types
1. **Gig panel** in the setlist editor head, band tenants only. Venue, address and the times sit
   in a compact row; editing goes through the existing meta edit sheet.
2. **Set totals.**
   - Each header band shows "38:20 · target 45:00" (amber when over the target, quiet
     otherwise), plus "n untimed".
   - The editor head shows the gig's total.
   - The same appears on the Perform setlist page and on the print cover.
3. **Durations.** An inline mm:ss field on each row, band tenants only, or shown when any
   duration exists.
4. **Segue.** A small "→" toggle on a row. Perform and print show "→" between the two songs.
5. **Singer keys.** An expandable row detail listing singer → key. The key tag shows the key of
   the row's lead singer when one is set.
6. **Show sheet.** A one-page printable PDF from the print route: venue, address, times, sets
   with their songs and keys, segues, who sings and the totals. BL branding.
7. **Copy.** English and Hebrew, with translator notes. The visual language follows
   `docs/design/DESIGN.md`, with BL's teal theme.

## Rules
Both tenants get emulator and golden tests. B5b must not break CRC screens: the CRC editor shows
no gig panel and no duration fields unless durations exist.
