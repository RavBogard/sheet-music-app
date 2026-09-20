# HANDOFF → Claude Code sessions — round 2, after the 2026-09-15 returns

Written by the Cowork session after reading the four returns. Governance unchanged (executor = producer; merge and
deploy when green; only Daniel worries about dates). Read `RULINGS-INTEGRATION-2026-09-14.md` (all addenda) first.

## What the returns established (so nobody re-measures it)

- **Yom Kippur is safe but silent.** All five YK setlists name `crc-machzor-2008`; none is "published" — and CRC never
  uses publish (R2-f), so the emitter's publish gate is the defect — hence `/today.json` is 404 and every consumer falls back to its own path. The reader's fallback was leaking a draft
  folio and a bare `5:55` on the door — **fixed and deployed** (`siddur.centralreform.org` release `71dd36e2c7…`).
- **Vocabulary gap (cross-repo, the real finding):** .live's book slugs (`crc-friday`, `crc-saturday`,
  `crc-machzor-2008`) and the reader's shelf (`crc-kol-nidre`, `crc-yk-morning`, `legacy-shabbat-evening`, …) share
  **no** listed slug. `today.json` therefore cannot steer the reader to any real book today, even once published.
  The only slugs both know are the two alpha drafts, which Ruling 8 forbids.
- Part C landed, switch OFF, rules only narrowed, CRLF-in-env defect fixed, `CHARTS-001.json` corrected.
- Part D still dark at 01:55Z (`OVERLAYS_*` env vars absent in production at that moment).
- Stems: four merged (`hodaah`, `maariv-aravim`, `mi-shebeirach-healing`, **`kdushah`** — forced by the machzor pin,
  not `kedushah`). Two more duplicate groups found, unmerged: `kedushah-kavannah`/`kdushah-kavannah` and the
  three-way **`the-shma`/`shema`/`shma`**. `dist-app/` rebuilt at `94b13d3`; `.live`'s `6f61874-LICENSED` pin for
  the two Shabbat drafts now blocks Part E and is inverted against Ruling 8.
- `.live` Part A (bind / census / templates) **never ran** — the session ended before the BIND-NOT-ADD handoff was
  on disk. The Overlays session left **no return and no change** (`devices-copy.ts` untouched).

## Rulings from Daniel for this round — see RULINGS addendum "Round 2" (pending / given as marked there)

R2-a Merge `kedushah-kavannah`→`kdushah-kavannah` and `shema`,`shma`→`the-shma` (five ids), same reasoning as
     `R-0915-producer-1`.
R2-b `.live` drops the press pin for `shabbat-maariv` and `shabbat-shacharit` in `scripts/sync-books.mjs` (guard
     stays armed for `shirei-tshuvah`); re-record `shabbat-shacharit` `pages` from the new build (146 measured).
R2-c `kind`: a kind marker anywhere in the stem sets `kind` (so `barchu-kavannah-talmud` is a `kavannah`).
R2-d Legacy YK volumes on the reader shelf (`crc-kol-nidre`, `crc-yk-morning`, `crc-yizkor`, `crc-neilah`) gain
     `when.dates` (2026-09-20 / 2026-09-21) and a `daypart`, at the liturgy source, so the reader opens Kol Nidre on
     Kol Nidre with no `today.json` at all.
R2-e Book-slug crosswalk: `today.json` gains an optional `readerBook` beside `book`, produced from a small
     `.live`-side table (`crc-machzor-2008` + serviceType → `crc-kol-nidre` / `crc-yk-morning` / `crc-yizkor` /
     `crc-neilah` / `crc-rh-morning` / `crc-erev-rh`; `crc-friday`→`legacy-shabbat-evening`;
     `crc-saturday`→`legacy-shabbat-morning`). The reader's rung 0 accepts `readerBook` when `book` is off-shelf.
     Metadata only; no text, no folio semantics change. The proper fix is book-level identity in moments.json,
     later; this is the bridge.

## Per repo

### shireishabbat (short wave) — `RETURN-CODE-MOMENTS-ROUND-2-2026-09-15.md`
1. R2-a (five ids; carry any `moment-aliases.json` keys; `_aliases` recorder rows where display names differ).
2. R2-c one-line change + tests; drop the three `KIND_EXCEPTIONS` if they become redundant.
3. R2-d `when.dates`/`daypart` on the four legacy YK volumes wherever `books/books.json` is built; run the reader's
   `tools/sync-books.js` path so the shelf carries it (coordinate: the reader session verifies).
4. Fix `build/check.sh` stale-`/tmp` feed reuse (§9 of the stems RETURN): extract unconditionally or key on sha.
5. Rebuild `dist-app/`; report the new `sources[].gitSha` so `.live` can confirm `sync:books` accepts it.

### CentralReform.live — append to `RETURN-CODE-LIVE-INTEGRATION-2026-09-14.md`
-1. **R2-f (given): CRC never publishes.** `buildToday` selects setlists by `eventDate` in [startOfToday, +7d] with `isTest` false, ignoring `publishedAt`; the same for whatever feeds the Overlays setlist import. Remove the publish nudge from AGENT-GUIDE (A-W6 withdrawn). Deploy this first — it is what makes `/today.json` answer on the 20th. Then verify `[measured]` that it emits the five YK setlists with the times and the stream, and nothing else that week.
0. **Part D — the variables ARE set and the token authenticates; the call fails on a contract mismatch.**
   `[measured]` 2026-09-15 ~02:40Z by Cowork: `reconcile_service` (dry run, RH Day 2) reached Overlays and got
   `history_http_error: Overlays /api/history returned 400`. Cause, read from both sides: `.live`
   `src/lib/performed/history-client.ts` sends `since`/`until` as ISO instants (`2026-09-13T16:30:00.000Z`);
   Overlays `lib/service-history.ts` accepts only `^\d{1,15}$` — **milliseconds since the epoch** — and answers
   400 `HISTORY_RANGE` otherwise. Fix in `.live`: send `String(Date.parse(iso))` for both (and `after` if used);
   keep the ISO type at the .live boundary. Add a test that pins the wire format to digits. Then run the Part D
   verification against a test setlist and, as the real check, `reconcile_service` dry run on RH Day 2
   (`2b2cc0f5-…`) — a service that actually had cues — and quote the row statuses `[measured]`.
1. R2-b (pin), then `npm run sync:books` against the fresh `dist-app/` → Part E's `moments.json` ships non-empty.
2. R2-e `readerBook` in the emitter + tests (shape stays `schemaVersion:1`; the reader's `calFrom` must still parse
   the old shape — additive field only).
3. **Part A per `HANDOFF-CODE-LIVE-BIND-NOT-ADD-2026-09-15.md` (all addenda) — now on disk, with
   `src/data/templates/template-rows.{friday,saturday}.json`.** Order inside Part A: A-W3″ (template rows) →
   A-W3′ binding dry run + proposal (STOP) → A-W5′ census (STOP) → A-W4′ → band-view collapse + print modes.
4. Spot-read the hand-authored `crc-machzor-2008` folios 96–132 on the Kol Nidre / YK-morning setlists against the
   printed 2008 machzor if a copy is at hand; otherwise list them for Daniel.

### Overlays — `work/handoffs/RETURN-CODE-OVERLAYS-ROUND-2-2026-09-15.md`
Exactly §3 of `HANDOFF-CODE-CONTINUATION-2026-09-15.md` (it did not run): HHD check; `readDeviceList` accepts
`history_reader`; test; deploy web to both congregations. Plus: when `.live` ships `readerBook`, nothing here
changes — Overlays keys on `book`; note that in the return.

### Reader — append to `RETURN-CODE-READER-TODAY-2026-09-14.md`
1. Rung 0 accepts `readerBook` (R2-e) when `book` is off-shelf; guard for it; guard that a draft in `readerBook` is
   refused exactly like a draft in `book`.
2. Verify R2-d landed on the shelf (`when.dates` on the four YK volumes) and that Home opens Kol Nidre on
   2026-09-20 with `today.json` 404 — the guard the return said would go green the day the claim lands.
3. Deploy; measure on production as before.

## Launch prompts

shireishabbat: `Read HANDOFF-CODE-ROUND-2-2026-09-15.md (this repo) and the RULINGS addenda; do the shireishabbat
section in order; write RETURN-CODE-MOMENTS-ROUND-2-2026-09-15.md.`

.live (in sheet-music-app): `Read ..\HANDOFF-CODE-ROUND-2-2026-09-15.md, then ..\HANDOFF-CODE-LIVE-BIND-NOT-ADD-2026-09-15.md
fully (three addenda), then the RULINGS addenda. Do the .live section in order; STOP where the bind-not-add handoff
says STOP. Append to ..\RETURN-CODE-LIVE-INTEGRATION-2026-09-14.md.`

Overlays: `Read docs\planning\2026-09-14-integration\HANDOFF-CODE-ROUND-2-2026-09-15.md and
HANDOFF-CODE-CONTINUATION-2026-09-15.md §3 beside it. Do §3. Write work\handoffs\RETURN-CODE-OVERLAYS-ROUND-2-2026-09-15.md.`

Reader: `Read HANDOFF-CODE-ROUND-2-2026-09-15.md (this repo) and the RULINGS addenda; do the reader section after
shireishabbat's R2-d has landed (check books.json for when.dates on crc-kol-nidre first); append to
RETURN-CODE-READER-TODAY-2026-09-14.md.`
