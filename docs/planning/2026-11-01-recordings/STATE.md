# Recordings: state

## 2026-11-01 — ingest pilot (Task 6, branch `rec-ingest`)

Nothing published. Audio, transcripts, manifest and the spot-check page live in the gitignored
`.recordings-work/` of the worktree.

### What ran

- Inventory: 15 folders with audio (10 under SERVICES, 5 under SHIR SHABBATS; a nested
  `SERVICES/SHIR SHABBAT` dates itself from its file name, 2025-10-24). Dropbox shows only
  relative dates ("9 months ago") for older files, so the year inference uses a 31-day slack.
- Catalog: 108 CRC setlists from 2025-01-01 and 834 library titles, read over the read-only MCP
  (`export_catalog_mcp.mjs`; the admin `export_catalog.ts` is still to write for the full run).
- **Only 2 of 15 folders have a setlist with songs**: `SHIR SHABBATS/6.19` and
  `SERVICES/4.18_SAT MORNING` (a single 8-minute Psukei d'Zimra file). Every setlist before
  April 2026 in Firestore is an empty stub (0 tracks), and the 2025 services predate the app's
  setlists. Most of the archive therefore runs through the no-setlist path, which holds nearly
  everything. This is the main finding of the pilot.
- Pilot services: 6.19 Shir Shabbat (setlist), 7.26.25 Saturday morning (`CRC_MUSIC ONLY` mix,
  no setlist), 2.28 Tyson Bar Mitzvah (stub setlist only).
- Whisper: large-v3 on CUDA float16 (after pip-installing `nvidia-cublas-cu12` and
  `nvidia-cudnn-cu12`; `transcribe.py` adds their DLL dirs). About 8–10x real time:
  6.19 (78 min) 381 s, 7.26 (54 min) 297 s, 2.28 (123 min) 679 s.

### Threshold log

| constant | value | why |
|---|---|---|
| `SILENCE_DB`, `SILENCE_MIN_SEC` | −35 dB, 1.2 s | Plan's starting point. On 6.19 it finds 69 gaps in 78 min, clustered; songs often run into each other or into talk, so gaps alone can't cut. Kept, but only as one cut source. |
| `MUSIC_LER_MAX`, `MUSIC_SMOOTH_SEC`, `MIN_LABEL_RUN_SEC` | 0.30, 9 s, 12 s | Low-energy-frame ratio per second. Separates band from bare talk well; it cannot separate talk over a keyboard pad (common here), hence the talk detector below. |
| `SPEECH_WINDOW_SEC`, `SPEECH_WPS`, `SPEECH_RUN_MIN_SEC` | 20 s, 1.7 words/s, 15 s | On 6.19 whisper hears talk at 2–3.5 words/s over 20 s and singing at 0–1.5 (it skips most sung Hebrew). Per-segment word-length rules (tried first) missed the welcome talk. |
| `SPEECH_REPEAT_MAX`, `SPEECH_REPEAT_CONTEXT_SEC` | 0.3, 120 s | "Mississippi Goddam" is sung as dense as talk; its lines repeat within two minutes, talk doesn't. It still flags one middle verse as talk; the strong-title extension recovers it. |
| `MIN_BLOCK_SEC` | 25 s | Plan value; merges toward a neighbour of the same kind (music/talk). |
| `SONG_MIN_SEC`–`SONG_MAX_SEC`, `RUN_MAX_SEC`, `RUN_MAX_BLOCKS` | 60–480 s, 600 s, 6 | Plan values; nothing in the pilot argued against them. |
| title scoring | word windows | Char-level `partial_ratio` over a long transcript gave 0.6–0.75 to almost any title. Scoring against windows of n±1 transcript words drops unrelated titles to 0. A trailing composer word ("Lechu Goldman") is tried off, unless what's left is only everyday prayer words ("Adonai sfatai" → "adonai" matched Aleinu). |
| `TITLE_FLOOR`, `STRONG_TITLE` | 0.60, 0.85 | Below 0.60 is noise; 0.85+ was a correct hit on every 6.19 song with an English or clearly sung title. |
| `LIVE_MIN` | 0.70 | Plan value. Confidence = 0.55·title evidence + 0.20·duration fit + 0.10·music. Order alone tops out at 0.30–0.45, so **an order-only or partly-heard placement is always held**; only a clearly heard title goes live. |
| out-of-order pass | on | 6.19's band played Strange Fruit before Mississippi Goddam (setlist has the reverse), and L'cha Dodi landed off the monotone path. A clear title claims its block; weaker claims give way. |
| strong-title extension | music without talk, or the title again | A clearly heard song keeps the following blocks while they're plain music or repeat the title; stops at talk. |
| `NO_SETLIST_MIN`, `NO_SETLIST_LIVE_MIN` | 0.85 kept, 0.92 live | Plan's 0.85 to keep. 0.85–0.92 hits on 7.26 and 2.28 were mostly generic words, so live needs 0.92, a unique title (no other chart within 0.03), and the song heard in only one place. |
| `GENERIC_TITLE_CAP` | 0.80 | Titles made only of words every service sings ("Kadosh Kadosh", "Sh'ma Yisrael", "HaB'rachah") matched 3–10 places per service; capped below the keep line in the no-setlist path. |
| `SHORT_FILE_SEC` | 600 s | Plan value; single-song files (`MI SHEBEIRACH_V2.mp3`) match by name + transcript, uncut. Not exercised in this pilot. |

### Pilot results (clips live / held / dropped)

- 6.19 Shir Shabbat (setlist): 5 / 8 / 29 — live: L'cha Dodi, Shema, Strange Fruit,
  Mississippi Goddam, What a Wonderful World. Barchu was found but its row has no chart.
- 7.26.25 Saturday (no setlist): 1 / 16 / 4 — live: Tov Lehodot.
- 2.28 Tyson Bar Mitzvah (stub setlist): 1 / 29 / 100 — live: Hinei Mah Tov.

### Open

- Daniel's spot-check of `.recordings-work/spotcheck-2026-11-01.html`, then tune.
- The library has several charts per tune (5 "Hashiveinu", 11 "Oseh shalom"): even a correct
  no-setlist match can't choose the songId. Needs a rule (e.g. the chart most used in setlists)
  or Daniel's call.
- Backfilling setlists for the 2025–early-2026 services (or not) decides how much of the
  archive can go live.
- `export_catalog.ts` (admin) and the real `publish.ts` wait for PR A; the vitest
  `publish skips rows whose ingestKey exists` comes with the real publisher.

## 2026-11-01 — rulings and round 2

### Daniel's rulings

1. **"Skip services without setlists."** Only services with a real (non-empty) setlist in the
   app are cut. `pilot.py` writes one `skipped` row per other folder ("skipped: no setlist"; an
   ambiguous date is "skipped: ambiguous setlist"), the report lists them, and `publish.ts`
   refuses any row whose service didn't match a setlist. The library-only matcher stays in
   `cut.py` (cheap) but publishes nothing.
2. **Several charts for one tune → "the one we play most":** the songId used in the most CRC
   setlists of the catalog. A tie, or no usage at all, is held. (With a setlist the row's own
   songId is used, so this only applies to library matches.)

### Round-2 changes

| change | why |
|---|---|
| Title evidence only from sung or unclear lines; a line of 4+ words with median word ≤ 0.36 s is spoken (`SPOKEN_MAX_WORD_SEC`), > 0.40 s is sung (`SUNG_MIN_WORD_SEC`). | 6.19's Shema went live on "when we say the words of Shema" in the rabbi's teaching (34:02), read slowly over the piano. A title only spoken now places by order and is held as "title only spoken (an introduction?)". |
| `TITLE_PARTLY` 0.70 | Labels "title partly sung" vs "placed by setlist order only; the transcript doesn't name it; check by ear". Status is unchanged: anything short of a sung title is held. |
| `trim_talk`, `TRIM_MIN_SEC` 15, `TRIM_PAD_SEC` 2 | Talk before the first / after the last sung line is cut off the clip (6.19 Lechu lost a 46 s introduction; Adonai sfatai lost 149 s of Kaddish names). Shorter talk stays, so lead-ins survive. |
| 4.18 Psukei d'Zimra (3:29, single-song file) matched its setlist row by file name | `SHORT_FILE_SEC` 600 unchanged; candidates are the setlist's rows. |

Shema on 6.19: the sung Shema is most likely around 35:05–36:05 (after "we cover our eyes")
with V'ahavta after it, but whisper heard nothing sung there. The cutter now holds Shema at
36:46–38:09 by setlist order; it needs an ear.

### Round-2 results

- 6.19 Shir Shabbat: 4 live / 9 held / 31 dropped.
- 4.18 Saturday morning (Psukei d'Zimra file): 1 live / 0 held / 0 dropped.
- 13 folders skipped: no setlist.
- `publish.ts --dry-run` (no credentials, so not checked against Firestore): 14 docs (5 live,
  9 held) and 14 files, 45.1 MB; 5 songs get a featured take. Saved to
  `.recordings-work/publish-plan.txt`.

## 2026-11-01, lead: shipped

- #63 (data, public serving, lineage, MCP tools) merged after an adversarial review. Its one Medium was fixed before merge: the public file route serves only `recordings/` paths and only `audio/*`, and recordings writes are server-only in the rules.
- #67 (ingest pipeline) merged. GATE: published the first batch to prod (14 docs and files, 44.9 MB; 5 live and featured, 9 held). Proceeded because Daniel ruled "you do it" and spot-checks afterwards. A credentialed dry run came first (0 already published). The lead trimmed the What a Wonderful World start past the Hamotzi (by transcript). The temp ADC was deleted after the run.
- #66 (player, editor and library icon, Listen page, Perform guard) merged after an adversarial review (one High: the leaders' upload button, fixed) and a lead screenshot pass (phone icon, titles, one-line rows without a take).
- #69 fixed #62's + scrolling with the list (portal to body); measured pinned at 708–764 px both before and after scrolling.
- Work dir moved to `sheet-music-app/.recordings-work/` (gitignored) for the next runs.
- Open for Daniel: whether Perform keeps playing legacy audio-file charts (`AudioViewer`, the one exempt path in `perform-no-audio.test.ts`); the 9 held clips (list them with `list_recordings status:"held"`).
