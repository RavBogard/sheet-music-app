# Bongo Adopt-Recommendations — Phase 2 Synthesis

**Author:** supervisor · **Date:** 2026-05-21 · **Phase:** Bongo Evolution Phase 2 (synthesis)
**Inputs:** `gsd-teardown-FINDINGS.md` (coder-7, `dbad4d4d6`) · `paul-teardown-FINDINGS.md` (coder-5, `895f85ddc`) · `carl-teardown-FINDINGS.md` (coder-6, `3c83a2281`).
**Output of:** merging the three digs into one adopt/adapt/reject set, resolving the cross-dig open questions, mapped to bongo's **parallel-agent model** (concurrent coders + persistent supervisor + independent auditor coordinating through `.coord/` files). Feeds Phase 3 (adopt) + Phase 4 (repo extraction, in flight as `bongo-extract-plugin`).

---

## §0 — Through-line

Two mature single-thread *planners* (paul, gsd) and one *governance layer* (carl) were dug for what strengthens bongo's concurrency. The signal is unusually clean:

- **Where paul & gsd converge, adopt with maximum confidence** — two independent frameworks landing on the same primitive is strong evidence it's load-bearing (thin-command split, `wave/depends_on/files_modified` frontmatter, per-task atomic commits, mutation discipline, single-action routing, "don't trust the self-report," 3-type checkpoint taxonomy).
- **Where they diverge, gsd wins almost every divergence** (deterministic CLI, model profiles, Nyquist, parallel *execution*, integration check) — gsd is simply the more *operationalized* framework; paul never built those parts.
- **paul's irreplaceable contributions** are narrower but real: the **Intent/Spec/Code** diagnostic router, the **adversarial-verdict-gate** flavor of plan audit, and the cleanest articulation of **mutation discipline + evidence-before-claims**.
- **carl contributes one genuinely novel idea** no planner has — a **dedup'd push hook** that re-surfaces standing rules near the prompt — *and* serves as the sharpest **anti-pattern case study**: carl is mid-migration running TWO generations at once (two hooks double-injecting divergent rule blocks every prompt — visible in this very session), a home-rooted MCP that can't see project data, 35 tools half-dead. **carl's migration failure is bongo's migration warning.**

**The single unifying recommendation:** bongo's most-documented failure class is **hand-edited-markdown drift** (stale-SHA master-tip, claims drift, Edit-mutation-guard, Windows colon-path, verify-against-cwd-not-origin) and **standing-rule drift across long sessions**. The CLI (from gsd) fixes the first; the push-hook (from carl) fixes the second. Everything else is structure around those two.

> **Live proof-point from this session:** a carl-teardown lane was double-dispatched (supervisor assigned it to coder-2 while coder-6 grabbed the pre-addressed prompt) and both pointed at the *same worktree/branch*. **ADOPT-3 (`wave/files_modified` frontmatter + dispatch-time disjointness assertion) + a `bongo-tools claim-lane` would have made this a dispatch-time refusal instead of a live collision.** The synthesis is not theoretical — bongo hit the exact failure mode the digs predict.

---

## §1 — ADOPT (tiered; confidence = how many digs converged)

### Tier A — Foundational (the drift-killers; build first, one workstream)

**A1 — `bongo-tools` deterministic CLI for all shared-state mutations.** ★ highest leverage; **gsd #1 + carl §6.3 + paul (take gsd; paul has none) — unanimous.**
Every `.coord/` mutation today is LLM-hand-edited markdown — the root of nearly every drift incident in memory. Build a small Node CLI (`bongo-tools`) owning: `claims {claim,release,check}`, `master-tip {set,read}` (where `read` **reconciles against `git rev-parse origin/master` / `git ls-tree`**, Windows-safe, so a stale tip is impossible), `inbox append` (atomic, dodges the Edit mutation-guard), `decisions {log,search,get,archive}`, `init <role>` (A-cold-boot, see B5), `verify-ship`, `waves check`. **Keep it small** — reject gsd's dozens-of-subcommands sprawl.

**A2 — Per-doc mutation discipline stamped on every `.coord/` file.** **paul ADOPT-2 + gsd ADOPT-6 + carl §6 — unanimous.**
Stamp a mutation-mode header on each template: `decisions.md` = APPEND-ONLY (+ stable ID, supersede-don't-delete); `inbox/<id>.md` = APPEND-ONLY (codify the `cat >>`-not-Edit rule into schema, not memory); `master-tip.md` = OVERWRITE/single-writer=last-pusher; `status/<id>.md` = OVERWRITE/owner-only; `claims.md` = APPEND-row + edit-own-row-to-release. `bongo-tools` (A1) enforces these; the header documents them. Turns three memory-logged bug classes into declared schema.

**A3 — IDed / searchable / status-bearing decisions.** **carl ADOPT-2 + gsd CLI.**
Replace flat `decisions.md` prose with structured records `{id, date, decision, rationale, recall[], status:active|superseded}` — **as structured *markdown*, not JSON** (keep git-diff/PR-review, a bongo value both planners flagged). `bongo-tools decisions log/search/get/archive`. Gives the auditor a way to cite a decision by ID; kills grep-the-prose. (Same workstream as A1 — the CLI enforces the A3 schema.)

**A4 — `wave / depends_on / files_modified / autonomous` frontmatter on lane assignments.** ★ **paul ADOPT-4 + gsd ADOPT-4 — *byte-identical schema* in both; strongest convergence in the whole teardown.**
Lane assignment messages carry `files_modified[] + depends_on[] + wave N`; the supervisor asserts **pairwise-disjoint `files_modified` across a wave before firing tabs** — turning a runtime contention BLOCKER (and the multi-tab collision this session) into a dispatch-time refusal. `bongo-tools waves check` flags overlap. Adopt the **vertical-slice-over-horizontal-layer** heuristic explicitly in `SUPERVISOR.md`. This directly serves `feedback_agent_count_quality_over_quantity` by making "disjoint" machine-checkable.

### Tier B — High-value coordination structure (build on A)

**B1 — Two-slot thin-command → workflow split + authoring contract.** **paul ADOPT-1 + gsd Axis-1 — convergent.**
Extract role behavior from the giant `cold-boot/*-startup.md` + `{SUPERVISOR,AUDITOR,CODER}.md` (which duplicate protocol and drift independently) into `bongo-framework/workflows/{supervisor,auditor,coder}-boot.md` + shared `workflows/{push-protocol,claims-protocol,ship-notice}.md`. `/bongo:resume <role>` becomes a thin router. **One edit to `push-protocol.md` then fixes all three roles.** Add paul's `rules/{commands,style}.md` authoring contract (imperative voice, no-sycophancy, one-screen rule) as `bongo-framework/rules/` so the surface stays consistent past today's 4 commands.

**B2 — Goal-backward `## Must-Haves` block in lane prompts, fused with an adversarial pre-dispatch audit.** **gsd ADOPT-3 (checklist) + paul ADOPT-3 (adversarial verdict-gate) — fuse, don't pick.**
Every lane prompt carries a `## Must-Haves` block: observable *truths* + required *artifacts/repros* (deployed-surface, not files, for runtime lanes) + *wiring* + **the exact repro the auditor will run**. Optionally `/bongo:audit <lane-prompt>`: the auditor reviews the must-haves under gsd's structured-checklist (coverage / disjointness / verifiability) executed with paul's adversarial persona + verdict-gate. **Resolved seam (see §4):** supervisor *authors+revises* the prompt; auditor *reviews* the must-haves; a "not acceptable" verdict **blocks dispatch** but the supervisor (not the auditor) edits — honoring bongo's Hard-NO that the auditor never authors dispatch intent. Drop paul's auto-remediation (single-actor assumption).

**B3 — Self-check + spot-check gate before the expensive auditor probe.** **gsd ADOPT-2; paul §7 (gsd's mechanical check is the better parallel fit).**
Coder's SHIP-NOTICE carries a `## Self-Check: PASSED` line from `bongo-tools verify-ship --sha --files` (files in `git show <sha> --stat`, branch FF-merged, build/test posture quoted). Supervisor/auditor runs the *same* command as a 10-second Tier-0 gate before opening the deployed-surface probe. Catches the "narrow-lane cherry-pick orphaned the SHA / files didn't land" class (`feedback_verify_lane_landing_by_content`) mechanically.

**B4 — Deterministic single-next-action routing (idle-assigned-lane = headline).** **paul ADOPT-5 + gsd Axis-8 — convergent.**
`/bongo:progress` (and no-arg supervisor `/bongo:resume`) emit ONE action per role from a routing table whose top row encodes bongo's #1 supervisor invariant: *any idle assigned lane → "fire /bongo:resume N" as the headline* (`feedback_surface_idle_coders`, `feedback_supervisor_main_job_scaffolding`). Makes the most-important supervisor rule a deterministic output, not a remembered discipline.

**B5 — `bongo-tools init <role>` single-call cold-boot.** **gsd ADOPT-5 + carl dedup-cursor.**
One call returns `{role_spec, readme, master_tip:{sha, reconciled_against_origin}, recent_decisions[], active_claims[], my_inbox[], lane_prompt, base_sha}`. Cuts cold-boot from ~7 sequential reads (what this session did) to 1 + the lane prompt.

### Tier C — Differentiating / novel (sequence after A+B)

**C1 — `bongo-hook`: a dedup'd, event-driven push hook for the persistent roles.** ★ **carl ADOPT-1 — novel; no planner has it.**
A `UserPromptSubmit` hook (scoped to `.coord/` repos) that injects a compact, **read-only** `<bongo>` mirror: role + the 3-5 hardest standing rules for that role, live master-tip SHA + "N commits behind", open-claim count touching this role's files, newest 1-2 decision IDs, and an **inbox tripwire** ("N unread NEW messages"). **Dedup signature** = `role | master-SHA | open-claim-count | newest-decision-id | unread-inbox-count`; re-inject in full only when that changes (or every Nth prompt). This is the *only* mechanism that structurally fights **standing-rule drift** (bongo's most-documented failure class) — and it's *more* valuable for bongo than carl because bongo's shared state changes under the agent's feet (sibling lanes ship → SHA moves). **Prototype on supervisor + auditor first** (persistent roles, where long-session drift is the documented failure); coders read their spec on fire anyway. Strictly a mirror of `.coord/` — never authoritative (or it reintroduces carl's two-readers bug).

**C2 — Stage→approve gate for standing-rule / decision changes.** **carl ADOPT-3 + paul audit flavor.**
A `staging[]` + `bongo-tools propose/approve` so rule *changes* are a reviewable transaction (supervisor proposes, auditor reviews) instead of a raw markdown edit — fits the ratified author/review seam.

**C3 — Intent/Spec/Code diagnostic tag on every auditor-BLOCK bounce.** **paul ADOPT-7 — paul-distinctive.**
The auditor's BLOCK message (and the coder's response) carries a tag: **Intent** = lane goal wrong → bounce to supervisor for re-scope; **Spec** = acceptance bar wrong → fix must-haves first; **Code** = impl mismatch → fix-in-place. Routes the bounce to the right layer instead of reflexively patching code (`feedback_mcp_validation_shape`: "don't ship a 4th wrong-target fix").

**C4 — Persistent debug-session protocol.** **gsd ADOPT-6 + paul ADOPT-6 — convergent.**
`.coord/debug/<slug>.md` + `/bongo:debug`: append-only Evidence/Eliminated, IMMUTABLE Symptoms, OVERWRITE Current-Focus, scientific-method discipline. *Especially* valuable in parallel — because coders are ephemeral, a different coder or the auditor can pick up a stuck investigation from the file.

**C5 — Per-session local overrides + model-profile advisory.** **carl ADOPT-4 + gsd ADOPT-7.**
`.coord/sessions/<id>.json` lets a coder mute one noisy rule for one lane without editing the shared spec (read by the bongo-hook). `shared/profile.md` recommends models per role (opus supervisor/auditor, sonnet coders, haiku read-only recon) — advisory since bongo tabs are human-launched.

---

## §2 — ADAPT (single-thread ideas reworked for concurrency)

- **gsd's blocking orchestrator → keep bongo's non-blocking peers.** Borrow "coordinator passes paths only, never holds work-product in context" + spot-check-on-return, but bongo's "return" is an async SHIP-NOTICE in an inbox, not a synchronous `Task()` result. The wave *concept* maps; the wave *mechanism* (one orchestrator spawning+awaiting) does not — bongo's waves are human-fired tabs coordinated by files.
- **paul/gsd single-global STATE.md + one cursor → shard per-lane (bongo already does).** Borrow the *<100-line digest* + *Session-Continuity block* + *per-lane ASCII loop marker* into `status/<id>.md`; never re-centralize.
- **`config.json` rigor toggles → express as bongo's existing Tier 0/1/2**, not a second config axis. (Tier 0 = self-check only; Tier 1 = + auditor deployed probe once/wave; Tier 2 = + independent prod-probe + binary verdict.)
- **carl recall-keyword scoping → scope by role + phase**, read from `.coord/status`. bongo's relevance signal is *who you are and what you're doing*, not what the user typed (agents are autonomous; the "prompt" is `/bongo:resume`).
- **paul/gsd `init` JSON → reconcile against git, not just disk** (this session: master-tip was 2 commits stale within minutes). Every "where is master?" read uses `git rev-parse`/`ls-tree` (Windows-safe).
- **gsd integration-checker → extend the auditor's cross-lane regression sweep**, not a new agent (waves ship disjoint files that must still wire together — a real bongo gap).
- **paul E/Q max-3 loop → cap the coder↔auditor inbox bounce (e.g. 2 rounds) then escalate** to supervisor/Daniel.
- **carl scope-merge (project overrides global) → adopt for portability:** `~/.coord-defaults` (global standing rules) + project `.coord/` override — exactly what the repo-extraction ambition needs.

---

## §3 — REJECT (don't bloat the coordination layer)

All three digs independently reach the headline reject:
- **The planner lifecycle spine** (roadmap/phase/milestone, PLAN→APPLY→UNIFY, transition/complete-milestone, REQUIREMENTS/PROJECT.md). **The CRC app already runs PAUL one directory over** — importing it duplicates the live planner. Borrow the *mechanics*, never the lifecycle.
- **YOLO auto-advance / cross-lane chaining** — bongo is human-gated by design (Daniel's paste IS the gate); auto-chaining violates single-owner-for-destructive-runs.
- **Executor in-context auto-deviation (gsd Rules 1-4)** — bongo's narrow-lane discipline is correct; auto-scope-expansion causes the cross-lane contention the memory warns about.
- **`agent-history.json` resume-by-serialization** — gsd itself abandoned it for fresh-tab+file (which bongo already is).
- **Single-global STATE / single cursor / single-actor manifest** — the parts that assume one linear writer are exactly what `.coord/` sharding replaces.
- **Write-time global monotonic IDs** (collide under concurrent appenders) and **in-place checklist mutation on shared files** (lost-update). Prefer append-only + supervisor-compaction.
- **SonarQube / SPECIAL-FLOWS full subsystem** — app-quality + skill-registry are the *project's* concern; bongo needs only a one-line "required skills" field + auditor check.
- **`help.md`-scale catalogs / inlined heavy commands** — enforce the one-screen rule (B1) so bongo's cold-boot files don't become paul's 525-line `help.md`.
- ★ **carl's dual-generation coexistence** — two hooks double-injecting, home-rooted MCP blind to project data, 35 tools half-dead, config citing deleted assets. **The defining anti-pattern.** → §4 migration rule.

---

## §4 — Resolved forks (the cross-dig open questions, decided)

1. **Build a CLI? YES, in Node (`.cjs`).** All three converge; paul offers no counter (it just never solved it). Node matches gsd + eases the portable plugin distribution — with **Windows-path-safe git invocations baked in** (`git ls-tree`, never `cat-file -e <rev>:<path>`; `feedback_git_ref_path_check_windows`).
2. **Decisions store: structured *markdown*, not JSON.** Keep git-diff/PR-review (a bongo value); a parseable record format inside `decisions.md`, not a `decisions.json`.
3. **Plan-audit: fuse, don't pick.** gsd's checklist *structure* under paul's adversarial *persona* + paul's *verdict-gate*; **minus** paul's auto-edit (bongo auditor can't author intent).
4. **Who authors vs checks:** supervisor authors+revises the lane prompt; auditor reviews the must-haves; "not acceptable" **blocks dispatch** but the supervisor edits. (Resolves paul Q2 + gsd Q4 against bongo's Hard-NO.)
5. **bongo-hook: prototype supervisor/auditor only**, read-only mirror, signature-dedup; measure drift-incident reduction before generalizing to coders.
6. ★ **Migration discipline = cut-over, never coexistence.** Make **`bongo-tools migrate`** (schema-version + in-place convert + **assert-no-old-surface**) a **required gate for any `.coord/` schema change**. This is carl's hard-won lesson turned into a bongo rule: convert + flip every scope + delete the old reader/writer/hook in ONE change.
7. **Scope model: role + phase** (from `.coord/status`), not prompt-keywords.
8. **Portability: scope-merge** `~/.coord-defaults` (global) + project `.coord/` (override), via cwd walk-up (the way `/bongo:resume` already resolves coord-root) — never install-path-rooted (carl's `WORKSPACE_PATH=../..` bug).

---

## §5 — Gap analysis: what bongo uniquely needs (neither donor fully provides)

- **Multi-tab race prevention** — neither planner is concurrent; bongo's live failure (this session's carl double-dispatch into a shared worktree). Covered by A4 (wave/files_modified disjointness assertion) + a `bongo-tools claim-lane <id> --owner` fired *before* the tab, + the standing rule "before reassigning a pre-addressed prompt, confirm the named coder isn't about to grab it."
- **Worktree lifecycle** — planners have no worktrees. `bongo-tools worktree {cut,teardown}` should own creation + the teardown-timing rule (`feedback_worktree_teardown_timing`: never yank a live coder's cwd) + branch cleanup. (This session's manual sweep is exactly what this would automate + make safe.)
- **The push-hook (C1)** — bongo's drift answer; neither planner has it; carl does.
- **Cross-lane integration after a wave** — extend the auditor sweep (§2), the bongo analog of gsd's integration-checker.

---

## §6 — Phase-3 sequencing (adopt) + Phase-4 interplay (extraction in flight)

`bongo-extract-plugin` (coder-3) is **packaging the current bongo into the standalone repo NOW**. To avoid rework, adopt-work should land **in the new repo's structure**, not back into CRC. Recommended order:

1. **Wave 1 (foundational, do in the new repo post-extraction):** A1 `bongo-tools` skeleton + A2 mutation-headers + A3 decisions schema + A4 wave-frontmatter (one workstream — the CLI enforces A2/A3, A4 is the dispatch guard that would've prevented today's collision).
2. **Wave 2:** B1 thin-command split (restructures the very files coder-3 is extracting — **coordinate: extraction should land the `bongo-framework/workflows/` layout so B1 has a home**) + B5 `init` + B4 routing.
3. **Wave 3:** B2 must-haves/audit + B3 self-check gate + C3 Intent/Spec/Code tags (the verification cluster).
4. **Wave 4 (novel):** C1 `bongo-hook` prototype (supervisor/auditor) + C2 stage→approve + C4 debug-session + C5 overrides/profiles.
5. **Standing gate from now on:** every `.coord/` schema change goes through `bongo-tools migrate` (cut-over, §4.6).

**Extraction coordination (action for coder-3 at Gate 1):** the new `bongo` repo should carry these four bongo-evolution docs (3 FINDINGS + this synthesis) under `docs/research/`, and its layout should anticipate Wave-2's `bongo-framework/workflows/` + `rules/` dirs so Phase-3 adopt-work has a home. This synthesis is the Phase-3 backlog.

---

## §7 — Decisions for Daniel

1. **Ratify this adopt set + the Tier A→D sequencing?** (Or reprioritize.)
2. **Phase 3 timing:** start adopt-work (Wave 1: `bongo-tools` + schema) *after* coder-3's extraction lands the repo, or interleave? (Recommend: after — build `bongo-tools` natively in the new repo.)
3. **`bongo-hook` (C1)** is the one outward-ish change to your environment (a new `UserPromptSubmit` hook alongside carl's two). Green-light a prototype for supervisor/auditor only? (carl proves the hook mechanism works here.)
4. **Migration-as-a-gate (§4.6):** adopt `bongo-tools migrate` cut-over as a hard rule for all future `.coord/` schema changes? (This is the one carl lesson worth hard-coding.)

---

*Phase-2 synthesis by supervisor. Inputs: gsd `dbad4d4d6` · paul `895f85ddc` · carl `3c83a2281`. Next: Daniel ratifies → Phase 3 (adopt, sequenced above) lands in the standalone `bongo` repo that `bongo-extract-plugin` is creating.*
