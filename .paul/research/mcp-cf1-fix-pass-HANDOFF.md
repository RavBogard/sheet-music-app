# MCP CF1 Fix-Pass — Handoff (paused 2026-05-15)

> **⚠️ SUPERSEDED 2026-05-15 end-of-day** — every item in the "Still TODO" list below has been resolved:
> - upload_chart base64 hang → fixed via `import_chart_from_drive` (`a54ae7230`)
> - §7.5 RSC 503 → deferred (no fresh repro; defer until it bites again)
> - §7.6 Outbox 58-error → still open, not urgent (carry-forward, see project_mcp_status.md)
> - CF2-C generate_gig_packet → STILL OPEN, top remaining priority
> - CF3 bulk_add_tracks + position-in-patch → shipped `173956c86`
> Plus: pdfjs workerSrc fix `3b76279f2` (Perform-mode chart rendering), atomic upload guard + library_signals `f650d94f0`. Do NOT resume from this doc — see `project_mcp_status.md` auto-memory + the new stress-test prompt.


## What's shipped this pass (all deployed to production)

Most-recent commit on master: `398aef69`. Every entry below is a separate prod-deployed commit on master, also pushed to feat/mcp-server.

| Commit | What | Cowork ref |
|---|---|---|
| `88d2edfe` | CF1 — `update_track` + `bulk_update_tracks` | original CF1 phase |
| `9f737cc7` | Widen band_leader access (curated upload + rate-limit bypass) | David Lazaroff joined |
| `7f124208` | CF2-B `download_chart` MCP tool | Daniel feature ask |
| `18124c21` | CF1 atomic-rollback envelope + `committed: boolean` + ISO updatedAt | §3.1 + §3.3 |
| `715dbaec` | Firestore-shutdown cascade — SwCleanup reload-after-IDB-clear + dedupe error logs | §7.2 |
| `242018db` | Perform-mode PDF.js worker pre-warm | §7.1 |
| `5d05ff5c` | eventDate timezone — date-only stored as local noon | §3.4 |
| `8836d9fe` | Setlist detail: live data binding + skeleton on first load | §3.5 + §7.4 |
| `398aef69` | `list_setlists` offset paging; fetch cap 50 → 200 | §7.7 |

Tool surface: **22 → 25** (CF1 +2, CF2-B +1).

## Still TODO (in priority order)

1. **upload_chart hang on ~90 KB base64 PDFs (NEW 2026-05-15, cowork follow-up)** — cowork reports `upload_chart` never returns when invoked from claude.ai with a ~90 KB encoded payload. No error, just a hang. 90 KB is well under any plausible body-size limit, so cowork's size-limit hypothesis is most likely wrong. Realistic suspects:
   - **PDF chord extraction stalls** — `processChartUpload` runs `pdf-chord-extractor` for PDFs; if it loops on a tricky font/layout it can wedge. Add a hard timeout there.
   - **Fuzzy dedup loop** — the Levenshtein-guard fuzzy-name match (G-5) iterates over library_index; if there are hundreds of entries this can be slow. Check the query shape.
   - **Gemini call inside the upload path** — if any AI inference path is reached during upload, it can hang for tens of seconds. Should not be reached for plain PDF uploads but verify.
   - **MCP SSE transport buffering** — less likely but worth a look. The MCP server's response streaming should flush per-tool-result.
   - **Drive-ID/URL variant** — cowork's #3 suggestion is independently good UX: accept `driveFileId` OR `sourceUrl` and have the server pull the bytes itself (sidesteps base64 entirely AND avoids re-uploading a chart that already lives in Drive). Adds a new `import_chart_from_drive` MCP tool that wraps the existing Drive client. Repro target: `Bina in G.pdf`, Drive ID `1uj3isd0RJoAYoETx4QFwjQQgwjaO4DTS`.
   Repro: capture a hanging call's full request body, then re-invoke `processChartUpload` directly in a Node script with that buffer to bisect which stage stalls.

2. **§7.5 RSC 503 prefetches** (in-progress, paused mid-investigation) — Vercel returns 503 on `/setlists?_rsc=...` and similar hover-prefetches. Need runtime logs from Vercel dashboard to confirm root cause; `vercel logs` CLI couldn't resolve the deployment. Check Vercel Functions dashboard for the master-branch deployment for 503s on `/proxy` (the middleware). Suspect: cold-start latency on Edge middleware + the verifyRoleCookie await. Mitigations to consider: shorter middleware path on `_rsc` requests; skip role check on RSC payloads (the actual page render will re-check).

3. **§7.6 Outbox 58-error investigation** — pre-existing accumulation of failed write-queue entries. `src/lib/sync/cleanup.ts` has `discardFailedOutboxRows` + `retryFailedOutboxRows`. Check Outbox console logs to identify error classes; classify retryable vs. terminal; expose a one-click "clear failed outbox" admin action. Related: §7.3 sticky "Failed — retry" badge is honestly reporting outbox state, so fixing the outbox accumulation also clears the badge.

4. **CF2-C `generate_gig_packet` MCP tool** — ~1 day. Read setlist → fetch each bonded chart via `fetchFileById` (same path `download_chart` uses) → merge into single PDF via `pdf-lib`. Non-PDF inputs (images, text, MusicXML): embed images as full-page, render text as monospaced page, MusicXML/MuseScore probably skipped + listed in a "missing charts" appendix. Return base64. Hard cap on total bytes; very large setlists chunk into multi-part packets. Emulator tests for: setlist with all PDFs, mixed types, missing-chart appendix, bonded-but-unfetchable, too-large.

5. **CF3 `bulk_add_tracks` + `position` in `update_track` patch** — cowork's #1 recommended next gap (§6). Task 8 still cost 9 sequential `add_track_to_setlist` calls. Add `bulk_add_tracks(setlistId, tracks[])` and let `update_track` patch include `position` for in-place reordering. Closes the weekly-flow N+1 problem.

## Two notes for next session

- **TOKEN CAVEAT (verify before re-running cowork):** the previous cowork run's MCP token authenticated as Daniel (admin), not David (band_leader). Tasks 5/10 from `mcp-cf1-cowork-REPORT.md` produced no role-gate signal as a result. Daniel said David has his own token connected to Claude Desktop — verify the token routing OR have cowork swap the Authorization header. Both browser tab AND MCP session appeared to be Daniel in the prior run.

- **§3.5/§7.4 fix is partial:** the "Date TBD" flash + "TRACKS 0" flash are now hidden behind skeletons during load, but the underlying SSR-vs-MCP-write propagation race still exists. A freshly-MCP-created setlist's SSR returns null eventDate/empty tracks until Firestore replication catches up. Hard architectural fix would be SSR retry-on-stale or client-write-confirmation tracking — deferred unless it bites again.

## Resume prompt (paste verbatim after /clear)

```
Resume the MCP CF1 fix-pass. Context lives in
.paul/research/mcp-cf1-fix-pass-HANDOFF.md (handoff state), 
.paul/research/mcp-cf1-cowork-REPORT.md (cowork's verification report 
that drove this fix-pass), and .paul/research/mcp-cf1-PLAN.md (original 
CF1 plan).

Sequence:
1. **upload_chart hang** (NEW from cowork follow-up — 90KB base64 PDF 
   never returns; add timeout to processChartUpload stages AND ship a 
   `import_chart_from_drive` MCP tool that takes a Drive ID / URL 
   instead of base64. Repro: Drive ID 1uj3isd0RJoAYoETx4QFwjQQgwjaO4DTS, 
   filename Bina in G.pdf.)
2. §7.5 RSC 503 investigation (in-progress, paused mid-investigation; 
   Vercel logs needed; suspect Edge middleware cold-start + 
   verifyRoleCookie)
3. §7.6 Outbox 58-error investigation
4. CF2-C generate_gig_packet (PDF-merge bonded charts in setlist order)
5. CF3 bulk_add_tracks + position-in-patch (cowork's #1 next gap — 
   closes the weekly-flow N+1)

Daniel-locked policy from prior session: "we're going to keep going until 
it is all done, and done right" — full autonomy on ordering. Each piece 
ships as its own commit + Vercel deploy. Use the existing pattern:
  - work in sheet-music-app-mcp/ (feat/mcp-server worktree)
  - run gates: vitest unit + emulator (npx firebase emulators:exec) + 
    npm run build (EXIT 0)
  - cd to sheet-music-app/, git merge --ff-only feat/mcp-server, 
    git push origin master, git push origin feat/mcp-server
  - poll npx vercel ls until Production is Ready
  - update auto-memory project_mcp_status.md after each ship

Auto-memory has the latest tool inventory (25 tools post-CF2-B). Don't 
touch v7.1 work, bridge/**, or any non-MCP code. Push to `origin master` 
(NOT `:main` — Daniel-explicit; see feedback_git_push). master is the 
production branch on Vercel; feat/mcp-server is the dev tracking branch.

Token caveat from cowork report's §0: previous run authenticated as 
Daniel-admin not David-band_leader. Daniel may resolve this himself; 
don't gate the next cowork run on it.

Start by reading the handoff doc, then either:
  - investigate §7.5 by checking Vercel runtime logs / Functions dashboard
  - OR pivot to §7.6 / CF2-C / CF3 if §7.5 needs deferred to a separate 
    Vercel-account-access session.

Read these auto-memory entries first:
  - project_mcp_status.md (post-CF2-B state, 25 tools)
  - project_david_band_leader.md (2nd band_leader context)
  - feedback_admin_rate_limit_bypass.md (trusted-leader bypass)
  - feedback_git_push.md (origin master not origin master:main)
```
