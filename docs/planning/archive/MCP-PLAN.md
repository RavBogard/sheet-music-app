# MCP Server for centralreform.live — Plan

Two workstreams need to happen on this repo: (a) finishing the in-flight milestone, and (b) adding a Model Context Protocol (MCP) server so Claude (desktop, web, Code) can read and modify setlists through natural language.

**The first question this plan answers is whether (a) and (b) can run in parallel** — in two separate Claude Code instances on two branches — or whether they need to be sequential (pause-build-resume).

Read this entire document before doing anything. Phase 0 is mandatory and produces the data needed to choose the path.

---

## Reading order

1. **Phase 0 — Evaluate.** Stability check + parallelism feasibility analysis. Output: `WORKSTREAM-EVAL.md` with a recommendation. Stop and wait for user.
2. **Phase 1 — Decide and set up.** User picks parallel or sequential based on the eval. Set up branches/worktrees accordingly.
3. **Phases 2–7 — Build MCP.** Same content regardless of path.
4. **Phase 8 — Reconcile.** Parallel path: merge and integration-test. Sequential path: replan remaining milestone work.
5. **Phase 9 — Finish the milestone.**

---

## Phase 0 — Evaluate (no code changes)

Run this in a single Claude Code session against `master`. **Do not create branches, do not edit production files, do not install dependencies.** Pure investigation.

### 0.1 Stability check

The repo must be in a stable, working state before any branching plan can work. Confirm:

- `npm run build` succeeds
- `npm test` passes
- Lint passes
- No half-applied refactors, no broken imports, no commented-out work-in-progress blocks
- Working tree is committable

If any of these fail, **stop and report** — fixing instability is a prerequisite to either path. Don't proceed with the eval until the user has acknowledged.

### 0.2 Identify the in-flight milestone

Find what's currently in flight. Likely sources:

- `.planning/`
- Root-level `*-PLAN.md`, `LIVING-SCORE-*.md`, `BUGFIX-PLAN-*.md`, `AUDIT-*.md`, `IMPLEMENTATION-STATUS.md`
- Recent commits on `master`
- `.claude/`, `.codex/`, `.gemini/` scratch state

Identify: milestone name, what's done, what's in progress, what's remaining. Note the source planning doc(s).

### 0.3 MCP-readiness scan

To know what the MCP build will touch, first look at:

- **`bridge/` folder** — every file. Is it a prior MCP attempt, an unrelated bridge, or stale? Decide extend / replace / leave alone.
- **AI Chat Assistant code** — README says it does "Natural language setlist management." Locate it (likely `src/app/api/ai-chat/...` or `src/lib/ai/...`). List its handler functions / server actions for setlist operations with file paths. These are the *exact* functions the MCP tools will wrap.
- **Firestore schema** for setlists, tracks, songs, users, schedule. Use `src/types/`, `firestore.rules`, `firestore.indexes.json`, existing `CODEBASE-ANALYSIS.md` / `AUDIT-*.md`.
- **Auth pattern** — how do existing `/api/*` routes validate Firebase Auth and obtain a UID? The MCP route will use bearer tokens but pass the same UID shape downstream.

### 0.4 Overlap analysis

Build an overlap matrix in `WORKSTREAM-EVAL.md`. For each file or area that MCP will touch and each that the remaining milestone work will touch, classify conflict risk:

| Area | MCP will touch? | Milestone touches? | Conflict risk |
|---|---|---|---|
| `firestore.rules` | yes (add `mcpTokens` collection rules) | ? | ? |
| `firestore.indexes.json` | maybe | ? | ? |
| `src/app/(main)/settings/...` | yes (new "Claude / MCP access" section) | ? | ? |
| `src/app/api/ai-chat/...` | possible refactor for dedupe | ? | ? |
| `src/lib/firebase/...` (auth helpers) | possibly | ? | ? |
| `package.json` / lockfile | yes (`@modelcontextprotocol/sdk`, `mcp-handler`) | likely | low |
| `bridge/` | yes (possibly) | ? | ? |
| (others — fill in based on what the milestone is) | | | |

Risk levels:

- **None** — no file or area overlap
- **Low** — same files but different sections; merge resolves easily
- **Medium** — same area, needs coordination but workable in parallel with rules
- **High** — same functions being rewritten in both branches → must serialize

### 0.5 Recommendation

Based on the matrix, recommend one of:

- **Parallel-safe** — most overlap is None/Low. Run both workstreams in parallel Claude Code instances on separate branches/worktrees with light coordination.
- **Parallel-with-care** — some Medium overlap. Doable in parallel with explicit ownership rules (one branch "owns" shared files until merged), daily sync cadence, defined merge order.
- **Sequential** — any High overlap, or so many Mediums that coordination cost exceeds the parallelism gain. Pause the milestone, build MCP, replan, resume.

Be concrete about *why*. Don't hedge.

### 0.6 Output

Commit `WORKSTREAM-EVAL.md` at the repo root containing:

- Milestone identified (name, source doc, % complete, remaining tasks summarized)
- `bridge/` decision
- AI Chat Assistant handlers list (with file paths)
- Firestore schema summary
- Overlap matrix (filled in)
- Recommendation with reasoning
- Estimated wall-clock time for each path

**Stop. Show the user. Wait for the path decision.**

---

## Phase 1 — Decide and set up

User picks the path. Based on choice:

### 1A. Parallel path setup

```bash
# From the existing repo (already on master, clean):
git worktree add ../sheet-music-app-mcp -b feat/mcp-server master
```

Open `../sheet-music-app-mcp` in a **second** Claude Code instance (new terminal / new IDE window). The original instance keeps working on the milestone branch. The second one runs Phases 2–7 of this plan.

Commit a `WORKSTREAMS.md` at the repo root (on `master`, pulled into both branches) that contains:

- **Owners by file/area** (from the overlap matrix). Example:
  - MCP branch owns: `src/app/api/mcp/**`, `src/lib/mcp/**`, MCP-related `firestore.rules` additions, settings page MCP section
  - Milestone branch owns: [whatever it owns]
  - Shared (coordinate before editing): `firestore.rules`, `firestore.indexes.json`, `package.json`, `src/app/api/ai-chat/**`
- **Sync cadence**: end of each working day, both branches push, rebase on the other if shared files changed, re-run tests.
- **Merge order**: typically MCP first (smaller, more contained), then milestone rebases. Confirm with user.
- **Testing environment**: both branches use the Firebase emulator for tests. Production Firestore is only touched after merge to `master`. Vercel preview deploys are fine for manual testing.
- **Abort criteria**: if shared-file conflicts start exceeding ~30 min/day of coordination, pause parallel work and switch to sequential.

### 1B. Sequential path setup

1. Create `MILESTONE-PAUSE.md` at the repo root, containing:
   - Milestone name and source doc
   - Completed so far (bulleted, with commit SHAs where useful)
   - Remaining tasks (summarized from the source doc)
   - In-progress at pause time — what was the next thing? What was half-thought-through?
   - Open questions / risks carried over
   - Pause commit SHA
   - Resume preconditions ("Phase 7 MCP work merged, tests green")
2. Commit `MILESTONE-PAUSE.md` to `master`.
3. `git checkout -b feat/mcp-server`. All of Phases 2–7 happen here.

---

## Phase 2 — Token-based auth

Start with simple per-user bearer tokens. OAuth is a future upgrade.

### 2.1 Token format

`crl_live_` + 32 random bytes, hex-encoded. The user copies this string into Claude when adding the connector.

### 2.2 Firestore storage

New root collection:

```
mcpTokens/{tokenId}
  tokenHash:   string     // sha256(rawToken), hex
  uid:         string     // owner's Firebase UID
  label:       string     // user-provided, e.g. "Claude Desktop"
  createdAt:   timestamp
  lastUsedAt:  timestamp | null
  revokedAt:   timestamp | null
```

**Security rules:** `mcpTokens` is server-only. No client read or write. Admin SDK only.

### 2.3 Settings UI

New section in the settings page — "Claude / MCP access":

- Button: **Generate new token**
- On generation, display the token **once** with "you will not see this again — copy it now"
- Table of existing tokens (label, created, last used, revoke button)
- Server actions `createMcpToken(label)` and `revokeMcpToken(tokenId)`

Match existing Tailwind + shadcn/ui styling.

### 2.4 Verifier

```ts
// Pseudocode shape
async function verifyBearer(req: Request): Promise<{ uid: string } | Response> {
  const auth = req.headers.get('authorization');
  if (!auth?.startsWith('Bearer ')) return new Response('Unauthorized', { status: 401 });
  const raw = auth.slice(7).trim();
  const hash = sha256Hex(raw);
  const snap = await adminDb.collection('mcpTokens').where('tokenHash', '==', hash).limit(1).get();
  if (snap.empty) return new Response('Unauthorized', { status: 401 });
  const doc = snap.docs[0];
  const data = doc.data();
  if (data.revokedAt) return new Response('Unauthorized', { status: 401 });
  await doc.ref.update({ lastUsedAt: FieldValue.serverTimestamp() });
  return { uid: data.uid };
}
```

Never log the raw token. Only token IDs.

---

## Phase 3 — MCP route

`src/app/api/mcp/route.ts` using `@modelcontextprotocol/sdk` plus `mcp-handler` (Vercel's Next.js wrapper):

```ts
// Pseudocode — adapt to mcp-handler's current API
import { createMcpHandler } from 'mcp-handler';
import { z } from 'zod';
import { verifyBearer } from '@/lib/mcp/auth';
import * as tools from '@/lib/mcp/tools';

const handler = createMcpHandler(
  (server) => {
    server.tool(
      'list_setlists',
      'List the user\'s setlists, newest first. Use this when the user asks about their upcoming or recent gigs/services.',
      { from: z.string().optional(), to: z.string().optional(), limit: z.number().optional() },
      async (args, ctx) => tools.listSetlists(ctx.uid, args),
    );
    // ... more tools
  },
  {},
  { basePath: '/api' /* with auth injected via verifyBearer wrapper */ },
);

export { handler as GET, handler as POST };
```

Keep the route thin. Auth verifier in `src/lib/mcp/auth.ts`. Each tool in `src/lib/mcp/tools/*.ts`. Tool handlers take the resolved UID and delegate to the AI Chat Assistant's existing functions. **No duplicated business logic.**

---

## Phase 4 — Tool catalog

Ship **read** tools first. Verify end-to-end (Claude Desktop → MCP route → Firestore → response) before adding writes.

Tool descriptions matter — they're what Claude reads to decide when to invoke. One-sentence "what + when," plus quirks ("BPMs are integers").

### 4.1 Read tools (Phase 4a — ship first)

| Tool | Args | Returns |
|---|---|---|
| `list_setlists` | `{ from?: ISO date, to?: ISO date, limit?: number (default 20) }` | array of `{ id, name, date, venue?, trackCount, status? }` |
| `get_setlist` | `{ id: string }` | full setlist with ordered tracks |
| `search_library` | `{ query: string, key?: string, bpmMin?: number, bpmMax?: number, limit?: number }` | array of `{ id, title, key, bpm, composer?, tags? }` |
| `get_song` | `{ id: string }` | metadata only — NO PDF bytes |

### 4.2 Write tools (Phase 4b — only after reads work)

| Tool | Args | Returns |
|---|---|---|
| `create_setlist` | `{ name, date?, venue? }` | `{ id }` |
| `add_track_to_setlist` | `{ setlistId, songId, position?, sectionHeader?, notes? }` | `{ trackId, position }` |
| `reorder_setlist` | `{ setlistId, orderedTrackIds[] }` | `{ ok: true }` |
| `remove_track` | `{ setlistId, trackId }` | `{ ok: true }` |
| `update_setlist` | `{ id, name?, date?, venue? }` | `{ ok: true }` |
| `schedule_setlist` (only if concept exists — confirmed in 0.3) | `{ setlistId, date, musicians?[] }` | `{ ok: true }` |

### 4.3 NOT exposed (out of scope)

- Library writes (chart uploads)
- Other users' data
- PDF bytes
- Account / musician profile changes
- Gemini chord detection invocation

---

## Phase 5 — Testing

- **Unit (Vitest):** one per tool, Firestore Admin SDK mocked. Assert correct underlying call and UID propagation.
- **Auth:** missing header → 401; bad token → 401; revoked → 401; valid → updates `lastUsedAt`.
- **Emulator integration:** `vitest.emulator.config.ts` exists — use it. Real bearer token, real emulator, exercise list/get/create/add flow.
- **Manual smoke (against Vercel preview):** connect from Claude Desktop, prompts like:
  - "Show me my upcoming setlists"
  - "What's on the setlist for next Sunday?"
  - "Find songs in G with BPM under 80"
  - "Create a new setlist called 'Shabbat 5/24' for May 24"
  - "Add 'Lecha Dodi' to that setlist"

---

## Phase 6 — Deploy and connect

1. Push branch, open PR, verify Vercel preview builds.
2. Test against preview URL with a token. (Preview shares prod Firestore by default — consider scoping tokens "dev" labels or use emulator.)
3. Merge to `master`, production deploys.
4. **Connecting Claude:**
   - **Claude Desktop / Claude.ai web:** Settings → Connectors → Add custom connector. URL: `https://centralreform.live/api/mcp`. Auth: bearer token.
   - **Claude Code:** `claude mcp add centralreform-live https://centralreform.live/api/mcp --header "Authorization: Bearer crl_live_..."` (verify current syntax).
5. Write `docs/claude-mcp.md` for end users.

---

## Phase 7 — (renumber-only) Recap

Phases 2–6 complete = MCP shipped to prod. What happens next depends on path:

- **Parallel path:** the milestone branch has been progressing in parallel. Go to Phase 8A.
- **Sequential path:** time to resume the paused milestone. Go to Phase 8B.

---

## Phase 8A — Parallel reconcile (parallel path)

When both branches are ready to merge (or when the second-to-finish is ready):

### 8A.1 Merge order

Default: MCP first (smaller, more contained). Then rebase the milestone branch on the new `master`.

### 8A.2 Integration check

Even though branches were independent, look for:

- **Hidden coupling:** anything the milestone built that should now *also* be exposed via MCP? (Don't expand scope thoughtlessly — flag and decide.)
- **Auth or schema drift:** did the milestone change anything the MCP route assumed?
- **Test interactions:** do the combined test suites pass?

If yes to any, produce `MILESTONE-ADDENDUM.md` with the deltas, get user approval, then implement before merging the second branch.

### 8A.3 Final smoke test

Run the full suite against the merged state. Manual smoke-test MCP + a milestone feature together. Production deploy.

## Phase 8B — Sequential reconcile (sequential path)

Re-read `MILESTONE-PAUSE.md`, `WORKSTREAM-EVAL.md`, and the original milestone source doc. Pull `master` so you're against the post-MCP state.

For each remaining milestone task, ask:

1. **Still needed?** Has MCP made it obsolete or shifted its scope?
2. **Still correct?** Does the design still hold given the MCP code that now exists (token auth, tool layer, any chat-assistant refactor)?
3. **New dependencies?** Did the task gain a dependency on MCP — or vice versa?
4. **New opportunities?** Should anything in the remaining work also be MCP-exposed? (Flag, decide deliberately.)
5. **New risks?** Auth, rate limits, data exposure considerations the milestone didn't originally account for.

Produce `MILESTONE-REPLAN.md`:

- Tasks **kept as-is**
- Tasks **modified** (and why)
- Tasks **dropped** (and why)
- Tasks **added** (and why)
- Revised order of work
- Revised acceptance criteria

**Show the user. Wait for explicit approval before resuming work.**

---

## Phase 9 — Finish the milestone

Execute the (parallel addendum or sequential replan) work. Close per the revised acceptance criteria. Archive `WORKSTREAM-EVAL.md`, `MILESTONE-PAUSE.md` (if any), `MILESTONE-REPLAN.md` / `MILESTONE-ADDENDUM.md`, and `WORKSTREAMS.md` (if any) into `docs/milestones/` for traceability.

---

## Don'ts

- **Don't skip Phase 0.** The path decision depends on real data, not vibes.
- **Don't start MCP on a broken tree.** Stability check is non-negotiable.
- **Don't duplicate setlist business logic.** Wrap the AI Chat Assistant's functions.
- **Don't bypass Firestore rules.** Tool handlers operate as the resolved UID.
- **Don't expose raw tokens in logs, errors, or HTML.**
- **Don't ship MCP writes until reads are verified end-to-end.**
- **(Parallel path) Don't let coordination costs sneak up on you.** If shared-file conflicts start eating >30 min/day, switch to sequential.
- **(Either path) Don't skip the reconcile.** It's how integration bugs are caught before they're shipped.

---

## Stop points (wait for user input)

1. **End of Phase 0** — show `WORKSTREAM-EVAL.md`. User picks path.
2. **End of Phase 1A or 1B** — confirm setup before writing MCP code.
3. **End of Phase 4a** — confirm read tools work end-to-end with Claude Desktop before adding writes.
4. **End of Phase 6** — confirm production deploy healthy.
5. **End of Phase 8A or 8B** — show addendum or replan, get explicit approval before resuming/finishing milestone.

---

## Deliverables checklist

**Phase 0 — Evaluate**

- [ ] Stability confirmed
- [ ] `WORKSTREAM-EVAL.md` committed with overlap matrix and recommendation

**Phase 1 — Set up (one of these)**

- [ ] Parallel: worktree created, `WORKSTREAMS.md` committed, second Claude Code session running
- [ ] Sequential: `MILESTONE-PAUSE.md` committed, `feat/mcp-server` branch checked out

**Phases 2–6 — Build MCP**

- [ ] `bridge/` decision documented
- [ ] `mcpTokens` collection + rules
- [ ] Settings page section + server actions
- [ ] `src/app/api/mcp/route.ts`
- [ ] `src/lib/mcp/auth.ts`
- [ ] `src/lib/mcp/tools/*.ts` (reads first, then writes)
- [ ] Vitest tool + auth coverage
- [ ] Emulator integration test
- [ ] Manual smoke test from Claude Desktop documented
- [ ] `docs/claude-mcp.md`
- [ ] PR merged, prod deployed

**Phase 8 — Reconcile (one of these)**

- [ ] Parallel: `MILESTONE-ADDENDUM.md` (if needed), final integration smoke test
- [ ] Sequential: `MILESTONE-REPLAN.md` approved by user

**Phase 9 — Finish**

- [ ] Milestone closed per revised acceptance criteria
- [ ] All workstream docs archived to `docs/milestones/`
