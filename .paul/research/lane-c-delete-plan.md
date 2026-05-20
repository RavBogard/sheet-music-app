# Lane C — Scoped Cleanup DELETE PLAN (DRY-RUN — HOLD pending confirm)

**Generated:** 2026-05-20T20:08:06.348Z  
**Lane:** lane-c-scoped-cleanup (coder-1)  
**Source manifest:** `orphan-recovery-manifest.json` (snapshot 2026-05-20T16:26:58Z, PRE-heal)  
**Bond cross-check:** `orphan-bond-map.json` (51 bonded tracks / 30 orphan fileIds / 10 live setlists)  

> **STATUS: DRY-RUN. NO DELETES EXECUTED.** Per msg-lane-c-scoped-cleanup-001 this plan is held for supervisor/Daniel confirm before any `delete_chart` call.

## Headline

- **108 rows delete-eligible** (deduped by id), **0 bonded** to any live setlist track.
- Delete mechanism: `delete_chart({fileId})` — admin-gated (pool-ROOT bearer qualifies), with a **built-in bond guard** (`chart_in_use` refusal) as an independent second gate.
- **HELD (not deleted this lane):** 271 healed supplemental rows (now `status:active`, off-limits); 22 David/bryn `upload-*` orphans (Daniel-pending source check); **3 `.mxl` MusicXML rows** (real chart format — see Holds).

## Delete set by class

| Class | Count | Confidence | Rationale |
|---|---:|---|---|
| Edge/test orphan rows | 4 | HIGH | Synthetic test fixtures (flow-2/3/5, manufactured-orphan). Null source, not bonded. |
| Duplicate rows (status:duplicate) | 8 | HIGH | Dedup-marked; a canonical copy exists. .mxl duplicate EXCLUDED (held). Not bonded. |
| .DS_Store junk | 1 | HIGH | macOS filesystem artifact swept in via Drive sync. |
| Google Drive folders | 19 | HIGH | Drive folder objects (not files) mis-indexed as charts. |
| Spreadsheets (xlsx + Google Sheet) | 3 | HIGH | Service-planning spreadsheets, not charts. |
| Google Docs (service-flow planning docs) | 8 | MED — confirm | Daniel’s service planning docs (Kol Nidre / Rosh / Yom Kippur etc). Deleting the index row does NOT touch the Drive doc. |
| Audio files (mp3/wav/m4a) | 65 | MED — confirm (volume) | Reference recordings swept in via Drive sync. Largest class. Not charts, not bonded; un-renderable in Perform. Confirm in case any are intentional reference tracks. |
| **TOTAL** | **108** | | |

## Full id list (grouped by class)

### Edge/test orphan rows (4)

- `flow-2` — (no title) | null | src=null | status=orphaned
- `flow-3` — (no title) | null | src=null | status=orphaned
- `flow-5` — (no title) | null | src=null | status=orphaned
- `manufactured-orphan-songid-xxx` — (no title) | null | src=null | status=orphaned

### Duplicate rows (status:duplicate) (8)

- `1TeiP5BlGnlP9ogYXO9yFL25J1Tz5k_RX` — dodi li (sher).png | image/png | src=google_drive | status=duplicate
- `1Uf0bVHJJ_PHn6gZ0OtGRf2RFytrx01qU` —  Ana B_Koach.pdf | application/pdf | src=google_drive | status=duplicate
- `2a2da652-343c-453d-a106-c88b3bf7178b` — Yotzeir Or (Klepper).pdf | application/pdf | src=local_upload | status=duplicate
- `upload-038ddac7-19dd-4db7-8db4-00261807d5e1` — Sim Shalom - Bonia Shur | application/pdf | src=upload | status=duplicate
- `upload-206c1e32-9ca9-41ae-b21f-c7dae2f677e3` — Ve'imru amen - Full Score | application/pdf | src=upload | status=duplicate
- `upload-cc8a9cbd-9576-47ec-8862-80378291c761` — T'filah Adonai s'fatai - Full Score | application/pdf | src=upload | status=duplicate
- `upload-d3a3bac5-d177-4057-aa2a-ac5c0bc35ffe` — Matir Asurim B minor | application/pdf | src=upload | status=duplicate
- `upload-e86055ad-456a-403d-b88c-17362fd9d6f9` — May the Memory - Full Score | application/pdf | src=upload | status=duplicate

### .DS_Store junk (1)

- `12if9gHg88ZqNMZjmLG1UH57GSriTHzqF` — .DS_Store | application/octet-stream | src=google_drive | status=active | octet_stream

### Google Drive folders (19)

- `173N8yeP19xEqNcofAbj0ZOnMK9pA7bGp` — Audio Files | application/vnd.google-apps.folder | src=google_drive | status=active | drive_folder_or_gdoc
- `17AVgm1u0g862bhM8WnvvL54hc3tthymc` — HHD | application/vnd.google-apps.folder | src=google_drive | status=active | drive_folder_or_gdoc
- `1BlUWuZh0eWe6BLpBYjJLpY1VJXyiISHr` — Sheet Music | application/vnd.google-apps.folder | src=google_drive | status=active | drive_folder_or_gdoc
- `1DeiuwNlb8i8nwz3vUwaXdiNIICSdPgTt` — 2. Rosh  | application/vnd.google-apps.folder | src=google_drive | status=active | drive_folder_or_gdoc
- `1FsZhGl3bxWja_KLVAliZb2hHg88JBcw3` — Choral Arrangements  | application/vnd.google-apps.folder | src=google_drive | status=active | drive_folder_or_gdoc
- `1J4XKbecFdEJiEt-yuXWLmAXGqTi8L_Mk` — Piyutim-Pizmonim | application/vnd.google-apps.folder | src=google_drive | status=active | drive_folder_or_gdoc
- `1NTR6j9rhwHAwoZjX34AVdyymz9IvPkTz` — Pre-Ceremony Music | application/vnd.google-apps.folder | src=google_drive | status=active | drive_folder_or_gdoc
- `1PL-rwuqZOnftWzBFYa4ElTWinUpLSiyo` — Shir Shabbat (Choir) | application/vnd.google-apps.folder | src=google_drive | status=active | drive_folder_or_gdoc
- `1SYdDp-DbhO7e362YRZr3GQQ1pGwrdUlc` — 4. Yom Kippur  | application/vnd.google-apps.folder | src=google_drive | status=active | drive_folder_or_gdoc
- `1URRI7OBQnlsji5zn3oMkx6IplU3qhw99` — Shabbat morning | application/vnd.google-apps.folder | src=google_drive | status=active | drive_folder_or_gdoc
- `1X9l2ZE7dGrJdej9Fr3PFieVt9EE3dEYT` — MP3's to Jam To | application/vnd.google-apps.folder | src=google_drive | status=active | drive_folder_or_gdoc
- `1ch79JH6B3rWcMnSLd9HtO4myytRHoicd` — Shabbat | application/vnd.google-apps.folder | src=google_drive | status=active | drive_folder_or_gdoc
- `1fCgl4H4wIiqLK42rUkHmRYV5WzqLEOIU` — Kabbalat Shabbat | application/vnd.google-apps.folder | src=google_drive | status=active | drive_folder_or_gdoc
- `1khYYPDmj7pOn_G8yl8mTJHcYFsLH5O65` — 3. Kol Nidre | application/vnd.google-apps.folder | src=google_drive | status=active | drive_folder_or_gdoc
- `1oqBCSHTMzCVUPvMtQNXEdg5V49mwvOYh` — High Holidays 2025 (Choir) | application/vnd.google-apps.folder | src=google_drive | status=active | drive_folder_or_gdoc
- `1p-iGMt8OCpCJtk0eOn0mJL3aoNPcGUaK` — CRC Music Book | application/vnd.google-apps.folder | src=google_drive | status=active | drive_folder_or_gdoc
- `1pwmleWt7QMPuEqTrM_Az9JFj5RUMS9F4` — Shir Shabbat Lead Sheets | application/vnd.google-apps.folder | src=google_drive | status=active | drive_folder_or_gdoc
- `1tcdg8vTGcwuGX7gar1xJ0JDBdcyEi9yz` — 1. Erev Rosh | application/vnd.google-apps.folder | src=google_drive | status=active | drive_folder_or_gdoc
- `1zeTBJoffgVoqJYvjvZ6p3Tmm1JGXeOvR` — Niggunim | application/vnd.google-apps.folder | src=google_drive | status=active | drive_folder_or_gdoc

### Spreadsheets (xlsx + Google Sheet) (3)

- `1JhWf3p0Y1wmJaVNL40XFyNqSuFCwLxIw` — Shabbat morning.xlsx | application/vnd.openxmlformats-officedocument.spreadsheetml.sheet | src=google_drive | status=active | office_doc
- `1Sh8IiLb3n9iit1ImvlvS2SYvprbwLRRf` — Kabbalat Shabbat.xlsx | application/vnd.openxmlformats-officedocument.spreadsheetml.sheet | src=google_drive | status=active | office_doc
- `1XVmOLlmKI2ztKTsVOg2-YbkJ9_DzJA7A23gJp-s_Xu4` — Shir Shabbat Set List | application/vnd.google-apps.spreadsheet | src=google_drive | status=active | drive_folder_or_gdoc

### Google Docs (service-flow planning docs) (8)

- `14vROgFHB9FPTgTE0su4ALy8Pno0L5o9UkX4DkzMK5zk` — Yom Kippur Day Service (Daniel and Karen) Band Charts to be Printed | application/vnd.google-apps.document | src=google_drive | status=active | drive_folder_or_gdoc
- `1G4mI5dUgORJlwew8HnndtuORNLq89SgYXpQLYPJV12E` — Kol Nidre 2025/5786 | application/vnd.google-apps.document | src=google_drive | status=active | drive_folder_or_gdoc
- `1G90XvxjphRA3ZenORmcO1P3FDUQJQNjugwN4D5aDb4s` — Rosh Day 2025/5786 | application/vnd.google-apps.document | src=google_drive | status=active | drive_folder_or_gdoc
- `1HDRDxBLX7Rj41qF1LDcDAdi2cmPYOAQ96xj8IXB9GvA` — Erev Rosh 5786/2025 | application/vnd.google-apps.document | src=google_drive | status=active | drive_folder_or_gdoc
- `1QvrCC8R1yvCbK5jIB-yqw-vMQX1S62It637BHwSMaX4` — Shir Shabbat List | application/vnd.google-apps.document | src=google_drive | status=active | drive_folder_or_gdoc
- `1ZQUvXg4McVGhlkQ9rnJM4_2pdHup9mFBDXqoHqZtAds` — Yizkor and Neila | application/vnd.google-apps.document | src=google_drive | status=active | drive_folder_or_gdoc
- `1cZ0dW7ioUqQkV8m2ENr0ExEpMuYiP7ov6vy790kjbe4` — 5786 / 2025 Kol Nidre Alternative Service Music Flow | application/vnd.google-apps.document | src=google_drive | status=active | drive_folder_or_gdoc
- `1xTYqs7MHxm8Q69jt9nNMqNwmU3QTM7uxEkofZpxIzcE` — Yom Kippur 2025/5786 | application/vnd.google-apps.document | src=google_drive | status=active | drive_folder_or_gdoc

### Audio files (mp3/wav/m4a) (65)

- `10i20SEfzKTvGJ5tqWfPScip78eXszCHH` — Michamocha (Shir Shabbat).mp3 | audio/mpeg | src=google_drive | status=active | audio
- `10z53rDn8ZRw_m5esW54nbxBEjPTNIjp5` — Ve_Imru Amen-Bass.mp3 | audio/mpeg | src=google_drive | status=active | audio
- `11bYBh-IiVb4eUxFythxUBdhfmbfZCiHY` — Barechu_trad_Bass.mp3 | audio/mpeg | src=google_drive | status=active | audio
- `12JfLCHytM5q59btBQ05sz-V_SurQmUoT` — Adon Olam.mp3 | audio/mpeg | src=google_drive | status=active | audio
- `139wiZLQyzIVrwfjapGdfhzHHeZR7eiNk` — Niggun_Tenor_Bass.mp3 | audio/mpeg | src=google_drive | status=active | audio
- `17YFbGz0YNvC1o-K1VKRrqgZGae-WMsbg` — Michamocha (Shir Shabbat) .mp3 | audio/mpeg | src=google_drive | status=active | audio
- `19aJQKD1H868a8tDZFphNLPh_rH4tFwLN` — Shiru Medley .wav | audio/wav | src=google_drive | status=active | audio
- `19bFqLwp-TX_T3xlnV78DoMj3U80FsehP` — Erev Shel Shoshanim : Yamin U’smol.wav | audio/wav | src=google_drive | status=active | audio
- `19pHyy-g7WN48xqh6IEtRSWpqBQCkWftP` — Avinu Malkeinu_traditional_Em_Soprano.mp3 | audio/mpeg | src=google_drive | status=active | audio
- `1Cw69wE2-8eUViZ6ID66nULfNVDVU_est` — Ve_Imru Amen-Tenor.mp3 | audio/mpeg | src=google_drive | status=active | audio
- `1D08wPsT5Fk5nm-uXW9tHf50BvccX5gu3` — Ve_Imru Amen Full Choir.mp3 | audio/mpeg | src=google_drive | status=active | audio
- `1DF0UOysVOpGEGkSswU3FwEvjU_lcRm5_` — Unetaneh_Tokef_Full Choir.mp3 | audio/mpeg | src=google_drive | status=active | audio
- `1D_ERo9369UkNlZGO3FLYhYPatkY2m4Jm` — Kedusha in Am Full Choir with solo.mp3 | audio/mpeg | src=google_drive | status=active | audio
- `1DclXj1fcg3VTtf82HECzbk51-3GeowPH` — Barechu_trad_Soprano.mp3 | audio/mpeg | src=google_drive | status=active | audio
- `1DiSbHUzzXGAAl3je1g40Q-pEM2rR3laa` — Kedusha in Am (Tenor_Bass).mp3 | audio/mpeg | src=google_drive | status=active | audio
- `1DncwbDd_B0LnGRNRmBQCG6D4_7MoV1nI` — Aleinu Shur melody (low voice).mp3 | audio/mpeg | src=google_drive | status=active | audio
- `1Et48zTFQny12HjkFv25Wz7L7-wAqvZmg` — Mi Chamocha Shur Cantor Choir Descant.mp3 | audio/mpeg | src=google_drive | status=active | audio
- `1Exi_bsvw4nK0AUkW12bGwJ2WzZ-B5cS0` — Avinu Malkeinu Janowski D minor (Tenor).mp3 | audio/mpeg | src=google_drive | status=active | audio
- `1FGzPfLlSH3fzQtHAht3SfRoWLUFWICl1` — Avinu Malkeinu Janowski D minor (Bass).mp3 | audio/mpeg | src=google_drive | status=active | audio
- `1FNvv9UToD9t1k4FqXhWPzb50naHZfo-T` — Niggun_Soprano.mp3 | audio/mpeg | src=google_drive | status=active | audio
- `1FZw5QmsYPhe2hNLnAz8CWD1yN0lruOXP` — Kedusha in Am (Soprano).mp3 | audio/mpeg | src=google_drive | status=active | audio
- `1G4kvrAslYsUezK2fy696w8XUt3T-zEjR` — Unetaneh_Tokef_Soprano.mp3 | audio/mpeg | src=google_drive | status=active | audio
- `1HVCUZLeCu2_W3G3hMDwYxXd7o519rlcO` — Avinu Malkeinu_traditional_Em_Full Choir.mp3 | audio/mpeg | src=google_drive | status=active | audio
- `1Ho4zPDwCihy2HOt7f7MuVRMMLbFMLWYR` — Oseh Shalom (Dub Remix).mp3 | audio/mpeg | src=google_drive | status=active | audio
- `1ITxhruZY56v3j96hnqsk7YJ32-0coLcZ` — May The Memory Bass.mp3 | audio/mpeg | src=google_drive | status=active | audio
- `1J_YSGz4C9Fmx2CDQpUJ9iC5O19uA0j8o` — Unetaneh_Tokef_Bass.mp3 | audio/mpeg | src=google_drive | status=active | audio
- `1LIQvf7FQmRRKpfI1lP06PH70ef6Rn5I3` — May The Memory Tenor.mp3 | audio/mpeg | src=google_drive | status=active | audio
- `1LYIRI8GH4fA9Typust_4D98LjOWo5eSn` — The Great Aleinu (Alto).mp3 | audio/mpeg | src=google_drive | status=active | audio
- `1MQBRtiDK77MOTTKR25mEZEqmclSRat1q` — Niggun_Full Choir.mp3 | audio/mpeg | src=google_drive | status=active | audio
- `1O1pvTb9_U_1Dh9TCookPxS7AlwfMA_Nh` — Fish Jam .mp3 | audio/mpeg | src=google_drive | status=active | audio
- `1Q6yGoFDerBBWV7OYovZweFEIbzgRv--w` — Avinu Malkeinu Janowski D minor (Alto).mp3 | audio/mpeg | src=google_drive | status=active | audio
- `1RV-_S-0vCgswP7VfskC6wIchaBDQFNDa` — Michael's B'Mitzvah Jams.mp3 | audio/mpeg | src=google_drive | status=active | audio
- `1TRCzECDBOal5mr1SFh7JEY-r-NkhtaaW` — Avinu Malkeinu_traditional_Em_Bass.mp3 | audio/mpeg | src=google_drive | status=active | audio
- `1VXSQUMCADACnGEitvANMLuBF3BsJa_b9` — Veshamru .mp3 | audio/mpeg | src=google_drive | status=active | audio
- `1VuMq83_0W8ya9SCeBaQ0vCvuFeHgGHeC` — Mizmor Shiru L'adonai .mp3 | audio/mpeg | src=google_drive | status=active | audio
- `1X6St0GAreLGpJIcPMdA4HJlohuFhPp5W` — 3 Songs Office Hours.mp3 | audio/mpeg | src=google_drive | status=active | audio
- `1Y6ELHFu--GfuIz3FgiHitfWyjG4OZvQ0` — The Great Aleinu Full Choir.mp3 | audio/mpeg | src=google_drive | status=active | audio
- `1Z37pBaRXW45LQ551WSfMFzDHQ8jFYt0x` — The Great Aleinu (Bass).mp3 | audio/mpeg | src=google_drive | status=active | audio
- `1ZuXxV8dAhfFRXaXaSk1zAbbp9yce8MwH` — CRC On Hold Klezmer.wav | audio/wav | src=google_drive | status=active | audio
- `1_AGMn2Ls4Eo15tDwC4vtrGeHvu4aoe8f` — Niggun_Alto.mp3 | audio/mpeg | src=google_drive | status=active | audio
- `1_Gd8degQp-_CwXhYQM_jtxqRCtjdKvTi` — Avinu Malkeinu Janowski D minor Full Choir.mp3 | audio/mpeg | src=google_drive | status=active | audio
- `1d-aXA4WzVjKYvCxAaVyezGgzRKlXs9y_` — Mizmor Shiru Ladonai.mp3 | audio/mpeg | src=google_drive | status=active | audio
- `1dAtZlJQ_3xbvfPLTG0F31Tbntid7d01W` — Avinu Malkeinu_traditional_Em_Alto.mp3 | audio/mpeg | src=google_drive | status=active | audio
- `1dxdNC33CZDbruEYFwsyV44a4sWR0nx8x` — Barechu_trad_Tenor.mp3 | audio/mpeg | src=google_drive | status=active | audio
- `1etxl5D1liZFHOAGfsReSt0gNtWXUpD_f` — Avinu Malkeinu_traditional_Em_Tenor.mp3 | audio/mpeg | src=google_drive | status=active | audio
- `1g-Czee2Cm5I_k4qtDQ86M3t7-9c3pHnW` — Kedusha in Am (Alto).mp3 | audio/mpeg | src=google_drive | status=active | audio
- `1g1cnvJjQwoS9sudXMsEv-Psx7IiPjkAJ` — Unetaneh_Tokef_Alto.mp3 | audio/mpeg | src=google_drive | status=active | audio
- `1gey19JRRH6b-sPmeeR2_vbP6conu0ZK_` — Lecha Dodi > Erev Shel Shoshamim : yasmin U'smol.mp3 | audio/mpeg | src=google_drive | status=active | audio
- `1h03XAsuq2FWWn_ZHRHvtQz1ZHfgZSi23` — May The Memory Full Choir.mp3 | audio/mpeg | src=google_drive | status=active | audio
- `1hBW82D0waHKgB4DA53rCcd4WGV5u9LQw` — Ve_Imru Amen-Alto.mp3 | audio/mpeg | src=google_drive | status=active | audio
- `1iZJWnsukROkqmZ_uSnDFl1Z5dsRcgWDG` — May The Memory Soprano.mp3 | audio/mpeg | src=google_drive | status=active | audio
- `1mKr3bKOxholt8isagwFgD8lglX2YykIa` — Aleinu Shur melody (high voice).mp3 | audio/mpeg | src=google_drive | status=active | audio
- `1monkKpBnbwh6YO6FAKBIQmD4vGqzbyIZ` — The Great Aleinu (Tenor).mp3 | audio/mpeg | src=google_drive | status=active | audio
- `1nAEsEgzHIU3T9Ym9kJpBxJylWWqa_vnK` — Barechu_trad_Alto.mp3 | audio/mpeg | src=google_drive | status=active | audio
- `1odYJKS1JLzDVVVbuHRV4oIw-gAAVDqFT` — Ve_Imru Amen-Soprano.mp3 | audio/mpeg | src=google_drive | status=active | audio
- `1pFGvjKzoeCIj6CJuk6vFkYkUbV4I5zam` — May The Memory Alto.mp3 | audio/mpeg | src=google_drive | status=active | audio
- `1qAWeiH9_0eeXaseL0e-dMxDDwpBvO6xx` — Barechu_trad_Cantor + Choir.mp3 | audio/mpeg | src=google_drive | status=active | audio
- `1qTDacSD6J12oeEMg22KueDQgwMm8EeVJ` — Unetaneh_Tokef_Tenor.mp3 | audio/mpeg | src=google_drive | status=active | audio
- `1qlfMKLD6qrr98JUmoeBJHRE5I0-FsIRp` — Sim Shalom.mp3 | audio/mpeg | src=google_drive | status=active | audio
- `1tRHJFJSq99c1SuWZBOJCjbLyFHhIPYWO` — The Great Aleinu (Soprano).mp3 | audio/mpeg | src=google_drive | status=active | audio
- `1tYtW5qo5iOuytY9GflbwCQjWerjaov4b` — Avinu Malkeinu Janowski D minor (Soprano).mp3 | audio/mpeg | src=google_drive | status=active | audio
- `1vY2cfQMn1-QgtslbQZaCYc8JNZkX0g1s` — Elohai Neshama .mp3 | audio/mpeg | src=google_drive | status=active | audio
- `1wHijjyvHroSV_Z_wClVprppEpBYIUAsa` — kolnidre_intro.m4a | audio/x-m4a | src=google_drive | status=active | audio
- `1wzz1eOblUC0tOTnJZh_JAarpeRdZ0oPq` — Lecha dodi (Nava -led).wav | audio/wav | src=google_drive | status=active | audio
- `1yEIuuAPUvE0vAcM__QucJZgdJKpR0Nt2` — Bryn Tunes - Mi Shebarach, Sim Shalom.mp3 | audio/mpeg | src=google_drive | status=active | audio

## HOLD — explicitly NOT in the delete set

### 3 `.mxl` MusicXML rows (David/bryn uploads — real chart format, mis-typed as octet-stream)

These are MusicXML (`.mxl`) charts, not junk. They share the family of the 22 held `upload-*` orphans and likely need re-ingest, not deletion:

- `upload-8cf12700-fb49-4d3c-8b96-fcadab19999f` — Bar'chu Walkdown (`Bar'chu Walkdown.mxl`) | status=duplicate
- `upload-0594bbd4-d661-42b9-b11d-feeb3ff4cda6` — Bar'chu Walkdown (`Bar'chu Walkdown.mxl`) | status=orphaned
- `upload-32b4845e-8593-42cf-8264-caf2d0e348da` — Ana B'Koach mxl (` Ana B'Koach.mxl`) | status=orphaned

- The duplicate `.mxl` (`upload-8cf12700…`) is dedup-marked, but its canonical sibling (`upload-0594bbd4…` “Bar’chu Walkdown”) is itself **orphaned/byteless** — deleting the dup would lose the last metadata record. Held for Daniel.

### Other holds (per lane scope)
- **22 David/bryn `upload-*` orphans** — no local source; Daniel checking whether David holds originals (may be re-healed via the runner, not deleted).
- **271 healed supplemental rows** — `status:active` after the heal-RUN (auditor-045). Off-limits.

## Recommendation

1. **Approve HIGH-confidence classes now** (edge/test 4 + duplicate 8 + .DS_Store 1 + Drive folders 19 + spreadsheets 3 = **35**). Pure junk / dedup-marked / synthetic.
2. **Confirm MED classes** before delete: service-flow Google Docs (8) and audio (65). Both are non-charts and safe to remove from the chart index (the underlying Drive objects are untouched), but flagged for an explicit Daniel yes given they’re meaningful planning docs / a large audio set.
3. On confirm: run `delete_chart({fileId})` per id (pool-ROOT bearer), tolerate `chart_not_found` (already gone) and treat any `chart_in_use` as a STOP-and-report (would indicate an unexpected live bond). Verify each via `get_chart_status`/`list_library`; report final deleted/skipped counts.

_Full machine-readable plan: `lane-c-delete-plan.json` (per-id records + class index)._
