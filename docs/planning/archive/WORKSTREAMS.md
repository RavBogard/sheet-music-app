# WORKSTREAMS.md — parallel workstream coordination

Two Claude Code instances are working this repo in parallel (decision: **parallel-with-care**, per `WORKSTREAM-EVAL.md` 2026-05-14).

| Workstream | Branch | Working dir | Scope |
|---|---|---|---|
| **Milestone (v7.0)** | `master` (commits directly) | `sheet-music-app/` | v70-09 → v70-06 → v70-07 → v70-08 |
| **MCP server** | `feat/mcp-server` (worktree) | `sheet-music-app-mcp/` | MCP-PLAN.md Phases 2–7 |

## Ownership

**Milestone owns (MCP does not touch):**
- `src/components/setlist/**` (incl. `MobileRowCard.tsx`, `SetlistGridTopBar`, `SetlistMetaEditSheet`)
- `src/lib/setlist-import/**`, `src/app/api/setlists/import/**`
- `src/lib/setlist-firebase.ts` + **the entire setlist write path** (`createSetlistService`, `applyEdit` fanout, any new server-side write module)
- `src/lib/server-setlists.ts`, `src/lib/server-library.ts`, `src/lib/scheduling-firebase.ts` (MCP reads/wraps these — milestone flags MCP before changing a signature)

**MCP owns (milestone does not touch):**
- `src/app/api/mcp/**`, `src/lib/mcp/**` (all new)
- Settings-page MCP section — new "Claude / MCP access" block in `src/app/(main)/settings/**`
- The `mcpTokens` block in `firestore.rules`
- New deps: `@modelcontextprotocol/sdk`, `mcp-handler`

**Neither touches:** `bridge/`, `src/app/api/bridge/**` (X32 mixer — unrelated). `SetlistGrid.tsx` + its tests (dead code; source of the 52-test baseline).

**Shared — coordinate before editing, rebase end-of-day:** `firestore.rules`, `firestore.indexes.json`, `package.json`/lockfile, `src/types/models.ts`. Edits are additive and in different sections; clean merges expected if neither surprises the other.

## Critical coordination point — v70-07

MCP write tools (Phase 4b) and v70-07's commit step both need **server-side** setlist writes. Today the only setlist-write logic (`createSetlistService`) is client-SDK only — unusable from a server route. **Resolution: the milestone branch authors the server-callable setlist-write module as part of v70-07; MCP consumes it.** Before v70-07 designs that module, the two instances agree on its signature. MCP must not independently build a competing writer.

## Sequencing

- **MCP ships reads first** (MCP-PLAN Phase 4a) and pauses before write tools (Phase 4b). Reads have zero write-path contact, so MCP Phases 2–4a run fully in parallel with v70-09/v70-06.
- **Merge order:** MCP reads + auth + settings land on `master` first (smaller, self-contained). Milestone continues on master. MCP write tools (Phase 4b) are built last, on top of the merged v70-07 write module.
- **Sync cadence:** `feat/mcp-server` rebases on `master` end of each working session; re-run `npm run build` after.

## Testing

- `npm run build` is the real gate (TS errors fail it).
- Suite baseline is **1678/52** — the 52 failures are dead-`SetlistGrid` code, not regressions. Don't treat `npm test` exit 1 as a stop-the-world failure; check that the failure set hasn't grown.
- Production Firestore is only touched after merge to `master`.

## Abort criteria

If shared-file conflict resolution exceeds ~30 min/day, collapse to sequential: pause MCP, finish the milestone, resume MCP after.
