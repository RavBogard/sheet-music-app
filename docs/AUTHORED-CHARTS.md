# Authored charts: Claude writes it, the server files it

How a chart built *with* Claude in a chat gets into the library and onto the
setlist row without anyone touching a file.

---

## What it feels like

1. You and Claude work out a song: chords, words, form. Claude drafts the chart.
2. Claude shows you the **actual rendered page as an image in the chat**. You
   say what to change; Claude redraws and shows it again. Nothing is saved.
3. You say *"put it in"* or *"bond it to row 14"*. The chart is in the library
   and on the iPads. Claude tells you the fileId.
4. Later: *"move the G one syllable earlier."* Claude redraws, shows you, and on
   your word files it as a revision. Every setlist row that had the old
   version now has the new one; the old one is archived. To you it is the same
   chart, updated.

Works in Claude Desktop, claude.ai, mobile, and Cowork, for anyone whose account
may upload charts (admins, band leaders, musicians, or `canUpload`).

## What Claude calls

One tool, `create_chart`, with an explicit `mode`:

| mode | does | writes |
| --- | --- | --- |
| `preview` | renders the chart, returns the page as a PNG **image content block** + page count | nothing |
| `commit` | renders to PDF, files through the normal upload pipeline (dedupe, text extraction, library row, signals), stores the source on the row, bonds to `bondTo` if given, supersedes `revisionOf` if given | library + setlist rows |

Claude never commits until the user says so. The tool description says this
in so many words, and `mode` has no default.

### Source forms

| `source.kind` | when | server does |
| --- | --- | --- |
| `chart` | the normal chord chart from a chat | builds the house-style HTML (a TS port of `tools/crc_chart/chart_lib.py`) and prints it |
| `html` | Claude authored the house-style HTML itself (Cowork) | prints it as-is |
| `musicxml` | notation / lead sheet | stores it; the app's score viewer renders and transposes (no image preview in v1) |
| `text` | plain monospace chord sheet | stores it like `save_scraped_chart` |

Lyric lines in the `chart` form are ChordPro: `[Cm]Modeh ani l'fa[G]necha`.
The chord goes immediately before the syllable it sounds on. Chords are the
actual sounding chords, never capo shapes. Use ♭ and ♯.

## Revisions and caching

A revision mints a **new fileId**, moves every live bond
(`find_setlists_referencing_chart` → `swap_chart`), and marks the old row
`archived` with `canonicalFileId` pointing at the new one. Same-id byte
overwrite was rejected on purpose: chart bytes sit behind a 7-day CDN cache, a
1-day browser cache, and an offline IndexedDB store keyed by fileId — an
overwrite would show stale on iPads. A new id defeats every layer.

Only the chart's author, an admin, or a band leader may revise a chart.

## Behind the scenes

- **Renderer:** `@sparticuz/chromium` + `puppeteer-core` in its own function,
  `POST /api/render/chart` (`maxDuration 60`). Same engine and same CSS as the
  Cowork Python renderer; DejaVu Sans is bundled under
  `src/lib/chart-render/fonts/` and inlined as `@font-face`, so the typeface
  never varies with the host. `GET /api/render/chart?selftest=1` (bearer
  `RENDER_SECRET ?? CRON_SECRET`) is the deploy-time proof. Production
  self-test 2026-09-11: 200, one page, 3.9 s cold.
- **Client:** `src/lib/chart-render/render-client.ts` calls the route over
  `INTAKE_INTERNAL_BASE_URL` (must be the custom domain — SSO deployment
  protection intercepts `*.vercel.app`).
- **Tool:** `src/lib/mcp/tools/authored-chart.ts` (logic, injectable renderer),
  `register-authored-chart.ts` (schemas + image content block).
- **Row fields:** `authoredBy`, `authoredAt`, `authoredKind`, `authoredSource`
  (the exact structured source, so the chart can be re-rendered or transposed
  later), `revisionOf`, `pageCount`.
- **Limits:** source ≤ 512 KB; preview PNG is 2× scale by default; render call
  times out at 55 s.

## Relationship to the other intake paths

| you have | use |
| --- | --- |
| a chart Claude just wrote | `create_chart` (this doc) |
| a file on a device | the **Chart Inbox** Drive folder — `CHART-INBOX.md` |
| files already in Drive | `import_drive_folder` |
