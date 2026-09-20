# HANDOFF → Code (centralreform.live + reader): CHARTS-001 is unblocked

From: Cowork sitting with Daniel, 2026-09-14 (`RULINGS-INTEGRATION-2026-09-14.md` #6).
Task: `shireishabbat/ops/tasks/CHARTS-001.json` (status `blocked`, rev 9). Producer: update it to `working` with this ruling as evidence.

## The ruling that unblocks it

Daniel, 2026-09-14: **historical anonymous setlist links stay readable** — a setlist is metadata and a band's convenience; **chart bytes flow only through explicit, revocable, server-controlled grants** via the endpoint already deployed dark on Live SHA `4e2114f7` (Modeh-only anonymous endpoint, kill-switched off; select → 200 unavailable, chart → 404 unavailable, exact CORS, `no-store`).

So the two halves of the old question resolve differently: setlist *metadata* keeps its legacy anonymous read; chart *bytes* never had one and do not get one. "Close raw enumeration / arbitrary downloads" applies to bytes and file listings, not to `get_setlist` by id.

## Order of work (CHARTS-001 `next_action`, now ordered)

1. **Locate the reader chart branch.** CHARTS-001 names reader serial HEAD `a6828b8` (opt-in setting, integrity-pinned optional chart module excluded from SW install staging, hardened phone/iPad PDF.js viewer; 51 passes / 4 expected skips). It is on neither `codex/desktop-reader-ux` nor the stale `shirei-tshuvah-web` checkout. Try `git branch -a --contains a6828b8` and `git worktree list` in `shirei-tshuvah-web/.git`; also check `shireishabbat` (the task cites "reader pilot commit d0c298d" there). Report where it is before touching it.
2. **Rebase it onto the desktop branch** (or its successor) so the two reader lines converge. Re-run the chart suite; the desktop branch's `pagehide → save()` defect is already fixed there — confirm the chart module's opt-in storage does not re-introduce a whole-CFG write.
3. **Live boundary re-audit** on the chart-bytes path only: no enumeration of `fileIds`, no arbitrary download by id, grants are per-setlist-share and revocable (`mint_setlist_reader_bearer` / `revoke_setlist_reader_bearer` exist — reuse the pattern, distinct credential kind for chart grants). Leave legacy anonymous `get_setlist` reads exactly as they are.
4. **Modeh manifest.** Create the exact immutable public manifest and approval for the Modeh pilot chart (`upload-596a2313-…` "Modeh Ani (CRC band chart, Cm)" is the one on RH Day 2; confirm it is the intended pilot with Daniel through the confirm flow).
5. **Flip the Live kill switch** for Modeh only; verify anonymous phone/WebKit behaviour from the reader with the opt-in **off** (zero requests) and **on** (one select, one chart fetch, no-store).
6. Keep the reader feature **off by default**, one setting, plain words ("Show the band's chart when there is one").

## Constraints unchanged

Chart PDFs are third-party sheet music: bytes never enter shireishabbat or any fork-facing surface; the reader fetches them from .live under a grant, never caches them in the service worker. With `moments.json` landed (separate order), the reader may ask "is there a chart for the unit I am showing in tonight's published setlist" by moment id; until then the Modeh pilot matches by the manifest alone.

## Return

`RETURN-CODE-CHARTS-001-<date>.md`: where `a6828b8` was, the rebase result, the re-audit table, the manifest, and phone captures off/on.
