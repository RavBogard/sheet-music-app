# HANDOFF → Code (centralreform.live): "as performed" beside the plan

From: Cowork sitting with Daniel, 2026-09-14 (`RULINGS-INTEGRATION-2026-09-14.md` #7).
Depends on: Overlays `GET /api/history` + `history_reader` credential (`crc-overlays-vercel/docs/planning/2026-09-14-integration/HANDOFF-CODE-CUE-LOG-2026-09-14.md`). Build the reconcile against a fixture until that lands.

## The ruling

After a service, .live can show what actually happened next to what was planned. The **plan is never overwritten**. An "as performed" version sits beside it; Daniel or David can promote it with one tap, which creates a new setlist version (the existing `version` field) and leaves the planned version in history.

## Build

**W1 — Pull.** A new server action `reconcile_service({setlistId})` (MCP + button on the setlist) fetches Overlays history for `[eventDate start − 30 min, + 4 h]`, holding the `history_reader` token as a sensitive env var (same discipline as `CRC_LIVE_READ_TOKEN` on the Overlays side: never printed, never chatted).

**W2 — Match.** For each history row with a `unitId`/`momentId`/`(book, folio)`, find the setlist row it corresponds to: by `momentId` once `moments.json` is consumed (L2), else by `liturgyRef.book + folio`, else by title through the existing `cueSearchScore`-style fold. Produce a diff, in service order:
- **performed as planned** — row present, cue fired in order;
- **skipped** — planned row, no cue fired between its neighbours;
- **added (audible)** — cue fired with no planned row — create a proposed `prayer`/`song` row with `liturgyRef` filled from the history row;
- **reordered** — planned row fired out of sequence;
- **untracked** — planned rows that never produce a graphic (band-only songs, headers) are not marked skipped; they inherit "performed" if bracketed by fired neighbours.
Songs without graphics are the common case at CRC; say so in the UI rather than showing red.

**W3 — Present.** `preview_publish`-style staged view: the plan on the left, the performed sequence on the right, differences flagged, nothing committed. **Promote** creates version n+1 named "<name> (as performed)" — the plan version stays. Also emit per-row `performedAt` on the promoted version so "recently sung" ranking (L4, later) can read real dates instead of plan dates.

**W4 — Chapters, cheap.** From the same rows, offer a copy-able chapter list `mm:ss  Title` relative to the first cue (or `stream.startsAt` from `today.json`), with a configurable offset field defaulting to 0 s. Daniel pastes it into the recording's description. No YouTube API.

## Don'ts

Nothing here fires anything or touches the live relay. No cue titles or text are stored in .live beyond what the setlist already has. Rows describing custom graphics/names panels (all-null identity) are ignored entirely.

## Return

`RETURN-CODE-LIVE-AS-PERFORMED-<date>.md` with a reconcile shown on a fixture history over the RH Day 2 setlist (expected: many "untracked", few "performed" — the machzor has no cues yet — say so), the promote result on a cloned test setlist, and the chapter list output.
