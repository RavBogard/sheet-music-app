# PLAN — Audit follow-through, master order, 2026-09-19

One copy in each of the four repos. It says which repo does what, in which wave, and what each wave waits
on. The per-repo `HANDOFF-CODE-AUDIT-2026-09-19.md` carries the items themselves; `RULINGS-AUDIT-2026-09-19.md`
carries Daniel's decisions. Read all three before starting.

## How to run it

- One Claude Code (Opus) session per repo, each its own executor and producer (R-0919-audit-8). Subagents
  on Opus or Sonnet only (R-0919-audit-9).
- Wave 1 in all four repos runs in parallel: nothing in it depends on another repo except where marked.
- A wave ends with a `RETURN-CODE-AUDIT-2026-09-19-W<n>.md` beside the handoff. The next wave in a repo
  that waits on another repo's return starts when that return exists — check the other repo, do not wait
  for a message.
- Deploy to production when the work looks ready (09-14 ruling). Plain-language notes and commit messages.
- Only Daniel worries about dates. Nothing here is sequenced against the calendar.

## Repos, worktrees, branches

| Repo | Working tree | Branch | HEAD at audit |
|---|---|---|---|
| shireishabbat | `C:\Users\dsbog\shireishabbat` | `main` | `1854db8` |
| shirei-tshuvah-web (reader) | `C:\Users\dsbog\shirei-tshuvah-web` | `main` (deploys) | `334e172` |
| sheet-music-app (.live) | `C:\Users\dsbog\CentralReform.live\sheet-music-app` | `master` (deploys) | `3abade1715` |
| crc-overlays (Overlays) | `C:\Users\dsbog\crc-overlays-vercel` | `google-signin` == `main` (main deploys CRC; TBI by CLI) | `1f9a5f3` |

The folder `C:\Users\dsbog\crc-overlays` is a stale checkout, not the app.

## Wave 1 — independent, all four in parallel

**shireishabbat** — governance collapse (one regime; banners out; ops queue, desks, STATUS archived);
docs consolidation (`planning/<date>-<topic>/`, returns tracked, root to ~10 files — move under
`planning/` BEFORE tracking, because `RETURN-*.md` is forbidden on the mirror by neither `.gitignore` nor
`export-scan.sh` today); `crc-neilah` `when`; 3 content-floor rows; `licensed-paths.json` ↔ `.gitignore`;
Torah window; `check.sh` once in CI; **moments agreement check** (`build/tools/moments_agree.py`, canonical
— consumers adopt it in their Wave 2); **`dist-app/` published from CI** with a provenance file
(consumers switch to it in Wave 2); push the 39 local-only `codex/*` branches; update the CHARTS-001,
MOMENTS-001, READER-010 task records.

**reader** — first: push `codex/serial-chart-integration` and `codex/desktop-reader-ux` (and the other
chart-chain branches) to origin. Then: release stamp as a real CI gate + pre-push hook; delete `#dlegacy`
and decide `#pick`; `sync-books --check` in CI; prune merged worktrees/branches; move the 31 V3 returns;
`vercel.json` cache headers and the `/braille` noindex exemption (R-0919-audit-12); CLAUDE.md rewrite
(banners out, 13 books, corrected sweep figure, findings prose to a log); the four id carries (R9-b, R2-a
×3 — confirm the surviving spellings against the source first); README origins.
Waits on shireishabbat W1 for one thing only: re-sync `crc-neilah` after its `when` claim lands.

**.live** — read the Firestore item in full before touching it: `get` public, `list` signed-in, and BOTH
signed-out `/perform` list paths (setlist listing and tracks-by-setlistId) move server-side, emulator tests
for both tenants, a signed-out browser check before the rule ships. Retire Publish (R-0919-audit-3; see the
note on notifications below). `today.json` cron every 15 min + staleness assertion + visible failure.
`build-bridge.yml` fixed or deleted; bridge docs/version reconciled. `.env.example` regenerated. Stray
files gone. Worktrees/branches pruned; CLAUDE.md's `origin/main` paragraph corrected (there is no `main`).
Wrapper-folder docs into git under `docs/planning/`. Web vitals on `/library`, `/setlists/[id]`, `/login`.
AI review queue cleared under the new 0.90 gate (dryRun first). `scripts/` layout.

**Overlays** — **cue-log liturgical position first** (relay `protocol.ts:160` and `service-history.ts:55`
prefix filters; `liturgy-index.ts` bare-id fallback + logged miss; relay released to both workers; one fired
cue returns a row with unitId/momentId/book/folio). **CI before the hostname sweep** — the sweep is the
first substantial change this repo would make without a suite behind it. Then: `.env.example`; hostname
drift (mind `scripts/build-tbi-companion-module.mjs:166,183`'s exact-count replace and the four tests that
pin the old host); TBI deploy record or git integration; `RELEASE-STATE.md` out of `CLAUDE-HANDOFF.md`;
prune worktrees/branches, delete 5 unreferenced scripts, fast-forward or delete the stale checkout; verify
the MCP publish chain once; record R-0919-audit-7.

## Wave 2 — cross-repo, in this order of dependency

1. **Consumers adopt the moments agreement check** (reader, .live, Overlays) — waits on shireishabbat W1.
   Expected first result: the reader is missing R9-b and three R2-a merges; Overlays is missing R6-h and
   R9-b. The reader's carries are its W1 item; Overlays regenerates from source on its Monday workflow or
   by dispatch.
2. **Consumers pull `dist-app/` from the published artifact** (reader `sync-books --from-url`, .live
   `sync:books --from-url`; Overlays' workflow may switch from building the whole repo to fetching the
   artifact) — waits on shireishabbat W1. Pin guards stay.
3. **Reader CHARTS-001** — rebase the 13 commits onto `main`, vendor pdf.js (expect a wire-ceiling
   re-derivation), land behind the switch. .live's endpoint is already on; the allow-list grows per approved
   chart. Waits on reader W1 (branches pushed).
4. **Reader DESKTOP-UX-001** — apply R-0919-audit-10..13, re-point the 192 desktop guards per guard,
   diagnose `daypart.spec.js` ×7 first, merge. Waits on reader W1.
5. **`crc-friday` / `crc-saturday` unit identity** — .live registers the legacy Shabbat feeds as feed-tier
   books beside the pagemaps; shireishabbat confirms those feeds carry unit ids and printed folios. Then
   moments reach ordinary Shabbat.
6. **"Returning the Torah" p.90 vs p.89** — STOP until Daniel says what the printed booklet prints; then
   .live or the reader fixes its side and .live runs the normalized name comparison for the rest.
7. **Overlays rename forwarding** — retirement/forwarding list mirroring .live's `RETIRED_UNITS`; source
   commit stamped on each published cue. Waits on Overlays W1 CI.
8. **.live MCP surface split** (authoring vs ops bearer; retire completed backfills); **iPad Perform** specs
   un-skipped (hardware acceptance is Daniel's afternoon).
9. **shireishabbat `check.sh` exits 0** (declared exemptions with ruling ids); large-print folio-map gate;
   **feed round-trip DESIGN** return for Daniel (emit from Typst vs sidecar) — this ruling gates Wave 3.
10. Overlays: strip 50 unused components; split `app/author/page.tsx`; reader: cross-release upgrade guard,
    WebKit in CI.

## Wave 3 — after human gates

- **Overlays rehearsal with Michael** (Daniel's) → one real service logged → Overlays confirms `/api/history`
  rows carry position for every library-backed cue → **.live runs `reconcile_service` once** against real
  rows, records the result, then builds the plan-vs-performed view (promote-by-clone already exists).
- **Feed round-trip implementation** (shireishabbat + reader, several sessions) — after Daniel rules on the
  Wave 2 design return. This is what ends hand-patched feeds and the three-copy drift for good.

## Note on R-0919-audit-3 (Publish) — one interpretation to confirm

`/api/setlist/publish` is not only the `publishedAt` stamp; it is also the "tell the band" path (in-app
notification, push, email, SMS to assigned musicians). The ruling was made on the fact that the stamp has
never been used. Interpretation adopted until Daniel says otherwise: **retire the stamp, the snapshot and
the word "Publish"; keep the notification capability as its own plainly named action ("Notify band") if
the other notify routes (`resend-email`, `email-packets`, `notify-updated`) do not already cover every
channel.** The .live executor confirms which and says so in the W1 return.

## Coordination points

- `ops/tasks/CHARTS-001.json` and `BRAILLE-004.json` in shireishabbat are touched by both the shireishabbat
  and reader sessions — one edits, the other reads; say which in the return.
- The reader's `crc-neilah` re-sync is the only Wave 1 cross-repo dependency.
- Overlays' Monday `siddur-library.yml` regeneration lands on `main` (correct). If the reader's carries and
  the regeneration disagree, the moments check says so; the source (shireishabbat) is right by definition.
