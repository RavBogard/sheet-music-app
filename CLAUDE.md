# CLAUDE.md — sheet-music-app (centralreform.live)

> **FAMILY POLICY — read before anything else (rule 12, R-0901-vision-4).** This repo is the
> music/setlist SATELLITE of a three-repo family worked in parallel by multiple Claude instances
> under multiple accounts. The law is `~/shireishabbat/COORDINATION.md` (see the stub
> `COORDINATION.md` beside this file). The family baton board is `~/shireishabbat/STATUS.md`:
> the moment work here reads or writes liturgy data or another family repo, open a row there
> with path claims. Every commit carries a `Lane: <slug> (<surface>)` trailer (rule 13).

## What this is

The congregation's sheet-music app at **centralreform.live** plus the **centralreform.live MCP
server**. Daniel ("Rabbi Daniel") authors here from Claude Desktop over MCP — setlists, charts,
musicians, monitor mixes. The browser app is the BAND's surface: Perform mode on the
congregation's fleet of iPads, which must be bulletproof; nothing is fixable live mid-service,
so reliability comes from self-healing and pre-service checks, never from alerts during a
service.

## Division of labor (rule 9, applied here)

Fable Cowork = vision/policy sittings with Daniel. Opus Cowork = analysis, verification,
preparing changes. **Code = execution: verify, commit, push — all git is Code's here.** A
vision-level question found mid-execution routes to a Cowork sitting, never settled in-flight.

## Git in this tree (rule 8 addendum, R-0901-vision-4)

- **Git runs HOST-SIDE, by Code, only.** Readouts through the Cowork mount are untrusted here:
  ~1,900 phantom CRLF whole-file modifications and multi-minute `status` timeouts, one of which
  returned a false clean (AUDIT-FAMILY-2026-09-01.md). Cowork treats this mount as files-only.
- The branch of record is `master`. `origin/main` is stale (April) — resolution is a FOR DANIEL
  question in `../HANDOFF-CODE-SATELLITE-ADOPTION-2026-09-01.md`; until he rules, do not push
  `main` anywhere.
- Commit trailer: `Lane: <slug> (<surface>)`.

## Family data this repo consumes (rules 5–6)

`src/data/books/*.json` — the book/pagemap registry. A PRINTED volume's registry rows generate
from its press commit, never HEAD (R-0831-live-pagemap-1); page call runs on the PRINTED
edition's numbers (R-0901-vision-2). Never hand-edit a derived registry row — regenerate from
the producer (`shireishabbat/build/tools/emit_live_books.py`). Known standing issue, recorded on
the family board and PARKED by Daniel (R-0901-cont-1 §3): the deployed registry has served
`shirei-tshuvah` at 248pp against the printed 202/204 — a stale deploy. Do not chase it outside
a family row.

## Development posture

Daniel is keeping development here QUIET for now (R-0901-cont-1 §3). Policy adoption and hygiene
proceed under R-0901-vision-4; the handoff-to-this-repo about what the family built, and the
integration plan, come later and take their own family row and ruling. Non-family agent
frameworks (CARL, PAUL, Gemini/GSD) are RETIRED here (rule 14): if you find their config active,
that is a defect — see the adoption order.
