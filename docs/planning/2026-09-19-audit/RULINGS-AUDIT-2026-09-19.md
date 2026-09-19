# RULINGS — Four-project audit, 2026-09-19

Daniel's rulings from the 2026-09-19 Cowork session that audited shireishabbat, shirei-tshuvah-web,
CentralReform.live (sheet-music-app) and crc-overlays together. One copy of this file lives in each
repo. Where this file and an older process document disagree, this file wins; where it is silent,
`PLAN-INTEGRATION-MASTER-2026-09-14.md` and `RULINGS-INTEGRATION-2026-09-14.md` still apply.

Verified-against: shireishabbat `1854db8` · shirei-tshuvah-web `334e172` · sheet-music-app `3abade1715` ·
crc-overlays `1f9a5f3` (branch `google-signin` == `origin/main`).

## How the audit was done

Six Opus agents read read-only snapshots of the four repos (git archive of each HEAD plus the untracked
root docs), traced every cross-repo contract end to end, and probed production through the CRC_Music,
CRC_Overlays and Vercel connectors. Fable verified the load-bearing findings directly against the code and
the live `today.json`. The full findings are in the Cowork transcript; the parts that matter for execution
are restated in each repo's `HANDOFF-CODE-AUDIT-2026-09-19.md`.

## R-0919-audit-1 — Everything in the audit's recommendation lists is approved

Daniel: "i basically am fine approving everything you listed." Both lists — low-hanging fruit and
significant improvements — are approved for execution. The per-repo handoffs carry the items; the master
plan carries the order and the cross-repo dependencies. Items that are Daniel's own (rehearsal with
Michael, checking the printed booklet, the flagged Overlays drafts) are listed under "Open on Daniel" below.

## R-0919-audit-2 — Firestore: gate `list`, keep single-document `get` public

`/setlists` and `/tracks` stay readable by document id without sign-in (old anonymous links keep working;
`/perform` for a signed-out band member keeps working by fetching the setlist and its tracks by id).
Collection-wide `list` requires sign-in. Applies to both tenants. sheet-music-app.

## R-0919-audit-3 — Retire Publish in .live entirely

Nothing has ever been published (all 13 recent setlists `publishedAt: null`) and `today.json` emits from
unpublished setlists by R2-f. Remove the Publish button, the `publishedAt` field's writers and readers, the
publish hook, and any MCP tool or route that exists only to publish. Keep `publish_setlist` out of the MCP
surface. `today.json` freshness is handled separately: cron every 15 minutes, a staleness assertion, and a
failure signal that is visible (emitToday must not fail silently). sheet-music-app.

*Note added while drafting the handoff:* `/api/setlist/publish` is also the "tell the band" path (in-app,
push, email, SMS to assigned musicians). Interpretation adopted until Daniel says otherwise: the stamp,
the snapshot and the word "Publish" go; the notification capability stays as its own plainly named action
("Notify band") unless the other notify routes already cover every channel. See the master plan.

## R-0919-audit-4 — CHARTS-001: rebase the reader chart panel onto the shipped reader now

The 13 commits on `codex/serial-chart-integration` (`a6828b8`) are rebased onto shirei-tshuvah-web `main`
and land behind the existing `localStorage["stw-approved-charts"]` switch. The desktop redesign proceeds
separately. The .live endpoint stays on (`READER_PUBLIC_CHARTS_ENABLED=true`, one approved chart). The
reader's `ops/tasks/CHARTS-001.json` record is updated to reflect R4-e's approval and this ruling.

## R-0919-audit-5 — PDF.js is vendored into the reader

No third-party origin. Ship pdf.js in the shirei-tshuvah-web repo, cached by the service worker; the
egress guard's allowlist does not grow. Re-derive the wire/code ceilings if the vendored file crosses one.

## R-0919-audit-6 — AI enrichment: auto-apply ON at 0.90 (done)

Set from Cowork on 2026-09-19 via MCP: `set_ai_threshold 0.7 → 0.9`, `set_ai_auto_apply false → true`.
Evidence: 191 correction signals, 134 accept, 57 cosmetic edits, 0 reject, 0 dismiss; accepted rows mean
confidence 0.93 (p50 = p90 = 0.95). Remaining work: clear the review queue frozen at 2026-05-20..23
(50+ rows, source `salvage`) — re-run enrichment on them under the new gate or dismiss them, in an MCP
session or a Code script with dryRun first. sheet-music-app.

## R-0919-audit-7 — TBI shared library: licensed units travel, no filter

Daniel's earlier authorization stands: Simone / Temple B'nai Israel may use all current and future CRC
overlays and source material, including units whose licence line reads "not licensed for redistribution".
No licence filter is built into `buildSharedLibraryPayload`. Recorded so nobody re-raises it. crc-overlays.

## R-0919-audit-8 — One governance regime

The 09-14 master-plan model is the only process: each Code session is executor and producer for its own
repo, measures its own expectations, writes its own task record and return. Consequences, all four repos:

- Delete the "PRODUCER TRANSITION — Codex is Producer" banner and the "STANDING TERMINAL + COMPACTION"
  block from every `CLAUDE.md` (shireishabbat, shirei-tshuvah-web, sheet-music-app, crc-overlays where present).
- shireishabbat: `ops/tasks/*.json` is the single status surface. Retire `ops/queue.py`, `ops/inbox/`,
  `ops/runs/`, `ops/WORKER-POOL.json` (archive, do not delete history). Archive `desks/` and the
  `STATUS.md` baton; `planning/wait_for_board.py` retires with them. `PRODUCER.md` is marked superseded.
- `COORDINATION.md` in shireishabbat is rewritten to the one model; the reader's and .live's
  `COORDINATION.md` stubs point at it. The `Lane:` commit trailer is no longer required.
- Orders and returns live in `docs/planning/<date>-<topic>/` (Overlays' existing convention) in every repo;
  in shireishabbat that is `planning/<date>-<topic>/`. Root keeps ~10 files.

## R-0919-audit-9 — Subagent tier: Opus and Sonnet

The 09-14 ruling stands and supersedes the 2026-08-11 policy block: subagents run on Opus or Sonnet for
surveying, drafting and checking; the top tier is not used for subagents. Update the "Subagent model
policy" block in shireishabbat `CLAUDE.md` to say this. Every handoff that says "use subagents" repeats
this sentence.

## R-0919-audit-10 — Desktop refusal persists until dismissed

When a called page cannot be honored on a `pointer: fine` surface, the refusal stays on screen until the
reader acts (same words as the phone whisper). Phone behavior is unchanged. shirei-tshuvah-web,
DESKTOP-UX-001.

## R-0919-audit-11 — 44px floor relaxes on mouse surfaces

Touch surfaces keep the 44px target floor. Where `pointer: fine`, targets may shrink to about 32px.
Guards ask per surface (touch projects assert 44; desktop projects assert the smaller floor). The `--tap`
token stays the single spelling. shirei-tshuvah-web, DESKTOP-UX-001.

## R-0919-audit-12 — Keep noindex, keep OG previews, exempt /braille

`X-Robots-Tag: noindex` stays site-wide except `/braille` (the one page built to be found). Open Graph
share metadata stays so a texted link shows a title and image. shirei-tshuvah-web.

## R-0919-audit-13 — A bare `?book=<slug>` link opens the whole volume, landing at today's service

On a day the calendar claims a service inside the book, the walk holds the whole volume and the reader
lands on `when.open`. This is what `codex/desktop-reader-ux` already does; it becomes the shipped rule.
shirei-tshuvah-web.

## Standing rules restated for the executors

- Claude Code may deploy to production without asking when the work looks ready (09-14).
- Working notes, returns and commit messages in plain language: say what happened and what is worth
  noticing; no writerly shorthand.
- Never propose which setting or melody the band plays.
- Overlays hosting budget under $25/month combined ideal, $50 acceptable; Neon is not upgraded again.
- Hebrew is sacred text: verify, never improvise; nikud is edited only as surgical string replacements.
- Licensed material: `build/tools/export-scan.sh` remains the public/private boundary in shireishabbat;
  shirei-tshuvah-web stays private; the deployed reader stays open.

## Open on Daniel (not for Code)

1. **"Returning the Torah"** — .live's Saturday pagemap says p.90, the reader's feed says p.89. Which does
   the printed CRC Saturday booklet say? The wrong side gets fixed once he answers.
2. **Overlays rehearsal with Michael** — Stream Deck, real vMix, restart, network drop, a service-length
   run; then `isolationVerified` is set honestly. The cue log needs one real service before
   `reconcile_service` can be judged.
3. **Flagged Overlays drafts** — the rulings `OVERLAYS-BACKLOG-REPORT-2026-09-14.md` still lists as owed.
4. **Laptop-only branches** — `codex/serial-chart-integration` and `codex/desktop-reader-ux` exist only in
   worktrees under `AppData\Local\Temp`; the first Code session on the reader pushes them before anything else.
5. **Vercel token scope** — the MCP token cannot list env-var names; the cross-app secret inventory is
   unverified until he grants the scope or checks the dashboard.

## Facts the audit corrected (so nobody acts on the old version)

- crc-overlays `main` is NOT behind the deployed branch: `origin/main` == `google-signin` == `1f9a5f3`.
  Only the stale checkout at `C:\Users\dsbog\crc-overlays` has a `main` 243 commits back. The
  `siddur-library.yml` workflow's `base: main` is correct.
- `dist-app/` CAN be built off Daniel's machine: the licensed `*-local.typ` files are tracked in private
  `main`, and the Overlays weekly workflow built it on a GitHub runner (PR #5, `e4035a6`).
- `today.json` is live and fresh (generated hourly; on 2026-09-19 it carried six services through Neilah
  with `readerBook`, `startFolio`, `startsAt`, `stream`). Congregation service times and stream URL are set.
- The reader routes by `today.json`'s `readerBook` when present (`index.html:4653`); the missing `when`
  claim on `crc-neilah` only affects the offline fallback calendar.
- The cue log's null `unitId/momentId/book/folio` on real liturgical cues is a relay filter that keeps only
  `library:`-prefixed source ids (`relay/src/protocol.ts:158-161`); cues authored with bare unit ids stored
  `[]`. The 26 existing rows are unrecoverable; new rows need the fix. `serviceRef` null is expected
  (nothing sends it; D4 ruled against it).
- Brothers Lazaroff is a live second tenant on sheet-music-app (`brotherslazaroff.live`, gigs). Multi-tenancy
  is in production; "family as a product" remains not-now.
- Vercel bills nothing (Hobby); the Overlays budget question is Neon only.
