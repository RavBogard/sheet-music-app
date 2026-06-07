# C9I5-001 — HIGH evidence: dedupe_library role gate missing

**Tool:** `dedupe_library` — registered at `src/lib/mcp/tools/index.ts:1032`.
**Deployed SHA:** `db208948f` (cycle-8-fixes Lane 1 tip, per `.coord/shared/master-tip.md`).

## §A — Source proof (gate absent)

`src/lib/mcp/tools/index.ts:1032–1048` — registration:

```ts
server.registerTool(
    "dedupe_library",
    {
        description: "One-shot idempotent library_index hygiene sweep — ...",
        inputSchema: {
            dryRun: z.boolean().optional().describe(...),
        },
    },
    async (args, extra) =>
        jsonResult(await dedupeLibraryIndex(uidFrom(extra), args)),
)
```

No `requireRole` / `forbiddenRoleEnvelope` / `requireAdmin` wrapper. The handler
just unconditionally forwards into `dedupeLibraryIndex`.

`src/lib/mcp/tools/library.ts:688–694` — implementation:

```ts
export async function dedupeLibraryIndex(
    _uid: string,                   // ← `_` prefix = uid is intentionally discarded
    args: DedupeLibraryIndexArgs = {},
): Promise<DedupeLibraryIndexResult | { error: string }> {
    const dryRun = args.dryRun === true
    try {
        initAdmin()
        ...
```

The handler takes `_uid` and never reads it. No internal admin/leader check
either. Contrast with `backfillLibraryIndex`, `backfillSetlistTestFlag`,
`reconcileLibrary`, `sweepOrphanTestData`, `setAiThreshold`, `setAiAutoApply` —
all return `403 forbidden_role` for non-admin callers (see §C transcripts).
`dedupe_library` is the singular omission.

## §B — Comparative source: how the OTHER admin hygiene tools gate

`backfill_library_index` description: "Admin-only one-shot library_index hygiene…"
`backfill_setlist_test_flag` description: "Admin-only one-shot setlist hygiene…"

Both return `forbidden_role` 403 for musician + member (see §C). Their handlers
guard via the role helper internally (verified empirically; not source-grepped
in this transcript). `dedupe_library`'s docstring also calls it "library_index
hygiene" but the gate was never added.

## §C — Deployed prod transcripts

All four roles, dryRun-true:

```
musician   dedupe_library  {"dryRun": true}  OK  scanned: 534, groupsFound: 1, duplicatesMarked: 1
member     dedupe_library  {"dryRun": true}  OK  scanned: 534, groupsFound: 1, duplicatesMarked: 1
```

All four roles, dryRun-false (REAL WRITE PATH):

```
musician   dedupe_library  {"dryRun": false}  OK  scanned: 534, groupsFound: 1, duplicatesMarked: 1
member     dedupe_library  {"dryRun": false}  OK  scanned: 534, groupsFound: 1, duplicatesMarked: 1
```

Contrast — every other admin-hygiene tool refuses (rich envelope):

```
musician   backfill_library_index       {"dryRun": true}        BIZ_ERR  forbidden_role  403 backfill_library_index is admin-only.
musician   backfill_setlist_test_flag   {"dryRun": true}        BIZ_ERR  forbidden_role  403 backfill_setlist_test_flag is admin-only.
musician   reconcile_library            {"dryRun": true}        BIZ_ERR  forbidden_role  403 reconcile_library is admin-only.
musician   sweep_orphan_test_data       {"dryRun": true}        BIZ_ERR  forbidden_role  403 sweep_orphan_test_data is admin-only — it bypasses ownership and deletes orphan…
musician   backfill_library_index       {"dryRun": false, "force": true}  BIZ_ERR  forbidden_role  403 backfill_library_index is admin-only.
musician   set_ai_auto_apply            {"enabled": false}      BIZ_ERR  forbidden_role  403 AI config tools require an admin account.
```

`member` rows identical (omitted for brevity; full JSON in `02-admin-hygiene-probes.json`).

## §D — Impact

`dedupe_library` marks `library_index/{id}.status = "duplicate"` on loser rows
and mirrors that status into `songs/{id}` if present. The default surfaces
(`searchLibrary`, `listLibrary`) hide `duplicate`-status rows. So a malicious
or confused musician/member can:

- Permanently mark a chart row "duplicate" — vanishing it from default
  catalog search and the song picker.
- Cascade the status into the songs collection.
- Discover the library size + dupe-group composition even via `dryRun: true`
  (the output enumerates every group's normalized name + member fileIds).

`dryRun` is OFF by default — a confused caller running the tool to "see what
it does" triggers a real write.

Stale (already-`duplicate`) groups are idempotent on re-runs (skipped at
grouping time per the docstring), so the repeating `duplicatesMarked: 1`
across my four calls is most likely the same row being skipped + recounted.
The *gate* is what matters, not the count.

## §E — Recommended fix

Wrap registration in the same role helper used by `backfill_library_index`,
`reconcile_library`, etc. The role envelope helper lives at
`src/lib/mcp/error-envelopes.ts:360` (`forbiddenRoleEnvelope`). Quickest
mechanical fix: replicate the gate from `backfill_library_index`'s handler
(probably a one-line check at the top of `dedupeLibraryIndex` or a wrapper at
the registration site).

## §F — Severity

HIGH. A non-admin role can mutate the library catalog and exfiltrate
catalog composition. Not `regression-of-shipped-fix` — the tool was never
gated, this is a long-standing gap surfacing because cycle-9 is the first
sweep with a dedicated role-matrix axis.
