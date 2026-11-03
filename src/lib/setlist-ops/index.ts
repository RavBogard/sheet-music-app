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
export {
    createSetlistWithRows,
    writeNewSetlist,
    maintainSetlist,
    maintainSetlists,
    maintainRows,
    deleteSetlistRows,
    deleteSetlistsWithRows,
    deleteSetlistTree,
    SetlistMaintenance,
    MAX_TRANSACTION_WRITES,
    NO_BUMP_FIELDS,
    MaintenanceError,
    type MaintainOptions,
    type NewSetlistInput,
} from "./maintenance"
export { stripUndefined, placementIndex, mergeFields, canonicalSort, valuesEqual } from "./pure"
export { checkRowFields, checkSetlistFields, isSafeKey } from "./fields"
export { hydrateEmbeddedTracks, type HydrateResult } from "./hydrate"
export {
    createSetlistForCaller,
    validateCreateRequest,
    type CreateSetlistRequest,
    type CreateSetlistOk,
} from "./create"
