# Recordings on charts: design

Daniel, 2026-11-01, from a brainstorm in chat. Status: draft for Daniel's approval. Rulings in chat 2026-11-01: Claude does the cutting ("you do it"); one take per chart, swappable later; never in Perform; recordings public; B'nai Mitzvah clips fine.

## Intent

The band and the leaders should be able to hear a song quickly, to know *which version* it is, and,
if they want, to learn it by ear. The source is the congregation's own service recordings, which
mostly exist as whole services, not yet cut into songs.

Two moments (Daniel's words):
- **Preparation**: a band member getting ready for a service.
- **Editing a setlist, occasionally**: "listen to a version and confirm that's the one you want."

And one hard line: **never during performance.**

## Goals

1. Every chart that has been played at a recorded service has one recording a person can play in
   one tap.
2. The recordings are made from the full-service files by Claude, not by hand (Daniel: "you do it").
   Daniel spot-checks afterwards; he does not approve each clip first.
3. A leader (David, Daniel) can later swap which take a chart shows, in the app or through Claude.
4. New services can be added the same way later: drop the files in the Dropbox folder, run the
   ingest, spot-check.

## Non-goals

- Learning tools: looping, slowing down, pitch shift, A–B repeat. One plain player.
- Recording inside the app; capturing audio during a service.
- Syncing audio to the chart (following along bar by bar).
- Playing audio inside Claude. Claude can say a recording exists and give a link; it can't play it.

## Anti-goals (failure even if it "works")

- **Any audio in Perform mode.** No play control, no player and no audio element under `/perform`,
  enforced in code and covered by a test, not just hidden by CSS. A stray tap during a service must
  never make sound.
- A clip attached to the wrong chart and shown as if it were right. When the matcher isn't sure, the
  clip is held back for review, not published.
- Speech published as song clips (sermons, speeches, Torah and haftarah reading). Only segments
  that match a chart are kept. A child singing or leading a song that matches a chart is kept like
  any other take (Daniel, 2026-11-01: "it's fine").
- One tenant's recordings listed under another tenant's songs. Each congregation's charts show only
  its own recordings.
- Showing several takes per chart by default. Musicians see one (Daniel: "they only need to see 1").

## What exists already (build on it)

- `recordings/{id}` collection: `orgId, songId, title, fileName, mimeType, storagePath, notes,
  createdAt, createdBy` (`src/types/models.ts` `Recording`). The Firestore rules let members read
  and band leaders write, scoped to the tenant (`firestore.rules`, `match /recordings`).
- Upload: `src/app/api/recordings/upload/route.ts` (25 MB cap, audio mimes only), storage helper
  `uploadRecordingToStorage` (`src/lib/firebase-storage.ts`), files at `recordings/{id}.{ext}`.
- Serving: `src/app/api/recordings/file/[id]/route.ts`. It supports byte ranges, so seeking
  works. Today it requires a sign-in but doesn't check the recording's `orgId`, and it caches
  publicly. **Daniel, 2026-11-01: "anyone can listen. we don't care."** Recordings are public. The
  route drops its sign-in check (the rate limit stays), and public caching is fine. That closes the
  builder check's security question by ruling, not by a fix.
- Client: `subscribeRecordingsForSong` (`src/lib/recordings/recordings-client.ts`), and the setlist
  editor's ♫ cell `RecordingCell.tsx` plus `RecordingBindPopover.tsx`, which binds a recording to a
  setlist row.

A recording belongs to a **song** (`songId`), so it follows the song into every setlist. In this
code a row's `songId` is the chart's file id (`src/lib/library/shared-usage.ts`), and that is the
level Daniel means by "associated with charts": the version of the song. Decisions (Claude's call):
- A clip attaches to the `songId` the setlist row used on the service date.
- When a chart is replaced or swapped (the lineage that moves rows to a new `songId`, see
  `chart-lineage.emulator.test.ts`), its recordings move with it, so they are never orphaned.
- Two chart files of the same tune stay two songs; nothing groups them in this version.
- No per-row choice of take. `RecordingBindPopover` today lists, plays and uploads a song's
  recordings; it doesn't bind rows. The featured take per song is the whole model, and no new
  field goes on setlist rows (Overlays reads them).

## Sources

Two Dropbox shared folders (links in the brainstorm; store them in the ingest config, not in code):
- **SERVICES**: dated subfolders, e.g. `1.10_SAT MORNING`, `2.28_TYSON BAR MITZVAH`,
  `6.07.25_BEN WORTHINGTON`, `8.16 - 8.17`, and a `SHIR SHABBAT` subfolder.
- **SHIR SHABBATS**: `1.23`, `11.14`, `26.3.27`, `4.24`, `6.19`.

Each folder holds mixes as `…_V1`, `…_V2` in both `.mp3` (about 180 MB per service) and `.wav`
(about 1.3 GB). Some folders already hold single songs (e.g. `MI SHEBEIRACH_V1.mp3`). Folder names
carry the date, in several formats and sometimes without a year.

## How it works

### 1. Ingest (a script run on Daniel's PC, by Claude)

The files are too big for a serverless function, and the PC already has ffmpeg 9 and
`faster_whisper`. The ingest is a local script in the repo (e.g. `scripts/recordings/`), not a
Vercel route. For each service folder:

1. **Fetch** the latest mix (highest `V`) as MP3. Don't download the WAVs. There's no Dropbox
   sync on the PC, so the script reads each file's own shared link from the shared folder
   (rendered in a headless browser, as the 2026-11-01 recon did) and downloads that file alone.
   No Dropbox token is needed. If Dropbox blocks this, fall back to Daniel syncing the two folders
   locally (Claude's call).
2. **Date**: parse the folder name into a date (and year, inferred from the file's modified date
   when the name has none). Find the setlist for that date and service in Firestore: the expected
   songs and their order. Several setlists can share a date (Friday and Saturday, or variants); pick
   by service type, and if it's still ambiguous, hold the whole service for review. If a service has
   **no setlist**, match segments against the whole CRC library at lower confidence: a clip is
   published only when the title or first line matches clearly; otherwise it's held (Claude's call).
3. **Cut**: find candidate song boundaries (silence and energy gaps; speech-to-text to tell speech
   from singing and to catch sung titles and first lines). Align the candidates to the expected song
   order.
4. **Match**: each kept segment gets a song and a confidence. Use what's available: position in
   the expected order, the transcript against the song's title and first line, duration. Segments
   that match no song (sermon, Torah, speeches, a child's own reading) are dropped.
5. **Encode**: each clip is a mono or stereo MP3 at about 128 kbps with a short fade in and out,
   well under the 25 MB cap.
6. **Write**: upload through the existing storage path and create `recordings` docs with
   `songId`, a title such as "Shir Shabbat, Nov 14, 2025", and provenance: source file, service
   date, start and end seconds in the source, mix version, matcher confidence. Already-cut single
   files (like `MI SHEBEIRACH_V1.mp3`) skip the cutting and go straight to matching.
7. **Idempotent**: re-running a folder never makes duplicates. Key each clip by source file and cut
   times.

Low-confidence segments are **held**: kept with a `held` status, not shown to musicians, and listed
for Daniel's spot-check. Since recordings are public, held and hidden takes aren't gated; they just aren't listed or played
anywhere in the app (Claude's call).

### 2. One take per chart

Each song shows one **featured** recording. When the ingest adds takes, it picks the default: the
best match, then the cleanest cut, then the most recent. The other takes stay stored and hidden. A
band leader can change the featured take in the app (from the ♫ in the setlist editor) or through
Claude.

### 3. Where people listen

- **Setlist editor** (`/setlists/[id]`): the ♫ on a row plays that song's featured recording in a
  small player that stays out of the way. A row whose song has none shows no ♫. Binding a row to a
  specific recording (`RecordingBindPopover`) keeps working.
- **Listen page** (new, public like `/perform`, but outside it): the same setlist, quiet. Every song in
  order with its one recording and a play button, and no chart viewer. It's reached from a "Listen"
  link on the setlist list (`/setlists`) and on the setlist head. This is the band's preparation
  surface; Perform links nowhere to it.
- **Library**: a chart's row or detail plays its song's featured recording.
- **One at a time**: starting one recording stops any other.
- **Perform**: none of the above. Nothing under `/perform` imports the player.

### 4. Through Claude (MCP)

- Read: a song's recordings and its featured one, with a link to play it. `get_song` and
  `read_back_setlist` mention when a song has a recording.
- Write (band leaders): set the featured take; hide a wrong clip; reattach a clip to the right
  song. Each follows the existing F-05 pattern (`dryRun` first, `force` where the repo uses it).
- An ingest report Daniel can ask for: per service, how many clips were made, matched, held or
  dropped, and the held ones with the reason.

### 5. The spot-check

After each ingest run, Daniel gets one short list (file or artifact): every clip made, its song, its
confidence, a play link, and the held ones first. He says what's wrong in plain words, and Claude
fixes it with the write tools.

## Constraints

- Two tenants. Recordings carry `orgId`; the ingest writes only CRC. Rules and reads stay
  tenant-scoped.
- Row order is the author's (R11-b): attaching recordings never touches setlist rows.
- No liturgical text in the repo. Transcripts used for matching are working data. Don't commit
  them or store them in Firestore beyond a short matched first line, if one is needed for review.
- Storage: about 15 services × about 25 songs × about 4 MB, roughly 1.5 GB in Firebase Storage. A
  trivial cost; no new service.
- Perform mode stays bulletproof: no new imports into the Perform bundle.

## Left to the builder

- The exact cut and match algorithm and its thresholds, tuned on two or three services and checked
  by ear against the setlist.
- The data shape for featured, held and provenance (fields on `recordings`, or a pointer on
  `songs`).
- The player component's look, within the Option B design rules.
- The Listen page's route name (outside `/perform`).
- MCP tool names and shapes, following the server's existing patterns.
