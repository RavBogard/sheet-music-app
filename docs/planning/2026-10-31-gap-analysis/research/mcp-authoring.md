# Research: MCP authoring (`/api/mcp`)

Area: mcp-authoring. Researcher run 2026-10-31. Evidence comes from code on `master`, the
setlist-memory planning docs, and live prod calls made through the CRC Music connector at about
16:44Z.

**Prod side effect, read first.** My three `draft_service` probes **seeded three real profile
templates** in prod: `profile__crc__friday_night:daniel_karen`,
`profile__crc__shabbat_morning:daniel_karen` and `profile__crc__shir_shabbat`, each with
`updatedAt` 2026-10-31T16:44Z and owner "CRC Music". `draft_service` seeds a missing profile on
first use (`src/lib/mcp/tools/service-profiles.ts:338-373`). This is the tool's designed
behaviour, not test data, so I left them in place. What it shows is that **nobody had called
`draft_service` in prod before today**: the flow shipped 2026-10-30 and has zero real use. If the
lead wants the pre-probe state back, delete those three template ids. Whatever is in history at
that point will re-seed them. No `test-gap-` setlist was created. No other writes. The drafts
expire on their own after 30 minutes.

## 1. How it works today

- **Draft.** `draft_service` (`src/lib/mcp/tools/draft-service.ts:153-267`) follows these steps:
  - It requires `rabbiSlot` for friday_night and shabbat_morning.
  - It finds the profile template by `profile.key`. If there is none, it seeds one
    (`seedProfile`, `src/lib/profiles/seed.ts:65-128`). The running order is copied from **the most
    recent non-special setlist** of that service + rabbi. Each song row gets a `slotKey`. The
    template is written once and **never re-learned** (only the ops-only
    `seed_service_profiles replace:true` rewrites it).
- **Slot keys.** A slot key is `moment:<momentId>` when the row names a moment. Otherwise it is
  `song:<partGroup of that week's chart>` (`src/lib/profiles/keys.ts:77-84`). Most live slots are
  `song:` keys. In the drafts I took, only one row out of about 50 had a `moment:` key.
- **Tiers.** Each slot is tiered by `computeSlotTier` (`src/lib/profiles/tiers.ts:126-190`):
  - `standard`: a standing choice exists.
  - `usual`: the same partGroup appears ≥3 times in the window. The window is built at
    `tiers.ts:144`: `window = profileUses.filter(!special).slice(0,5)`.
  - Otherwise: `last_time`, `other_service` or `new`.
  - Only `standard` and `usual` fill a row (`draft.ts:100`). Uses come from `buildSlotUses`
    (`slot-uses.ts:52-96`), which keeps one use per setlist per slot key, with service class from
    `classifyService` (`history/classify.ts:130-152`).
- **Readback.** `buildReadback` (`profiles/readback.ts`) speaks open slots, no-chart rows, `differs`
  rows, recent standards and promotions. Everything filled is folded into one line, "Everything
  else is your usual …". At most 5 row exceptions are spoken.
- **Create.** `create_setlist_from_draft` (`draft-service.ts:316-466`) applies `choices` (by draft
  index, with a `fileId` required to bind), writes through `writeSetlistFromTemplateRows`, stores
  `serviceType`, `rabbiSlot` and `special`, and writes any `standing:true` choices.
- **Bond confidence.** Outside the draft, `propose_setlist_changes` grades each bond by the chart
  row's `titleSpecificity` (`propose-changes.ts:798-859`). A `profile_match` (the chart is the
  slot's standard or usual) forces `high`.

## 2. Findings

| ID | Type | Persona | Sev | Evidence | Recommendation | Effort | Quick safe win |
|---|---|---|---|---|---|---|---|
| MCP-01 | bug | Daniel, David, band | **S1** | **"Usual" counts the last 5 uses of the chart, not the last 5 services.** For a `song:` slot every use has the same partGroup, so `window` (`tiers.ts:144`) is "the last 5 times this chart was played". **Any chart played ≥3 times ever on the profile is "usual", however long ago and whatever replaced it.** DESIGN §5.3 says "N of the last M non-special services". Live: the Daniel Shabbat morning draft fills "the usual Mi chamocha (Moshav) morning.pdf in E", but the last regular Daniel Shabbat morning (Sep 26, Sukkot I) used *Mi Chamocha Ana B'Koach*. That chart has its own slot key, so the draft never mentions it. | Compute the window over the profile's last M **services** (`index.profileSetlists`, non-special, deduped by date). A slot is usual only if its chart is in ≥N of those. When the slot's moment had a different chart in the latest service, demote it to `last_time` and name both. Add a regression test with an "A,A,A, then B,B" history. | S | yes (logic fix, no wording or data change) |
| MCP-02 | bug | Daniel, David | **S1** | **A slot's identity is the chart, so one moment splits across many slots.** `slotKeyFor` keys non-moment rows by partGroup (`keys.ts:77-84`). Mi Chamocha with Moshav, 6-8 or Ana B'Koach is three different "slots". Each new arrangement starts at `new`/`last_time`, and the draft can't see the arrangement that actually replaced it. A row bound by moment in one week and by title in another also splits. That explains why Shema (major) shows "key not on record" in the draft (`shabbat_morning` row 12) even though Sep 26 played it in E. | Key song slots by **moment** wherever the row's title resolves to one (the bind-on-type lookup already exists). Use partGroup only for non-liturgical songs. Back-fill `momentId` on profile rows and history reads. Profile tracks keep `slotKey`, so this is a re-seed, not a data migration of setlists. | M | no |
| MCP-03 | bug | Daniel | **S1** | **Profiles are seeded from the wrong service and then frozen.** The base is the most recent non-special setlist (`seed.ts:73`), and `classifyService` lets a stored `serviceType` beat the B'nei Mitzvah name regex (`classify.ts:74-82`, `139`). So:<br>- "Daniel Shabbat morning" was seeded from **Eliana Levine Bat Mitzvah (Oct 10)**. Its rows carry that week's labels ("Mi Camocha", "Intro Music", "Nigun 1/2", "Fiddley Tune", "Russian Sher No 3"). Its usual tiers lean on 2 B'nai Mitzvah of 4 uses (Aug 22, Oct 10; get_song_history output).<br>- "Daniel Friday night" was seeded from a **Camp Sabra** service (every slot is "Sabra", plus a one-off note row "Oseh Shalom → opens the Shabbat Players dinner set").<br>Every future draft repeats these, because a profile never re-learns its running order. | Exclude B'nei Mitzvah, camp and guest names from regular profiles: classify by name before the stored type, or store `bnei_mitzvah_saturday` at create time. Re-learn the running order from the last N regular services, or show "seeded from <name, date>" in every draft headline until a standard exists. Offer a re-seed that the author can see. | S (headline) / M (re-learn) | headline part yes |
| MCP-04 | gap | Daniel | **S1** | **The readback hides exactly the rows most likely to be wrong.** Every filled row (standard/usual) is folded into "Everything else is your usual…" (`readback.ts:150-160`). Daniel never hears *which* chart or key the server filled, so a stale usual (MCP-01) is committed with a "yes". DAVID-NOTES item 5: "the readback must make a long-standing `usual` easy to replace in one sentence". Today it isn't even named. | Name filled rows when they are risky. Add a `kind:"filled"` exception when (a) the usual is older than ~8 weeks, (b) the chart differs from what that moment had in the profile's last service, (c) the key is not on record, or (d) the profile was seeded from a single service. Keep the rest folded. | S | yes (recall only, no setting proposed; wording follows the existing phrase table) |
| MCP-05 | gap | Daniel, David | S2 | **No diff against last week.** Neither `draft_service` nor `read_back_setlist` compares to the profile's previous service. DESIGN §3 goal 2: "reads back only what differs from the usual". "What changed since last Shabbat" is not available in one call. | Add `vsLast` to the readback: per moment, "last Saturday (Oct 10): X in E". Make it one compact list, recall only. | S | yes |
| MCP-06 | gap | Daniel | S2 | **Open rows lack the exact chart Daniel would reuse.** `rowOut` emits `fileId` only for filled rows (`draft-service.ts:140-152`). For "same as last time" the agent must call `get_service_profile` or `search_library` by title. There are two different charts both named **"Shema (major).pdf"** (`1-NNEk…` and `19XVik…`, both live in history), so a title search can bind the wrong version silently. | Return `recall:{fileId, chartName, key, date, service}` on open rows (never filled). Let a choice say `{index, useRecall:true}`. This saves a turn and removes the title-search guess. | XS | yes |
| MCP-07 | bug | Daniel, band | S2 | **Duplicate setlists count twice toward "usual".** June 13 has two "Shabbat Morning — Parashat Sh'lach" setlists (`QSlxl…`, `ncbvB…`). Both count in `buildSlotUses` (there is no same-date dedupe, `slot-uses.ts:62-88`). 2 of the 3 Moshav-morning "usual" uses in the rabbi-null history are one Saturday. | Collapse eligible setlists to one per (eventDate, serviceType, rabbiSlot), preferring the newest version. | XS | yes |
| MCP-08 | gap | Daniel, band | S2 | **`draft_service` doesn't warn about an existing setlist on that date.** It did not warn for Shir Shabbat Nov 6, which already exists (`77d140d9…`, "w/ Duo Andalus"). Nothing in `draftServiceTool` or `writeSetlistFromTemplateRows` checks. A "yes" makes a second Nov 6 setlist. That pollutes Perform's date selection and history (MCP-07). | Return `existing:[{setlistId,name}]` on the draft and say it first in the readback. Make `create_setlist_from_draft` require `allowDuplicate:true` when one exists. | XS | yes |
| MCP-09 | risk | band | S2 | **A filled chart can be dead or archived.** `loadLibraryLite` (`history/load.ts:166-195`) doesn't read `status` or `chartHealth`. A history use whose chart is gone gets `partGroup = fileId` and is still counted and filled (`slot-uses.ts:77-80`). DESIGN §10: 79 song rows were bound to a chart no longer in the visible library. | Exclude `orphaned`/`archived`/unbindable charts from fill. When a usual is archived with a `canonicalFileId`, recall the canonical one and say so. Run `verify_setlist_charts` inside create and return failures. | S | yes |
| MCP-10 | bug | Daniel, band | S2 | **Chart revisions rewrite keys and history, and orphan standing choices.** `create_chart revisionOf` calls `swapChart` on **every** referencing row, past setlists included (`authored-chart.ts:409-425`), with the default `syncMetadata:true`. That sets each row's key and title from the new catalog row (`setlist-write.ts:988-1014`), so played keys can be replaced by the written key (or nulled: PLAUSIBLE when the new row's key is `null`). Standing choices and profile templates are not migrated, so a standard keeps pointing at the archived version. Uploads, Drive imports and the inbox have **no** revision path, so "v2" becomes a sibling ("…band chart DRAFT v2", "…(updated PDF)" in live chart names). | Revisions re-bond only setlists dated today or later, with `syncMetadata:false` (keep played key and title), and migrate `service_standing` fileIds. Add `revisionOf`/`supersedes` to `upload_chart`, `import_chart_from_drive` and `sync_chart_inbox`, and copy partGroup to the new row. | M | no |
| MCP-11 | gap | Daniel, band | S2 | **Played key vs written key is never surfaced at the decision point.** Drafts say "in E" (played key) without the written key. `get_song_history` has both, and its notes show agents guessing ("the chart itself carries no stored key, so please confirm it's actually in E", Rosh Hashanah, Sep 12). For PDF charts, a played key ≠ written key means the band reads a chart in another key. | Add `writtenKey` to draft rows and readback: "in E (chart written in D)". Add a `key_mismatch` exception when they differ on a non-MusicXML chart. | XS | yes |
| MCP-12 | bug | Daniel | S2 | **"Special" is inferred loosely.** "Shir Keter Shabbat — Oct 16 · Crown Center" is counted as a regular friday_night: the name misses `/shir shabbat/` and the guest venue isn't flagged. "Shavuot Yizkor", "Sukkot I", "Maxine Weil Retirement Celebration" and "Camp Sabra" are all `special:false` (get_song_history output). These shape "usual" and seeds. | Treat holiday words (Sukkot, Shavuot, Yizkor, Simchat), camp, celebration, retirement and the "Shir Keter" variant as special, and match `shir\s+(\w+\s+)?shabbat`. Better: make `create_setlist_from_draft`/`update_setlist` the only places that set it, and have the readback say "counted as a regular week" for inferred ones. | XS | yes |
| MCP-13 | friction | Daniel | S2 | **Profile labels are file names.** Labels such as "Barchu (Siegel).pdf", "Sim_shalom.pdf" (bound to "Sim Shalom (Silver, Dm)", so the label and chart disagree), "Mizmor l_David D.pdf" and "Eitz chayim - Weisenberg.pdf" appear in live drafts. A usual row keeps the raw week title (`seed.ts:96`). Only open rows get the moment label. DAVID-NOTES item 4: name the slot by its moment. | Label usual rows by the moment (or the title stem without the extension) in the seed as well, and strip `.pdf`/`_` in phrases (`tiers.ts` `phrase()` uses the raw `chartName`). | XS | yes |
| MCP-14 | bug | Daniel, band | S2 | **The Shir Shabbat profile lists one moment 3–4 times.** Live draft: Shalom Aleichem at rows 5, 6 and 7, Shiru L'Adonai at 8, 9 and 10, L'cha Dodi at 12 through 15. These are the Greg Dallas Piano / Lyrics / lead-sheet parts that the base setlist carried as separate rows. Only per-instrument *setlists* are excluded (`setlistPart`). The draft makes 14 "open" exceptions, and voice reads 5 of them. | Collapse rows of one partGroup or moment into one slot at seed time, and keep the per-part bindings as an attribute. | S | yes |
| MCP-15 | gap | Daniel (Randy weeks) | S2 | **Randy's Shabbat morning returns `no_profile`.** The live probe of Nov 7 with Randy got `machine_code:"no_profile"`. An existing "Randy Shabbat morning" template (`5df795fc…`, 33 rows) is not used as a fallback. The guide's recovery ("build from a recent setlist with templateType and rabbi set") takes 3–4 calls: `clone_setlist`, `update_setlist rabbiSlot+serviceType`, edits. `clone_setlist` takes no `rabbiSlot`. | When a profile is missing, seed its running order from the matching legacy template (open slots only, no fills) and say "built from your Randy Shabbat morning template". Add `rabbiSlot`/`serviceType` to `clone_setlist`. | S | yes |
| MCP-16 | bug | Daniel | S3 | `propose_setlist_changes` confidence measures how specific the **chart's** title is, not whether the chart matches the row. A specific but wrong chart (e.g. "Mi chamocha (Moshav).pdf" in D where the row wants "…morning.pdf" in E) grades `high` (`propose-changes.ts:833-858`). `profile_match` forces `high` even when that usual is stale (MCP-01). Neither the row-title-to-chart overlap (which already exists in `bondReviewRows`) nor the key is used. | Add flags `title_mismatch` (reuse the clone overlap score) and `key_differs_from_history`. Cap `profile_match` at `medium` when the usual is older than 8 weeks. | S | yes |
| MCP-17 | sprawl | Daniel, David | S2 | **Five ways to create a setlist, and two of them bypass memory.** The ways: `create_setlist`, `clone_setlist`, `clone_setlist_from_template`, `draft_service`/`create_setlist_from_draft`, plus `create_template_from_setlist`. `clone_setlist`'s description still says "Daniel's weekly authoring flow is 90% 'clone last week + tweak'". That contradicts DESIGN §1 ("Clone last week is the wrong starting point") and the guide's flow. A clone copies last week's one-off keys verbatim and doesn't store `rabbiSlot`/`special`. `list_templates` now returns the three `profile__…` docs, which look like ordinary templates. So `clone_setlist_from_template` on a profile gives a setlist with no fills, and `update_template` can edit a profile out from under the tier logic. | Rewrite the `clone_setlist` description: "for one-off copies; for a weekly service use draft_service". Hide `profile__*` from `list_templates`/`update_template`/`delete_template` (or mark them `kind:"profile"`). Make `create_setlist` take `rabbiSlot` and `special`. | XS | yes |
| MCP-18 | sprawl | Daniel | S3 | **`update_track{songId}` and `swap_chart` change charts with opposite key behaviour.** `update_track` keeps the old row's key and title, so the new chart inherits a key it may not be written in. `swap_chart` overwrites the key with the catalog's written key, losing the played key. Neither records a one-off or standing choice. DESIGN §5.8 asked for a single learning path. | Make one rule, documented in both tools: on a chart change, keep the played key only if the author gave it, else take the written key and say "key now D (was E)". Return a `keyChanged` field. | XS | yes |
| MCP-19 | sprawl | Daniel | S3 | **18 chart-intake tools.** They are `upload_chart`, `request_chart_upload_url`/`finalize_chart_upload`, begin/append/commit chunked, `request_batch_upload_urls`/`append_batch_item_chunk`/`commit_upload_batch`/`get_upload_batch`/`resolve_upload_item`/`list_parked_uploads`, `open_chart_dropzone`, `get_chart_inbox`/`sync_chart_inbox`, `import_chart_from_drive`, `import_drive_folder`, `scrape_chart_from_url`/`save_scraped_chart` and `create_chart`. Wrong-tool risk is real only for the three byte paths (direct, signed URL, chunked), where a big file sent through `upload_chart` fails. None of them asks "is this a new version of X?" (MCP-10). Dedupe is name-based at 0.85 with a `force` override (`library-upload.ts:483-541`), so a real v2 trips dedupe and the agent learns to pass `force:true`, which makes a sibling. | Have the dedupe refusal offer `revisionOf:<existing fileId>` as the first choice, before `force`. Fold the three byte paths behind one `upload_chart` that returns the next step by size. | M | dedupe hint part yes |
| MCP-20 | friction | Daniel (voice) | S3 | **Voice readback is long and lossy.** The Friday draft speaks 5 of 9 exceptions, each with a full chart file name ("Adon Olam — IWITW (Em) — band chart DRAFT v2 in Em"), then "And 4 more on screen", which a voice user can't see. "Last time" gives no date: it was Jul 24 (camp) for every Friday row. The `read_back_setlist` headline repeats the date ("…Bar Mitzvah — Oct 31, Oct 31, CRC Saturday Siddur"). | Speak the setting only ("Taubman, Dm"), add the date to `last_time` ("in July"), and drop the name's trailing date when it equals `date`. When there are more than 5 open slots, say "9 open slots; first 3: …" and offer "read the rest". | XS | wording needs Daniel |
| MCP-21 | gap | Daniel | S3 | **Draft readback ignores open items, and Shir Shabbat books disagree.** `draft_service` passes `openItems: []` (`draft-service.ts:238`). Items on an earlier draft or week are not carried forward, though the guide says every readback repeats them. The Shir Shabbat profile binds `legacy-shabbat-evening`, while the live Nov 6 Shir Shabbat setlist is on "CRC Friday Siddur" (readback headline). | Carry unresolved open items from the profile's previous setlist into the draft readback. Have the readback flag "book differs from profile". | S | yes |
| MCP-22 | dead-surface | agent | S4 | `get_service_profile`'s `profile_not_found` hint says "Profiles are seeded by an admin with seed_service_profiles". That tool is on the ops surface, invisible to authoring, and profiles now seed on first draft (`service-profiles.ts:532-536`). | Change the hint to "call draft_service once; it creates the profile". | XS | yes |
| MCP-23 | gap | Daniel, David | S3 | **History ignores "as performed".** DESIGN §5.7: where a service was reconciled (`reconcile_service`/`performedDeviations`), history should prefer what was played. Nothing in `src/lib/history/` reads deviations (grep: no hits). So a swap made at the gig never reaches usual or last_time. | Overlay `performedDeviations` in `loadHistorySetlists`. | S | yes |
| MCP-24 | gap | band, David | S3 | **The roadmap is "all shipped", but the per-instrument path is open.** All 4 releases are marked shipped (ROADMAP.md). Still open from DESIGN:<br>- §5.8: per-instrument Perform, one setlist for every part instead of 7. David still builds `· Bb / · Eb / · Vocals / · Crown Center` copies (Oct 16). A draft yields only the whole-band setlist.<br>- §5.8: retire or rewire the old bond-correction loop. `bond-corrections.ts` is still live and both systems exist.<br>- §5.7: performed-history overlay (MCP-23).<br>- No Karen split (by design).<br>- No BrosLaz profiles (by design). | Add the three items as a Release 5 in ROADMAP. | XS (doc) | yes |
| MCP-25 | risk | Daniel | S3 | **The first-use seed is invisible and permanent.** A probe or one-off question ("what would Friday look like?") silently creates the profile from whatever week is newest, which happened today. A later re-seed needs an ops tool. | Make the first-use seed say "Profile created from <setlist, date>; say 're-seed from <date>' to change it". Expose a guarded `reseed_service_profile` on the authoring surface (admin/band_leader, dry-run first). | S | yes |

**Error envelopes and turn cost.**
- The envelopes themselves are good. Every refusal I hit is a `richError` with `machine_code` and an
  actionable hint (`no_profile`, `rabbi_required`, `draft_not_found`).
- The turn cost comes from shape:
  - Choices need a `fileId`, so "number 2 is the Klepper" takes one `search_library` call plus a
    pick (MCP-06).
  - A new Randy profile takes 3–4 calls (MCP-15).
  - Drafts expire in 30 minutes, after which the whole draft has to be rebuilt. Voice sessions with
    email look-ups can exceed that; extending the TTL or allowing `draft_service` with `fromDraftId`
    would help (XS).

## 3. Big bets

1. **Moment-keyed service memory, re-learned every week** (MCP-01/02/03/14).
   - *Problem:* stale or false "usual", split slots, and profiles frozen on a Bat Mitzvah or camp
     week.
   - *Sketch:*
     - A slot is a moment (or a named non-liturgical song). Each regular service of the profile
       records `{moment → partGroup, key}`.
     - The running order is learned as the modal order of the last N regular services.
     - Tiers come from the last M services, not the last M uses.
     - The profile doc becomes a cache, rebuilt on every draft.
   - *Risks:* moment coverage of free-titled rows, and re-seed churn needing a visible "changed
     since last draft" line.
   - *Effort:* M–L.
2. **Week-over-week readback with a recall column** (MCP-04/05/06/11).
   - *Problem:* Daniel says "yes" to rows he never heard.
   - *Sketch:*
     - Every draft and readback carries, per moment, `{this week, last service (date), usual (n/M),
       written key}`.
     - Voice mode speaks only rows where these disagree. Screen mode shows a 4-column table.
     - "Same as last week" is `{index, useRecall:true}`.
   - *Risks:* readback length; needs one wording round.
   - *Effort:* S–M.
3. **Chart lineage: versions instead of siblings** (MCP-09/10/19).
   - *Problem:* "wrong chart version": v2/updated/DRAFT siblings, same-named distinct charts, and
     revisions that rewrite history.
   - *Sketch:*
     - A `lineageId` on library rows, set by `supersedes` on every intake path (upload, Drive,
       inbox, scrape, create_chart).
     - Memory and standing choices store the lineage and resolve to its newest non-archived
       version at draft time.
     - Past setlists keep their exact fileId.
     - The dedupe refusal proposes "new version of X?".
   - *Risks:* back-filling lineage for existing siblings needs a reviewed dry-run; Perform cache
     keys stay per fileId (fine).
   - *Effort:* M–L.
4. **A pre-commit fingerprint check** (MCP-08/09/11/16).
   - *Sketch:* `create_setlist_from_draft` and `commit_staged_changes` run a server-side check
     before writing:
     - duplicate setlist on the date;
     - dead or archived charts;
     - played ≠ written key on non-MusicXML;
     - row title vs chart overlap;
     - chart differs from last service.
     It returns `checks[]`, and the write proceeds only with `acknowledge:[ids]` for blocking ones.
   - *Risks:* chore anti-goal; keep it to ≤3 blocking kinds.
   - *Effort:* S–M.
5. **One setlist, per-instrument parts** (DESIGN §5.8 follow-up, MCP-24).
   - *Problem:* David hand-builds 4–7 part copies per service, and each can drift.
   - *Sketch:* partGroup already links parts. Perform picks the musician's part, and memory sees one
     service.
   - *Risks:* Perform surface change; iPad offline cache.
   - *Effort:* L (crosses into the Perform area).

## 4. Questions for Daniel

1. **When a usual chart hasn't been played in a while, should the draft still fill it or leave the
   slot open?**
   - The two answers: fill it but say it, or leave it open with "last time X (date)".
   - *Recommended:* fill it but say it whenever the usual is older than 8 weeks or differs from last
     service. That honours the "rarely ask" goal and fixes "confidently wrong".
2. **Should B'nei Mitzvah Saturdays count toward "Daniel Shabbat morning"?**
   - Today they do, through the stored serviceType, and they seeded its running order.
   - *Recommended:* no. They feed only the B'nei Mitzvah profile, per DESIGN §5.5's split.
3. **A revised chart: should past setlists keep pointing at the old version?**
   - *Recommended:* yes. History stays exact, and only today and later move to the new version,
     with the played key kept.
4. **Voice readback wording for long lists (MCP-20).**
   - *Recommended:* "Nine open slots. First three: … Want the rest?", speaking settings, not file
     names.
5. **The three profiles my probes seeded today: keep them or delete them?**
   - *Recommended:* keep them until MCP-03 lands, then re-seed. Deleting them now only makes the
     next draft recreate the same thing.
