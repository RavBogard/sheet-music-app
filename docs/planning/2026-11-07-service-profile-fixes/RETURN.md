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
