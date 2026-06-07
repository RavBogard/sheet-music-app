# Probe 6 — trackCount drift sample (15 most recent setlists by event date)

Tool: `recompute_setlist_track_count` (idempotent heal — PROMPT §explicitly allows).

| setlistId | name | declared | actual | drifted | written | pattern |
|---|---|---|---|---|---|---|
| Ikl0sS4XcZil0Z04viAu | Shir Shabbat — May 13                | 18 | 18 | false | false |  |
| vJqQL6jbpTwVVbv1Oahy | Mother's Day                          |  2 |  2 | false | false |  |
| zyJGXUdIG80fLHaifJ7o | Bnei Mitzvah Morning                  | 19 | 19 | false | false |  |
| **QQSsAK2XY4dc8k5sFXIa** | **Confirmation Shabbat**         |  **0** |  **5** | **true** | **true** | **UNDER-count** |
| UnjLqKTtS4lNKQfMY6hB | Shabbat Morning — Parashat Emor       | 30 | 30 | false | false |  |
| uBkulVkN8K7idSapCJjq | Achrei Mot-Kedoshim — April 25        | 27 | 27 | false | false |  |
| tIJ5DlvkeeN1CWAUTUM2 | Seui                                  | 16 | 16 | false | false |  |
| IvowaTdXwZI7qu9U9QXc | Tazria-Metzora — April 18             | 45 | 45 | false | false |  |
| fgxquthWA9IQ4UF2fZWw | Shabbat Morning — April 11            | 44 | 44 | false | false |  |
| 9bmwUMJzgIQgNRIe81jv | Shabbat Morning — April 4             | 38 | 38 | false | false |  |
| **5zLP8DidKQ2lLMKci2xI** | **Religious School Morning**     |  **8** |  **0** | **true** | **true** | **OVER-count** |
| 0RC4b6CpvnPbz09ue07q | Shabbat Morning — March 28            |  0 |  0 | false | false | (empty draft) |
| **s2nWyd63mWjQj3LAJ8zg** | **Shir Shabbat — March 27**      | **21** |  **0** | **true** | **true** | **OVER-count** |
| yGl9DLjYwm4jnPy0JTR4 | B'nei Mitzvah — March 14              | 28 | 28 | false | false |  |
| 29EqdMESd6QjhfokL2Bu | Shabbat Morning — March 21            |  0 |  0 | false | false | (empty draft) |

## Aggregate

- 15 sampled, 3 drifted → **20% drift rate**
- 2 over-count (declared > actual, including a 21→0 case where the user
  would see "21 tracks" badge on a setlist that has none)
- 1 under-count (declared 0, actual 5)
- All 3 drifted were unpublished drafts

## Pattern analysis

**OVER-count** (8→0, 21→0): tracks were removed but counter not decremented.
This is the producer the cycle-9 hardening B lane is targeting.

**UNDER-count** (0→5): tracks present in the `tracks/` subcollection that
the parent setlist counter never registered. This is a **NEW drift pattern**
not obviously addressed by hardening B's "remove path didn't decrement"
narrative — it suggests a creation path where the first N tracks are added
without incrementing the parent counter (could be `bulk_add_tracks`,
`clone_setlist`, or `propose_setlist_changes` failing to bump). Worth
verifying once hardening B lands.

Sample size is small (15). Drift was concentrated in unpublished drafts —
publish_setlist runs verify-charts and the daily cron heals upcoming-
published rows, so the published surface is likely healthier than this
sample. But every drafted setlist becomes a published setlist eventually.
