# Lane: bongo-evo-carl-teardown (coder-6) — Tier 0, READ-ONLY

## Context
**Bongo Evolution Phase 1** (see `.paul/research/bongo-evolution/ROADMAP.md`). Third
framework dig, added by Daniel. **CARL is NOT a project-planner like /paul + /gsd — it's
a governance / rules / decision layer**, so it gets its OWN lens (below), not the 9-axis
planner lens the gsd/paul digs use. CARL is also the most directly bongo-relevant: it's
the system injecting the `<carl-rules>` / `<carl-status>` / `<decisions>` blocks you see
every prompt, and it maps straight onto bongo's `decisions.md`, standing rules, and role
specs.

**READ-ONLY — and CARL is LIVE config governing this very environment.** Do NOT mutate any
CARL state: no `carl_log_decision` / `carl_stage_proposal` / `carl_approve_proposal` /
`carl_create_domain` / `carl_toggle_domain` / any `*_v2_*` write. Use ONLY read tools
(`carl_get_decisions`, `carl_get_domain_rules`, `carl_list_domains`, `carl_get_manifest`,
`carl_v2_get_config`, `carl_v2_get_domain`, `carl_v2_list_domains`, `carl_search_decisions`)
+ `tools/list`. Do NOT edit `.carl/` files or `carl-hook.py`.

## Sources
- **Data model:** `C:\Users\dsbog\CentralReform.live\.carl\` — `manifest`, `global`,
  `commands`, `context` (files) + `example-custom-domain/`, `sessions/*.json`.
- **Context-injection engine:** `C:\Users\dsbog\.claude\hooks\carl-hook.py` — read it;
  this generates the per-prompt `<carl-rules>` / `<carl-status>` / `<decisions>` blocks.
- **Governance API:** the ~40 `carl_*` + `carl_v2_*` MCP tools (`tools/list` to read
  the surface; read-only tools to inspect live state).
- **Management UX:** the `carl-manager` skill + `carl:tasks:*` / `carl:templates:*` commands.
- **Live evidence:** the `<carl-rules>` / `<carl-status>` / `<decisions>` blocks injected
  into your own prompts this session (CONTEXT BRACKET `[FRESH]`, LEAN mode, dedup, DEVMODE).

## Lens (CARL-specific) — for EACH, extract the pattern + map to bongo
1. **Data model** — domains, rules, decisions, manifest, global/context, sessions: how
   structured + persisted.
2. **Rule lifecycle / governance** — staging proposals → approve / kill / archive
   (`carl_stage_proposal` etc.): how rule *changes* are governed safely vs bongo's manual
   `decisions.md` edits.
3. **Decision capture & retrieval** — `carl_log_decision` / `get_decisions` /
   `search_decisions` / `archive_decision`: structured + searchable decisions vs bongo's
   append-only flat `decisions.md` (no search/structure).
4. **★ Context injection — push vs pull (the headline).** `carl-hook.py` PUSHES governance
   into every prompt (rule loading by domain: GLOBAL always_on + context-loaded; CONTEXT
   BRACKET; LEAN mode; **dedup** = skip re-inject when signature unchanged; DEVMODE toggle).
   bongo PULLS (agents read coord files on fire). **This is the biggest design question for
   bongo** — would a push-rules-into-context hook make supervisor/auditor/coders more
   reliably rule-compliant? At what cost? Give this its own deep section.
5. **Domain scoping / toggling** — GLOBAL always_on vs per-context domains; toggle on/off;
   create_domain. How rules get scoped to relevance (vs bongo loading whole role specs).
6. **MCP-tool-based governance** — managing rules/domains/decisions via MCP tools
   (agent-driven, structured) vs bongo's manual markdown edits. Trade-offs.
7. **v1 → v2 migration** — `carl_*` vs `carl_v2_*` (CARL versioned its own API + config/
   domain/rule model). How it migrated without breaking. Directly relevant to bongo's own
   evolution + eventual repo extraction.
8. **Session model** — `.carl/sessions/*.json`: per-session state, and how it relates to
   bongo's pause/resume + pickup-pointer continuity.

## Deliverable — NEW `.paul/research/bongo-evolution/carl-teardown-FINDINGS.md`
- **§1 CARL architecture overview** (~1 page).
- **§2 per-axis findings** (the 8 above, cite files/tools).
- **§3 ★ Context-injection deep-dive** — push-vs-pull analysis for bongo, with a concrete
  proposal sketch (could a `bongo-hook` inject coord state / standing rules / recent
  decisions into agent prompts? what would it inject, when, with what dedup?).
- **§4 TOP patterns bongo should ADOPT** — ranked, each mapped to a concrete `.coord/` file
  or mechanism.
- **§5 ADAPT** — governance ideas needing rework for a multi-agent file-coordination model.
- **§6 REJECT / anti-patterns** — what NOT to copy + why (esp. anything that adds ceremony
  without payoff for a parallel-agent system).
- **§7 open questions for synthesis.**

## Hard rules
READ-ONLY — NO CARL state mutation (read tools only), NO edits to `.carl/` or `carl-hook.py`
or any repo code. Docs-only output. Tier-0 research. Depth over speed.
> If the auditor BLOCKs your just-shipped F1 (`cb27068e0` + follow-ups), that fix takes
> priority — bounce back; this research is interruptible.
SHIP-NOTICE to supervisor when committed (docs-only cherry-pick onto fresh origin/master).
Worktree off current origin/master.
