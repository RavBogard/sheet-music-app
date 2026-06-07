# LANE — non-song row chart affordance (cowork #6, OPTION b) — coder-7

**Tier 2. Ships to prod tonight (full-send, Daniel-approved). ★ This touches the
BAND-FACING render surface used in tomorrow morning's service → a DEPLOYED prod
verify TONIGHT is REQUIRED before sign-off.** Cross-ref
`.coord/TRIAGE-cowork-2026-05-22.md` §"Daniel-decision" (#6=(b) DECIDED) +
`.paul/research/cowork-session-findings-2026-05-22.md` #6.

## Decision (Daniel 2026-05-23) = OPTION (b)
A `prayer`/`reading` track can carry a chart bond. The **Perform OPEN** half already
shipped (`perform-open-gate-fix` `60a96013c` — bonded non-song rows open in Perform
regardless of type). The remainder = the **authoring/editor render**: a bonded
non-song row must show the **full chart affordance** (looks bonded/tappable, opens
the chart) everywhere it renders, not just in Perform — NOT refuse the bond.

## Build
- Find the authoring/editor + any non-Perform render of setlist rows (e.g. the
  setlist editor row, the dashboard row, the bind picker) where a bonded
  `prayer`/`reading` row currently renders as bonded-but-hidden / no chart
  affordance. Make bonded non-song rows render the SAME chart affordance as a bonded
  song row (chart glyph, open action, "view/open chart", aria-label).
- Mirror the proven affordance from `perform-open-gate-fix` (full opacity, FileMusic
  glyph + chevron color-not-alone, aria-label "Open chart:", min-h-11 ≥44px).
- Header rows never get a chart affordance; song rows unchanged; no-fileId rows
  unchanged.
- **/ui-ux-pro-max MANDATORY** (frontend phase — [[feedback_ui_ux_skill]]).

## Gates + ship + ★ tonight verify
Real `npm ci`: tests for the invariants (header never shows chart; song still shows;
prayer/reading + fileId NOW shows full affordance + opens; no-fileId stays inert) ·
check:types · eslint · `next build --webpack` exit 0. Cut FRESH worktree off
`origin/master`; claim only the render component(s) you touch (disjoint from the MCP
lanes). SHIP-NOTICE → `inbox/auditor.md` (Tier 2).
**★ Because this is on tomorrow's service surface: after FF-push, run a DEPLOYED
prod check TONIGHT** (a real bonded non-song row renders the affordance + opens on
prod, iPad-webkit 820×1180) and report it in the SHIP-NOTICE — do NOT call the lane
done on unit-green alone. If anything looks off on prod, HEADS-UP supervisor (Vercel
rolls back instantly).
