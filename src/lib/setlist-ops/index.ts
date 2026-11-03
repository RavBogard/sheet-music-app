/**
 * Server-only. The single writer of `setlists/*` and `tracks/*`
 * (docs/planning/2026-11-03-setlist-sync-structural/OPS-CONTRACT.md).
 *
 * Doc refs (`trackRef`/`setlistRef`) stay internal to this module: code
 * outside it writes through a `SetlistWriter`, never through a raw ref.
 */
import "server-only"

export * from "./types"
export {
    applyOps,
    applyOpsAuthorized,
    authorizeSetlistCaller,
    normalizeOpsRequest,
    validateOpsRequest,
    opsHash,
    OP_BATCHES,
    type ApplyOpsOptions,
} from "./engine"
export {
    SetlistWriter,
    runSetlistTransaction,
    setlistBatch,
    updateSetlistFields,
    updateSetlistDerivedCounts,
    writeRowFields,
    type RowPatch,
    type StampOptions,
    type WriteSink,
    type WriterOptions,
} from "./writer"
export { stripUndefined, placementIndex, mergeFields, canonicalSort, valuesEqual } from "./pure"
export { checkRowFields, checkSetlistFields, isSafeKey } from "./fields"
