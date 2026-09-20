# One Service, Four Surfaces — master order for the Claude Code sessions

Ruled by Daniel 2026-09-14 (see `RULINGS-INTEGRATION-2026-09-14.md`). Executor: Claude Code on Opus, one session per repo. This file says which session to open first and what each hands to the next. Nothing here is a schedule — open the next session when the previous one's return file says its hand-off artifact exists.

## Governance, once

Every repo carries a "Codex is Producer" banner. **Superseded for this work.** Each session is executor and producer for its own repo: it writes its own return file, updates `shireishabbat/ops/tasks/*.json` where a task exists, and never waits for Codex. Licensing safeguards are untouched (chart bytes never enter shireishabbat or fork-facing surfaces; liturgical text never enters centralreform.live; printed volumes pin to their press commit). Autonomy: branch per plan → merge when green → deploy to production without asking when it looks ready. Exactly two `STOP — Daniel confirms` points across the whole program: the fixed-liturgy order per book (.live plan A-W2) and the moment alias batches (shireishabbat plan W5). The shireishabbat session also appends the governance paragraph to `PRODUCER.md` so future sessions do not trip on the banner.

## Order and hand-offs

| # | Repo · plan | Produces for others | Needs from others |
|---|---|---|---|
| 1 | **shireishabbat** · `PLAN-CODE-MOMENTS-JSON-2026-09-14.md` | `dist-app/moments.json`, `dist-app/moments-pairs.json`, alias-candidate tables (→ Daniel) | nothing |
| 2 | **crc-overlays-vercel** · `docs/planning/2026-09-14-integration/PLAN-CODE-OVERLAYS-CUE-LOG-2026-09-14.md` | `GET /api/history` + `history_reader` credential (one raw token, handed to .live's env, never chatted); weekly workflow copies `moments-pairs.json` → `content/moments.json` | #1 optional — works with an empty moments file |
| 3 | **CentralReform.live** · `PLAN-CODE-LIVE-INTEGRATION-2026-09-14.md` | `/today.json` (Part B); Modeh chart endpoint live (Part C); consumes moments (Part E); consumes history (Part D) | #1 for Part E; #2 for Part D (fixture-first, so it can start before #2 lands) |
| 4 | **shirei-tshuvah-desktop-reader** · `PLAN-CODE-READER-INTEGRATION-2026-09-14.md` | the reader reads `today.json`; reader-side chart panel (off by default) | #3 Part B (fixture-first, can start before) and Part C (Modeh switch on) |

Sessions 1 and 2 are independent and can run in parallel. Session 3 can start any time (its Parts A, B, C need nothing); Part E waits for #1, Part D for #2. Session 4 can start any time on fixtures; its release waits for #3 Part B and C.

## Daniel's two sittings

1. **Fixed-liturgy order.** Session 3 writes four tables (Friday × 2 books, Saturday × 2 books) into its return and stops Part A. Daniel confirms/edits in Cowork; the confirmed JSON is committed; session 3 resumes A-W3.
2. **Alias batches.** Session 1 writes `dist-app/moments-alias-candidates.json` and markdown tables of ~25 stems each. Daniel confirms in Cowork batches; confirmed aliases land in `liturgy-map/moment-aliases.json`; the producer merges them on every run. This unblocks L3 chart binding (a later order, not in these plans).

## What is deliberately not in these plans

Page numbers on the stream (declined). Companion "Today's order" slot buttons (deferred). Neon exit (deferred — the outage has passed). `/api/now` stays dark; no live pointer, no reader follow mode (declined for now). Overlays siddur-library pinning (declined — manual refresh is enough). L3 chart↔moment binding (after alias batches). The family as a product for other shuls (eventual).

## Where the files are

- Rulings: `RULINGS-INTEGRATION-2026-09-14.md` in shireishabbat root, CentralReform.live root, and `crc-overlays-vercel/docs/planning/2026-09-14-integration/`.
- Plans: shireishabbat root; CentralReform.live root (parent of `sheet-music-app`); `crc-overlays-vercel/docs/planning/2026-09-14-integration/`; shirei-tshuvah-desktop-reader root. This master file sits beside each.
- Original per-idea handoffs (superseded by the plans, kept for provenance): same locations, `HANDOFF-CODE-*-2026-09-14.md`.
