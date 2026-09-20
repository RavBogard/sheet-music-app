# Rulings — cross-app integration sitting, 2026-09-14

Sitting: Daniel with Claude (Cowork / Fable), on the review "One Service, Four Surfaces".
Scope: centralreform.live (.live), Overlays (crc-overlays-vercel), shireishabbat, the siddur reader.
Copies of this file: crc-overlays-vercel/docs/planning/2026-09-14-integration/, CentralReform.live/, shireishabbat/.

## Approved (handoffs written, same date)

| # | Ruling | Handoff |
|---|---|---|
| 1 | Build `moments.json`. Lift the QUEUED gate on `shireishabbat/HANDOFF-CODE-MOMENTS-JSON-2026-09-03.md`. Two consumers: .live (`dist-app/moments.json`, full spec) and Overlays (`content/moments.json`, `{momentId, unitId}` pairs). Alias list is Daniel's, curated in stage→confirm batches, never a spreadsheet. | `shireishabbat/HANDOFF-CODE-MOMENTS-JSON-UNBLOCK-2026-09-14.md` |
| 2 | The setlist is the whole service. Friday and Saturday templates carry the fixed liturgy as `prayer` / `reading` / `header` rows with `liturgyRef` pre-filled per book; hidden from the band's Perform mode by default. Authoring must not get heavier for David. | `CentralReform.live/HANDOFF-CODE-LIVE-SERVICE-TEMPLATES-2026-09-14.md` |
| 5 | `today.json`: a metadata-only public file emitted on setlist publish (service, book slug, start folio, stream URL, rabbi). The reader reads it instead of its hardcoded `CAL`; Overlays reads it for the default "Today's order" and the scan card's book. Calendar remains the fallback. No text, no bytes. | `CentralReform.live/HANDOFF-CODE-LIVE-TODAY-JSON-2026-09-14.md` · `shirei-tshuvah-desktop-reader/HANDOFF-CODE-READER-TODAY-2026-09-14.md` |
| 6 | Anonymous setlist links: historical setlist links stay readable (metadata only); chart bytes flow only through explicit, revocable grants via the already-deployed endpoint. CHARTS-001 is unblocked. The reader chart branch (`a6828b8`) must be located and rebased onto `codex/desktop-reader-ux` before either reader line ships. | `CentralReform.live/HANDOFF-CODE-LIVE-CHARTS-001-UNBLOCK-2026-09-14.md` |
| 7 | The cue log is the service's ground truth. Overlays keeps a bounded per-service history of accepted commands and exposes it read-only; .live reconciles it against the published setlist into an "as performed" version that sits BESIDE the plan, never replaces it (one-tap promote). "Bounded operational history, not permanent personal surveillance." | `crc-overlays-vercel/docs/planning/2026-09-14-integration/HANDOFF-CODE-CUE-LOG-2026-09-14.md` · `CentralReform.live/HANDOFF-CODE-LIVE-AS-PERFORMED-2026-09-14.md` |

Also accepted as-is: the setlist-import title-match thresholds (clear ≥80, plausible ≥45) and the "Not needed" label. Revisit 45 after a Shabbat setlist has run through it.

## Declined

- **Page numbers on the stream** (idea 4). "That's why we have the overlays." Anyone on the siddur app already finds the page the rabbi calls. The deployed scan card page chip stays manual; do not wire it to the cue folio.
- **Pinning the Overlays siddur library** to release commits. Changes are rare; the Monday PR is already a manual gate. If anything, a manual "refresh siddur library" control in admin settings is enough. No further lift.

## Deferred — "possibly, later" list

- **Idea 3 — Companion "Today's order" slot buttons.** Michael's page 1 as permanent slot buttons whose labels/targets resolve through module variables filled from the prepared service. Not now; changes are infrequent and the lift is not worth it yet. Michael keeps his own pages.
- **Idea 8 — Neon exit / cues as files.** The Sept 10 outage has passed (authoring writes observed 2026-09-14). Keep "cues as versioned files, relay holds live state" as a design direction for whenever Overlays next touches storage. Not a project.
- **Idea 9 — live "now" pointer for the band / rabbi one-tap audible.** No, at least not now. `/api/now` stays dark.
- **Idea 10 — delayed follow-the-service mode in the reader.** No, same.
- **Idea 13 — the family as an installable product for other shuls.** "Love this so much, but not right now." Eventual feature. Keep tenant boundaries intact (per-tenant `setlist_reader` bearer, per-workspace feed pin) so it stays possible.
- Ideas 11 (cues recall mixer scenes) and 12 (gold marks into overlays): not ruled on; parked with the above.

## Standing constraints restated

- Chart PDFs are third-party sheet music: bytes never enter shireishabbat, the public mirror, or any fork-facing surface. Metadata crosses; bytes do not.
- Liturgical text never enters .live: ids, names, pages only.
- Stage → confirm → commit for anything that binds, merges or deletes on Daniel's behalf.
- Only Daniel worries about dates. Handoffs state cost and shape, not schedules.


## Addendum — sitting of 2026-09-15 (Daniel with Claude, Cowork / Fable)

### Ruling 8 — which books are real

Released volumes: **Shirei Tshuvah (Rosh Hashanah only)**. No Shabbat or Yom Kippur Shirei volume exists; the shireishabbat Shabbat books (`shabbat-maariv`, `shabbat-shacharit`) are alpha drafts, and the rest of the series begins over the coming months. Consequences, binding on all four repos:

- Draft-feed **unit ids are binding identity** for setlist rows (and moment stems once aliases land). Draft-feed **folios are never published** — not by the reader, not by Overlays, not in today.json.
- **Legacy CRC booklets govern page numbers on every service** until the corresponding Shirei volume is released; a released volume is then added as a second book, not a replacement. In .live today that is `crc-friday`, `crc-saturday` and `crc-machzor-2008` (Rosh Hashanah morning pagemap only; no Yom Kippur pagemap exists).
- On a High Holy Day with no Shirei volume (Yom Kippur 5787), the reader and Overlays fall back to the legacy machzor and must never surface a Shabbat draft.
- Order disagreements between a draft feed and a booklet are resolved in favour of the booklet unless Daniel rules otherwise.

### A-W2 confirmed — fixed-liturgy rows (STOP lifted)

Daniel ruled every row on the interactive rulings page (claude.ai artifact "Fixed Liturgy Rulings"); the raw rulings are in `CentralReform.live/sheet-music-app/work/fixed-liturgy-rulings-2026-09-15.json` and the confirmed rows in `CentralReform.live/sheet-music-app/src/data/templates/fixed-liturgy.{crc-friday,crc-saturday,shabbat-maariv,shabbat-shacharit}.json`. Every ruling matched the proposed default. Notable: Kaddish Shalem is **not** the Mourner's Kaddish (page-less in both booklets); Nishmat Kol Chai and the Torah-procession Sh'ma were false matches to Kriyat Sh'ma; Candle Blessing p.5, K'dushat Hasheim p.27, Ahavah Rabah p.61, the Torah blessings p.84 and Blessings Following the Haftarah p.89 were name misses, now mapped; Adon Olam precedes the closing blessing in both booklets and the rows now follow the booklet; the awakening block follows the booklet (Hareini first); the Amidah Birkat Kohanim row is kept but page-less (the booklet prints one Closing Blessing, p.100, which belongs to the concluding row). Nothing from the "not seeded" list was added.

### Other rulings, same sitting

- **Shared units** — the nine `shabbat-shacharit` rows carrying `@shabbat-maariv` unit ids are **intentional sharing**; keep.
- **Duplicate stems** — `hoda-ah`/`hodaah`, `ma-ariv-aravim`/`maariv-aravim`, `mi-shebeirach`/`mi-shebeirach-healing`, `kdushah`/`kedushah`: **merge** in the feed (one stem each). Do it now while the feed is alpha; Daniel did not pick the surviving spelling — the producer chooses and records it.
- **Part C (CHARTS-001)** — **Option 1**: land `codex/reliability-batch-20260906`, switch OFF (`READER_PUBLIC_CHARTS_ENABLED=false`). Approving Modeh is a later, separate act. Update `CHARTS-001.json` accordingly.
- **B-W2 done** — service start times and stream URL written via `update_congregation_services` on 2026-09-15: Friday 18:15 (`friday_night`, `kabbalat-shabbat`), Saturday 10:00 (`shabbat_morning`, `bnei_mitzvah_saturday`), RH morning 10:00, Kol Nidre 20:00, alt Kol Nidre 17:00, YK morning 10:00, Yizkor/Neilah 17:00; stream `https://www.youtube.com/@CentralReformCongregation/live` (Restream to YouTube + Facebook; no per-service events), lead 5 min.
- **Alias batch 1** — confirmed at the proposed defaults (all printed candidates; three non-name captions dropped). Written to `shireishabbat/liturgy-map/moment-aliases.json`. Batches 2–3 remain a STOP.
- **Finding (Overlays)** — `app/access/devices-copy.ts` `readDeviceList` drops `history_reader` rows, so a minted Service-history credential never appears in Paired devices and cannot be revoked from the panel. Fix in the next Overlays session.

### Ruling 2 reinterpreted — 2026-09-15, later the same day ("bind, don't add")

Daniel: CRC skips many of the book's pieces, often knowing well in advance; rows for things that will not be done
must never appear in a setlist; musicians want songs and charts. Therefore **no template or setlist ever gains a
row it did not have**; every row Daniel authors gains its liturgical identity (unit id + legacy-booklet page) by
name match, staged and confirmed once per spelling. The A-W2 confirmed files become lookup tables, not row lists.
A-W3–A-W5 of the .live plan and the print amendment are withdrawn; see
`CentralReform.live/HANDOFF-CODE-LIVE-BIND-NOT-ADD-2026-09-15.md`. The site's templates are acknowledged as
unmaintained; refreshed templates come from a census of real setlists (Friday, Saturday morning, Shir Shabbat,
b'nai mitzvah, special Shabbatot), proposed to Daniel, never generated from a book.

### Round 2 — proposed by Cowork after the 2026-09-15 returns; status per line

- R2-a Merge `kedushah-kavannah`→`kdushah-kavannah` and `shema`,`shma`→`the-shma`. **Approved by Daniel 2026-09-15.**
- R2-b `.live` drops the `6f61874-LICENSED` pin for the two Shabbat drafts (Ruling 8 corollary); machzor pin stays. **Approved by Daniel 2026-09-15.**
- R2-c `kind` is set by a kind marker anywhere in the stem. **Approved by Daniel 2026-09-15.**
- R2-d Legacy YK volumes gain `when.dates`/`daypart` at the liturgy source so the reader opens Kol Nidre unaided. **Approved by Daniel 2026-09-15.**
- R2-e `today.json` gains additive `readerBook` from a .live-side crosswalk; reader rung 0 accepts it. **Approved by Daniel 2026-09-15**, with the design fact behind the vocabulary gap stated by him: the reader deliberately splits the one printed 2008 machzor into per-service volumes because a davener on the app is davening from exactly one service; .live registers the whole printed volume as one book. So the crosswalk is not a workaround for a mismatch but the correct mapping — (.live book, serviceType) → reader volume — and it belongs, eventually, in moments.json as book-level identity.
- Recorded facts: reader draft-folio leak was live in production and is fixed (release `71dd36e2c7…`); Part C landed switch-OFF; stems merged with `kdushah` surviving (pin-forced); Overlays §3 did not run.
- **R2-f (given by Daniel 2026-09-15): CRC does not use publish.** A setlist is live when it exists. `today.json` and the Overlays setlist import select by service date alone (today → +7d; `isTest` excluded) and ignore `publishedAt`. PLAN A-W6 ("publish is a real step") is withdrawn; "no auto-publish" is moot. `publish_setlist` may remain as an optional marker but nothing downstream keys off it.
- **R2-g (given by Daniel 2026-09-15): the reader always opens to the service picker (Home).** Date/daypart claims and `today.json` may expand a family and tag one item TODAY — reorder and suggest — but must never bypass the choice by opening a book directly on launch. (A `?book=` link a leader hands out is the one exception, as today.) Neilah on 2026-09-21 evening: Yizkor carries the TODAY tag, Neilah sits beside it; accepted.

### Round 3 — bindings and census, ruled by Daniel on the "Liturgy Bindings" page, 2026-09-15

- Bindings confirmed once per spelling; everything unmarked approved at default. Record: `CentralReform.live/sheet-music-app/work/liturgy-bindings-confirmed-2026-09-15.json` (Friday 39 bind / 4 unbound; Saturday 82 / 3). Adonai S'fatai is a moment (Amidah opening) whose booklet entry is its setting "Sanctuary"; all its spellings bind to p.23 / p.70. "Closing Blessing" binds to the concluding Birkat Kohanim p.100.
- Census: refresh B'nai mitzvah, Shabbat morning, Shir Shabbat templates from their census rows (all kept); leave Friday night, Camp Sabra, Special Shabbat templates as they are (too few services to trust). Record: `work/service-census-rulings-2026-09-15.json`.
- B'sefer Chayim p.152 on the Kol Nidre setlist is correct. Neilah begins 18:00 (`startsAtLocal`), so today.json orders Yizkor before Neilah.
- Overlays to determine why the Rosh Hashanah cue log is empty (feature not yet live / cleared / workspace scope) before Kol Nidre.

### Round 4 — 2026-09-15

- Daniel: CRC cuts over to Overlays now, on `overlays.centralreform.org` (CNAME switched 2026-09-15); Michael has not used it before, so there is no trial period and no prior cue log. Plans carry no date gates.
- R4-a Census refreshes never drop `header` rows; Shir Shabbat's three headers are restored. (Default, pending Daniel's objection.)
- R4-b In a refreshed template, census order outranks booklet page order.
- R4-c Page numbers on setlists are authoring (David/Daniel), never repo work; a machzor service's identity comes from the legacy per-service feeds (`crc-kol-nidre` …) as `momentId`, while the printed page stays as typed.
- Findings recorded: .live drops every history row because it expects `at` as a string (Overlays sends epoch ms); Overlays' `content/moments.json` is still empty (Part E data not yet adopted there); the domain swap is still to be executed.
- R4-d **Rosh Hashanah morning on the reader (Daniel):** the legacy machzor volume (`crc-rh-morning`) for the regular services; Shirei Tshuvah for the alternative service and for Second Day. In `today.json` this is the crosswalk: `.live` `rosh-hashanah-day` → `crc-rh-morning`; `rosh-hashanah-morning` (the alt / Day 2 machzor setlists) → `shirei-tshuvah`. On the shelf: `crc-rh-morning` claims RH day 1 morning; `shirei-tshuvah` claims day 2 (the emitter's `NOTE shelf/when` resolves).
- R4-e **Modeh Ani chart approved (Daniel):** CHARTS-001 option 2 — compute the manifest from the reviewed Storage generation, write the approval with its precondition, set `READER_PUBLIC_CHARTS_ENABLED=true`, redeploy, verify select/chart/CORS/404-for-anything-else. The reader's chart panel (W6) still waits on DESKTOP-UX-001.
- R4-f **Overlays and `today.json` (default, Daniel did not rule):** when Michael opens Prepared services, tonight's service from `today.json` is *suggested* (highlighted, one tap to load), never auto-loaded — the same picker-first rule as the reader (R2-g).
- Alias batches 2 and 3 are on the rulings page (41 stems, merged stems folded into survivors).

### Round 5 — 2026-09-15

- R5-a Un'taneh Tokef p.147 (the capture's 148 is B'rosh Hashanah — fix the capture). R5-b Avinu Malkeinu (YK morning) p.160 — typed 162 corrected by Daniel's ruling. R5-c Al Cheit (Kol Nidre) p.116 — typed 117 corrected by Daniel's ruling. R5-d Shehecheyanu in Kol Nidre p.97. R5-e Perform-mode fold is per run, as built.
- The two typed-page corrections are the explicit exception to "a typed page is never overwritten": Daniel ruled them.

### Round 6 — 2026-09-15, after the round-5 returns

- Round 5 landed: shireishabbat `95a9836` (Un'taneh Tokef = `crc-yk-morning` p.147, B'rosh Hashanah p.148–149 — two id moves, no printed byte changed); .live `c2dabe77f5`…`e4a7db4410` (Avinu Malkeinu 162→160, Al Cheit 117→116, both Kol Nidre Shehecheyanu rows bound to 97; `momentId` now follows any typed page; R4-d crosswalk live; `today.json` five services with `readerBook`/`startFolio`); Overlays `08476ac` (Prepared services suggests the nearest service from `today.json`, never loads it; `crc-overlays.vercel.app` still answers as the alternate).
- R6-a **`crc-rh-morning` has the identical misfiling** (shireishabbat finding): the capture has `kdushat-hayom` at p.56 printing *U'nitaneh tokef…* and `untaneh-tokef` at p.57–58 printing *B'Rosh haShanah…*. By R5-a's reasoning: Un'taneh Tokef is p.56, B'rosh Hashanah p.57–58. **Default yes unless Daniel objects.**
- R6-b **Distributed rate limiter for .live's public chart path** (Upstash Redis via the Vercel marketplace, free tier): the Modeh Ani approval (R4-e) is written and inert because the anonymous chart endpoint refuses to serve without `UPSTASH_REDIS_REST_URL`/`UPSTASH_REDIS_REST_TOKEN`. Side effect: the site's general limiter reads the same two variables and stops degrading to per-instance counting. **Approved unless Daniel says "no Upstash" before launching .live.**
- R6-c **Reader carries R5-a and R4-d by hand.** The shelf sync correctly refuses the full carry (442 authored render fields would drop); a focused carry cannot touch `books.json`. The reader lane hand-applies the two `when` values and the two-unit correction in its `crc-yk-morning` feed copy. The corpus lane emitting the six authored fields from the source build stays the corpus lane's.
- R6-d **.live regenerates `crc-machzor-2008` from the rebuilt feeds** and retires its R5-a override when the script reports it matches the capture. The identity check must accept the *ruled* id retirement (`amidah.kdushat-hayom@crc-yk-morning` → `amidah.untaneh-tokef@…`; new `amidah.brosh-hashanah@…`) through an explicit retirements list — never by loosening the check.
- R6-e `crc-overlays` Vercel Git integration deploys CRC (not TBI) on every push to `main`. Daniel's Vercel setting; Cowork recommends off so `deploy-workspaces.mjs` is the only path to production.
- R6-f 5788's Rosh Hashanah dates enter `CAL` and `volumes.json` together, when Daniel supplies them. Nothing else moves for this.
- R6-g **`legacy-slichot` gains `printedFolio`** from its capture where the capture carries the printed page, so Selichot rows can page. **Default yes unless Daniel objects.**
- Round 6 shireishabbat return (`10d3a58`): R6-a landed (Un'taneh Tokef `crc-rh-morning` p.56, B'rosh Hashanah p.57–58; 221 printed pages byte-identical). R6-g stopped by its own condition: the Selichot capture is a slide deck and a folded handout with no printed page anywhere (0 of 8 units); Selichot pages on its typeset folios 1–8 unless a paginated printed booklet is ever captured.
- R6-h **The kavannah at `crc-rh-morning` p.56** (`amidah.kdushat-hayom-kavannah`, "U'nitaneh tokef k'dushat hayom… Rabbi Amnon of Mayence") is the kavannah to Un'taneh Tokef: rename to `amidah.untaneh-tokef-kavannah@crc-rh-morning`, moment `untaneh-tokef-kavannah`. **Default yes unless Daniel objects.** .live's `RETIRED_UNITS` gains this third retirement.
- R6-i The moment `brosh-hashanah` now displays "B'rosh Hashanah" (2–1 over the Slichot incipit "B'Rosh Hashanah Yikateivun"). **Stands by default**; the incipit stays an alias candidate.
- R6-h landed (`fb5f347`): `amidah.untaneh-tokef-kavannah@crc-rh-morning`, name "Un'taneh Tokef Kavannah" (house form), p.56 unchanged, 221 pages byte-identical. R6-i confirmed in the artifact. .live `RETIRED_UNITS` = three rows (R5-a, R6-a, R6-h).
- R6-j Housekeeping: `crc-yk-morning`'s `T'filah` `sectionopener` `items` list still carries the capture names (prints nothing, reaches no feed). Bring into agreement with `_units` on the next shireishabbat launch. **Default yes.**

### Round 7 — 2026-09-15, after the round-6 returns (small; launch whenever)

- Round 6 landed everywhere. .live `37b5472ff7`/`b17e06e412`/`c2d51a31ff`: `RETIRED_UNITS` (three rows) with a tested refusal; R5-a override retired itself; `also` variants re-home curated names; **Modeh Ani chart live** (Upstash provisioned via marketplace under `KV_*` names, resolved as a pair; served bytes hash to the reviewed manifest); 84 setlists / 1,559 rows scanned, 0 on a retired id. Reader `ed7e67f`, release `e4a050a1…`: R6-c hand-applied to both morning feeds, `when` split, `renderStructure` preserved, deployed.
- R7-a **Reader per-test cap.** `selected-rh-services-release.spec.js` costs 72 s under a 120 s cap on a runner with a 1.57× spread; it went red twice on load, not on code. Raise `test.setTimeout` for that spec (or globally) to 180 s. **Default yes.**
- R7-b **Reader hand-carries R6-h** the same way as R6-c: `amidah.kdushat-hayom-kavannah@crc-rh-morning` → `amidah.untaneh-tokef-kavannah@crc-rh-morning`, name "Un'taneh Tokef Kavannah", p.56, textual patch, authored fields preserved, re-stamp, deploy. Given.
- R7-c **.live accepts the binder's Rosh Hashanah proposals** — empty rows only, the standing round-4 rule; typed pages untouched (Rosh Hashanah Day 20, Alt Day 8, Day 2 8, plausible rows listed for Daniel, not bound). **Default yes.**
- R7-d **Corpus lane (shireishabbat), recorded for its next order — not this round:** the source build must emit the six reader-authored fields (`renderStructure` 295, `standalone` 78, `group` 42, `render` 16, `companionRole` 7, `companionOf` 4 — 442 values) and account for the **fourteen units the reader carries that the build does not emit** (`shma.shema@crc-erev-rh`, `shma.shema@crc-kol-nidre`, seven in `legacy-beit-mitzvah`, two each in `legacy-shabbat-evening`/`-morning`, `amidah.kedushah@shabbat-shacharit`) plus 120 `blocks` differences in the two Shabbat drafts, before any full shelf carry can run again. Until then every carry is by hand.
- Vercel Git integration also double-builds .live on push (same commit both times). Same recommendation as R6-e, Daniel's setting.

### Round 8 — 2026-09-16, after the round-7 returns (small; launch whenever)

- Round 7 landed. .live `f084e9c058`: 36 empty Rosh Hashanah rows bound (typed pages untouched, 92 checked); `moments.json` synced to `fb5f347` (it had been three rulings stale — the book and the moments artifact are two products of one build and must be synced together from now on); three `brosh-hashanah` rows re-derived. Reader release `80ef8784…`: kavannah carried, cap 180 s, both CI runs green (the test cost 2.0 m — the old 120 s cap would have failed again).
- R8-a **Backfill the 112 `shirei-tshuvah` rows** that carry a unit id and no stored `momentId` through the `update_track` seam (ref re-asserted verbatim, key derived, no page moves). **Default yes.**
- R8-b **The six plausible Rosh Hashanah rows:** bind "Kedishat Hayom – Un'taneh Tokef" → `amidah.untaneh-tokef@crc-rh-morning` p.56 (it is the R6-a row); bind both "Blessing over the Shofar & Shehecheyanu" → `shofar.service@crc-rh-morning` p.80; "The Great Aleinu" gets a **book alias** on `concluding.aleinu@crc-rh-morning` (the band's name for the moment) and then binds on both setlists; "Hakafot – Nigun 5" stays unbound (a niggun, not the moment). **Default yes unless Daniel objects.**
- R8-c **Reader CI:** `chromium-desktop` sits at 18.8 m against a 20 m step budget with a measured 3.5 m spread. Divide the work (shard the project) rather than raise the number, per `R-0904-vision-12`. **Default yes.**
- Alias batches 2 and 3: still unruled on the rulings page (no `alias.*` documents). STOP stands.

### Round 9 — 2026-09-16, after the round-8 returns (queue; nothing urgent)

- Round 8 landed. .live `b265e8b8d5`/`cd6c78a1b9`: 112 rows backfilled (185/185 rows with a unit id carry a moment; 167 typed pages untouched); three accepts bound; "The Great Aleinu" alias binds at 100 on both setlists; regeneration now prints the moments-sync verdict; emulator gate green (hooks cushioned to 30 s). Reader `6ecfd44`: `chromium-desktop` sharded 1/2 + 2/2 (573 tests, partition verified line by line), worst shard 9m31s.
- R9-a **Shard `chromium-phone` too** (16m47s worst against 20 m, 3m13s margin < 3m28s spread — the same condition). Same mechanism, same two-run reading. **Default yes.**
- R9-b **Corpus naming (shireishabbat, next launch):** the unit `shofar.service@crc-rh-morning` yields moment id `service` — meaningless away from its unit and a collision waiting to happen. Rename to `shofar.shofar-service@…` (moment `shofar-service`); it is a ruled retirement for .live's `RETIRED_UNITS` and two bound rows follow the successor. Bundle with alias batches 2–3 and R6-j. **Default yes.**
- "Hakafot – Nigun 5" stays unbound (a niggun). Upstash stays.

### Round 10 — 2026-09-16: alias batches 2 and 3 ruled

- Daniel ruled alias batches 2 and 3 on the rulings page 2026-09-16: **all defaults** — every printed spelling kept, nothing added, nothing dropped. Cowork compiled `liturgy-map/moment-aliases.json`: 64 surviving stems, 140 aliases; merged stems folded to their survivors (`hoda-ah`→`hodaah`, `mi-shebeirach`→`mi-shebeirach-healing`, per R2-a and the dup rulings); every key verified against `dist-app/moments.json` at `ce41509`. One alias is deliberately two-stemmed: "Prayer for Peace" → `oseh-shalom` and `prayer-for-shalom` (both booklets print it); a lookup meeting it answers *plausible*, never *clear*.
- Round 10 is the last shireishabbat launch of the integration: aliases (this), R6-j (opener list), R9-b (`shofar.service` → `shofar.shofar-service`), then .live's follow (retirement row, two-row re-point, sync).

### Round 11 — 2026-09-16: .live absorbs round 10, and row order is asserted

- shireishabbat round 10 landed (`e5a87e3`): 64 stems / 140 aliases in `moments.json`; `shofar.shofar-service` (name "Shofar Service", p.80); opener lists 0 mismatches across seven books; printed PDF byte-identical. .live's round-10 run refused correctly because it ran before this build existed; it reruns now as round 11.
- R11-a **Case-fold in the binder's lookup.** The two "Prayer for Peace" spellings differ only in case; comparing exactly answers *clear* twice where the ruling says *plausible* once. `unit-lookup` folds case (and curly/straight apostrophes) before deciding ownership. Given.
- R11-b **Row order is the author's, and every view must prove it.** Daniel, 2026-09-16, after David found a row out of order (it was created that way on 09-14 by his own transcription session; no CRC tool moved it — measured: all five YK setlists' rows sit at their creation positions). Nothing in .live may sort, move, insert or delete rows on an existing setlist except an explicit author action (`reorder_setlist`, drag, `remove_track`, `add_track`). Add tests asserting that every setlist view (edit, Perform, service sheet, gig packet, `today.json`, Overlays import) renders rows in stored `order`, and that the binder, backfill, bind-on-type and `propose_service_frame` leave `order` untouched; grep the UI for any sort by `folio`/`liturgyRef` and report. Daniel: **do not change the Alt Kol Nidre row order**; that is David's.
