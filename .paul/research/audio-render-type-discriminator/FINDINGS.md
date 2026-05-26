# Phase 0 — PDFOverlay viewer-dispatch audit (audio-render-type-discriminator)

**Lane:** `feat/audio-render-type-discriminator` · **Author:** coder-7 · **Cut from:** `034c6d82d` · **Generated:** 2026-05-26T03:00Z

## Dispatch site

`src/components/performance/PDFOverlay.tsx` L167-194 (signals) and L327-355 (branch tree).

## Signals available at dispatch time

| Signal | Field | Source | Reliability |
|---|---|---|---|
| `currentItem.type` | `'pdf'|'musicxml'|'text'|'image'|'chordpro'` | `toQueueItem` derivation | Coarse: union has NO `'audio'`, so audio always lands as `'pdf'` (queue-utils.ts L43 default). |
| `libMimeType` | `string` | `useLibraryStore.allFiles.find(f => f.id === currentItem.fileId)?.mimeType` (library_index `mimeType`) | Authoritative WHEN populated. Asymmetric by bind path per `[[project_track_mimetype_gotcha]]`: picker writes it, MCP post-2026-05-20 writes both, legacy writes nothing. |
| `track.fileName` | `string` | `SetlistTrack.fileName` | Often EMPTY for picker-bound or legacy rows (per `toQueueItem` comment L17-19: "picker never sets fileName"). |
| `track.fileId` | `string` | `SetlistTrack.fileId` | Storage uploads use `upload-{uuid}` → NO extension. Drive sources use the Drive ID → NO extension. Only post-2026-05-20 MCP / save_scraped sometimes leaves `.mp3`/`.musicxml` on the id. |
| `track.mimeType` | `string` | `SetlistTrack.mimeType` (cached) | v70-01-01 Task 4 cache; read by `toQueueItem` only, NOT by PDFOverlay's branch tree today. |

## Current branch tree (L329-353)

```
isMusicXml ← queueItem.type==='musicxml' || libMimeType.includes('xml')
isText     ← queueItem.type==='text'     || libMimeType.startsWith('text/')
isImage    ← queueItem.type==='image'    || libMimeType.startsWith('image/')
isAudio    ← libMimeType.startsWith('audio/') || /\.(mp3|wav|m4a|ogg)$/i on track.fileName OR track.fileId
default    → PDFViewer  ← THE 404 TRAP
```

## The gap (Adon Olam shape)

Legacy audio bond:
- `type:"song"` (never `"audio"` — track-type detection out of scope per dispatch).
- `fileId = "upload-XXXX-YYYY"` → no `.mp3` suffix.
- `fileName = ""` (picker never wrote it).
- `mimeType` on the track row: blank (legacy).
- `libMimeType` on the library_index row: blank (legacy write skipped it).
- `libraryRow.name = "Adon Olam.mp3"` ← THE one stable signal that survives all three legacy bind paths.

Today's dispatch reads the row's `mimeType` but NOT its `name`. Result: nothing matches `isAudio`, falls through to `PDFViewer`, which 404s because the underlying object is audio bytes.

Adjacent failure: MusicXML with `mimeType:'application/octet-stream'` (the documented weak link per `[[project_musicxml_goal]]`) — current `libMimeType.includes('xml')` won't fire, but `libraryRow.name` ending in `.musicxml`/`.xml`/`.mxl` would.

## Fix shape (Phase 1)

Extract a pure helper `resolveViewerKind(track, libraryRow)` returning
`'pdf' | 'audio' | 'text' | 'musicxml' | 'image' | 'chordpro' | 'unknown'`.

Priority (highest authority first):
1. `libraryRow.mimeType` (authoritative when populated).
2. `libraryRow.name` extension parse (catches octet-stream MusicXML + legacy-bound audio).
3. `track.mimeType` (v70-01-01 cached value).
4. `track.fileName` extension parse.
5. `track.fileId` extension parse.
6. `unknown` (explicit fallback UI, no silent PDFViewer 404).

PDFOverlay branch tree collapses to `kind === 'audio'` / `'text'` / `'musicxml'` / `'image'` / `'pdf'` / `'unknown'`. The `unknown` branch renders an explicit "Can't render this file type yet" message inside the existing `SectionErrorBoundary` instead of a blank screen or a 404.

## Out-of-scope (per dispatch, hard boundaries)

- `AudioViewer.tsx` / `TextScoreViewer.tsx` / `PDFViewer.tsx` / `SmartScoreViewer.tsx` internals.
- Backfilling missing `mimeType` on `library_index` rows.
- `toQueueItem`'s FileType union (no `'audio'` slot added; the dispatch consumes a string kind from the helper, not a queue type).
- `bridge/`, `monitor/`, `firestore.rules`, `vercel.json`, env, MCP, SmartTransposer.
