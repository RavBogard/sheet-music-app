import { describe, expect, it } from 'vitest'

import type { OutboxRow } from '../../local/types'
import {
    type SyncEvent,
    type SyncState,
    deriveStateFromOutbox,
    transition,
} from '../state-machine'

const ALL_STATES: SyncState[] = [
    'idle',
    'dirty',
    'saving',
    'conflict',
    'failed',
    'offline',
]

const row = (overrides: Partial<OutboxRow> = {}): OutboxRow => ({
    localId: 1,
    status: 'pending',
    scheduledFor: 0,
    op: 'update',
    collection: 'tracks',
    docId: 't1',
    payload: {},
    attempts: 0,
    createdAt: 0,
    ...overrides,
})

describe('state-machine: transition', () => {
    it('NETWORK_OFFLINE is sticky from any state', () => {
        for (const s of ALL_STATES) {
            expect(transition(s, { type: 'NETWORK_OFFLINE' })).toBe('offline')
        }
    })

    it('offline + NETWORK_ONLINE → dirty (resume from offline)', () => {
        expect(transition('offline', { type: 'NETWORK_ONLINE' })).toBe('dirty')
    })

    it('offline ignores non-network events', () => {
        const ignored: SyncEvent[] = [
            { type: 'EDIT_COMMITTED' },
            { type: 'DRAIN_OK' },
            { type: 'DRAIN_VERSION_MISMATCH' },
        ]
        for (const e of ignored) {
            expect(transition('offline', e)).toBe('offline')
        }
    })

    it('EDIT_COMMITTED → dirty when state is idle/dirty/saving', () => {
        expect(transition('idle', { type: 'EDIT_COMMITTED' })).toBe('dirty')
        expect(transition('dirty', { type: 'EDIT_COMMITTED' })).toBe('dirty')
        expect(transition('saving', { type: 'EDIT_COMMITTED' })).toBe('dirty')
    })

    it('EDIT_COMMITTED preserves failed/conflict states', () => {
        expect(transition('failed', { type: 'EDIT_COMMITTED' })).toBe('failed')
        expect(transition('conflict', { type: 'EDIT_COMMITTED' })).toBe(
            'conflict',
        )
    })

    it('DRAIN_STARTED → saving', () => {
        for (const s of ALL_STATES) {
            if (s === 'offline') continue
            expect(transition(s, { type: 'DRAIN_STARTED' })).toBe('saving')
        }
    })

    it('DRAIN_OK → idle', () => {
        expect(transition('saving', { type: 'DRAIN_OK' })).toBe('idle')
    })

    it('DRAIN_VERSION_MISMATCH → conflict', () => {
        expect(transition('saving', { type: 'DRAIN_VERSION_MISMATCH' })).toBe(
            'conflict',
        )
    })

    it('DRAIN_RETRY_PENDING stays in saving (loud indicator)', () => {
        expect(transition('saving', { type: 'DRAIN_RETRY_PENDING' })).toBe(
            'saving',
        )
    })

    it('DRAIN_BUDGET_EXHAUSTED → failed', () => {
        expect(
            transition('saving', { type: 'DRAIN_BUDGET_EXHAUSTED' }),
        ).toBe('failed')
    })

    it('DRAIN_AUTH_FAILED → failed', () => {
        expect(transition('saving', { type: 'DRAIN_AUTH_FAILED' })).toBe(
            'failed',
        )
    })

    it('CONFLICT_RESOLVED → dirty', () => {
        expect(transition('conflict', { type: 'CONFLICT_RESOLVED' })).toBe(
            'dirty',
        )
    })
})

describe('state-machine: deriveStateFromOutbox', () => {
    it('empty outbox → idle', () => {
        expect(deriveStateFromOutbox([])).toBe('idle')
    })

    it('failed beats pending (multi-state precedence)', () => {
        expect(
            deriveStateFromOutbox([
                row({ status: 'failed' }),
                row({ status: 'pending' }),
            ]),
        ).toBe('failed')
    })

    it('sending → saving', () => {
        expect(deriveStateFromOutbox([row({ status: 'sending' })])).toBe(
            'saving',
        )
    })

    it('only pending → dirty', () => {
        expect(deriveStateFromOutbox([row({ status: 'pending' })])).toBe(
            'dirty',
        )
    })
})
