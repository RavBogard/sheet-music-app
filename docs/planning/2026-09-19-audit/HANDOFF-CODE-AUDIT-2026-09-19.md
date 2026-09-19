# HANDOFF-CODE-AUDIT-2026-09-19 — CentralReform.live (sheet-music-app)

Executor: a Claude Code (Opus) session opened on this repo
Status: open
Verified-against: `3abade1715` (master, 2026-09-16)
Rulings: `RULINGS-AUDIT-2026-09-19.md` (same folder) — read it first; R-0919-audit-1 approves everything here
Master order: `PLAN-AUDIT-MASTER-2026-09-19.md` (same folder) — which wave each item is in and what it waits on
Subagents: Opus and Sonnet only (R-0919-audit-9). Repeat this line in any sub-order you write.
Process: you are executor and producer for this repo (R-0919-audit-8). Measure your own expectations, write your own return, deploy when it looks ready. Do not wait for a board row or a producer.

## Before anything

1. Commit `RULINGS-AUDIT-2026-09-19.md`, this handoff and the master plan into `docs/planning/2026-09-19-audit/` in this repo. They are currently the only copy and they live outside git.
2. Read `## Wave 1 (a)` and `## Wave 1 (b)` in full before you touch either. Both look like small deletions and both have a consumer the obvious change breaks.

---

## Wave 1 — this repo alone, no cross-repo dependency

### Correctness

- [ ] **(a) Firestore: gate `list`, keep `get`** — per R-0919-audit-2. Today `firestore.rules:138` (`/setlists`) and `firestore.rules:173` (`/tracks`) both read `allow read: if true`, which at collection level permits a whole-collection *query*, for both tenants. Change each to `allow get: if true; allow list: if isSignedIn();`.

  **Two consumers break and both need a server-side answer first.**

  1. `src/lib/client-tracks.ts:31` — `fetchTracksForSetlistClient` queries `collection(db,"tracks") where setlistId == …`. That is a `list`, and signed-out `/perform` runs it. Callers: `src/lib/setlist-firebase.ts:93`, `src/hooks/use-setlist-performance.ts`, `use-setlist-dashboard.ts`, `use-upcoming-prep.ts`, `src/components/performance/SetlistDrawer.tsx`, `src/components/admin/TemplatesSection.tsx`. Recommended fix: a public, rate-limited server route returning a setlist's tracks by setlist id through the Admin SDK (same posture as the existing `src/app/api/setlists/page/route.ts`), called when the user is signed out. Do not put track ids on the setlist doc unless you also solve keeping them in sync — `order` is the author's and nothing may re-sort it (R11-b).
  2. `src/components/performance/PublicSetlistListing.tsx` — the signed-out `/perform` landing subscribes to the `setlists` collection live; also a `list`. `/perform` is already an ISR server component (`revalidate=60`), so serve the initial list from the Admin SDK and keep the live subscription for signed-in users only. Preserve the invariant that file states: a musician missing the setlist they are meant to play is a service-block, so err toward showing it.

  Done when: emulator tests assert, for **both** `crc` and `brotherslazaroff`, that an unauthenticated client can `get` a setlist and a track by id and is denied a collection query on either; `npm run test:emulator` green; and a signed-out browser loads `/perform` and one setlist's Perform view with its tracks rendered.

- [ ] **(b) Retire Publish** — per R-0919-audit-3. Nothing has ever been published; `today.json` already emits from unpublished setlists (R2-f, comment in `src/lib/today/emit-today.ts`).

  **Read this before deleting `/api/setlist/publish`.** That route is not only a publish stamp — it is the "tell the band" path: in-app notifications, push, email and SMS to assigned musicians (`src/app/api/setlist/publish/route.ts:1-9`, importing `emailAllMembers`, `sendPushToUsers`, `sendSMS`). Retiring the publish *concept* must not retire the notify capability. The other notify routes already work without a publish stamp and say so (`src/app/api/setlist/resend-email/route.ts:68-71`, `src/app/api/setlist/print/public/route.ts:50-53`, `src/app/api/setlists/notify-updated/route.ts`, `src/app/api/setlist/email-packets/route.ts`). Either confirm those cover every channel the Publish dialog sent on and delete the route, or keep the route, strip the `publishedAt`/snapshot half and rename it to what it does. Say which you chose in the return.

  Remove: the Publish button and `src/components/setlist/PublishDialog.tsx` (+ test); `src/components/setlist/grid/PublishedSnapshotDriftBanner.tsx` (+ test) and its use in `SetlistGrid.tsx`; the `publishedAt` writes at `src/app/api/setlist/publish/route.ts:117-120` and `src/lib/mcp/tools/setlist-publish.ts:737,826-829,892-894`; the `emitToday` call in the publish path (the cron covers it — see (c)); the `publish_setlist` registration and description in `src/lib/mcp/tools/index.ts`; the `publishedAt` field on `list_setlists` rows (`src/lib/mcp/tools/setlists.ts:49-54,137`, description at `index.ts:580`); and the pass-through in `src/lib/today/build-today.ts:31,150-151` and `src/lib/today/types.ts:69`.

  Keep: `preview_publish`, `propose_setlist_changes`, `commit_staged_changes` — the stage→confirm flow, unrelated to publishing. Keep `src/lib/song-usage.ts:68` (a usage-event timestamp, not the setlist field — verify before touching).

  Done when: `grep -rn "publishedAt" src/` returns only the song-usage event; `publish_setlist` is absent from the tool list a fresh MCP connect reports; `npm test`, `npm run test:emulator`, `npx tsc --noEmit` and `npm run build` green; and a `today.json` emitted after the change differs only by the dropped field.

- [ ] **(c) `today.json` freshness and a visible failure** — per R-0919-audit-3. `emitToday` returns `{ok:false, error}` and never throws (`src/lib/today/emit-today.ts`), and once (b) lands the cron is the only writer, so a silent failure looks like a fresh file with a stale `generatedAt`. Three things: move `/api/cron/emit-today` to `*/15 * * * *` in `vercel.json`; have the cron read the object back and assert `generatedAt` is within 20 minutes of now; alert when the emit returns `ok:false` or the read-back is stale. Reuse the existing alert path — `sendBridgeHealthAlert` (`src/lib/email.ts:163`: Resend, `BRIDGE_ALERT_EMAIL`, degrades quietly when unset) with the re-notify guard pattern of `config/bridgeWatch` in `src/app/api/cron/bridge-watch/route.ts`, so a persistent failure does not mail every 15 minutes. Add the `today.json` age to `src/app/api/health/route.ts`, which returns only `{ok, uptime}` today.
  Done when: `vercel.json` shows the 15-minute schedule; a unit test drives the cron with a stubbed stale/failed emit and asserts the alert fired; `GET /api/health` returns the age in seconds; production `GET /today.json` shows `generatedAt` moving within 20 minutes.

- [ ] **(i) Web vitals** — three regressions Cowork measured: `/library` CLS p75 **1.0**, `/setlists/[id]` CLS **0.58**, `/login` LCP **~9 s**. Reserve space for the library grid and the setlist rows (fixed-height skeletons matching the rendered row height, not spinners) and find what blocks `/login`'s largest paint. `get_web_vitals_summary` produced these numbers and is how you confirm the fix.
  Done when: `get_web_vitals_summary` reports both CLS p75 under 0.1 and `/login` LCP p75 under 2.5 s on data collected after the deploy. If the sample is too thin to say so, report the sample size rather than the number.

- [ ] **(j) Clear the AI review queue** — per R-0919-audit-6. Auto-apply is already ON at 0.90 (set from Cowork 2026-09-19); only the 50+ rows frozen 2026-05-20..23 with source `salvage` remain. Re-run enrichment on them under the new gate or dismiss them, dry run first. The tools exist: `list_review_queue` (`src/lib/mcp/tools/library-review.ts:62,166-231`), `retry_enrichment`, `accept_enrichment`, `reject_enrichment`, `dismiss_failure`.
  Done when: `list_review_queue` returns zero `review_pending` rows dated 2026-05-20..23, and the return says how many were re-enriched versus dismissed and why.

### Hygiene

- [ ] **(d) `build-bridge.yml` and the bridge version** — the workflow runs `npx tsc` then packages `dist/launcher.js` with `@yao-pkg/pkg` into `CentralReform-Bridge.exe`. There is no `launcher.ts` in `bridge/src/` (verified), and `bridge/package.json` + `bridge/README.md:29-36` describe an Electron app shipped by `electron-builder` as `CentralReform-Bridge-Setup-x.y.z.exe`, so the release either fails or attaches the wrong artifact. Point the workflow at the Electron path (`npm run dist` in `bridge/`, upload the NSIS installer) or delete it and record that releases are manual. Make `bridge/README.md`, `bridge/package.json` (`10.0.7`) and the version `get_bridge_health` reports agree. Bundle the watchdog (`bridge/watchdog/`) in the installer, or put one paragraph in `bridge/watchdog/INSTALL.md` saying why not and what the operator must do — it says only "not bundled in the installer yet" today.
  Done when: a `workflow_dispatch` run produces an installer whose name matches the README, or the workflow is gone and the README says how a release is cut; and the three versions agree.

- [ ] **(e) `.env.example` regenerated** — `src/env.mjs` declares 72 variables; `.env.example` names 14. Regenerate it from the schema, then add the seven referenced in runtime code and declared in **neither** — `ALLOWED_ORIGINS`, `MCP_PUBLIC_URL`, `NEXT_PUBLIC_BASE_URL`, `NEXT_PUBLIC_FIREBASE_VAPID_KEY`, `CHART_RENDER_CHROME_PATH`, `OVERLAYS_WORKSPACE`, `READER_MUSIC_ORG_ID` — to `src/env.mjs` as optional, so a misconfiguration surfaces at boot rather than at first use, and to `.env.example` with one line each saying what breaks when they are unset.
  Done when: every `process.env.X` in `src/` and `scripts/` other than platform variables (`NODE_ENV`, `CI`, `VERCEL*`, `NEXT_RUNTIME`, `ANALYZE`, `SKIP_ENV_VALIDATION`, the `PROBE_*` harness set) appears in `src/env.mjs`, asserted by a test.

- [ ] **(f) Stray tracked files** — delete and gitignore: `test-zod.js`, `test-db.ts`, `test-query.ts`, `check-storage.ts`, `drive-test.ts`, `pure.js`, `pure.ts`, `out.json`, `hyphen_check.txt` and `underscore_check.txt` (both 0 bytes), `outputs/`, `bridge/inno.exe` (4.7 MB binary), `bridge/builder_debug.txt` (84 KB). None are in `.gitignore` today. Move `FIXTURE-PURGE-MANIFEST-2026-09-04.json` (199 KB) and `FIXTURE-PURGE-EVIDENCE-2026-09-04.json` (65 KB) to `docs/planning/archive/` rather than deleting — `RETURN-CODE-LIVE-FIXTURE-PURGE-2026-09-04.md` cites them as evidence.
  Done when: the files are gone from `git ls-files`, `git status` is clean, and build and tests pass (check nothing imports `pure.ts`).

- [ ] **(g) Branches, worktrees, and the `main` question** — 116 local branches; 5 of the 6 worktrees are marked `prunable` and point at `C:/Users/dsbog/...` paths that no longer exist. Run `git worktree prune`, then `git branch --merged master` and delete what it lists (expect most of `feat/a*`–`c*`, `feat/cycle*`, `fix/f0xx`) — use the merge answer, not prefix guesswork. **Correction to `CLAUDE.md`:** it says "`origin/main` is stale (April) — resolution is a FOR DANIEL question". There is no `main` branch in this repo any more, local or remote — the snapshot's branch listing has none and `origin/HEAD` points at `origin/master`. Already resolved by deletion; fix the paragraph.
  Done when: `git worktree list` shows one entry, `git branch --merged master` is short and every survivor has a reason, and `CLAUDE.md` no longer poses the `main` question.

- [ ] **(k) `scripts/` layout** — 103 files, 79 loose at the top level, roughly 35 one-shot migrations or probes that have already run. Move into `scripts/migrations/<date>/` (the `backfill-*` set with their three `.RUNBOOK.md` companions, `migrate-v50`, `heal-*`, `lane-c*`, `restore-gcs-versions`, `markorphan-b006`, `v11-*`, `cycle-7-*`), `scripts/dev/` (`probe-*`, `spotcheck-*`, `test-*`, `w3-1-*`, `e2e-bl-tenant-probe`) and `scripts/ops/` (`sync-books.mjs`, `set-role.js`, `monitor-live-probe.mjs`, `update-build-info.js`, `copy-pdf-worker.js`, `check-types-sync.js`, `emit-machzor-book.mjs`, `emit-fixed-liturgy.mjs`).
  Done when: the `package.json` scripts that reference moved files (`sync:books`, `check:types`, `dev`, `build`, `postinstall`) are updated, `npm run build` passes, and `ls scripts/*.* | wc -l` is under 15.

### Docs

- [ ] **(h) Documentation layout** — per R-0919-audit-8. Move the 94-file wrapper folder at `C:/Users/dsbog/CentralReform.live/` (91 `.md` + 3 JSON, 1.5 MB, outside git today with no backup and no history) into `docs/planning/<date>-<topic>/` **in this repo**, grouped by the dates already in the filenames — `2026-09-01-satellite-adoption`, `2026-09-02-dedupe`, `2026-09-03-content-hash`, `2026-09-04-green-repair`, `2026-09-14-integration` (the four handoffs, the plan, the rulings, the 219 KB return), `2026-09-19-audit`. Move the root pile into `docs/planning/archive/`: the five `AUDIT-*`, the four `LIVING-SCORE-*`, `BUGFIX-PLAN-2026-05-12`, `BUGS-4-5-6-PLAN`, `FIX-PLAN-V2`, `MCP-PLAN`, `TRANSPOSER-PLAN`, `RESEARCH-PLAN-2026-05-12`, `PREEXISTING-ISSUES-2026-05-12`, `CODEBASE-ANALYSIS`, `CODE_REVIEW_REPORT`, `TYPESCRIPT_REPORT`, `UI_UX_REVIEW_REPORT`, `MOBILE-UX-ANALYSIS`, `HOME-SCREEN-REDESIGN`, `IMPLEMENTATION-STATUS`, `WORKSTREAM-EVAL`, `WORKSTREAMS`, `HANDOFF`, `firebase-index-instructions`. Root keeps `README`, `CLAUDE`, `AGENTS`, `CHANGELOG`, `COORDINATION` and the config.
  Done when: `ls *.md | wc -l` is 5 or fewer; every moved file is tracked in git; no link in `src/` or `docs/` points at a path that no longer resolves.

- [ ] **(h2) `CLAUDE.md` governance** — per R-0919-audit-8: delete the "PRODUCER TRANSITION — Codex is Producer" banner (lines 1-9) and the "STANDING TERMINAL + COMPACTION" block if present. Replace the family-policy paragraph with the one model: each Code session is executor and producer for its own repo. The `Lane:` commit trailer is no longer required. Point `COORDINATION.md` at shireishabbat's rewritten one. Correct the two stale paragraphs while you are there: the `origin/main` question (see (g)) and "Daniel is keeping development here QUIET", which the 09-14 program superseded.
  Done when: `CLAUDE.md` contains neither "Codex is Producer" nor "STANDING TERMINAL", and describes the governance the 09-14 master plan set.

---

## Wave 2 — waits on: shireishabbat Wave 1 (d) the moments agreement check and (e) the published `dist-app` artifact; and on Daniel for (o)

- [ ] **(l) Adopt the moments agreement check in CI** — once shireishabbat publishes the check, run it here so drift between `src/data/books/moments.json` (225 moments, 473 occurrences, `builtAt 2026-09-16`) and the producer's artifact fails a build instead of surfacing as a wrong page. Add it to `.github/workflows/ci.yml` under the `changes`-classifier `substantive` gate.
  Done when: the check runs in CI and you have seen it go red once against a deliberately mismatched fixture.

- [ ] **(m) `npm run sync:books --from-url`** — `scripts/sync-books.mjs:41` hard-codes `DEFAULT_REPO = "C:/Users/dsbog/shireishabbat"` and reads `dist-app/` off disk, so a book or moments update is blocked on Daniel's laptop having run a Typst build. Add a mode that fetches the published artifact. **Keep the pin guard exactly as it is** — `trimMoments` refuses when a pinned volume's `gitSha` does not match (`shirei-tshuvah` pins `21417d9-LICENSED`; the two Shabbat drafts carry `pin: null`), and it is the only thing stopping one build's folios being paired with another build's unit ids.
  Done when: `npm run sync:books -- --from-url <artifact> --check` reports drift correctly against the committed books, and a wrong-commit artifact is refused with the pin message.

- [ ] **(n) `crc-friday` / `crc-saturday` unit identity** — the two ordinary-Shabbat pagemap books carry folios but no unit ids, so no row in them reaches a moment and nothing joins to the cue log. Register the `legacy-shabbat-evening` / `legacy-shabbat-morning` feeds as feed-tier books alongside the pagemaps, once shireishabbat confirms those feeds exist and are the right ones. A book is declared in `src/data/books/registry.json`; a feed is consumed in `scripts/sync-books.mjs:52` (`VOLUMES`).
  Done when: `lookup_book_page` returns a `momentId` for an ordinary Friday and Saturday unit, and the occurrence count grows by what those two books add.

- [ ] **(o) "Returning the Torah" p.90 vs p.89** — **STOP: waits on Daniel.** This repo's Saturday pagemap says p.90, the reader's feed says p.89. The answer that unblocks it: which page the printed CRC Saturday booklet prints. Then fix whichever side is wrong, and run a normalized-name comparison over the rest of the Friday and Saturday entries — report the disagreements, do not fix them silently.
  Done when: the two sides agree on that entry and the comparison report is in the return.

- [ ] **(p) Split the MCP tool surface** — 144 tools are registered on one server (verified by parsing `registerTool(` across `src/lib/mcp/tools/*.ts`). Split into a default authoring server of roughly 40 (setlists, tracks, templates, books, roster, library search, monitor) and an ops server behind its own bearer (backfills, dedupe, salvage, test accounts, collection dumps, bridge housekeeping). Retire the completed backfills — `backfill_content_hash`, `backfill_heal_metadata`, `backfill_track_mimetype`, `backfill_library_index`, `backfill_setlist_test_flag`, `seed_legacy_dedupe_run` and that set — after confirming each has run against both tenants. They are already admin-gated and `dryRun`-default (`src/lib/mcp/tools/backfill-content-hash.ts:183`), so this is about the surface an agent chooses from, not about access.
  Done when: a fresh Claude Desktop connect to the authoring server lists around 40 tools, the ops server lists the rest, and the retired ones appear on neither.

- [ ] **(q) iPad Perform: un-skip the specs, finish keep-awake acceptance** — 64 skipped tests, concentrated in `e2e/stress-ipad.spec.ts` (4), `perform-ipad-offline.spec.ts` (4), `perform-ipad-deep.spec.ts` (4), `perform-ipad.spec.ts` (3), `authoring-stress.spec.ts` (3), `role-gate-matrix.spec.ts` (3) and `src/components/setlist/grid/__tests__/MobileCardList.test.tsx` (7). The surface the band depends on is where the skips are. For each, either make it run or write one line saying what it needs that does not exist. **The keep-awake half needs an iPad afternoon and is Daniel's** — `docs/IPAD-KEEP-AWAKE-ACCEPTANCE.md` is a seven-step manual protocol still marked "outstanding hardware verification", and `src/hooks/use-wake-lock.ts` records a Yizkor-service failure (2026-05-23) and a three-month misdiagnosis. Mark it as the human gate; do not claim it.
  Done when: the skip count is under 10, every remaining skip carries a reason, and the acceptance doc is filled in from a real run or flagged as awaiting Daniel's iPad session.

- [ ] **(r) CHARTS-001 server side: change nothing, write the procedure down** — the endpoint is live and correct (`READER_PUBLIC_CHARTS_ENABLED=true`, one approved chart, measured 200/200/404/403 in Round 11). Do not touch it. What is missing is the written procedure for approving a second chart: a code change to the frozen allow-list `PUBLIC_READER_CHARTS` in `src/lib/reader-music-public.ts` (one entry today) **and** a pinned `publicReaderManifest` (songId, fileId, storagePath, exact GCS generation, sha256, sizeBytes, contentType) plus `publicReaderStatus: "approved"` on that crosswalk document. Revocation is deleting `publicReaderStatus`; bytes already delivered cannot be recalled.
  Done when: `docs/READER-PUBLIC-CHART-BOUNDARY.md` carries a numbered "approving another chart" section and a "revoking one" section, each followable without reading the code.

---

## Wave 3 — waits on: the Overlays cue-log relay fix shipped **and** one real service logged by Michael

- [ ] **(s) Run `reconcile_service` against real rows, then build the view** — the chain is built and has never seen a row: the last live run returned `historyRows: 0, rows: 51, untracked: 51`, and the audit found why upstream (the relay keeps only `library:`-prefixed source ids, so real liturgical cues stored `[]`). Once a real service is logged, run `reconcile_service` once against it and record the diff verbatim in the return — including the `untracked` count, which is a statement about the cue log and not about the service. Then build the staged plan-vs-performed view. Promote-by-clone already exists (`src/lib/mcp/tools/performed.ts`, `src/lib/performed/reconcile.ts`): it clones, deletes skipped rows, stamps `performedAt`, splices audibles and renumbers `order`, with an emulator test asserting the planned setlist is byte-identical afterward. Only the UI is missing — deliberately, because a button against an empty history is a dead control.
  Done when: one real reconcile is recorded with its numbers, and the setlist page carries a staged view showing plan beside performed that commits nothing until promoted.

---

## Return

Write `RETURN-CODE-AUDIT-2026-09-19-W<n>.md` beside this file after each wave: the checklist above with PASS/FAIL per line, the shas you shipped, the tail of `npm test` / `npm run test:emulator` / `npx tsc --noEmit` / `npm run build`, and anything Daniel must see. Two things he must see specifically: which option you took for the Publish notification path in (b), and the disagreement list from (o).

## Do not

- Do not re-add Publish in any form (R-0919-audit-3).
- Do not make `/setlists` or `/tracks` fully private — single-document `get` stays public so old anonymous links keep working (R-0919-audit-2).
- Do not change the .live chart endpoint or turn on a second chart without the full manifest procedure (R-0919-audit-4, and (r) above).
- Do not add a live "now" pointer, a stream-sync for home viewers, or page numbers on the stream — all declined.
- Do not touch Neon or propose an upgrade; that is Overlays' and it is settled.
- Do not propose which setting or melody the band plays.
- Do not re-sort, insert or delete a row on an existing setlist outside an explicit author action — `order` is the author's (R11-b, 2026-09-16).
- Do not let liturgical text into this repo: ids, names and page numbers only. Chart bytes never leave it except through the approved grant.
