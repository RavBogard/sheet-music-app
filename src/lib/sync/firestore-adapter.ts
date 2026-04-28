// Engine ↔ Firestore boundary. Discriminated error classes let the engine
// branch to the right state-machine event without inspecting raw error codes.

import type { LocalCollection, OutboxRow } from '../local/types'

export class VersionMismatchError extends Error {
    constructor(message = 'Version mismatch') {
        super(message)
        this.name = 'VersionMismatchError'
    }
}

export class AuthError extends Error {
    constructor(message = 'Auth failed') {
        super(message)
        this.name = 'AuthError'
    }
}

export class NetworkError extends Error {
    constructor(message = 'Network failed') {
        super(message)
        this.name = 'NetworkError'
    }
}

export class TransientError extends Error {
    constructor(message = 'Transient failure') {
        super(message)
        this.name = 'TransientError'
    }
}

/** v51-h01: thrown when a write targets a doc that no longer exists on the
 *  server (or never made it there — e.g. a phantom local row from an addDoc
 *  that resolved client-side without server confirmation under flaky signal).
 *  Engine treats this as terminal: latch to 'failed' immediately, no retry,
 *  surface a clear actionable message. Retrying TransientError-style would
 *  burn 5 attempts of backoff for a doc that isn't coming back. */
export class RemoteDocMissingError extends Error {
    constructor(message = 'Remote doc missing') {
        super(message)
        this.name = 'RemoteDocMissingError'
    }
}

export interface CommitResult {
    /** Server-stamped updatedAt for the doc post-commit, in ms since epoch.
     *  - `set` / `update`: the new server `updatedAt` from `serverTimestamp()`.
     *  - `delete`: undefined (no resulting doc).
     *  - Any adapter that cannot surface a server timestamp may return
     *    undefined — the engine treats it as "no write-back" and leaves the
     *    local row's `updatedAt` field unchanged.
     *  v50-06-01: enables the engine to keep local `updatedAt` in sync with
     *  the server, so subsequent edits pass an honest `expectedUpdatedAt`
     *  precondition (surfacing real two-writer races as VersionMismatchError
     *  rather than silently last-write-winning). */
    updatedAt?: number
}

/** Snapshot of a Firestore doc as observed at the time of the read.
 *  Used by v50-06-02 reconciliation modal to render the "their version"
 *  side of the diff without coupling the UI to Firebase SDK types. */
export interface RemoteDocSnapshot {
    /** Raw doc data. Includes whatever fields the doc carries — the modal
     *  filters down to fields present in the failed outbox row's payload. */
    data: Record<string, unknown>
    /** Server-stamped `updatedAt` in ms since epoch. The modal passes this
     *  as `newExpectedUpdatedAt` when re-queuing a "Keep mine" choice so
     *  the next drain attempt's precondition matches. */
    updatedAt: number
}

export interface FirestoreAdapter {
    commitOutboxRow(row: OutboxRow): Promise<CommitResult>
    refreshAuthToken(): Promise<void>
    /** v50-06-02: one-shot read of a remote doc to populate the
     *  reconciliation modal's diff. Returns null when the doc does not
     *  exist on the server (e.g. winner was a delete). */
    readDoc(
        collection: LocalCollection,
        docId: string,
    ): Promise<RemoteDocSnapshot | null>
}

// Real adapter (production) is wired in v50-05 when the editor cuts over —
// it will route through the existing Firebase Web SDK (firebase.ts), mirroring
// the runTransaction + expectedUpdatedAt precondition pattern in setlist-firebase.ts.
// For v50-03 the engine accepts any FirestoreAdapter via DI; tests inject a
// mock that throws the typed errors above on demand.
