/**
 * Browser side of the setlist ops contract (PR 3 of the setlist sync
 * redesign). See client.ts for the queue, view.ts for the overlay,
 * server-cache.ts for who may write Dexie `tracks`/`setlists`, migrate.ts for
 * the old outbox.
 */
export {
    SetlistOpsClient,
    newRowId,
    type IntentInput,
    type OpsClientDeps,
    type OpsTransport,
    type ServerReader,
    type TransportResponse,
    type WireOp,
} from './client'
export {
    appendRows,
    duplicateRow,
    editRow,
    editSetlist,
    insertRows,
    isStructural,
    moveRow,
    removeRows,
    replayOps,
} from './actions'
export { bootSetlistOps, configureOpsClient, getOpsClient, whenMigrated } from './runtime'
export { computeView, anchorsAt, canonicalOrder, placeIndex, type PendingMark, type SetlistView } from './view'
export { computeFreshness, markLive, useLiveFlags, type Freshness, type FreshnessState, type RefusedItem } from './freshness'
export { isOnline, useConnectivity, _setConnectivityForTests } from './connectivity'
export {
    applyOpsRows,
    putServerSetlist,
    replaceServerRows,
    toLocalTrack,
    _resetServerCacheMemory,
    type ServerRow,
} from './server-cache'
export { migrateOutbox, legacyOutboxRows, type MigrationReport } from './migrate'
export { ROW_FIELDS, SETLIST_FIELDS, rowEditSet, rowForInsert } from './fields'
