# David's workflow notes: what release 3 takes from them

Source: a report David's Claude wrote from its saved memory (not chat transcripts), received
2026-10-30. It has no wrong-pick examples, no keys and nothing on instrument parts; for those the
setlist history is the better source and is already what release 2 learns from.

## Inputs for release 3 (readback and agent guide)

1. **"Shabbat" most often means Saturday morning.** That's the weekly service the music
   program is built around. The guide reads "the setlist for Shabbat" as Shabbat morning, says so
   in its first line, and still asks who is leading. Friday night, Shir Shabbat, B'nei Mitzvah and
   holidays are named explicitly when meant.
2. **Shir Shabbat is the monthly first-Friday Kabbalat Shabbat** (about 6:00 to 7:15, singing
   circle and potluck). A "Friday" request in a first-Friday week should ask "Shir Shabbat or
   regular Friday night?" rather than assume.
3. **Guest or featured weeks are special.** For example, Shir Shabbat on 2026-11-06 has Duo Andalus
   as featured guests. The guide offers `special: true` when the author mentions guests, so a
   one-off week never shapes the template.
4. **David's song picks are judged by each piece's job in the service** (opener, processional,
   closer, the build into Bar'chu). The readback names the slot by its moment ("Mi Chamocha: open,
   last time X"), never by a song title alone.
5. **Bonia Shur settings are being phased out.** We still never propose a setting. A Shur chart
   that is `usual` in history keeps being filled until someone replaces it. One answer ("use Y
   and keep it") makes Y the standard, and three regular weeks of Y promote it. The readback must
   make a long-standing `usual` easy to replace in one sentence.
6. **Greg Dallas charts** (L'cha Dodi, Shalom Aleichem, Shiru L'Adonai) are CRC house versions per
   David. History decides the tier; this is context for the guide's examples only.

## Checked, nothing to do

- Roster spelling: "Jake Weisman" is already correct in the app. Neither Shlomo Ovadya nor Jeff
  Briggs has an account.
- Drew Brodsky has two admin accounts (personal and engineer addresses). Left as is.

## For Daniel (not decided here)

- Brothers Lazaroff Hullabaloo tribute acts are secret in public materials. Setlist pages are
  public by design (perform links). If a Hullabaloo setlist names the acts, its perform link
  shows them. Whether BrosLaz needs a non-public setlist is a product decision for Daniel.
