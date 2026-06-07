# Cycle-7 Instance 5 — Contrarian HANDOFF

*from coder-5 · 2026-05-19 · wall-clock ~25 min*

---

## the most painful thing I found.

**The public landing page — `https://www.centralreform.live` — currently shows a cycle-7 test probe as the top, most-prominent setlist. Its title is mojibake'd, its description reads "CLEANUP AT HANDOFF", and its author is a synthetic test account.**

I opened the front door the way a stranger does. Typed the apex domain into the browser. No login, no bearer, nothing. The site 307s to `/perform`, titled "Upcoming Services & Setlists | CRC Music". The first setlist tile, sitting alone at the top above the fold, reads:

> **c7i1-Shabbat Morning � May 23 (probe)**
> Sat, May 23, 2026
> 0 songs

That em-dash isn't a render glitch. I curl'd the raw SSR HTML and hex-dumped the bytes — `EF BF BD` (U+FFFD REPLACEMENT CHARACTER) is baked into the stored title in Firestore. The em-dash Instance 1 typed (or that the system fed in) was lost before persistence. Same again in the body, where `Randys` is missing its apostrophe.

I clicked the tile. The detail page (also fully public, no auth) renders:

> **c7i1-Shabbat Morning � May 23 (probe)**
> 0 songs
> *c7i1 cycle-7 probe template � Randys usual shabbat morning order. CLEANUP AT HANDOFF.*
> No tracks yet

Twice on the page — once as "created by" attribution, once as "audience" — the synthetic test account shows itself by name: **`c7i1-band_leader-db04aebb`**. That string is in the SSR HTML; I confirmed via curl.

The path to find this is literally: visit the homepage. There is no login wall, no admin filter, no "did you mean to be here?" — just the front door and the first thing it shows you.

### why this lands hard

There are three layers of pain stacked on top of each other, and each one is bad enough on its own that I keep going back and forth on which is worst.

**Layer 1 — the impression.** Daniel's primary growth move (per project memory) is onboarding David Lazaroff and, soon, the rest of the band. The very first thing they will see when they open the link Daniel texts them is this page. The very first tile they will read is "c7i1-Shabbat Morning — May 23 (probe)" with garbled punctuation and the word "probe" — and below it a description that ends in "CLEANUP AT HANDOFF." For anyone who doesn't know that "c7i1" means "cycle-7 instance 1" of an internal audit dispatch, this reads as either (a) the rabbi is bad at typos, or (b) the app is leaking developer scratch work. The professional read is the second one. Daniel asked for "bulletproof and easy and intuitive." This is the opposite — it's the moment where a careful user starts to wonder what else is wrong.

**Layer 2 — the systemic.** I started counting the rest of the page. There are **44 setlists** on `/perform`. Of those: **16 have no date at all** (they fall to the bottom of the list but still take up space — there is no pagination). **3 are titled "Bnei Mitzvah Morning (Template)"** with 0 songs — internal template documents leaking into the public list. **3 are titled "Friday Night — Parashat Vayakhel-Pekudei — March 8"** — three duplicate copies, all 0 songs, all dateless. **3 are titled "Shabbat morning"** — same shape, three abandoned drafts. There is a setlist literally titled **"testing"**. There is one called **"New Setlist"** — the placeholder name from a never-renamed draft. There is **"5786 / 2025 Kol Nidre Alternative Service Music Flow"** with no date and 0 songs, from last year. There is **"CF1 Eval — Friday Evening (May 22)"** — another eval probe, this one Daniel-authored, also publicly visible. Counting generously, maybe 12-15 of the 44 entries are real, intended-public setlists. The remaining 30-ish are noise. The page reads as the firehose output of a Firestore `collectionGroup` query with no curation — because that's what it is.

**Layer 3 — the structural reason it'll keep happening.** Project memory has the SEC-004 decision logged: `create_test_account`-owned writes set `isTest:true`, and `/perform` queries filter by `isTest:false`. C5A-003 added an `isTest:true` arg to `create_setlist` in cycle-5-fixes. That's the safety net. But it's **opt-in**, not derived from the caller's uid. Instance 1 called `create_setlist` with a `c7i1-band_leader-*` test bearer and did *not* pass `isTest:true`, so the setlist was filed as a real one — visible to the world. This will keep happening on every cycle. Every contrarian or disciplined probe that authors a setlist and forgets the flag pollutes the very surface the cycle is meant to be auditing. The audit method is self-polluting and the pollution isn't visible to the auditing instances *because they're authed and looking at their own work*. The contrarian view (this one) sees it; the disciplined views structurally can't. That's the meta-pain: **the cycle methodology is leaving footprints on the production surface every single run.**

I checked this against the cleanup story. `cleanup_all_test_data({uidPrefix: 'c7i1'})` is meant to sweep this. It hasn't run yet for c7i1 — Instance 1 is presumably still in flight. So in the steady state of "audit running, cleanup pending," the public surface looks like this. If Instance 1 crashes or forgets cleanup, it stays this way until a supervisor or Daniel manually nukes it. There is no TTL.

The user-painful framing: **for the duration of every cycle-7 run (and prior cycles that didn't perfectly clean up — there are still residual zero-song drafts on the page that pre-date this run), the front door is broken.** Daniel cannot show this page to David without first explaining it away. He cannot share the apex URL with a board member or a curious congregant without scrubbing first. A band member who taps the logo to navigate back from their setlist sees this — and there is no way to tell them "no, ignore that, the c7i1 thing isn't tomorrow." The pain isn't in any one bug. It's in the cumulative loss-of-trust posture of the surface that's supposed to be the welcome mat.

If I had to pick the single highest-leverage fix: **make `/perform` filter out setlists authored by uids matching `/^(test-|c\d+i\d+-|cf\d+-)/`, not just `isTest === true`.** Derive the filter from caller-uid shape, not from a hopeful opt-in flag. That eliminates the leak-source entirely, even when audit instances forget to set the flag. And while you're in there: filter out 0-song setlists older than N days, dedupe by `(title, date)`, hide entries with `(Template)` in the title from the public list. Three small additional filters and the firehose becomes a curated index.

---

## smaller cuts I noticed while I was there

These aren't the worst thing. They're sitting in the same wound, though, and I want to name them for whoever triages.

**Listing/detail track-count disagreement.** The tile "5/15 -- Shir Shabbat Fri, May 15, 2026" advertises **15 songs** on the listing. I clicked through and the detail page rendered "**0 songs**" and "No tracks yet" — both server-rendered, not a hydration race; I waited 3s and re-snapshotted. Curl confirms the body. So the listing's `trackCount` is denormalized on the setlist doc and has drifted from the actual tracks subcollection. A band member promised "15 songs in tonight's set" who lands on an empty page is going to feel that hard. I didn't characterize root cause — it could be a delete-without-trackCount-decrement, or a track-collection migration that didn't propagate. One setlist, but the failure mode is "the link Daniel texted me is broken" and that's exactly the band-trust thing.

**Mojibake floor on stored titles.** The `EF BF BD` bytes in the c7i1 title are persisted. Any chart, song, or setlist authored through a path that passes JSON through a Latin-1-decoding hop will end up with this. Project memory + recent decision log doesn't reference a charset/encoding audit on the MCP write path. Worth a one-shot probe: write a setlist with a curly apostrophe and an em-dash via MCP, then read it back via the public surface. If the bytes corrupt round-trip, every cleanly-authored title in the system is at risk.

**Template documents in the public list.** Three "Bnei Mitzvah Morning (Template)" tiles, each with a different document ID, each with 0 songs and no date. Cycle-6 Lane 2 shipped the `setlistTemplates/{templateId}` collection rules block. Either templates are double-stored (templates collection + setlists collection) or they were created as setlists *before* the template feature shipped and never migrated. Either way they show up to the public as broken setlists.

**The `/perform` index has no pagination.** I counted 44 entries. The page renders all of them and prefetches the RSC payload for each (I saw ~40 `/perform/setlist/<id>?_rsc=...` GETs in the network tab during initial load). Daniel's setlist count is going to grow weekly. This is unbounded.

---

## the "test became predictable" question

The prompt asks whether nothing genuinely user-painful is here, and whether the test has become predictable. Two reads.

**Strict-yes.** The audit methodology this cycle exists has been finding the same shape of issue cycle after cycle: rich envelopes, role gates, accessibility, dedup tolerance, route 404s, CSP. Those are predictable and the disciplined instances are doing their job there. The contrarian role is the negative space — the thing that would be there even if no disciplined instance went looking. And what's in that negative space, right now, is **the audit method itself producing the most prominent broken thing on the surface**. That's not a finding about CRC Music. It's a finding about the cowork process. I think that counts as a valid contrarian outcome.

**Strict-no.** This pain absolutely lands on a real user. Daniel onboarding David next week, with David opening the app on his laptop and reading "c7i1-Shabbat Morning � May 23 (probe) — CLEANUP AT HANDOFF" as the first setlist on the apex domain, is not hypothetical. The disciplined instances will not surface it because they don't open the front door without auth. So whether or not the method has become predictable, *this particular blind spot is real and structural*, and a 60-minute walk through the unauthenticated front door is the lowest-cost path to seeing it.

I think the honest answer is: the disciplined instances are finding what they're tuned to find, and they're doing it well. But the cycle method has a structural blind spot at the front door — both because the front door is unauth (no test session probes it) and because each cycle's audit-instances pollute it on the way through. The contrarian role exposed that this run. It will keep exposing it next run, unless either (a) the `/perform` filter gets derived from caller-uid shape, or (b) the cleanup story becomes mandatory pre-handoff (not "supervisor sweeps after" but "you can't HANDOFF-COMPLETE until your uidPrefix is gone").

---

## evidence

Screenshots saved to repo root (not tracked):
- `c7i5-perform-landing-fullpage.png` — desktop, full-page scroll of `/perform`
- `c7i5-perform-landing-mobile-iphone15.png` — 393x852 viewport, first viewport-worth (the c7i1 probe is the only thing visible above the fold)
- `c7i5-perform-landing-ipad.png` — 1024x1366, what the band actually sees

Byte-level mojibake confirmation:

```
$ curl -sS https://www.centralreform.live/perform/setlist/841df759-... \
    | grep -oE 'c7i1-Shabbat Morning[^<]{0,40}' | xxd
00000000: 6337 6931 2d53 6861 6262 6174 204d 6f72  c7i1-Shabbat Mor
00000010: 6e69 6e67 20ef bfbd 204d 6179 2032 33    ning ... May 23
```

That `ef bf bd` is in the bytes the server returned. Not a terminal artifact, not a Playwright transcription artifact. It's persisted upstream.

Setlist counts query (run in browser console on `/perform`):

```
{ total: 44, zeroSongs: 4, templates: 3, c7probes: 1, cf1evals: 1,
  noDate: 16, oldest: 'Jan 3, 2026', newest: 'May 23, 2026' }
```

Note: `zeroSongs: 4` counts only entries whose tile text says exactly "0 songs"; the actual count of empty setlists is higher because many of the dateless entries also have no song-count text rendered.

---

## bearer + cleanup

Bearer `crl_live_8800…2ba5e1` (cycle-7-instance-5) — marked `ASSIGNMENT=burned` in `~/.claude/projects/C--Users-dsbog-centralreform-live/.supervisor-bearers` at HANDOFF-COMPLETE per msg-cycle7-002.

I did not mint any test sessions this run — the contrarian probe lived entirely on the unauth public surface. But the safety-run `cleanup_all_test_data({uidPrefix: 'c7i5'})` was NOT a no-op: it removed 1 setlist, 8 tracks, and 1 mcpToken. That data was leftover from a previous c7i5-prefixed run (not visible to me at session start; sweep was real). Underlines the structural point in §the most painful thing I found — these prefix-leftovers accumulate when cleanup is opt-in-trailing rather than HANDOFF-gating.

Cleanup response (verbatim, just so it's in the record):

```json
{"removed":1,"failures":[],"aggregate":{"setlists":1,"tracks":8,"library_index":0,"songs":0,"proposal_stages":0,"bond_flags":0,"bond_corrections":0,"scheduling_assignments":0,"musician_availability":0,"mcpTokens":1,"storageDeleted":0,"storageFailed":0}}
```

*from coder-5*
