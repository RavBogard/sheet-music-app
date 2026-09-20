# HANDOFF → a new Cowork thread (any account): "One Service, Four Surfaces" — continuation

Written 2026-09-15 ~01:00Z by the Fable Cowork session that ran the integration review with Daniel on 2026-09-14. Daniel is out of usage on that account; pick this up cold. Assume no prior context. Everything is on disk on `bongo` (Daniel's Windows machine) and in the published artifact.

## Who / how to work with Daniel (binding)

- Decisions in prose, context first, then the ask; he answers free-form. Never a bare question. End **every** message with (a) things he must do and (b) questions he must answer, each with its own context.
- "Faster and better, not slower and more bureaucratic." Only Daniel worries about dates — give cost and shape, never a schedule.
- Never suggest musical settings/melodies. Report what a book prints.
- Use Opus/Sonnet subagents for grunt work (reading, surveying, drafting, checking); spend Fable only on judgement and synthesis.
- Governance ruling 2026-09-14: the repos' "Codex is Producer" banners are **superseded**. Claude Code (Opus) sessions are executor and their own producer; Cowork = sittings with Daniel + writing plans/handoffs. He may be asked to deploy; sessions may deploy to production without asking when green.

## The four systems

| System | Repo on bongo | Live |
|---|---|---|
| shireishabbat — liturgy source of truth (Typst → PDFs + JSON feeds in gitignored `dist-app/`, stable unit ids `section.unit@occasion-service`) | `C:\Users\dsbog\shireishabbat` (+ worktree `C:\Users\dsbog\shireishabbat-moments`) | github RavBogard/shirei-tfilah |
| centralreform.live (".live") — band setlists/charts/mix, Next.js 16 + Firestore + Vercel, MCP server; branch of record **`master`** | `C:\Users\dsbog\CentralReform.live\sheet-music-app` | https://www.centralreform.live |
| Overlays — Singular replacement for stream prayer-text graphics; Vercel + Neon + Cloudflare relay; Michael (vMix + Companion) at CRC, Simone (OBS) at TBI | `C:\Users\dsbog\crc-overlays-vercel` (branch `codex/product-expansion`) — NOT `crc-overlays` (stale) | https://crc-overlays.vercel.app |
| Siddur web reader — single-file PWA, page call by printed number, no accounts | `C:\Users\dsbog\shirei-tshuvah-desktop-reader` (branch `codex/desktop-reader-ux`) — `shirei-tshuvah-web` is stale | https://siddur.centralreform.org |

## What was decided (full record: `RULINGS-INTEGRATION-2026-09-14.md`, in all four repos)

Approved: (1) build `moments.json` — stem-level prayer identity shared by all apps; (2) the setlist is the whole service — fixed liturgy rows in the weekly templates, hidden from the band's Perform mode; (5) `today.json` — metadata-only "what tonight is" from the published setlist, read by the reader and Overlays; (6) unblock the reader chart panel (old setlist links stay readable; chart bytes only via explicit revocable grants); (7) the Overlays cue log as the service's ground truth → "as performed" setlist beside the plan, never replacing it.
Declined: page numbers on the stream; pinning Overlays' siddur library (manual refresh is fine). Deferred: Companion "Today's order" slot buttons; Neon exit; live "now" pointer (`/api/now` stays dark); reader follow mode; family-as-a-product for other shuls (eventual). Accepted as-is: setlist-import thresholds 80/45 and "Not needed" label.

## Where the work stands (verified on disk 2026-09-15 ~00:57Z after Daniel's reboot — nothing half-written)

**Plans** (order of record for each Claude Code session): `PLAN-INTEGRATION-MASTER-2026-09-14.md` in every repo; per repo `PLAN-CODE-MOMENTS-JSON…` (shireishabbat), `PLAN-CODE-LIVE-INTEGRATION…` (CentralReform.live root), `docs/planning/2026-09-14-integration/PLAN-CODE-OVERLAYS-CUE-LOG…` (Overlays), `PLAN-CODE-READER-INTEGRATION…` (reader). Each ends with a launch prompt.

1. **shireishabbat — DONE, stopped at its planned STOP.** `RETURN-CODE-MOMENTS-JSON-2026-09-14.md` at repo root. Merged to main: `build/tools/emit_moments.py`, `moments_gate.py` (+tests), `PRODUCER.md` governance paragraph. Census: 344 moments / 740 occurrences / 13 books / 720 pairs; gate 6/6; check.sh 15 pre-existing fails, 0 new. `ops/tasks/MOMENTS-001.json` = `review`, next: **Daniel confirms alias batch 1**. Artifacts (`dist-app/moments*.json`) are gitignored and live in the worktree `shireishabbat-moments` (not connected to Cowork; request folder access to verify). Findings left unfixed by design: `build-app.sh` worktree-cleanup bug that silently drops the machzor and exits 0 (§7.1); WSL/Windows git-worktree trap (§7.2); a `kind` mid-stem question (§6.1).
2. **Overlays — SHIPPED.** `work/handoffs/RETURN-CODE-CUE-LOG-2026-09-14.md`. Relay `c8ce9c5` on both workers, web `85d6b4e` on both congregations. `GET /api/history?since&until[&after][&limit]` (bearer, server-side only, no CORS; `{workspace, rows, nextAfter, window}`; rows `{seq, at, action, cueId, unitId, momentId, book, folio, source, serviceRef}`; liturgy joined at read time so `momentId` appears retroactively once `moments.json` lands). Credential `history_reader` = a `cd_…` device token minted in Overlays → System → People → Paired devices → "Service-history connection" — **no production token minted yet; Daniel does it**. Monday workflow already adopts `dist-app/moments-pairs.json` → `content/moments.json`.
3. **CentralReform.live — PARTIAL by design.** `RETURN-CODE-LIVE-INTEGRATION-2026-09-14.md` (41 KB) at `CentralReform.live\`. Branch `claude/integration-2026-09-14`, production on `093c6928fc`. Part A: W1 done; **W2 = STOP — four fixed-liturgy proposal tables await Daniel** at `sheet-music-app\work\fixed-liturgy-proposal-{crc-friday,crc-saturday,shabbat-maariv,shabbat-shacharit}.md`; A-W3–W6 held. Part B (`today.json`) DONE and deployed — `/today.json` 404s until a setlist is published (designed); a `/login` redirect defect was caught and fixed; **B-W2 needs Daniel's real service start times + stream URL**. Part C: discovery done; **C-W2/3 blocked** — the anonymous Modeh chart endpoints 404 in production and CHARTS-001's SHA `4e2114f7` is the tip of unmerged `codex/reliability-batch-20260906`, not on master; the return offers options 1/2/3 for Daniel; `chart-grant.ts` deliberately not built. Part D (as-performed) DONE except the browser button; dark until `OVERLAYS_BASE_URL`/`OVERLAYS_HISTORY_TOKEN` are set. Part E (moments consumer) DONE in code; `sync:books` refuses because `dist-app/` was built at `7d2cbcc+dirty`, not pin `6f61874-LICENSED` → `src/data/books/moments.json` ships empty. Gates 4369 pass / 0 fail. Known red `registry.test.ts` (folio 145 vs pages 144) **will bite A-W3**. `shireishabbat/ops/tasks/CHARTS-001.json` NOT updated (still `blocked`, rev 9, 8 days stale, SHA evidence wrong).
4. **Reader — DONE for today.json (READER-010); CHARTS-001 W6 deliberately not done.** `RETURN-CODE-READER-TODAY-2026-09-14.md` + `RETURN-CODE-CHARTS-001-2026-09-14.md` in worktree root. 44 guards green on phone projects, no new red; release stamped `6854651d…`. Branches `code/reader-integration` and `code/reader-today-main` are **local, unpushed, not deployed**. Flags: evening times render `6:00` with no meridiem; `today.json` outranks a dated book on a High Holy Day; `chart-reader.js` loads PDF.js from `cdn.jsdelivr.net` (egress allowlist will refuse); W6 convergence waits on DESKTOP-UX-001 (192 red guards).

## What next (in this order)

1. **Sitting with Daniel — the two STOPs.** (a) Four fixed-liturgy tables (.live A-W2): bring them into chat as tables; he confirms/edits order per book; commit as `src/data/templates/fixed-liturgy.<book>.json`; relaunch the .live session for A-W3–W6 (fix the folio-145 registry red first). (b) Alias batches (shireishabbat W5): `liturgy-map/ALIAS-BATCHES-2026-09-14.md`, 67 moments in 3 batches + 48 unmatched pagemap entries; confirmed aliases go to `liturgy-map/moment-aliases.json`; rerun the producer.
2. **Daniel's small inputs:** service start times + stream URL (B-W2, via the `update_congregation_services` MCP tool); mint the production `history_reader` token in Overlays and set `OVERLAYS_BASE_URL` + `OVERLAYS_HISTORY_TOKEN` on .live (Part D comes out of the dark); rule on Part C options 1/2/3 in the .live return.
3. **Mechanical follow-ups for a Code session:** rebuild shireishabbat `dist-app/` at press pin `6f61874-LICENSED` (or rule to move the pin) so .live Part E's `sync:books` accepts moments; fix `build-app.sh` §7.1; push/merge/deploy the reader branch `code/reader-today-main` after ruling on the PDF.js CDN and the two flags; correct `CHARTS-001.json`.
4. Later: L3 chart↔moment binding on library rows (after aliases); the deferred list.

## Reference

- Review artifact: "One Service, Four Surfaces" (claude.ai artifacts gallery, favicon 🕯️) — statuses, seams, ideas.
- Earlier per-idea handoffs `HANDOFF-CODE-*-2026-09-14.md` (superseded by the plans; kept for provenance) sit beside the plans.
- Memory (if the new account shares Daniel's memory): `/areas/crc-music-platform.md`, `/areas/crc-overlays.md`, `/areas/siddur-machzor.md`, `/preferences.md` carry the rulings.
- Connected folders needed in the new thread: `crc-overlays-vercel`, `shireishabbat`, `shireishabbat-moments`, `CentralReform.live`, `shirei-tshuvah-desktop-reader`. `device_bash` is broken on bongo since a Sept 8 Windows update — use `device_list_dir` / `device_stage_files` / `device_commit_files`.
