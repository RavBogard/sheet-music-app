'use client'

import { useEffect } from 'react'

import { bootSetlistOps } from '@/lib/setlist-ops-client/runtime'

import { uploadRecentEditLog } from './edit-log-upload'
export { startSnapshotListener } from './snapshot-listener'
export type {
    SnapshotListenerOpts,
    SnapshotSubscriber,
    SetlistDelivery,
    TracksDelivery,
} from './snapshot-listener'

let editLogUploaded = false

/**
 * Mounted once on every (main) page. Setlist writes go through the setlist
 * ops client (src/lib/setlist-ops-client); the old browser outbox and its
 * sync engine are gone.
 */
export function SyncEngineBoot(): null {
    useEffect(() => {
        // v5h3-01-02: flush the previous session's edit-log breadcrumbs to
        // Sentry, once per page lifetime. Fire-and-forget and failure-
        // swallowing. The edit log also feeds migrate.ts's "seen on the
        // server" check, so it stays until that migration is retired.
        if (!editLogUploaded) {
            editLogUploaded = true
            void uploadRecentEditLog()
        }
        // Setlist sync PR 3: the setlist ops queue drains on every page, and
        // the old outbox's setlist rows are converted on the first load.
        void bootSetlistOps()
    }, [])
    return null
}
