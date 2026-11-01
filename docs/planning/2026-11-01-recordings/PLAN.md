# Recordings on charts: implementation plan

> **For agentic workers:** builders follow `docs/planning/AGENT-BRIEF.md` (setup, commits, checks,
> report shape). Each builder gets one PR's tasks below plus `DESIGN.md` beside this file.

**Goal:** Each chart can be heard in one tap (in the editor, the library and a new public Listen
page, never in Perform). The clips are cut by Claude from the full-service Dropbox recordings.

**Architecture:** The existing `recordings` collection gains `status`, `featured`, `source` and
`ingestKey`. Server helpers pick each song's one featured take. The public Listen page renders on
the server with the admin SDK, as `/perform` does. The ingest is a local pipeline on Daniel's PC:
a TS export of the setlists, a Python cutter (ffmpeg + faster_whisper on the RTX 4070), and a TS
publisher. It never runs on Vercel.

**Tech stack:** Next.js App Router, Firestore and Storage (firebase-admin 13), vitest, Python 3.12
(numpy, scipy, faster_whisper 1.2.1, pytest 9), ffmpeg 9, `npx jiti` for TS scripts, Playwright
(for listing the Dropbox folders).

**Spec:** `docs/planning/2026-11-01-recordings/DESIGN.md`

## Global constraints

- Recordings are public (Daniel 2026-11-01). Each tenant *lists* only its own recordings
  (`orgId`).
- **No audio under `/perform`**: no import of `src/components/recordings/**` or
  `src/lib/recordings/**`, no `<audio`, no `new Audio(`. A test enforces it.
- One featured take per song: the musician sees one.
- Row order is the author's: nothing here writes setlist rows. No new fields on tracks (Overlays
  reads them).
- No liturgical text in the repo or Firestore. Transcripts stay in the gitignored work dir.
- Every MCP write follows F-05: `dryRun` returns the full report; a real write needs no `force`
  unless it reattaches across songs.
- The ingest writes CRC only (`orgId: "crc"`). Prod credentials: a temporary ADC file in the
  scratchpad, deleted after each run. Never commit any credential.
- Work dir: `.recordings-work/` (gitignored), holding audio, transcripts, manifests and reports.

## Review focus

1. **A service whose setlist has variants on the same date** (Friday and Shabbat morning, or
   "+3 versions"): the matcher picks by service type or holds the whole service. It never
   silently mixes two setlists. Test: `test_ambiguous_setlist_holds_service`.
2. **A re-run of the same folder** creates no duplicate docs or files. Test:
   `publish skips rows whose ingestKey exists`.
3. **A song with only held takes** shows no ♫ anywhere and isn't featured. Test:
   `pickFeatured ignores held and hidden`.
4. **A chart replaced after its clip was attached**: the recording follows to the new fileId.
   Test: the emulator case in Task 2.
5. **Two players on one page**: starting one pauses the other. Test: `now-playing pauses the
   previous element`.

---

## PR A: data, serving, lineage, MCP (Tasks 1, 2, 5)

### Task 1: Recording fields, featured helpers, public serving

**Files:**
- Modify: `src/types/models.ts` (`Recording`)
- Create: `src/lib/recordings/featured.ts` (pure), `src/lib/recordings/featured-server.ts` (admin)
- Create: `src/app/api/recordings/[id]/feature/route.ts`
- Modify: `src/app/api/recordings/file/[id]/route.ts` (drop the sign-in gate; keep the rate limit
  and byte ranges)
- Modify: `firestore.indexes.json` (`recordings`: `orgId ASC, songId ASC, featured DESC`, only if
  a query needs it)
- Test: `src/lib/recordings/__tests__/featured.test.ts`,
  `src/app/api/recordings/file/[id]/route.test.ts`,
  `src/app/api/recordings/[id]/feature/route.test.ts`

**Interfaces (produced):**
```ts
export type RecordingStatus = 'live' | 'held' | 'hidden'          // absent ⇒ 'live'
export interface RecordingSource { file: string; serviceDate: string /* YYYY-MM-DD */; startSec: number;
  endSec: number; mix?: string; confidence: number; setlistId?: string; folder?: string }
// Recording gains: status?: RecordingStatus; featured?: boolean; source?: RecordingSource; ingestKey?: string
export function isPlayable(r: Recording): boolean                         // status absent or 'live'
export function pickFeatured(recs: Recording[]): Recording | null        // featured.ts
export interface FeaturedRecording { id: string; title: string; url: string }
export async function getFeaturedForSongs(db: Firestore, orgId: string, songIds: string[]): Promise<Record<string, FeaturedRecording>>
export async function setFeaturedRecording(db: Firestore, orgId: string, recordingId: string): Promise<{ songId: string; unset: string[] }>
```
`pickFeatured` order: playable only. An explicitly `featured` take wins, then higher
`source.confidence`, then newer `createdAt`. Legacy uploads with no source rank as confidence 1.
`getFeaturedForSongs` queries `in` chunks of 30. `setFeaturedRecording` runs in one transaction:
it sets `featured: true` on the target, sets `featured: false` on the song's other takes, and
refuses a recording from another org or a non-playable one (`richError`).

- [ ] Step 1: tests:
  - `pickFeatured ignores held and hidden`;
  - `explicit featured wins over confidence`;
  - `confidence then newest`;
  - `legacy upload (no source) is playable and ranks as confidence 1`;
  - file route: `serves a recording with no session (200, Accept-Ranges)` and `404 for unknown id`;
  - feature route: `band leader of the recording's org sets featured`, `musician gets 403`,
    `other-org leader gets 404`.
- [ ] Step 2: run `npx vitest run src/lib/recordings src/app/api/recordings` and confirm the new
  tests fail.
- [ ] Step 3: implement. The feature route reuses the repo's API handler and role helpers
  (`createApiHandler`, `getTenantAccess`; band leader or admin of the recording's `orgId`).
- [ ] Step 4: tests pass; `npx tsc --noEmit` is clean.
- [ ] Step 5: commit `Recordings: featured take, public serving, set-featured route`.

### Task 2: Recordings follow a revised chart

**Files:** modify `src/lib/library/lineage.ts` `applyRevision` (steps 2–4 are best-effort; add
"recordings on `previous.id` in this org move to `newFileId`", which warns on failure and never
refuses). Test: a new case in `src/lib/library/__tests__/chart-lineage.emulator.test.ts`.

- [ ] Step 1: emulator test `a revision moves the old chart's recordings to the new fileId (same org
  only)`. Seed a CRC recording and a Brothers Lazaroff recording on the same old id. After
  `applyRevision`, the CRC one has `songId === newFileId` and the BL one is untouched. The report's
  `warnings` is empty.
- [ ] Step 2: implement a batched update inside the existing best-effort block, after the
  standing choices move.
- [ ] Step 3: `npm run test:emulator -- chart-lineage` (or the repo's emulator command per the brief)
  passes.
- [ ] Step 4: commit `Library: recordings follow a revised chart`.

### Task 5: MCP tools

**Files:** create `src/lib/mcp/tools/recordings.ts`; register it in `src/lib/mcp/tools/index.ts`
next to the part-preset tools; update the golden fixtures
`src/lib/mcp/__tests__/fixtures/p6-tool-lists-before.json` and
`p4-authoring-tools-before.json` (insert sorted; see how #59 did it). Small additions to `get_song`
and `read_back_setlist`: a `recording` field `{id,title,url}` or `null` on each song or row
(featured only).

**Interfaces:**
```ts
listRecordingsTool(uid, args: { songId?: string; setlistId?: string; serviceDate?: string;
  status?: RecordingStatus | 'all'; limit?: number }, org): Promise<{ recordings: Array<{ id; songId; songTitle;
  title; status; featured; source?; url }>; counts: { live; held; hidden } }>
updateRecordingTool(uid, args: { recordingId: string; featured?: true; status?: 'live' | 'hidden';
  songId?: string; dryRun?: boolean; force?: boolean }, org): Promise<{ before; after; applied: boolean }>
```
`url` is absolute: `https://<org host>/api/recordings/file/<id>`, using the host helper the other
tools use. `songId` reattachment requires `force: true` and moves `featured` off. The tools are
band-leader or admin for writes and member for reads, gated through `tool-access.ts` like their
neighbours. Held takes are listed first when `status` is `held` or `all`, which makes this
Daniel's spot-check list.

- [ ] Step 1: tests in `src/lib/mcp/tools/__tests__/recordings.test.ts`:
  - `list by setlistId returns each song's takes, featured first`;
  - `dryRun reports without writing`;
  - `reattach without force refuses`;
  - `other org's recording is not found`;
  - `hidden take can be set live again`.
- [ ] Step 2: implement, register, update the fixtures, and add the `recording` field to
  get_song and read_back_setlist (with a test asserting the field is present).
- [ ] Step 3: `npx vitest run src/lib/mcp` passes.
- [ ] Step 4: commit `MCP: list_recordings and update_recording; songs and readback show the featured
  take`.

PR A checks: typecheck, the changed tests, the MCP goldens, and
`SKIP_ENV_VALIDATION=1 npx next build --webpack` (new route files).

---

## PR B: the player, editor, library, and Listen page (Tasks 3, 4), after PR A merges

### Task 3: The player, used in the editor and the library

**Files:**
- Create: `src/lib/recordings/now-playing.ts`, exporting
  `claimPlayback(el: HTMLAudioElement): void` (pauses the previously claimed element) and
  `releasePlayback(el)`.
- Create: `src/components/recordings/RecordingPlayer.tsx`, a small bar with play/pause, a scrubber
  and the take title. Props: `{ recordingId: string; title: string; compact?: boolean }`. It uses a
  native `<audio preload="none">` and claims playback on play. Option B design rules: ink chrome,
  44px targets.
- Create: `src/lib/recordings/featured-client.ts`, exporting
  `subscribeFeaturedBySong(orgId, cb: (map: Record<string, Recording>) => void): () => void`. It
  lists the org's recordings once (members can list) and maps each songId through `pickFeatured`.
- Modify: `src/components/setlist/grid/RecordingBindPopover.tsx`. The featured take sits on top
  in a `RecordingPlayer`; other playable takes are under "Other takes" (collapsed); leaders get
  "Show this take" (POST `/api/recordings/[id]/feature`). Upload stays.
- Modify: `src/components/setlist/grid/cells/RecordingCell.tsx` and `MobileRowCard.tsx`, so
  `hasRecordings` comes from `subscribeFeaturedBySong` (no ♫ when the song has none playable).
- Modify: `src/components/library/LibraryFileRow.tsx`, adding a ♫ play button when the row's
  fileId has a featured take. It opens a compact `RecordingPlayer` inline.
- Tests: `now-playing.test.ts` (`now-playing pauses the previous element`);
  `RecordingBindPopover.test.tsx` (`featured take shown first; held takes not shown; leader sees
  Show this take`); `LibraryFileRow` (`no ♫ without a featured take`).

- [ ] Steps: write the tests, see them fail, implement, see them pass, then commit
  `Recordings: one player, the editor's ♫ and the library`.

### Task 4: The Listen page and the never-in-Perform guard

**Files:**
- Create: `src/app/listen/[id]/page.tsx` (server; loads the setlist and tracks like
  `src/app/perform/setlist/[id]/initial-frame.ts`, then `getFeaturedForSongs(db,
  setlist.orgId, songIds)`) and `ListenClient.tsx`. It shows the setlist name and date, then every
  row in the author's order: section headings as headings, and each song row with its title and a
  `RecordingPlayer`, or "No recording yet" in muted text. No chart viewer, no edit controls.
- Modify: `src/proxy.ts`, adding `'/listen'` to `publicPrefixes`, plus the proxy tests
  (`src/__tests__/proxy-auth.test.ts`, the `mt-p3` goldens) for the new prefix.
- Modify: `src/components/setlist/SetlistCards.tsx` (a "Listen" item in each card's menu and a
  small "Listen" link on upcoming cards) and `src/components/setlist/grid/SetlistGridTopBar.tsx`
  (new optional prop `listenHref?: string`, an icon button with the label "Listen", beside
  Perform). Nothing under `/perform` links to `/listen`.
- Create: `src/__tests__/perform-no-audio.test.ts`. It walks the static import graph from every
  file under `src/app/perform/**` (resolving `@/` and relative specifiers to files under `src/`)
  and fails if any reachable file is under `src/components/recordings/` or `src/lib/recordings/`,
  or contains `<audio` or `new Audio(`. Assertions: `perform graph reaches no recordings module`
  and `perform graph has no audio element`, plus one positive control: `the walker does reach
  src/app/perform/setlist/[id]/SetlistPerformClient.tsx`.
- Tests: `src/app/listen/[id]/__tests__/ListenClient.test.tsx` (`rows in author order; songs
  without a take say No recording yet; sections render as headings`).
- i18n: new strings in `src/i18n/en/*.json` and `he` (the repo's pseudo-locale tests run).

- [ ] Steps: tests first (the guard test passes today; keep it green after adding the player),
  implement, then run `npx vitest run src/__tests__/perform-no-audio.test.ts src/app/listen
  src/__tests__/proxy-auth.test.ts`, and run
  `SKIP_ENV_VALIDATION=1 npx next build --webpack`. Commit
  `Listen page for each setlist; Perform stays silent (guard test)`.

Before merging PR B: phone and iPad screenshots of the editor ♫, the library ♫ and the Listen
page, sent to Daniel (the visual-change rule from the #60 redo).

---

## PR C: the ingest pipeline (Task 6), run by the lead, can start now in parallel with PR A

### Task 6: Fetch, cut, match, publish, report

**Files (all under `scripts/recordings/`, with tests in `scripts/recordings/tests/`):**
- `export_catalog.ts` (`npx jiti`, admin) writes `.recordings-work/catalog.json`:
  `{ setlists: [{ id, name, eventDate, templateType, tracks: [{ order, title, type, songId }] }],
  songs: [{ songId, title }] }`, for CRC only, with non-deleted setlists from 2025-01-01 on.
- `fetch_dropbox.mjs` (Playwright) takes the two shared-folder URLs from
  `.recordings-work/sources.json` and writes `.recordings-work/inventory.json`:
  `[{ folder, files: [{ name, size, modified, url }] }]`. Then it downloads, per folder, the
  highest-`V` `.mp3` only (or every `.mp3` when the folder holds single songs), into
  `.recordings-work/src/<folder>/`. It's resumable and skips existing files with the same size.
- `services.py`:
  - `parse_folder_date(name: str, modified: date) -> date | None` handles `1.10_SAT MORNING`,
    `6.07.25_BEN WORTHINGTON`, `26.3.27_SHIR SHABBAT` (yy.m.d), `8.16 - 8.17` (first day) and
    `6.19`. When the name has no year, the year is the latest that is ≤ the file's modified date.
  - `match_setlist(day: date, kind_hint: str, catalog) -> Setlist | None | 'ambiguous'`.
    `kind_hint` comes from the folder name (`SHIR SHABBAT`, `SAT MORNING`, a person's name, which
    means B'nai Mitzvah).
- `cut.py`: `cut_service(mp3: Path, setlist: Setlist | None, songs) -> list[Segment]`. Steps:
  1. Decode to 16 kHz mono.
  2. Run faster_whisper (`large-v3`, CUDA, `word_timestamps=True`, `vad_filter=False`) to get the
     text and a speech-or-singing guess per stretch.
  3. Run ffmpeg `silencedetect` (−35 dB, ≥1.2 s) for the gaps.
  4. Build candidate blocks between gaps and merge blocks shorter than 25 s into their neighbour.
  5. Align the blocks to the setlist's song rows (types `song`/absent) in author order, with
     dynamic programming. Score = fuzzy match of the transcript against the song title (rapidfuzz
     if installed, else difflib) + duration plausibility (60–480 s) + an order bonus. Unmatched
     blocks are dropped.
  6. With no setlist: score each block against every CRC song title; only a score ≥ 0.85 is kept.

  `Segment = { songId, title, startSec, endSec, confidence, reason }`, with `confidence` in 0–1.
  Status is `live` when confidence ≥ 0.70, otherwise `held`. A source file under 10 minutes
  (a folder of single songs, e.g. `MI SHEBEIRACH_V1.mp3`) isn't cut: it's one block, matched by its
  file name and transcript. A whole service with an
  `'ambiguous'` setlist puts every segment in `held` with reason `ambiguous setlist`.
- `encode.py`: `encode_clip(src, start, end, out)` runs ffmpeg with `-ss/-to`, 128 kbps MP3, and
  a 0.4 s fade in and out.
- `publish.ts` (`npx jiti`, admin) reads `.recordings-work/manifest.json`. For each row:
  - `ingestKey = sha1(folder|file|startSec|endSec|songId)`; skip it if a doc with that key exists;
  - upload to `recordings/<newId>.mp3` with `contentType audio/mpeg`;
  - write the doc `{ orgId:'crc', songId, title: '<Service label>, <Mon D, YYYY>', status,
    featured:false, source, ingestKey, mimeType:'audio/mpeg', fileName, createdAt, createdBy:'ingest' }`.

  Then, for each touched song with no explicitly featured take, set `featured` on the
  `pickFeatured` result (imported from `src/lib/recordings/featured.ts`, which comes from PR A;
  until PR A merges, run publish with `--no-feature`). It has a `--dry-run` that writes nothing
  and prints the plan.
- `report.py` writes `.recordings-work/report-<date>.md` and an HTML spot-check page. Per service:
  the setlist matched, clips live, held and dropped, with the held ones first; each clip has its
  song, confidence, reason and a local `<audio>` for listening before publishing.
- Tests (pytest):
  - `test_parse_folder_date` (all five folder-name shapes above);
  - `test_match_setlist_picks_by_kind`;
  - `test_ambiguous_setlist_holds_service`;
  - `test_align_respects_order` (a synthetic transcript plus gaps aligns to a 4-song setlist);
  - `test_no_setlist_requires_high_score`.

  Plus a vitest `publish skips rows whose ingestKey exists` against the emulator or a mocked
  Firestore.

**Execution order:**
1. Export the catalog and fetch the inventory.
2. Run the pilot on three services: one Shir Shabbat, one Saturday morning, one B'nai Mitzvah.
3. Send Daniel the spot-check page with the clips before anything is published.
4. Tune the thresholds from what he hears.
5. Publish the pilot, then the rest, one report per batch.
6. Log every threshold choice in this folder's STATE.md.

---

## Order and owners

- **Now, in parallel:**
  - PR A: one builder (Opus: data access, serving, MCP), in its own worktree.
  - Task 6 pilot: the lead, steps 1–3 (cutting and the spot-check page, no publishing).
- **After PR A merges:**
  - PR B: one builder (Sonnet), in its own worktree.
  - The Task 6 publish of the pilot.
- **After PR B merges:** the full ingest, the spot-check, done.
- **Reviews:** an adversarial Opus review on PR A (public serving, cross-tenant listing, F-05
  writes) and on PR B (the Perform guard, the public Listen page). One fix round each.
