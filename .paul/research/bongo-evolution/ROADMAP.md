# Bongo Evolution — ongoing design-research project

**Purpose:** bongo — *this* parallel-agent coordination system (`.coord/{SUPERVISOR,
AUDITOR,CODER}.md` + `shared/{master-tip,decisions,claims}` + `.claude/commands/bongo/
{resume,pause,init,templates}`) — studies its mature siblings **/paul** and **/gsd**
to extract practices worth adopting into its own design. **bongo is the system the
supervisor / auditor / coders run; this project improves it.** Ongoing; destined to
**graduate to its own GitHub repository** ([[project_bongo_portability]]).

## Sources (read-only)
- **/gsd** — `~/.claude/commands/gsd/` (~95 files): phase/roadmap/milestone model,
  parallel mapper agents, wave-based execution, verification loops, Nyquist validation,
  debug sessions w/ persistent state, model profiles (quality/balanced/budget), health.
- **/paul** — `~/.claude/commands/paul/` (~44 files): PLAN/apply/audit/unify, discover,
  satellite manifest (`paul.json`), handoff/resume, milestone mgmt, UAT verify.
- **/carl** — `.carl/` data model (domains/rules/decisions/manifest/global/context/sessions)
  + `~/.claude/hooks/carl-hook.py` (per-prompt context-injection engine) + ~40
  `carl_*` / `carl_v2_*` MCP governance tools + `carl-manager` skill + `carl:tasks/templates`
  commands. **A governance/rules layer — different shape from the planners; gets its own lens.**
- **bongo (us)** — `.coord/` role specs + shared coord files + `.claude/commands/bongo/`.

## Differentiator to protect
bongo's edge is the **parallel-agent model**: multiple concurrent coders + a persistent
supervisor + an independent auditor, coordinating through files (claims/master-tip/
decisions). paul + gsd are largely **single-thread planners**. So every borrowed pattern
must be assessed for fit with *concurrency* — adopt what strengthens parallel coordination,
adapt single-thread ideas, reject what assumes one linear actor.

## Phases
- **Phase 1 — parallel deep-dig (IN PROGRESS, 2026-05-21):** gsd-teardown (coder-7) +
  paul-teardown (coder-5) + **carl-teardown (coder-6)**. READ-ONLY. →
  `gsd-` / `paul-` / `carl-teardown-FINDINGS.md`. (CARL is governance-shaped → its own lens;
  see its prompt. The other two are project-planners.)
- **Phase 2 — synthesis (supervisor):** merge → `bongo-adopt-recommendations.md` —
  adopt / adapt / reject per pattern + gap analysis (bongo vs paul vs gsd), mapped to the
  parallel-agent model.
- **Phase 3 — adopt:** implement chosen patterns into bongo (protocol, role specs, slash
  commands, templates).
- **Phase 4 — extract to own repo:** graduate bongo to a standalone repo (distribution).

## Lens (what each dig extracts)
command/skill structure & composition · state persistence across context resets ·
workflow lifecycle (phases/milestones/roadmaps) · subagent orchestration & parallelization ·
verification/validation discipline · quality gates & checkpoints · config & model profiles ·
resume/handoff · init/onboarding. For each: name the pattern, judge fit for a parallel-agent
model, recommend **adopt / adapt / reject** with rationale + concrete bongo mapping.

## Status log
- 2026-05-21 — project created; Phase 1 dispatched (coder-7 → gsd, coder-5 → paul).
- 2026-05-21 — **CARL added to Phase 1** (Daniel) — coder-6 → carl-teardown. Governance/rules
  layer; own lens, headlined by CARL's per-prompt context-injection (push) vs bongo's
  read-coord-files-on-fire (pull).
