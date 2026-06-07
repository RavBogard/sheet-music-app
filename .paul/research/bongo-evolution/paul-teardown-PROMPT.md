# Lane: bongo-evo-paul-teardown (coder-5) — Tier 0, READ-ONLY

## Context
**Bongo Evolution Phase 1** (see `.paul/research/bongo-evolution/ROADMAP.md`). bongo —
the parallel-agent coordination system — wants to mine **/paul** for design practices
worth adopting. **READ-ONLY:** no code edits, no edits to paul source or bongo files;
docs-only output. Dig **intensely**, not a skim. Symmetric with the gsd teardown
(coder-7) so the two FINDINGS compare cleanly at synthesis.

> If the auditor BLOCKs your just-shipped PGR-01 (`3492af225`), that fix takes priority —
> bounce back to it; this research is interruptible.

## Source
`~/.claude/commands/paul/` (~44 `.md` files — commands, tasks, templates). Read broadly
AND deeply. Cross-reference the paul skills in the session skill list (plan, apply,
discover, audit, unify, verify, plan-fix, handoff, resume, milestone, init, progress,
research, map-codebase, register).

## Lens — for EACH axis, extract the pattern + judge fit for bongo's PARALLEL-AGENT model
1. **Command/skill structure & composition** — naming, namespacing, args, chaining.
2. **State persistence across context resets** — `.paul/` layout, the satellite manifest
   (`paul.json`, `/paul:register`), how a fresh session restores context.
3. **Workflow lifecycle** — discover→plan→apply→verify→unify; PLAN docs; milestones;
   add-phase / remove-phase; consider-issues triage.
4. **Subagent orchestration** — how paul uses subagents for discover/research/map-codebase
   (paul is largely single-thread — note where it ISN'T, and what bongo's concurrency adds).
5. **Verification/validation discipline** — audit (enterprise architectural audit),
   verify (UAT), plan-fix, unify (reconcile plan vs actual — close the loop).
6. **Quality gates & checkpoints** — assumptions surfacing, audit gates before apply.
7. **Config & flows** — config, flows (specialized workflow integrations).
8. **Resume / handoff** — handoff, resume, pause, progress routing (continue-in-order).
9. **Init / onboarding** — init conversational setup, register for legacy projects.

## Deliverable — NEW `.paul/research/bongo-evolution/paul-teardown-FINDINGS.md`
- **§1 paul architecture overview** — the model in ~1 page.
- **§2 per-axis findings** — the 9 axes above, concrete (cite the paul file).
- **§3 TOP patterns bongo should ADOPT** — ranked, each with *how it maps to bongo's
  parallel-agent model* (concrete: which `.coord/` file or slash command would change).
- **§4 ADAPT** — single-thread ideas needing rework for concurrency.
- **§5 REJECT / anti-patterns** — what NOT to copy + why.
- **§6 open questions for synthesis** (Phase 2).
- **§7 paul-vs-gsd seam** — note any axis where paul and gsd diverge sharply, so the
  synthesis can pick the better of the two.

## Hard rules
READ-ONLY — do NOT edit paul source, bongo files, or any repo code. Do NOT run paul
commands. Docs-only output to the path above. Tier-0 research. Depth over speed.
SHIP-NOTICE to supervisor when committed (docs-only cherry-pick onto fresh origin/master).
Worktree off current origin/master.
