# bond-aware-delete-guard — Phase 1 audit (callers of `library/*` Storage delete)

**Base:** origin/master @ `4537463cc` (2026-05-24).
**Lane:** `bond-aware-delete-guard` — Tier 1, structural defense so any code path attempting to delete `library/{fileId}.*` Storage bytes MUST first verify no live track binds that fileId.
**Source of truth:** supervisor dispatch `msg-bond-aware-delete-guard-001` 2026-05-24T01:55Z + Daniel's directive 2026-05-24T~01:35Z: "what i care about is that it doesn't happen again."

## Method

```
rg -n 'deleteStorageObjectAtPath|bucket\.file\([^)]*\)\.delete' src
rg -n 'library/.*\.delete|\.file\(.*library' src
rg -l 'delete_chart|deleteChart|deleteStorage' src
```

Hand-classified each hit against [[feedback_enumeration_tool_scope]] (verify cause with admin SDK), [[feedback_upload_atomicity]] (atomic-guard contract), and [[feedback_dryrun_is_observability]] (force is overt + tracked, not silent).

## Call sites (current state on `4537463cc`)

### 1. `src/lib/firebase-storage.ts:283` — `deleteStorageObjectAtPath(path)`

The generic Storage helper. Takes any path (not just `library/`). Currently 7 production callers across 5 files (below). Sits at the bottom of the import graph as `await bucket.file(path).delete()`.

**Disposition:** Leave untouched per dispatch §"Out of scope hard boundaries" ("Don't gate the generic helper — other subtrees use it"). Future non-library callers (charts-backup, monitor-live, recordings) MUST keep using it.

### 2. `src/lib/mcp/tools/library-upload.ts:638-825` — `deleteChart()` MCP tool

The canonical "delete a chart" tool. Calls `bucket.file(p).delete()` INLINE (L800-814; does NOT go through `deleteStorageObjectAtPath`) for both `storageUrl` (always `library/*`) and `originalStorageUrl` (HEIC/MuseScore conversion — lives in `originals/*`, different subtree).

Has an existing `chart_in_use` guard (L702-752) that counts ONLY tracks whose parent setlist still EXISTS — refuses with `chart_in_use` envelope if any LIVE bond.

**Classification:** **LEGITIMATE-NEEDS-GUARD.** The upstream guard is sound but lives in this one tool; the next mutator that doesn't have it (today's cron-blast pattern) bypasses it entirely. Migrate the `library/*` portion of the Storage cleanup to `safelyDeleteLibraryObject(fileId, {reason: 'mcp-delete-chart', force: true, callerUid: uid})` — `force: true` because the upstream `chart_in_use` guard has already proven no LIVE bond and the safety helper's own check would only see dangling tracks (which the upstream guard explicitly allows to proceed). The `originals/*` portion is OUT-OF-SCOPE (different subtree) and stays inline.

### 3. `src/lib/mcp/tools/test-delete-storage-object.ts:206` — `__test_delete_storage_object` MCP tool

Cycle-3 GAP-002 test-only synthetic Storage delete. Hard-gated by `/^upload-<uuid>$/` fileId pattern + `library_index/{fileId}.isTest === true`. Purpose: produce the "Drive 200 + Storage 404 → health: needs_storage_sync" asymmetric state for cycle-N cowork probes.

**Classification:** **LEGITIMATE-NEEDS-GUARD with audit trail.** The existing test gates are sufficient (test rows are isolated from prod bonds by `isTest:true`), BUT we still route through `safelyDeleteLibraryObject` with `force: true` to get a uniform audit row and consistent path-resolution semantics. The helper's bond check would normally find no live bonds (test rows shouldn't be bonded to live setlists), so `force` is belt-and-braces, not a real bypass.

### 4. `src/lib/chart-heal.ts:107, 120, 178` — `healChartBytes` compensating-deletes

Three rollback points inside the atomic-guard tail of `healChartBytes`:
- L107: read-verify size missing → roll back Storage write
- L120: read-verify size mismatch → roll back Storage write
- L178: Firestore merge-update failed → roll back Storage write

All three delete the EXACT `library/{fileId}{ext}` path we JUST wrote, restoring the pre-heal Storage state.

**Classification:** **LEGITIMATE FORCE-YES (compensating-delete rollbacks).** The row almost certainly IS bonded (heal heals an EXISTING fileId; bonds point at fileId — that's why heal exists). The helper's bond check would refuse without force. With force, the helper records an audit row showing the rollback was overt and traceable. This satisfies [[feedback_upload_atomicity]]'s "compensating-delete on every Storage/Firestore mutation" contract while making the override visible.

### 5. `src/lib/library-upload.ts:618, 637` — `processChartUpload` compensating-deletes

Two rollback points after the Firestore batch fails:
- L618: roll back the converted-chart bytes (`realStoragePath`, always `library/*`)
- L637: roll back the originals blob (`originalStorageUrl`, always `originals/*` — HEIC/MuseScore source bytes)

**Classification (L618):** **LEGITIMATE FORCE-YES.** The atomic-guard contract demands rollback on Firestore failure. For a brand-new upload (no existing fileId reuse) there's no pre-existing bond — but if the path is being reused for heal-via-upload, there could be one. Pass `force: true` with reason `upload-compensation`.

**Classification (L637):** **OUT OF SCOPE.** `originals/*` is a different Storage subtree per dispatch §"hard boundaries". Leave the `deleteStorageObjectAtPath` call as-is.

### 6. `src/lib/mcp/tools/reconcile-library.ts:453, 465, 496` — `commitResolvedBytes` compensating-deletes

Three rollback points in the shared atomic-guard tail used by `reconcile_library`'s Drive-200 mirror path:
- L453: read-verify size missing
- L465: read-verify size mismatch
- L496: Firestore merge-update failed

Same structural shape as `healChartBytes` (the original `reconcile_library` factoring; `healChartBytes` later inherited this pattern).

**Classification:** **LEGITIMATE FORCE-YES.** Same reasoning as #4. Pass `force: true` with reason `reconcile-compensation`.

### 7. Tests (vi.mock entries, NOT production code)

8 emulator test files declare `vi.mock("@/lib/firebase-storage", ...)` with a `deleteStorageObjectAtPath: vi.fn(...)` stub. These are mocks; they don't delete real bytes. NO production behavior change required, BUT tests that exercise the migrated callers will need their mocks extended to cover `safelyDeleteLibraryObject` (which uses the Admin SDK `bucket().file().delete({ignoreNotFound: true})` chain — already mocked in `mcp-chart-upload.emulator.test.ts:71-75`).

## Always-safe (different subtree — not migrated)

- `recordings/*` paths (v70-02 recordings audio) — never targeted by `library/*` callers.
- `originals/*` paths (HEIC/MuseScore conversion sources) — see #5 L637.
- `charts-backup/*`, `monitor-live/*` — no callers in this lane.

## Dead-code

None. The legacy `/api/cron/sync` sweep-delete loop was already removed at `a41f9aef8` (cron-sync-hard-remove, 2026-05-24T00:23Z) — the smoking-gun mutator that triggered Daniel's "doesn't happen again" directive.

## Plan (Phases 2–4)

**Phase 2 — Install guard.** NEW `src/lib/library/safely-delete-library-object.ts`:
- Signature: `safelyDeleteLibraryObject(fileId, {reason, force?, callerUid?, exactPath?})`
- Default mode: delete all three `library/{fileId}.{pdf|xml|}` variants via `bucket.file(path).delete({ignoreNotFound: true})`.
- `exactPath` mode: delete only the supplied path (must match `library/<fileId>...`) — for surgical compensating-delete callers that want to roll back ONE just-written variant without touching others.
- Bond check: `tracks where fileId == <fileId>` then resolve parent setlist existence — mirrors `deleteChart`'s LIVE-bond semantics. Returns `{deleted: false, refusedBecauseBonded: [trackIds]}` if a live bond exists AND `!force`.
- Audit: `auditLogs/{auto}` row on EVERY operation (forced, unforced, refused) with `{type, fileId, reason, forcedOverride, bondedTrackIds, callerUid, paths, ts: serverTimestamp}`. Best-effort; audit failure does NOT fail the delete.
- Logger breadcrumb on refusal (NOT a Sentry message — refusal can be a legitimate code path).

**Phase 3 — Migrate callers.**
- `deleteChart`: `library/*` portion → `safelyDeleteLibraryObject(args.fileId, {reason: 'mcp-delete-chart', force: true, callerUid: uid})`. `originals/*` portion stays inline. The existing `chart_in_use` guard stays as-is (friendlier error envelope on first refusal; the helper is a chokepoint defense for callers without that upstream check).
- `chart-heal.ts` ×3: `safelyDeleteLibraryObject(fileId, {reason: 'heal-compensation', force: true, exactPath: storagePath})`.
- `library-upload.ts` L618: `safelyDeleteLibraryObject(fileId, {reason: 'upload-compensation', force: true, exactPath: realStoragePath})`.
- `library-upload.ts` L637: untouched (originals/*).
- `reconcile-library.ts` ×3: `safelyDeleteLibraryObject(fileId, {reason: 'reconcile-compensation', force: true, exactPath: storagePath})`.
- `test-delete-storage-object.ts` L206: `safelyDeleteLibraryObject(fileId, {reason: 'test-fixture-cleanup', force: true, callerUid: callerUid, exactPath: resolvedPath})`.

**Phase 4 — Tests.**
- NEW `src/lib/library/__tests__/safely-delete-library-object.emulator.test.ts`: bonded refuses, dangling-only proceeds, force overrides, audit log written, multi-variant deletion handled, exactPath surgical mode, idempotent re-call (ignoreNotFound), audit-write-failure non-fatal.
- Extend `mcp-chart-upload.emulator.test.ts` delete_chart suite: confirm the helper is invoked + force flag wired; preserve existing 7 delete_chart tests pass.
- NEW integration test simulating the cron-blast scenario — try deleting a fileId that IS bonded to a live setlist without going through `deleteChart`'s upstream guard (i.e. direct helper call); assert refuse + audit log + bytes remain.

## eslint rule deferred

Dispatch suggests an eslint custom rule to forbid raw `bucket.file('library/...').delete()` outside the helper. Deferred — code-comment-only contract enforced via this audit doc is sufficient for this lane. Future: revisit if an eslint rule is cheap enough to add.
