# Release 1: history and metadata (return report)

Shipped 2026-10-30 in PR #18 (merge a1976fa9) and PR #19 (merge 93ca6872).

## What shipped
- `get_song_history`: how a song has been done before, broken down by chart, played key and service type. It reads `setlists` through `loadHistorySetlists` and classifies each service with `classifyService`.
- `export_setlists`: every setlist in one call (73 for CRC).
- Chart `setting` / `part` / `partGroup`, parsed from the title (`src/lib/library/setting-part.ts`) and written on every library_index write. A person's own edit (`settingSource: 'human'`) is never overwritten.
- Ops back-fills `backfill_library_setting_parts` and `backfill_library_keys`, with a conditional write that stops if a row changed during the run.
- CI: `scripts/ci/build-with-font-retry.sh` retries the build only when it hits a next/font download flake.

## Prod checks
- `get_song_history {title:"Adonai S'fatai", serviceType:"shabbat_morning"}` returned 21 uses. 20 of them are "Adonai S'fatai (trad)": Em 9, Dm 4, no key 7.
- `export_setlists` returned 73 setlists in a single call.

## Back-fills
| Back-fill | Scanned | Written | Notes |
|---|---|---|---|
| setting/parts | 904 | 904 (445 with a setting, 73 with a part) | The dry run after the parser fix had no bad values; a rerun after the write found 0 changes |
| written keys | 904 | 0 | skipped: noSuggestion 495, hasKey 264, rejected 85, human 36, reviewHeld 24 |

The reports are in `backfill-reports/`.

## Notes for plan 2
- Written keys need a source other than the AI suggestion: 495 charts have none.
- Reconcile the library's existing `arranger` field with `setting`.
- Some settings are raw clarifiers ("Greg Dallas arr., rev 10-2-26", "trimmed down", "Lincoln's Nigun — Weisenberg, with Yamin U'smol"). They are fine as display text. Profiles should match on the chart, not on the setting string.
- "Soprano" and "Alto" are parsed as settings; they are vocal parts. Review this when profiles group charts.
- Matching doubled consonants in spellings (Kadish/Kaddish).
- Bare titles such as "Song Piano" are no longer read as a part.
- Setlists that have no orgId.
- Date bounds in `get_song_history` are UTC.
- `songs/{id}.defaults.key` is unused.
- The `edit_library_entry` description doesn't mention setting/part.
- A back-fill write that fails for a reason other than its precondition aborts the run instead of skipping that row.
