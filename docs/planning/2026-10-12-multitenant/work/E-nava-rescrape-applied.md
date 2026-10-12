# Nava Tehila rescrape: what was applied

12 October 2026. Collection `nava` in CRC's centralreform.live library. The URL scraper was not used. No chart was deleted, replaced or renamed.

## Songs touched

| Title | Action | Old chart id → new | Setlists referencing it | Status |
|---|---|---|---|---|
| Pitchu Li Sha'arei Tsedek | New chart added (English chord PDF only, key Bm, tag `nava-tehila`) | none → `upload-129b7877-9516-4590-832d-07a1df52af34` | none (new) | Storage health ok. It is the only Pitchu Li row in `nava`, so no duplicate was created. AI enrichment is still pending and may suggest a different title. |

How it was loaded: `import_chart_from_drive` with Drive file `1zylDrlddjX_Pfa0jpwb2mHf0CF-iCgW7`. The server pulled the real PDF bytes into `library/upload-<uuid>.pdf`, the same storage shape as the existing 140. A dry run went first (dedup score 0.48, no match). No composer was given because neither the PDF nor the folder names one: the PDF says only "Words: Psalms 118, 19 … www.NavaTehila.org © 2009". The Hebrew PDF was not loaded.

## Not done, and why

### The 4 chord-changed songs and the 1 to check: not replaced

| Library title | Chart id | Setlists referencing it |
|---|---|---|
| Lakh Amar Libi (Sykes) | `upload-1b3e867f-3c8b-4ba5-a0eb-d8ce5d29eae8` | 0 |
| Niggun Tishrei (Sykes) | `upload-5cda0806-dc39-41cf-a965-96f1401d5a57` | 0 |
| Arba'im Shana (Sykes) | `upload-acde70c0-f267-479b-af64-e64c2b085bc1` | 0 |
| Bati Legani (Weider) | `upload-965fc7c2-5d79-40bf-8cc8-938d48d84a13` | 0 |
| Ehyeh Asher Ehyeh (Daphna Rosenberg), the one to check | `upload-737e52a7-fa67-4560-8a3f-f3653b131e7b` | 0 |

Two separate blockers stopped these:

1. **The new PDFs could not be fetched.** The diff gives only folder links for these five songs, not file ids. They are older `0B…` folders, and those need a per-folder resource key that we don't have.
   - The Google Drive connector's `search_files parentId=` returned nothing for all five folders.
   - A title search found only the library's own backup copies.
   - The app's service account (`import_drive_folder` dry run) sees the folder as empty.
   - WebFetch on the folder URL redirects to a Google sign-in page. The `embeddedfolderview` URL is blocked by robots.txt.
   - Without file ids, the direct-download URL can't be tried either.

2. **No tool replaces an active chart's file in place.**
   - `swap_chart` does not swap a library file. It re-points one setlist row at a *different* library song.
   - `finalize_chart_upload` has a "heal" mode (`targetFileId`) that writes bytes onto an existing id. It is admin-only and documented for orphaned rows only. It also needs a PUT to a signed Storage URL. I did not use it on healthy rows.
   - The only other route is upload-new-then-delete-old. That creates duplicates and needs `delete_chart`, so it is outside the rulings.

   Since no setlist references any of these five charts, upload-new-and-delete-old would lose nothing. That decision is Daniel's.

### Songs skipped by ruling (only the sheet music changed)
- N'kad'ma Fanav
- Kol (Weider & Berman)
- L'cha Dodi (Nava Tehila)
- Ashrei
- Haleluyah (Shacharit)

### Other skips
- **Kol Haneshama (Daphna): not new, already in the library.** The library row `upload-5d72423a-75b3-4d68-9579-502cb99f17da` has file name "Kol Haneshama -Daphna" and display title "Hal'luyah (Psalm 150) (Rosenberg)", key Dm, BPM 172. The Drive v3 PDF is the same piece: Daphna Rosenberg, Psalm 150, ♩=172, last modified June 2025, which is before the 18 August load. The diff missed the match because the library shows the song under its AI-given title. Uploading it would have created a duplicate.
- **Anan Va'arafel (Dov):** the Drive folder is still empty to the connector.
- **Yedaber Aleihem (Yoel Sykes)** (`upload-f03dc4c0-0930-4358-abe6-cd983364c829`): both Drive copies of its chords are dated before the 18 August load, so nothing in it changed after the library took it. Left alone.

## To finish the 5 replacements
- **File ids or links:** the chord-PDF file links (`/file/d/<id>`) for the five songs, or the resource keys for their folders.
- **Replacement route:** one of these:
  - heal-mode overwrite on active rows, if the app allows it, or
  - upload as new and delete the old row. This is safe here because nothing references the old rows.

## Second pass

Done 12 October 2026. I replaced the four songs whose chord charts changed. For each one I uploaded the new English chord-chart PDF as a new chart in `nava`, with the same display title, key and tag `nava-tehila`. Then I deleted the old chart. I did not load any Hebrew charts or sheet music, and I did not use the URL scraper.

| Title | Old id → new id | Drive chord file (modified) | Status |
|---|---|---|---|
| Lakh Amar Libi (Sykes), key C | `upload-1b3e867f-3c8b-4ba5-a0eb-d8ce5d29eae8` → `upload-1870c12e-f052-4a79-a677-0a1a7f84c3cc` | `0B7R-UFJoI7KRTUVwNmVuSzh0NTg` "08 Lach Amar Libi chords.pdf" (26 Aug 2026) | Done |
| Niggun Tishrei (Sykes), key Am | `upload-5cda0806-dc39-41cf-a965-96f1401d5a57` → `upload-4675dc8a-f9e2-4f48-ab6a-9340865823ee` | `0B7R-UFJoI7KRWE13N3dOVDRCcjA` "Chords - Niggun Tishrei.pdf" (16 Sep) | Done |
| Arba'im Shana (Sykes), key Dm | `upload-acde70c0-f267-479b-af64-e64c2b085bc1` → `upload-3fbb3fae-5400-4312-a932-0dee73d977d0` | `0B7R-UFJoI7KRV2pEYjJwYjIxRkk` "Ps. Arba'im Shana chords.pdf" (22 Aug) | Done |
| Bati Legani (Weider), key C | `upload-965fc7c2-5d79-40bf-8cc8-938d48d84a13` → `upload-a6a4cc7c-a496-4419-a793-204c56667002` | `1TjM057RAT72X_w7o9MwPZ4K66azLNIRO` "Bati Legani.pdf" (8 Oct) | Done |
| Yedaber Aleihem (Sykes) | `upload-f03dc4c0-0930-4358-abe6-cd983364c829`, unchanged | `0B7R-UFJoI7KRWng3TThYRmFibEE` "09 Shamru Edotav chords.pdf" (10 Apr 2026) | Skipped. The chords are dated before the 18 Aug load, which confirms the first pass. |

Each of the four went through the same checks:
- `get_chart_status` returned ok from firebase-storage.
- `find_setlists_referencing_chart` found 0 setlists for the old id, checked again just before the delete.
- `delete_chart` returned ok, with 0 tracks deleted.
- `search_library` (including orphaned and unbindable rows) now shows exactly one row under each title in `nava`.

The new rows' AI enrichment is still pending.

How the files were fetched:
1. I opened the public root folder in the browser with its resource key and clicked down to each song folder. This revealed each folder's key and each file's key.
2. I downloaded each PDF from `drive.usercontent.google.com/download?id=…&resourcekey=…`. `import_chart_from_drive` cannot take a resource key and returned 404.
3. I uploaded each file with `request_chart_upload_url`, a PUT, and then `finalize_chart_upload`. The finalize step needed `force: true` because the old row with the same title was still present.

The diff's links pointed to the folders that actually changed:
- Lakh Amar Libi: the album copy under CDs › Waking Heart. The High Holidays copy is from 2014.
- Arba'im Shana: the copy under Kabbalat Shabbat › Psalm 95. The Dancing in the Glory album copy is from April 2025.

Not done: nothing among the five was left undone. One thing to note: the first-pass table listed **Ehyeh Asher Ehyeh** (`upload-737e52a7-…`) as "the one to check", not Yedaber Aleihem. This pass did not look at it.
