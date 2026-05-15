# MCP Wave 4-5-6 — Stress-Test Follow-up Plan

**Author:** Claude Opus 4.7 (this conversation)
**Date written:** 2026-05-15
**Source:** `.paul/research/mcp-stress-test-2026-05-15.md` (2026-05-15 cowork-Claude stress test on production)
**Predecessor work shipped:** Waves 1–3 (commits `b0ffc5cf`, `23da31ce`, `d066fad2`, `545a9404`, `14f09605`) all merged to master + pushed; Vercel deploy READY; 20 tools live as of 2026-05-15 ~12:00 UTC.

---

## READ THIS FIRST (cold-start orientation)

You have just resumed after a `/clear`. You have **no prior conversation context**. This document is comprehensive and self-contained.

### What just shipped (Waves 1–3, deployed)

- **Wave 1 (`b0ffc5cf`)** — stress-fix: `referenceLink` round-trip (F-4), `eventDate` Zod refine (F-9), `delete_setlist` with admin-or-owner gate + cascade (F-10).
- **Wave 2 (`23da31ce`)** — monitor-control tools: `list_monitor_buses`, `get_mix`, `set_send_level`, `set_send_mute`, `set_bus_fader`, `set_matrix_fader`, `set_matrix_mute`.
- **Wave 3 (`d066fad2`)** — chart-ingestion tools: `upload_chart`, `scrape_chart_from_url`, `save_scraped_chart`. Shared lib `src/lib/library-upload.ts` (factored from `library/upload/route.ts`) + `src/lib/chart-scrape.ts` (factored from `charts/scrape/route.ts`).
- **Cleanup (`14f09605`)** — deleted dead `/api/library/save-generated/route.ts`; marked `/api/library/file/[id]/route.ts` legacy.

### What the 2026-05-15 stress test produced

- **Wave 1 fixes all confirmed in production** (F-4, F-9, F-10 ✅).
- Two stuck stress-test setlists from 2026-05-14 cleaned via `delete_setlist`.
- **17 new findings (G-1..G-17)** in `.paul/research/mcp-stress-test-2026-05-15.md` — full text there. This plan is the triage/fix queue derived from them.

### Memory references (already in your auto-memory if you have access)

- `project_mcp_status.md` — current 20-tool surface + deploy state.
- `project_mcp_parallel_workstream.md` — lane boundaries; bridge/** is do-not-touch.
- `feedback_chart_access_policy.md` — chart bytes are intentionally publicly accessible; don't propose drive/file auth tightening.
- `feedback_git_push.md` — push to `origin master`, not `origin master:main`.
- `feedback_paul_phase_commits.md` — stage the entire `.paul/phases/{phase}/` dir on PAUL commits.

### Worktree topology

```
C:\Users\dsbog\CentralReform.live\
├── sheet-music-app\          ← master worktree (the v7.x main work)
└── sheet-music-app-mcp\      ← feat/mcp-server worktree (MCP development)
```

Both share `.git`. master and feat/mcp-server point at the same commit (`14f09605`) since the last ff-merge.

### Pre-flight before coding

Run from the MCP worktree (`sheet-music-app-mcp\`):
```
git fetch origin
git status --short --branch                 # should be clean on feat/mcp-server
git log --oneline -5                        # last commit should be 14f09605
```

If shallow-history breaks merge-base again, run `git fetch --unshallow origin` (this has happened twice already in this workstream).

---

## Daniel-personal action items (no code — Daniel does these in the app)

**URGENT — 2 charts in curated catalogs (G-3 exposure):**

| fileId | Title | Collection |
|---|---|---|
| `upload-a0c31045-2e0c-4153-92a9-d13bc1ca96ee` | ⚠️ STRESS TEST 2026-05-15 — core probe | **core** |
| `upload-bb13317e-7db4-433d-baff-76d7f3bf178a` | ⚠️ STRESS TEST 2026-05-15 — supplemental probe | **supplemental** |

**Lower-urgency — 7 charts in `uploads`:**
- `upload-d7f4d5f4-1142-475e-81b1-393bc6edf43d` (Adon Olam, text/plain)
- `upload-5bfac6d1-544f-48fd-92b4-db4b614413d1` (PDF chart)
- `upload-fc466d13-6a30-4ad8-8fe7-5fcc14b375ed` (MusicXML chart)
- `upload-d2724f75-a8cf-43a9-9746-d4b69582af28` (Adon Olamx — fuzzy-dedup probe)
- `upload-841fe659-c29e-4d82-9da3-c0841278e9a6` (bad mime probe)
- `upload-5caf2ede-c877-4ebd-b341-d91f9d16e653` (invalid base64 probe)
- `upload-66dd16e4-74b3-43d0-adf6-72c3040a4514` (scraped Amazing Grace)

These can be deleted in the library UI on centralreform.live, OR Wave 4's new `delete_chart` tool can clean them after deploy.

**X32 verification on next power-on:**
- Bus 3 fader = ~0.7302
- Channel 19 ("Dan") on bus 3 = level 0, on=false (muted)

If those don't match, the bridge replayed stale queued commands while the X32 was off (G-2). Capture state and report.

---

## Open decision (must resolve before Wave 4 starts)

**G-1/G-2 freshness guardrail — include in Wave 4 or punt?**

- **Background:** Bridge daemon reports `online + x32Connected:true` with fresh `lastSeenIso` heartbeats even when X32 hardware is actually powered off. The bridge can't tell the MCP whether its OSC connection to the X32 is live or cached. This is **bridge-daemon work** — the bridge is in the do-not-touch lane (CRIT-003 territory). Daniel-explicit (2026-05-14): "not important; don't include and leave be."
- **MCP-side mitigation possible:** Refuse `set_*` writes if `lastSeenIso` is stale beyond N seconds. Doesn't fix the root cause (bridge can't distinguish "alive" from "X32 connected") but does bound the window where a phantom write can land.
- **Threshold question:** N = 30s? 60s? 120s? Daniel needs to pick. The bridge writes its heartbeat every ~15-30s in normal operation; threshold of 60s would catch a real disconnect within ~1 minute.
- **Risk:** False positives during transient network blips. Daniel uses iPads on stage; even brief Wi-Fi hiccups could trip the guard.

**Default if Daniel doesn't decide:** Include the guardrail with `STALE_BRIDGE_THRESHOLD_MS = 120_000` (2 minutes) — generous enough to avoid false positives, tight enough to catch a real "X32 was off when you wrote" scenario. Surface in `list_monitor_buses` as `bridge.staleHeartbeat: boolean` so callers see why writes might be refused.

If Daniel **excludes**: leave monitor write tools as-is and add a paragraph to each `set_*` tool description noting "writes are fire-and-forget; the bridge may queue commands when the X32 isn't responsive."

---

## Wave 4 — High-priority fixes (~3 hours)

### Goal

Close the high-severity findings that are real-world risks: privilege escalation on curated catalogs (G-3), the matrix-read gap (G-4), the schema/runtime mismatch (G-9), the asymmetric delete gap (no delete_chart). Optionally include the G-1/G-2 monitor freshness guardrail.

### Fix 1 — G-3: gate `core` / `supplemental` writes to admin

**Where:** `src/lib/mcp/tools/library-upload.ts` (`uploadChart` and `saveScrapedChart`).

**Change shape:**
```ts
// In uploadChart + saveScrapedChart, after the `loadUploader` call:
if (
    (args.collection === "core" || args.collection === "supplemental") &&
    roles.role !== "admin"
) {
    return {
        error: `Writing to the '${args.collection}' catalog requires an admin account. ` +
               `Pick collection: 'uploads' (default) or ask an admin to add this to the curated catalog.`,
    }
}
```

**Tool description updates:** `src/lib/mcp/tools/index.ts` — update the `collectionSchema` description to note that `core` / `supplemental` are admin-only.

**Tests:** Extend `src/lib/mcp/__tests__/mcp-chart-upload.emulator.test.ts` with a `describe('curated-catalog gate')` block:
- ADMIN uploads to `core` → ok.
- ADMIN uploads to `supplemental` → ok.
- LEADER uploads to `core` → rejected with "requires an admin account".
- LEADER uploads to `supplemental` → rejected.
- LEADER uploads to `uploads` (default) → ok.
- MUSICIAN uploads to `core` → rejected.

**Risk:** Low. Pure additive guard. Existing `uploads` flow unchanged.

### Fix 2 — G-4: add `get_matrix` read tool

**Where:** New function in `src/lib/mcp/tools/monitor.ts`, registered in `src/lib/mcp/tools/index.ts`.

**Change shape:**
```ts
// In src/lib/mcp/tools/monitor.ts:
export interface GetMatrixArgs {
    /** 1-based matrix output index (1–6 on X32). Omit to return all. */
    matrixIndex?: number
}

export async function getMatrix(
    uid: string,
    args: GetMatrixArgs,
): Promise<
    | { matrices: Array<{ index: number; name: string; fader: number; on: boolean }> }
    | ToolError
> {
    initAdmin()
    const db = getFirestore()
    const access = await assertMonitorAccess(db, uid)
    if (!access.ok) return { error: access.error }
    // Matrix outputs are FOH territory — admin/SE only, same as the write tools.
    if (!isPrivilegedMonitor(access.user)) {
        return {
            error: "Matrix read requires an admin or sound engineer account",
        }
    }
    const state = await loadMixerState(db)
    if (!state) return { error: "Mixer state not available — is the bridge online?" }
    const all = (state.matrices ?? []).map((m) => ({
        index: m.index,
        name: m.name,
        fader: m.fader,
        on: m.on,
    }))
    if (args.matrixIndex !== undefined) {
        const one = all.find((m) => m.index === args.matrixIndex)
        if (!one) return { error: `Matrix ${args.matrixIndex} not found` }
        return { matrices: [one] }
    }
    return { matrices: all }
}
```

**Register:** In `src/lib/mcp/tools/index.ts::registerMonitorTools`, add:
```ts
server.registerTool(
    "get_matrix",
    {
        description:
            "Read current X32 matrix output state (fader + mute per matrix). Restricted to admins and sound engineers. Omit matrixIndex to get all matrices, or pass 1-6 for one. Use this before set_matrix_fader / set_matrix_mute to capture the pre-write value for safe restore.",
        inputSchema: {
            matrixIndex: z
                .number()
                .int()
                .min(1)
                .max(6)
                .optional()
                .describe("Matrix output index 1–6; omit for all"),
        },
    },
    async (args, extra) => jsonResult(await getMatrix(uidFrom(extra), args)),
)
```

**Tests:** Extend `mcp-monitor.emulator.test.ts`:
- ADMIN calls `get_matrix({})` → returns all 2 matrices from the seeded state.
- ADMIN calls `get_matrix({matrixIndex: 1})` → returns 1 matrix.
- ADMIN calls `get_matrix({matrixIndex: 99})` → "not found".
- GUITAR (musician) calls `get_matrix({})` → rejected at privilege gate.
- SOUND_ENG calls `get_matrix({})` → ok.

**Risk:** Low. Read-only, role-gated.

### Fix 3 — G-9: schema `min:0` → `min:1` on bus/matrix indices

**Where:** `src/lib/mcp/tools/index.ts`, the monitor tool schemas.

**Change shape:** Replace `z.number().int().min(0)` with `z.number().int().min(1)` on `busIndex` in:
- `get_mix.inputSchema.busIndex`
- `set_send_level.inputSchema.busIndex`
- `set_send_mute.inputSchema.busIndex`
- `set_bus_fader.inputSchema.busIndex`

`channelIndex` is also 1-indexed on X32 (channels 1-32 + AUX 33-40). Update those too:
- `set_send_level.inputSchema.channelIndex`
- `set_send_mute.inputSchema.channelIndex`

Matrix index schemas already use `.min(1).max(6)`, so no change.

**Tests:** No new emulator tests needed (Zod validation is upstream of the function call). Verify by running the existing emulator suite — should still pass.

**Risk:** Minimal. The runtime already rejected index 0; this just makes the schema match.

### Fix 4 — `delete_chart` (new tool)

**Where:** New write helper in `src/lib/mcp/tools/library-upload.ts` (or a new `library-delete.ts` if you prefer to separate concerns; either is fine). Register in `tools/index.ts`.

**Change shape:**
```ts
export interface DeleteChartArgs {
    fileId: string
}

export async function deleteChart(
    uid: string,
    args: DeleteChartArgs,
): Promise<
    | { ok: true; deletedTracks: number }
    | ToolError
> {
    initAdmin()
    const db = getFirestore()

    const roles = await loadUploader(db, uid)
    if (!isUploadAllowed(roles)) {
        return { error: "Upload permission required." }
    }

    const limited = await checkUserRateLimit(uid, "upload")
    if (limited) return { error: limited.error }

    // Load the chart row.
    const indexRef = db.collection("library_index").doc(args.fileId)
    const indexSnap = await indexRef.get()
    if (!indexSnap.exists) return { error: "Chart not found" }
    const indexData = indexSnap.data() as Record<string, unknown>

    // Ownership rule (parallels delete_setlist's stricter gate):
    //   admin OR uploader of this chart may delete.
    if (roles.role !== "admin" && indexData.uploadedBy !== uid) {
        return {
            error: "Only the chart's uploader or an admin may delete a chart",
        }
    }

    // Curated-catalog protection: deleting from core/supplemental requires admin.
    const collection = indexData.collection as string | undefined
    if (
        (collection === "core" || collection === "supplemental") &&
        roles.role !== "admin"
    ) {
        return {
            error: `Deleting from the '${collection}' catalog requires an admin account`,
        }
    }

    // Find every track that references this fileId — we don't delete those tracks,
    // but we strip their fileId so the chart-render path won't try to load a dead
    // file. (Alternatively we could refuse to delete if any track references it —
    // that's safer; we'll do that.)
    const tracksSnap = await db
        .collectionGroup("tracks")
        .where("fileId", "==", args.fileId)
        .limit(50)
        .get()
    if (!tracksSnap.empty) {
        return {
            error:
                `Cannot delete: this chart is bonded to ${tracksSnap.size} setlist ` +
                `track(s). Remove the tracks first, then retry.`,
        }
    }

    // Delete library_index + songs row. Also delete the Storage blob if reachable.
    const songRef = db.collection("songs").doc(args.fileId)
    const batch = db.batch()
    batch.delete(indexRef)
    batch.delete(songRef)
    await batch.commit()

    // Best-effort Storage cleanup. Don't fail the tool if it errors — the doc
    // is the source of truth for the library; orphan blobs are harmless.
    try {
        const { getStorage } = await import("firebase-admin/storage")
        const bucket = getStorage().bucket()
        const storageUrl = indexData.storageUrl as string | undefined
        if (storageUrl) await bucket.file(storageUrl).delete().catch(() => {})
    } catch {
        // Logged elsewhere; non-fatal.
    }

    return { ok: true, deletedTracks: 0 } // 0 because we refused if any tracks bonded
}
```

**Note on the "tracks must be unbound first" decision:** safer than auto-unbinding. If a chart is on a published setlist, deleting it would silently break the perform view. Force the user (or AI) to clean tracks first → explicit blast radius.

**Tool registration:**
```ts
server.registerTool(
    "delete_chart",
    {
        description:
            "Delete a chart from the library. Only the chart's uploader or an admin may delete. Deleting from 'core' or 'supplemental' (curated catalogs) requires admin. Will REFUSE if any setlist track still references the chart — remove those tracks first via remove_track. This action is irreversible.",
        inputSchema: {
            fileId: z
                .string()
                .describe("Chart fileId (the upload-{uuid} id returned by upload_chart)"),
        },
    },
    async (args, extra) => jsonResult(await deleteChart(uidFrom(extra), args)),
)
```

**Tests:** New emulator tests in `mcp-chart-upload.emulator.test.ts`:
- Happy path: upload chart → delete chart → confirm gone from library_index + songs.
- Bonded chart: upload chart → add_track_to_setlist({songId: fileId}) → delete_chart → rejected with "bonded" error.
- Owner-only: musician uploads chart → admin can delete; another musician cannot.
- Curated-catalog: admin uploads chart to `core` → leader (non-admin) cannot delete.
- Storage cleanup: mock `firebase-admin/storage` and verify `bucket.file().delete()` is called.
- Nonexistent fileId → "Chart not found" error.

**Risk:** Medium. Real data deletion. Bonded-track guard is the safety rail.

**Cleanup affordance:** After Wave 4 ships, you (or Daniel) can invoke `delete_chart` on each of the 9 stress-test fileIds in the Daniel-personal action items list above.

### Fix 5 (OPTIONAL — pending Daniel's decision) — G-1/G-2 freshness guardrail

**Where:** `src/lib/mcp/server-monitor.ts` (helper) + each monitor write tool in `tools/monitor.ts`.

**Change shape:**
```ts
// In server-monitor.ts:
export const STALE_BRIDGE_THRESHOLD_MS = 120_000 // 2 min default; pulled from config if Daniel sets one

export function isBridgeFresh(config: MonitorConfig): boolean {
    const lastSeen = config.bridge?.lastSeen
    if (!lastSeen) return false
    let lastSeenMs: number
    if (typeof lastSeen === "string") {
        lastSeenMs = Date.parse(lastSeen)
    } else if (typeof lastSeen === "object" && lastSeen && "toDate" in lastSeen) {
        lastSeenMs = (lastSeen as { toDate(): Date }).toDate().getTime()
    } else {
        return false
    }
    if (Number.isNaN(lastSeenMs)) return false
    return Date.now() - lastSeenMs < STALE_BRIDGE_THRESHOLD_MS
}

// Update list_monitor_buses output to include:
//   bridge.freshHeartbeat: boolean
//   bridge.heartbeatAgeMs: number | null

// Each set_* tool calls:
async function preflightFreshBridge(config, returnError) {
    if (!isBridgeFresh(config)) {
        return {
            error: "Bridge heartbeat is stale (>2 min since last seen). " +
                   "Refusing the write — the X32 may be unreachable. " +
                   "Re-check list_monitor_buses.bridge.freshHeartbeat and retry.",
        }
    }
}
```

**Tests:** Mock `Date.now()` and seed `config.bridge.lastSeen` accordingly. Verify writes refuse when stale, allow when fresh.

**Tool description updates:** Each `set_*` description gains "Refuses if the bridge heartbeat is stale (>2 min)."

**Risk:** Medium false-positive risk during Wi-Fi blips. Daniel can override by leaving this fix OUT of Wave 4.

### Wave 4 verification gates

- **Unit:** `npx vitest run src/lib/mcp/` — all pass.
- **Emulator:** `npx firebase emulators:exec --only firestore "npx vitest run --config vitest.emulator.config.ts src/lib/mcp/__tests__/"` — all pass, including new test cases.
- **Build:** `npm run build` — EXIT 0.
- **HFG counter:** 0/3 (delete_chart is a real data-layer touch — emulator coverage is required, no clause-(b) waiver).

### Wave 4 commit

Single commit on `feat/mcp-server`:
```
feat(mcp): wave 4 — admin gating on curated catalogs, get_matrix, delete_chart, schema fixes

Closes G-3, G-4, G-9 (and optionally G-1/G-2 freshness guard) from
.paul/research/mcp-stress-test-2026-05-15.md. Adds delete_chart to close
the asymmetric "anyone can add, nobody can delete via MCP" foot-gun the
stress-test report flagged.

- G-3: upload_chart + save_scraped_chart now gate core/supplemental writes
  to admin role (lib/mcp/tools/library-upload.ts)
- G-4: new get_matrix(matrixIndex?) read tool — admin/SE only
  (lib/mcp/tools/monitor.ts; registered in tools/index.ts)
- G-9: schema min:0 → min:1 on busIndex + channelIndex
  (lib/mcp/tools/index.ts)
- NEW delete_chart(fileId): admin OR uploader; refuses if any setlist
  track still bonds the chart; cascades to library_index + songs + best-
  effort Storage cleanup (lib/mcp/tools/library-upload.ts)
[+ optional: G-1/G-2 bridge freshness guard if Daniel approves]

Verification:
- Unit + emulator green
- next build EXIT 0
- HFG counter 0/3
```

### Wave 4 deploy

ff-merge to master, push origin master, push origin feat/mcp-server. After Vercel deploy is READY, optionally clean up the 9 stress-test charts via `delete_chart`.

---

## Wave 5 — Medium-priority validation & correctness (~3 hours)

### Goal

Close the medium-severity findings around validation gaps and data correctness: fuzzy-dedup that doesn't fire on emoji-prefixed titles (G-5), scrape returning ok:true for 404s (G-6), mime/base64 validation bypasses (G-7, G-8), narrow track-type enum (G-10).

### Fix 1 — G-5: fuzzy-dedup prefix-range bug

**Root cause:** `src/lib/library-upload.ts:processChartUpload` computes `prefix` from `nameLower.replace(/[^a-z0-9]/g, "").slice(0, 6)` — the alphanumeric-only first-6-chars normalized form. But the prefix-range query runs against `library_index.nameLower` which is the full lowercased title (including emoji, spaces). For a title like `"⚠️ STRESS TEST 2026-05-15 — Adon Olam"`, `nameLower` starts with `"⚠️ stress..."`. The prefix `"stress"` (alphanumeric-only) does NOT match the start of that nameLower — so the range query never finds the candidate. Pre-existing bug from the original `library/upload` route inherited by `processChartUpload`. My Wave 3 refactor preserved it.

**Fix shape:** Add a `normalizedName` field on `library_index` writes (alphanumeric-only, lowercase), and prefix-range query against THAT instead of `nameLower`. Backfill is optional — without backfill, dedup against older entries will continue to fail for emoji-prefixed titles, but new uploads will dedup correctly against each other.

**Code change (lib/library-upload.ts):**
```ts
// In processChartUpload, before the prefix calc:
const nameLower = title.toLowerCase()
const normalizedName = nameLower.replace(/[^a-z0-9]/g, "")

// Replace the exact-match query: still uses nameLower (semantic match on
// the displayed name).
const exactMatch = await db
    .collection("library_index")
    .where("nameLower", "==", nameLower)
    .limit(5)
    .get()

// For the fuzzy range query, switch to normalizedName:
const prefix = normalizedName.slice(0, 6)
if (prefix.length >= 3) {
    const prefixEnd =
        prefix.slice(0, -1) +
        String.fromCharCode(prefix.charCodeAt(prefix.length - 1) + 1)
    const similarSnap = await db
        .collection("library_index")
        .where("normalizedName", ">=", prefix)
        .where("normalizedName", "<", prefixEnd)
        .select("name", "normalizedName", "status")
        .limit(20)
        .get()
    // ... rest of fuzzy comparison uses normalizedName for distance calc
    // already does: `normalizedNewTitle = nameLower.replace(/[^a-z0-9]/g, "")`
    // Use normalizedName directly now.
}

// In the indexEntry write, add:
const indexEntry = {
    ...
    nameLower,
    normalizedName,
    ...
}
```

**Backfill script (optional follow-up):** `scripts/backfill-library-normalized-names.ts` — walk `library_index`, compute `normalizedName` from existing `name`, write back. Not blocking — only matters for fuzzy-dedupping NEW uploads against OLD entries.

**Firestore index:** A new composite index on `library_index` may be needed for the `normalizedName >= X AND normalizedName < Y AND status` filter. Check `firestore.indexes.json`; add if missing.

**Tests:** In `mcp-chart-upload.emulator.test.ts`, extend the fuzzy-dedup case:
- Upload "⚠️ STRESS TEST 2026-05-15 — Adon Olam"
- Upload "⚠️ STRESS TEST 2026-05-15 — Adon Olamx" → should be rejected as fuzzy-dup
- Upload "⚠️ STRESS TEST 2026-05-15 — Completely Different Song" → ok

### Fix 2 — G-6: scrape detects negative-result patterns

**Where:** `src/lib/chart-scrape.ts`.

**Change shape:** After Gemini returns `{title, artist, content}`, detect "no chord chart found" patterns:
```ts
function looksLikeNegativeResult(parsed: { title: string; artist: string; content: string }): boolean {
    const negativeTitles = [
        "song not found",
        "no song found",
        "artist not found",
        "unknown song",
        "no chord chart",
        "not available",
    ]
    const tl = parsed.title.toLowerCase().trim()
    if (negativeTitles.some((p) => tl.includes(p))) return true
    // Empty content is itself a negative signal.
    if (!parsed.content.trim()) return true
    // Content that includes the literal "no chord chart" or "404" markers.
    const cl = parsed.content.toLowerCase()
    if (cl.includes("no chord chart") || cl.includes("does not contain")) return true
    return false
}

// In scrapeChart, after parsing:
if (looksLikeNegativeResult(parsed)) {
    return {
        ok: false,
        status: 404,
        error: "No chord chart detected on this page",
    }
}
```

**Tests:** Mock Gemini to return `{title: "Song Not Found", ...}` and verify the tool returns `{error: "No chord chart detected..."}`.

### Fix 3 — G-7: tighten mime allowlist

**Where:** `src/lib/library-upload.ts:processChartUpload`.

**Change shape:** Today's logic: `if (!ALLOWED_TYPES[mimeType] && !FILE_EXT_RE.test(fileName))` — the `OR` lets unsupported mime through if the derived filename has an allowed extension. Tighten:
```ts
// Require BOTH a valid mime AND a supported file extension; or, if no
// useful mime was sent (octet-stream), DENY rather than guess from the
// filename — MCP callers control both.
if (mimeType === "application/octet-stream") {
    return {
        ok: false,
        status: 400,
        code: "invalid_type",
        error: "mimeType must be specific (e.g. application/pdf, image/png, " +
               "application/vnd.recordare.musicxml+xml). 'application/octet-stream' " +
               "is rejected because it provides no type information.",
    }
}
if (!ALLOWED_TYPES[mimeType]) {
    return {
        ok: false,
        status: 400,
        code: "invalid_type",
        error: `Unsupported mimeType '${mimeType}'. Allowed: ${Object.keys(ALLOWED_TYPES).join(", ")}`,
    }
}
```

**Risk:** May affect the HTTP route too (since `processChartUpload` is shared). Audit: does the in-app UploadDialog ever send octet-stream? Probably not — browsers usually attach a real mime for `<input type="file">`. But verify with the team or check `UploadDialog.tsx`.

**Tests:** In `mcp-chart-upload.emulator.test.ts`:
- `upload_chart({mimeType: "application/octet-stream", ...})` → rejected.
- `upload_chart({mimeType: "application/x-zip-compressed", ...})` → rejected.
- All existing allowed mimes still pass.

### Fix 4 — G-8: base64 format validation

**Where:** `src/lib/mcp/tools/library-upload.ts:uploadChart` (the MCP tool wrapper; the shared lib gets a Buffer, no base64 awareness).

**Change shape:**
```ts
// Replace:
let buffer: Buffer
try {
    buffer = Buffer.from(args.fileBase64, "base64")
} catch {
    return { error: "fileBase64 is not valid base64 data" }
}
if (buffer.byteLength === 0) {
    return { error: "Decoded file is empty" }
}

// With strict format-check first:
const BASE64_RE = /^[A-Za-z0-9+/]+={0,2}$/
const stripped = args.fileBase64.replace(/\s/g, "")
if (!BASE64_RE.test(stripped)) {
    return {
        error: "fileBase64 must be standard base64 (RFC 4648). Got non-base64 characters.",
    }
}
if (stripped.length % 4 !== 0) {
    return {
        error: "fileBase64 length must be a multiple of 4 (padded with '=').",
    }
}
let buffer: Buffer
try {
    buffer = Buffer.from(stripped, "base64")
} catch {
    return { error: "fileBase64 decode failed" }
}
if (buffer.byteLength === 0) {
    return { error: "Decoded file is empty" }
}
```

**Tests:** In `mcp-chart-upload.emulator.test.ts`:
- `fileBase64: "!!!not base64!!!"` → rejected.
- `fileBase64: "abc"` (3 chars, not multiple of 4) → rejected.
- `fileBase64: "aGVsbG8="` (valid "hello") → ok.

### Fix 5 — G-10: expand track-type writer enum

**Step 1 — research:** grep production data to find all `type` values in use. Likely path: a small admin script or a one-time `collectionGroup('tracks').select('type').get()` to surface distinct values.

**Likely candidates** (based on the cowork tester's observation): `"song"`, `"header"`, `"reading"`, `"prayer"`. Possibly `"transition"`, `"interlude"`, `"announcement"` — unknown without checking prod.

**Step 2 — schema update:** `src/lib/mcp/tools/index.ts`:
```ts
type: z
    .enum(["song", "header", "reading", "prayer"])  // + any others found
    .optional()
    .describe("Row type — 'song' (with chart), 'header' (section break), 'reading' (Torah/scripture/poetry/dvar), 'prayer' (silent/responsive)"),
```

**Step 3 — backing logic:** `src/lib/mcp/tools/setlist-write.ts:addTrackToSetlist`. The `addTrack` helper writes whatever `type` it receives to the track payload. No code change needed beyond the enum widening.

**Step 4 — required-field rules:** Both `reading` and `prayer` should require a `title` (no `songId` fallback). Current logic already enforces this — songId is optional and title is fallback-derived from songId only when type is song.

**Tests:** In `mcp-setlist-write.emulator.test.ts`:
- `add_track_to_setlist({type: "reading", title: "V'ahavta"})` → ok.
- `add_track_to_setlist({type: "prayer", title: "Silent Prayer"})` → ok.
- `add_track_to_setlist({type: "reading"})` (no title) → "title is required".
- `add_track_to_setlist({type: "bogus"})` → schema rejection.

### Wave 5 verification gates

Same as Wave 4 — unit + emulator + build.

### Wave 5 commit

```
feat(mcp): wave 5 — validation & correctness fixes (G-5..G-8, G-10)

Closes the validation gaps the 2026-05-15 stress test surfaced:
- G-5: fuzzy-dedup now fires for emoji-prefixed titles (added
  normalizedName field on library_index + query against it)
- G-6: scrape_chart_from_url detects "no chord chart found" Gemini
  responses and returns an error envelope instead of ok:true with
  bogus content (lib/chart-scrape.ts)
- G-7: upload_chart rejects octet-stream and any non-allowed mime,
  no extension-based fallback (lib/library-upload.ts)
- G-8: uploadChart MCP tool format-validates fileBase64 before decoding
  (lib/mcp/tools/library-upload.ts)
- G-10: add_track_to_setlist accepts type:'reading' and type:'prayer'
  to round-trip real production setlists (tools/index.ts schema)
```

---

## Wave 6 — Low-priority polish (~1-2 hours)

### Goal

Close the cosmetic findings G-11..G-17. Batched together so the diff is concentrated.

### G-11 — `update_setlist` echoes the new state

In `src/lib/mcp/tools/setlist-write.ts:updateSetlist`, after the `updateSetlistServerSide` call, fetch the updated setlist and return it:
```ts
const updated = await db.collection("setlists").doc(args.id).get()
const data = updated.data() as Record<string, unknown>
return {
    ok: true,
    setlist: {
        id: args.id,
        name: data.name,
        eventDate: data.eventDate,
        rabbi: data.rabbi,
        serviceType: data.templateType,  // note: persisted as templateType
        serviceNotes: data.serviceNotes,
    },
}
```

### G-12 — error envelope inconsistency

Pure documentation. In `docs/claude-mcp.md` (the end-user connection guide), add a section: "Error envelopes — MCP returns two kinds of errors. Validation errors come back as JSON-RPC `-32602`. Domain errors come back as `{error: "..."}` inside the tool result. Branch on both."

### G-13 — `search_library({query:""})` document the wildcard semantics

In `tools/index.ts:search_library` description, add: "An empty query returns the first N (limit) library entries — useful for browsing."

### G-14 — `list_setlists({from})` date validation

In `src/lib/mcp/tools/setlists.ts:listSetlists`, replace silent `NaN` swallow with a validation error:
```ts
if (args.from !== undefined) {
    const t = Date.parse(args.from)
    if (Number.isNaN(t)) {
        // Surface as a tool error so agents notice
        // (matches F-9 / eventDate validation in shape)
    }
}
```
Or — preferred — add a Zod refine to the `from`/`to` schemas mirroring `eventDateSchema`.

### G-15 — `search_library` row-shape uniformity

In `src/lib/mcp/server-songs.ts:toSongRecord`, default `status` to `"active"` when missing:
```ts
if (typeof data.status === "string") {
    rec.status = data.status
} else {
    rec.status = "active"  // default for curated rows that don't carry status
}
```

### G-16 — `create_setlist` returns owner

In `src/lib/mcp/tools/setlist-write.ts:createSetlist`:
```ts
return {
    setlistId: result.setlistId,
    trackCount: result.trackCount,
    ownerId: uid,
    ownerName,  // already computed earlier in the function
}
```

### G-17 — document `list_monitor_buses.bridge.clients`

In `tools/index.ts:list_monitor_buses` description, add to the response shape note: "bridge.clients: number of clients currently connected to the bridge daemon (iPads + this MCP session)."

### Wave 6 commit

```
chore(mcp): wave 6 — polish (G-11..G-17)

Minor response-shape and documentation tightening from the 2026-05-15
stress test report.
```

---

## Deploy strategy

**Per-wave deploy** (recommended): commit Wave 4, ff-merge to master, push, deploy → confirm Vercel READY → confirm a quick smoke test → start Wave 5. Repeat for Wave 6.

**Alternative — batched deploy:** all three waves committed sequentially on `feat/mcp-server`, single push at the end. Faster but harder to bisect if something regresses.

Default: per-wave deploy. Daniel has stated preference for production-direct deploys with no preview branches; that's our pattern.

---

## Risk register

| Risk | Mitigation |
|---|---|
| Wave 4 `delete_chart`'s Storage cleanup fails silently in production | Logged but non-fatal. Document the orphan-blob possibility. |
| G-3 admin gate breaks an existing in-app flow (UploadDialog) | Audit `UploadDialog.tsx` — does it allow non-admin musicians to pick `core` / `supplemental`? If yes, the in-app dropdown also needs to gate; if no (musicians are forced to `uploads`), no UI change needed. |
| G-7 octet-stream rejection breaks an HTTP-route caller | Audit the existing `/api/library/upload` callers. The in-app `UploadDialog` likely sets a real mime from `<input type="file">` — should be fine. |
| Wave 5 G-10 enum widening accepts a production type we missed | Run the production grep BEFORE writing the enum. Don't ship without enumerating. |
| Wave 4 G-1/G-2 freshness guard false-positives during Wi-Fi blips | Default threshold 120s is generous. Can tune up later. Daniel can opt out of this fix entirely. |

---

## Resume prompt

Use this exact prompt after the `/clear`:

```
Resume MCP follow-up work. Full plan is at
`.paul/research/mcp-wave-4-5-6-PLAN.md`; source stress-test report at
`.paul/research/mcp-stress-test-2026-05-15.md`. Read the plan first.

Top of the queue: Wave 4 (G-3 admin gating + G-4 get_matrix + G-9
schema fix + new delete_chart tool, plus optionally G-1/G-2 monitor
freshness guard).

I need to make ONE decision before you start coding:

G-1/G-2 freshness guardrail — include in Wave 4 or punt?

If INCLUDE: pick a stale-bridge threshold (60s / 120s / other).
If PUNT: just leave the monitor write tools as-is and update their
descriptions to note "writes are fire-and-forget; bridge may queue
when X32 isn't responsive."

After you have my decision, work the plan top-to-bottom. Switch to the
MCP worktree (`cd ../sheet-music-app-mcp`), confirm clean tree on
`feat/mcp-server`, then start. Per-wave deploy: commit Wave 4 →
ff-merge to master → push → confirm Vercel READY → smoke test → start
Wave 5. Same for Wave 6.

Do NOT touch v7.1 work or the `feature/v71-01-security-auth-fold-forward`
branch. Use `git push origin master` (not `:main`).

Read auto-memory first for the latest project state.
```
