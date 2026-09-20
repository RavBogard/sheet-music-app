# HANDOFF → Claude Code sessions — round 4 (2026-09-15)

Governance unchanged. Read `RULINGS-INTEGRATION-2026-09-14.md` (all addenda) first. No date gates anywhere in this
file: CRC is cutting over to Overlays now, on `overlays.centralreform.org`, and everything below is "do it".

## What round 3 established

- .live: confirmed bindings are the lookup (`src/data/liturgy/confirmed-bindings-2026-09-15.json`); 50 template rows
  bound; Neilah 18:00 live in `today.json`; Always rows merged into the live Kabbalat Shabbat template (15 → 30);
  B'nai mitzvah / Shabbat morning / Shir Shabbat templates refreshed from the census; bind-on-type live (MCP and
  browser via `POST /api/liturgy/bind-row`); `propose_service_frame` built; a `getTemplate` bug that hid every
  template page fixed; `cleanup_all_test_data` made safe (dryRun default, `force` required).
- Overlays (read-only): the cue log did not exist before 2026-09-14 16:21 CT, so the empty RH log is expected; the
  recorder is live and unconditional on both relays. **Two .live defects found**: (3.1) Overlays sends `at` as epoch
  ms (a number, per plan and tests); .live's row guard requires a string and silently drops every row →
  `reconcile_service` reads 0 rows forever. (3.2) nothing .live matches on can match a machzor service: Overlays'
  `content/moments.json` is empty (Part E data never adopted there), Overlays' `book`/`folio` are the feed slug
  (`crc-kol-nidre`) + booklet-local folio (1–45) while .live rows say `crc-machzor-2008` p.96–132, and history
  rows carry no title by ruling. The bridge is `momentId` on both sides.
- Reader: round 2 shipped (`48d064c`); the CI trap (docs push cancels the code run) is recorded.
- The Overlays **domain swap has not been executed** — the round-3 session ran the earlier investigation text.

## Rulings in this round (Daniel, 2026-09-15)

- R4-a Shir Shabbat's three section headers ("Kabbalat Shabbat", "Ma'ariv Service", "T'filah") go back — headers are
  structure, not repertoire; a census refresh must never drop `header` rows. **Default yes unless Daniel objects.**
- R4-b Census order outranks booklet page order in a refreshed template (the two inversions stand). Given.
- R4-c **Withdrawn and reversed by Daniel**: page numbers are a core feature; every machzor service's pages exist in
  shireishabbat and must resolve automatically. The 2026-09-11 order that registered `crc-machzor-2008` mapped only RH
  morning (pp.38–92) and deferred the rest as "a separate wave" because bare names repeat across services; that wave
  is now item 0 below.

## CentralReform.live — append to `RETURN-CODE-LIVE-INTEGRATION-2026-09-14.md`

0. **The whole 2008 machzor, service-scoped (R4-c).** Extend `src/data/books/crc-machzor-2008.json` from RH-morning-only
   to every service the volume prints, keyed by service so a name resolves only within its own service's pages.
   Source: shireishabbat's machzor transcription (`transcription-mz` captures — each unit's `src:` field is the printed
   folio; the 2026-09-11 order `ORDER-CRC-MACHZOR-2008-BOOK.md` describes exactly how the RH-morning slice was
   generated) and the per-service feeds in `dist-app/` (`crc-erev-rh`, `crc-rh-morning`, `crc-kol-nidre`,
   `crc-yk-morning`, `crc-yizkor`, `crc-neilah`, `legacy-slichot`) whose unit ids give identity and whose names/aliases
   give the lookup. Nothing typed by hand: every page comes from a capture. Model: `entries[]` gain a `service` (the
   `.live` `templateType` it serves: `kol-nidre`, `kol-nidre-alt`, `yom-kippur-morning`, `yizkor`, `neilah`,
   `rosh-hashanah-morning`, `rosh-hashanah-day`, `erev-rosh-hashanah`, `selichot`); `lookup_book_page`,
   `validateLiturgyRef` and the binder scope by the setlist's `templateType` when the book is `crc-machzor-2008`;
   a name with no service scope keeps today's behaviour (RH morning) so nothing existing changes. Each entry also
   carries its `unitId` so rows get `momentId` (item 2 below). Tests: Bar'chu resolves to 45 / 100 / 136 by service;
   `registry.test.ts` unchanged in spirit (pages 215).
   **Then bind the five Yom Kippur setlists** (dry run, then commit): empty rows gain a page and a `momentId`;
   **a typed page is never overwritten** — where David's page disagrees with the map, list the row in the RETURN for
   Daniel instead of changing it. Report per setlist: rows filled, rows agreeing, rows disagreeing. Re-emit
   `today.json`; `startFolio` should now exist for all five.

1. **History rows: accept `at` as a number.** Fix `isHistoryRow` and `reconcile.ts` to take epoch-ms numbers (keep
   accepting ISO strings), test against a **real captured response shape** (`work/handoffs/cue-log/history-rehearsal.json`
   in the Overlays repo is the canonical sample), assert `workspace === 'crc'`, and follow `nextAfter` so a long
   service is not truncated at 500 rows. Verify `reconcile_service` on the new host `https://overlays.centralreform.org`
   `[measured]` — zero rows is still the expected answer until a service is driven.
2. **`momentId` on rows — the real bridge to the cue log.** Rows gain `momentId` (nullable) beside `liturgyRef`,
   derived at bind time from the lookup's unit id via `momentForUnit` (Part E's `moments.json` is now non-empty).
   For the legacy booklets that is enough. For machzor services, build the lookup from the **legacy per-service
   feeds** shireishabbat already ships in `dist-app/` (`crc-kol-nidre`, `crc-yk-morning`, `crc-yizkor`, `crc-neilah`,
   `crc-erev-rh`, `crc-rh-morning`): name/alias → unit id → momentId, **identity only — the printed page stays whatever
   David typed; never overwrite a folio.** Then `pickPlanned` matches on `momentId` first and works for a machzor
   service. Stage a dry run over the five YK setlists and report how many rows gain a `momentId`.
3. **R4-a**: restore the three Shir Shabbat headers in place; make the census-refresh function carry `header` rows
   through unchanged, with a test.
4. **Perform-mode collapse** (the last unbuilt piece of the display policy): a `fixed: true` row with no `fileId`
   collapses to a thin labelled divider in Perform mode, tap-to-expand, per-device preference, default collapsed.
   Load the design skill; check at iPad 820×1180; the 45 fixed rows now in the templates are the test case.
5. **R4-d crosswalk**: `rosh-hashanah-day` → `crc-rh-morning`; `rosh-hashanah-morning` → `shirei-tshuvah` (alt and Day 2
   setlists carry that type). Test both. Re-emit `today.json` and confirm shape (`readerBook` present, five services,
   Yizkor before Neilah).
6. **R4-e — Modeh Ani approved, option 2**: compute the manifest from the exact reviewed Storage generation, write
   `publicReaderStatus: "approved"` + `publicReaderManifest` with the update-time precondition, set
   `READER_PUBLIC_CHARTS_ENABLED=true` in production (via `vercel env`, **without** a trailing newline — the CRLF trap
   from round 1), redeploy, verify `[measured]`: select → 200 available for the Modeh unit from the siddur origin,
   chart → 200 `application/pdf` with `no-store` and the single allowed origin, anything else → 404, foreign origin →
   403. Update `shireishabbat/ops/tasks/CHARTS-001.json` (approved, evidence, rev +1).

## Overlays — `work/handoffs/RETURN-CODE-OVERLAYS-ROUND-4-2026-09-15.md`

1. **Domain swap** (Daniel has attached the domain and set `PUBLIC_BASE_URL=https://overlays.centralreform.org`,
   `PUBLIC_ALTERNATE_ORIGINS=https://crc-overlays.vercel.app` on the CRC project): redeploy the serving commit via
   `scripts/deploy-workspaces.mjs`; run the four-host probe read-only (`/`, `/access`, `/author`, `/output` 200;
   OAuth issuer + protected resource on the new host; Google `start` → 303 with the new-host `redirect_uri`; foreign
   Origin → 403; `/api/state` with `CONTROL_KEY` 200; the Vercel hostname still answers as itself); relay
   `ALLOWED_ORIGINS` admits an output loaded from the new host `[measured]`. Deploy record.
2. **Adopt moments.** `content/moments.json` is `{"moments":[]}`. Run the Siddur-library workflow (System → Setup's
   Run button, or `gh workflow run siddur-library.yml`) so `scripts/adopt-moments.py` pulls shireishabbat's
   `dist-app/moments-pairs.json` (built this morning at `d86de56`/later — 340 moments, 720 pairs) into the PR; merge;
   deploy web. Verify `/api/catalog?include=liturgy` shows non-null `momentId`s and that `/api/history` rows joined
   at read time carry them `[measured]` on a rehearsal row.
3. Fix `readDeviceList` if round 2 did not (check `app/access/devices-copy.ts` accepts `history_reader`).
4. **R4-f — read `today.json` (Ruling 5's Overlays half, never built).** In Prepared services / Import from
   centralreform.live, fetch `https://www.centralreform.live/today.json` (public, no credential) and **suggest** the
   service whose `startsAt` is nearest now — highlighted, one tap to import/load — never auto-load. Fall back
   silently on 404 / empty `services`. Keyed on `setlistId`; `book`/`readerBook` unused here. Small; test the
   nearest-now choice and the silent fallback.

## Reader — append to `RETURN-CODE-READER-TODAY-2026-09-14.md`

Round 3 §Reader items, if not done: (1) `CAL` learns the five Yom Kippur services (times as in `today.json`:
alt Kol Nidre 17:00, Kol Nidre 20:00, YK morning 10:00, Yizkor 17:00, Neilah 18:00; stream five minutes early);
(2) `tools/sync-books.js` full carry merges or refuses on the reader-only `books.json` fields; land the preserved
carry through the fixed path. Deploy; `gh workflow run test.yml --ref main` and read step durations, per §8.

## shireishabbat — one line (R4-d)

`build/volumes.json` `app.when`: `crc-rh-morning` claims Rosh Hashanah day 1 morning; `shirei-tshuvah` claims day 2
(dates for 5787 are past — write the rule so next year's dates derive from the calendar the emitter already has, or
record the 5788 dates; say which). The emitter's `NOTE shelf/when` for the RH-morning ambiguity then resolves.
Rebuild `dist-app/`; the reader carries it with the focused sync.

## Launch prompts

.live (in `sheet-music-app`): `Read ..\HANDOFF-CODE-ROUND-4-2026-09-15.md and the RULINGS addenda; do the .live section
in order; append to ..\RETURN-CODE-LIVE-INTEGRATION-2026-09-14.md.`

Overlays: `Read docs\planning\2026-09-14-integration\HANDOFF-CODE-ROUND-4-2026-09-15.md; do the Overlays section in
order (the domain swap first — Daniel has set the variables); write work\handoffs\RETURN-CODE-OVERLAYS-ROUND-4-2026-09-15.md.`

Reader: `Read HANDOFF-CODE-ROUND-4-2026-09-15.md §Reader (this repo); do both items; append to
RETURN-CODE-READER-TODAY-2026-09-14.md.`
