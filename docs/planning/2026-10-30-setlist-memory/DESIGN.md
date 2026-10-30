# Setlist memory — design

2026-10-30. Written from an interview with Daniel and an analysis of every setlist in the CRC
tenant (60 real services, January–November 2026, 995 song rows, 832 library charts). David's own
account of how he works is pending: a prompt was sent for his Claude to mine his chat history and
email it to Daniel. Fold it in when it arrives (§11). It will add song-level detail; it is not
expected to change the shape.

## 1. Why

"Give me the setlist for Shabbat" in Claude should produce a setlist that is right the first time:
the right songs, the right chart (arranger), the right key, the right siddur pages. Today it often
picks the wrong arranger and the wrong key, and every correction is forgotten by next week.

David builds most Shabbat setlists through Claude. Daniel sometimes builds one by voice while
driving to shul. Both need the same thing: Claude should already know what this service usually
is, say only what is different, and remember what they tell it.

What the data shows (full numbers in §10):

- 39% of setlist song rows and 51% of library charts carry no key. "Wrong key" is mostly "no key
  on record".
- There is no way to ask "how did we do this song last time". Claude matches titles from scratch.
- Corrections do not stick. "Bonded to 'Shema (major)' — confirm arrangement" was asked on Aug 22,
  Aug 29 and Oct 10. The learning loop that exists in code (`record_bond_correction` →
  `titleContextHints`, 3-pick threshold) has never fired: every library row's correction counter
  is 0, because those tools are on the admin-only surface (`src/lib/mcp/surfaces.ts`), not the
  authoring one.
- The arranger lives only inside the title's parentheses. Mi Chamocha has 15 library charts,
  Bar'chu 14, Oseh Shalom 11; several of those "charts" are instrument parts of one arrangement.
- In practice each song has one or two real versions per service (Adonai S'fatai is always
  "(trad)", Em 14× vs Dm 11×; Shabbat-morning Mi Chamocha is mostly "Moshav morning, E"). The
  pattern exists; nothing records it.
- Shabbat morning shares about half its songs week to week; Friday often shares almost none
  (guests, special Shabbatot). "Clone last week" is the wrong starting point.
- Oct 2 was built as 7 setlists, one per instrument part.
- `templateType` is inconsistent (`friday_night` / `shir-shabbat` / `shir_shabbat` /
  `kabbalat-shabbat`, blank on 14). `rabbi` is free text. `book` is missing on more than half.
  Vocal Lead is filled on 10% of songs.

## 2. Who and where

- **David** — main author, Claude Desktop / claude.ai, on screen. Also uses the Brothers Lazaroff
  tenant (BrosLaz connector) heavily.
- **Daniel** — occasional author, often by voice with no screen.
- **The band** sees the result in Perform mode on iPads. Nothing here changes Perform.
- Both tenants are live. Everything in this design is per tenant; a BrosLaz preference never
  reaches a CRC setlist. The way David asks should work identically in both.

## 3. Goals, non-goals, anti-goals

**Goals**
1. A regular week's setlist comes out right with no chart or key corrections.
2. Claude reads back only what differs from the usual, and says why.
3. Anything Daniel or David says to keep becomes the standard for next time, without a separate
   step.
4. Every row that has a page in the day's siddur shows the right page.
5. Claude and analysis tools can read setlist history quickly: one song across services, and the
   whole archive in one call.

**Non-goals**
- No change to Perform mode or the iPad surface in this project.
- Not a recommender. It never suggests a setting, melody or song nobody chose (§4).
- Not publishing or notifying; those are retired / separate.
- Monitoring (wedge mixes) for Daniel and David is a separate conversation, taken up after this.

**Anti-goals: things that would make this a failure even if it works** (Daniel's picks)
- **It becomes a chore.** The strongest reaction. Claude must rarely ask. Building a setlist must
  take less effort than today, not more.
- **Too much talking.** The readback must be short: the 2–5 exceptions, then "the rest is your
  usual". Never a 25-row recital by voice.
- **Confidently wrong.** "Your usual" may only be said when the record backs it (§5.3). A guess
  must sound like a guess.
- (Also agreed, weaker: learning the wrong thing from an odd week; Daniel's and David's
  preferences silently fighting.)

## 4. Hard constraints (existing repo rules)

- **Never propose which setting or melody the band plays** (RULINGS-AUDIT-2026-09-19). Profiles
  *recall* what a person chose or what was actually played. They never fill a slot with a setting
  nobody has used for that service, and never suggest switching to one. When a slot has no record,
  Claude says so and asks; it does not pick.
- **Row order is the author's** (R11-b). Building a new setlist from a profile is the author's
  action; nothing re-sorts or edits an existing setlist on its own.
- **Publish is retired.** Do not reintroduce it.
- **Overlays contract**: setlist `id, name, date, eventDate, tracks[]`; track `id, order, title,
  type, songId, notes, liturgyRef, momentId` keep their names and types. Adding fields is fine.
- **No liturgical text in this repo.** Ids, names and page numbers only. Page numbers come from the
  printed edition's registry (`src/data/books/*.json`, regenerated from shireishabbat, never
  hand-edited).
- **Multi-tenant**: every new collection and query is tenant-scoped, with emulator tests asserting
  both tenants.

## 5. The design

### 5.1 Service profiles (living templates)

A **profile** is the standing description of one recurring service. It is the old template idea,
kept up to date by use. CRC's core profiles:

| Profile | Service type | Rabbi slot | Book |
|---|---|---|---|
| Daniel Friday night | `friday_night` | `daniel_karen` | `crc-friday` |
| Randy Friday night | `friday_night` | `randy` | `crc-friday` |
| Daniel Shabbat morning | `shabbat_morning` | `daniel_karen` | `crc-saturday` |
| Randy Shabbat morning | `shabbat_morning` | `randy` | `crc-saturday` |
| Shir Shabbat | `shir_shabbat` | — | legacy + handout now; new printed siddur in ~6 weeks |

Beit Mitzvah services use the Beit Mitzvah profile and either the new Beit Mitzvah siddur or the
family's custom printed booklet (legacy). Holidays and other special services keep their existing
one-off templates and are not learned from by default.

*My call:* Rabbi Karen shares Daniel's profiles, because the code already pairs them as one rabbi
slot (`CRC_RABBI_SLOTS` in `src/lib/templates/service-types.ts`). Separate Karen profiles are a
later split if needed.

A profile holds:
- the running order: headers and rows, as today's templates do, with `momentId` / `liturgyRef`
  where the row is a liturgical moment;
- for each song slot, the **house version**: chart (fileId), key, and optional lead and notes;
- **provenance** for each house version: who set it and when ("Daniel, Oct 30: 'keep it in Dm'"),
  or what the record shows ("played 6 of the last 8 Randy Shabbat mornings");
- its book.

A standing key change updates the profile, never the library row: the library keeps the key the
chart is *written* in, the profile keeps the key it is *played* in.

*My call:* profiles extend the existing `templates` collection (which already has
`templateType` and per-slot `onlyFor` rabbi slots) rather than a new parallel store, because
Daniel asked to bring templates back. The builder may choose otherwise if the template shape
can't carry provenance cleanly; the behaviour is what matters.

**Two kinds of memory** (my call, from the builder check):
- **Moment slots.** A liturgical moment in the running order (Bar'chu, Mi Chamocha, Oseh Shalom…)
  carries its usual setting for that profile, which is what people mean by "Mi Chamocha" on a
  Randy Shabbat morning.
- **Per-song memory.** Independently of slots, every song remembers its chart, key and lead per
  profile (and per service type as a fallback), wherever it turns up. A song named for an open slot
  ("let's do Esa Einai") gets its remembered version.
- **Who fills the slots that change week to week.** Claude fills a slot only when its tier is
  *standard* or *usual* (§5.3). Every other slot is left open and listed as an exception ("nothing
  usual for the opener this week. What do you want?"). Daniel or David name those songs. This is
  what the never-propose rule (§4) requires, and it is why a Friday with guests will have more
  open items than a regular Shabbat morning.

**Who may make a standing change:** admin and band_leader roles (the existing trusted-leader set),
enforced server-side. The new tools live on the authoring surface, not the admin surface where the
old learning loop sat unused.

**Brothers Lazaroff** gets song history, per-song memory and standing changes. Gigs are not
recurring services, so no BrosLaz profiles are seeded. A gig-type profile can be made later the
same way if David wants one.

**Seeding.** Each core profile is seeded from its own past setlists. Daniel or David reviews each
seeded profile once ("here's what I think a usual Randy Shabbat morning is; the three I'm unsure
of are…"). That is a one-time review per profile, not a recurring chore.

### 5.2 One-off vs standing changes

Every change during authoring is one of two kinds:
- **One-off**: "do Cm this week". Changes this setlist only.
- **Standing**: "move it to Dm and keep it there". Changes this setlist *and* the profile.

Rules, chosen to avoid the chore anti-goal:
- On a **special** week (§5.5), a change is a one-off unless the person says "keep it" or
  "from now on".
- On a **regular** week, explicit words decide ("this week" → one-off; "keep it / from now on /
  always / standard" → standing). With no such words, a chart or key change is a one-off, and
  Claude says in one line at the end of the readback: "Dm is just for this week. Say 'keep it' to
  make it standard." No question is asked.
- **Repetition promotes.** If the same one-off change is made on the same slot of the same profile
  three times running, Claude offers once: "Third week in Dm. Make it standard?" This reuses the
  intent of the existing 3-pick threshold. It is an offer about the person's own repeated choice,
  never a suggestion of a new setting.
- **Every standing change is announced** in one line ("Mi Chamocha is now Moshav morning in E for
  Randy Shabbat morning") and is undoable by saying so.
- **Daniel and David both write the same profiles.** The latest standing change wins, and its
  provenance shows who made it. When a standing change overrides the other person's recent one,
  the readback says so ("David set this to Em on Oct 22; now Dm"), so a tug of war is visible
  rather than silent.

### 5.3 Confidence ladder: what Claude may say

The server, not the model, decides which phrase applies to each row, and returns it with the
draft. This is the guard against "confidently wrong".

| Tier | Meaning | Claude says |
|---|---|---|
| standard | a person set it as standing on this profile | "your standard …" |
| usual | the same chart+key on at least N of the last M non-special services of this profile | "the usual …" |
| last time | it has been done on this profile, but not consistently | "last time it was … (in E)" |
| other service | done, but only on a different profile or service type | "done before at Friday night, not here" |
| new | no record | "new — which chart?" (asks; never picks) |

N and M are left to the builder (suggested: 3 of the last 5). A row with no key on record never
claims a key tier; it says "key not on record".

### 5.4 The request and the readback

"Give me the setlist for Shabbat" (or "for Friday", "for the 14th"):
1. Resolve the date and the service(s), and **always get the leading rabbi from the person building
   the setlist** (Daniel's ruling). Claude does not infer it from past weeks or other data. If the
   request didn't say ("Randy's Shabbat morning"), Claude asks "Randy or you this week?" before
   building, and the server refuses to build from a profile without a rabbi slot. This is the only
   question in a regular week, and it is skipped when the request already names the rabbi.
2. Start from the profile, not from last week.
3. Apply any known exceptions for this week (§5.5).
4. Read back **exceptions first**, then one line for everything else:

   > Randy Shabbat morning, Nov 7, CRC Saturday siddur. Three things: Adonai S'fatai is in Dm, your
   > standard since Oct 30. Esa Einai is new for this service; I used the Nichols song sheet from
   > Oct 31. Leslie's Hallelujah still has no chart. Everything else is your usual Randy Shabbat
   > morning, 17 songs.

5. Short answers work: "yes", "change number 2", "the other one", "keep it in Dm". A "yes" commits.

The same exceptions-first summary is the on-screen default for David, as a short list instead of a
full table; the full table is available on request.

The existing propose → confirm → commit staging stays as the mechanism. Only the conversation on
top of it changes. The MCP agent guide (`src/lib/mcp/agent-guide.ts`) is rewritten for this flow,
including that low-confidence title matches are resolved by the profile and history first, and
only asked about when those are silent.

### 5.5 Special weeks

- A setlist can be marked **special** (a guest band, a memorial, a holiday). "Special" is a flag on
  the setlist; it defaults on for holiday service types and is set by Claude when the author
  describes a guest or a one-time occasion. B'nei Mitzvah services are **not** special by default.
  The B'nei Mitzvah profile learns its frame from them, and the family's own requests enter as
  one-off exceptions (§5.2).
  Special setlists don't count toward "usual", and their changes are one-off by default. This is so
  that, say, this Saturday's requests from Bryn never become the Shabbat morning standard.
- Requests come by email, sometimes by text. Claude reads email through the client's Gmail
  connector, not through this server ("use Bryn's email about Saturday"). It turns each request
  into an exception against the profile and reads back only those. Texts are pasted or dictated.
- **Open items stay visible.** A request that can't be fulfilled yet ("chart still needed", "new
  arrangement in progress; swap when it lands") is recorded as an open item on the setlist and
  repeated in every readback until it is resolved.

### 5.6 Siddur and pages

- Each profile names its book. A new setlist gets the profile's book, and every liturgical row gets
  its page from that book's registry. Today `propose_liturgy_bindings` and `lookup_book_page`
  already do this per row; this design makes it automatic at build time.
- **Gap:** the Beit Mitzvah siddur is not in this app's book registry (`list_books` returns
  crc-friday, crc-saturday, crc-machzor-2008, the Shirei Shabbat / Tshuvah feeds and two legacy
  feeds). It does exist in shireishabbat as `legacy-beit-mitzvah` (86 pp,
  `typst/shirei-shabbat-LEGACY-BEIT-MITZVAH.typ`). Emitting it through
  `emit_live_books.py` is in scope, as a producer task in shireishabbat under that repo's rules.
  Page work for the other profiles does not wait on it.
- *My call:* until the new Shir Shabbat siddur exists, Shir Shabbat rows take pages from
  `legacy-shabbat-evening` where the moment matches, and handout items carry no page.
- A custom printed B'nei Mitzvah booklet has no registry. Rows get no page unless someone supplies
  pages for that setlist. A wrong page is worse than none.
- The new Shir Shabbat siddur, when printed, is added as a book and becomes that profile's book.

### 5.7 History access

Two reads, both tenant-scoped:
- **Song history**: for a song (title, stem or fileId), optionally narrowed by profile or service
  type, give every time it was done: date, service, rabbi slot, chart, key, lead, special or not,
  and who authored it. This is what Claude uses during authoring, and it feeds the confidence
  ladder.
- **Bulk read**: every setlist in a date range with its tracks in one compact call, for analysis
  like the one behind this design. Today that took 80 separate calls.

Where a service was reconciled ("as performed", `reconcile_service` / `performedDeviations`),
history should prefer what was played over what was planned.

### 5.8 Data cleanup this depends on

- **Keys**: back-fill library keys where evidence is strong (the chart's own AI-enrichment
  `suggested_key`, or consistent use on setlists), and leave the rest blank rather than guess.
- **Arranger**: a real field on the library row, parsed from the title's parentheses where clear,
  and editable.
- **Instrument parts**: link part rows ("Barchu (Walkdown) Bb / Eb / C / Bass Clef", the L'cha
  Dodi saxophone, clarinet and trumpet parts) to their parent arrangement, so that history and
  profiles treat them as one song. *My call:* letting one setlist serve every instrument in
  Perform (instead of 7 setlists) is a follow-up project, because it changes the iPad surface. This
  project only makes the data ready for it.
- **Service type, rabbi slot and book** on setlists: normalize to the catalog keys in
  `service-types.ts` and the rabbi-slot keys, and back-fill past setlists where it can be inferred,
  so that history can be split by profile.
- **Existing learning loop**: either move the correction signal onto the authoring path (every
  `swap_chart` / chart change during authoring records a correction), or replace it with the
  profile mechanism. Don't leave two learning systems.

## 6. What success looks like

- On a regular Shabbat, the first draft needs no chart or key change for every row whose profile
  slot is at the "standard" or "usual" tier.
- A voice readback for a regular week is 5 items or fewer.
- No correction has to be given twice. A standing change made once is honoured next week.
- No "your usual" claim that the record doesn't support.
- Building a regular setlist takes fewer turns than today.

## 7. Decided by Daniel

- Profiles = living templates for the core services listed in §5.1, plus special services.
- Standing changes are remembered and become next week's default.
- The readback is relative to history and exceptions-first ("same one as usual", "you usually do
  that in Dm, not Cm").
- Book per service: Friday → CRC Friday siddur; Shabbat morning → CRC Saturday siddur; Beit
  Mitzvah → new Beit Mitzvah siddur or the family's custom booklet; Shir Shabbat → legacy +
  handout, a new printed siddur in about 6 weeks.
- Fast history access, and a quick way to read all setlists, are wanted.
- The leading rabbi always comes from the person building the setlist. Claude insists on it and
  never infers it (§5.4).
- All of the §1 findings were confirmed as problems.

## 8. My calls (Daniel to check)

- Karen shares Daniel's profiles (§5.1).
- Profiles extend `templates` (§5.1).
- Default with no explicit words is one-off, announced in one line, with a promotion offer at three
  repeats (§5.2).
- Latest standing change wins, and overrides are announced (§5.2).
- Per-instrument Perform is a follow-up project; this one only links the parts (§5.8).
- Special weeks are excluded from "usual"; B'nei Mitzvah are not special by default (§5.5).
- Moment slots plus per-song memory; open slots are listed, never filled by guess (§5.1).
- BrosLaz: history, per-song memory and standing changes; no seeded profiles (§5.1).
- Standing changes: admin + band_leader, server-enforced (§5.1).
- Shir Shabbat pages from `legacy-shabbat-evening` until the new siddur (§5.6).

## 9. Left to the builder

Storage shape, tool names and signatures; N/M for "usual"; how the server returns the
exceptions summary; migration and back-fill mechanics and their dry-runs; whether the old
bond-correction tools are retired or rewired; how a setlist gets marked special (an explicit flag,
inferred from service type, or both).

## 10. Analysis numbers

Scripts and raw pulls (not committed, session scratchpad): `fetch.mjs`, `an1.js`–`an3.js` and
`data/` in the session scratchpad.

- 60 real services (excluding copies, templates, tests and 10 per-instrument part setlists); 995
  song rows: 83 unbound, 79 bound to a chart no longer in the visible library, 390 with no key, 12
  whose key differs from the library's.
- 333 distinct song stems; 108 used 3+ times; 52 bound to more than one chart over the period.
- Library: 832 rows; 428 keyless; 221 titles with no clarifier; 376 with siblings of the same stem;
  correction history 0 on every row.
- Authorship: David 52 setlists, Daniel 28.

## 11. Pending

- David's workflow report (emailed to Daniel). Fold its house-version and friction findings into
  §5 and the seeding of §5.1.
- Monitoring for Daniel and David: a separate conversation, next.
