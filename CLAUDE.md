# CLAUDE.md — sheet-music-app (centralreform.live)

## Governance (R-0919-audit-8)

Each Claude Code session is **executor and producer for this repo**. It measures its own
expectations, writes its own task record and return, and deploys to production when the work
looks ready. There is no producer to report to, no board row to open before starting, and no
approval checkpoint between a finished change and a deploy. This is the model the 2026-09-14
master plan set; the 2026-09-19 audit made it the only one.

Orders and returns live in `docs/planning/<date>-<topic>/`, tracked in git. The repo root keeps
`README`, `CLAUDE`, `AGENTS`, `CHANGELOG`, `COORDINATION` and the config — nothing else.

Working notes, returns and commit messages are in plain language: say what happened and what is
worth noticing. Commits no longer carry a `Lane:` trailer.

Subagents run on **Opus or Sonnet** (R-0919-audit-9) — surveying, drafting and checking. The top
tier is not used for subagents.

The family coordination law is canonical at `~/shireishabbat/COORDINATION.md` (see the stub
`COORDINATION.md` beside this file). It is rewritten to this one model. The `STATUS.md` baton
board is retired: work here does not open a row before touching liturgy data.

## What this is

The congregation's sheet-music app at **centralreform.live** plus the **centralreform.live MCP
server**. Daniel ("Rabbi Daniel") authors here from Claude Desktop over MCP — setlists, charts,
musicians, monitor mixes. The browser app is the BAND's surface: Perform mode on the
congregation's fleet of iPads, which must be bulletproof; nothing is fixable live mid-service,
so reliability comes from self-healing and pre-service checks, never from alerts during a
service.

**Brothers Lazaroff is a live second tenant** (`brotherslazaroff.live`, gigs). Multi-tenancy is
in production: a change to a shared surface — Firestore rules, a query, an emitted file — is a
change to both tenants, and the emulator tests assert both.

## Git in this tree

- **Git runs HOST-SIDE only.** Readouts through a mounted copy of this tree are untrusted:
  ~1,900 phantom CRLF whole-file modifications and multi-minute `status` timeouts, one of which
  returned a false clean (`docs/planning/archive/AUDIT-FAMILY-2026-09-01.md`). Treat a mount as
  files-only.
- The branch of record is `master`, and it is the only branch of record. **There is no `main`
  branch here, local or remote** — `origin/HEAD` points at `origin/master`. The old "`origin/main`
  is stale (April), FOR DANIEL" question was resolved by deletion; it is not an open question and
  nothing should be pushed to `main`.

## Family data this repo consumes

`src/data/books/*.json` — the book/pagemap registry. A PRINTED volume's registry rows generate
from its press commit, never HEAD (R-0831-live-pagemap-1); page call runs on the PRINTED
edition's numbers (R-0901-vision-2). Never hand-edit a derived registry row — regenerate from
the producer (`shireishabbat/build/tools/emit_live_books.py`). Known standing issue, PARKED by
Daniel (R-0901-cont-1 §3): the deployed registry has served `shirei-tshuvah` at 248pp against
the printed 202/204 — a stale deploy.

## Standing constraints

- **No liturgical text in this repo.** Ids, names and page numbers only. Chart bytes never leave
  it except through the approved public-reader grant (`docs/READER-PUBLIC-CHART-BOUNDARY.md`).
- **Row order is the author's** (R11-b, 2026-09-16). Nothing re-sorts, inserts or deletes a row
  on an existing setlist outside an explicit author action.
- **Publish is retired** (R-0919-audit-3). Nothing was ever published; `today.json` emits from
  unpublished setlists. Do not re-add it in any form. Telling the band is its own action —
  `/api/setlist/notify-band`.
- **Never propose which setting or melody the band plays.**
- Non-family agent frameworks (CARL, PAUL, Gemini/GSD) are RETIRED here: if you find their config
  active, that is a defect.

## Development posture

Active. The 2026-09-14 integration program and the 2026-09-19 audit both run here; the earlier
"keeping development QUIET" posture (R-0901-cont-1 §3) is superseded. Current work is in
`docs/planning/2026-09-19-audit/`.
