import { beforeAll, describe, expect, it } from 'vitest'

/**
 * v54-02-01 (Harness Fidelity Gate phase 1) — emulator wiring canary.
 *
 * Smallest possible test proving Firebase Local Emulator Suite + the
 * `firebase emulators:exec` wrapper + this repo's vitest.emulator.config.ts
 * round-trip cleanly. NO sync-engine code-under-test here — that lives in
 * Plan 02 (RTL editor↔perf-view propagation pair + H-SL-7 regression
 * canary). If this canary fails, the emulator infra is broken and Plan 02
 * tests would be unreliable.
 *
 * What this test would have caught (if absent):
 *  - firebase.json `emulators` block missing or wrong port
 *  - npm script `test:emulator` not threading FIRESTORE_EMULATOR_HOST
 *  - vitest.emulator.config.ts not picking up `*.emulator.test.ts` glob
 *  - CI workflow setup-java step missing or wrong distribution
 *
 * Local prereq (Java JDK 11+; documented in PROJECT.md §Constraints):
 *   - Windows: `winget install Microsoft.OpenJDK.21`
 *   - macOS: `brew install openjdk@21`
 *   - Linux: `apt install openjdk-21-jdk`
 * CI: actions/setup-java@v4 with temurin/21 (see .github/workflows/ci.yml).
 */
describe('v54-02-01 emulator canary — proves Firebase Local Emulator Suite wiring', () => {
    let db: import('firebase-admin/firestore').Firestore

    beforeAll(async () => {
        const { initializeApp, getApps } = await import('firebase-admin/app')
        const { getFirestore } = await import('firebase-admin/firestore')

        if (getApps().length === 0) {
            // demo-* project IDs are recognized as "no auth required" by the
            // emulator and never accidentally hit production credentials.
            initializeApp({ projectId: 'demo-v54-02-canary' })
        }
        db = getFirestore()

        // Sanity: env var must be set by `firebase emulators:exec`. If
        // missing, the firebase-admin SDK would silently try to reach prod.
        expect(process.env.FIRESTORE_EMULATOR_HOST).toBeTruthy()
    })

    it('writes and reads back a doc through the emulator', async () => {
        const ref = db.doc('canary/v54-02-01')
        await ref.set({ ok: true, ts: 5000, note: 'harness fidelity ship gate' })
        const snap = await ref.get()
        expect(snap.exists).toBe(true)
        expect(snap.data()).toMatchObject({
            ok: true,
            ts: 5000,
            note: 'harness fidelity ship gate',
        })
    })

    it('observes emulator-side timestamps (proves real Firestore semantics, not in-memory fake)', async () => {
        const { FieldValue } = await import('firebase-admin/firestore')
        const ref = db.doc('canary/v54-02-01-server-ts')
        await ref.set({ writtenAt: FieldValue.serverTimestamp() })
        const snap = await ref.get()
        const written = snap.get('writtenAt')
        // FakeFirestore would return the literal sentinel; emulator returns a
        // real Timestamp object. Distinguishing this is the point — it proves
        // we're talking to a real Firestore implementation, not the in-memory
        // adapter used by migrate-v50 / bootstrap-songs admin tests.
        expect(written).toBeDefined()
        expect(typeof (written as { toMillis?: () => number })?.toMillis).toBe(
            'function',
        )
    })
})
