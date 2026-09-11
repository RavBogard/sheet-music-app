# Batch chart intake

Adding many charts to the library at once — from a folder on your computer, from
a Google Drive folder, or from a terminal.

The rule the whole design turns on: **Claude never carries the bytes.** Every
path below moves a chart file either from your machine straight to storage over
a signed URL, or from Google Drive straight to our server. A chart file never
passes through the conversation, so a 40-file batch costs the same in context as
a one-line answer.

---

## What to say to Claude

**Files on your computer:**

> open the chart drop-zone

A small panel appears next to the conversation. Drop files on it (or click to
pick them). It uploads them itself, seals the batch, and shows each file's
outcome as the importer works. When it says it is done, ask Claude what landed:

> what came in on that batch?

**Files already in Google Drive:**

> import the Drive folder https://drive.google.com/drive/folders/1AbC...

Nothing renders — Claude pulls the folder server-side and reports. Google Docs
and Office files are converted to PDF on the way in; subfolders are skipped
unless you say "including subfolders". Ask for a preview first if you want one:

> show me what's in that folder first, don't import it yet

Either way you can set the destination and tags in the same breath:

> open the chart drop-zone, file these under core, tag them shabbat-morning

Collections are `core`, `supplemental`, `uploads` (the default) and `nava`.
The three curated catalogs are admin / band-leader only.

---

## What happens

1. **A batch opens.** One Firestore document (`upload_batches/{batchId}`)
   holding one row per file. It expires 24 h after it is created if it is never
   committed.
2. **Upload URLs are minted**, up to 50 files per request, 25 MB per file. A
   file whose extension is not a chart type comes back *rejected* here, before
   any bytes move.
3. **The bytes go straight to storage** — the drop-zone panel (or the CLI) PUTs
   each file to its own signed URL. If the browser blocks that PUT the panel
   falls back to sending the file to the server in ≤ 3 MB slices, automatically;
   you will only notice it being slower.
4. **The batch is committed.** Every row's uploaded size is checked against what
   was declared; a missing or truncated upload is recorded as `failed` rather
   than imported. Then the batch is queued for the background importer.
5. **The importer runs each row** through the same pipeline a single-chart
   upload uses — dedupe check, text extraction, library row, enrichment. Each
   row ends as `imported`, `parked`, `failed` or `skipped`.

---

## Parked items

A row is **parked**, not imported, when it looks like something already in the
library: either the same filename (`duplicate_exact`) or a close title match
(`duplicate_similar`). Nothing is written for a parked row — it is waiting on
you, and it waits indefinitely.

Ask Claude:

> anything parked?

It lists them with the chart each one matched. Then say what you want, per item
or in a sweep:

- **"import it anyway"** — a genuinely different arrangement of the same song.
  The new chart is created alongside the existing one.
- **"skip it"** — a true duplicate. Nothing is written; the staged bytes are
  dropped.
- **"that's the chart for <title>"** — bind: no new chart, the existing library
  row is the answer.

Parked items survive the conversation. `list_parked_uploads` finds everything
still waiting, across batches, so a new chat can pick up where an old one
stopped.

---

## CLI courier

`C:\Users\dsbog\CentralReform.live\sheet-music-app\scripts\upload-batch.mjs`

The same pipeline from a terminal, for when the files are on disk and there is
no iframe (Claude Code on Windows, or by hand).

```
node scripts/upload-batch.mjs <path>... \
  [--collection core|supplemental|uploads|nava] \
  [--bearer TOKEN] \
  [--endpoint https://centralreform.live/api/mcp] \
  [--dry-run]
```

- A `<path>` is a file or a directory. A directory expands **one level** — no
  recursion, and dotfiles are skipped.
- `--dry-run` prints the plan (which files, resolved to which type, and which
  are rejected and why) and makes **no network calls**. Always worth running
  first:

  ```
  node scripts/upload-batch.mjs --dry-run e2e/fixtures
  ```

  ```
  plan: 2 accepted, 1 rejected
  file             status    detail
  chart-one.pdf    accepted  application/pdf (1219 bytes)
  chart-two.pdf    accepted  application/pdf (1219 bytes)
  unsupported.rtf  rejected  unsupported_type
  ```

- Bearer resolution, in order: `--bearer`, `MCP_BEARER` in the environment,
  `SUPERVISOR_PROD_BEARER` in
  `C:\Users\dsbog\CentralReform.live\sheet-music-app\.env.local`.
- A real run opens the batch, uploads three files at a time, commits, then polls
  every 3 s until the importer is finished and prints a file/status/detail table.
- **Exit code 0 only when nothing failed.** Parked rows are not failures — they
  are printed and the run still exits 0, because a parked row is a question, not
  an error.

---

## Environment

| Variable | What it does |
| --- | --- |
| `MCP_PUBLIC_URL` | Our public MCP URL, e.g. `https://centralreform.live/api/mcp`. Gives the drop-zone iframe a **stable** `ui.domain`, which is what lets the storage bucket's CORS rule and the Apps sandbox agree on an origin. Without it the drop zone still works, but the domain hint is omitted. |
| `INNGEST_EVENT_KEY`, `INNGEST_SIGNING_KEY` | The background importer. Already configured — batch intake reuses the existing Inngest app, it does not add a new one. |
| `CRON_SECRET` | Already configured. Guards `/api/cron/import-batches-resume` like every other cron. |
| `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY`, `FIREBASE_STORAGE_BUCKET` | Only needed locally, by `scripts/set-storage-cors.mjs`. |

### Storage CORS

The browser will only PUT to a signed storage URL if the bucket says so.

`C:\Users\dsbog\CentralReform.live\sheet-music-app\scripts\set-storage-cors.mjs`

```
node scripts/set-storage-cors.mjs           # dry run — prints current + desired CORS, writes nothing
node scripts/set-storage-cors.mjs --apply   # merges the desired entry in and writes it
```

The desired entry allows `PUT`/`GET`/`HEAD` from any origin, exposing
`Content-Type`, `Content-Length`, `x-goog-resumable` and
`x-goog-content-length-range`. The wildcard origin is safe here because the
signed URL is itself the credential: it is good for one object path for 15
minutes, and a browser that does not already hold it cannot do anything with a
permissive CORS rule.

### Firestore

Both of these ship with the code but are **not** deployed by a Vercel push:

```
firebase deploy --only firestore:rules,firestore:indexes --project crcmusiccharts
```

- Rules: `upload_batches/{batchId}` is `read, write: if false` — server-only.
- Indexes: two composite indexes on `upload_batches`, one for
  `list_parked_uploads`, one for the resume cron.

---

## Troubleshooting

**The drop-zone panel never renders.** Claude Desktop only renders app iframes
with Developer Mode on: Settings → Developer → enable Developer Mode, then
Developer Tools for the console. If it still will not render, fall back to the
CLI courier above, or to `import_drive_folder` after putting the files in Drive
— both take the identical path through the server.

**Uploads sit at 0 %, or the console shows a blocked PUT.** The panel detects
this and switches to sending the file to the server in slices on its own; it
needs no input from you. If it is happening every time, the bucket's CORS rule
is missing — run `scripts/set-storage-cors.mjs` (dry run first) and apply it.

**A batch is stuck on `committed`.** It was sealed but the queue did not take
it. `/api/cron/import-batches-resume` sweeps every 10 minutes and re-sends
anything still `committed` after 5 minutes, so it resolves itself within ~10
minutes. Nothing is lost in the meantime — the batch document is the record.
Saying "commit that batch again" is also safe: a sealed batch just re-reports
its counts.

**`list_parked_uploads` fails with `FAILED_PRECONDITION`.** The Firestore
composite indexes are not deployed on the project. Run the
`firebase deploy --only firestore:indexes` line above.

**A row says `failed: bytes_missing` or `size_mismatch`.** The upload did not
finish, or the file changed on disk between planning and uploading. Re-run that
file; nothing was written for it.

---

## What deliberately did NOT change

The single-chart tools are untouched and still work exactly as they did. Batch
intake is an addition, not a replacement:

- `upload_chart` — one chart, bytes inline. Still the simplest path for a single
  small file.
- `request_chart_upload_url` / `finalize_chart_upload` — the original two-step
  signed-URL upload for one chart.
- `begin_chunked_chart_upload` / `append_chart_upload_chunk` /
  `commit_chunked_chart_upload` — the original chunked path for one large chart.
- `import_chart_from_drive` — one Drive file by id. `import_drive_folder` is a
  folder-level sibling of it, not a rewrite; it calls the same import logic.
- `save_scraped_chart`, `scrape_chart_from_url` — the chord-chart text path,
  entirely separate.

Nothing about existing library rows, dedupe thresholds (0.85 strict, `force`
per call), or the enrichment pipeline changed. A chart imported through a batch
is indistinguishable from one imported by hand.

---

## Files

| Path |
| --- |
| `C:\Users\dsbog\CentralReform.live\sheet-music-app\docs\BATCH-INTAKE.md` |
| `C:\Users\dsbog\CentralReform.live\sheet-music-app\scripts\upload-batch.mjs` |
| `C:\Users\dsbog\CentralReform.live\sheet-music-app\scripts\set-storage-cors.mjs` |
| `C:\Users\dsbog\CentralReform.live\sheet-music-app\src\lib\mcp\tools\batch-intake.ts` |
| `C:\Users\dsbog\CentralReform.live\sheet-music-app\src\lib\intake\` |
| `C:\Users\dsbog\CentralReform.live\sheet-music-app\src\mcp-apps\README.md` |
| `C:\Users\dsbog\CentralReform.live\sheet-music-app\src\app\api\cron\import-batches-resume\route.ts` |
| `C:\Users\dsbog\CentralReform.live\sheet-music-app\firestore.rules` |
| `C:\Users\dsbog\CentralReform.live\sheet-music-app\firestore.indexes.json` |
