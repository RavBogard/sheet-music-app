# HANDOFF → Claude Code sessions — round 8 (2026-09-16): backfill, six rows, one shard

Governance unchanged. Read `RULINGS-INTEGRATION-2026-09-14.md` Round 8 first. Independent sessions; launch whenever.

## CentralReform.live — append to `RETURN-CODE-LIVE-INTEGRATION-2026-09-14.md`

1. **R8-a** — backfill the 112 `shirei-tshuvah` rows: `update_track` with the row's own `liturgyRef` re-asserted verbatim
   and `lastSeenVersion` pinned; `momentId` derived by the write path. Before/after sweep of all 84 setlists (`limit:200`):
   rows with unit id and no moment 112 → 0; every `liturgyRef` byte-identical.
2. **R8-b** — the six plausible rows: `accept` the Un'taneh Tokef row (p.56) and both Shofar rows (p.80); add the alias
   "The Great Aleinu" → `concluding.aleinu@crc-rh-morning` in `crc-machzor-2008` as a `RULINGS.name.also` entry carrying
   R8-b, regenerate (0 other entries move), then re-run the binder on `35380072` and `e7cf1877` so both Aleinu rows bind;
   leave "Hakafot – Nigun 5" unbound. Report each row before/after.
3. **From now on `npm run sync:books` runs whenever `crc-machzor-2008` is regenerated** — one build, two products.
   Add the `--check` to the regeneration script's output so a stale `moments.json` is named, not silent.
4. `today.json` re-emitted; chart path 200/200/404/403 `[measured]`; emulator suite run once on an idle box (it is owed).

## Reader — append to `RETURN-CODE-READER-TODAY-2026-09-14.md`

1. **R8-c** — shard `chromium-desktop` in `test.yml` (two shards, or whatever the earlier CI-shard return prescribed), so
   no step runs above ~12 m on a normal runner; read both runs' step durations and report the new margins.

## shireishabbat — nothing until alias batches 2 and 3 are ruled.

## Launch prompts

.live (in `sheet-music-app`): `Read ..\HANDOFF-CODE-ROUND-8-2026-09-16.md and RULINGS Round 8; do the .live section in order;
append to ..\RETURN-CODE-LIVE-INTEGRATION-2026-09-14.md.`

Reader: `Read HANDOFF-CODE-ROUND-8-2026-09-16.md §Reader (this repo) and RULINGS R8-c; do it; append to
RETURN-CODE-READER-TODAY-2026-09-14.md.`
