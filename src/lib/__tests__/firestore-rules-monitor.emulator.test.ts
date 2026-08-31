import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import {
    assertFails,
    assertSucceeds,
    initializeTestEnvironment,
    type RulesTestEnvironment,
} from '@firebase/rules-unit-testing'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

/**
 * monitor-fix-f1 (F1/F7/F10) — firestore.rules monitor-live/commands/pending
 * authZ coverage. The first-ever rules test touching monitor-live (closes F10).
 *
 * Context (monitor-audit-2 FINDINGS F1): the bridge is the AUTHORITATIVE
 * bus-ownership gate; these rules enforce only the cheap, high-value half of
 * authZ. This suite pins exactly what the create rule does and does NOT enforce:
 *   - membership (isMember || isSoundEngineer), NOT bare isSignedIn → a
 *     signed-in account with no role (pending/denied) is rejected;
 *   - self-attribution (uid == auth.uid) → no forging another user's command;
 *   - FOH matrix primitives (set_matrix_fader / set_matrix_on) gated to
 *     admin / sound-engineer in-rule;
 *   - a closed field set (hasOnly) + per-field type checks.
 * Per-bus ownership is intentionally NOT enforced here (stays at the bridge), so
 * a member writing a bus command is ALLOWED by the rules and rejected later by
 * the bridge — that boundary is asserted, not treated as a bug.
 *
 * Runs against the Firebase emulator via `npm run test:emulator`.
 */
describe('monitor-fix-f1 firestore.rules monitor-live/commands/pending', () => {
    let testEnv: RulesTestEnvironment

    // monitor-live/commands/pending/{commandId}
    const pending = (db: ReturnType<ReturnType<RulesTestEnvironment['authenticatedContext']>['firestore']>) =>
        db.collection('monitor-live').doc('commands').collection('pending')

    const busCmd = (uid: string) => ({
        type: 'set_bus_master',
        busIndex: 2,
        value: 0.5,
        uid,
        createdAt: Date.now(),
    })
    const sendCmd = (uid: string) => ({
        type: 'set_send_level',
        busIndex: 2,
        channelIndex: 5,
        value: 0.5,
        uid,
        createdAt: Date.now(),
    })
    const matrixCmd = (uid: string) => ({
        type: 'set_matrix_fader',
        matrixIndex: 1,
        value: 0,
        uid,
        createdAt: Date.now(),
    })

    beforeAll(async () => {
        expect(process.env.FIRESTORE_EMULATOR_HOST).toBeTruthy()
        const [host, portStr] = (process.env.FIRESTORE_EMULATOR_HOST ?? '127.0.0.1:8080').split(':')
        const port = Number.parseInt(portStr ?? '8080', 10)

        testEnv = await initializeTestEnvironment({
            projectId: 'demo-monitor-fix-f1',
            firestore: {
                rules: readFileSync(resolve(process.cwd(), 'firestore.rules'), 'utf8'),
                host,
                port,
            },
        })
    })

    afterAll(async () => {
        await testEnv.cleanup()
    })

    beforeEach(async () => {
        await testEnv.clearFirestore()
        // Seed config/admins so isAdmin()'s get() resolves a real (empty) doc
        // rather than relying on CEL error-absorption for non-admin paths.
        await testEnv.withSecurityRulesDisabled(async (ctx) => {
            await ctx.firestore().collection('config').doc('admins').set({ uids: [] })
        })
    })

    // ─── Membership gate (was bare isSignedIn) ───

    it('A: unauthenticated create is DENIED', async () => {
        const db = testEnv.unauthenticatedContext().firestore()
        await assertFails(pending(db).doc('c-unauth').set(busCmd('anon')))
    })

    it('B: signed-in with NO role (pending/denied) create is DENIED', async () => {
        const db = testEnv.authenticatedContext('pending-uid', {}).firestore()
        await assertFails(pending(db).doc('c-pending').set(busCmd('pending-uid')))
    })

    it('C: member creating own-uid bus command is ALLOWED (per-bus ownership stays at the bridge)', async () => {
        const db = testEnv.authenticatedContext('member-uid', { role: 'member' }).firestore()
        await assertSucceeds(pending(db).doc('c-member-bus').set(busCmd('member-uid')))
    })

    it('D: musician creating own-uid send command is ALLOWED', async () => {
        const db = testEnv.authenticatedContext('musician-uid', { role: 'musician' }).firestore()
        await assertSucceeds(pending(db).doc('c-musician-send').set(sendCmd('musician-uid')))
    })

    // ─── Attribution ───

    it('E: cross-uid forge (uid != auth.uid) is DENIED', async () => {
        const db = testEnv.authenticatedContext('musician-uid', { role: 'musician' }).firestore()
        await assertFails(pending(db).doc('c-forge').set(busCmd('someone-else')))
    })

    // ─── Matrix privilege gate (admin / sound-engineer only) ───

    it('F: non-privileged musician set_matrix_fader is DENIED', async () => {
        const db = testEnv.authenticatedContext('musician-uid', { role: 'musician' }).firestore()
        await assertFails(pending(db).doc('c-mtx-musician').set(matrixCmd('musician-uid')))
    })

    it('F2: member set_matrix_fader is DENIED', async () => {
        const db = testEnv.authenticatedContext('member-uid', { role: 'member' }).firestore()
        await assertFails(pending(db).doc('c-mtx-member').set(matrixCmd('member-uid')))
    })

    it('G: admin set_matrix_fader is ALLOWED', async () => {
        const db = testEnv.authenticatedContext('admin-uid', { role: 'admin' }).firestore()
        await assertSucceeds(pending(db).doc('c-mtx-admin').set(matrixCmd('admin-uid')))
    })

    it('H: sound-engineer (soundEngineer claim, NO role) set_matrix_fader is ALLOWED', async () => {
        const db = testEnv.authenticatedContext('se-uid', { soundEngineer: true }).firestore()
        await assertSucceeds(pending(db).doc('c-mtx-se').set(matrixCmd('se-uid')))
    })

    it('I: sound-engineer (NO role) set_bus_master is ALLOWED (base gate admits SE)', async () => {
        const db = testEnv.authenticatedContext('se-uid', { soundEngineer: true }).firestore()
        await assertSucceeds(pending(db).doc('c-bus-se').set(busCmd('se-uid')))
    })

    // ─── Schema / shape (allowlist + hasOnly + types) ───

    it('J: unknown command type is DENIED', async () => {
        const db = testEnv.authenticatedContext('admin-uid', { role: 'admin' }).firestore()
        await assertFails(
            pending(db).doc('c-badtype').set({
                type: 'set_everything',
                value: 1,
                uid: 'admin-uid',
                createdAt: Date.now(),
            }),
        )
    })

    it('K: extra/unexpected field is DENIED (hasOnly closed field set)', async () => {
        const db = testEnv.authenticatedContext('admin-uid', { role: 'admin' }).firestore()
        await assertFails(
            pending(db)
                .doc('c-extrafield')
                .set({ ...busCmd('admin-uid'), evil: 'inject' }),
        )
    })

    it('L: createdAt that is not a number is DENIED', async () => {
        const db = testEnv.authenticatedContext('admin-uid', { role: 'admin' }).firestore()
        await assertFails(
            pending(db)
                .doc('c-badts')
                .set({ ...busCmd('admin-uid'), createdAt: 'not-a-number' }),
        )
    })

    // ─── Read / update / delete are bridge-only (Admin SDK) ───

    it('M: client read of commands/pending is DENIED (bridge reads via Admin SDK)', async () => {
        await testEnv.withSecurityRulesDisabled(async (ctx) => {
            await ctx
                .firestore()
                .collection('monitor-live')
                .doc('commands')
                .collection('pending')
                .doc('seeded')
                .set(busCmd('admin-uid'))
        })
        const db = testEnv.authenticatedContext('admin-uid', { role: 'admin' }).firestore()
        await assertFails(pending(db).doc('seeded').get())
    })

    it('N: client update/delete of commands/pending is DENIED (bridge deletes via Admin SDK)', async () => {
        await testEnv.withSecurityRulesDisabled(async (ctx) => {
            await ctx
                .firestore()
                .collection('monitor-live')
                .doc('commands')
                .collection('pending')
                .doc('seeded')
                .set(busCmd('admin-uid'))
        })
        const db = testEnv.authenticatedContext('admin-uid', { role: 'admin' }).firestore()
        await assertFails(pending(db).doc('seeded').update({ value: 1 }))
        await assertFails(pending(db).doc('seeded').delete())
    })

    // ─── R2: command ACKS — the read path that did not exist ───────────────
    //
    // Before R2 there was NO match for monitor-live/commands/acks, so the
    // deny-all fallback applied and no client could ever read the bridge's own
    // verdict on its own command. Every failure class — unauthorized,
    // bridge-standby, superseded, malformed, X32 error — reached the musician as
    // the same wordless 2s spinner-then-revert. These cases pin the new rule:
    // member-or-SE, self-attributed, read-only.

    const acks = (db: ReturnType<ReturnType<RulesTestEnvironment['authenticatedContext']>['firestore']>) =>
        db.collection('monitor-live').doc('commands').collection('acks')

    const seedAck = async (id: string, uid: string | null) =>
        testEnv.withSecurityRulesDisabled(async (ctx) => {
            const data: Record<string, unknown> = {
                commandId: id,
                status: 'rejected',
                reason: 'unauthorized',
                createdAtMs: Date.now(),
            }
            if (uid !== null) data.uid = uid
            await ctx
                .firestore()
                .collection('monitor-live')
                .doc('commands')
                .collection('acks')
                .doc(id)
                .set(data)
        })

    it('O: musician reads the ack for their OWN command — ALLOWED', async () => {
        await seedAck('ack-own', 'musician-uid')
        const db = testEnv.authenticatedContext('musician-uid', { role: 'musician' }).firestore()
        await assertSucceeds(acks(db).doc('ack-own').get())
    })

    it('O2: member (the base gate admits members, like pending) — ALLOWED', async () => {
        await seedAck('ack-member', 'member-uid')
        const db = testEnv.authenticatedContext('member-uid', { role: 'member' }).firestore()
        await assertSucceeds(acks(db).doc('ack-member').get())
    })

    it('O3: sound-engineer with NO role — ALLOWED (mirrors the pending base gate)', async () => {
        await seedAck('ack-se', 'se-uid')
        const db = testEnv.authenticatedContext('se-uid', { soundEngineer: true }).firestore()
        await assertSucceeds(acks(db).doc('ack-se').get())
    })

    it("P: reading ANOTHER musician's ack is DENIED (no reading the band's mix activity)", async () => {
        await seedAck('ack-other', 'someone-else')
        const db = testEnv.authenticatedContext('musician-uid', { role: 'musician' }).firestore()
        await assertFails(acks(db).doc('ack-other').get())
    })

    it('P2: even an ADMIN cannot read a foreign ack through the rules (Admin SDK is the ops path)', async () => {
        await seedAck('ack-foreign', 'musician-uid')
        const db = testEnv.authenticatedContext('admin-uid', { role: 'admin' }).firestore()
        await assertFails(acks(db).doc('ack-foreign').get())
    })

    it('Q: signed-in with NO role (pending/denied) is DENIED even for a self-attributed ack', async () => {
        await seedAck('ack-pending', 'pending-uid')
        const db = testEnv.authenticatedContext('pending-uid', {}).firestore()
        await assertFails(acks(db).doc('ack-pending').get())
    })

    it('Q2: unauthenticated read is DENIED', async () => {
        await seedAck('ack-anon', 'musician-uid')
        const db = testEnv.unauthenticatedContext().firestore()
        await assertFails(acks(db).doc('ack-anon').get())
    })

    it('R: an ack with NO uid (pre-R2 bridge) is unreadable — fails closed, not open', async () => {
        await seedAck('ack-nouid', null)
        const db = testEnv.authenticatedContext('musician-uid', { role: 'musician' }).firestore()
        await assertFails(acks(db).doc('ack-nouid').get())
    })

    it('S: clients cannot WRITE acks (the bridge is the only writer)', async () => {
        const db = testEnv.authenticatedContext('musician-uid', { role: 'musician' }).firestore()
        await assertFails(
            acks(db).doc('ack-forge').set({
                commandId: 'ack-forge',
                status: 'applied',
                uid: 'musician-uid',
                createdAtMs: Date.now(),
            }),
        )
        await seedAck('ack-mutate', 'musician-uid')
        await assertFails(acks(db).doc('ack-mutate').update({ status: 'applied' }))
        await assertFails(acks(db).doc('ack-mutate').delete())
    })
})
