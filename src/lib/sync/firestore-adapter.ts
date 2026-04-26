// Engine ↔ Firestore boundary. Discriminated error classes let the engine
// branch to the right state-machine event without inspecting raw error codes.

import type { OutboxRow } from '../local/types'

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

export interface FirestoreAdapter {
    commitOutboxRow(row: OutboxRow): Promise<void>
    refreshAuthToken(): Promise<void>
}

// Real adapter (production) is wired in v50-05 when the editor cuts over —
// it will route through the existing Firebase Web SDK (firebase.ts), mirroring
// the runTransaction + expectedUpdatedAt precondition pattern in setlist-firebase.ts.
// For v50-03 the engine accepts any FirestoreAdapter via DI; tests inject a
// mock that throws the typed errors above on demand.
