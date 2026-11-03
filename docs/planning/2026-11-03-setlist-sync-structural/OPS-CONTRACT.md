# Setlist ops contract (PR 1 builds it; PR 3 and PR 4 consume it)

Decisions: D1 = go, D2 = (a). Structural edits need a connection; field edits may queue offline and
rebase on reconnect.

## Endpoint
`POST /api/setlists/{id}/ops`. Auth is the same bar as the MCP setlist writers: signed in, at least
`bl` in the setlist's tenant, with the existing trusted-leader rate-limit bypass. The tenant is read
from the setlist doc and never from the request.

Request:
```ts
{ clientBatchId: string,          // idempotency key; a repeat returns the first result
  baseVersion: number,            // setlist version the client last saw (informational for rebase)
  ops: Op[] }                     // applied in order, all-or-nothing, ONE Firestore transaction
type Op =
  | { kind: 'insert', rowId: string, afterRowId: string | null, beforeRowId: string | null, row: RowFields }
  | { kind: 'remove', rowId: string }
  | { kind: 'move',   rowId: string, afterRowId: string | null, beforeRowId: string | null }
  | { kind: 'editRow', rowId: string, set: Partial<RowFields>, base: Partial<RowFields> }
  | { kind: 'editSetlist', set: Partial<SetlistFields>, base: Partial<SetlistFields> }
```

## Semantics
- **Order rebase.** `insert` and `move` place the row after `afterRowId` in the *current server*
  order. If that anchor is gone, place it before `beforeRowId`; if that is gone too, place it at the
  end. `null`/`null` means the start. After the ops, `order` is renumbered 0..n-1 in the resulting
  sequence (the author's sequence is preserved, as R11-b requires; this is what MCP already does).
  Sorting is canonical: order, then id.
- **`remove`** of a row that is already gone is a no-op success.
- **`move`/`editRow`** of a missing row is a conflict `{reason:'row-gone'}`.
- **Field merge.** For each field in `set`: if the server value equals `base[field]` or already
  equals `set[field]`, apply it. Otherwise it is a conflict `{field, server, mine}`. Non-conflicting
  fields in the same op still apply. `undefined` is never written: it is stripped, and `null` means
  clear (fixes the repro's `{bpm: undefined}` dead-letter).
- **Insert** stamps `orgId` from the setlist, plus `setlistId`, `version: 1`, `createdAt`. The
  client-chosen `rowId` must not already exist, else the result is a conflict `row-exists`. That
  conflict is idempotent when the existing row came from the same clientBatchId.
- **Every successful transaction:**
  - bumps setlist `version` by 1;
  - sets setlist `updatedAt` serverTimestamp, `lastModifiedBy` and `lastModifiedAt`;
  - updates `trackCount` and `songCount`;
  - for every touched row, sets `updatedAt` serverTimestamp and bumps `version`.
  Untouched rows are not rewritten, but rows whose `order` changed count as touched.
- **Response:**
  `{ ok: true, version, applied: number[], conflicts: Array<{opIndex, reason, field?, server?, mine?}>, rows: Row[] }`,
  where `rows` holds the touched rows after the write. A refusal returns
  `{ok:false, reason: 'forbidden'|'not-found'|'invalid'|'too-large'}` with a matching HTTP status.

## Single writer
- One module, `src/lib/setlist-ops/` (server only), is the ONLY code that writes `setlists/*` or
  `tracks/*`.
- The route, every MCP tool, Perform live reorder, bind-row, liturgy bindings and the update_setlist
  book change call it.
- A guard test scans src for Firestore writes (`set|update|delete|batch|transaction` on those
  collections, Admin or client SDK) outside that module. Allowlist: migration scripts; the client
  outbox writers in src/lib/sync and src/lib/local until PR 3 removes them; the client-side creation
  paths in setlist-firebase.ts and use-add-to-setlist.ts until PR 3. Each allowlist entry carries
  "remove in PR 3".
- MCP tool names and response shapes are unchanged. The Overlays reader fields are unchanged.
