# LANE — mimetype-backfill-heal (cowork #2 + #7) — coder-5

**Tier 2. SHIPS the TOOL to prod tonight (full-send, Daniel-approved). The RUN
(prod data write) is a SEPARATE Daniel-driven step — dryRun-first, single owner.**
Cross-ref `.coord/TRIAGE-cowork-2026-05-22.md` §A + `.paul/research/cowork-session-findings-2026-05-22.md` #2/#7.

## The bug (CONFIRMED — the known [[project_track_mimetype_gotcha]])
Track file-type metadata is ASYMMETRIC by bind path: picker→mimeType, MCP
post-2026-05-20→both, legacy→neither. Legacy/older-bonded `tracks` rows lack the
denormalized `mimeType`, and the "sub-attached doc" render styling (#7) keys on its
presence → those rows render wrong until re-bonded. Daniel saw this live.

## Build (the TOOL only this lane)
- NEW MCP tool **`backfill_heal_metadata`** (new file in `src/lib/mcp/tools/`,
  register in `src/lib/mcp/tools/index.ts`). For each `tracks` row bonded to a
  `library_index` entry but missing/empty `mimeType` (and any sibling denormalized
  fields the styling needs), STAMP it from the bonded library entry.
- **`dryRun` param, DEFAULT TRUE** ([[feedback_dryrun_is_observability]]) — returns
  the full would-change report (counts + per-row before/after) without writing;
  refuse-gates fire only on real writes. Idempotent (re-run = 0 changes).
- **Trusted-leader gated** (admin/band_leader → `assertEditor`; [[feedback_mcp_validation_shape]]
  — validation surfaces as `result.isError:true` prose, never JSON-RPC error).
- Atomic-guard contract on every Firestore mutation per [[feedback_upload_atomicity]]
  (read-verify; broadcast `library_signals` if that's how siblings notify).
- ★ Self-heal/learning: if a correction pattern repeats, record a structured signal
  ([[feedback_learning_self_healing]]) — only if cheap; don't over-build.

## Do NOT
- Do NOT run the backfill on prod data in this lane. Shipping the tool ≠ running it.
  The RUN is Daniel's: `dryRun:true` → review the diff → apply. Single named
  executor ([[feedback_single_owner_destructive_runs]]).
- Don't touch the bond (`fileId`) — only the denormalized metadata.

## Gates + ship
Real `npm ci`: new-tool unit tests (dryRun report shape + idempotency + role gate +
self-inclusion if applicable [[feedback_self_inclusion_test_fixtures]]) · check:types ·
eslint · `next build --webpack` exit 0. Cut FRESH worktree off `origin/master`;
**claim `index.ts` (coordinate with coder-6 who also appends there — narrow-lane
cherry-pick FF if origin moves).** SHIP-NOTICE → `inbox/auditor.md` (Tier 2) +
HEADS-UP supervisor. Deployed-verify suggestion = call `backfill_heal_metadata
{dryRun:true}` on prod → returns the real would-change set.
