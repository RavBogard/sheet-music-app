# Research brief: gap analysis 2026-10-31

You are one of five read-mostly researchers. Read `STATE.md` beside this file first; it holds
Daniel's alignment answers. Repo: `C:\Users\dsbog\centralreform.live\sheet-music-app`
(branch `master`). Read `CLAUDE.md` at the repo root once.

## What to produce
Write your findings to `docs/planning/2026-10-31-gap-analysis/research/<your-area>.md`. Do not
commit; the lead commits. Use this structure:

1. **How it works today.** Half a page at most: the real flow, with file:line anchors.
2. **Findings.** One row each, numbered `<AREA>-NN`, with:
   - type (bug / friction / gap / risk / dead-surface / sprawl),
   - persona(s) hurt,
   - severity (S1 service-breaking, S2 weekly pain, S3 annoyance, S4 polish),
   - evidence (file:line, doc quote, screenshot path or tool output; no claim without evidence),
   - the recommendation,
   - effort (XS under an hour, S under a day, M a few days, L a week or more),
   - whether it is a **quick safe win** (XS/S, no product-wording decision, no data migration,
     no change to the Overlays contract).
3. **Big bets.** Three to six bolder ideas for your area, each with the problem it solves, a
   sketch, the risks and the effort.
4. **Questions for Daniel.** Only genuine product decisions that the evidence can't settle.
   Give each a recommended answer.

## Rules
- Evidence first. Mark a finding PLAUSIBLE when you could not confirm it.
- Respect the standing constraints: never propose which setting or melody the band plays; row
  order is the author's; publish is retired and must not come back; no emails or assignment
  scheduling for Daniel; no photo-of-paper import; no cover art; MusicXML is the strategic
  format; monitors are "wedges", not IEM; "Vocal Lead", not "Leader".
- Prod test data is allowed only with the `test-gap-` prefix, and you must clean it up and say
  so in your report. Never modify or delete real data.
- Planning docs: the recent ones (`docs/planning/2026-09-19-audit/`, `2026-09-22-david-asks/`,
  `2026-10-12-multitenant/`, `2026-10-20-*`, `2026-10-30-setlist-memory/`) are the richest.
  Skim `archive/` only for history.
- Don't run full test suites or builds.
- Your final reply to the lead must be under 20 lines: the path of your file, the five most
  important findings in one line each, and anything you couldn't do.
