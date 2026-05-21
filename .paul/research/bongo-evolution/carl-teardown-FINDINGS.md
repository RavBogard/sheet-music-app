# CARL Teardown — FINDINGS

**Lane:** bongo-evo-carl-teardown (coder-6) · **Tier 0, READ-ONLY research** · Bongo Evolution Phase 1 (3rd framework dig)
**Date:** 2026-05-21 · **Base:** origin/master @ `0bb6266b8`
**Method:** first-hand read of the injection hook + full `.carl/` data model + all 4 carl-mcp tool modules + both `settings.json` hook wirings + a session file + live read-only `carl_v2_*`/`carl_*` probes (no state mutated).
**Companions:** `bongo-evo-gsd-teardown` (coder-7, `dbad4d4d6`) · `bongo-evo-paul-teardown` (coder-5, `895f85ddc`). CARL gets its OWN lens — it is a **governance/rules/decision layer**, not a project planner.

---

## §1 — CARL architecture overview

**CARL = Context Augmentation & Reinforcement Layer.** Where paul/gsd *plan work*, CARL *governs behavior*: it keeps a set of **rules** and **decisions**, and on **every** `UserPromptSubmit` it **pushes the relevant subset into the model's context** as `<carl-rules>` / `<carl-status>` / `<decisions>` blocks. It is the system injecting the blocks you see at the top of this very session.

It has **three planes**:

1. **Injection engine (the push):** a Python `UserPromptSubmit` hook (`carl-hook.py`). On each prompt it discovers `.carl/` scopes by walking up from cwd, loads rules+decisions, selects which apply (always-on + keyword-matched + context-bracket + star-command), and emits them as `additionalContext`. It is **stateless per call except for a per-session dedup cursor**.
2. **Data model (the store):** a `.carl/` directory. Two generations coexist live:
   - **v1 (flat files):** `manifest` (domain on/off + recall keywords), one file per domain (`global`, `context`, `commands`, `{domain}` — `DOMAIN_RULE_N=text`), `decisions/{domain}.json`, `staging.json`.
   - **v2 (unified):** a single `carl.json` (`config` + `domains{rules,decisions,recall,exclude,state,always_on}` + `staging[]`).
3. **Governance API (the management surface):** the `carl-mcp` stdio MCP server (~20 v1 `carl_*` tools + 15 v2 `carl_v2_*` tools across 4 modules: `domains.js`, `decisions.js`, `staging.js`, `carl-json.js`) plus a `carl-manager` skill and `carl:tasks:*` / `carl:templates:*` commands for human/agent-driven CRUD on domains/rules/decisions.

**★ The single most important live finding — CARL is mid-migration and running BOTH generations at once:**

| | Global / v2 | Project / v1 |
|---|---|---|
| Hook | `~/.claude/hooks/carl-hook.py` **v2.0.0** (reads `carl.json`, MAX_CONTEXT 1,000,000) | `CentralReform.live/.claude/hooks/carl-hook.py` **v1.0.2** (reads flat files, MAX_CONTEXT 200,000) |
| Wired in | `~/.claude/settings.json` `UserPromptSubmit` | `CentralReform.live/.claude/settings.json` `UserPromptSubmit` |
| Reads | `~/.carl/carl.json` (GLOBAL: **3 rules**, FRESH bracket empty) | `CentralReform.live/.carl/{manifest,global,context,commands}` (GLOBAL: **9 rules**, FRESH = LEAN, COMMANDS available) |
| Sessions | `~/.carl/sessions/*.json` (v2 shape, has `last_context_signature`) | `CentralReform.live/.carl/sessions/*.json` (v1 shape: `GLOBAL_STATE`/`CONTEXT_STATE`/`COMMANDS_STATE` overrides) |

**Both hooks fire every prompt** → you receive **two `<carl-rules>` blocks and two `<decisions>` blocks per submit** with overlapping-but-divergent GLOBAL rules. This session is living proof: block 1 = `[GLOBAL] always_on (3 rules)` (v2/home), block 2 = `[GLOBAL] always_on (9 rules)` + `[FRESH] CONTEXT RULES … LEAN` + `AVAILABLE … COMMANDS ()` (v1/project).

**The MCP server is HOME-rooted, not project-rooted.** `index.js` sets `WORKSPACE_PATH = path.resolve(__dirname, '../..')`, i.e. the parent of `~/.carl/carl-mcp/` → **`C:\Users\dsbog`** (proven live: `carl_list_domains` returned `"workspace": "C:\\Users\\dsbog"`). So *all* `carl_*` tools operate on `~/.carl/` regardless of which project you're in. Consequences (all confirmed live):
- v2 tools work (home `carl.json` exists): `carl_v2_list_domains` → GLOBAL+DEVELOPMENT, `carl_v2_get_config` → matches the injected v2 block, `carl_v2_get_staged` → empty.
- v1 tools are **effectively dead** against home: `carl_get_manifest` → `"Manifest not found"`; `carl_list_domains` → garbage, mis-identifying the `carl-mcp/` directory and `carl.json` itself as "domains" (it lists every non-dotfile entry in `~/.carl/`).
- The project-level flat files that *do* contain 9 GLOBAL rules + the star-commands are **never reachable** by the MCP server. The injection hook reads them; the management API cannot.

This split is the cautionary spine of the whole teardown: **CARL's good ideas are real, but its migration discipline is a counter-example bongo must not repeat.**

---

## §2 — Per-axis findings

### Axis 1 — Data model
- **v1:** human-editable flat files. `manifest` is a `KEY=value` config (`DOMAIN_STATE`, `DOMAIN_ALWAYS_ON`, `DOMAIN_RECALL`, `DOMAIN_EXCLUDE`, `DEVMODE`). Each domain is a file of `DOMAIN_RULE_N=text` lines (no extension, lowercase filename, UPPERCASE prefix). Decisions live in `decisions/{domain}.json`; proposals in `staging.json`.
- **v2:** one `carl.json`. Domain = `{state, always_on, recall[], exclude[], rules[{id,text,added,last_reviewed,source}], decisions[{id,decision,rationale,date,source,recall[],status}]}`; top-level `config{devmode, post_compact_gate, global_exclude[], context_brackets{}, commands{}}` + `staging[]`.
- **Map to bongo:** rules ≈ the standing rules baked into `SUPERVISOR.md`/`AUDITOR.md`/`CODER.md`; decisions ≈ `shared/decisions.md`; domains ≈ role/topic scoping. CARL's win is **structured + IDed + queryable**; bongo's `decisions.md` is a flat append-only prose log (no IDs, no search, no status field). The rule `{id, source, added, last_reviewed}` shape is a clean template for giving bongo decisions/rules real metadata.

### Axis 2 — Rule lifecycle / governance (staging)
- **Pipeline:** `stage_proposal` (→ `pending`, tagged `source: psmm|decisions|manual`) → `approve` (rule appended to the target domain, proposal removed) | `kill` (hard delete) | `archive` (kept, not activated). v2 mirrors this inside `carl.json.staging[]`; v1 uses `staging.json`.
- **Value:** rule *changes* are a reviewable, staged transaction — not a raw file edit. There's an explicit "proposed but not yet governing" state.
- **Map to bongo:** bongo amends standing rules by hand-editing markdown (memory is full of the failure class: stale-SHA, claims drift, Edit-guard fires, Windows colon-path). A **stage→approve gate for `decisions.md` / standing-rule changes** would give the supervisor (author) / auditor (reviewer) seam a real artifact, matching the already-ratified "supervisor authors, auditor reviews" Hard-NO split.

### Axis 3 — Decision capture & retrieval
- `log_decision(domain, decision, rationale, recall)` → auto-ID (`global-001`), dated, `status: active`. `get_decisions(domain)`, `search_decisions(keyword)` (scans decision+rationale+recall text across all domains), `archive_decision(id)` (v2 sets `status:archived`; v1 moves to an `archived[]` array).
- **★ Storage disconnect (migration bug):** the v1 `carl_log_decision` writes `.carl/decisions/{domain}.json`, but the v2 hook reads decisions from `carl.json.domains[].decisions[]`, and the v2 `carl_v2_log_decision` writes *there*. **Decisions logged via the v1 tool are invisible to the v2 injector, and vice-versa.** Two write paths, two read paths, no bridge.
- **Map to bongo:** searchable, IDed, archivable decisions are strictly better than `decisions.md` grep. But note the lesson: **one store, one writer, one reader** — bongo's current single `decisions.md` already has that virtue; don't fragment it the way CARL did.

### Axis 4 — ★ Context injection: push vs pull (headline) → see §3.

### Axis 5 — Domain scoping / toggling
- Three load modes: **always_on** (GLOBAL — every prompt, no matching), **recall-keyword** (e.g. DEVELOPMENT triggers on "fix this bug"/"implement this feature"), and **star-command** (`*dev`, `*review`, `*plan`, `*debug`, etc. — explicit 1:1 injection). **Exclusions** gate matching: per-domain `exclude` skips that domain; `global_exclude` is a kill-switch that skips *all* matching. `toggle_domain` flips `state`; `create_domain` adds one.
- **Context brackets** are a fourth, orthogonal scoping axis: FRESH/MODERATE/DEPLETED/CRITICAL chosen by `tokensRemaining%`, each with its own rule set (e.g. DEPLETED → "batch aggressively, suggest /compact").
- **Map to bongo:** CARL loads *rules scoped to relevance*; bongo loads *whole role specs* on fire. A bongo analogue: scope by **role** (supervisor vs coder vs auditor) and by **phase** (dispatch vs verify vs teardown) rather than re-reading the entire spec each time. The context-bracket idea maps to bongo's existing `[FRESH]/[MODERATE]/[DEPLETED]` brackets — already borrowed, in fact.

### Axis 6 — MCP-tool-based governance
- Governance is **agent-callable**: an agent (or the `carl-manager` skill) can `carl_v2_add_rule` / `stage_proposal` / `log_decision` structurally, instead of hand-editing files. The `carl-manager` skill auto-activates on intents like "make this a rule" / "add this to CARL" / "create a domain". Commands: `carl:tasks:{add-rule,create-domain,edit-rule,toggle-domain,create-command}` + `carl:templates:{domain-template,manifest-entries}` + `carl:utils:manifest-parser`.
- **Trade-off:** structured tools prevent malformed edits (schema-validated, auto-ID, atomic write) — but CARL exposes **35 tools across two incompatible generations simultaneously**, and the v1 half is dead against the live home workspace. Tool sprawl + version ambiguity is a real cost; an agent has no signal which of `carl_log_decision` vs `carl_v2_log_decision` is the live one.
- **Stale cross-references:** the v1 `commands` file (`CARL_RULE_5`) instructs "MUST READ `~/.claude/skills/carl-help/CARL-OVERVIEW.md`" and `CARL_RULE_4` points at a `/carl` skill — **neither exists on disk** (the skill is now `carl-manager`). Config that references renamed/removed assets is exactly the rot a deterministic tool layer is supposed to prevent, yet here the flat-file half rotted.
- **Map to bongo:** a small **`bongo-tools` CLI** for the mutation-prone shared-state ops (claims, master-tip, inbox append, decisions log) is the convergent recommendation across all three digs (gsd called it the #1 borrow). CARL validates the *agent-callable governance* idea AND warns: **keep exactly one generation live; delete the old surface, don't leave it registered.**

### Axis 7 — v1 → v2 migration
- CARL versioned **three things at once**: the hook (`1.0.2`→`2.0.0`), the data model (flat files → `carl.json`), and the MCP API (`carl_*`→`carl_v2_*`). The strategy was **additive coexistence** — register both tool sets, support a "drop-in hook swap when ready", keep v1 readers as "backward compatibility" (`staging.js` header says so explicitly).
- **Outcome:** the swap was done globally (home) but **never finished at the project scope or cleaned up**: project keeps the v1 hook + flat files; home runs v2; both inject; the home-rooted MCP server can't see project data; v1 tools mis-read the home dir. The result is *more* surface, *more* ambiguity, and a measurable per-prompt token tax (two full rule blocks) — the opposite of the dedup efficiency v2 added.
- **Map to bongo:** bongo WILL evolve (and aims for repo extraction / cross-project portability). The lesson is sharp: **migrate with a cut-over, not indefinite coexistence.** Version the schema, ship a one-shot converter, flip every scope, and *remove* the old reader/writer/hook in the same change. A `bongo-tools migrate` that rewrites `.coord/` in place and a single canonical hook/CLI path beats "support both forever."

### Axis 8 — Session model
- `.carl/sessions/{uuid}.json` per Claude session: `{uuid, started, cwd, label, title, prompt_count, last_activity, overrides{}, last_context_signature}`. Overrides let a *single session* locally flip DEVMODE / a domain's state / context injection without touching global config. `last_context_signature` is the **dedup cursor** (see §3). Stale sessions (>24h) are cleaned lazily on next session creation. ~46 files have accumulated per scope — pruning is best-effort, not aggressive.
- **Map to bongo:** this is the closest CARL analogue to bongo's **pause/resume + pickup pointer**. Two transferable ideas: (1) **per-session local overrides** — a coder could locally suppress a noisy standing rule for one lane without editing the shared spec; (2) the **dedup cursor pattern** — persist "what I last injected" so re-fires don't re-pay. bongo's resume already reads files fresh each fire (pull); a cursor would let a future bongo-hook avoid re-injecting unchanged coord state.

---

## §3 — ★ Context-injection deep-dive: push vs pull, and a `bongo-hook` sketch

### How CARL's push works (and why it's affordable)
On every `UserPromptSubmit` the v2 hook:
1. Walks up from cwd collecting `.carl/carl.json` scopes (≤10 levels), merges them (more-specific overrides).
2. Computes the **context bracket** from `tokensRemaining%` and selects bracket rules.
3. Selects rules: GLOBAL/always_on (unconditional) + domains whose `recall` keywords appear in the prompt (minus `exclude`/`global_exclude`) + star-commands present in the prompt.
4. **Dedup gate** — computes a signature = `bracket | devmode | always_on-domains | matched-domains | command-names`. If the signature equals the session's `last_context_signature` **and** it isn't the 1st prompt **and** `prompt_count % 5 != 0`, it emits a tiny `<carl-status dedup="true">` pointer ("rules NOT re-injected; prior injection still in your window — operate on those") instead of the full block. Otherwise it emits the full block and updates the cursor.
5. Decisions summary is emitted **every** time (cheap, one line).

The dedup gate is the keystone: **push is only affordable because unchanged rules aren't re-paid every turn.** Force-emit every 5th prompt guards against the rules scrolling out of the window. This is the one piece bongo most lacks an answer for.

### Push (CARL) vs Pull (bongo) — the trade
- **bongo PULLS:** an agent reads `CODER.md` / `decisions.md` / `claims.md` / `master-tip.md` **on fire** (and at task boundaries). Rules enter context exactly when the agent chooses to read them. Cheap, explicit, but **compliance decays across a long session** — 60 turns after boot, the standing rules are far up-context and an agent can drift (the memory is full of exactly this: colon-path gotcha, stale-branch verification, Edit-guard, "verify against origin not cwd"). Re-compliance requires the agent to *remember to re-read*.
- **CARL PUSHES:** rules re-enter context on a cadence the *system* controls, not the agent. Drift is structurally resisted because the rules are re-surfaced near the prompt. Cost: token tax + the risk of injecting irrelevant rules (mitigated by recall-matching + dedup).

For bongo's failure modes, **push is a genuinely good fit** — the recurring incidents are *standing-rule drift*, and bongo currently has no mechanism to re-assert a rule mid-session. A push hook would have re-surfaced "use `git ls-tree`, not `cat-file` colon-path on Windows" or "verify against `origin/master`, not cwd" right when the agent was about to violate it.

### Sketch: a `bongo-hook` (push coord-state into agent prompts)
A `UserPromptSubmit` hook, scoped to repos containing `.coord/`, that injects a compact `<bongo>` block. Concretely:

**What it would inject (role-aware):**
1. **Role identity + the 3–5 hardest standing rules for that role.** Detect role from `.coord/status/<id>.md` or the session label. For a coder: the Hard-NO list (`mcp/`/`bridge/`/`SetlistGrid.tsx`, claim-before-edit, no self-teardown). For the auditor: BINARY verdict, sweep-before-verdict, verify-against-origin-not-cwd, the Windows `ls-tree` gotcha. These are *exactly* the rules that show up as repeated memory corrections.
2. **The live master-tip SHA + a one-line "you are N commits behind" if the agent's branch diverged.** Cheap pull-before-push reinforcement.
3. **Open claims that touch files this role is likely to edit** (or just the count + a "read claims.md before editing shared files" nudge).
4. **The newest 1–2 `decisions.md` ratifications** (IDed, if decisions get IDs per §2/§4 ADOPT).
5. **An inbox tripwire:** "you have N unread NEW messages in `inbox/<id>.md`" so a re-fired agent never misses a BLOCKER.

**When (dedup):** mirror CARL's signature exactly — `role | master-tip-SHA | open-claim-count | newest-decision-id | unread-inbox-count`. Re-inject in full only when that signature changes or every Nth prompt; otherwise emit a one-line `<bongo-status dedup>` pointer. This keeps the steady-state tax near zero — the block only re-fires when something an agent *needs to react to* actually changed (a sibling shipped → SHA moves; a new claim landed; a new decision was ratified; a message arrived). That event-driven re-injection is arguably *more* valuable for bongo than for CARL, because bongo's shared state changes under the agent's feet (sibling lanes), whereas CARL's rules are mostly static.

**Cost / risk:** (a) it's a *second* source of truth in the prompt — must stay strictly a **read-only mirror** of `.coord/`, never authoritative, or it reintroduces CARL's two-readers problem; (b) Windows/python-hook portability (CARL already runs `python3` hooks here, so the path is proven); (c) it benefits the supervisor/auditor (persistent monitors) most and ephemeral coders least (a coder reads its spec on fire anyway) — so scope the heaviest injection to the long-lived roles.

**Verdict:** **worth prototyping for the supervisor + auditor first** (the persistent roles where drift across a long session is the documented failure). Keep it a thin, dedup'd, read-only mirror. Do NOT make it the place rules are *authored* — authoring stays in `.coord/` files / `bongo-tools`.

---

## §4 — TOP patterns bongo should ADOPT (ranked)

1. **Dedup'd, event-driven push hook for the persistent roles (`bongo-hook`).** §3. Maps to a new `~/.claude/hooks/bongo-hook.py` + the existing `.coord/` files as its read source. Highest novel value: it's the only thing in any of the three digs that *structurally* fights standing-rule drift, which is bongo's most-documented failure class. Signature-dedup keeps it cheap. **Prototype on supervisor/auditor.**
2. **IDed, searchable, status-bearing decisions** (replace flat `decisions.md` prose with `{id, date, decision, rationale, recall[], status}` records + a `bongo-tools decisions {log,search,get,archive}` surface). Maps to `shared/decisions.md` → structured store. Kills grep-the-prose and gives the auditor a way to cite a decision by ID. Convergent with gsd's "deterministic CLI for shared-state mutations."
3. **Stage→approve gate for standing-rule / decision changes.** §2. Maps to a `staging[]` section + `bongo-tools propose/approve`. Fits the ratified supervisor-authors / auditor-reviews seam — gives rule *changes* a reviewable artifact instead of a raw markdown edit.
4. **Per-session local overrides** (a coder mutes one noisy rule for one lane without editing the shared spec). Maps to a small `.coord/sessions/<id>.json` override file read by the bongo-hook. Low cost, high ergonomics for the "this rule doesn't apply to my disjoint lane" case.
5. **Schema/rule metadata** (`source`, `added`, `last_reviewed` on every rule/decision). Maps onto whatever store §2/§4.2 lands. Makes rules auditable ("when did we add this? has anyone reviewed it since?") and enables a future "stale rule" sweep.

## §5 — ADAPT (good ideas needing rework for a multi-agent file-coordination model)

- **Domain recall-keyword matching.** CARL matches *the user's prompt*. bongo agents are mostly autonomous (the "prompt" is `/bongo:resume`), so keyword-on-prompt matching is weak. **Adapt:** scope by **role + phase** (read from `.coord/status`) rather than prompt keywords. The relevance signal in bongo is *who you are and what you're doing*, not what the user typed.
- **Context brackets.** Useful, but bongo already inherits CARL's brackets in this very environment. **Adapt:** fold bracket-awareness into the bongo-hook (e.g. DEPLETED → inject "file your SHIP-NOTICE / pause-pointer now before context runs out" — directly relevant to the ephemeral-coder lifecycle).
- **Star-commands.** `*dev`/`*review` 1:1 rule injection is neat but redundant with bongo's slash-commands (`/bongo:*`). **Adapt:** if anything, let `/bongo:resume` *itself* be the trigger that the hook keys on to inject role rules — collapse the two mechanisms into one.
- **Agent-callable governance tools.** Adopt the *idea* (§4.2/§4.3) but as a **single `bongo-tools` CLI**, not an always-on MCP server with 35 tools. A CLI invoked on demand has zero idle token cost and no version-ambiguity surface.

## §6 — REJECT / anti-patterns (what NOT to copy, and why)

- **Dual-generation coexistence.** The defining CARL anti-pattern. Two hooks injecting two divergent rule blocks every prompt; a home-rooted MCP server that can't see project data; v1 tools that mis-read the home dir as "domains"; config referencing deleted skills. **bongo must migrate by cut-over** (convert + flip every scope + delete the old surface in one change), never by leaving both live.
- **Fragmented storage for one concept.** Decisions live in *three* shapes (flat `decisions/{domain}.json`, `carl.json.domains[].decisions[]`, and the injected `<decisions>` summary) with no bridge. **One store, one writer, one reader.** bongo's single `decisions.md` already has this; preserve it through any restructure.
- **Tool sprawl across versions.** 35 tools, half dead. Don't expose a tool you can't guarantee points at the live store.
- **Home-rooted-by-file-location workspace resolution.** `WORKSPACE_PATH = ../..` hardcoded to the install dir silently decouples the governance API from the project the user is in. If bongo ships a CLI/MCP, resolve the workspace from **cwd walk-up to `.coord/`** (the way `/bongo:resume` already does), never from the binary's install path.
- **Mandatory always-emit ceremony.** CARL's DEVMODE block (append a debug block to *every* response) is pure overhead when on. A push hook should be **silent by default** and emit only when state changed (dedup) — never force per-response ceremony.
- **Unbounded session-file accumulation.** ~46 stale session JSONs per scope, lazy cleanup. If bongo adds `.coord/sessions/`, prune on a real cadence (or via `bongo-tools`), not best-effort-on-create.

## §7 — Open questions for synthesis

1. **Build the `bongo-hook` at all, or fold its value into `bongo-tools` + better resume?** Push fights drift in a way no on-demand CLI can — but it's a second prompt-surface to maintain. Recommend: **prototype the hook for supervisor/auditor only**, measure whether it reduces the documented drift incidents, before generalizing to coders.
2. **Where do structured decisions live** — extend `decisions.md` with a parseable record format (keeps the human-readable single file), or move to a `decisions.json` (clean schema, but loses at-a-glance readability and git-diff friendliness)? Lean **structured-markdown** to keep git-diff/PR review intact (a bongo value paul/gsd digs both flagged).
3. **One canonical mutation path?** All three digs converge on a deterministic `bongo-tools` CLI. CARL adds: also converge the *injection* path (one hook) and the *governance* path (one tool generation). Should `bongo-tools` + `bongo-hook` share a single library that reads/writes `.coord/`?
4. **Scope model:** role-based, phase-based, or both? (CARL's prompt-keyword model doesn't transfer; what's the right relevance key for autonomous agents?)
5. **Migration tooling as a first-class deliverable.** Given CARL's incomplete migration, should bongo's evolution roadmap make `bongo-tools migrate` (schema-version + in-place convert + assert-no-old-surface) a required gate for *any* `.coord/` schema change?
6. **Cross-project portability interaction:** CARL's walk-up multi-scope merge (project overrides global) is exactly what bongo's repo-extraction ambition needs. Worth adopting the **scope-merge** pattern (global `~/.coord-defaults` + project `.coord/` override) for portable standing rules?

---

*Read-only research. No `.carl/` files, `carl-hook.py`, or repo code were modified; no CARL write tools were called (only `carl_v2_list_domains`/`carl_v2_get_config`/`carl_v2_get_staged`/`carl_list_domains`/`carl_get_manifest` reads). Companion to the gsd (`dbad4d4d6`) and paul (`895f85ddc`) teardowns; next step is the supervisor synthesis into `bongo-adopt-recommendations.md`.*
