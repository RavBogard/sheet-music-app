# HANDOFF → Claude Code sessions — round 5 (2026-09-15): corrections and the three late round-4 items

Governance unchanged. Read `RULINGS-INTEGRATION-2026-09-14.md` (all addenda) first.

## Rulings (Daniel, 2026-09-15)

- R5-a **Un'taneh Tokef is p.147.** The map's 148 is *B'rosh Hashanah*: the capture files the following page's unit
  under Un'taneh Tokef. Fix at the source (shireishabbat `crc-yk-morning` feed / capture): Un'taneh Tokef
  `printedFolio` 147; B'rosh Hashanah is its own unit at 148 (if the feed already has it, correct the folio; if it
  is folded into Un'taneh Tokef, split it). David's typed 147 stands.
- R5-b **Avinu Malkeinu (YK morning) is p.160** — the map is right; correct David's typed 162 on that row.
- R5-c **Al Cheit (Kol Nidre) is p.116** — the map is right; correct the typed 117 on the main Kol Nidre setlist.
- R5-d **Shehecheyanu in Kol Nidre is p.97** (the volume prints it at 97 and 99); alias it so the lookup resolves.
- R5-e Perform-mode fold is per run of consecutive unplayed fixed rows (as built). Given.
- Carried from round 4 (added after launch, not yet done): **R4-d** crosswalk (`rosh-hashanah-day` → `crc-rh-morning`;
  `rosh-hashanah-morning` → `shirei-tshuvah`); **R4-e** Modeh Ani chart approved (option 2); **R4-f** Overlays
  suggests tonight's service from `today.json`, never auto-loads; shireishabbat `when` for RH day 1 / day 2.

## shireishabbat — `RETURN-CODE-MOMENTS-ROUND-5-2026-09-15.md`

1. R5-a in the `crc-yk-morning` capture/feed. Rebuild `dist-app/`; report the changed `printedFolio` lines and the new
   `sources[].gitSha`.
2. R4-d shelf half: `build/volumes.json` `app.when` — `crc-rh-morning` claims RH day 1 morning; `shirei-tshuvah`
   claims day 2 (derive the dates from the calendar the emitter has, or record 5788's; say which). Rebuild; the
   reader carries it with the focused sync.

## CentralReform.live — append to `RETURN-CODE-LIVE-INTEGRATION-2026-09-14.md`

1. Regenerate `crc-machzor-2008.json` from the rebuilt feeds (R5-a lands as a data change); add the Kol Nidre
   Shehecheyanu alias → 97 (R5-d). Re-run the five-setlist binder dry: the three former disagreements should now be
   two typed-page corrections and one agreement.
2. **Correct two typed pages on David's rows, by Daniel's ruling** (the one exception to "never overwrite a typed
   page", ruled explicitly): YK Morning Avinu Malkeinu 162 → 160; Kol Nidre Al Cheit 117 → 116. Via the normal
   setlist update path; note both in the RETURN with before/after.
3. R4-d crosswalk + tests; re-emit `today.json`.
4. R4-e Modeh Ani, option 2 — exactly as written in round 4 item 6 (manifest from the reviewed Storage generation,
   approval with precondition, `READER_PUBLIC_CHARTS_ENABLED=true` without a trailing newline, redeploy, verify
   select/chart/CORS/404/403 `[measured]`, `CHARTS-001.json` rev +1).
5. Verify `reconcile_service` on `https://overlays.centralreform.org` still returns `ok:true` `[measured]`.

## Overlays — `work/handoffs/RETURN-CODE-OVERLAYS-ROUND-5-2026-09-15.md`

1. R4-f: in Prepared services / Import from centralreform.live, read the public `https://www.centralreform.live/today.json`
   and **suggest** (highlight, one tap to import/load) the service whose `startsAt` is nearest now; never auto-load;
   silent fallback on 404 / empty. Keyed on `setlistId`. Tests for nearest-now and fallback. Deploy web.
2. Confirm on the record that `crc-overlays.vercel.app` still answers as the alternate (the .live return believed
   it 404s; Cowork measured 200 at ~13:40Z) — one probe line.

## Reader — nothing this round (round 4 shipped `c616fd7`; the preserved carry stays the corpus lane's)

## Launch prompts

shireishabbat: `Read HANDOFF-CODE-ROUND-5-2026-09-15.md (this repo) and the RULINGS addenda; do both items; write
RETURN-CODE-MOMENTS-ROUND-5-2026-09-15.md.`

.live (in `sheet-music-app`, after shireishabbat's rebuild): `Read ..\HANDOFF-CODE-ROUND-5-2026-09-15.md and the RULINGS
addenda; do the .live section in order; append to ..\RETURN-CODE-LIVE-INTEGRATION-2026-09-14.md.`

Overlays: `Read docs\planning\2026-09-14-integration\HANDOFF-CODE-ROUND-5-2026-09-15.md; do the Overlays section; write
work\handoffs\RETURN-CODE-OVERLAYS-ROUND-5-2026-09-15.md.`
