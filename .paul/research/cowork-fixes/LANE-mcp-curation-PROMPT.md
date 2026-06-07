# LANE — mcp-curation bundle (cowork #3/#4/#5 + #8 + #9) — coder-6

**Tier 2. Ships to prod tonight (full-send, Daniel-approved).** You own the
**MCP-tools curation surface** for this wave (so 4 coders don't thrash
`src/lib/mcp/tools/index.ts`). Work the sub-tasks in order; ship as coherent
commits. Cross-ref `.coord/TRIAGE-cowork-2026-05-22.md` §A +
`.paul/research/cowork-session-findings-2026-05-22.md` #3/#4/#5/#8/#9. Grep the
tools dir for each exact handler before editing (verify-before-claim).

### Sub-task 1 — save-scraped-chart parity (#3)
`save_scraped_chart` should accept optional `key` / `bpm` / `leadMusician` like
`upload_chart` does, so authors don't need the base64 detour to set them. Additive
optional params; no behavior change when omitted.

### Sub-task 2 — `update_song` (#5, NEW tool)
NEW musician/band-leader-scoped `update_song({ id, key?, bpm? })` to fix a wrong
key/bpm WITHOUT going through admin enrichment. Trusted-leader gated; validate id
exists; idempotent. Register in `index.ts`.

### Sub-task 3 — edit_enrichment clarify (#4)
`edit_enrichment` actually works on ANY `library_index` row — rename/clarify its
description (or add an `edit_library_entry` alias) so its scope is obvious. Low-risk
naming/doc; keep backward compat (don't break the existing tool name).

### Sub-task 4 — hebrew-translit on write (#8)
Apply the EXISTING search-side transliteration normalizer (shewa-nā: S'f-, l'D-,
b'r-) at SAVE / ENRICHMENT time, not only at search. **Reuse the normalizer — do
NOT blind-rewrite the existing catalog** (an opt-in backfill is a separate concern;
out of scope here). New writes/enrichments get normalized transliteration.

### Sub-task 5 — enrichment-lag visibility (#9)
Surface enrichment age/lag + a `pending_enrichment_count` in `list_library` /
`search_library` coverage so callers can flag unenriched rows (stops the
core-vs-supplemental guessing). Additive response fields.

## Cross-cutting
- All MCP validation = `result.isError:true` prose, never JSON-RPC -32602
  ([[feedback_mcp_validation_shape]]). dryRun-as-observability where a tool writes
  ([[feedback_dryrun_is_observability]]). Trusted-leader gating per
  [[feedback_admin_rate_limit_bypass]] where relevant.
- **Claim `src/lib/mcp/tools/index.ts`** (coder-5 also appends a registration there
  — coordinate; narrow-lane cherry-pick FF if origin moves).
- These are MCP/authoring-surface changes — they do NOT touch Perform/iPad render.

## Gates + ship
Real `npm ci`: per-subtask unit tests (params accepted/ignored, new-tool happy +
negative + role gate, normalizer applied on write, list_library carries the new
fields) · check:types · eslint · `next build --webpack` exit 0. Cut FRESH worktree
off `origin/master`. SHIP-NOTICE → `inbox/auditor.md` (Tier 2; MCP-tool lanes need a
deployed bearer-probe for ACCEPT — note which tools the auditor should probe).
HEADS-UP supervisor. If the bundle is too big to ship cleanly as one, ship sub-tasks
1–3 first + flag, then 4–5.
