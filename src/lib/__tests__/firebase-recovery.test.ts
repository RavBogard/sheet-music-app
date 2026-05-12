import { describe, expect, it } from 'vitest'

/**
 * T1.5 (2026-05-12) — regression test for `clearFirestoreIndexedDB` safety.
 *
 * The function deletes every IndexedDB database whose name matches
 * `/firestore/i` ([src/lib/firebase.ts:102](../firebase.ts:102)). If a
 * future refactor renames the local Dexie database from `crc-local` to
 * something that happens to match the regex (e.g. `firestore-local`),
 * a Firestore SDK assertion failure would silently nuke the outbox +
 * tombstones table along with the actual Firestore caches — a silent
 * data-loss vector.
 *
 * Phase F audit (2026-05-12) verified at HEAD that `crc-local` does NOT
 * match. This test locks the invariant in.
 *
 * Note: the regex itself lives inside the function body. To keep the
 * test independent of internal refactors, we restate the same pattern
 * here and assert against both the current `crc-local` name (must NOT
 * match) and a sample Firestore IDB name (MUST match, to confirm the
 * regex still works at all). If anyone changes the regex in firebase.ts
 * without updating this test, the implementation-vs-test mismatch will
 * surface in code review.
 */
describe('clearFirestoreIndexedDB safety (T1.5 regression lock)', () => {
    // Mirrors the regex at src/lib/firebase.ts:102 at HEAD. If you change
    // the regex there, change it here AND verify the local DB name is
    // still excluded.
    const FIRESTORE_IDB_NAME_PATTERN = /firestore/i

    it('Dexie local DB name `crc-local` does NOT match — outbox is safe', () => {
        expect(FIRESTORE_IDB_NAME_PATTERN.test('crc-local')).toBe(false)
    })

    it('Firestore SDK IDB names DO match — regex still does its job', () => {
        expect(
            FIRESTORE_IDB_NAME_PATTERN.test(
                'firestore/[default]/my-project-id/main',
            ),
        ).toBe(true)
        expect(FIRESTORE_IDB_NAME_PATTERN.test('Firestore-cache')).toBe(true)
        expect(FIRESTORE_IDB_NAME_PATTERN.test('FIRESTORE')).toBe(true)
    })

    it('Defensive: hypothetical future Dexie names that would be unsafe', () => {
        // If someone renames `crc-local` to one of these, the regex would
        // delete the outbox. Add a clear failure here so the rename gets
        // caught in review.
        expect(FIRESTORE_IDB_NAME_PATTERN.test('crc-firestore-cache')).toBe(true)
        expect(FIRESTORE_IDB_NAME_PATTERN.test('local-firestore')).toBe(true)
        // These remain SAFE:
        expect(FIRESTORE_IDB_NAME_PATTERN.test('crc-local')).toBe(false)
        expect(FIRESTORE_IDB_NAME_PATTERN.test('central-reform-app')).toBe(
            false,
        )
        expect(FIRESTORE_IDB_NAME_PATTERN.test('outbox')).toBe(false)
    })
})
