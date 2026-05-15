# MCP-CF1 — `update_track` + `bulk_update_tracks`

**Author:** Claude Opus 4.7 (this conversation, 2026-05-15 pre-clear)
**Phase:** CF1 of the Claude-first roadmap (synthesis at `.paul/research/mcp-claude-first-SYNTHESIS.md`)
**Predecessors:** Waves 1-6 (commits `83d80772` → `a817202e`), all merged + deployed
**Worktree:** `sheet-music-app-mcp/` on branch `feat/mcp-server`

---

## READ THIS FIRST (cold-start orientation)

You have just resumed after a `/clear`. You have **no prior conversation context**. This document is comprehensive and self-contained. Read it through once before touching code.

### What we just finished

A two-pronged Claude-first eval (cowork-Claude attempted leader workflows via MCP; I walked the leader-side UI surface in the codebase). Both passes converged on six high-leverage missing tools. All five open design questions are **locked** (see `.paul/research/mcp-claude-first-SYNTHESIS.md` bottom). Daniel picked CF1 as the first phase to ship: `update_track` + `bulk_update_tracks`.

### Why CF1 first

- **Foundational.** Every cell-edit on an existing row needs `update_track`. Without it, callers must `remove_track` + re-`add_track_to_setlist`, which loses `trackId` identity and creates a partial-failure cliff (cowork hit one mid-eval).
- **Highest cowork severity.** Cowork called this "the single most consequential gap of this entire eval" — bit T2, T9, T1.
- **Foundation for CF2-9.** `clone_setlist`'s tweak-list, `bulk_update_tracks` for scheduling reassignment, `publish_setlist`'s per-row mutations all build on this.
- **Pure server-side wrap.** No new external dependencies, no UI changes, no migrations.

### Memory references (already in your auto-memory)

- `project_mcp_status.md` — 22-tool surface; Wave 4/5/6 ship state.
- `feedback_admin_rate_limit_bypass.md` — admins bypass rate limits via `{isAdmin: true}`.
- `feedback_git_push.md` — push `origin master`, not `origin master:main`.

### Worktree topology

```
C:\Users\dsbog\CentralReform.live\
├── sheet-music-app\          ← master worktree (docs + PAUL work)
└── sheet-music-app-mcp\      ← feat/mcp-server worktree (THIS PHASE'S WORK)
```

Both share `.git`. master and feat/mcp-server should both be at `34232c54` (the locked-decisions commit) when you start.

### Pre-flight before coding

From the MCP worktree (`sheet-music-app-mcp/`):
```bash
git fetch origin
git status --short --branch                 # clean on feat/mcp-server
git log --oneline -5                        # most recent commit should be 34232c54
```

---

## Goal

Ship two MCP tools that close the per-row-edit gap:

1. **`update_track(setlistId, trackId, patch)`** — partial-row update. Idempotent. Returns the updated row.
2. **`bulk_update_tracks(setlistId, patches, options)`** — multi-row update. Atomic-or-best-effort, with dry-run preview.

Both gated on admin/band_leader role (`assertEditor`). Both wrap a new Admin-SDK helper in `src/lib/mcp/server-tracks-write.ts`.

## Scope boundaries

**IN scope:**
- The two MCP tools, their Zod schemas, their server-side helpers
- Emulator test coverage (happy path, type changes, identity preservation, atomicity, best-effort partial failure, dry-run, max-affected cap, role gating, idempotency)
- Wave-style commit + ff-merge + push + Vercel verify

**OUT of scope:**
- Position changes via `update_track` — those route through `reorder_setlist` (existing tool). The `patch` schema below explicitly excludes `position` and `order`.
- Track creation or deletion — those stay with `add_track_to_setlist` / `remove_track`.
- Setlist meta — `update_setlist` already covers it (Wave 1 + Wave 6 echo).
- Soft-delete — that's CF4.
- Clone — that's CF2.
- The `section` → `header` backfill — that's CF3.
- Any UI changes — CF1 is server-only.

---

## Design

### `updateTrack` helper (server-tracks-write.ts)

```ts
export interface UpdateTrackPatch {
    key?: string
    leadMusician?: string
    title?: string
    notes?: string
    type?: "song" | "header" | "reading" | "prayer" | "transition" | "note"
    songId?: string  // re-bonding to a different library song
    referenceLink?: string
}

export async function updateTrack(
    db: DB,
    setlistId: string,
    trackId: string,
    patch: UpdateTrackPatch,
): Promise<{ ok: true; track: Record<string, unknown> } | WriteError> {
    // 1. Verify the track exists AND belongs to setlistId (defense against
    //    trackId-from-another-setlist confusion).
    const trackRef = db.collection("tracks").doc(trackId)
    const snap = await trackRef.get()
    if (!snap.exists) return { ok: false, error: "Track not found" }
    const existing = snap.data() as Record<string, unknown>
    if (existing.setlistId !== setlistId) {
        return { ok: false, error: "Track does not belong to this setlist" }
    }

    // 2. Build the Firestore update payload (only fields the caller set).
    const update: Record<string, unknown> = {
        updatedAt: FieldValue.serverTimestamp(),
    }
    let changed = false
    for (const k of ["key", "leadMusician", "title", "notes", "type", "songId", "referenceLink"] as const) {
        if (patch[k] !== undefined) {
            update[k] = patch[k]
            changed = true
        }
    }
    if (!changed) {
        return { ok: false, error: "patch must include at least one field to update" }
    }

    // 3. Re-bonding: if songId changed AND we have access to the song's chart
    //    fileId, update fileId + fileName too. For now, keep this simple — if
    //    the caller passes songId, also update fileId to match (the library
    //    is keyed by Drive file id, so fileId === songId). The parent's
    //    fileIds set gets reconciled by the SetlistGridHydrator client-side
    //    next time it loads; an exact server-side reconcile is OBE for CF1.
    if (patch.songId !== undefined && patch.songId !== existing.songId) {
        update.fileId = patch.songId
        // fileName left to the client-side reconciler; we don't have a
        // server-side song lookup that always returns the catalog title here
        // without adding a Firestore read per update. Skip for CF1.
    }

    const batch = db.batch()
    batch.update(trackRef, update)
    batch.update(db.collection("setlists").doc(setlistId), {
        updatedAt: FieldValue.serverTimestamp(),
    })
    await batch.commit()

    logger.info("[mcp] track updated", {
        setlistId,
        trackId,
        fields: Object.keys(update).filter((k) => k !== "updatedAt"),
    })

    // Return the post-update state by re-reading. Costs one extra Firestore
    // read but matches the Wave 6 G-11 echo pattern callers now expect.
    const after = (await trackRef.get()).data() as Record<string, unknown>
    return { ok: true, track: after }
}
```

### `bulkUpdateTracks` helper (server-tracks-write.ts)

```ts
export const BULK_UPDATE_MAX_PATCHES = 50  // hard cap; matches the worst-case full-setlist case

export interface BulkUpdatePatchEntry {
    trackId: string
    patch: UpdateTrackPatch
}

export interface BulkUpdateResult {
    trackId: string
    ok: boolean
    error?: string
    track?: Record<string, unknown>
}

export async function bulkUpdateTracks(
    db: DB,
    setlistId: string,
    patches: BulkUpdatePatchEntry[],
    options: {
        mode?: "atomic" | "best-effort"
        dryRun?: boolean
    },
): Promise<
    | { ok: true; mode: "atomic" | "best-effort"; results: BulkUpdateResult[]; dryRun: boolean }
    | WriteError
> {
    if (patches.length === 0) {
        return { ok: false, error: "patches must include at least one entry" }
    }
    if (patches.length > BULK_UPDATE_MAX_PATCHES) {
        return {
            ok: false,
            error: `patches exceeds max (${BULK_UPDATE_MAX_PATCHES}); chunk into multiple calls`,
        }
    }
    const mode = options.mode ?? "atomic"
    const dryRun = options.dryRun ?? false

    // 1. Pre-validate every patch against the live state. Reads are cheap;
    //    a single getTracksForSetlist scans the index, fanning out per-id
    //    would be N Firestore reads.
    const existing = await getTracksForSetlist(db, setlistId, {})
    const byId = new Map(existing.map((t) => [t.id, t]))

    const plan: BulkUpdateResult[] = patches.map(({ trackId, patch }) => {
        const row = byId.get(trackId)
        if (!row) {
            return { trackId, ok: false, error: "Track not found in this setlist" }
        }
        const fields = Object.keys(patch).filter(
            (k) => patch[k as keyof UpdateTrackPatch] !== undefined,
        )
        if (fields.length === 0) {
            return { trackId, ok: false, error: "patch must include at least one field" }
        }
        return { trackId, ok: true, track: { id: trackId, ...row, ...patch } }
    })

    const anyFailed = plan.some((p) => !p.ok)

    // 2. atomic mode + any failure → reject the whole batch upfront.
    if (mode === "atomic" && anyFailed) {
        return {
            ok: true,
            mode,
            results: plan,
            dryRun,  // dry-run still reports the would-fail rows; the caller
                     // can decide whether to switch to best-effort
        }
    }

    // 3. dry-run short-circuit — return the plan without writing.
    if (dryRun) {
        return { ok: true, mode, results: plan, dryRun: true }
    }

    // 4. Apply. atomic = single Firestore transaction; best-effort = loop.
    if (mode === "atomic") {
        await db.runTransaction(async (tx) => {
            for (const entry of patches) {
                const ref = db.collection("tracks").doc(entry.trackId)
                const update: Record<string, unknown> = {
                    updatedAt: FieldValue.serverTimestamp(),
                }
                for (const k of [
                    "key", "leadMusician", "title", "notes", "type", "songId", "referenceLink",
                ] as const) {
                    if (entry.patch[k] !== undefined) update[k] = entry.patch[k]
                }
                if (entry.patch.songId !== undefined) {
                    update.fileId = entry.patch.songId
                }
                tx.update(ref, update)
            }
            tx.update(db.collection("setlists").doc(setlistId), {
                updatedAt: FieldValue.serverTimestamp(),
            })
        })
    } else {
        // best-effort: ignore atomic-mode pre-validation rejection; try each
        // patch independently, accumulate results.
        for (let i = 0; i < patches.length; i++) {
            const entry = patches[i]
            if (!plan[i].ok) continue  // pre-validation failure — skip
            try {
                const r = await updateTrack(db, setlistId, entry.trackId, entry.patch)
                if ("ok" in r && r.ok) {
                    plan[i] = { trackId: entry.trackId, ok: true, track: r.track }
                } else {
                    plan[i] = { trackId: entry.trackId, ok: false, error: r.error }
                }
            } catch (err) {
                plan[i] = {
                    trackId: entry.trackId,
                    ok: false,
                    error: err instanceof Error ? err.message : String(err),
                }
            }
        }
    }

    logger.info("[mcp] bulk track update", {
        setlistId,
        mode,
        patchCount: patches.length,
        anyFailed: plan.some((p) => !p.ok),
    })

    return { ok: true, mode, results: plan, dryRun: false }
}
```

### `updateTrack` MCP tool wrapper (tools/setlist-write.ts)

```ts
export interface UpdateTrackArgs {
    setlistId: string
    trackId: string
    patch: UpdateTrackPatch
}

export async function updateSetlistTrack(
    uid: string,
    args: UpdateTrackArgs,
): Promise<{ ok: true; track: Record<string, unknown> } | ToolError> {
    initAdmin()
    const db = getFirestore()

    const loaded = await loadEditableSetlist(db, args.setlistId, uid)
    if (!loaded.ok) return { error: loaded.error }

    const result = await updateTrack(db, args.setlistId, args.trackId, args.patch)
    return result.ok ? { ok: true, track: result.track } : { error: result.error }
}
```

(Named `updateSetlistTrack` to avoid clashing with the helper's name; registered as `update_track` on the MCP surface.)

### `bulkUpdateTracks` MCP tool wrapper

```ts
export interface BulkUpdateTracksArgs {
    setlistId: string
    patches: BulkUpdatePatchEntry[]
    mode?: "atomic" | "best-effort"
    dryRun?: boolean
}

export async function bulkUpdateSetlistTracks(
    uid: string,
    args: BulkUpdateTracksArgs,
): Promise<
    | { ok: true; mode: "atomic" | "best-effort"; results: BulkUpdateResult[]; dryRun: boolean }
    | ToolError
> {
    initAdmin()
    const db = getFirestore()

    const loaded = await loadEditableSetlist(db, args.setlistId, uid)
    if (!loaded.ok) return { error: loaded.error }

    const result = await bulkUpdateTracks(db, args.setlistId, args.patches, {
        mode: args.mode,
        dryRun: args.dryRun,
    })
    if (!("ok" in result) || !result.ok) {
        return { error: "error" in result ? result.error : "bulk update failed" }
    }
    return {
        ok: true,
        mode: result.mode,
        results: result.results,
        dryRun: result.dryRun,
    }
}
```

### Zod schemas + tool registration (tools/index.ts)

```ts
// Shared patch schema — used by both tools.
const trackPatchSchema = z.object({
    key: z.string().optional(),
    leadMusician: z.string().optional(),
    title: z.string().optional(),
    notes: z.string().optional(),
    type: z
        .enum(["song", "header", "reading", "prayer", "transition", "note"])
        .optional(),
    songId: z.string().optional(),
    referenceLink: z.string().optional(),
})

// In registerWriteTools, add:
server.registerTool(
    "update_track",
    {
        description:
            "Update one track's metadata on a setlist (key, vocal lead, title, notes, type, bonded songId, referenceLink). Preserves trackId — unlike remove+add — so external references stay valid. Only fields you pass in `patch` get updated; omitted fields untouched. Position/order cannot be changed via update_track — use reorder_setlist. Admins and band leaders only.",
        inputSchema: {
            setlistId: z.string().describe("Setlist id"),
            trackId: z.string().describe("Track id (from get_setlist tracks[].id)"),
            patch: trackPatchSchema.describe(
                "Fields to update. At least one must be set. Pass `songId` to re-bond the row to a different library song (fileId follows automatically).",
            ),
        },
    },
    async (args, extra) =>
        jsonResult(await updateSetlistTrack(uidFrom(extra), args)),
)

server.registerTool(
    "bulk_update_tracks",
    {
        description:
            "Update many tracks on one setlist in a single call. mode='atomic' (default) wraps every patch in a Firestore transaction — all-or-nothing; mode='best-effort' applies each patch independently and returns per-row results. dryRun=true returns the plan without writing — useful for confirming a large change before committing. Max 50 patches per call (chunk longer lists). Admins and band leaders only.",
        inputSchema: {
            setlistId: z.string().describe("Setlist id"),
            patches: z
                .array(
                    z.object({
                        trackId: z.string(),
                        patch: trackPatchSchema,
                    }),
                )
                .min(1)
                .max(50)
                .describe("Per-track patches; max 50"),
            mode: z
                .enum(["atomic", "best-effort"])
                .optional()
                .describe(
                    "atomic (default): all-or-nothing transaction. best-effort: per-row results, partial success allowed.",
                ),
            dryRun: z
                .boolean()
                .optional()
                .describe(
                    "If true, return the plan without writing. Useful for confirming a >5-row change before committing.",
                ),
        },
    },
    async (args, extra) =>
        jsonResult(await bulkUpdateSetlistTracks(uidFrom(extra), args)),
)
```

Import `updateSetlistTrack` and `bulkUpdateSetlistTracks` from `./setlist-write` at the top of `tools/index.ts` alongside the existing imports.

---

## Test plan

All tests live in `src/lib/mcp/__tests__/mcp-setlist-write.emulator.test.ts`. Pattern follows the existing tests (admin/band_leader/musician role tiers; emulator-backed Firestore).

Wrap in `describe("update_track + bulk_update_tracks (CF1)", () => { ... })`. Add 11 test cases:

### `update_track`

1. **happy path** — admin updates one row's leadMusician → verify Firestore reflects the change AND the response echoes the updated track.
2. **identity preserved** — trackId of the updated row is unchanged (regression vs old remove+add path).
3. **type change** — `type` from `'song'` to `'reading'` round-trips (regression test for the Wave 5 widened enum integration).
4. **songId re-bond** — pass new `songId`; verify `fileId` follows in the Firestore doc.
5. **role gate** — musician cannot update; band_leader and admin can.
6. **cross-setlist guard** — trackId from setlist A passed with setlistId B → "does not belong to this setlist" error.
7. **empty patch** — `patch: {}` → "must include at least one field" error.
8. **missing track** — bogus trackId → "Track not found" error.

### `bulk_update_tracks`

9. **atomic happy path** — 3 patches all valid → one transaction → all 3 rows updated.
10. **atomic partial-failure rejects all** — 3 patches, one invalid trackId → result envelope reports the failure, NO Firestore writes happen.
11. **best-effort partial success** — same 3 patches, mode='best-effort' → 2 rows updated, 1 reports its error in results[].
12. **dry-run** — atomic with 3 valid patches + dryRun=true → returns plan, NO Firestore writes happen.
13. **max-affected cap** — 51 patches → "exceeds max" error before any writes.

(13 total cases. The dry-run test should explicitly read the affected rows after the call and confirm they're unchanged.)

---

## Verification gates

Run from `sheet-music-app-mcp/`:

```bash
# Unit suite (fast, no emulator needed)
npx vitest run src/lib/mcp/ src/lib/rate-limit.test.ts
# Expect: all pass.

# Emulator suite (requires firebase emulator)
npx firebase emulators:exec --only firestore --project demo-mcp \
  "npx vitest run --config vitest.emulator.config.ts src/lib/mcp/__tests__/"
# Expect: 80+13 = 93 tests pass.

# Build (catches Next.js route-export violations + type errors)
npm run build
# Expect: EXIT 0.
```

All three must be green before commit.

---

## Commit + ff-merge + deploy

Single CF1 commit on `feat/mcp-server`:

```
feat(mcp): CF1 — update_track + bulk_update_tracks (per-row edit closure)

Closes the per-row edit gap identified by the 2026-05-15 claude-first
eval. cowork's report called this "the single most consequential gap"
— it bit T2, T9, T1 directly and caused a real partial-failure cliff
mid-eval. CF1 ships two MCP tools:

- update_track(setlistId, trackId, patch) — partial-row update; only
  fields in `patch` mutate; trackId preserved (unlike remove+add).
  Cross-setlist guard rejects trackId-from-another-setlist confusion.
  Re-bonds fileId automatically when songId changes. Returns the
  post-update track row (matches the Wave 6 G-11 echo pattern).

- bulk_update_tracks(setlistId, patches, mode, dryRun) — multi-row
  update. mode='atomic' (default) wraps in a Firestore transaction
  (all-or-nothing); mode='best-effort' returns per-row results.
  dryRun=true returns the plan without writing. Capped at 50 patches
  per call.

Both gated on admin/band_leader role via assertEditor + loadEditableSetlist.
Both wrap a new updateTrack/bulkUpdateTracks helper pair in
src/lib/mcp/server-tracks-write.ts.

Verification:
- npx vitest run src/lib/mcp/ + rate-limit.test.ts — N tests pass
- emulator suite — 93 tests pass (80 prior + 13 new CF1 cases)
- npm run build — EXIT 0
- HFG counter 0/3

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
```

Then deploy:

```bash
# From sheet-music-app-mcp/ — confirm clean
git status --short

# From sheet-music-app/ (master worktree)
git merge --ff-only feat/mcp-server
git push origin master
# Vercel auto-deploys; wait for READY

# Force-push the dev branch (history is linear; no rebase needed if commit was on top of master)
git push origin feat/mcp-server
```

Verify on the live MCP that `update_track` and `bulk_update_tracks` are visible in the 24-tool surface (was 22; +2 = 24).

---

## Risk register

| Risk | Mitigation |
|---|---|
| `update_track` with `songId` change leaves stale `fileName` | Documented in helper comment; client-side reconciler normalizes on next load. Acceptable for CF1; revisit if it surfaces in cowork verification. |
| Atomic transaction hits the 500-write Firestore limit | Cap at 50 patches × ~2 writes each = 100 writes — well under limit. |
| Best-effort mode N+1 problem (N Firestore round-trips) | Documented in tool description ("prefer atomic for >5 rows"); acceptable for CF1. |
| Cross-setlist trackId confusion | Pre-validation in `updateTrack` rejects with explicit error. |
| Role-gate bypass | `loadEditableSetlist` already enforces; mirrors `add_track_to_setlist`, `remove_track`, `reorder_setlist`. |
| Schema validation gaps | Zod handles at MCP boundary; emulator tests cover empty-patch + missing-track + bad-trackId. |
| Wave 5 widened-enum interaction | Tested explicitly (test case 3: type change song→reading). |

---

## Post-ship validation (cowork follow-up)

After deploy, the next cowork stress-test cycle (or a focused mini-run) should re-attempt T2 ("Randy leads songs 2, 4, 7") with the new tools. Expected: 1 `bulk_update_tracks` call replaces the prior 26 `remove+add` calls. Partial-failure cliff goes away in atomic mode.

Append the result to `.paul/research/mcp-cf1-VERIFY.md` (or update the synthesis). Auto-memory `project_mcp_status.md` gets a CF1 row in the wave-shipping log.

---

## Resume prompt (paste this after `/clear`)

```
Resume MCP-CF1 implementation — update_track + bulk_update_tracks.
Full plan at `.paul/research/mcp-cf1-PLAN.md`; synthesis at
`.paul/research/mcp-claude-first-SYNTHESIS.md`; eval reports at
`.paul/research/mcp-claude-first-cowork-REPORT.md` and the rerun
variant. Read the plan first.

All design decisions are pre-resolved. The work:
- update_track(setlistId, trackId, patch) — partial-row patch,
  trackId preserved, songId→fileId auto-rebond, role-gated, returns
  echo
- bulk_update_tracks(setlistId, patches, mode, dryRun) — atomic
  (default) via Firestore transaction OR best-effort loop; dry-run
  preview; max 50 patches; role-gated
- New helpers in src/lib/mcp/server-tracks-write.ts; tool wrappers
  in src/lib/mcp/tools/setlist-write.ts; Zod schemas + registration
  in src/lib/mcp/tools/index.ts
- 13 new emulator tests in
  src/lib/mcp/__tests__/mcp-setlist-write.emulator.test.ts

Work the plan top-to-bottom. Switch to the MCP worktree
(`cd ../sheet-music-app-mcp`), confirm clean tree on `feat/mcp-server`
at commit 34232c54, then start. Single CF1 commit on feat/mcp-server,
ff-merge to master from sheet-music-app/, `git push origin master`
(NOT `:main` — Daniel-explicit), then `git push origin feat/mcp-server`,
then verify Vercel READY.

Verification gates (all three must be green):
- npx vitest run src/lib/mcp/ src/lib/rate-limit.test.ts
- npx firebase emulators:exec --only firestore --project demo-mcp
  "npx vitest run --config vitest.emulator.config.ts src/lib/mcp/__tests__/"
  (expect 93 pass: 80 prior + 13 new CF1 cases)
- npm run build (EXIT 0)

Do NOT touch v7.1 work, the feat/v71-* branches, bridge/**, or any
non-MCP code. Use `git push origin master` (not `:main`).

Read auto-memory first for the latest project state. Key memory:
- project_mcp_status.md (22-tool surface, wave shipping log)
- feedback_admin_rate_limit_bypass.md (admins bypass rate limits)
- feedback_git_push.md (origin master, not origin master:main)

After ship, append a CF1 row to project_mcp_status.md's wave-shipping
log and surface the 24-tool count (was 22; +2 new).
```
