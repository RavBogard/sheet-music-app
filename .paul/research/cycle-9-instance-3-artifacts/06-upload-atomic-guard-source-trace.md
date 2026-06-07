# Probe 1 + 2 — source trace at SHA db208948f

`src/lib/library-upload.ts` (the shared HTTP + MCP path).

## Atomic guard (lines 415–596) — VERIFIED

The 5-step pattern from `[[feedback_upload_atomicity]]` is implemented:

1. `uploadToStorage(fileId, buffer, contentType)` — line 432
2. **READ-VERIFY** — line 442–464: `getStorageObjectSize(realStoragePath)`
   bails on null/zero AND bails on size mismatch (`wrote ${a}, read back ${b}`)
   BEFORE the Firestore write. Both branches return `server_error` with a
   precise message.
3. Firestore batch — lines 528–553: `batch.set(library_index/{fileId}) +
   batch.set(songs/{fileId}, merge:true)` + W-02 sibling-recount updates,
   one `batch.commit()`. No half-write possible.
4. **Compensating delete** — lines 555–577: catch block calls
   `deleteStorageObjectAtPath(realStoragePath)`. Logs rollback failure;
   surfaces `server_error` to the caller with the original Firestore
   message.
5. `library_signals/latest.set({at, fileId, op:'upload', by})` — lines
   582–596. Wrapped in try/catch; failure logs `library_signals write
   failed (non-fatal)` and does NOT fail the upload.

Per-call `traceId` + stage timing logged at every step (`[Upload ${traceId}]
storage-upload:start (+15ms)`). Strong observability.

## Dedup 0.85 + force override — VERIFIED

Lines 331–411. Both exact (line 350: `where('nameLower','==',nameLower)`)
and fuzzy (line 378: `where('normalizedName','>=',prefix)` + Levenshtein
similarity check at line 402: `if (similarity > 0.85)`) blocks are wrapped
in `if (!input.force)` — force:true skips both.

Hard-coded 0.85 in source. No env override, no per-call tuning except via
`dedupe_library({forceScore})` for the post-hoc dedup pass — never for
upload-time. Matches `[[feedback_dedup_force_override]]` standing policy.

## TWO defects found by source reading (see C9I3-004, C9I3-005)

### Defect A — actualStoragePath vs extForContentType divergence (lines 126–151)

```ts
function extForContentType(ct: string): string {
    if (ct.includes("pdf")) return ".pdf"
    if (ct.includes("text")) return ".txt"   // ← appends extension
    if (ct === "image/png") return ".png"    // ← appends extension
    if (ct === "image/jpeg") return ".jpg"   // ← appends extension
    return ".xml"
}

function actualStoragePath(fileId: string, contentType: string): string {
    const ext = contentType.includes("pdf") ? ".pdf"
        : contentType.includes("xml") ? ".xml"
        : contentType.includes("audio") ? ".mp3"
        : ""   // ← no extension for text/image
    return `library/${fileId}${ext}`
}
```

- `library_index.storageUrl` (line 435) = `extForContentType(contentType)`
  → for a PNG upload: `library/{fileId}.png`
- Real Storage write location (passed through firebase-storage.ts:getStoragePath)
  for a PNG = `library/{fileId}` (no extension)
- Atomic guard reads with `actualStoragePath` (right place) so the guard
  itself is correct.
- But anything consuming `library_index.storageUrl` directly (instead of
  `/api/drive/file/{fileId}`) gets a stale path. The comment on line 136–141
  acknowledges the divergence ("kept for back-compat with existing readers")
  but it's a foot-gun for new readers.

### Defect B — originals/ blob isn't rolled back on Firestore failure

HEIC conversion uploads to `originals/{fileId}.heic` (line 292–296). If the
post-conversion Firestore batch fails, the compensating-delete only removes
`realStoragePath` (the converted JPEG) — line 561. The `originals/{fileId}.heic`
blob remains. Same gap for MuseScore (`originals/{fileId}.{mscz|mscx}` at
line 260–264).

This is a reverse-orphan class the atomic guard was specifically designed
to prevent. The window is narrow (Firestore batch failure after a successful
read-verify) but real.
