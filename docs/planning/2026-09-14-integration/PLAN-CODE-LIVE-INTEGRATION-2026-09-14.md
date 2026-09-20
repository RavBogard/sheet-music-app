# PLAN → Claude Code (Opus): centralreform.live integration waves

Repo: `C:\Users\dsbog\CentralReform.live\sheet-music-app` (Next.js 16 / Firestore / Vercel; MCP server at `src/app/api/mcp/route.ts`; production https://www.centralreform.live). Branch of record is **`master`** (CLAUDE.md §Git — `origin/main` is stale; never push `main`).
Create branch: `claude/integration-2026-09-14` off `master`. Commit trailer per CLAUDE.md: `Lane: live-integration (code)`.

## Governance (ruled by Daniel 2026-09-14)

The PRODUCER TRANSITION banner atop `CLAUDE.md`, `AGENTS.md` and `COORDINATION.md` ("Codex is Producer; ops/tasks is Producer-only; Code lanes stop and return") is **superseded for this work**. You are the executor and your own producer: you write your own return files here, you update `C:\Users\dsbog\shireishabbat\ops\tasks\*.json` yourself where a task exists (CHARTS-001), and you never wait for a Codex that is not there. The "QUIET" development posture in CLAUDE.md §Development posture was lifted by R-0901-vision-8 (see `../HANDOFF-COWORK-LIVE-INTEGRATION-2026-09-01.md`); proceed. Content/edition/licensing safeguards remain fully in force: **liturgical text never enters this repo** (ids, names, folios only); **chart PDFs never leave it except under a grant**. Autonomy: branch → merge to `master` when green → **deploy to production without asking when it looks ready**. Of the family's two `STOP — Daniel confirms` points, only one applies to this plan — the fixed-liturgy order per book (A-W2, marked below); the other (moment alias batches) belongs to the shireishabbat plan. Test data: read real setlists freely; create/modify only test setlists via the test-account tools (`create_test_account` → work → `cleanup_all_test_data` / `sweep_orphan_test_data`). No schedules in this plan — Daniel alone worries about dates.

## Read first (≤6)

1. `CLAUDE.md` (this dir) — protocol, git rules, test configs.
2. `../RULINGS-INTEGRATION-2026-09-14.md` — the rulings this plan implements.
3. `../HANDOFF-COWORK-LIVE-INTEGRATION-2026-09-01.md` §"What the family built" and §"Constraints that do not bend".
4. `src/lib/books/types.ts` + `src/lib/books/registry.ts` — `LiturgyRef`, `validateLiturgyRef`, `BOOK_FILES`.
5. `src/lib/mcp/tools/setlist-publish.ts` — `publishSetlist` (the publish event you will hook).
6. `../HANDOFF-CODE-SATELLITE-DEPLOY-RETURN-2026-09-01.md` — how a deploy here actually goes ("two build cycles"; the cron/route defect).

Do **not** read whole: `src/lib/liturgical-templates.ts` (30KB — grep the template you touch), `src/lib/mcp/tools/templates.ts` (38KB — grep by function), `firestore.rules` (36KB — grep collection names), any `RETURN-*.md` at the parent root.

## Ground truth, measured (staged sources + live MCP, 2026-09-14)

- **Books.** `src/lib/books/registry.ts` statically imports six `src/data/books/*.json`: pagemap `crc-friday` (48), `crc-saturday` (102), `crc-machzor-2008` (215); feed `shabbat-maariv` (69), `shabbat-shacharit` (144), `shirei-tshuvah` (184). `validateLiturgyRef` refuses folios outside `[bookFolioFloor, entry.pages]` and unknown `unitId`s. `scripts/sync-books.mjs` reads `C:/Users/dsbog/shireishabbat/dist-app/*-feed.json` for three pinned VOLUMES, trims to `{id,name,folios}`, asserts `pages` against `registry.json` (never computes it).
- **Setlist rows.** Live setlist `2b2cc0f5-98d6-4549-9289-9cd8cbff5ff5` ("RH Day 2 — CRC Machzor") has 51 rows of types `header|note|song|prayer|reading|transition`, 44 carrying `liturgyRef {book, folio}`; row fields: `id, order, title, type, songId, fileId, fileName, key, bpm, leadMusician, referenceLink, notes, performer, description, estimatedMinutes, liturgyRef, honors, version`. Setlist fields include `templateType`, `rabbi`, `book`, `eventDate`, `publishedAt`, `version`. **Note:** `src/lib/setlist-write.ts` types `ServerSetlistTrackInput.type` as `'song' | 'header'` (line 30) while live rows carry `prayer/reading/note/transition` — find the write path that accepts the wider `TrackType` (grep `TrackType` in `src/types/models.ts` and `src/lib/mcp/tools/templates.ts` / `setlist-write` callers) before adding rows. `(unverified)` which path the RH Day 2 rows came through.
- **Templates.** Hardcoded defaults in `src/lib/liturgical-templates.ts` (`TemplateSlot {label, type?, queries, topics?, onlyFor?, fileId?, …}`); admin overrides in Firestore collection `templates` (`src/lib/template-firebase.ts`, doc id = liturgical key, CRC bare key, other orgs `${org}__${key}`). MCP: `listTemplates / getTemplate / createTemplate / updateTemplate / deleteTemplate / createTemplateFromSetlist / cloneSetlistFromTemplate` in `src/lib/mcp/tools/templates.ts`. `TemplateSlot` has **no `liturgyRef`** today `(verified in the interface head; grep the rest)`.
- **Publish.** `publishSetlist` (`src/lib/mcp/tools/setlist-publish.ts:344`) stamps `publishedAt` on first publish, bumps `version`, writes a snapshot; the browser path is `src/app/api/setlist/publish/route.ts` (also emails/pushes members). All 8 most-recent setlists have `publishedAt: null`.
- **Congregation config.** `src/lib/congregation-store.ts` `CongregationConfig {name, shortName, location, …, scheduling?: {rabbiProfiles…}}` read from the `congregationDocId` doc; MCP `get_congregation_context` in `src/lib/mcp/tools/congregation.ts`.
- **Credentials.** `src/lib/mcp/scoped-bearer.ts` defines `SETLIST_READER_KIND = "setlist_reader"`, `SETLIST_READER_TOOLS` allow-list, `isSetlistReaderToken` (prefix `crl_read_`), `evaluateScopedJsonRpc`, `filterToolsList`; mint/list/revoke tools in `src/lib/mcp/tools/setlist-reader-bearer.ts`; gate applied in `src/app/api/mcp/route.ts:152` via `withScopedBearer`. This is the pattern to mirror for anything new.
- **Crons/jobs.** `vercel.json` has 15 cron entries; Inngest functions in `src/inngest/functions.ts` (`pdf/generate`, batch intake). A daily cron slot is the right home for a scheduled regeneration.
- **Tests.** `npm test` (vitest), `npm run test:gated` (`vitest.gated.config.ts` — the absolute rule: no wave adds an exclusion line), `npm run test:emulator` (Firestore+Auth emulator). Use `--reporter=dot`.
- **CHARTS-001 Live side.** Task file says production SHA `4e2114f7` carries a reviewed Modeh-only anonymous chart endpoint, kill-switched off (select → 200 unavailable, chart → 404 unavailable, exact CORS, `no-store`), commits `a5867c93`, `6dfe36ef`, review snapshot `9168cbd`. **Not in the staged files** — Part C starts with discovery.

---

## Part A — the setlist is the whole service (fixed liturgy in templates)

### A-W1 · Discovery + the `liturgyRef` slot field
Goal: templates can carry fixed liturgy rows with a pre-resolved page per book.
- Run: `git log --oneline -5 -- src/lib/liturgical-templates.ts src/lib/mcp/tools/templates.ts`; `grep -n "TrackType" src/types/models.ts`; `grep -n "liturgyRef" -r src/lib | head -40`; `grep -n "shabbat_evening\|shabbat_morning\|kabbalat" src/lib/liturgical-templates.ts | head`.
- Files: `src/lib/liturgical-templates.ts` — add to `TemplateSlot`: `liturgyRefs?: Record<string /*book slug*/, { unitId?: string; folio: number }>` and `fixed?: boolean` (a fixed-liturgy row: no chart expected). `src/lib/mcp/tools/templates.ts` — `TemplateTrack` gains the same two fields; `cloneSetlistFromTemplate` resolves `liturgyRefs[setlist.book]` into the row's `liturgyRef` (validated through `validateLiturgyRef`) and copies `fixed` into the track as `fixed: true`. Rows whose `liturgyRefs` lack the setlist's book get `liturgyRef: null` and are listed in the clone result under `unresolvedLiturgy[]`.
- Tests: `src/lib/mcp/tools/__tests__/templates-liturgy.test.ts` (new): a slot with refs for two books resolves per book; missing book → null + listed; invalid folio → refused with the registry's message.
- Done-when: clone from a template carrying `liturgyRefs` yields validated `liturgyRef`s. Commit: `templates: liturgyRefs per book + fixed rows on TemplateSlot/TemplateTrack`.

### A-W2 · Generate the fixed-liturgy rows per book (no hand-typing)
Goal: the order of fixed liturgy comes from the book's own feed, not from memory.
- New script `scripts/emit-fixed-liturgy.mjs`: for each feed-tier book in `src/data/books/*.json`, walk `units[]` in feed order and emit a proposed row list `{label: unit.name, type: 'prayer', fixed: true, liturgyRefs: {[slug]: {unitId, folio: folios[0]}}}` filtered to the **fixed-liturgy allow-list** in `scripts/fixed-liturgy.json` (new; seed with stems: `barchu, shma, vahavta, mi-chamocha, hashkivenu, vshamru, amidah-*, kaddish-*, aleinu, kiddush, adon-olam` — grep the actual unit ids in the book JSONs and write the list from what exists; note anything ambiguous). For pagemap books, match the same names through `entries[].name/aliases` (`src/lib/books/lookup.ts` has the matcher — reuse it) and emit `{folio: page}` only.
- Output: `work/fixed-liturgy-proposal-<book>.md` tables (order, label, folio, unitId) per book for Friday (`shabbat-maariv`, `crc-friday`) and Saturday (`shabbat-shacharit`, `crc-saturday`), plus a JSON the next wave consumes.
- **STOP — Daniel confirms.** Write the four tables into `RETURN-CODE-LIVE-INTEGRATION-2026-09-14.md` §A-W2 and end the wave. Daniel confirms/edits the order per book in a Cowork sitting; the confirmed JSON is committed as `src/data/templates/fixed-liturgy.<book>.json`. Do not proceed to A-W3 without the confirmed files.
- Commit: `templates: fixed-liturgy proposal generator (awaiting Daniel)`.

### A-W3 · Apply to the two weekly templates
- Merge the confirmed fixed rows into the Friday and Saturday template defaults in `src/lib/liturgical-templates.ts` (find the keys via A-W1 grep; the fixed rows interleave with the existing song slots in liturgical order — a fixed row precedes the song slot it introduces, e.g. `Bar'chu` (prayer, fixed) then the Bar'chu song slot). Existing Firestore overrides (`templates` collection) take priority over defaults — add a one-shot admin MCP tool `merge_fixed_liturgy_into_template({templateKey, dryRun})` in `templates.ts` that shows the diff (stage) and applies it to the override doc only on `dryRun:false` (commit). Register in `route.ts` via the existing `registerWriteTools` file.
- Tests: template default snapshot test for the two keys; merge tool dry-run/commit on the emulator.
- Done-when: `clone_setlist_from_template` for a Friday template with `book: 'shabbat-maariv'` yields a setlist whose fixed rows all carry valid `liturgyRef`s. Commit: `templates: fixed liturgy in Friday/Saturday defaults + merge tool`.

### A-W4 · Book switch re-resolves pages
- In `src/lib/mcp/tools/setlists.ts` `update_setlist` (grep `book` handling) and the browser equivalent: when `book` changes, for each row with `liturgyRef.unitId` (feed books) re-resolve via `lookup` into the new book by moment/unit stem; for pagemap books, by name through `entries`. Never silently drop an author-typed folio: when the new book cannot resolve a row, keep the old `liturgyRef` but return the row in `unresolved[]` and set `liturgyRef.stale: true` `(add to types.ts LiturgyRef as optional)`. `validateLiturgyRef` must accept `stale`.
- Tests: emulator test switching a cloned test setlist `crc-friday → shabbat-maariv` and back; unresolved reported; nothing dropped.
- Commit: `setlists: re-resolve liturgyRef on book change; stale flag; unresolved report`.

### A-W5 · Perform mode hides fixed rows
- Grep the Perform-mode component (`grep -rn "Perform" src/components | head`; likely `src/components/perform/*`). Rows with `fixed: true` and no `fileId` collapse into a thin divider showing the section/label, tap-to-expand; preference `performShowFixedRows` persisted in `localStorage` per device (default false). The rabbi sheet (`generate_service_sheet`, `src/app/api/setlist/print/*`) shows all rows unchanged.
- Tests: component test for collapsed/expanded rendering; print route snapshot unchanged for fixed rows.
- Commit: `perform: collapse fixed liturgy rows by default`.

### A-W6 · Publish is a real step
- In `AGENT-GUIDE.md` (the MCP `instructions` string loaded in `route.ts:63`) add a short paragraph: after `commit_staged_changes` on a service setlist, offer `publish_setlist`; explain that downstream (Overlays import, `today.json`) keys off publish. In `publishSetlist` ensure republish bumps `version` and stamps `republishedAt` (new field; `publishedAt` stays first-publish per existing semantics). No auto-publish anywhere.
- Commit: `mcp: publish nudge in agent guide; republishedAt`.

---

## Part B — `today.json`

### B-W1 · Emitter
- New `src/lib/today/emit-today.ts`: `buildToday(orgId): TodayDoc` — query setlists with `publishedAt != null` and `eventDate` in `[startOfToday(America/Chicago), +7d]`, soonest first; emit the envelope `{schemaVersion:1, generatedAt, services:[…]}` (this exact shape — `schemaVersion` and `generatedAt` are top-level, `services` is the array; the reader's `calFrom()` in `PLAN-CODE-READER-INTEGRATION-2026-09-14.md` W1 parses this object verbatim and returns `null` on any other shape); per setlist emit `{setlistId, name, serviceType: templateType, eventDate (YYYY-MM-DD), startsAt, book, startFolio (first liturgyRef.folio in order), rabbi, stream?: {url, startsAt}, publishedAt, version}`. `startsAt` = eventDate + `congregation.services[serviceType].defaultStartLocal` (B-W2) overridable by setlist `startsAtLocal` (new optional field). Omit absent fields. Shape per `../HANDOFF-CODE-LIVE-TODAY-JSON-2026-09-14.md`.
- Storage: write the JSON to Firebase Storage at `public/today/<orgId>.json` with `cacheControl: public, max-age=60, s-maxage=60, stale-while-revalidate=600` (the bucket already serves public objects — see `src/inngest/functions.ts` `file.save` metadata). Serve through a route `src/app/api/today/route.ts` (`GET`, CORS `*`, same cache headers, reads the stored object; 404 `{error:'not_found'}` when none) so the URL is `https://www.centralreform.live/api/today` — **and** add a `vercel.json` rewrite `/today.json → /api/today` so the documented path works.
- Forbidden-key guard test `src/lib/today/__tests__/emit-today.test.ts`: walks the emitted object; refuses `tracks, fileId, fileName, notes, songId, chartUrl` and any string containing Hebrew (`/[\u0590-\u05FF]/`).
- Commit: `today: emitter + /api/today + rewrite + forbidden-key guard`.

### B-W2 · Config
- Extend `CongregationConfig` (`src/lib/congregation-store.ts`) with `services?: Record<string, {label: string; defaultStartLocal: string /*HH:mm*/}>` and `stream?: {url: string; leadMinutes?: number /*default 5*/}`. Expose in `get_congregation_context`. Add MCP tool `update_congregation_services({services?, stream?, dryRun})` (admin only) in `src/lib/mcp/tools/congregation.ts`, stage→confirm posture (dryRun default true). Seed nothing; Daniel sets values through Claude.
- Commit: `congregation: services/stream config + update tool`.

### B-W3 · Triggers
- Hook `publishSetlist` (both paths) to call `emitToday(orgId)` after the write commits (best-effort; log and continue on failure). Add cron `/api/cron/emit-today` at `0 10 * * *` (UTC) in `vercel.json` with the same double-start guard the repo uses (grep `concurrency` in `src/app/api/cron/drive-sync/route.ts`).
- Per-org: path and query are keyed by `orgId`; CRC only today; never mix tenants in one file.
- Tests: emulator: publish a test setlist → `/api/today` returns it; unpublish/delete → gone after cron; header assertions.
- Deploy after this wave (see Deploy). Commit: `today: emit on publish + daily cron`.

---

## Part C — CHARTS-001, Live side (ruling: setlist metadata stays anonymous-readable; chart bytes only via explicit revocable grants)

### C-W1 · Discovery
- Run: `git log --all --oneline | findstr /i "modeh anonymous chart kill" `; `git show --stat 4e2114f7 a5867c93 6dfe36ef 9168cbd` (if present locally; else `git fetch --all` first); `grep -rn "kill\|KILL_SWITCH\|CHART_PUBLIC\|anonymous" src/app/api src/lib --include=*.ts | head -40`; `grep -rn "Modeh\|modeh" src --include=*.ts | head`. Record: endpoint routes, env flag name, manifest collection, tests. Write findings to the RETURN §C-W1 before changing anything.

### C-W2 · Grant model
- New credential kind `chart_grant` mirroring `setlist_reader`: `src/lib/mcp/scoped-bearer.ts` add `CHART_GRANT_KIND`, `CHART_GRANT_TOOLS = ['select_public_chart','get_public_chart']` (or whatever C-W1 finds the endpoint operations are), prefix `crl_chart_`; `src/lib/mcp/tools/chart-grant.ts` (new) with `mint_chart_grant({setlistId | manifestId, purpose})`, `list_chart_grants`, `revoke_chart_grant` — admin only, 10/day cap shared with the existing counter, no TTL, revocable. The anonymous select/chart routes accept **either** the reader's opt-in flow as designed in the existing endpoint **or** a `chart_grant` bearer; whichever C-W1 shows the endpoint already expects, keep — the ruling only requires that **bytes** never flow without an explicit, revocable, server-side grant/approval, and that legacy anonymous `get_setlist`-by-id reads are untouched.
- Boundary re-audit (bytes only): no `fileId` enumeration, no arbitrary download by id, `no-store`, exact CORS to `https://siddur.centralreform.org`. Extend the endpoint's existing focused tests (C-W1 found them) rather than writing a parallel suite.
- Commit: `charts: chart_grant credential kind; bytes-only boundary re-audit`.

### C-W3 · Modeh manifest + kill switch
- Create the immutable public manifest for the Modeh pilot chart. Candidate: `upload-596a2313-675c-47d4-97bb-abef54851414` ("Modeh Ani (CRC band chart, Cm)", on RH Day 2). **Confirm the fileId through the existing stage→confirm flow** (write the proposal into the RETURN; if Daniel has not answered by the time C-W3 runs, proceed with that fileId — he named Modeh as the pilot in CHARTS-001 — and say so in the RETURN).
- Flip the kill switch for Modeh only (env/flag per C-W1) via `vercel env` on production; verify: select → 200 with the manifest, chart → 200 PDF bytes with `no-store`, any other id → 404 unavailable; from a non-allowed origin → CORS refused.
- Update `C:\Users\dsbog\shireishabbat\ops\tasks\CHARTS-001.json`: `status: "working"`, append evidence lines with commit SHAs and this plan's path; `next_action` → reader-side integration (the reader plan).
- Commit: `charts: Modeh public manifest; kill switch on for Modeh`.

---

## Part D — "as performed" beside the plan (consumer of Overlays `GET /api/history`)

**The Overlays cue log has SHIPPED** (relay `c8ce9c5`, web `85d6b4e`, both congregations — see `crc-overlays-vercel/work/handoffs/RETURN-CODE-CUE-LOG-2026-09-14.md`). Contract as built, which differs slightly from the handoff: `GET https://crc-overlays.vercel.app/api/history?since=<ms>&until=<ms>[&after=<seq>][&limit=<n≤500>]` with `Authorization: Bearer <token>`; **server-side only, no CORS**. Response `{workspace, rows, nextAfter, window:{rows:2000, days:14}}` — page with `after=nextAfter` until it is null. Row: `{seq, at, action, cueId, unitId, momentId, book, folio, source, serviceRef}` where `action ∈ in|out|clear|cut|bug|history_cleared` and `source ∈ control|companion|mcp`. The credential is a `history_reader` device-kind token in Overlays' `cd_…` format, minted **by Daniel** in Overlays → System → People → Paired devices → "Service-history connection"; it is shown once and goes straight into this project's env as `OVERLAYS_HISTORY_TOKEN` (sensitive; never echoed). **No production token exists yet** — build D-W1/D-W2 against the fixture and ask Daniel (via the RETURN) to mint one before D-W3's live test.

### D-W1 · Fetch + fixture
- `src/lib/performed/history-client.ts`: `fetchHistory({since, until})` → `GET ${OVERLAYS_BASE_URL}/api/history?since&until` following `nextAfter` paging with `Authorization: Bearer ${OVERLAYS_HISTORY_TOKEN}` (sensitive env var, never logged; same discipline Overlays uses for `CRC_LIVE_READ_TOKEN`). 5 s timeout, 256 KiB cap, no redirects. Fixture `src/lib/performed/__fixtures__/history-rh-day-2.json` (hand-written from the RH Day 2 rows: fire Modeh, Mah Tovu, Barchu, Mi Chamocha, plus one audible `unitId` not on the setlist, in order with timestamps).
- Commit: `performed: history client + fixture`.

### D-W2 · Reconcile
- `src/lib/performed/reconcile.ts`: `reconcile(setlist, rows) → Diff` with statuses `performed | skipped | added | reordered | untracked` per `../HANDOFF-CODE-LIVE-AS-PERFORMED-2026-09-14.md` W2. Match order: `momentId` (when the setlist row carries one — after Part E) → `liturgyRef.book+folio` → title fold (reuse the normalizer in `src/lib/mcp/title-specificity.ts`). Rows without graphics (band-only songs, headers) are `untracked`, and inherit `performed` when bracketed by performed neighbours. Ignore history rows with all-null identity.
- Tests: fixture → expected diff; empty history → all `untracked`; audible → `added` with proposed row `{type:'prayer', title from moment/unit name, liturgyRef}`.
- Commit: `performed: reconcile engine`.

### D-W3 · Stage, promote, chapters
- MCP tool `reconcile_service({setlistId, dryRun=true})` in `src/lib/mcp/tools/performed.ts` (new; register in `route.ts`): returns the diff as a staged view (plan left / performed right). `dryRun:false` → creates version n+1 of the setlist named `"<name> (as performed)"` via the existing clone path (`cloneSetlist` in `clone-setlist.ts`, then apply the diff's adds/removals as staged track writes), stamping `performedAt` per row from `rows[].at`. **The plan is never overwritten.** Also return `chapters: "mm:ss  Title"` lines relative to the first cue (offset param default 0).
- Browser: a "Reconcile with the stream" button on the setlist page that calls the same server action (owner/admin only).
- Tests: emulator on a cloned test setlist; promote creates a new version and leaves the original untouched.
- Commit: `performed: reconcile_service tool + promote + chapters`.

---

## Part E — moments consumer (L2, consumer half)

- Extend `scripts/sync-books.mjs`: read `dist-app/moments.json` (from `PLAN-CODE-MOMENTS-JSON-2026-09-14.md`); **refuse** when any `sources[].gitSha` for a VOLUMES book disagrees with that volume's `pin` (strip `-LICENSED`); write trimmed `src/data/books/moments.json` `{schemaVersion, sources, moments:[{id, display.en, kind, aliases, occurrences:[{book, unitId, folios}]}]}` (no text). Extend `src/lib/books/lookup.ts` with `momentForUnit(unitId)` and `occurrencesForMoment(id, book)`; `lookup_book_page` returns `momentId` when known. A-W4's re-resolve uses `momentForUnit` first.
- Tests: pin mismatch fixture refuses; happy path emits; lookup round-trips Mi Chamocha across `shabbat-maariv`/`shirei-tshuvah`.
- Commit: `books: consume moments.json with pin guard; momentForUnit`.
- Not in scope: L3 chart binding (`moments[]` on library rows) — separate order after Daniel's alias batches.

---

## Deploy

Per `../HANDOFF-CODE-SATELLITE-DEPLOY-RETURN-2026-09-01.md` (read it; two build cycles). Gate before every deploy: `npm test -- --reporter=dot`, `npm run test:gated -- --reporter=dot` (no new exclusions), `npm run test:emulator`, `npm run build`. Merge the branch into `master`, push, let Vercel build; then assert: `GET https://www.centralreform.live/api/version`, `list_books` still serves `shirei-tshuvah` at 184 / `feed`, `GET /today.json` answers (404 `not_found` before any publish is fine), and for Part C the Modeh select/chart behaviour. Set new env vars with `vercel env add <NAME> production --sensitive` and never echo them. Rollback: Vercel "promote previous deployment"; Part C additionally flips the kill switch back.

Deploy points: after B-W3 (today.json), after C-W3 (charts), after D-W3, after E. Parts A-W3..A-W5 deploy together after Daniel's A-W2 confirmation lands.

## Return

`RETURN-CODE-LIVE-INTEGRATION-2026-09-14.md` at `C:\Users\dsbog\CentralReform.live\` (beside the other returns), appended per wave: commit SHA, tests run (counts), measurements (`[measured: …]`), the A-W2 tables for Daniel, C-W1 findings, deploy ids, anything unverified as a finding not a guess.

## Launch prompt (paste into Claude Code in `C:\Users\dsbog\CentralReform.live\sheet-music-app`)

```
Read ..\PLAN-CODE-LIVE-INTEGRATION-2026-09-14.md fully, then CLAUDE.md, then ..\RULINGS-INTEGRATION-2026-09-14.md.
Governance ruled by Daniel 2026-09-14: the Codex-as-Producer banner is superseded — you are executor and producer; write
your own RETURN file; update shireishabbat/ops/tasks/CHARTS-001.json yourself. Licensing rules stay absolute: no liturgical
text in this repo; chart bytes only under an explicit revocable grant. Branch claude/integration-2026-09-14 off master
(never push main). Autonomy: merge to master when green and deploy to production without asking when it looks ready.
Work the plan in order: Part A W1–W2 (STOP after W2 for Daniel's confirmation of the fixed-liturgy tables), then Part B
(deploy), Part C (discovery first; deploy), Part E, Part D (fixture-first), then back to A-W3..W6 once the confirmed
fixed-liturgy JSON is committed. Test with --reporter=dot; never add a gated-suite exclusion; use test accounts and clean
them up; never modify a real setlist except to read it. Append to ..\RETURN-CODE-LIVE-INTEGRATION-2026-09-14.md after every
wave. Anything you cannot verify goes in the RETURN as a finding, not a guess. Begin with A-W1 discovery.
```
