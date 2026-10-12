# Nava Tehila: who they are now, and the rescrape diff

12 October 2026. Read-only. Nothing was written to the centralreform.live library, and save_scraped_chart was not called.

## 1. Who they are now

**Official site:** navatehila.org. It is **Hebrew-only**: the menu, the bios and the event listings are all in Hebrew, with no English switch. The English-facing catalogue lives on **Sefaria Voices** under the profile "nava-tehila-jerusalem", and those pages are bilingual: Hebrew text, transliteration, English translation and an embedded video.

**Leadership, per the site's Team page (צוות):**
- **Rabbi Ruth Gan Kagan**: rabbi and CEO (רב ומנהלת), and founder.
- **Rabbi Nava B. Meirsdorf** (also spelled Meiersdorf): coordinator of Jewish Peoplehood and overseas trips, described as a spiritual leader. She is the "Rabbi Nava" Daniel heard about, and she is real. She was ordained at Schechter (Conservative), was campus rabbi at the Fuchsberg Center in Jerusalem, and founded TefiLab. Adath Israel Congregation in Toronto separately lists her and her husband, Rabbi Yerach Meiersdorf, as associate rabbis and calls her "part of the leadership circle of Nava Tehila." She does not compose, and none of the charts are hers.
- **Dov Wieder**: musical prayer leader. He leads the Levites circle (the volunteer band) and the touring group.
- **Lorens Berman**: office manager.

**The composers behind the charts**, from the site's Composers section and the Sefaria credits page:
- **Daphna Rosenberg**: co-creator of the music library with Rabbi Ruth.
- **Yoel Sykes**.
- **Ruth Gan Kagan**.
- **Dov Wieder**.
- Others credited: Navot Ben Barak, Netanel Goldberg, Naveh Agmon, Ayelet Kagan, Ilan Glazer, Meir Berman, Yaeli Tai, Olivier Darras, Rinat Levinson and a few more.

Daphna and Yoel are no longer on the Team page, but both still lead events (Daphna and Yoel in April 2026, for example).

**Hebrew-first?** Their home audience davens in Hebrew and their own site is Hebrew-only. Their chart folder, however, is bilingual. Most songs have an English transliterated chord chart plus a Hebrew-script chart, often with Hebrew filenames such as "שמעה ותשמח" in Am and Bm. Sefaria is their English shop window. They would probably expect Hebrew to be fully supported, both in the interface and in the charts, but not English-free.

## 2. Where the charts live, and in what format

- **Source of truth:** one public **Google Drive folder**, linked from their Music page as "chords and notation only." Folder ID `0B_-qyPYoddowMGJSMGlXMkVBbnc`, resource key `0-i5VWbf--CSBQk_dEpaik0g`.
  - Top-level folders: Kabbalat Shabbat, Shacharit, High Holidays, Chants, Song of Songs, Hallel (new) and CDs. The CDs folder holds album copies of the same songs.
- **Format:** **PDFs only**, one subfolder per song. Today the folder holds 554 PDFs in 186 song folders, 148 of them outside the CDs mirror.
  - A song folder usually contains three files: an English/transliterated **chords** PDF, a **notes** PDF (sheet music in standard notation), and a **Hebrew** chord sheet, sometimes in two keys.
  - There are no HTML chord pages anywhere.
- **Sefaria Voices:** one sheet per song (text, translation, YouTube embed) that links out to the Drive PDFs for chords and notation. The catalogue entry point is sheet 654834, which leads to themed sheets: Greatest Hits, Kabbalat Shabbat, Shacharit, High Holidays, Niggunim, Song of Songs, Sacred Song Circles, Peace Chants and Shechina Chants. These sheets add no charts beyond what is in Drive.
- **Licensing:**
  - No license is stated anywhere: no Creative Commons and no permission terms.
  - The site footer reads "© 2026 all rights reserved, Nava Tehila." Sefaria sheets carry "(c) Nava Tehila" plus a contact email. Individual PDFs carry "www.NavaTehila.org ©" with a year (2009 on Pitchu Li).
  - They describe the material as shared "free" (חינם) for prayer use.
  - Hosting the charts for Nava Tehila themselves as a tenant is fine. Re-hosting them for other congregations would need their explicit permission.

## 3. What the library holds now

- The `nava` collection ("Nava Tehilah") has **140 active charts**, all PDFs, all uploaded **2026-08-18**. Most have a key, a few have a BPM, and all are tagged `nava-tehila`.
- **No source URL is stored on any row.** list_library returns no source or Drive-link field. The diff below is therefore matched by **title and composer**, and the "changed" check compares Drive modified dates against the 18 August upload date.
-

## 4. The diff

Method: I crawled every folder in the Drive tree and matched each song folder to a library title by hand. Drive shows dates without a year for anything modified in 2026, so "Aug 30" means 30 August 2026.

**Counts: 3 new, 10 changed (plus 1 to check), 0 gone.** Every one of the 140 library charts still has a matching song on the site. Several matches needed a translation from the library's title to the site's folder name:
- "El Hakavod Hir'im (Sykes)" = Kol Adonai Al Hamayim.
- "Yedaber Aleihem (Sykes)" = B'amud Anan, Yoel's version (Shamru Edotav).
- "Neharot Yimkha'u Khaf (Sykes)" = Yir'am Hayam.

| Title | URL | Status |
|---|---|---|
| Pitchu Li Sha'arei Tsedek (Hallel; Bm; © 2009) | drive.google.com/file/d/1zylDrlddjX_Pfa0jpwb2mHf0CF-iCgW7 (Hebrew version: …/1nr4N0pMmMTEDmGtHvFXRvYEWwOMYfzs8) | **New**: whole Hallel folder added 30 Aug |
| Kol Haneshama (Daphna) | drive.google.com/file/d/1n7c4S82Pk3DLHiC9GPixEdp87oTNlYo7 (v3); Hebrew: …/1fNl5Rz1NwvLzTx1QExIF_vTAfZ67MSGW | **New**: library has only Sykes's Kol Haneshama |
| Anan Va'arafel (Dov) | drive.google.com/drive/folders/1OFXhL0jflvM4XZMwyP1yPEgLEsPZSap5 | **New, but empty**: folder exists (2 Jun) with no public files yet |
| Lakh Amar Libi | drive.google.com/drive/folders/0B7R-UFJoI7KRNlJJNThJV01pTmc | **Changed**: chords and notes re-saved 25 Aug |
| Niggun Tishrei | drive.google.com/drive/folders/0B7R-UFJoI7KRamd3WWJFQWZieUE | **Changed**: chords 16 Sep |
| Arba'im Shana | drive.google.com/drive/folders/0B7R-UFJoI7KRaThOeldqSWRRejg | **Changed**: chords 22 Aug |
| Bati Legani | drive.google.com/drive/folders/1aeHU1vPtB4hnpFvKQ4gIOgUmEGluvkEd | **Changed**: chart 8 Oct |
| N'kad'ma Fanav | drive.google.com/drive/folders/1pfpxlEcDQWTrdCjp-yZ3HUMsZmdXbgyR | Changed, notation only: notes 31 Aug |
| Kol (Weider & Berman) | drive.google.com/drive/folders/11O1knc_pzY0l-kyWz5FIxrQuZYjLOI9o | Changed, notation only: notes 26 Aug |
| L'cha Dodi, joyful/Sameach ("L'cha Dodi (Nava Tehila)") | drive.google.com/drive/folders/0B_-qyPYoddowR1BDY1RJenRxYnM | Changed, notation only: notes 15 Sep |
| Ashrei | drive.google.com/drive/folders/1o4ZD3Rv_wzm1XZQmF3zmFDmAgwtPMR8n | Changed, notation only: notes 31 Aug |
| Haleluyah (Shacharit) | drive.google.com/drive/folders/0B7R-UFJoI7KRV25mWTRJMW9oSkE | Changed, notation only: notes 13 Sep |
| Shamru Edotav / B'amud Anan, Yoel ("Yedaber Aleihem") | drive.google.com/drive/folders/0B7R-UFJoI7KRb2pDcFNiU0dkV0U | Changed: the album copy of the chords is dated 10 Apr 2026; the Kabbalat Shabbat copy is from 2025. Check which one the library used |
| Ehyeh Asher Ehyeh | drive.google.com/drive/folders/0B7R-UFJoI7KRWWs3WVdCcTVMWWM | **Check**: folder touched 10 Oct but no file is newer than 16 Aug, so a file may have been removed |
| All other 128 library charts | — | Unchanged: no file in their song folder is dated after 18 Aug |

**Matches worth a human glance.** These pairings are plausible but not certain:
- The two Navot L'cha Dodi charts ("L'cha Dodi (Navot Ben Barak)" in D and "Lecha Dodi (Ben Barak)" in Em) against the site's "Lecha Dodi – Navot" and "Lecha Dodi Country".
- "Hashivenu (Goldberg)" against the High Holidays folder, which holds only a Hebrew sheet.
- The two Haleluyah charts (Rosenberg Psalm 150, and Sykes) against the Shacharit folder and the Waking Heart album folder.

## 5. Scraper test (one new chart)

**URL tested:** the Drive viewer link for Pitchu Li Sha'arei Tsedek.

**Result: the scraper returned a made-up chart.**
- It said `ok:true`, title "Pitchu Li Sha'arei Tsedek", artist **"Shlomo Carlebach"**.
- It gave a tidy Am–Dm–G–C–F–Dm–E–Am progression with an invented "Zeh hayom… nagila" verse.

**The real PDF**, which I downloaded and read directly:
- It is Nava Tehila's, © 2009, words from Psalm 118:19, in **Bm**.
- Chords run Bbdim Bm F# G7+ Gm Bdim F#7 / Bm Em C7+ G7+ Bdim Ddim F#7, with slash-rhythm marks and a single line of text repeated ×2.
- Key, chords, artist and the verse are all wrong in the scraper's version.

The cause is that the scraper cannot read the PDF behind a Drive viewer page, so it quietly falls back to guessing.

**Control test:** when I pasted the PDF's actual text in through `rawText`, the scraper reproduced the chart faithfully, with artist "Nava Tehila", chords aligned and nothing invented.

**Practical upshot:** the scraper does not handle their site. These sources are clean, PDF-native charts, so the right intake is to bring the PDF in as a file through the existing upload or import-from-Drive path, the way the 140 already in the library were loaded, rather than scraping a URL.

## 6. Decisions for Daniel before anything is saved

1. **Rights.** Everything is "all rights reserved," with no license. Should the charts be hosted inside Nava Tehila's own tenant only (their material, their space), or also stay in CRC's `nava` collection? Is written OK from Rabbi Ruth needed?
2. **Which file per song.** Most songs have an English chords PDF, a notation PDF and a Hebrew chart, sometimes in two keys. Which ones count as "the chart" for a Nava Tehila tenant? For a Hebrew-first band the Hebrew sheet may be the primary one.
3. **Updates to "changed" songs.** Replace the existing rows (which keeps setlist links) or add new versions? Do notation-only updates count?
4. **Intake route.** Agree to skip the URL scraper for Drive PDFs, given the Pitchu Li result.
