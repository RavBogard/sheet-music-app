# HANDOFF → Claude Code sessions — round 7 (2026-09-15): two small closers

Governance unchanged. Read `RULINGS-INTEGRATION-2026-09-14.md` Round 7 first. Both sessions independent; launch whenever.

## Reader — append to `RETURN-CODE-READER-TODAY-2026-09-14.md`

1. **R7-b** — hand-carry R6-h exactly as R6-c was carried: in `books/crc-rh-morning-feed.json`,
   `amidah.kdushat-hayom-kavannah@crc-rh-morning` → `amidah.untaneh-tokef-kavannah@crc-rh-morning`, name
   "Un'taneh Tokef Kavannah", p.56 unchanged; textual patch (no JSON round-trip), every replacement asserted unique,
   unit-by-unit diff against `shireishabbat/dist-app` (`fb5f347`) reduced to exactly the authored-field set.
2. **R7-a** — raise the per-test cap for `selected-rh-services-release.spec.js` to 180 s (or the global
   `test.setTimeout` if the config has no per-spec seam); record the margin arithmetic from round 6 in the commit.
3. Stamp last, commit, deploy, `gh workflow run test.yml --ref main`; read both runs' durations.

## CentralReform.live — append to `RETURN-CODE-LIVE-INTEGRATION-2026-09-14.md`

1. **R7-c** — `propose_liturgy_bindings` `dryRun:false` on the five Rosh Hashanah setlists, **`bound` rows only**
   (empty rows gaining a page + `momentId`); `plausible` rows go in the RETURN as a table for Daniel, unbound;
   typed pages untouched. Report per setlist before/after counts; total rows carrying a `momentId` after.
2. `today.json` re-emitted; chart path still 200/200/404/403 `[measured]`.

## shireishabbat — nothing until alias batches 2 and 3 are ruled (then: compile aliases, R6-j opener list, R7-d is a
separate corpus order).

## Launch prompts

Reader: `Read HANDOFF-CODE-ROUND-7-2026-09-15.md §Reader (this repo) and RULINGS Round 7; do the three items; append to
RETURN-CODE-READER-TODAY-2026-09-14.md.`

.live (in `sheet-music-app`): `Read ..\HANDOFF-CODE-ROUND-7-2026-09-15.md and RULINGS Round 7; do the .live section;
append to ..\RETURN-CODE-LIVE-INTEGRATION-2026-09-14.md.`
