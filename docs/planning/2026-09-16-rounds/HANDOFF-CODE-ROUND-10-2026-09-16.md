# HANDOFF → Claude Code sessions — round 10 (2026-09-16): aliases land, and the last two shireishabbat items

Governance unchanged. Read `RULINGS-INTEGRATION-2026-09-14.md` Rounds 9–10 first.

## shireishabbat — `RETURN-CODE-MOMENTS-ROUND-10-2026-09-16.md` (launch first)

1. **Aliases.** `liturgy-map/moment-aliases.json` (committed by Cowork beside this file) replaces the batch-1 file: 64 stems,
   140 aliases, keys are surviving stems. Wire it exactly as batch 1 was (`emit_moments.py` → `moments.json` `aliases[]`,
   `moments-pairs.json`, `moments-alias-candidates.json` `confirmed[]`). One alias maps to two stems ("Prayer for Peace" →
   `oseh-shalom`, `prayer-for-shalom`): the emitter must carry it on both and `unit-lookup` must answer *plausible* for
   it, not pick one; test that. Every key must exist in `moments.json` or the build refuses (test).
2. **R9-b** — `shofar.service@crc-rh-morning` → `shofar.shofar-service@crc-rh-morning` (moment `shofar-service`), same
   four-line discipline as R6-a/R6-h: page unchanged, printed bytes measured identical, `_aliases` carries the old name,
   fixtures renamed.
3. **R6-j** — `crc-yk-morning`'s `T'filah` `sectionopener` `items` list brought into agreement with `_units`
   (Un'taneh Tokef, B'rosh Hashanah). Prints nothing; the opener/_units audit must report 0 mismatches family-wide.
4. Rebuild `dist-app/`; new `sources[].gitSha`; moments gate six modes; 14-line baseline unchanged; report alias counts
   before/after in `moments.json`.

## CentralReform.live — append to `RETURN-CODE-LIVE-INTEGRATION-2026-09-14.md` (after shireishabbat)

1. `RETIRED_UNITS` gains `shofar.service@crc-rh-morning` → `shofar.shofar-service@crc-rh-morning` (R9-b); regenerate the
   book, `npm run sync:books` (the script now says so itself); the two Shofar rows (`35380072/d709ca94`,
   `e7cf1877/4f7f98f0`) re-pointed to the successor with `momentId` `shofar-service`, pages untouched; sweep all 84
   setlists: 0 rows on any retired id.
2. Confirm the new aliases reach the binder: dry run on the four Shabbat templates and every future setlist — report rows
   that move from *plausible*/*unmatched* to *bound* because of a batch-2/3 alias, and that "Prayer for Peace" stays
   *plausible*. Bind nothing without `accept`.
3. `today.json` re-emitted; chart path 200/200/404/403 `[measured]`.

## Reader — nothing (aliases do not reach the shelf; the next carry is R7-d's).

## Launch prompts

shireishabbat: `Read HANDOFF-CODE-ROUND-10-2026-09-16.md (this repo) and RULINGS Rounds 9–10; do the four items; write
RETURN-CODE-MOMENTS-ROUND-10-2026-09-16.md.`

.live (in `sheet-music-app`, after shireishabbat): `Read ..\HANDOFF-CODE-ROUND-10-2026-09-16.md and RULINGS Rounds 9–10; do
the .live section; append to ..\RETURN-CODE-LIVE-INTEGRATION-2026-09-14.md.`
