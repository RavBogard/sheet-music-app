# Lane: bongo-evo-gsd-teardown (coder-7) — Tier 0, READ-ONLY

## Context
**Bongo Evolution Phase 1** (see `.paul/research/bongo-evolution/ROADMAP.md`). bongo —
the parallel-agent coordination system you help run — wants to mine **/gsd** for design
practices worth adopting. You're bongo's longtime owner → ideal digger. **READ-ONLY:**
no code edits, no edits to gsd source or bongo files; docs-only output. This is the
bigger of the two frameworks — dig **intensely**, not a skim.

## Source
`~/.claude/commands/gsd/` (~95 `.md` files — commands, agents, templates, tasks). Read
broadly AND deeply. Cross-reference the gsd skills you can see in the session skill list
(new-project, plan-phase, execute-phase, debug, verify-work, map-codebase, health,
add-tests, set-profile, etc.).

## Lens — for EACH axis, extract the pattern + judge fit for bongo's PARALLEL-AGENT model
1. **Command/skill structure & composition** — naming, namespacing, argument handling,
   how commands chain.
2. **State persistence across context resets** — where/how gsd stores project state
   (`.planning/` etc.), how a fresh session picks up.
3. **Workflow lifecycle** — the research→plan→execute→verify cycle, phases, milestones,
   roadmaps, decimal/insert phases, cleanup/complete-milestone.
4. **Subagent orchestration & parallelization** — parallel mapper agents, wave-based
   execution, planner/checker/verifier/researcher agent split. **This is closest to
   bongo's core — compare hard.**
5. **Verification/validation discipline** — Nyquist validation, plan-checker,
   verify-work UAT, integration-checker, verifier agents, add-tests.
6. **Quality gates & checkpoints** — assumptions surfacing, plan verification loops,
   health diagnostics/repair.
7. **Config & model profiles** — quality/balanced/budget profiles, settings/toggles.
8. **Resume / handoff** — resume-work, pause-work, progress routing.
9. **Init / onboarding** — new-project, new-milestone deep context gathering.

## Deliverable — NEW `.paul/research/bongo-evolution/gsd-teardown-FINDINGS.md`
- **§1 gsd architecture overview** — the model in ~1 page.
- **§2 per-axis findings** — the 9 axes above, concrete (cite the gsd file).
- **§3 TOP patterns bongo should ADOPT** — ranked, each with *how it maps to bongo's
  parallel-agent model* (concrete: which `.coord/` file or slash command would change).
- **§4 ADAPT** — single-thread ideas needing rework for concurrency.
- **§5 REJECT / anti-patterns** — what NOT to copy + why (don't bloat bongo).
- **§6 open questions for synthesis** (Phase 2).

## Hard rules
READ-ONLY — do NOT edit gsd source, bongo files, or any repo code. Do NOT run/install
gsd commands. Docs-only output to the path above. Tier-0 research (no tests/build).
This is ongoing — depth over speed; a thorough teardown now saves Phase-2 rework.
SHIP-NOTICE to supervisor when the FINDINGS doc is committed (cherry-pick docs-only onto
fresh origin/master per the narrow-lane caveat). Worktree off current origin/master.
