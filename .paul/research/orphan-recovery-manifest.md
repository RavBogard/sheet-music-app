# Orphan Recovery Manifest (B0)

**Generated:** 2026-05-20T16:26:58.628Z · **Project:** crcmusiccharts · **Lane:** storage-recovery-b (Tier 2)

**Provenance:** read-only enumeration of `library_index` via the Firestore REST API using the locally-authenticated Firebase CLI session (daniel@centralreform.org). MCP-equivalent reproduction:
```
firestore_query_collection(library_index, status==orphaned)   -> 297 rows
firestore_query_collection(library_index, status==duplicate)  -> 9 rows
non_chart = isNonChartArtifactShape(mimeType,name) over all    -> 99 rows
   (predicate: src/lib/mcp/tools/library.ts:29 — audio/* , application/vnd.google-apps.* ,
    office xlsx/docx, application/octet-stream, *folder*, leading-dot names, ext backstop
    [mp3 m4a wav aac flac ogg xlsx xls docx doc])
```

## Counts (ground truth 2026-05-20)

| Population | Count |
|---|---:|
| library_index total | 569 |
| **orphaned** (recovery target) | **297** |
| duplicate | 9 |
| non_chart (catalog cruft) | 99 |
| healthy / other | 263 |

> Drift vs `[[project_orphan_baseline]]` (295 orphaned + 9 duplicate, recorded 2026-05-20 earlier): orphaned is now **297** (+2), duplicate **9**. Counts shift as reconcile/dedupe passes run; this manifest is the authoritative snapshot at generation time.

### Orphaned batches

| Batch (orphanedAt-day · source) | Count | Interpretation |
|---|---:|---|
| 2026-05-17 · source=local_upload | 271 | March-2026 supplemental songbook batch (Shireinu et al.), uploaded "straight from claude code" per Daniel. B-006 pre-atomic-guard — bytes never written. |
| 2026-05-19 · source=upload | 21 | bryn/David pre-atomic-guard `upload-{uuid}` rows; storageUrl set but Storage write silently failed. |
| 2026-05-19 · source=null | 3 | edge cases (null/unknown source) — inspect individually. |
| unknown · source=null | 1 | edge cases (null/unknown source) — inspect individually. |
| unknown · source=upload | 1 | edge cases (null/unknown source) — inspect individually. |

**By source:** {"local_upload":271,"null":4,"upload":22}

**By collection:** {"supplemental":271,"(none)":24,"uploads":2}

**Overlaps:** orphaned∩non_chart=2, duplicate∩non_chart=1, duplicate-rows-carrying-orphanedReason=1.

---

## A. Orphaned rows — recovery checklist (297)

This is the list Daniel matches local original files against. `title`/`fileName` are the match keys. Grouped by batch.

### Batch: 2026-05-17 · source=local_upload (271)

| # | title / fileName | id | collection | orphanedReason |
|---:|---|---|---|---|
| 1 | Abanibi (Hirsch) - Achshav (Folk).pdf | `8311b9ad-cce4-4d96-aa4d-ec615a7f7401` | supplemental | B-006: pre-atomic-guard sync left no Storage bytes |
| 2 | Adon Olam (Folk).pdf | `72a7aa6a-7b08-4c78-862c-197bbffb9515` | supplemental | B-006: pre-atomic-guard sync left no Storage bytes |
| 3 | Adon Olam (Hitman-Ben-Hur) - Adon Olam (Dobin) - Shehecheyanu (Pik).pdf | `c9efe661-9eb8-42fc-89d5-13f026629dc7` | supplemental | B-006: pre-atomic-guard sync left no Storage bytes |
| 4 | Adonai Adonai (Sher).pdf | `edc49352-b032-4967-8ac4-c76ef3cf0beb` | supplemental | B-006: pre-atomic-guard sync left no Storage bytes |
| 5 | Adonai Oz (Klepper-Freelander) - Al Hanisim (Frimer) - Al Kol Eileh (Shemer).pdf | `0ca658e4-c2e0-43df-9888-a7f2d536710a` | supplemental | B-006: pre-atomic-guard sync left no Storage bytes |
| 6 | Adonai S'Fatai (Traditional) - Avot V'Imahot (Katchko-Nusach).pdf | `fb29fdcb-6db1-44a8-8df1-e76aaeae5475` | supplemental | B-006: pre-atomic-guard sync left no Storage bytes |
| 7 | Ahavat Olam (Friedman).pdf | `663aa70e-d676-4fbe-b370-afef86119c44` | supplemental | B-006: pre-atomic-guard sync left no Storage bytes |
| 8 | Al Naharot Bavel (Billings) - Al Tifrosh (Schachet-Briskin).pdf | `0b478d9a-f544-4e77-8657-a3c70af76d86` | supplemental | B-006: pre-atomic-guard sync left no Storage bytes |
| 9 | Al Sh'Loshah D'Varim (Dropkin).pdf | `abd6a2ca-3fc6-46e1-9f51-62946db19ae1` | supplemental | B-006: pre-atomic-guard sync left no Storage bytes |
| 10 | Al Sh'Loshah D'Varim (Tzur).pdf | `36b65d8a-065f-4711-a8aa-304886451aab` | supplemental | B-006: pre-atomic-guard sync left no Storage bytes |
| 11 | Al Tira (Pik).pdf | `3bd7af7a-2a4b-42a2-80c5-9d1b4073db4a` | supplemental | B-006: pre-atomic-guard sync left no Storage bytes |
| 12 | Al Tira (Taubman).pdf | `a34e23e9-0bed-4585-ae3e-89af4fc2e53c` | supplemental | B-006: pre-atomic-guard sync left no Storage bytes |
| 13 | Alef Bet Song (Friedman).pdf | `452cc138-503f-4f0a-8b27-7ebd8d5741d1` | supplemental | B-006: pre-atomic-guard sync left no Storage bytes |
| 14 | Aleinu (Sulzer) - Shehu Noteh Shamayim (Traditional) - Bayom Hahu (Traditional).pdf | `2aede3b4-205a-4bbb-a996-76c46cd83de2` | supplemental | B-006: pre-atomic-guard sync left no Storage bytes |
| 15 | Aleinu-The Adoration (Isaacson) - Aleinu (Chajes).pdf | `e16dbb6e-9b17-4518-978f-bc32de99fa39` | supplemental | B-006: pre-atomic-guard sync left no Storage bytes |
| 16 | All The World Sings To You (Rothchild).pdf | `dcacad1e-5f4b-4d03-b221-58692b1b8d1e` | supplemental | B-006: pre-atomic-guard sync left no Storage bytes |
| 17 | Am Yisraeil Chai (Carlebach) - Am Yisraeil Chai (Rockoff).pdf | `f462cfc0-6f29-4460-9422-071c07b6c717` | supplemental | B-006: pre-atomic-guard sync left no Storage bytes |
| 18 | Amar Rabi Y'Hudah (Nof).pdf | `6ec8bf57-a358-4ae2-a251-e8200d9351bb` | supplemental | B-006: pre-atomic-guard sync left no Storage bytes |
| 19 | Anachnu M'Vorachim (Recht) - Anatoly (Mishkin).pdf | `fcdeef79-f662-4ac6-aa94-bdf74511ac2c` | supplemental | B-006: pre-atomic-guard sync left no Storage bytes |
| 20 | And The Youth Shall See Visions (Friedman).pdf | `bf84ee28-7bb7-436e-9ab7-bdb5157a3e06` | supplemental | B-006: pre-atomic-guard sync left no Storage bytes |
| 21 | Ani Ma-Amin (Fastag).pdf | `4724db72-8e1e-4405-90ff-8be1955af822` | supplemental | B-006: pre-atomic-guard sync left no Storage bytes |
| 22 | Ani Ma-Amin (Friedman).pdf | `407d23e5-5cd6-4d02-9618-7acefb33df7a` | supplemental | B-006: pre-atomic-guard sync left no Storage bytes |
| 23 | Ani Oheiv Otach (Jungreis).pdf | `5366aef1-5349-44c3-9dc1-7462e69fe4db` | supplemental | B-006: pre-atomic-guard sync left no Storage bytes |
| 24 | Ani V'Atah (Gavrielov).pdf | `3371ff94-1774-4c2b-a25b-f1537a419e13` | supplemental | B-006: pre-atomic-guard sync left no Storage bytes |
| 25 | Artik (Israeli) - Artzah Alinu (Israeli).pdf | `be2df12e-6055-4ab7-9db0-c11515d15c48` | supplemental | B-006: pre-atomic-guard sync left no Storage bytes |
| 26 | Ashrei (Aly Halpert).pdf | `28c99c48-dbac-479f-9bae-80342fdb3253` | supplemental | B-006: pre-atomic-guard sync left no Storage bytes |
| 27 | Ashrei (Klepper-Freelander).pdf | `4a00f597-70ef-4267-a363-10b081eabc66` | supplemental | B-006: pre-atomic-guard sync left no Storage bytes |
| 28 | Ashrei (Smilow) - Hal'Luyah (Friedman).pdf | `b23501fe-05d4-42c7-9527-42f124dec097` | supplemental | B-006: pre-atomic-guard sync left no Storage bytes |
| 29 | Ashreinu (Dropkin).pdf | `c046a053-6a8a-45d2-8f88-64e35dc830c9` | supplemental | B-006: pre-atomic-guard sync left no Storage bytes |
| 30 | Ashreinu (Silver).pdf | `31e5ec53-8330-457f-aef3-33e10e35ec05` | supplemental | B-006: pre-atomic-guard sync left no Storage bytes |
| 31 | Ashreinu-Sh'Ma (Sharlin-Helfman).pdf | `26864af2-2a80-4f93-a8ec-e81f63f075e0` | supplemental | B-006: pre-atomic-guard sync left no Storage bytes |
| 32 | Az Der Rebe Est (Chassidic Folk) - Bashanah Haba-Ah (Hirsch).pdf | `7ac2da98-6353-4fd2-ae8a-ad28eb2f243c` | supplemental | B-006: pre-atomic-guard sync left no Storage bytes |
| 33 | B'Makom (Isaacson).pdf | `17989ffb-a13a-47b4-b17e-df8212b14f92` | supplemental | B-006: pre-atomic-guard sync left no Storage bytes |
| 34 | B'Ruchot Haba-Ot (Friedman).pdf | `e8f1b65c-1571-4303-bb2f-f3d180419583` | supplemental | B-006: pre-atomic-guard sync left no Storage bytes |
| 35 | B'Tzelem Elohim (Nichols-Moskowitz).pdf | `323ccd88-d31e-40f1-afbd-bd4601136e27` | supplemental | B-006: pre-atomic-guard sync left no Storage bytes |
| 36 | B'Yado (Taubman).pdf | `5b5a4ec7-36f0-451c-adfe-1b6186ddd2a1` | supplemental | B-006: pre-atomic-guard sync left no Storage bytes |
| 37 | Bar'Chu (Jacobson-Libava) - Bar'Chu (Siegel).pdf | `52b4fed1-de13-49f7-9dc6-732a6899f127` | supplemental | B-006: pre-atomic-guard sync left no Storage bytes |
| 38 | Bar'Chu (Nelson).pdf | `77f77a9e-31b1-46ae-85b8-a6864953fc83` | supplemental | B-006: pre-atomic-guard sync left no Storage bytes |
| 39 | Bayom Hahu (Gordon).pdf | `8e175a22-f23d-4fd2-9d45-8e5c1b797f6c` | supplemental | B-006: pre-atomic-guard sync left no Storage bytes |
| 40 | Bayom Hahu (Kanarek).pdf | `b6c40290-eb24-4461-8c58-947c9f3bf904` | supplemental | B-006: pre-atomic-guard sync left no Storage bytes |
| 41 | Bayom Hahu (Tzur).pdf | `b836abfb-7be3-44f3-b81c-0382e92be27e` | supplemental | B-006: pre-atomic-guard sync left no Storage bytes |
| 42 | Bedtime Sh'Ma (Frankel-Tzur).pdf | `8a2e0e9c-e453-49e2-a1a9-8e39dd126a4c` | supplemental | B-006: pre-atomic-guard sync left no Storage bytes |
| 43 | Bim Bam-Shabbat Shalom (Frankel).pdf | `31e88e83-c880-43e5-9b12-37a7a119aeb0` | supplemental | B-006: pre-atomic-guard sync left no Storage bytes |
| 44 | Birchot Havdalah (Friedman) - Hamavdil Bein Kodesh-Shavu-A Tov.pdf | `7bc7a556-04f4-42a3-a766-d300270d71cd` | supplemental | B-006: pre-atomic-guard sync left no Storage bytes |
| 45 | Birkat Halevana (Friedman) - Bless This House (Sher) - B'Makom (Adler).pdf | `77c2bf09-7a4b-4f38-9bf2-c7b3b120506e` | supplemental | B-006: pre-atomic-guard sync left no Storage bytes |
| 46 | Birkat Hamazon (The Blessing After Meals) (Traditional).pdf | `87bddcb0-5d4a-47f7-a7f2-20a99a17b5fc` | supplemental | B-006: pre-atomic-guard sync left no Storage bytes |
| 47 | Bo-I Kalah (Shur).pdf | `1d69155e-992a-4f35-a16b-1a3bd5745f68` | supplemental | B-006: pre-atomic-guard sync left no Storage bytes |
| 48 | Candle Blessing (For Shabbat) (Binder).pdf | `5e893824-0d8c-47e7-82fe-51240d027c00` | supplemental | B-006: pre-atomic-guard sync left no Storage bytes |
| 49 | Chazak Chazak (Silver) - Chelki Adonai (Elsberg).pdf | `708b8023-7689-4a58-ab8d-428e2bcafaa7` | supplemental | B-006: pre-atomic-guard sync left no Storage bytes |
| 50 | Chiri Biri Bam (Yiddish).pdf | `43a4fc6c-4d27-45bd-988f-492db59f73d1` | supplemental | B-006: pre-atomic-guard sync left no Storage bytes |
| 51 | Coming Home (Klepper).pdf | `adf52c8e-1bbf-450c-8972-b4ca8b8bea01` | supplemental | B-006: pre-atomic-guard sync left no Storage bytes |
| 52 | Creator Of All Things (Taubman).pdf | `3dc9f49f-b773-46aa-a5d5-ede22f7b8fc2` | supplemental | B-006: pre-atomic-guard sync left no Storage bytes |
| 53 | D'Ror Yikra (Yemenite).pdf | `f1015c5a-b953-4511-9378-141c155e3f91` | supplemental | B-006: pre-atomic-guard sync left no Storage bytes |
| 54 | David Melech Yisraeil (Frankel) - Dodi Li (Sher).pdf | `0281c548-8aea-48c9-8991-98cb381b3f3a` | supplemental | B-006: pre-atomic-guard sync left no Storage bytes |
| 55 | Dodi Li (Chen).pdf | `da949a70-a1d1-45ba-9406-161c634e0585` | supplemental | B-006: pre-atomic-guard sync left no Storage bytes |
| 56 | Dodi Li (Friedman).pdf | `ddc758b3-2e1f-46df-853a-153d2a920c68` | supplemental | B-006: pre-atomic-guard sync left no Storage bytes |
| 57 | Dona Dona (Secunda).pdf | `1ea4505a-a3eb-423f-8398-93b06664da5b` | supplemental | B-006: pre-atomic-guard sync left no Storage bytes |
| 58 | Down By The Riverside (Spiritual).pdf | `c5452a63-094f-40ce-a24c-bb7077ec0f92` | supplemental | B-006: pre-atomic-guard sync left no Storage bytes |
| 59 | Dreamer (Wyatt) - Dugit (Unknown).pdf | `ad2ceb97-f1d1-416a-acac-f28646bbe5e4` | supplemental | B-006: pre-atomic-guard sync left no Storage bytes |
| 60 | Eil Na R'Fa Na Lah (Friedman) - Eileh Chamdah Libi (Chassidic Folk).pdf | `a220002e-3f12-49af-9310-abf3ab0dbe71` | supplemental | B-006: pre-atomic-guard sync left no Storage bytes |
| 61 | Eileh Chamdah Libi (Abbie Strauss And Joe Buchanan).pdf | `2c594bea-32c0-4794-b625-060848ad576c` | supplemental | B-006: pre-atomic-guard sync left no Storage bytes |
| 62 | Eili Eili (Zahavi) - Eit Dodim (Oriental Folk) - Elijah Rock (Spiritual).pdf | `6ca6e82c-e3be-4e6b-b6c1-63f60b3ac5cc` | supplemental | B-006: pre-atomic-guard sync left no Storage bytes |
| 63 | Eiliyahu Hanavi (Traditional) - Eiliyahu (Friedman).pdf | `b20a213e-a12a-4275-bccf-ed48c7492fd7` | supplemental | B-006: pre-atomic-guard sync left no Storage bytes |
| 64 | Ein Keiloheinu (Carlebach).pdf | `d600ce2c-61d5-4a38-8508-e819e1a2b140` | supplemental | B-006: pre-atomic-guard sync left no Storage bytes |
| 65 | Ein Keiloheinu (Dropkin).pdf | `7d15b7ee-692e-42c9-99bb-8e543eb0014d` | supplemental | B-006: pre-atomic-guard sync left no Storage bytes |
| 66 | Ein Keiloheinu (Freudenthal).pdf | `0afb3e5a-9554-43e2-b6e4-bf3b4470ca68` | supplemental | B-006: pre-atomic-guard sync left no Storage bytes |
| 67 | Eitz Chayim (Friedman).pdf | `4069c33b-2011-4768-83c6-ccc2ece60f13` | supplemental | B-006: pre-atomic-guard sync left no Storage bytes |
| 68 | Eitz Chayim (Matthew Check And Naomi Less).pdf | `c7e91f89-c940-4b30-8162-c5780ccdbcb1` | supplemental | B-006: pre-atomic-guard sync left no Storage bytes |
| 69 | Elohai (Friedman) - Elohai (Gold) - Baruch She-Amar (Comess-Daniels).pdf | `7e9a37aa-4427-428f-8801-b2a5405bd3be` | supplemental | B-006: pre-atomic-guard sync left no Storage bytes |
| 70 | Elohai N'Tzor (Dan Nichols).pdf | `8b7d7ef0-66a1-4058-bcab-de63cb10105f` | supplemental | B-006: pre-atomic-guard sync left no Storage bytes |
| 71 | Emet (Folk) - Eretz Yisraeil Sheli (Ben-Dor).pdf | `ccfd3a8e-8e83-448b-948e-96b2cf14401a` | supplemental | B-006: pre-atomic-guard sync left no Storage bytes |
| 72 | Eretz Zavat Chalav (Gamliel).pdf | `da5ef9be-c840-42c8-aedc-4065cbe3e2d9` | supplemental | B-006: pre-atomic-guard sync left no Storage bytes |
| 73 | Erev Ba (Levanson) - Erev Shel Shoshanim (Hadar) - Esa Einai (Carlebach).pdf | `129d7632-3954-45e0-9085-cf52d204d6cd` | supplemental | B-006: pre-atomic-guard sync left no Storage bytes |
| 74 | Esa Einai (Dropkin).pdf | `b3661947-77a0-4de9-9800-00efe92f7ed0` | supplemental | B-006: pre-atomic-guard sync left no Storage bytes |
| 75 | Et Hamanginah (Rosenblum) - Fixin The World (Schachet-Briskin).pdf | `34a3c3fc-d5ce-4b80-8d4f-77014f5412da` | supplemental | B-006: pre-atomic-guard sync left no Storage bytes |
| 76 | G'Vurot (Traditional).pdf | `8b86ad63-38cc-4412-ad6d-7f194d3cd1e4` | supplemental | B-006: pre-atomic-guard sync left no Storage bytes |
| 77 | Gesher Tzar M'Od (Chait).pdf | `9c45f962-5894-44cd-852e-6b84e871067e` | supplemental | B-006: pre-atomic-guard sync left no Storage bytes |
| 78 | Go Down Moses (Spiritual).pdf | `f719b0dd-1662-4c70-9142-f1e99e580487` | supplemental | B-006: pre-atomic-guard sync left no Storage bytes |
| 79 | Hab'Rachah (Roman).pdf | `b5084753-96d6-4ec7-a94f-a2a37b17af98` | supplemental | B-006: pre-atomic-guard sync left no Storage bytes |
| 80 | Hafinjan (Wilensky).pdf | `28f1ea16-4dab-4198-8d0b-dc1c7ef66624` | supplemental | B-006: pre-atomic-guard sync left no Storage bytes |
| 81 | Haftarah Blessings (Cantillation).pdf | `58587ef0-0747-4abe-9c00-4b77a543d851` | supplemental | B-006: pre-atomic-guard sync left no Storage bytes |
| 82 | Hagalshan (Sanderson).pdf | `a9d07bdd-0591-406c-a4e7-03c3b7cc94b8` | supplemental | B-006: pre-atomic-guard sync left no Storage bytes |
| 83 | Hal'Luhu (Folk).pdf | `b097e578-24cf-42df-b669-05f1580a295e` | supplemental | B-006: pre-atomic-guard sync left no Storage bytes |
| 84 | Hal'Luyah (Nigunim Ensemble).pdf | `ed77e409-a4fc-4518-82e2-4b9a71a9cde5` | supplemental | B-006: pre-atomic-guard sync left no Storage bytes |
| 85 | Hal'Luyah (Oshrat).pdf | `077a95a9-da4a-4703-97c5-77c6bebeb5f6` | supplemental | B-006: pre-atomic-guard sync left no Storage bytes |
| 86 | Hal'Luyah Ivdu Avdei (Grossman).pdf | `20811bd6-bda9-43ee-ad7a-4ae3b704def2` | supplemental | B-006: pre-atomic-guard sync left no Storage bytes |
| 87 | Hal'Luyah-Psalm 150 (Friedman).pdf | `78ae5689-071f-4502-aa0f-e16e6fb7b480` | supplemental | B-006: pre-atomic-guard sync left no Storage bytes |
| 88 | Hamotzi (Adler).pdf | `7c15883f-41bd-4a32-875e-dbca4ec4188f` | supplemental | B-006: pre-atomic-guard sync left no Storage bytes |
| 89 | Haporeis Sukat Shalom (Klepper).pdf | `8fd11bd4-9d8c-4602-8fbd-7f4451e14c9d` | supplemental | B-006: pre-atomic-guard sync left no Storage bytes |
| 90 | Harachaman (For Shabbat) (Folk) - Ki Eshm'Ra Shabbat (Baghdad Melody).pdf | `bd71fe2e-65aa-46aa-8674-0fb38c5f12c9` | supplemental | B-006: pre-atomic-guard sync left no Storage bytes |
| 91 | Harachaman (Kirsch).pdf | `d5e81756-3b00-400e-9e5a-03a865e15fd6` | supplemental | B-006: pre-atomic-guard sync left no Storage bytes |
| 92 | Hari-U Ladonai (Sher).pdf | `f173a88d-64e8-4af2-9abc-ca7c7e662797` | supplemental | B-006: pre-atomic-guard sync left no Storage bytes |
| 93 | Hashiveinu (Dropkin).pdf | `56c4c7ba-b264-427e-8c32-16d7c29bba50` | supplemental | B-006: pre-atomic-guard sync left no Storage bytes |
| 94 | Hashiveinu (Folk).pdf | `6259b551-24b8-441b-ad62-6f4cc45a011a` | supplemental | B-006: pre-atomic-guard sync left no Storage bytes |
| 95 | Hashkiveinu (Brodsky-Zweiback).pdf | `cf704b73-5f35-45fe-901f-a8b68d4fdc22` | supplemental | B-006: pre-atomic-guard sync left no Storage bytes |
| 96 | Hashkiveinu (Steven Chaitman).pdf | `e0d2d8d8-86a4-4692-b70f-404e2f911fd6` | supplemental | B-006: pre-atomic-guard sync left no Storage bytes |
| 97 | Hatikvah (Czech Folk).pdf | `2245fe4b-7562-475e-be0d-709cb28bf48c` | supplemental | B-006: pre-atomic-guard sync left no Storage bytes |
| 98 | Havah Nagilah (Chassidic Folk).pdf | `61f0c403-0d98-45a9-ad90-c813329a0d6d` | supplemental | B-006: pre-atomic-guard sync left no Storage bytes |
| 99 | Havah Nashirah (Haydn) - Havah Neitzei B'Machol (Chassidic) - Hayom Yom Huledet (Israeli).pdf | `13c6fcba-7b42-44f6-8582-581194e2431d` | supplemental | B-006: pre-atomic-guard sync left no Storage bytes |
| 100 | Hei Artzeinu (African) - Heiveinu (Feingold) - Heiveinu Shalom Aleichem (Folk).pdf | `d5899a90-cff2-4128-9d46-92f478bd9ced` | supplemental | B-006: pre-atomic-guard sync left no Storage bytes |
| 101 | Hillel's Song (Brodsky-Zweiback-Glaser).pdf | `d56ad543-bac7-4fb9-825f-b9ceb8efd4cc` | supplemental | B-006: pre-atomic-guard sync left no Storage bytes |
| 102 | Hinei Mah Tov (Folk) - Hinei Mah Tov (Dropkin) - Hinei Mah Tov (Jacobson-Drozi).pdf | `3df0360d-9078-45e0-ab96-73804fa7276b` | supplemental | B-006: pre-atomic-guard sync left no Storage bytes |
| 103 | Hinei Rakevet (Folk).pdf | `5aa91e83-02ef-44c6-bc28-833be56d0bed` | supplemental | B-006: pre-atomic-guard sync left no Storage bytes |
| 104 | Hinei Tov M'Od (Lustig).pdf | `2d7ede35-04fd-4337-8eb7-db69444304ce` | supplemental | B-006: pre-atomic-guard sync left no Storage bytes |
| 105 | Hodu (Friedman).pdf | `b61290eb-8df3-4081-bad0-b4e54ff0112e` | supplemental | B-006: pre-atomic-guard sync left no Storage bytes |
| 106 | Hodu (Silver).pdf | `07478587-664a-4153-8a82-c35364f4ec12` | supplemental | B-006: pre-atomic-guard sync left no Storage bytes |
| 107 | Hodu Ladonai (Folk) - Hodu Ladonai (Dropkin).pdf | `289a11d0-fbb3-4a21-8c98-50473b6e1001` | supplemental | B-006: pre-atomic-guard sync left no Storage bytes |
| 108 | Hodu Lasultan (Kuhlau).pdf | `f8f97785-c7b0-4a1a-8015-b6ef108a7939` | supplemental | B-006: pre-atomic-guard sync left no Storage bytes |
| 109 | Hold Fast To Dreams (Klepper) - Hoshiah Et Amecha (Chassidic Folk).pdf | `23d61fc5-59fa-4cb4-99f1-e24eccb88fce` | supplemental | B-006: pre-atomic-guard sync left no Storage bytes |
| 110 | How Glorious (Bronstein).pdf | `a5c6d619-9578-45cc-90da-155a73b57c58` | supplemental | B-006: pre-atomic-guard sync left no Storage bytes |
| 111 | I Am All Around (Silver).pdf | `df306e1c-5687-4031-893c-32de03310bc8` | supplemental | B-006: pre-atomic-guard sync left no Storage bytes |
| 112 | I Have A Voice (Elana Arian).pdf | `89501d6f-d130-4a4a-8c41-2e274b06775c` | supplemental | B-006: pre-atomic-guard sync left no Storage bytes |
| 113 | I Rise (Eliana Light).pdf | `f4e8fd6c-06e2-4b65-afe5-756698b8d678` | supplemental | B-006: pre-atomic-guard sync left no Storage bytes |
| 114 | If All Of The World (Sheldon Low).pdf | `6bddf129-6f1c-4fa4-bf54-3cf431a53219` | supplemental | B-006: pre-atomic-guard sync left no Storage bytes |
| 115 | Im Ein Ani Li-B'Chol Dor Vador (Friedman).pdf | `e50241ed-5c6e-4616-84ae-df9f9abda905` | supplemental | B-006: pre-atomic-guard sync left no Storage bytes |
| 116 | Im Tirtzu (Friedman) - Iti Milvanon (Chen).pdf | `9294a143-e27e-4638-afc2-4d3851912420` | supplemental | B-006: pre-atomic-guard sync left no Storage bytes |
| 117 | Ivdu Et Hashem (Sher) - Ivdu Et Hashem (Folk).pdf | `dc4fb084-3b23-4481-8353-efc8bbafdb3d` | supplemental | B-006: pre-atomic-guard sync left no Storage bytes |
| 118 | Just Another Foreigner (Sussman).pdf | `d1ccd776-0d8b-4860-8958-d8a9b0a5c254` | supplemental | B-006: pre-atomic-guard sync left no Storage bytes |
| 119 | K'Dushah (Shur).pdf | `46e66e0d-4f0d-47e7-baaa-125891f997b4` | supplemental | B-006: pre-atomic-guard sync left no Storage bytes |
| 120 | Kadish D'Rabanan (Friedman).pdf | `235c703e-600e-4cc4-aca5-283ae3b81af9` | supplemental | B-006: pre-atomic-guard sync left no Storage bytes |
| 121 | Ki Beiti (Schachet-Briskin-Rosen).pdf | `d74c9faf-ccd2-47e3-a5bf-efbf6e153b9a` | supplemental | B-006: pre-atomic-guard sync left no Storage bytes |
| 122 | Ki Mitziyon - Baruch Shenatan - Sh'Ma - Echad Eloheinu (Sulzer) - L'Cha Adonai (Ephros).pdf | `471113d7-9755-4599-b32f-ea66548ea36d` | supplemental | B-006: pre-atomic-guard sync left no Storage bytes |
| 123 | Ki Mitziyon (Shachar).pdf | `db332014-1948-4445-9cb5-f983b24f9a27` | supplemental | B-006: pre-atomic-guard sync left no Storage bytes |
| 124 | Kiddush (Lewandowski).pdf | `c35834ef-23e5-4db5-9db1-f91650d87812` | supplemental | B-006: pre-atomic-guard sync left no Storage bytes |
| 125 | Know Who Came Before (Shira Kobren).pdf | `b8860acc-ebbe-4b7e-a668-7aa92a1a7039` | supplemental | B-006: pre-atomic-guard sync left no Storage bytes |
| 126 | Ko Amar Hashem (Calek) - Kol Han'Shamah (Praetorius).pdf | `b3f1cdba-6e1d-497f-89e2-0b4facf13e0c` | supplemental | B-006: pre-atomic-guard sync left no Storage bytes |
| 127 | Kol Han'Shamah (Sufi Chant) - K'Shoshanah (Hadar) - Kum Bachur Atzeil (Folk).pdf | `e36d7e15-6c9b-4f1f-98ec-e0683bfea7cc` | supplemental | B-006: pre-atomic-guard sync left no Storage bytes |
| 128 | Kumi Lach (Friedman).pdf | `e54ff293-2e3a-41c1-ac1e-079bdb1c31d4` | supplemental | B-006: pre-atomic-guard sync left no Storage bytes |
| 129 | L'Chah Dodi (Friedman).pdf | `13ddc1bb-07e4-480a-bf24-5ee5ed22af6f` | supplemental | B-006: pre-atomic-guard sync left no Storage bytes |
| 130 | L'Chah Dodi (Isaacson).pdf | `44c38248-6925-4921-b833-eeae0854e63a` | supplemental | B-006: pre-atomic-guard sync left no Storage bytes |
| 131 | L'Chah Dodi (Israeli).pdf | `9b6a0ab0-9cdf-4862-94c8-5b63b6b77e6b` | supplemental | B-006: pre-atomic-guard sync left no Storage bytes |
| 132 | L'Chah Dodi (Sephardic).pdf | `ee2b1395-b9ce-4fcb-85b5-ed0d8bb9e067` | supplemental | B-006: pre-atomic-guard sync left no Storage bytes |
| 133 | L'Chah Dodi (Zeira) - L'Chah Dodi (Rotenberg).pdf | `64816b31-79d9-44a1-b582-f8bba765eeb2` | supplemental | B-006: pre-atomic-guard sync left no Storage bytes |
| 134 | L'Chu N'Ran'Nah (Alan Goodis).pdf | `76dda851-02b7-434f-a36b-f5b99c5fb1bd` | supplemental | B-006: pre-atomic-guard sync left no Storage bytes |
| 135 | L'Chu N'Ran'Nah (Sirotkin).pdf | `3a65f5c6-e18f-4f45-acde-eaf125b310eb` | supplemental | B-006: pre-atomic-guard sync left no Storage bytes |
| 136 | L'Dor Vador (Friedman).pdf | `193e1533-9952-4fad-a4c0-7cdcfb508ba0` | supplemental | B-006: pre-atomic-guard sync left no Storage bytes |
| 137 | L'Takein (The Na Na Song) (Nichols-Klotz).pdf | `dc3389ab-af69-42ac-ba08-e2f13c3d343f` | supplemental | B-006: pre-atomic-guard sync left no Storage bytes |
| 138 | La-Asok B'Divrei Torah (Klepper) - Eilu D'Varim (Klepper-Freelander).pdf | `837e0ce9-4525-4258-b0e1-0cf483189f81` | supplemental | B-006: pre-atomic-guard sync left no Storage bytes |
| 139 | Lach Y'Rushalayim (Rubinstein).pdf | `6ce470ac-cf9a-44f4-9602-158d5508a45d` | supplemental | B-006: pre-atomic-guard sync left no Storage bytes |
| 140 | Lam'Natzei-Ach (Seltzer).pdf | `42003f22-0d5d-49f0-a45e-87e5ade38d6b` | supplemental | B-006: pre-atomic-guard sync left no Storage bytes |
| 141 | Laugh At All My Dreams (Friedman) - L'Chi Lach (Friedman).pdf | `8adc4ca1-a52f-4e4b-8909-d3d600a49993` | supplemental | B-006: pre-atomic-guard sync left no Storage bytes |
| 142 | Let The Heavens Be Glad (Weinberg) - Let The Rivers (Schachet-Briskin).pdf | `3b90c6ba-e8f2-4fa2-ac26-ad4fa316c9c3` | supplemental | B-006: pre-atomic-guard sync left no Storage bytes |
| 143 | Lev B'Lev (Schafer).pdf | `25a1305b-ff4f-4c59-8aaa-9d646962b513` | supplemental | B-006: pre-atomic-guard sync left no Storage bytes |
| 144 | Levi The Leviathan (Milder) - Light One Candle (Yarrow).pdf | `a8c83317-b120-4e7e-8590-d33c43519b78` | supplemental | B-006: pre-atomic-guard sync left no Storage bytes |
| 145 | Light These Lights (O Hear My Prayer) (Friedman).pdf | `395c9ef8-3cf3-4c3d-8785-3deb852da074` | supplemental | B-006: pre-atomic-guard sync left no Storage bytes |
| 146 | Livrachah (Schiller).pdf | `39a123f9-f6df-434f-85f7-8a5f2b607ead` | supplemental | B-006: pre-atomic-guard sync left no Storage bytes |
| 147 | Lo Alecha (Klepper-Freelander).pdf | `5ed550bc-b6d3-498a-8c9c-6fc42212d9d6` | supplemental | B-006: pre-atomic-guard sync left no Storage bytes |
| 148 | Lo Ira (Fuchs) - Lo Yareiu-V'Chit'Tu (Sharlin-Gabbai) - Lo Yisa Goi.pdf | `f1168454-effb-4a7e-943b-23ed1b8b78a8` | supplemental | B-006: pre-atomic-guard sync left no Storage bytes |
| 149 | Lo Yisa Goi (Altman) - L'Shanah Haba-Ah (Folk).pdf | `45d7d670-f2c5-4437-a7d7-b40fe5ebe416` | supplemental | B-006: pre-atomic-guard sync left no Storage bytes |
| 150 | Lo Yisa Goi (Emily Groff).pdf | `9a1ac289-1717-4eb7-8cf4-59c5ced1b82f` | supplemental | B-006: pre-atomic-guard sync left no Storage bytes |
| 151 | Lu Y'Hi (Shemer) - Mah Dodeich (Unknown).pdf | `4a2fcc5e-3684-486c-af94-6f48bea4188c` | supplemental | B-006: pre-atomic-guard sync left no Storage bytes |
| 152 | Mah Gadlu (Gold) - Mah Navu (Spivak).pdf | `75dc9298-772b-4092-a3de-b7e54f1c6403` | supplemental | B-006: pre-atomic-guard sync left no Storage bytes |
| 153 | Mah Gadlu (Isaacson).pdf | `b718c24a-03f5-4743-ae15-74a97245111e` | supplemental | B-006: pre-atomic-guard sync left no Storage bytes |
| 154 | Mah Rabu (Noah Aronson And Coleen Dieker).pdf | `ec4d7894-8dfa-4ea4-bff0-a36d43451ac3` | supplemental | B-006: pre-atomic-guard sync left no Storage bytes |
| 155 | Mah Tovu (Klepper).pdf | `c8392be2-6de4-4f2d-bb87-a9f64012ea01` | supplemental | B-006: pre-atomic-guard sync left no Storage bytes |
| 156 | Mah Tovu (Maseng) - Mah Tovu (Chassidic).pdf | `9e9c3ff0-404b-44d1-ae7f-0bc924ae0fd8` | supplemental | B-006: pre-atomic-guard sync left no Storage bytes |
| 157 | Mah Yafeh Hayom (Miron).pdf | `da7f973d-c7e6-4cdc-9581-046a0dce2cf0` | supplemental | B-006: pre-atomic-guard sync left no Storage bytes |
| 158 | Make Those Waters Part (Mishkin) - Makom Shelibi Oheiv (Sher).pdf | `35eeeadb-af0d-4b49-b966-aa63655a4435` | supplemental | B-006: pre-atomic-guard sync left no Storage bytes |
| 159 | May The Words (Schiller).pdf | `e48e03d1-6c4b-4656-be2c-a5527ac516a2` | supplemental | B-006: pre-atomic-guard sync left no Storage bytes |
| 160 | Mayim (Amiran).pdf | `288a0399-23b7-478c-bccc-369db1a30cd6` | supplemental | B-006: pre-atomic-guard sync left no Storage bytes |
| 161 | Mi Chamochah (Freed).pdf | `991ccdfe-940a-4c5b-a1bb-68fc42432682` | supplemental | B-006: pre-atomic-guard sync left no Storage bytes |
| 162 | Mi Chamochah (Friedman).pdf | `9bc6a05a-cb52-45ac-b91e-7bd3c68aef9f` | supplemental | B-006: pre-atomic-guard sync left no Storage bytes |
| 163 | Mi Chamochah (Shenson) - Mi Chamochah (Friedman).pdf | `7f6b5f88-d7f5-426d-8feb-822691025fd9` | supplemental | B-006: pre-atomic-guard sync left no Storage bytes |
| 164 | Mi Ha-Ish (Chait).pdf | `bd8e39cd-94d3-4ec3-a2a7-5eb7c2f6eded` | supplemental | B-006: pre-atomic-guard sync left no Storage bytes |
| 165 | Mi Shebeirach (Friedman).pdf | `6738e47c-e710-4f65-9655-d93d2ee8332e` | supplemental | B-006: pre-atomic-guard sync left no Storage bytes |
| 166 | Mi Shebeirach (Levine).pdf | `3c965b50-cd20-4a05-88d8-ccec39b59f41` | supplemental | B-006: pre-atomic-guard sync left no Storage bytes |
| 167 | Miitachat Lashamayim (Broza) - Mitzvah Goreret Mitzvah (Vogel).pdf | `aa51edfb-c177-4f94-b7a7-8098b8679d1c` | supplemental | B-006: pre-atomic-guard sync left no Storage bytes |
| 168 | Milibeinu (Lustig) - Mipi Eil-Ein Adir (Sephardic) - Miriam's Song (Friedman).pdf | `99876430-8fc9-43f6-b41b-ada31937c260` | supplemental | B-006: pre-atomic-guard sync left no Storage bytes |
| 169 | Mizmor Shir (Unknown).pdf | `218fc2a9-cbe4-4ff1-a056-68f7f55bbac2` | supplemental | B-006: pre-atomic-guard sync left no Storage bytes |
| 170 | Modeh Ani (Folk) - Mah Tovu (Folk).pdf | `41379850-2021-48c5-8acd-e867e4dfa119` | supplemental | B-006: pre-atomic-guard sync left no Storage bytes |
| 171 | Modeh Ani (Jacob Spike Kraus).pdf | `30e3d10d-aede-4d56-86a2-a9f183ba5b2a` | supplemental | B-006: pre-atomic-guard sync left no Storage bytes |
| 172 | Modeh Ani (Klepper-Freelander).pdf | `2fc76c49-023f-4eaf-a063-d5f69e22ab72` | supplemental | B-006: pre-atomic-guard sync left no Storage bytes |
| 173 | Modim (Weiner-Cohen) - Modim (Friedman).pdf | `4f5d5c70-4dc2-4071-9960-174bda73f761` | supplemental | B-006: pre-atomic-guard sync left no Storage bytes |
| 174 | Modim (Zach Singer).pdf | `61aeb253-df01-471a-a9fa-2eb885c4ef35` | supplemental | B-006: pre-atomic-guard sync left no Storage bytes |
| 175 | N'Ran'Nah (Chassidic Folk) - Ochel.pdf | `42a1cd5d-93ef-4a02-8a8d-7a669ff9c921` | supplemental | B-006: pre-atomic-guard sync left no Storage bytes |
| 176 | Nas'U (Josh Warshawsky).pdf | `1ace0be3-5238-4f8f-b21e-8a95f3fcd0a7` | supplemental | B-006: pre-atomic-guard sync left no Storage bytes |
| 177 | Nefesh Achat (Gold-Hunter-Kane-Katzman).pdf | `e3708fd4-7182-4b11-ac84-d6e0ebd9e661` | supplemental | B-006: pre-atomic-guard sync left no Storage bytes |
| 178 | Nolad'Ti Lashalom (Hitman) - Not By Might-Not By Power (Friedman).pdf | `7fac9e4d-21ee-4830-91e6-1e05f3cf93c0` | supplemental | B-006: pre-atomic-guard sync left no Storage bytes |
| 179 | Od Lo Ahavti Dai (Shemer).pdf | `fe495975-d73d-43ca-ba6c-2a16b2702bdf` | supplemental | B-006: pre-atomic-guard sync left no Storage bytes |
| 180 | Od Yishama (Carlebach).pdf | `f34bf3e8-f306-4945-b212-e2dab83b7b8d` | supplemental | B-006: pre-atomic-guard sync left no Storage bytes |
| 181 | Olim (Falashas No More) (Mishkin).pdf | `662dd31d-b975-42c0-877d-57084950fffb` | supplemental | B-006: pre-atomic-guard sync left no Storage bytes |
| 182 | Open Up Our Eyes (Klepper).pdf | `672e94b4-9da7-40f7-8ec1-ae56bd67cce7` | supplemental | B-006: pre-atomic-guard sync left no Storage bytes |
| 183 | Or Zaru-A (Klepper).pdf | `d630644f-befe-4991-862f-8cb0d9bcb68f` | supplemental | B-006: pre-atomic-guard sync left no Storage bytes |
| 184 | Oseh Shalom (Dropkin).pdf | `41749406-91a4-410d-bf45-1a1a39f84aed` | supplemental | B-006: pre-atomic-guard sync left no Storage bytes |
| 185 | Oseh Shalom (Friedman).pdf | `3df80222-8fe3-4f83-a641-8eb27839608a` | supplemental | B-006: pre-atomic-guard sync left no Storage bytes |
| 186 | Oseh Shalom (Hirsch).pdf | `fa1f678c-9f4d-4cd8-8e4e-897278c4840f` | supplemental | B-006: pre-atomic-guard sync left no Storage bytes |
| 187 | Oseh Shalom (Josh Goldberg).pdf | `a71c69d3-7967-4a14-8547-abc2d193e28d` | supplemental | B-006: pre-atomic-guard sync left no Storage bytes |
| 188 | Oseh Shalom (Klepper).pdf | `b5d5aaa3-9556-453a-95ff-be7f84498877` | supplemental | B-006: pre-atomic-guard sync left no Storage bytes |
| 189 | Oseh Shalom (Pinto).pdf | `37b74f7a-31b1-4ed7-99df-2421c8a81e92` | supplemental | B-006: pre-atomic-guard sync left no Storage bytes |
| 190 | Pharaoh Pharaoh (Berry).pdf | `f19400b3-dfed-43da-b957-566517cccb75` | supplemental | B-006: pre-atomic-guard sync left no Storage bytes |
| 191 | Pitchu Li (Carlebach).pdf | `2dc43bcb-7c37-44fb-ac29-5ed7d20e87a9` | supplemental | B-006: pre-atomic-guard sync left no Storage bytes |
| 192 | Pitchu Li (Dropkin).pdf | `198fc291-2b1f-46db-8e84-b0c7e19b3c8c` | supplemental | B-006: pre-atomic-guard sync left no Storage bytes |
| 193 | Psalm 150 (Yemenite).pdf | `422d3103-d7b3-437e-ba7e-f864c6e570fa` | supplemental | B-006: pre-atomic-guard sync left no Storage bytes |
| 194 | Rad Halailah (Chassidic).pdf | `1fb983c0-12be-4a51-bcd8-4be089e70b1f` | supplemental | B-006: pre-atomic-guard sync left no Storage bytes |
| 195 | Rom'Mu (Taubman).pdf | `fb0c1ad8-f068-47fe-a61a-aa8f6f2cc607` | supplemental | B-006: pre-atomic-guard sync left no Storage bytes |
| 196 | S'U Sh'Arim (Friedman).pdf | `6eb445b8-66f0-4958-a1b0-e6f4fadc449f` | supplemental | B-006: pre-atomic-guard sync left no Storage bytes |
| 197 | Sabbath Prayer (Bock).pdf | `be82b110-a864-41e8-a19e-a0789cd0c437` | supplemental | B-006: pre-atomic-guard sync left no Storage bytes |
| 198 | Sh'Ma (Sulzer) - Sh'Ma (Pik).pdf | `b557bab2-5e48-4e83-80f5-a9391e10241f` | supplemental | B-006: pre-atomic-guard sync left no Storage bytes |
| 199 | Sh'Ma Koleinu (Friedman).pdf | `30982932-7c78-432b-9350-68a0c2fe35de` | supplemental | B-006: pre-atomic-guard sync left no Storage bytes |
| 200 | Sh'Ma-V'Ahavta (Friedman).pdf | `70a83fa1-d1a8-45ac-bb03-601bb5103b60` | supplemental | B-006: pre-atomic-guard sync left no Storage bytes |
| 201 | Shabbos Yidn Zol Zain (Chassidic).pdf | `26b904af-782b-4b6a-bbca-6a53aeb09c33` | supplemental | B-006: pre-atomic-guard sync left no Storage bytes |
| 202 | Shalom Aleichem (Brazil).pdf | `d2ba8f16-9eeb-49a0-b0b1-372065bc17be` | supplemental | B-006: pre-atomic-guard sync left no Storage bytes |
| 203 | Shalom Aleichem (Goldfarb).pdf | `25df4be7-0a5d-4a8d-bf7b-64d2d03f67e5` | supplemental | B-006: pre-atomic-guard sync left no Storage bytes |
| 204 | Shalom Chaveirim (Folk) - Shalom Chaveirim (Feingold-Abrams).pdf | `46dbc366-04ba-406a-aadc-55e500597250` | supplemental | B-006: pre-atomic-guard sync left no Storage bytes |
| 205 | Shalom Rav (Klepper-Freelander).pdf | `d22779d6-bd3f-436c-8d5a-cc6daa3d92e6` | supplemental | B-006: pre-atomic-guard sync left no Storage bytes |
| 206 | Shalom Shalom (Rogow).pdf | `1c1efa1f-491c-4925-a8de-07a115437fc5` | supplemental | B-006: pre-atomic-guard sync left no Storage bytes |
| 207 | Shavu-A Tov (Klepper).pdf | `ae971440-9066-4059-bf27-80c095b28058` | supplemental | B-006: pre-atomic-guard sync left no Storage bytes |
| 208 | Shir Baboker Baboker (Artzi-Koren).pdf | `1eada1e3-c629-4fce-af21-83e81d480b5a` | supplemental | B-006: pre-atomic-guard sync left no Storage bytes |
| 209 | Shir Chadash (Silver).pdf | `82d38077-d6d9-4755-b797-3654de352da3` | supplemental | B-006: pre-atomic-guard sync left no Storage bytes |
| 210 | Shir Chadash (Taubman).pdf | `83d15dde-b4c6-4fc0-bf66-047d6d2f7142` | supplemental | B-006: pre-atomic-guard sync left no Storage bytes |
| 211 | Shir Hama-Alot (Friedman).pdf | `81b0bc66-c339-4e0e-a1ab-880920ede4e3` | supplemental | B-006: pre-atomic-guard sync left no Storage bytes |
| 212 | Shir Hama-Alot (Taubman).pdf | `139f1251-1373-409e-8fc7-4c447f7c7f92` | supplemental | B-006: pre-atomic-guard sync left no Storage bytes |
| 213 | Shir Hama-Alot (Traditional).pdf | `4ecc47bd-97a8-4aa6-988c-f490695b0d98` | supplemental | B-006: pre-atomic-guard sync left no Storage bytes |
| 214 | Shir Lashalom (Rosenblum) - Shiru Ladonai (Holander).pdf | `88726e5b-6464-4b0b-948a-f444bcdd005f` | supplemental | B-006: pre-atomic-guard sync left no Storage bytes |
| 215 | Shiru Ladonai (Neimark-Gumer).pdf | `ae83649a-718d-4fc4-ace8-82a9f6c2a400` | supplemental | B-006: pre-atomic-guard sync left no Storage bytes |
| 216 | Shiru Shir (Rogow) - Siman Tov (Chassidic Folk) - Siman Tov (Feingold).pdf | `27f2ec75-1a5a-4241-ab4b-e95879f03168` | supplemental | B-006: pre-atomic-guard sync left no Storage bytes |
| 217 | Sim Shalom (Dinitz-Grosky) - Sim Shalom (Folk).pdf | `a8d3aa9e-6cf4-4960-9580-416b522255df` | supplemental | B-006: pre-atomic-guard sync left no Storage bytes |
| 218 | Sim Shalom (Dropkin).pdf | `70efd098-6c4d-44ac-8884-8115af528ab9` | supplemental | B-006: pre-atomic-guard sync left no Storage bytes |
| 219 | Sim Shalom (Silver).pdf | `c98dd389-724e-4ffe-9eb0-8eed621b782b` | supplemental | B-006: pre-atomic-guard sync left no Storage bytes |
| 220 | Simi Yadeich (Israeli Folk) - Sing (Dobin).pdf | `bf3b034a-c117-459a-be3d-743f2e2f9b97` | supplemental | B-006: pre-atomic-guard sync left no Storage bytes |
| 221 | Sing Unto God (Friedman) - Sisu Et Y'Rushalayim (Nof) - Stars In The Sky (Milder).pdf | `c4761aac-f40d-45b0-a151-94869bcebdb3` | supplemental | B-006: pre-atomic-guard sync left no Storage bytes |
| 222 | T'Filat Haderech (Friedman).pdf | `012dd661-f451-444c-88fb-11d589028908` | supplemental | B-006: pre-atomic-guard sync left no Storage bytes |
| 223 | Tein Lo Mishelo (Zubren) - Tempo (Israeli Jingle).pdf | `267cc451-17af-42ab-a004-9c4e6ed1f76d` | supplemental | B-006: pre-atomic-guard sync left no Storage bytes |
| 224 | Tein Shabbat (Seltzer) - Tzur Mishelo (Sephardic).pdf | `f9921a95-cab9-4b2b-9869-a024cfc21e2b` | supplemental | B-006: pre-atomic-guard sync left no Storage bytes |
| 225 | The Angel's Blessing (Friedman).pdf | `ed609fc6-d1da-40e1-8f6b-b389ab5ce6a1` | supplemental | B-006: pre-atomic-guard sync left no Storage bytes |
| 226 | The Last Butterfly (Glatzer-Shenson).pdf | `5fa69e00-2115-4915-9aa3-f68ad3c42466` | supplemental | B-006: pre-atomic-guard sync left no Storage bytes |
| 227 | The Prophet You (Silver).pdf | `979106ff-0de4-4c2f-bb30-bec95c154c72` | supplemental | B-006: pre-atomic-guard sync left no Storage bytes |
| 228 | This Is Very Good (Klepper) - Todah (Kviomandizis) - Torat Chayim (Carr Reuben).pdf | `33d9e425-2ed1-4054-988f-2935119d90e8` | supplemental | B-006: pre-atomic-guard sync left no Storage bytes |
| 229 | Torah Blessings (Cantillation).pdf | `2c5a74a5-bd72-4a3f-aa62-c8ab25b33d75` | supplemental | B-006: pre-atomic-guard sync left no Storage bytes |
| 230 | Tov L'Hodot (Klepper-Freelander) - Tumbalalaikah (Yiddish Folk).pdf | `36928f78-7327-4d7f-ba5a-4291ccc74084` | supplemental | B-006: pre-atomic-guard sync left no Storage bytes |
| 231 | Tree Of Life (Silverman) - Eitz Chayim Hi (Traditional).pdf | `938fee53-1e52-4f4a-8846-75090fd132ba` | supplemental | B-006: pre-atomic-guard sync left no Storage bytes |
| 232 | Tzadik Katamar (Maslo) - Tzadik Katamar (Lewandowski).pdf | `31248276-14b6-4bc0-914a-0c129d023586` | supplemental | B-006: pre-atomic-guard sync left no Storage bytes |
| 233 | Tzenah Tzenah (Miron-Grossman).pdf | `ad8e4572-c58e-44cc-ae89-b3d898bc5bb9` | supplemental | B-006: pre-atomic-guard sync left no Storage bytes |
| 234 | Ufaratzta (Friedman).pdf | `a5713e22-a445-4ae8-ae61-9ec45b05c14d` | supplemental | B-006: pre-atomic-guard sync left no Storage bytes |
| 235 | Ufaratzta (Maslo).pdf | `fa8d38f9-cf6a-4349-9c2b-d514ca42fc2f` | supplemental | B-006: pre-atomic-guard sync left no Storage bytes |
| 236 | Uri Tziyon (Wilensky).pdf | `f4fd95a8-6d2e-4477-bf70-ff83f5ade912` | supplemental | B-006: pre-atomic-guard sync left no Storage bytes |
| 237 | Ushmor (Klepper-Freelander) - Ufros Aleinu (Folk).pdf | `88088b30-ef2e-41ad-bcd0-5d460377bd63` | supplemental | B-006: pre-atomic-guard sync left no Storage bytes |
| 238 | V'Ahavta (Isaacson).pdf | `3e967bd3-cf6a-455d-a6c0-f80fc68b0831` | supplemental | B-006: pre-atomic-guard sync left no Storage bytes |
| 239 | V'Ahavta (Silver).pdf | `b60cd3c4-3e50-4449-a115-c068a81cb75e` | supplemental | B-006: pre-atomic-guard sync left no Storage bytes |
| 240 | V'Eizehu (Escovitz).pdf | `e51ba89e-a687-407f-bb32-992173dfd65f` | supplemental | B-006: pre-atomic-guard sync left no Storage bytes |
| 241 | V'Ha-Eir Eineinu (Carlebach).pdf | `d4385faa-e668-4a49-9a3b-b357a2933c49` | supplemental | B-006: pre-atomic-guard sync left no Storage bytes |
| 242 | V'Ha-Eir Eineinu (Sharlin).pdf | `7eda392b-2472-418b-a0e8-918e48776945` | supplemental | B-006: pre-atomic-guard sync left no Storage bytes |
| 243 | V'Nomar L'Fanav (Chassidic Folk).pdf | `055bf376-f545-45f9-9f40-da81544b312f` | supplemental | B-006: pre-atomic-guard sync left no Storage bytes |
| 244 | V'Shamru (Friedman).pdf | `fbf15797-3d74-4397-86c4-931b16a334cf` | supplemental | B-006: pre-atomic-guard sync left no Storage bytes |
| 245 | V'Shamru (Rothblum).pdf | `fcc1c2fe-358e-43ec-b39f-bfa84ba1b6e2` | supplemental | B-006: pre-atomic-guard sync left no Storage bytes |
| 246 | V'Shinantam (Taubman).pdf | `6d704852-b119-4611-b2a9-b05bbd92aa8d` | supplemental | B-006: pre-atomic-guard sync left no Storage bytes |
| 247 | V'Yashvu Ish (Klepper-Freelander).pdf | `66bd1185-8e9e-46ef-9ea2-7a5646504503` | supplemental | B-006: pre-atomic-guard sync left no Storage bytes |
| 248 | V'Zot Hatorah (Idelsohn) - Hodo Al Eretz (Sulzer).pdf | `6d8343b3-9a3d-4550-a529-bac4ca04ab00` | supplemental | B-006: pre-atomic-guard sync left no Storage bytes |
| 249 | Vayiven Uziyahu (Zarai) - V'David Y'Feih Einayim (Israeli Folk).pdf | `f3533786-9922-4b85-a6a3-5e7651237d78` | supplemental | B-006: pre-atomic-guard sync left no Storage bytes |
| 250 | Vihi Noam (Schachet-Briskin-Rosen) - Vihudah L'Olam Teisheiv (Jacobson).pdf | `8454f8fa-0904-43b9-a73c-06f41910bc1f` | supplemental | B-006: pre-atomic-guard sync left no Storage bytes |
| 251 | Waking Up Nigun (Ariel Root Wolpe).pdf | `45a57edb-cc78-4fb0-97e9-a9ab372d7943` | supplemental | B-006: pre-atomic-guard sync left no Storage bytes |
| 252 | Wherever You Go (Milder).pdf | `2485f761-d134-416a-89d8-5bb8d7cc27f1` | supplemental | B-006: pre-atomic-guard sync left no Storage bytes |
| 253 | Y'Rushalayim Shel Zahav (Shemer).pdf | `0eb186b2-9146-46c6-8615-ed971085bad1` | supplemental | B-006: pre-atomic-guard sync left no Storage bytes |
| 254 | Y'Varech'Cha (Priestly Blessing) (Klepper-Freelander).pdf | `24308467-f3c9-4fba-b7e8-6795821d3a69` | supplemental | B-006: pre-atomic-guard sync left no Storage bytes |
| 255 | Y'Varech'Cha (Weinkranz).pdf | `44e0d496-88a6-46c3-bd09-fec655d3edc4` | supplemental | B-006: pre-atomic-guard sync left no Storage bytes |
| 256 | Yad B'Yad (Taubman) - Y'Did Nefesh (Zweig).pdf | `98f55ba9-5d00-41b4-ba6a-e1edf7a42a24` | supplemental | B-006: pre-atomic-guard sync left no Storage bytes |
| 257 | Yah Ribon (Traditional).pdf | `509d8360-46da-43da-9ba3-75fdf2032838` | supplemental | B-006: pre-atomic-guard sync left no Storage bytes |
| 258 | Yeish Kochavim (Klepper-Freelander).pdf | `2aefdc50-ad45-494e-a2d6-f3351995b24a` | supplemental | B-006: pre-atomic-guard sync left no Storage bytes |
| 259 | Yeish L'Vavot (Silver).pdf | `ac2ab0cd-4a3d-4fe2-99f3-3a2b50e24978` | supplemental | B-006: pre-atomic-guard sync left no Storage bytes |
| 260 | Yih'Yeh Shalom (Recht) - Yih'Yeh Tov (Broza).pdf | `000cc80a-9c65-4b55-929e-c9ca1f6737c3` | supplemental | B-006: pre-atomic-guard sync left no Storage bytes |
| 261 | Yih'Yu L'Ratzon - Yih'Yu L'Ratzon (Silver-Schorsch) - May The Words (Friedman).pdf | `e14dd153-549a-4803-b484-37ccedabffa1` | supplemental | B-006: pre-atomic-guard sync left no Storage bytes |
| 262 | Yism'Chu (Klepper) - Yism'Chu (Folk).pdf | `4a5faa48-43d0-435c-a9b0-8d069cb88e11` | supplemental | B-006: pre-atomic-guard sync left no Storage bytes |
| 263 | Yism'Chu (Solomon).pdf | `f270dee3-fc29-4047-ac9c-0e3dcb998126` | supplemental | B-006: pre-atomic-guard sync left no Storage bytes |
| 264 | Yism'Chu Hashamayim (Chassidic Folk).pdf | `12a55b49-215d-49dd-87a8-f3fb695ee088` | supplemental | B-006: pre-atomic-guard sync left no Storage bytes |
| 265 | Yo-Yah (Sanderson).pdf | `8b574308-24ce-4720-916e-98393d1042c9` | supplemental | B-006: pre-atomic-guard sync left no Storage bytes |
| 266 | Yom Zeh L'Yisraeil (Cohen).pdf | `405c6a9b-0870-4e4f-a335-d8d34dce7c20` | supplemental | B-006: pre-atomic-guard sync left no Storage bytes |
| 267 | Yom Zeh L'Yisraeil (Dropkin).pdf | `bea31cf5-59f9-47b9-ac1c-aeecc345a7ed` | supplemental | B-006: pre-atomic-guard sync left no Storage bytes |
| 268 | Yom Zeh L'Yisraeil (Sharlin).pdf | `f1600ae6-d7bb-4076-ba42-1a3e5e24c112` | supplemental | B-006: pre-atomic-guard sync left no Storage bytes |
| 269 | Yotzeir (Shankman-Lippe).pdf | `3cb6a75d-a704-4bfb-b3c4-93ab5f7613f0` | supplemental | B-006: pre-atomic-guard sync left no Storage bytes |
| 270 | You Are The One (Friedman) - Rise And Shine (Folk) - Rock O' My Soul (Folk).pdf | `d182a8c3-2bba-4a8b-8399-57d640cb2044` | supplemental | B-006: pre-atomic-guard sync left no Storage bytes |
| 271 | Zamar Nodeid (Shemer) - Zum Gali Gali (Folk).pdf | `3bf73686-08ba-4b28-bf78-0520963a215b` | supplemental | B-006: pre-atomic-guard sync left no Storage bytes |

### Batch: 2026-05-19 · source=upload (21)

| # | title / fileName | id | collection | orphanedReason |
|---:|---|---|---|---|
| 1 | Ana B'Koach | `upload-da196baf-05d3-411d-b129-456f2fc16de2` |  |  |
| 2 | Ana B'Koach (as of 3-27-26) | `upload-b8afb8e6-2691-458e-b9a9-3d9258ffdd5f` |  |  |
| 3 | Ana B'Koach MuseScore File | `upload-743787ce-d038-4b03-ae09-f4c6f6c0696b` |  |  |
| 4 | Ana B'Koach mxl | `upload-32b4845e-8593-42cf-8264-caf2d0e348da` |  |  |
| 5 | Bar'chu Walkdown | `upload-0594bbd4-d661-42b9-b11d-feeb3ff4cda6` |  |  |
| 6 | Dancing In The Dark | `upload-9ffab05d-518c-45af-9cae-a5f140011093` | uploads |  |
| 7 | Em Bar'chu-Yotzier Walkdown | `upload-037d9094-ccc8-4f0f-ba31-de1b3e4991b6` |  |  |
| 8 | Erev Shel Shoshanim _ Yamin U’smol | `upload-e0d24d07-ccbe-4576-9263-0577c596dad6` |  |  |
| 9 | Lecha Dodi Lincoln's Nigun | `upload-0792351b-3ee8-4e96-b7a0-2eeeb3b7fab4` |  |  |
| 10 | Matir Asurim B minor | `upload-a06055c4-c67b-4f7c-8d1b-de4cc0082915` |  |  |
| 11 | May the Memory - Full Score | `upload-1e15a09a-2dbd-46a4-b8a7-e045e21af68c` |  |  |
| 12 | Mi_chamocha E (Moshav) | `upload-f74b8139-97c1-4fb0-8a0b-44576b26559a` |  |  |
| 13 | Mizmor L'David | `upload-bb71e9e2-e3ce-4cad-b884-28f1d74f8970` |  |  |
| 14 | Mizmor Shiru Ladonai | `upload-2db7e9ff-6224-4c0e-bbbe-4de37bf02f03` |  |  |
| 15 | Niggun - Bonia Shur | `upload-3f576cb7-9c10-4a68-849d-4f3d669bdf80` |  |  |
| 16 | Sim Shalom - Bonia Shur | `upload-32dbbab2-ee16-405d-a3e4-53c88450e1f4` |  |  |
| 17 | Stuart's Hora Medley | `upload-13ef3209-407e-4f36-a504-e16947665dd6` |  |  |
| 18 | Tu Bishvat | `upload-f39740c1-e90f-48c5-8adc-ab6b5d56fdbe` |  |  |
| 19 | Ve'imru amen - Full Score | `upload-aa425f07-937a-4be7-a13d-1e3000d1d8fa` |  |  |
| 20 | Yedid Nefesh revised 1-1-26 | `upload-1910a665-aae9-4e26-b517-17f61a3afb0b` |  |  |
| 21 | You're In My Heart | `upload-4698f776-b470-40e6-ad6d-4d99788d64de` | uploads |  |

### Batch: 2026-05-19 · source=null (3)

| # | title / fileName | id | collection | orphanedReason |
|---:|---|---|---|---|
| 1 |  | `flow-2` |  |  |
| 2 |  | `flow-3` |  |  |
| 3 |  | `flow-5` |  |  |

### Batch: unknown · source=null (1)

| # | title / fileName | id | collection | orphanedReason |
|---:|---|---|---|---|
| 1 |  | `manufactured-orphan-songid-xxx` |  |  |

### Batch: unknown · source=upload (1)

| # | title / fileName | id | collection | orphanedReason |
|---:|---|---|---|---|
| 1 | Matir Asurim B minor | `upload-5bb53870-999f-43fa-aa2d-06a9c253f572` |  |  |

---

## B. Duplicate rows (9) — Lane C cleanup, not recovery

Deduped; the kept copy serves. Hard-delete candidates (Lane C).

| title | id | source | mimeType | storageUrl |
|---|---|---|---|---|
| dodi li (sher).png | `1TeiP5BlGnlP9ogYXO9yFL25J1Tz5k_RX` | google_drive | image/png | — |
|  Ana B_Koach.pdf | `1Uf0bVHJJ_PHn6gZ0OtGRf2RFytrx01qU` | google_drive | application/pdf | gs://crcmusiccharts.firebasestorage.app/library/1Uf0bVHJJ_PHn6gZ0OtGRf2RFytrx01qU.pdf |
| Yotzeir Or (Klepper).pdf | `2a2da652-343c-453d-a106-c88b3bf7178b` | local_upload | application/pdf | — |
| Sim Shalom - Bonia Shur | `upload-038ddac7-19dd-4db7-8db4-00261807d5e1` | upload | application/pdf | library/upload-038ddac7-19dd-4db7-8db4-00261807d5e1.pdf |
| Ve'imru amen - Full Score | `upload-206c1e32-9ca9-41ae-b21f-c7dae2f677e3` | upload | application/pdf | library/upload-206c1e32-9ca9-41ae-b21f-c7dae2f677e3.pdf |
| Bar'chu Walkdown | `upload-8cf12700-fb49-4d3c-8b96-fcadab19999f` | upload | application/octet-stream | library/upload-8cf12700-fb49-4d3c-8b96-fcadab19999f.xml |
| T'filah Adonai s'fatai - Full Score | `upload-cc8a9cbd-9576-47ec-8862-80378291c761` | upload | application/pdf | library/upload-cc8a9cbd-9576-47ec-8862-80378291c761.pdf |
| Matir Asurim B minor | `upload-d3a3bac5-d177-4057-aa2a-ac5c0bc35ffe` | upload | application/pdf | library/upload-d3a3bac5-d177-4057-aa2a-ac5c0bc35ffe.pdf |
| May the Memory - Full Score | `upload-e86055ad-456a-403d-b88c-17362fd9d6f9` | upload | application/pdf | library/upload-e86055ad-456a-403d-b88c-17362fd9d6f9.pdf |

---

## C. Non-chart artifacts (99) — Lane C triage, not recovery

**By reason:** {"audio":65,"octet_stream":4,"drive_folder_or_gdoc":28,"office_doc":2}

| title | id | source | mimeType | reason | status |
|---|---|---|---|---|---|
| Michamocha (Shir Shabbat).mp3 | `10i20SEfzKTvGJ5tqWfPScip78eXszCHH` | google_drive | audio/mpeg | audio | active |
| Ve_Imru Amen-Bass.mp3 | `10z53rDn8ZRw_m5esW54nbxBEjPTNIjp5` | google_drive | audio/mpeg | audio | active |
| Barechu_trad_Bass.mp3 | `11bYBh-IiVb4eUxFythxUBdhfmbfZCiHY` | google_drive | audio/mpeg | audio | active |
| Adon Olam.mp3 | `12JfLCHytM5q59btBQ05sz-V_SurQmUoT` | google_drive | audio/mpeg | audio | active |
| Niggun_Tenor_Bass.mp3 | `139wiZLQyzIVrwfjapGdfhzHHeZR7eiNk` | google_drive | audio/mpeg | audio | active |
| Michamocha (Shir Shabbat) .mp3 | `17YFbGz0YNvC1o-K1VKRrqgZGae-WMsbg` | google_drive | audio/mpeg | audio | active |
| Shiru Medley .wav | `19aJQKD1H868a8tDZFphNLPh_rH4tFwLN` | google_drive | audio/wav | audio | active |
| Erev Shel Shoshanim : Yamin U’smol.wav | `19bFqLwp-TX_T3xlnV78DoMj3U80FsehP` | google_drive | audio/wav | audio | active |
| Avinu Malkeinu_traditional_Em_Soprano.mp3 | `19pHyy-g7WN48xqh6IEtRSWpqBQCkWftP` | google_drive | audio/mpeg | audio | active |
| Ve_Imru Amen-Tenor.mp3 | `1Cw69wE2-8eUViZ6ID66nULfNVDVU_est` | google_drive | audio/mpeg | audio | active |
| Ve_Imru Amen Full Choir.mp3 | `1D08wPsT5Fk5nm-uXW9tHf50BvccX5gu3` | google_drive | audio/mpeg | audio | active |
| Unetaneh_Tokef_Full Choir.mp3 | `1DF0UOysVOpGEGkSswU3FwEvjU_lcRm5_` | google_drive | audio/mpeg | audio | active |
| Kedusha in Am Full Choir with solo.mp3 | `1D_ERo9369UkNlZGO3FLYhYPatkY2m4Jm` | google_drive | audio/mpeg | audio | active |
| Barechu_trad_Soprano.mp3 | `1DclXj1fcg3VTtf82HECzbk51-3GeowPH` | google_drive | audio/mpeg | audio | active |
| Kedusha in Am (Tenor_Bass).mp3 | `1DiSbHUzzXGAAl3je1g40Q-pEM2rR3laa` | google_drive | audio/mpeg | audio | active |
| Aleinu Shur melody (low voice).mp3 | `1DncwbDd_B0LnGRNRmBQCG6D4_7MoV1nI` | google_drive | audio/mpeg | audio | active |
| Mi Chamocha Shur Cantor Choir Descant.mp3 | `1Et48zTFQny12HjkFv25Wz7L7-wAqvZmg` | google_drive | audio/mpeg | audio | active |
| Avinu Malkeinu Janowski D minor (Tenor).mp3 | `1Exi_bsvw4nK0AUkW12bGwJ2WzZ-B5cS0` | google_drive | audio/mpeg | audio | active |
| Avinu Malkeinu Janowski D minor (Bass).mp3 | `1FGzPfLlSH3fzQtHAht3SfRoWLUFWICl1` | google_drive | audio/mpeg | audio | active |
| Niggun_Soprano.mp3 | `1FNvv9UToD9t1k4FqXhWPzb50naHZfo-T` | google_drive | audio/mpeg | audio | active |
| Kedusha in Am (Soprano).mp3 | `1FZw5QmsYPhe2hNLnAz8CWD1yN0lruOXP` | google_drive | audio/mpeg | audio | active |
| Unetaneh_Tokef_Soprano.mp3 | `1G4kvrAslYsUezK2fy696w8XUt3T-zEjR` | google_drive | audio/mpeg | audio | active |
| Avinu Malkeinu_traditional_Em_Full Choir.mp3 | `1HVCUZLeCu2_W3G3hMDwYxXd7o519rlcO` | google_drive | audio/mpeg | audio | active |
| Oseh Shalom (Dub Remix).mp3 | `1Ho4zPDwCihy2HOt7f7MuVRMMLbFMLWYR` | google_drive | audio/mpeg | audio | active |
| May The Memory Bass.mp3 | `1ITxhruZY56v3j96hnqsk7YJ32-0coLcZ` | google_drive | audio/mpeg | audio | active |
| Unetaneh_Tokef_Bass.mp3 | `1J_YSGz4C9Fmx2CDQpUJ9iC5O19uA0j8o` | google_drive | audio/mpeg | audio | active |
| May The Memory Tenor.mp3 | `1LIQvf7FQmRRKpfI1lP06PH70ef6Rn5I3` | google_drive | audio/mpeg | audio | active |
| The Great Aleinu (Alto).mp3 | `1LYIRI8GH4fA9Typust_4D98LjOWo5eSn` | google_drive | audio/mpeg | audio | active |
| Niggun_Full Choir.mp3 | `1MQBRtiDK77MOTTKR25mEZEqmclSRat1q` | google_drive | audio/mpeg | audio | active |
| Fish Jam .mp3 | `1O1pvTb9_U_1Dh9TCookPxS7AlwfMA_Nh` | google_drive | audio/mpeg | audio | active |
| Avinu Malkeinu Janowski D minor (Alto).mp3 | `1Q6yGoFDerBBWV7OYovZweFEIbzgRv--w` | google_drive | audio/mpeg | audio | active |
| Michael's B'Mitzvah Jams.mp3 | `1RV-_S-0vCgswP7VfskC6wIchaBDQFNDa` | google_drive | audio/mpeg | audio | active |
| Avinu Malkeinu_traditional_Em_Bass.mp3 | `1TRCzECDBOal5mr1SFh7JEY-r-NkhtaaW` | google_drive | audio/mpeg | audio | active |
| Veshamru .mp3 | `1VXSQUMCADACnGEitvANMLuBF3BsJa_b9` | google_drive | audio/mpeg | audio | active |
| Mizmor Shiru L'adonai .mp3 | `1VuMq83_0W8ya9SCeBaQ0vCvuFeHgGHeC` | google_drive | audio/mpeg | audio | active |
| 3 Songs Office Hours.mp3 | `1X6St0GAreLGpJIcPMdA4HJlohuFhPp5W` | google_drive | audio/mpeg | audio | active |
| The Great Aleinu Full Choir.mp3 | `1Y6ELHFu--GfuIz3FgiHitfWyjG4OZvQ0` | google_drive | audio/mpeg | audio | active |
| The Great Aleinu (Bass).mp3 | `1Z37pBaRXW45LQ551WSfMFzDHQ8jFYt0x` | google_drive | audio/mpeg | audio | active |
| CRC On Hold Klezmer.wav | `1ZuXxV8dAhfFRXaXaSk1zAbbp9yce8MwH` | google_drive | audio/wav | audio | active |
| Niggun_Alto.mp3 | `1_AGMn2Ls4Eo15tDwC4vtrGeHvu4aoe8f` | google_drive | audio/mpeg | audio | active |
| Avinu Malkeinu Janowski D minor Full Choir.mp3 | `1_Gd8degQp-_CwXhYQM_jtxqRCtjdKvTi` | google_drive | audio/mpeg | audio | active |
| Mizmor Shiru Ladonai.mp3 | `1d-aXA4WzVjKYvCxAaVyezGgzRKlXs9y_` | google_drive | audio/mpeg | audio | active |
| Avinu Malkeinu_traditional_Em_Alto.mp3 | `1dAtZlJQ_3xbvfPLTG0F31Tbntid7d01W` | google_drive | audio/mpeg | audio | active |
| Barechu_trad_Tenor.mp3 | `1dxdNC33CZDbruEYFwsyV44a4sWR0nx8x` | google_drive | audio/mpeg | audio | active |
| Avinu Malkeinu_traditional_Em_Tenor.mp3 | `1etxl5D1liZFHOAGfsReSt0gNtWXUpD_f` | google_drive | audio/mpeg | audio | active |
| Kedusha in Am (Alto).mp3 | `1g-Czee2Cm5I_k4qtDQ86M3t7-9c3pHnW` | google_drive | audio/mpeg | audio | active |
| Unetaneh_Tokef_Alto.mp3 | `1g1cnvJjQwoS9sudXMsEv-Psx7IiPjkAJ` | google_drive | audio/mpeg | audio | active |
| Lecha Dodi > Erev Shel Shoshamim : yasmin U'smol.mp3 | `1gey19JRRH6b-sPmeeR2_vbP6conu0ZK_` | google_drive | audio/mpeg | audio | active |
| May The Memory Full Choir.mp3 | `1h03XAsuq2FWWn_ZHRHvtQz1ZHfgZSi23` | google_drive | audio/mpeg | audio | active |
| Ve_Imru Amen-Alto.mp3 | `1hBW82D0waHKgB4DA53rCcd4WGV5u9LQw` | google_drive | audio/mpeg | audio | active |
| May The Memory Soprano.mp3 | `1iZJWnsukROkqmZ_uSnDFl1Z5dsRcgWDG` | google_drive | audio/mpeg | audio | active |
| Aleinu Shur melody (high voice).mp3 | `1mKr3bKOxholt8isagwFgD8lglX2YykIa` | google_drive | audio/mpeg | audio | active |
| The Great Aleinu (Tenor).mp3 | `1monkKpBnbwh6YO6FAKBIQmD4vGqzbyIZ` | google_drive | audio/mpeg | audio | active |
| Barechu_trad_Alto.mp3 | `1nAEsEgzHIU3T9Ym9kJpBxJylWWqa_vnK` | google_drive | audio/mpeg | audio | active |
| Ve_Imru Amen-Soprano.mp3 | `1odYJKS1JLzDVVVbuHRV4oIw-gAAVDqFT` | google_drive | audio/mpeg | audio | active |
| May The Memory Alto.mp3 | `1pFGvjKzoeCIj6CJuk6vFkYkUbV4I5zam` | google_drive | audio/mpeg | audio | active |
| Barechu_trad_Cantor + Choir.mp3 | `1qAWeiH9_0eeXaseL0e-dMxDDwpBvO6xx` | google_drive | audio/mpeg | audio | active |
| Unetaneh_Tokef_Tenor.mp3 | `1qTDacSD6J12oeEMg22KueDQgwMm8EeVJ` | google_drive | audio/mpeg | audio | active |
| Sim Shalom.mp3 | `1qlfMKLD6qrr98JUmoeBJHRE5I0-FsIRp` | google_drive | audio/mpeg | audio | active |
| The Great Aleinu (Soprano).mp3 | `1tRHJFJSq99c1SuWZBOJCjbLyFHhIPYWO` | google_drive | audio/mpeg | audio | active |
| Avinu Malkeinu Janowski D minor (Soprano).mp3 | `1tYtW5qo5iOuytY9GflbwCQjWerjaov4b` | google_drive | audio/mpeg | audio | active |
| Elohai Neshama .mp3 | `1vY2cfQMn1-QgtslbQZaCYc8JNZkX0g1s` | google_drive | audio/mpeg | audio | active |
| kolnidre_intro.m4a | `1wHijjyvHroSV_Z_wClVprppEpBYIUAsa` | google_drive | audio/x-m4a | audio | active |
| Lecha dodi (Nava -led).wav | `1wzz1eOblUC0tOTnJZh_JAarpeRdZ0oPq` | google_drive | audio/wav | audio | active |
| Bryn Tunes - Mi Shebarach, Sim Shalom.mp3 | `1yEIuuAPUvE0vAcM__QucJZgdJKpR0Nt2` | google_drive | audio/mpeg | audio | active |
| Yom Kippur Day Service (Daniel and Karen) Band Charts to be Printed | `14vROgFHB9FPTgTE0su4ALy8Pno0L5o9UkX4DkzMK5zk` | google_drive | application/vnd.google-apps.document | drive_folder_or_gdoc | active |
| Audio Files | `173N8yeP19xEqNcofAbj0ZOnMK9pA7bGp` | google_drive | application/vnd.google-apps.folder | drive_folder_or_gdoc | active |
| HHD | `17AVgm1u0g862bhM8WnvvL54hc3tthymc` | google_drive | application/vnd.google-apps.folder | drive_folder_or_gdoc | active |
| Sheet Music | `1BlUWuZh0eWe6BLpBYjJLpY1VJXyiISHr` | google_drive | application/vnd.google-apps.folder | drive_folder_or_gdoc | active |
| 2. Rosh  | `1DeiuwNlb8i8nwz3vUwaXdiNIICSdPgTt` | google_drive | application/vnd.google-apps.folder | drive_folder_or_gdoc | active |
| Choral Arrangements  | `1FsZhGl3bxWja_KLVAliZb2hHg88JBcw3` | google_drive | application/vnd.google-apps.folder | drive_folder_or_gdoc | active |
| Kol Nidre 2025/5786 | `1G4mI5dUgORJlwew8HnndtuORNLq89SgYXpQLYPJV12E` | google_drive | application/vnd.google-apps.document | drive_folder_or_gdoc | active |
| Rosh Day 2025/5786 | `1G90XvxjphRA3ZenORmcO1P3FDUQJQNjugwN4D5aDb4s` | google_drive | application/vnd.google-apps.document | drive_folder_or_gdoc | active |
| Erev Rosh 5786/2025 | `1HDRDxBLX7Rj41qF1LDcDAdi2cmPYOAQ96xj8IXB9GvA` | google_drive | application/vnd.google-apps.document | drive_folder_or_gdoc | active |
| Piyutim-Pizmonim | `1J4XKbecFdEJiEt-yuXWLmAXGqTi8L_Mk` | google_drive | application/vnd.google-apps.folder | drive_folder_or_gdoc | active |
| Pre-Ceremony Music | `1NTR6j9rhwHAwoZjX34AVdyymz9IvPkTz` | google_drive | application/vnd.google-apps.folder | drive_folder_or_gdoc | active |
| Shir Shabbat (Choir) | `1PL-rwuqZOnftWzBFYa4ElTWinUpLSiyo` | google_drive | application/vnd.google-apps.folder | drive_folder_or_gdoc | active |
| Shir Shabbat List | `1QvrCC8R1yvCbK5jIB-yqw-vMQX1S62It637BHwSMaX4` | google_drive | application/vnd.google-apps.document | drive_folder_or_gdoc | active |
| 4. Yom Kippur  | `1SYdDp-DbhO7e362YRZr3GQQ1pGwrdUlc` | google_drive | application/vnd.google-apps.folder | drive_folder_or_gdoc | active |
| Shabbat morning | `1URRI7OBQnlsji5zn3oMkx6IplU3qhw99` | google_drive | application/vnd.google-apps.folder | drive_folder_or_gdoc | active |
| MP3's to Jam To | `1X9l2ZE7dGrJdej9Fr3PFieVt9EE3dEYT` | google_drive | application/vnd.google-apps.folder | drive_folder_or_gdoc | active |
| Shir Shabbat Set List | `1XVmOLlmKI2ztKTsVOg2-YbkJ9_DzJA7A23gJp-s_Xu4` | google_drive | application/vnd.google-apps.spreadsheet | drive_folder_or_gdoc | active |
| Yizkor and Neila | `1ZQUvXg4McVGhlkQ9rnJM4_2pdHup9mFBDXqoHqZtAds` | google_drive | application/vnd.google-apps.document | drive_folder_or_gdoc | active |
| 5786 / 2025 Kol Nidre Alternative Service Music Flow | `1cZ0dW7ioUqQkV8m2ENr0ExEpMuYiP7ov6vy790kjbe4` | google_drive | application/vnd.google-apps.document | drive_folder_or_gdoc | active |
| Shabbat | `1ch79JH6B3rWcMnSLd9HtO4myytRHoicd` | google_drive | application/vnd.google-apps.folder | drive_folder_or_gdoc | active |
| Kabbalat Shabbat | `1fCgl4H4wIiqLK42rUkHmRYV5WzqLEOIU` | google_drive | application/vnd.google-apps.folder | drive_folder_or_gdoc | active |
| 3. Kol Nidre | `1khYYPDmj7pOn_G8yl8mTJHcYFsLH5O65` | google_drive | application/vnd.google-apps.folder | drive_folder_or_gdoc | active |
| High Holidays 2025 (Choir) | `1oqBCSHTMzCVUPvMtQNXEdg5V49mwvOYh` | google_drive | application/vnd.google-apps.folder | drive_folder_or_gdoc | active |
| CRC Music Book | `1p-iGMt8OCpCJtk0eOn0mJL3aoNPcGUaK` | google_drive | application/vnd.google-apps.folder | drive_folder_or_gdoc | active |
| Shir Shabbat Lead Sheets | `1pwmleWt7QMPuEqTrM_Az9JFj5RUMS9F4` | google_drive | application/vnd.google-apps.folder | drive_folder_or_gdoc | active |
| 1. Erev Rosh | `1tcdg8vTGcwuGX7gar1xJ0JDBdcyEi9yz` | google_drive | application/vnd.google-apps.folder | drive_folder_or_gdoc | active |
| Yom Kippur 2025/5786 | `1xTYqs7MHxm8Q69jt9nNMqNwmU3QTM7uxEkofZpxIzcE` | google_drive | application/vnd.google-apps.document | drive_folder_or_gdoc | active |
| Niggunim | `1zeTBJoffgVoqJYvjvZ6p3Tmm1JGXeOvR` | google_drive | application/vnd.google-apps.folder | drive_folder_or_gdoc | active |
| .DS_Store | `12if9gHg88ZqNMZjmLG1UH57GSriTHzqF` | google_drive | application/octet-stream | octet_stream | active |
| Bar'chu Walkdown | `upload-0594bbd4-d661-42b9-b11d-feeb3ff4cda6` | upload | application/octet-stream | octet_stream | orphaned |
| Ana B'Koach mxl | `upload-32b4845e-8593-42cf-8264-caf2d0e348da` | upload | application/octet-stream | octet_stream | orphaned |
| Bar'chu Walkdown | `upload-8cf12700-fb49-4d3c-8b96-fcadab19999f` | upload | application/octet-stream | octet_stream | duplicate |
| Shabbat morning.xlsx | `1JhWf3p0Y1wmJaVNL40XFyNqSuFCwLxIw` | google_drive | application/vnd.openxmlformats-officedocument.spreadsheetml.sheet | office_doc | active |
| Kabbalat Shabbat.xlsx | `1Sh8IiLb3n9iit1ImvlvS2SYvprbwLRRf` | google_drive | application/vnd.openxmlformats-officedocument.spreadsheetml.sheet | office_doc | active |

