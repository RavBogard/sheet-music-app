# Setlist memory, plan 1 — history and metadata

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Read `docs/planning/AGENT-BRIEF.md` first.

**Goal:** Claude can ask "how have we done this song before?" and read the whole setlist archive in one call, and the library carries a setting name, instrument-part grouping and more written keys.

**Architecture:** A pure `src/lib/history/` module classifies setlists (service type, rabbi slot, special, instrument part) and builds per-song history from plain data. One loader reads tenant-scoped setlists, tracks and library rows from Firestore for two new read tools. Library parsing helpers compute `setting`, `part` and `partGroup` at every `library_index` write and through an F-05 back-fill. A second F-05 back-fill writes high-confidence AI-suggested keys.

**Tech Stack:** Next.js App Router, TypeScript, Firestore (firebase-admin), MCP SDK (`server.registerTool` + zod), vitest, Firebase emulator tests.

**Spec:** `docs/planning/2026-10-30-setlist-memory/DESIGN.md` (§5.7 history access, §5.8 data cleanup). Roadmap: `ROADMAP.md` beside it.

## Global Constraints

- Every query is org-scoped; CRC and Brothers Lazaroff never see each other's history or library rows.
- Never propose a setting: these tools report what was done; they rank nothing and recommend nothing.
- No stored setlist or track field changes in this plan. Classification happens at read time.
- Library `key` is the chart's *written* key. A back-fill may write it only from `aiSuggestion.suggested_key` with `aiSuggestion.confidence >= 0.9`, never from setlist usage.
- A field a person set (`enrichmentStatus: 'human_curated'`, or `settingSource: 'human'`) is never overwritten by a back-fill.
- Back-fills are F-05: `dryRun` defaults to true and returns the full report; a real run needs `dryRun: false, force: true`. Both are ops-surface tools (`OPS_TOOLS`).
- New read tools go in `READ_TOOLS`; they live on the authoring surface.
- Rabbi slot keys are exactly `daniel_karen` and `randy` (`CRC_RABBI_SLOTS`, `src/lib/templates/service-types.ts`). Service type keys are the `SERVICE_TYPE_CATALOG` keys in the same file.

## Review Focus

1. **The other tenant's data.** A Brothers Lazaroff bearer calling `get_song_history` or `export_setlists` sees only BL setlists and BL library rows. Pinned in Task 3 (emulator).
2. **Rows bound to a chart that's gone** (79 such rows today). History still returns the row, with `chartInLibrary: false` and the track's own `fileName` as `chartName`. It must not drop the row or throw. Pinned in Task 2.
3. **Spelling variants of one song.** "Sh'ma", "Shema", "Shema pdf", "Bar'chu" and "Barchu" find each other. "Sim Shalom" and "Shalom Rav" must not. Pinned in Task 2.
4. **Instrument-part copies of a service** ("Shir Shabbat — Oct 2, 2026 · Bb") don't count as extra performances. Pinned in Task 2.
5. **Messy setlist metadata.** HTML-escaped rabbi text (`Daniel Bogard &amp; Karen Bogard`), a rabbi field naming both slots ("Karen and Randy"), a null `templateType`, and a Shir Shabbat setlist typed `friday_night` all classify correctly or to null, never to the wrong slot. Pinned in Task 1.

---

### Task 1: Service classification

**Files:**
- Create: `src/lib/history/classify.ts`
- Test: `src/lib/history/__tests__/classify.test.ts`

**Interfaces:**
- Consumes: `SERVICE_TYPE_CATALOG`, `CRC_RABBI_SLOTS` from `src/lib/templates/service-types.ts`.
- Produces:
  ```ts
  export type RabbiSlotKey = "daniel_karen" | "randy"
  export interface ServiceClass {
      serviceType: string | null   // a SERVICE_TYPE_CATALOG key, or null
      rabbiSlot: RabbiSlotKey | null
      special: boolean
      part: string | null          // instrument label of a per-instrument copy, else null
  }
  export function classifyService(s: { name: string; templateType?: string | null; rabbi?: string | null }): ServiceClass
  ```

- [ ] **Step 1: Write the failing tests.** In `classify.test.ts`, use `it.each` over these exact cases (input → expected fields):

  | name | templateType | rabbi | serviceType | rabbiSlot | special | part |
  |---|---|---|---|---|---|---|
  | `Shir Shabbat — Nov 6, 2026 (w/ Duo Andalus)` | `friday_night` | null | `shir_shabbat` | null | true | null |
  | `Shir Shabbat — Oct 2, 2026 · Bb` | `shir-shabbat` | null | `shir_shabbat` | null | false | `Bb` |
  | `Shir Shabbat — Oct 2, 2026 · Piano/Keys` | `shir_shabbat` | null | `shir_shabbat` | null | false | `Piano/Keys` |
  | `Kabbalat Shabbat — May 22, 2026` | `kabbalat-shabbat` | `Daniel` | `friday_night` | `daniel_karen` | false | null |
  | `Shabbat Morning — Parashat Ha'azinu — September 19` | `shabbat_morning` | `Randy Fleisher` | `shabbat_morning` | `randy` | false | null |
  | `Ami Chesed Bar Mitzvah — Oct 24` | null | `Daniel Bogard &amp; Karen Bogard (Rabbi Randy — Torah service)` | `bnei_mitzvah_saturday` | `daniel_karen` | false | null |
  | `Eliana Levine Bat Mitzvah — October 10` | `bnei_mitzvah_saturday` | `Daniel Bogard` | `bnei_mitzvah_saturday` | `daniel_karen` | false | null |
  | `Yom Kippur Morning — September 21` | `yom-kippur-morning` | `Karen / Randy` | `yom_kippur_morning` | null | true | null |
  | `Erev Sukkot with Nefesh Mountain — September 25` | `friday_night` | null | `friday_night` | null | true | null |
  | `David Sterneck Memorial Bar Mitzvah — Oct 31` | `bnei_mitzvah_saturday` | `Randy Fleisher` | `bnei_mitzvah_saturday` | `randy` | true | null |
  | `Camp Sabra Campfire — June 7` | `campfire` | null | null | null | true | null |
  | `Bar Mitzvah — Chase — May 16 (4pm Havdallah)` | `bnei_mitzvah_havdallah` | null | `havdalah_bnei_mitzvah` | null | false | null |

- [ ] **Step 2: Run** `npx vitest run src/lib/history/__tests__/classify.test.ts`. Expected: FAIL (module not found).

- [ ] **Step 3: Implement `classifyService`** with these rules, in order:
  - `part`: the name ends in ` · <label>`, where `<label>` is one of `Bb, Eb, C, Bass Clef, Vocals, Guitar, Piano/Keys`.
  - `serviceType`:
    1. If the name matches `/shir shabbat/i`, use `shir_shabbat` (the name wins over a `friday_night` type).
    2. Otherwise map `templateType`: `kabbalat-shabbat` → `friday_night`; `shir-shabbat` → `shir_shabbat`; `bnei_mitzvah_havdallah` → `havdalah_bnei_mitzvah`; a kebab-case holiday type is snake-cased when it's a catalog key; `rosh-hashanah-day` → `rosh_hashanah_morning`; `erev-rosh-hashanah` → `rosh_hashanah_evening`; `kol-nidre` and `kol-nidre-alt` → `yom_kippur_kol_nidre`; `neilah` → `yom_kippur_afternoon`. Any other non-catalog value → null.
    3. If there's still no type, fall back on the name: `/\b(bar|bat|b'?nai|b'?nei|bnei) mitzvah\b/i` → `bnei_mitzvah_saturday`; `/shabbat morning/i` → `shabbat_morning`; `/kabbalat|friday/i` → `friday_night`.
  - `rabbiSlot`:
    1. HTML-decode `rabbi` and drop any parenthesised part.
    2. Lowercase it, then test each slot's `match` words as whole words.
    3. Exactly one slot matches → that slot. Zero or two → null.
  - `special`: true when any of these holds:
    - the catalog category is `holiday`,
    - the name matches `/\b(with|w\/)\s/i` or `/memorial/i`,
    - `templateType` is `campfire`, `concert` or `other`,
    - `serviceType` is null.

    A `part` copy takes `special` from these same rules applied to its name.

- [ ] **Step 4: Run** the same test. Expected: PASS.

- [ ] **Step 5: Commit** `Classify setlists by service type, rabbi slot, special and instrument part`.

### Task 2: Song history from plain data

**Files:**
- Create: `src/lib/history/song-history.ts`
- Test: `src/lib/history/__tests__/song-history.test.ts`

**Interfaces:**
- Consumes: `classifyService` (Task 1); `bareStem` from `src/lib/mcp/title-specificity.ts`.
- Produces:
  ```ts
  export interface HistoryTrack { id: string; order: number; type: string; title: string; fileId: string | null; fileName: string | null; key: string | null; leadMusician: string | null; notes: string | null }
  export interface HistorySetlist { id: string; name: string; eventDate: string | null; templateType: string | null; rabbi: string | null; book: string | null; ownerName: string | null; isTest: boolean; tracks: HistoryTrack[] }
  export interface LibraryLite { fileId: string; name: string; key: string | null; setting: string | null; partGroup: string | null }
  export interface SongHistoryQuery { title?: string; fileId?: string; serviceType?: string; rabbiSlot?: RabbiSlotKey; includeSpecial?: boolean /* default true */; limit?: number /* default 25, max 100 */ }
  export interface SongHistoryEntry { setlistId: string; setlistName: string; eventDate: string; serviceType: string | null; rabbiSlot: RabbiSlotKey | null; special: boolean; trackId: string; title: string; fileId: string | null; chartName: string | null; chartInLibrary: boolean; setting: string | null; playedKey: string | null; writtenKey: string | null; leadMusician: string | null; notes: string | null; author: string | null }
  export interface ChartTally { fileId: string | null; chartName: string | null; count: number; keys: Record<string, number> /* played key, "" for none */; lastUsed: string }
  export interface SongHistoryResult { entries: SongHistoryEntry[]; total: number; byChart: ChartTally[] /* count desc */ }
  export function historyStem(title: string): string
  export function songSkeleton(stem: string): string
  export function buildSongHistory(setlists: HistorySetlist[], library: Map<string, LibraryLite>, q: SongHistoryQuery): SongHistoryResult
  ```

- [ ] **Step 1: Write the failing tests.**
  - `historyStem`:
    - `historyStem("Shema pdf") === historyStem("Shema")`
  - `songSkeleton(historyStem(x))` is the same for every x in `["Sh'ma", "Shema", "Shema pdf"]`, the same for every x in `["Bar'chu", "Barchu", "Barchu (Friedman)"]`, and the same for `["Adonai S'fatai (trad)", "Adonai s_fatai (chant)"]`.
  - `songSkeleton(historyStem("Sim Shalom")) !== songSkeleton(historyStem("Shalom Rav"))`
  - Fixture: 6 setlists covering a regular Randy Shabbat morning ×3, a `· Bb` copy of one of them, a special memorial service, an undated copy, and an `isTest` setlist.
    - `buildSongHistory(…, {title: "Mi Chamocha"})` returns entries only from dated, non-test, non-part setlists, newest first.
    - `total` equals the entries count before `limit`.
    - `byChart[0]` is the chart used most, with its played-key counts.
  - With `{includeSpecial: false}` the memorial's row is gone.
  - With `{serviceType: "shabbat_morning", rabbiSlot: "randy"}` only Randy Shabbat morning rows remain.
  - A track whose `fileId` isn't in `library` comes back with `chartInLibrary: false` and `chartName` equal to the track's `fileName`.
  - A track with `fileId: null` has `chartName: null`.
  - `{fileId: X}` matches by fileId regardless of title. It also matches tracks whose chart shares X's `partGroup`.
  - Header, prayer, reading and note rows never appear. Only `type === "song"` does.

- [ ] **Step 2: Run** `npx vitest run src/lib/history/__tests__/song-history.test.ts`. Expected: FAIL.

- [ ] **Step 3: Implement.**
  - `historyStem` = `bareStem` with one trailing standalone `pdf` token removed.
  - `songSkeleton` removes apostrophes. Then, in each word, it drops every vowel (a e i o u) after the word's first letter and collapses doubled letters. Finally it joins the words with no space. Examples: `"shema" → "shm"`, `"adonai s fatai" → "adnsft"`.
  - A title query matches a track when the stems are equal or the skeletons are equal.
  - When both `title` and `fileId` are given, a match on either counts.
  - Sort entries by `eventDate` descending, compute `byChart` over all matches, then apply `limit`.

- [ ] **Step 4: Run** the same test. Expected: PASS.

- [ ] **Step 5: Commit** `Build per-song history across setlists`.

### Task 3: Loader and the two read tools

**Files:**
- Create: `src/lib/history/load.ts`
- Create: `src/lib/mcp/tools/history.ts`
- Modify: `src/lib/mcp/tools/index.ts`. Register both tools next to `search_setlists` (~line 704), following its pattern.
- Modify: `src/lib/mcp/tool-access.ts`. Add both names to `READ_TOOLS` under "setlists, templates, books".
- Test: `src/lib/mcp/tools/__tests__/history.test.ts` (mocks, in the style of `setlists.test.ts`)
- Test: `src/lib/mcp/__tests__/history-tenant.emulator.test.ts`

**Interfaces:**
- Consumes: Tasks 1–2; `getAllSetlists({org, limit, orderBy: "eventDate"})` and `MAX_SETLIST_FETCH` from `src/lib/server-setlists.ts`; `getTracksForSetlist(db, id, {})` from `src/lib/server-tracks.ts`; `library_index` docs.
- Produces:
  ```ts
  // load.ts
  export async function loadHistorySetlists(org: OrgId, opts?: { from?: string; to?: string }): Promise<{ setlists: HistorySetlist[]; truncated: boolean }>
  export async function loadLibraryLite(org: OrgId, fileIds: string[]): Promise<Map<string, LibraryLite>>
  // history.ts
  export async function getSongHistoryTool(uid: string, args: SongHistoryQuery, org?: OrgId): Promise<({ ok: true; truncated: boolean } & SongHistoryResult) | RichErrorEnvelope>
  export interface ExportSetlistsArgs { from?: string; to?: string; includeParts?: boolean /* default false */; includeUndated?: boolean /* default false */ }
  export async function exportSetlistsTool(uid: string, args: ExportSetlistsArgs, org?: OrgId): Promise<{ ok: true; count: number; truncated: boolean; setlists: ExportedSetlist[] } | RichErrorEnvelope>
  export interface ExportedSetlist { id: string; name: string; eventDate: string | null; serviceType: string | null; rabbiSlot: RabbiSlotKey | null; special: boolean; part: string | null; book: string | null; ownerName: string | null; tracks: { order: number; type: string; title: string; fileId: string | null; chartName: string | null; key: string | null; leadMusician: string | null; notes: string | null }[] }
  ```
  MCP names: `get_song_history` and `export_setlists`.

- [ ] **Step 1: Write the failing unit tests** (mock `getAllSetlists`, `getTracksForSetlist` and `getFirestore`):
  - `getSongHistoryTool("u", {})` returns `richError` code `invalid_argument`.
  - With 3 setlists, `getSongHistoryTool` returns the `buildSongHistory` result plus `ok: true`.
  - `truncated` is true when `getAllSetlists` returned exactly `MAX_SETLIST_FETCH` rows.
  - `exportSetlistsTool` with `{from: "2026-09-01"}` drops earlier setlists. It also drops part copies unless `includeParts: true`, and undated setlists unless `includeUndated: true`.
  - Loading a library row reads each `library_index` doc id once, batched (`getAll`), even when it's referenced by many tracks.
- [ ] **Step 2: Write the failing emulator test.**
  - Seed a CRC setlist and a BL setlist, each with a song titled "Mi Chamocha", plus one library row per org.
  - `getSongHistoryTool(uid, {title: "Mi Chamocha"}, "crc")` returns only the CRC setlist id.
  - The same call with the BL org returns only the BL one.
  - `exportSetlistsTool` behaves the same way.
- [ ] **Step 3: Run both test files.** Expected: FAIL.
- [ ] **Step 4: Implement.**
  - `loadHistorySetlists` reads tracks with at most 8 setlists in flight.
  - Tool descriptions say what each tool is for:
    - `get_song_history`: "how have we done this song before; use while building a setlist, before choosing a chart or key."
    - `export_setlists`: "every setlist with its tracks in one call, for review and analysis."
  - Register both tools with zod schemas that mirror the args interfaces.
- [ ] **Step 5: Run both test files, plus `src/lib/mcp/__tests__/tool-access.test.ts`.** Expected: PASS.
- [ ] **Step 6: Commit** `Add get_song_history and export_setlists read tools`.

### Task 4: Library setting and instrument parts

**Files:**
- Create: `src/lib/library/setting-part.ts`
- Test: `src/lib/library/__tests__/setting-part.test.ts`
- Modify: every `library_index` write that stores `stem` (`src/lib/library-upload.ts`, `src/lib/library/recompute-index-name-fields.ts`; grep `stem:` to confirm there are no others) so it also stores `setting`, `part` and `partGroup`, unless `settingSource === 'human'`.
- Modify: `src/lib/mcp/tools/index.ts` `editLibraryEntryInputSchema` (~line 2614). Add `setting: z.string().nullable().optional()` and `part: z.string().nullable().optional()`. An edit to either sets `settingSource: 'human'` and recomputes `partGroup` from the title.
- Modify: the row mappers in `src/lib/mcp/tools/library.ts` used by `search_library` and `list_library` (near the `siblingsInCatalog` attach, ~line 421) so they return `setting`, `part` and `partGroup`.
- Create: `src/lib/mcp/tools/backfill-setting-parts.ts`; register `backfill_library_setting_parts`; add it to `OPS_TOOLS` and to the write list in `tool-access.ts`.
- Test: `src/lib/mcp/tools/__tests__/backfill-setting-parts.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export function parseSetting(title: string): string | null
  export function parsePart(title: string): { baseTitle: string; part: string } | null
  export function partGroupFor(title: string): string   // normalizeStem(parsePart(title)?.baseTitle ?? title)
  export async function backfillLibrarySettingParts(uid: string, args: { dryRun?: boolean; force?: boolean }, org?: OrgId): Promise<{ ok: true; dryRun: boolean; scanned: number; changed: { fileId: string; name: string; setting: string | null; part: string | null; partGroup: string }[]; skippedHuman: number } | RichErrorEnvelope>
  ```

- [ ] **Step 1: Write the failing tests** for `parseSetting`:

  | title | expected |
  |---|---|
  | `Barchu (Friedman)` | `Friedman` |
  | `Sim Shalom (Silver, Dm)` | `Silver` |
  | `Adonai S'fatai (trad)` | `trad` |
  | `Mi chamocha (Moshav) morning` | `Moshav` |
  | `Eitz chayim - Weisenberg` | `Weisenberg` |
  | `V'Shamru (Old Skool)` | `Old Skool` |
  | `Adonai S'fatai (Em)` | null |
  | `Wonderwall (band format)` | null |
  | `Mi chamocha (6-8)` | `6-8` |
  | `Shema (major)` | `major` |
  | `B'sefer Chayim - Full Score` | null |
  | `Hashkivenu` | null |

  `parsePart`:
  - `Barchu (Walkdown) Bb` → `{baseTitle: "Barchu (Walkdown)", part: "Bb"}`
  - `Shema (Major) Bass` → part `Bass`
  - `L'cha Dodi (Simpler) Clarinet in Bb` → part `Clarinet in Bb`
  - `L'cha Dodi Tenor Saxophone` → part `Tenor Saxophone`
  - `2. Porter Haus - C Lead` → part `C Lead`
  - `Barchu Walkdown` → null
  - `Shake It Off` → null

  `partGroupFor("Barchu (Walkdown) Eb") === partGroupFor("Barchu (Walkdown)")`

  Back-fill:
  - The dry run reports changes and writes nothing.
  - A real run without `force` returns `force_required`.
  - Rows with `settingSource: 'human'` are counted in `skippedHuman` and left untouched.
  - The run only reads the caller's org.
- [ ] **Step 2: Run** both test files. Expected: FAIL.
- [ ] **Step 3: Implement.**
  - `parseSetting` takes the first parenthesised clarifier, or the hyphen-composer suffix, minus a trailing `, <key>`.
  - It returns null when what's left is a key (`/^[A-G][#b]?m?$/`) or one of these format words (case-insensitive): `band format`, `chords`, `band chart`, `lyrics`, `lead sheet`, `leadsheet`, `full score`, `score`, `draft`, `simpler`, `compact`, `licensed scan`.
  - `parsePart` matches a trailing instrument label from this list: `Bb`, `Eb`, `C`, `Bass Clef`, `Bass`, `C Lead`, `Alto Saxophone`, `Tenor Saxophone`, `Soprano Saxophone`, `Clarinet in Bb`, `Trumpet in Bb`, `Flute`, `Trombone`, `Piano`, `Vocals`, `Guitar`.
- [ ] **Step 4: Run** both tests, plus `src/lib/library/__tests__/index-name-fields-compute-parity.test.ts`. Expected: PASS. If the parity test mirrors the write-time fields, extend the mirror at `scripts/lib/index-name-fields-compute.mjs`.
- [ ] **Step 5: Commit** `Record each chart's setting and instrument-part group`.

### Task 5: Back-fill written keys from the chart's own AI reading

**Files:**
- Create: `src/lib/mcp/tools/backfill-library-keys.ts`; register `backfill_library_keys`; add it to `OPS_TOOLS` and to the write list.
- Test: `src/lib/mcp/tools/__tests__/backfill-library-keys.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export async function backfillLibraryKeys(uid: string, args: { dryRun?: boolean; force?: boolean; minConfidence?: number /* default 0.9, floor 0.9 */ }, org?: OrgId): Promise<{ ok: true; dryRun: boolean; scanned: number; changed: { fileId: string; name: string; key: string; confidence: number }[]; skipped: { human: number; lowConfidence: number; noSuggestion: number; hasKey: number } } | RichErrorEnvelope>
  ```

- [ ] **Step 1: Write the failing tests.**
  - A row with an empty `key`, `aiSuggestion.suggested_key: "Dm"` and `aiSuggestion.confidence: 0.95` is in `changed`.
  - With confidence 0.85 it is counted in `lowConfidence`.
  - A `human_curated` row is counted in `human`.
  - A row that already has a key is counted in `hasKey`.
  - `minConfidence: 0.5` is clamped to 0.9.
  - A real run writes `key` and `keySource: 'ai_backfill'` and nothing else.
  - The F-05 `force_required` refusal fires.
  - Only the caller's org is read.
  - The tool is admin + band_leader only (`forbidden_role` for a musician).
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement**, following the auth and F-05 shape of an existing back-fill in `src/lib/mcp/tools/backfill-heal-metadata.ts`.
- [ ] **Step 4: Run** this test, plus `tool-access.test.ts`. Expected: PASS.
- [ ] **Step 5: Commit** `Back-fill written keys from high-confidence chart readings`.

### Task 6: Ship and run

- [ ] **Step 1:** Run `npx tsc --noEmit` and `SKIP_ENV_VALIDATION=1 npx next build --webpack`. Expected: both clean.
- [ ] **Step 2:** Push the branch and open one PR for Tasks 1–5. The lead watches CI and merges when green (`bash ~/.claude/scripts/merge-if-green.sh <pr> <repo-dir>`). Production deploys from `master`.
- [ ] **Step 3: Prod check (lead).** Run `get_song_history {title: "Adonai S'fatai", serviceType: "shabbat_morning"}` over MCP.
  - Expected: `byChart[0].chartName` is `Adonai S'fatai (trad)`, with played keys Em and Dm both counted.
  - `export_setlists {}` returns about 60 setlists in one call.
- [ ] **Step 4: Back-fills (lead).**
  1. Run `backfill_library_setting_parts` and `backfill_library_keys` as dry runs.
  2. Save both reports under `docs/planning/2026-10-30-setlist-memory/backfill-reports/`.
  3. Spot-check 10 rows of each against the chart titles.
  4. Then run each with `dryRun: false, force: true`.
  5. Record the counts in `RETURN-1.md`.
- [ ] **Step 5:** Write `docs/planning/2026-10-30-setlist-memory/RETURN-1.md`: what shipped, the prod check results, the back-fill counts, and anything plan 2 needs to know. Commit it.
