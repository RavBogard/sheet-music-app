# Service profile fixes — return (2026-11-07)

Order: Daniel's handoff of 2026-11-07, written after trying to make the B'nei Mitzvah Saturday
profile reflect what the band plays. His decisions were binding; this records what was built.

## Daniel's decisions (binding)

- Order: learned from history, plus rows Daniel or a band leader can pin. A pinned row is always
  in the order, in its pinned place. History still fills charts and decides the unpinned rows.
- Window: the last 5 regular services.
- Same song: by prayer moment first, then by chart, never by row title.
- A non-special setlist counts toward its profile as soon as it is saved.
- Membership goes by the tag, never the name. Untagged setlists count toward no profile. An adult
  B'nei Mitzvah has its own type and never feeds the youth profile.
- A B'nei Mitzvah prays from the Beit Mitzvah Siddur (the profile's book) or a family's booklet
  (`book: null`), chosen plainly.
- Shir Shabbat and Shir Keter each have their own type; neither feeds Friday night.
- Daniel and band leaders pin rows and set standards.

## What changed

- **Types.** `shir_keter` and `adult_bnei_mitzvah` join the catalogue, with core profiles
  (`shir_keter` on crc-friday; `adult_bnei_mitzvah` on the Beit Mitzvah Siddur, morning pages).
- **Tag-based membership** (`history/classify.ts`). The service type is the stored `serviceType`,
  else the `templateType` the setlist was made from. The name-based B'nei Mitzvah, Shir Shabbat and
  Friday-night inference is gone. A Shir Keter name no longer makes a week special.
- **Count on save.** `reseed_service_profile`, `seed_service_profiles` and `get_service_profile`
  learn from every saved setlist whatever its date. A draft leaves out only the setlists already on
  its own date; a past date's draft still reads only what came before it.
- **Slots** (`profiles/keys.ts`, `slot-uses.ts`). A row's slot is its stored moment, else its
  title's clear moment, else the one moment its chart has been played at anywhere in the history,
  else its chart (partGroup, else fileId), else — only with no chart — its normalised title. Every
  reader (profile rows, draft, read-back, profile match, standards, vsLast) takes the slot from the
  history index's one function, so a standard and a learned slot always line up. Older keys are
  still read as aliases.
- **Learned order** (`profiles/seed.ts`). A song whose slot is in at least half the window holds
  its own place in the order, whatever its neighbours; this is what learns Ma Tovu and Oseh Shalom
  (one chart each, a different title every week). Charts that take turns in one place are one row.
  Another setting of the same song (same name) in a kept row's place keeps the row; a different song
  there one week is dropped and said. Header and section rows match by their leading label.
- **Pins** (`profiles/pins.ts`, `mcp/tools/profile-pins.ts`). `pin_profile_row` /
  `unpin_profile_row`, admin or band leader. Pins live on the profile doc beside the learned rows, so
  no re-learn drops one. A pin names its place by `position` or `after`, else keeps its learned
  place. A pin that is already a learned row moves it. A pin with a chart also sets that slot's
  standard. The draft readback says `<row>: pinned, no chart` when a pinned row has none.
- **Standards from the library.** `set_standing_choice` / `clear_standing_choice` take a profile,
  a slot (moment, slotKey or title) and a library chart and key, with no setlist row. The result
  says which row of the current order the standard fills, or that none does yet.
- **Profiles without a saved doc.** `get_service_profile` and `read_back_setlist` use a core
  profile before any draft has saved it; `get_service_profile` now re-learns live and returns
  `origin`, `learnedFrom` and `pins`.
- **Book at draft time.** `draft_service` takes `book` (a slug, or null for the family's booklet).
- **Docs.** The `draft_service`, `reseed_service_profile`, `get_service_profile`,
  `set_standing_choice` and `clear_standing_choice` descriptions, and the agent guide's
  service-building section, say the new rules.

## Checked against real history

Run over the exported B'nei Mitzvah history with the tags the cleanup sets, the learner keeps
Ma Tovu (Cm), Oseh Shalom (Nava Tehila, Dm) and the Hakafah (Mizmor Shiru Ladonai) as usual rows
with their charts. Adon Olam is in too few services to be learned, so it needs its pin.

## Not done here

- The browser app has no profile screen, so pins and standards are MCP-only for now.
- A chart whose newer version has no partGroup is a different chart to memory (lineage is not
  followed for slot identity).

## One-time cleanup (applied 2026-11-07 through the CRC Music MCP, before this branch deployed)

"Type" is the classified type the learner read before the change (stored type, else the old name
rules). Every write set the type explicitly, so each setlist now counts by its tag alone.

| Setlist | Date | Type before → after | Other change | Why |
|---|---|---|---|---|
| Bat Mitzvah — Nov 7 (`9f288c3b`) | Nov 7 | bnei_mitzvah_saturday → same, now stored | — | tag made explicit |
| Sterneck Memorial Bar Mitzvah (`81e959e7`) | Oct 31 | bnei_mitzvah_saturday → same, stored | special stays true | Daniel excluded it from the pattern |
| Ami Chesed Bar Mitzvah (`4d4c5630`) | Oct 24 | by name only → bnei_mitzvah_saturday | special stays true | was untagged; Daniel excluded it |
| B'nei Mitzvah of Gavin Stein (`cd2010f4`) | May 30 | by name only → bnei_mitzvah_saturday | special false | untagged youth B'nei Mitzvah |
| Bnei Mitzvah Morning (`zyJGXUdI`) | May 9 | by name only → bnei_mitzvah_saturday | special false | untagged youth B'nei Mitzvah |
| Chase, Havdalah (`c5d41b02`) | May 16 | havdalah (legacy key) → havdalah_bnei_mitzvah | — | tag made explicit |
| Ray Slavin's 3rd Bar Mitzvah (`S7RaXpuS`) | Jun 27 | bnei_mitzvah_saturday (name) → adult_bnei_mitzvah | special stays true until deploy | an adult's; never feeds the youth profile |
| Ki Tavo Aug 29 copy (`JZd5mZhl`) | Aug 29 | bnei_mitzvah_saturday → same | renamed "Duplicate of Noa & Ezra Bogard B'nai Mitzvah (Aug 22) — not a service"; special true | copy of Aug 22 (carries its aliyot) |
| Shir Shabbat w/ Duo Andalus (`77d140d9`) | Nov 6 | friday_night stored (name made it Shir Shabbat) → shir_shabbat | — | Shir Shabbat |
| Shir Shabbat Oct 2 + 7 part copies (`2ddbe895`, `7d4ab95c`, `4caa619d`, `cc5b8c69`, `6b183c1c`, `b9e5d787`, `509e3eb8`, `c4265c51`) | Oct 2 | friday_night stored → shir_shabbat | — | Shir Shabbat; part copies never vote |
| Shir Shabbat Juneteenth (`a84f8cce`) | Jun 19 | by name → shir_shabbat | — | tag made explicit |
| 5/15 Shir Shabbat (`NWPBba50`) | May 15 | by name → shir_shabbat | — | tag made explicit |
| Shir Shabbat — — May 13 (`Ikl0sS4X`) | May 13 | by name → shir_shabbat | special true | copy of May 15 (same timestamp, a Wednesday) |
| Shir Keter Oct 16 · Crown Center + 3 part copies (`7470f02d`, `a8f2c7c0`, `e353277f`, `c03bb45a`) | Oct 16 | shir_shabbat (name) → shir_keter | special false on the main one after deploy | Shir Keter |
| Shir Shabbat — Crown Center (`993bd6bc`) | Aug 7 | shir_shabbat (name) → shir_keter | special false after deploy | Crown Center is the Shir Keter program |
| Shir Shabbat at Crown Center for Senior Living (`BeWLvkBJ`) | Aug 7 | shir_shabbat → shir_keter | special true | earlier copy of `993bd6bc` |
| Shabbat Morning — Sukkot I (`fff7942d`) | Sep 26 | shabbat_morning → sukkot | special true | holiday |
| Erev Sukkot with Nefesh Mountain (`9121d459`) | Sep 25 | friday_night → sukkot | special true | holiday |
| Simchat Torah with Klezundheit! (`6096fe3d`) | Oct 3 | shabbat_morning → simchat_torah | special true | holiday |
| Shavuot Yizkor (`UnjLqKTt`) | May 23 | shabbat_morning → shavuot | special true | holiday |
| Passover (`FB2yEICg`) | Apr 3 | untagged → passover | special true | holiday |
| Shabbat Morning Sh'lach (`QSlxlW63`) | Jun 13 | by name → shabbat_morning | special true | fewer-row copy of `ncbvBvwF`, same date and name |
| Shabbat mornings Sep 19, Sep 5, Aug 29 (`q1VvDawj`), Aug 1, Jul 11, Jul 4, Jun 13 (`ncbvBvwF`), Apr 25, Apr 18, Apr 11, Apr 4 | — | mostly by name → shabbat_morning | — | regular Shabbat mornings, tag made explicit |
| Retirement Celebration (`A4Ioe6v8`) | Jun 6 | by name → shabbat_morning | special true | a celebration week |
| Kabbalat Shabbat (`226309e2`) | May 22 | kabbalat-shabbat → friday_night | — | tag made explicit |

Already done in Daniel's chat session and kept: Eliana Levine Oct 10, Noa & Ezra Aug 22 and Max
Aug 8 tagged bnei_mitzvah_saturday; the standards set on bnei_mitzvah_saturday (an older slot key
is still read as an alias).

### Rabbi slots

None set: no regular Shabbat morning names its rabbi in the rabbi field or any row, and a rabbi is
never inferred. These need Daniel's word (each is a `shabbat_morning` with no rabbi slot, so it
feeds neither Shabbat-morning profile until set): Sep 19, Sep 5, Aug 29 (`q1VvDawj`), Aug 1,
Jul 11, Jul 4, Jun 13, Apr 25, Apr 18, Apr 11. Apr 4 already reads Daniel from its rabbi field.

### Left as they are

- `TX95Tb1N` (Noa & Ezra Aug 22 copy): undated, so it never counts.
- `yGl9DLjY` "B'nei Mitzvah Saturday — March 14" is dated Mar 21; the date is unclear.
- Empty shells (no song rows; never counted): Mar 28 ×3, Mar 21, Mar 14, Feb 28, Feb 21, Jan 31,
  Jan 3, Mar 27, Feb 20.
- Camp Sabra, Selichot, Yizkor, Confirmation, Mother's Day, Seui: untagged or special; no profile.

### After this branch deploys

- Set `special: false` on Ray Slavin (`S7RaXpuS`), Shir Keter Oct 16 (`7470f02d`) and Shir Keter
  Aug 7 (`993bd6bc`), so each feeds its own new profile. Doing it before the deploy would let the
  old name rules read Ray as a youth B'nei Mitzvah and Shir Keter as Shir Shabbat.
- Pin Ma Tovu, the Hakafah and Adon Olam on bnei_mitzvah_saturday (`pin_profile_row`).
