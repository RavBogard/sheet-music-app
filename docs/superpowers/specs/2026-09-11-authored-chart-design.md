# Authored charts: Claude writes, the server renders, files, and bonds

**Date:** 2026-09-11. **Ratified by Daniel** (chat, 2026-09-11): principle
accepted, "only when I say so" for filing, revisions overwrite the same chart,
must work for music directors in their own Claude. GATE: proceeded to build on
"Yes, build it"; rendering risk proven first.

## The problem this solves

When Daniel (or a music director) builds a chart *with* Claude in a Claude
Desktop, claude.ai, or Cowork chat, Claude must be able to put that chart in
the library and on the setlist row **on its own** — no drop zone, no file on
anyone's device, no Drive, nothing to click.

A plain chat cannot move a file's bytes to the server. What Claude *can* send is
what it wrote. So the server builds the chart from Claude's content.

## Two steps, one tool

`create_chart` (MCP), `mode: "preview" | "commit"`.

1. **preview** — renders the chart and returns the page as a PNG **image
   content block** (the user sees the real rendering in the chat) plus the
   page count. Nothing is written.
2. **commit** — renders the same content to PDF, files it in the library
   through `processChartUpload` (dedupe, extraction, `library_index` + `songs`,
   `library_signals`), stores the authored source on the row, optionally bonds
   it to a setlist row (`bondTo: {setlistId, trackId}` → `swapChart`), and
   returns `fileId`.

Claude never calls commit until the user says so (tool description + agent
guide say this in so many words; the mode is explicit, never defaulted).

## Content forms

| `source.kind` | What Claude sends | Server does |
| --- | --- | --- |
| `html` | The house-style chart HTML (the `chart_lib.py` template: `.hd/.progrow/.stanza/.u > .c`) | Headless Chromium prints it to Letter PDF; fonts pinned to DejaVu Sans (bundled, inlined as `@font-face`) |
| `chart` | Structured house-style chart: title, key/meter, subtitle, progression boxes, sections of ChordPro lines (`[Cm]Modeh [G]ani`), caption, note | Server builds the same HTML `chart_lib.py` builds, then as above. Zero layout judgment lives on the server; it is a transliteration of the Python template. |
| `musicxml` | MusicXML text | Stored as `application/vnd.recordare.musicxml+xml`; the app's OSMD renderer + transpose already handle it. Preview = PNG of OSMD render is out of scope for v1 (returns metadata only). |
| `text` | Plain chord chart text | Same as `save_scraped_chart` (kept for compatibility) |

The `html` form is what Claude produces today in Cowork; `chart` is the
ergonomic form for plain chat. Both render through the identical engine as the
Cowork Python renderer (headless Chromium, DejaVu Sans), so the output matches
what Daniel has already approved.

## Revisions

`revisionOf: <fileId>` on commit. The chart is **one identity to the user**
(bonds follow), but under the hood a revision mints a **new fileId**, re-bonds
every live setlist row that referenced the old one (`findSetlistsReferencingChart`
→ `swapChart`), and marks the old row `archived` with `supersededBy`. Same-id
byte overwrite was rejected because chart bytes are cached for 7 days at the
CDN (`s-maxage=604800`), 1 day in the browser, and indefinitely in the offline
IndexedDB store keyed by fileId — an overwrite would show stale on iPads. A new
id defeats every layer.

## Rendering engine (the risk, proven first)

`@sparticuz/chromium` + `puppeteer-core` in a dedicated route
`POST /api/render/chart` (`maxDuration 60`, own function so the ~65 MB binary is
not bundled into `/api/mcp`). Secret-gated (`RENDER_SECRET ?? CRON_SECRET`),
called internally by the MCP tool over `INTAKE_INTERNAL_BASE_URL` exactly like
the intake executor. `GET ?selftest=1` renders a sample and returns PNG — that
is the acceptance probe for the spike. Fallback if Vercel cannot host it: a
hand-drawn pdf-lib renderer (rejected for now: it would drift from the look).

## Permissions

Same as every upload tool: `isUploadAllowed`, `curatedCatalogGate`, `upload`
rate tier with trusted-leader bypass. Revision of a chart you did not author
requires admin or band_leader.

## Out of scope (v1)

Preview images for MusicXML; server-side transposition of authored charts
(the stored `authoredSource` makes it possible later); per-org render styles.
