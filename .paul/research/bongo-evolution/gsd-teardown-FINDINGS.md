# GSD Teardown — Findings for Bongo Evolution (Phase 1, coder-7)

**Source:** `~/.claude/commands/gsd/` (32 thin commands) + `~/.claude/agents/gsd-*.md` (12 subagents) + `~/.claude/get-shit-done/` (96 files: `workflows/`, `templates/`, `references/`, `bin/lib/*.cjs` deterministic CLI) + 3 hooks. ~143 files total.
**Method:** Read every major workflow (execute-phase, plan-phase, execute-plan, new-project, transition, resume-project), all 7 orchestration agents (executor, planner, verifier, plan-checker, integration-checker, codebase-mapper, debugger), the state engine (`bin/lib/state.cjs`), templates (state, roadmap), and references (verification-patterns, checkpoints, model-profiles, decimal-phase-calculation). READ-ONLY; no edits to gsd, bongo, or repo code.
**Lens:** every pattern judged for fit with bongo's **parallel-agent model** (concurrent coders + persistent supervisor + independent auditor coordinating through files), recommending **adopt / adapt / reject**.

---

## §1 — GSD Architecture Overview (the model in ~1 page)

GSD is a **single-thread, orchestrator-led, plan-driven** build system. One human ("visionary/product owner") + one Claude ("builder"). It is NOT a parallel-agent system the way bongo is — its "parallelism" is *one orchestrator fanning out short-lived subagents within a wave and blocking on their return*, not multiple long-lived peers coordinating through shared files.

**Four-layer separation (the headline structural insight):**

1. **Thin command** (`commands/gsd/*.md`, 18–190 lines) — frontmatter (`argument-hint`, `agent`, `allowed-tools`) + an `<execution_context>` that `@`-includes the real procedure. The command is a *router*, not the logic. E.g. `plan-phase.md` is 46 lines that delegate to `workflows/plan-phase.md` (561 lines).
2. **Workflow procedure** (`get-shit-done/workflows/*.md`) — the actual step-by-step orchestration logic, written as `<step name=...>` blocks.
3. **Deterministic CLI** (`get-shit-done/bin/gsd-tools.cjs` + `bin/lib/*.cjs`) — **ALL state mutations go through a real Node program**, never hand-edited by the LLM. `init <workflow>`, `phase complete`, `state advance-plan`, `roadmap update-plan-progress`, `requirements mark-complete`, `frontmatter validate`, `verify artifacts|key-links|commits`, `commit`, `config-get/set`. The LLM calls these and parses JSON; the CLI owns the file format.
4. **Templates + references** (`templates/`, `references/`) — output skeletons (STATE.md, ROADMAP.md, SUMMARY.md, VERIFICATION.md) and cross-cutting policy docs (verification-patterns, checkpoints, model-profiles) `@`-included where needed.

**State lives in `.planning/`:** `PROJECT.md` (vision + requirements + decisions), `REQUIREMENTS.md` (REQ-IDs + traceability), `ROADMAP.md` (phases → requirements → success criteria + progress table), `STATE.md` (living digest, synced YAML frontmatter for machine reads), `config.json` (mode/granularity/parallelization/model_profile/workflow toggles), `phases/XX-name/` (per-phase `*-CONTEXT.md` / `*-RESEARCH.md` / `*-VALIDATION.md` / `*-PLAN.md` / `*-SUMMARY.md` / `*-VERIFICATION.md`), `debug/` (persistent debug sessions), `codebase/` (brownfield maps), `agent-history.json` (subagent tracking).

**Lifecycle (the spine):** `new-project` (deep questioning → 4 parallel researchers → synthesis → requirements → roadmap) → per phase: `discuss-phase` (capture decisions → CONTEXT.md) → `plan-phase` (research → plan → **plan-checker verify loop, max 3** → PLAN.md files) → `execute-phase` (group plans into **waves by dependency**, spawn one `gsd-executor` per plan in parallel within a wave, **spot-check** their SUMMARYs, then `gsd-verifier` **goal-backward** check → passed/gaps_found/human_needed) → `transition` (mark complete, evolve PROJECT.md, advance STATE.md) → repeat → `complete-milestone`. Gaps re-enter via `plan-phase --gaps` (decimal/gap-closure phases). Urgent work inserts as **decimal phases** (6.1, 6.2).

**The two cores most relevant to bongo:**
- **Orchestrator-delegates-to-fresh-context-subagents** (execute-phase). The orchestrator stays at ~10-15% context by passing *paths only*; each executor reads files itself with a fresh 200k window. This is gsd's answer to the same context-quality problem bongo solves with per-lane worktrees + fresh tabs.
- **Goal-backward verification** (planner derives `must_haves`, verifier checks them against the codebase, "DON'T trust SUMMARY claims"). This is bongo's auditor philosophy — but *codified, re-runnable, and CLI-backed*.

---

## §2 — Per-Axis Findings

### Axis 1 — Command/skill structure & composition
- **Thin-command → workflow → CLI separation** (`commands/gsd/plan-phase.md` vs `workflows/plan-phase.md` vs `gsd-tools.cjs`). Commands carry only routing + `allowed-tools` + an `@`-include of the procedure. Lets the heavy procedure be edited without touching the command surface, and lets agents `@`-include the *same* procedure file the command uses (`gsd-planner` and `plan-phase.md` both reference `workflows/plan-phase.md`).
- **Namespacing:** flat `gsd:` prefix; subagents are `gsd-<role>` files in `~/.claude/agents/`. No nesting.
- **Argument handling:** `$ARGUMENTS` parsed in-workflow; flags are normalized early (`--auto`, `--gaps`, `--research`, `--skip-verify`, `--prd <file>`). Phase numbers accept integer or decimal.
- **Composition via `@`-includes:** `<execution_context>` and `<required_reading>` blocks pull in shared references (`references/ui-brand.md`, `templates/summary.md`). This is gsd's reuse mechanism — content composition, not function calls.
- **Chaining:** auto-advance chains commands flat using the **Skill tool, not nested Task** ("nested Task sessions cause runtime freezes due to deep agent nesting" — `plan-phase.md` step 14). A persistent `workflow._auto_chain_active` config flag survives context compaction so a chain resumes after a `/clear`.

### Axis 2 — State persistence across context resets
- **`.planning/` is the durable brain.** Every workflow's first step is "read STATE.md." STATE.md is a **digest kept <100-150 lines** (template caps it) carrying Current Position, Progress bar, recent Decisions, Blockers, Session Continuity (last session / stopped-at / resume-file).
- **Machine-readable frontmatter sync** (`state.cjs:syncStateFrontmatter`): every STATE.md write regenerates a YAML frontmatter block (`current_phase`, `status` normalized to a fixed enum, `progress.{completed_plans,total_plans,percent}`) computed *from disk* (counts PLAN vs SUMMARY files). Hooks/scripts read `state json` instead of regex-parsing prose. **State is derived from artifacts on disk, not trusted from the prose.**
- **Atomic-commit-per-task** (`execute-plan.md` task_commit, `gsd-executor`): each task commits individually (`{type}({phase}-{plan}): desc`), NEVER `git add .`. Context loss never loses completed work — the git log IS the progress record.
- **Reconstruction** (`resume-project.md` `<reconstruction>`): if STATE.md is missing, rebuild it from PROJECT.md + ROADMAP.md + scanning `*-SUMMARY.md` + counting todos + checking `.continue-here` files. State is recoverable because it's redundant with artifacts.
- **`.continue-here*.md`** mid-plan checkpoint files + **`agent-history.json`** (spawned/completed subagent tracking with `current-agent-id.txt`) let a fresh session detect and resume interrupted subagents.

### Axis 3 — Workflow lifecycle (phases/milestones/roadmaps)
- **Phase = coherent deliverable mapped to requirement IDs + 2-5 observable success criteria** (`templates/roadmap.md`). Every v1 requirement maps to exactly one phase; 100% coverage validated at roadmap creation.
- **Decimal/insert phases** (`references/decimal-phase-calculation.md`, `phase next-decimal`): urgent work inserts as 6.1, 6.2 between integers, executes in numeric order, and `execute-phase`'s `close_parent_artifacts` step auto-resolves the parent phase's UAT gaps + debug sessions when a decimal gap-closure phase completes.
- **Gap-closure cycle:** verifier emits `gaps_found` with structured YAML gaps → `plan-phase --gaps` reads VERIFICATION.md/UAT.md → creates `gap_closure: true` plans → `execute-phase --gaps-only` → verifier **re-verifies** in re-verification mode (full check on failed items, quick regression on passed).
- **Milestone grouping** (`templates/roadmap.md`): after v1.0 ships, completed milestones collapse into `<details>`, continuous phase numbering (never restart at 01), milestone-tagged progress table.
- **Transition** (`workflows/transition.md`) is where PROJECT.md *evolves*: requirements move Active→Validated (with phase ref) or →Out-of-Scope (with reason), emerged requirements get added, decisions logged. The roadmap is a living hypothesis ledger, not a fixed plan.

### Axis 4 — Subagent orchestration & parallelization ★ (closest to bongo's core)
- **Orchestrator coordinates, never executes** (`execute-phase.md` core_principle). It does: discover plans → analyze deps → group waves → spawn agents → handle checkpoints → collect results. Stays at ~10-15% context by passing **paths only**; each subagent reads files with its fresh 200k window. ("No polling — Task blocks. No context bleed.")
- **Wave-based parallelism from declared dependencies.** Each PLAN.md frontmatter carries `wave`, `depends_on`, `files_modified`, `autonomous`. Wave = `max(wave of deps) + 1`. Within a wave, plans with **no `files_modified` overlap** run in parallel; file overlap forces sequential. **This is exactly bongo's claims.md exclusivity rule — but computed up front by the planner, not negotiated at runtime.**
- **Vertical slices over horizontal layers** (`gsd-planner` dependency_graph): plan by feature (model+API+UI together) so plans are independent and parallelize, NOT by layer (all models, then all APIs) which serializes. Direct guidance for how a supervisor should *cut* disjoint lanes.
- **Spot-check after every wave** (`execute-phase.md` step 4): orchestrator verifies each returned SUMMARY's claims — first 2 created files exist on disk, `git log --grep="{phase}-{plan}"` returns ≥1 commit, no `## Self-Check: FAILED` marker. Cheap trust-but-verify before proceeding. **This is a lightweight pre-auditor gate bongo lacks.**
- **Executor self-check** (`gsd-executor` `<self_check>`): before reporting done, the executor itself verifies created files exist + commits exist and appends `## Self-Check: PASSED/FAILED` to its SUMMARY. Self-attestation that the orchestrator then spot-checks.
- **Fresh continuation agents, never resume** (`execute-phase.md` checkpoint_handling): "Resume relies on internal serialization that breaks with parallel tool calls. Fresh agents with explicit state are more reliable." Checkpoints return structured state; a *new* agent is spawned with that state. Strongly validates bongo's "ephemeral coders, durable files" model.
- **Specialized agent split:** planner (opus, writes plans) / executor (sonnet, writes code) / verifier + plan-checker + integration-checker (sonnet/haiku, read-only) / researcher (parallel fan-out) / synthesizer (merge) / codebase-mapper (parallel fan-out) / debugger. Read-only verification agents are deliberately *separate identities* from writers — the same independence principle as bongo's auditor-is-peer-not-subordinate.
- **Research fan-out → synthesis** (`new-project.md` step 6): spawn 4 parallel `gsd-project-researcher` (stack/features/architecture/pitfalls) → `gsd-research-synthesizer` merges to SUMMARY.md. **This is structurally identical to Bongo Evolution Phase 1 itself** (coder-7 + coder-5 parallel digs → supervisor synthesis). gsd has already productized the pattern bongo is using ad-hoc right now.

### Axis 5 — Verification/validation discipline
- **Goal-backward methodology** (`gsd-planner` goal_backward, `gsd-verifier`): from phase goal → observable *truths* (user-perspective) → required *artifacts* (specific file paths) → required *wiring* (`key_links`) → identify where it'll break. Planner emits this as `must_haves` frontmatter; verifier checks it.
- **Three-level artifact verification** (`gsd-verifier` step 4 + `references/verification-patterns.md`): Exists / Substantive (not a stub — line count + required patterns) / Wired (imported AND used). Status matrix: VERIFIED / ORPHANED / STUB / MISSING. **"80% of stubs hide in wiring."**
- **"DON'T trust SUMMARY claims"** (`gsd-verifier` critical mindset): "SUMMARYs document what Claude SAID it did. You verify what ACTUALLY exists." Backed by a deterministic CLI (`verify artifacts`, `verify key-links`, `verify commits`) so verification isn't vibes. **This is bongo's `feedback_auditor_deployed_surface_verification` rule, but with tooling instead of discipline-by-memory.**
- **Two-timing verification:** `gsd-plan-checker` verifies plans *before* execution (8 dimensions: requirement coverage, task completeness, dependency correctness, key-links-planned, scope sanity, must_haves derivation, context compliance, Nyquist) — catches gaps *before burning execution context*. `gsd-verifier` verifies code *after* execution. Same goal-backward method, different timing.
- **Nyquist validation** (`gsd-plan-checker` Dimension 8 + `gsd-nyquist-auditor`): every task's `<verify>` MUST carry an `<automated>` command (or a Wave-0 task that creates the test first); sampling rule (≥2 of any 3 consecutive impl tasks have automated verify); watch-mode/full-E2E flagged. Enforces "you can't claim done without a fast automated signal."
- **Integration-checker** (`gsd-integration-checker`): cross-phase wiring — exports→imports, APIs→consumers, E2E flow tracing, requirements-integration map. "Individual phases can pass while the system fails." Existence ≠ integration.
- **Stub-detection pattern library** (`references/verification-patterns.md`): concrete grep patterns per artifact type (React components, API routes, schemas, hooks, env) for placeholder/empty/hardcoded code.

### Axis 6 — Quality gates & checkpoints
- **Three checkpoint types** (`references/checkpoints.md`): `human-verify` (90% — confirm automated work), `decision` (9% — architectural choice with pros/cons options), `human-action` (1% — only truly un-automatable: email links, 2FA, OAuth). **Golden rule: "If Claude CAN automate it, Claude MUST."** Users only visit URLs / provide secrets / give visual judgment — never run CLI.
- **Auth gates are dynamic, not pre-planned** — Claude tries the CLI, hits 401, *then* creates a `human-action` checkpoint to authenticate, then retries. Auth failure is "expected interaction point," not a failure.
- **Automation-first before checkpoint:** never present a checkpoint with a broken verification environment ("don't ask user to visit localhost:3000 if the server failed to start"). Fix first.
- **Plan-check revision loop, max 3** (`plan-phase.md` step 12): planner → checker → revise → checker, capped at 3 iterations, then escalate to user (force / guide / abandon). Bounded quality loop.
- **Assumptions surfacing** (`list-phase-assumptions`, `gsd:assumptions`) and **health diagnostics** (`health`, `bin/lib` health checks) surface drift/repair before it compounds.
- **Mode-gated rigor** (`config.json`): YOLO auto-approves; Interactive confirms each step. Safety rails (e.g. skipping incomplete plans) ALWAYS confirm regardless of mode. Maps cleanly to bongo's risk-tier system.

### Axis 7 — Config & model profiles
- **Three model profiles** (`references/model-profiles.md`): `quality` (opus everywhere reasoning matters) / `balanced` (opus only for planning, sonnet for execution/verification) / `budget` (sonnet for code, haiku for research/verify). Per-agent table + per-agent `model_overrides`. Switchable at runtime (`set-profile`) or per-project (`config.json`).
- **Cost philosophy is explicit and role-aware:** opus where *architecture decisions* happen (planner), sonnet where *explicit instructions* are followed (executor), sonnet-not-haiku for verification (needs goal-backward reasoning), haiku for read-only mapping. "`inherit` instead of `opus`" to dodge org version blocks.
- **`config.json` workflow toggles:** `research`, `plan_check`, `verifier`, `nyquist_validation`, `parallelization`, `commit_docs`, `auto_advance`. Each agent in the chain is opt-out-able. The whole pipeline is configurable per-project.

### Axis 8 — Resume / handoff
- **`init <workflow>` single-call context load:** one CLI call returns a JSON blob (or `@file:` pointer for large payloads) with every path + config value + resolved model the workflow needs. Minimizes orchestrator round-trips and keeps context lean.
- **`resume-project.md`:** loads STATE.md, detects incomplete work (`.continue-here` files, PLANs-without-SUMMARYs, interrupted agents from `agent-history.json`), presents a status box, routes to the single most-logical next action. `"continue"`/`"go"` = silent load + immediate execute.
- **`pause-work` / `progress`:** pause writes a handoff; progress is "smart status + ONE next-action routing" (no menus). Forward motion is implicit progress ("planning phase N implies 1..N-1 complete").
- **Session continuity fields** in STATE.md (last session / stopped-at / resume-file) updated at every transition so an unexpected end is always recoverable.

### Axis 9 — Init / onboarding
- **`new-project` deep questioning** — "the most leveraged moment in any project." Freeform open ("What do you want to build?") then thread-following AskUserQuestion, gated by a "Ready to create PROJECT.md?" loop. `references/questioning.md` techniques (challenge vagueness, make abstract concrete, surface assumptions).
- **Brownfield detection → `map-codebase`** (4 parallel `gsd-codebase-mapper` agents: tech/arch/quality/concerns → STACK/INTEGRATIONS/ARCHITECTURE/STRUCTURE/CONVENTIONS/TESTING/CONCERNS.md). Mappers **write docs directly** (return only a confirmation) to keep orchestrator context low, and carry a **forbidden-files list** (never read `.env`/keys/credentials — "your output gets committed to git").
- **`--prd <file>` express path** — parse a PRD straight into CONTEXT.md (every requirement = a locked decision), bypassing discussion.
- **`--auto` mode** — config questions up front, then greenfield-from-document with smart defaults, chaining all the way to phase 1.
- **Saved global defaults** (`~/.gsd/defaults.json`) skip the settings interview on new projects.

---

## §3 — TOP Patterns Bongo Should ADOPT (ranked)

> Each maps to a concrete `.coord/` file or `/bongo:` command. Bongo's edge is concurrency; these are chosen because they *strengthen* parallel coordination, not replace it.

### ADOPT-1 — A deterministic `bongo-tools` CLI for shared-state mutations ★ highest leverage
**gsd:** every `.planning/` mutation goes through `gsd-tools.cjs` (`state advance-plan`, `roadmap update-plan-progress`, `phase complete`, `frontmatter validate`, `verify artifacts`). The LLM never hand-edits the file format.
**bongo today:** *everything* in `.coord/` is hand-edited markdown by the LLM — `master-tip.md`, `claims.md`, `agents.md`, `status/*.md`, inbox appends. This is the single biggest source of bongo's documented failure modes: the memory is full of "append via Bash not Edit (mutation-guard fires)" (`feedback_auditor_hot_inbox_append`), stale-SHA confusion (master-tip 2 commits behind, observed *this session*), claims-table drift, and Windows colon-path/`git ls-tree` gymnastics.
**Mapping:** a `bongo-tools.cjs` (or `.ps1`) exposing: `claims claim <path> --lane <id> --ttl <t>` / `claims release <path> --lane <id>` (append/edit `shared/claims.md` deterministically, auto-expire TTLs); `master-tip set --sha <s> --by <lane> --touched <files>` (and `master-tip read` that **reconciles against `git rev-parse origin/master`** so a stale tip is impossible); `inbox append --to <id> --kind <k> --subject ... --body-file ...` (atomic append, no Edit mutation-guard); `claims check <path>` (is it held & live?); `status set --lane <id> --field ...`. This removes ~80% of the per-message friction and an entire class of "the file says X but git says Y" bugs. **Single highest-impact borrow.**

### ADOPT-2 — Spot-check + self-check gate before auditor handoff
**gsd:** executor appends `## Self-Check: PASSED/FAILED` (files exist + commits exist); orchestrator spot-checks each returned SUMMARY (first 2 files on disk, `git log --grep`, no FAILED marker) *before* proceeding.
**bongo today:** a coder posts a SHIP-NOTICE; the auditor does the only verification, and it's a full deployed-surface probe even for trivial lanes. No cheap pre-gate.
**Mapping:** add a **SHIP-NOTICE self-check block** to `.coord/CODER.md` push protocol — coder runs `bongo-tools verify-ship --sha <s> --files <list>` (files landed in `git show <sha> --stat`, branch FF-merged, build/test posture quoted) and pastes a `## Self-Check: PASSED` line. Supervisor/auditor runs the *same* command as a 10-second gate before opening the (expensive) deployed-surface probe. Catches the "narrow-lane cherry-pick orphaned the SHA / files didn't land" class (`feedback_verify_lane_landing_by_content`) mechanically. Pairs with ADOPT-1's `master-tip read` reconciliation.

### ADOPT-3 — Goal-backward `must_haves` in lane prompts + a re-runnable auditor check
**gsd:** planner derives `must_haves: {truths, artifacts, key_links}` into PLAN frontmatter; verifier checks all three levels (exists/substantive/wired) against the codebase, structured-YAML gaps feed `--gaps` re-planning.
**bongo today:** lane prompts (`.paul/research/*-PROMPT.md`) are free-form prose. The auditor re-derives "what does done look like?" from the prose each time, which the memory shows is error-prone (false CRITICALs, code-shape-only ACCEPTs that shipped ~15-20% false positives — `feedback_auditor_deployed_surface_verification`).
**Mapping:** require every lane bootstrap prompt to carry a **`## Must-Haves` block** (observable truths + artifact paths + key wiring + the *exact deployed-surface repro* the auditor will run). The auditor's `AUDITOR.md` validation workflow checks against that block, not re-derived intent. Aligns with the already-ratified repro-paste mandate (decisions.md 2026-05-19) — this just makes the contract author-side and structured. Gaps that fail become the next micro-lane's scope (bongo's analog to `--gaps`).

### ADOPT-4 — Wave grouping by declared `files_modified` (planner-time, not runtime)
**gsd:** plans declare `files_modified` + `depends_on`; orchestrator computes waves and runs file-disjoint plans in parallel. No-overlap is proven *before* dispatch.
**bongo today:** the supervisor eyeballs disjointness when scoping lanes, then `claims.md` is the *runtime* contention guard (and the memory shows contention still bites — shared `index.ts`/`firestore.rules` claims, cherry-pick conflict storms).
**Mapping:** the supervisor's lane-dispatch should emit, per wave, a **`files_modified` set per lane + a disjointness assertion** into `shared/decisions.md` (or a new `shared/waves.md`). `bongo-tools waves check` flags any overlap *before* the tabs are fired — turning a runtime BLOCKER into a dispatch-time refusal. Directly serves `feedback_agent_count_quality_over_quantity` ("ready + disjoint work → spin") by making "disjoint" machine-checkable. Adopt the **vertical-slice heuristic** explicitly in `SUPERVISOR.md`: cut lanes by feature, not by layer.

### ADOPT-5 — `bongo-tools init <role>` single-call cold-boot context load
**gsd:** `init <workflow>` returns one JSON with every path/config/model the workflow needs; large payloads come back as `@file:` pointers.
**bongo today:** cold-boot reads ~7 files sequentially (CODER.md, README.md, master-tip, decisions, claims, inbox, lane prompt) — exactly what I did this session, several round-trips.
**Mapping:** `bongo-tools init coder --lane <N>` returns `{role_spec_path, readme_path, master_tip:{sha,reconciled_against_origin}, recent_decisions:[...], active_claims:[...], my_inbox:[...], lane_prompt_path, base_sha}` in one shot. `/bongo:resume` consumes it. Cuts cold-boot from ~7 reads to 1 + the lane prompt. Cheap, high-frequency win.

### ADOPT-6 — Persistent debug-session protocol for the parallel setting
**gsd:** `gsd-debugger` + `.planning/debug/<slug>.md` with a strict update protocol (Current Focus OVERWRITE-before-action, Symptoms IMMUTABLE, Eliminated/Evidence APPEND-only, status state machine) → perfectly resumable after `/clear`, plus the scientific-method discipline (falsifiable hypotheses, one variable, cognitive-bias table).
**bongo today:** no debug-session concept. When a lane hits a hard bug it lives in the coder's volatile context and dies on `/clear`.
**Mapping:** add `.coord/debug/<slug>.md` + a `bongo:debug` flow. The append-only Evidence/Eliminated structure is *especially* valuable in parallel because a **different** coder (or the auditor) can pick up a stuck investigation from the file — bongo's ephemeral-coder model makes the "file IS the debugging brain" property a hard requirement, not a nicety. The decision/human-action checkpoint return format slots into bongo's existing inbox message kinds.

### ADOPT-7 — Model profiles per role
**gsd:** `quality/balanced/budget` × per-agent table, opus-for-planning / sonnet-for-execution / sonnet-for-verification / haiku-for-mapping, with per-agent overrides.
**bongo today:** no model guidance; every tab is whatever the human launched.
**Mapping:** a `shared/profile.md` (or `config` in `bongo-tools`) recommending models per role — supervisor/auditor reasoning-heavy (opus), coders execution (sonnet ok), read-only recon lanes (haiku/sonnet). Lower-stakes; bongo tabs are human-launched so this is advisory, but it codifies cost/quality intent for the eventual portable distribution.

---

## §4 — ADAPT (single-thread ideas needing rework for concurrency)

- **The blocking-orchestrator model → don't copy literally; keep bongo's peers.** gsd's orchestrator *blocks* on `Task()` returns and owns all state. Bongo's supervisor is a *non-blocking* persistent monitor over *independent long-lived* coders. **Adapt:** borrow gsd's "coordinator passes paths only, never holds work product in context" discipline for the supervisor (it already mostly does this), and borrow the **spot-check-on-return** idea (ADOPT-2) — but bongo's "return" is an async SHIP-NOTICE in an inbox, not a synchronous Task result. The wave *concept* maps; the wave *mechanism* (one orchestrator spawning + awaiting) does not — bongo's waves are human-fired tabs coordinated by files.
- **`init` JSON payloads → fine, but reconcile against git, not just disk.** gsd's `init` reads `.planning/` on the assumption of a single writer. In bongo, multiple worktrees + origin/master diverge constantly (this session: master-tip 2 commits stale). **Adapt:** `bongo-tools init` and `master-tip read` must reconcile file-claimed state against `git rev-parse origin/master` / `git ls-tree` (Windows-safe per `feedback_git_ref_path_check_windows`) and *report drift*, not trust the markdown.
- **`config.json` workflow toggles → map onto risk-tiers, don't add a parallel system.** gsd toggles research/plan-check/verifier/nyquist per project. Bongo already has a ratified **Tier 0/1/2** verification system (`README.md` Verification flow). **Adapt:** express gsd's toggles *as* tier definitions (Tier 0 = self-check only; Tier 1 = + auditor deployed probe once/wave; Tier 2 = + independent prod-probe + binary verdict) rather than introducing a second config axis.
- **plan→check→revise loop (max 3) → make it a 2-party inbox loop.** gsd runs planner↔checker in one orchestrator. Bongo's analog is supervisor(scope)↔auditor(pre-flight check of the lane prompt's must-haves) *before* dispatch. **Adapt:** an optional "lane-prompt pre-check" where the auditor reviews a prompt's `## Must-Haves` for coverage/disjointness before the coder is fired — but capped and async (a single QUESTION message round-trip), not a tight loop.
- **Goal-backward `must_haves` → keep, but the *artifact* set is deployed-surface, not files.** gsd verifies file artifacts (exists/substantive/wired). Bongo's "truth" is often deployed prod behavior (MCP tool returns, iPad Perform render), per `feedback_auditor_deployed_surface_verification`. **Adapt:** `must_haves.artifacts` → `must_haves.repros` (deployed-surface checks) for runtime lanes; keep file-artifact checks for docs/config lanes.
- **Decimal/gap-closure phases → bongo's cycle model already does this informally.** gsd's `--gaps` re-plan loop ≈ bongo's "cowork sweep → findings → fix wave → repeat" (`project_cowork_sweep_cycle`). **Adapt:** formalize bongo's fix-wave as a structured gap intake (auditor's failed must-haves → supervisor's next-wave lane scopes), borrowing gsd's "group gaps by concern/artifact" clustering rule — but bongo has no roadmap/phase spine to hang it on, so it stays cycle-keyed, not phase-keyed.

---

## §5 — REJECT / Anti-patterns (don't bloat bongo)

- **The whole `.planning/` roadmap→phase→milestone spine.** gsd is a *greenfield project builder* with a linear lifecycle (questioning → requirements → roadmap → phases). Bongo is a *coordination layer over an already-running, already-roadmapped project* (PAUL/the app's own milestones own that). Importing ROADMAP.md/REQUIREMENTS.md/STATE.md/transition/complete-milestone would duplicate PAUL and fight bongo's cycle-based reality. **Reject the lifecycle; borrow the mechanics (CLI, verification, waves).**
- **YOLO auto-advance chaining (`_auto_chain_active`, Skill-not-Task chaining).** This exists to let *one* unattended agent run discuss→plan→execute→transition. Bongo is human-gated by design — Daniel's paste IS the gate (`feedback_skip_ratification_when_scope_clean`), single-owner for destructive runs (`feedback_single_owner_destructive_runs`). Auto-chaining across lanes would directly violate the "named executor claims before executing" rule. **Reject.**
- **`gsd-executor`'s in-context deviation Rules 1-4 as bongo policy.** gsd lets a single executor auto-fix bugs/missing-critical/blocking inline (Rules 1-3) and only stop for architectural (Rule 4). In bongo, a coder auto-expanding scope inside a claimed-file lane is how you get cross-lane contention and the shared-worktree races the memory warns about. Bongo already enforces tighter scope discipline ("keep changes minimal and focused"). **Reject auto-deviation; bongo's narrow-lane discipline is correct.**
- **`agent-history.json` + `current-agent-id.txt` resume-by-serialization.** gsd itself concluded resume-by-serialization "breaks with parallel tool calls" and switched to fresh continuation agents. Bongo *already* uses fresh tabs + file state (the superior pattern gsd converged on). Adding agent-id tracking would be re-importing the thing gsd abandoned. **Reject** — bongo's ephemeral-coder + durable-file model is the destination, not the starting point.
- **Templated UI-brand / TDD-plan / user-setup machinery.** `references/ui-brand.md`, `tdd.md`, `templates/user-setup.md`, PRD express path — these are app-construction concerns. Bongo coordinates agents; the *project* (CRC app via PAUL) owns build conventions. **Reject** — out of bongo's layer.
- **Over-granular state CLI surface.** gsd-tools has dozens of subcommands (`state record-metric`, `state add-blocker`, `history-digest`, `summary-extract`...). Bongo should ship a *small* `bongo-tools` (claims, master-tip, inbox, init, verify-ship, waves) and resist gsd's sprawl. Velocity metrics, performance tables, decision-rationale extraction — **reject as scope creep** for a coordination layer.

---

## §6 — Open Questions for Synthesis (Phase 2)

1. **`bongo-tools` language/runtime.** gsd uses Node (`*.cjs`). Bongo runs on a Windows box with documented Git-Bash colon-path mangling (`feedback_git_ref_path_check_windows`) and a PowerShell-first shell. Node `.cjs` (cross-platform, matches gsd, eases the eventual portable distribution) vs PowerShell (native, no node dep)? Node is likely right for portability but needs Windows-path-safe git invocations baked in. **Decide before ADOPT-1.**
2. **Where does `bongo-tools` live for portability?** `[[project_bongo_portability]]` wants bongo to graduate to its own GitHub repo. gsd ships its engine under `~/.claude/get-shit-done/`. Does `bongo-tools` ship in `.claude/commands/bongo/` (per-project, what `init` scaffolds) or a global `~/.bongo/`? Affects ADOPT-1/5 and the `/bongo:init` template set.
3. **How much does paul-teardown (coder-5) overlap?** PAUL already owns the project lifecycle bongo should NOT duplicate (§5). Synthesis must reconcile: gsd's verification/CLI mechanics (adopt) vs PAUL's plan/apply/unify lifecycle (already in use). Which framework "wins" each axis where both have a pattern? (Likely: PAUL owns lifecycle, gsd's mechanics inform bongo's coordination primitives.)
4. **Must-haves contract ownership (ADOPT-3).** Should the `## Must-Haves` block be authored by the supervisor (who scopes the lane) or pre-checked by the auditor (independence)? gsd separates planner from checker for exactly this independence — but bongo's "auditor must not author dispatch intent" rule (decisions.md 2026-05-19, Hard-NO item A) constrains this. Resolve who writes vs who checks.
5. **Does bongo want a `gsd-integration-checker` analog?** Cross-lane integration (does lane A's export get consumed by lane B?) is a real bongo gap — waves ship disjoint files that must still wire together. Worth a dedicated cross-lane integration pass after a wave lands, or does the auditor's existing cross-lane regression sweep already cover it? (Probably extend the sweep, not add an agent.)
6. **Spot-check vs full-probe tiering (ADOPT-2 × Tier system).** Exactly which checks are the cheap self-check gate (Tier 0 auto-accept threshold) vs the auditor's expensive probe (Tier 1/2)? gsd's spot-check (files-on-disk + git-grep) is a clean Tier-0 definition — synthesis should pin the boundary.

---

*Teardown by coder-7 (Bongo Evolution Phase 1, gsd dig). READ-ONLY; docs-only. Companion: `paul-teardown-FINDINGS.md` (coder-5). Next: supervisor synthesis → `bongo-adopt-recommendations.md`.*
