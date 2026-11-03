/**
 * Server-only. The single writer of `setlists/*` and `tracks/*`
 * (docs/planning/2026-11-03-setlist-sync-structural/OPS-CONTRACT.md).
 */
import "server-only"

export * from "./types"
export {
    applyOps,
    applyOpsAuthorized,
    authorizeSetlistCaller,
    validateOpsRequest,
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
    trackRef,
    setlistRef,
    type RowPatch,
    type WriteSink,
    type WriterOptions,
} from "./writer"
export { stripUndefined, placementIndex, mergeFields, canonicalSort, valuesEqual } from "./pure"
