import 'fake-indexeddb/auto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { collection, getDocs, query, where } from 'firebase/firestore'

import { addTrack } from '@/lib/mcp/server-tracks-write'

import {
    addRowAtEnd,
    adminDb,
    type Device,
    dragRow,
    duplicateRow,
    makeDevice,
    primeFromServer,
    seedSetlist,
    serverRows,
    sleep,
    summarize,
    waitFor,
} from './two-author-harness'

/**
 * 2026-11-03 setlist-sync incident — deterministic two-author reproductions.
 * Results and root mechanisms: docs/planning/2026-11-03-setlist-sync-structural/C-repro.md
 *
 * Each describe runs ONE scenario in beforeAll against the Firestore + Auth
 * emulators with the real engine / adapter / snapshot listener / rules, then:
 *   - `it('mechanism …')` pins today's defective behaviour and the exact
 *     engine / listener outcome codes (green now; goes red when the code
 *     changes, which is the cue to update this file and C-repro.md);
 *   - `it.fails('wanted …')` states the behaviour the app should have. It
 *     FAILS today, so `it.fails` keeps CI green. When a fix lands it will pass
 *     and `it.fails` will turn red: drop the `.fails` then.
 *
 * Personas: Daniel = platform owner + crc admin (`po: true`), the browser
 * editor. David = crc band_leader, the phone. MCP = the Admin-SDK
 * server writer in src/lib/mcp/server-tracks-write.ts.
 *
 * Determinism: "at the same time" is modelled by queueing one author's
 * applyEdit calls while their engine is paused (exactly what an in-flight
 * outbox looks like on a slow phone or a busy tab), landing the other
 * author's write, then letting the paused engine drain. No timing races.
 */

const DANIEL = { uid: 'u-daniel', claims: { po: true, m: { crc: 'ad' } } }
const DAVID = { uid: 'u-david', claims: { m: { crc: 'bl' } } }
const HOOK_MS = 90_000

type Outcome = Record<string, number>

async function outcomes(d: Device): Promise<Outcome> {
    const out: Outcome = {}
    for (const l of await d.editLog()) {
        const k = `${l.source}:${(l.outcome as string | undefined) ?? l.op}`
        out[k] = (out[k] ?? 0) + 1
    }
    return out
}

async function settled(d: Device, ms = 20_000): Promise<boolean> {
    // Nothing left that the engine will still attempt: every row is failed or
    // pending-behind-a-failed-row of the same doc.
    return waitFor(async () => {
        const rows = await d.outbox()
        const blocked = new Set(rows.filter((r) => r.status === 'failed').map((r) => r.docId))
        return rows.every((r) => r.status === 'failed' || (r.status === 'pending' && blocked.has(r.docId)))
    }, ms)
}

function isPermutation(orders: number[]): boolean {
    const sorted = orders.slice().sort((a, b) => a - b)
    return sorted.every((o, i) => o === i)
}

function report(label: string, data: Record<string, unknown>) {
    // One line per scenario; C-repro.md quotes these.
    console.log(`[repro ${label}] ${JSON.stringify(data)}`)
}

async function devicePair(S: string, n: number) {
    await seedSetlist(S, n)
    const daniel = await makeDevice('daniel', DANIEL.uid, DANIEL.claims)
    const david = await makeDevice('david', DAVID.uid, DAVID.claims)
    for (const d of [daniel, david]) {
        await primeFromServer(d, S)
        d.startListener(S)
    }
    await sleep(800)
    return { daniel, david }
}

// ─────────────────────────────────────────────────────────────────────────
describe('(c) a second device never shows the other author\'s edits', () => {
    const S = 'reproC'
    let daniel: Device
    let david: Device
    let davidTitle: unknown
    let davidAfterReload: string
    let davidControlOk: boolean
    beforeAll(async () => {
        ;({ daniel, david } = await devicePair(S, 6))
        // 1. Daniel retitles t01. David's listener should deliver it.
        await daniel.applyEdit({
            op: 'update',
            collection: 'tracks',
            docId: `${S}-t01`,
            patch: { title: 'Edited by Daniel' },
            expectedUpdatedAt: (await daniel.db.tracks.get(`${S}-t01`))!.updatedAt,
        })
        await waitFor(async () => (await daniel.outbox()).length === 0)
        await sleep(1500)
        davidTitle = (await david.db.tracks.get(`${S}-t01`))?.title

        // Control: the same query WITH the tenant filter is allowed for David.
        try {
            await getDocs(query(collection(david.fs, 'tracks'), where('orgId', '==', 'crc'), where('setlistId', '==', S)))
            davidControlOk = true
        } catch {
            davidControlOk = false
        }

        // 2. "Even after a reload": David (blind to Daniel's move) drags t05 to
        // the top. Daniel already moved t04 (server stamp advanced), so David's
        // t04 renumber fails and stays in his outbox; a fresh SSR frame then
        // cannot update t04 on his device.
        await dragRow(daniel, S, `${S}-t04`, `${S}-t00`)
        await waitFor(async () => (await daniel.outbox()).length === 0)
        await dragRow(david, S, `${S}-t05`, `${S}-t00`)
        await settled(david)
        await primeFromServer(david, S) // what SetlistGridHydrator does on reload
        const srv = (await serverRows(S)).find((r) => r.id === `${S}-t04`)!
        const loc = (await david.db.tracks.get(`${S}-t04`))!
        davidAfterReload = `server t04@${srv.order} / david t04@${loc.order}`
        report('c', {
            davidTitle,
            davidListenerWarnings: david.listenerWarnings.map((w) => w.err.split('\n')[0] + ' ' + (w.err.split('\n')[1] ?? '').slice(0, 90)),
            davidSentry: david.sentry.map((s) => `${s.feature}/${s.site}`),
            danielListenerWarnings: daniel.listenerWarnings.length,
            davidControlOk,
            davidOutbox: (await david.outbox()).map((r) => `${r.docId.slice(-3)}:${r.status}:${r.lastError?.slice(0, 60)}`),
            davidAfterReload,
            server: summarize(await serverRows(S)),
            davidDexie: summarize(await david.rows(S)),
            davidOutcomes: await outcomes(david),
        })
    }, HOOK_MS)
    afterAll(async () => {
        await daniel?.shutdown()
        await david?.shutdown()
    })

    it('mechanism: the band-leader tracks listener is refused by the rules (no orgId filter); a po listener is not', () => {
        expect(david.listenerWarnings.some((w) => w.err.startsWith('permission-denied'))).toBe(true)
        expect(david.sentry.some((s) => s.feature === 'snapshot-listener' && s.site === 'tracks-subscribe')).toBe(true)
        expect(daniel.listenerWarnings).toHaveLength(0)
        // Same query plus `where('orgId','==','crc')` is allowed: the filter is the cause.
        expect(davidControlOk).toBe(true)
        expect(davidTitle).toBe('Song 1')
    })

    it('mechanism: a doc with any outbox row (here a failed version-mismatch) is skipped by the reload frame', async () => {
        const failed = (await david.outbox()).filter((r) => r.status === 'failed')
        expect(failed.map((r) => r.docId)).toContain(`${S}-t04`)
        expect(failed.every((r) => /expected updatedAt=\d+, remote=\d+/.test(r.lastError ?? ''))).toBe(true)
        const srv = (await serverRows(S)).find((r) => r.id === `${S}-t04`)!
        const loc = (await david.db.tracks.get(`${S}-t04`))!
        expect(loc.order).not.toBe(srv.order)
    })

    it.fails('wanted: David sees Daniel\'s edit live (fails: listener denied)', () => {
        expect(davidTitle).toBe('Edited by Daniel')
    })

    it.fails('wanted: after a reload David\'s rows equal the server\'s (fails: outbox guard keeps the stale row)', async () => {
        expect(summarize(await david.rows(S))).toBe(summarize(await serverRows(S)))
    })
})

// ─────────────────────────────────────────────────────────────────────────
describe('(a) rows created locally never reach the server; their neighbours\' renumbers do', () => {
    describe('a1: Duplicate of a row whose local copy has a cleared field', () => {
        const S = 'reproA1'
        let daniel: Device
        let david: Device
        beforeAll(async () => {
            ;({ daniel, david } = await devicePair(S, 8))
            // BPM cell cleared → commit patch `{ bpm: undefined }` (SetlistGrid
            // BpmCell; MobileRowCard commitBpm). applyEdit merges it into the
            // Dexie row, so the local row now HAS a `bpm: undefined` property.
            await daniel.applyEdit({
                op: 'update',
                collection: 'tracks',
                docId: `${S}-t02`,
                patch: { bpm: undefined },
                expectedUpdatedAt: (await daniel.db.tracks.get(`${S}-t02`))!.updatedAt,
            })
            // Context-menu Duplicate on that row: +1 bumps for t03..t07, then set(clone).
            await duplicateRow(daniel, S, `${S}-t02`, `${S}-dup`)
            await settled(daniel, 30_000)
            report('a1', {
                server: summarize(await serverRows(S)),
                danielDexie: summarize(await daniel.rows(S)),
                danielOutbox: (await daniel.outbox()).map((r) => `${r.docId.slice(-3)}:${r.op}:${r.status}:${r.attempts}:${r.lastError?.slice(0, 70)}`),
                danielStates: daniel.states.map((s) => s.state).join(' '),
                danielOutcomes: await outcomes(daniel),
                danielSentry: daniel.sentry.map((s) => `${s.feature}:${String(s.error).slice(0, 50)}`),
            })
        }, HOOK_MS)
        afterAll(async () => {
            await daniel?.shutdown()
            await david?.shutdown()
        })

        it('mechanism: set(clone) dead-letters on invalid-argument (undefined field) after 5 attempts; the bumps land', async () => {
            const box = await daniel.outbox()
            const set = box.find((r) => r.docId === `${S}-dup`)!
            expect(set.op).toBe('set')
            expect(set.status).toBe('failed')
            expect(set.attempts).toBe(5)
            expect(set.lastError).toMatch(/setDoc\(\) called with invalid data\. Unsupported field value: undefined/)
            const srv = await serverRows(S)
            expect(srv.find((r) => r.id === `${S}-dup`)).toBeUndefined()
            expect(srv.map((r) => r.order)).toEqual([0, 1, 2, 4, 5, 6, 7, 8])
            expect((await daniel.rows(S)).map((r) => r.id)).toContain(`${S}-dup`)
            const o = await outcomes(daniel)
            expect(o['engine-drain:dead-letter']).toBeGreaterThanOrEqual(2)
            expect(daniel.store.getState().state).toBe('failed')
        })

        it.fails('wanted: the duplicate reaches the server and orders stay contiguous', async () => {
            const srv = await serverRows(S)
            expect(srv.map((r) => r.id)).toContain(`${S}-dup`)
            expect(isPermutation(srv.map((r) => r.order))).toBe(true)
        })
    })

    describe('a2: a row removed on the server survives in the editor; the next drag gaps around it', () => {
        const S = 'reproA2'
        let daniel: Device
        let david: Device
        beforeAll(async () => {
            ;({ daniel, david } = await devicePair(S, 8))
            const db = await adminDb()
            // Daniel has an edit queued on t04 when another writer deletes t04.
            daniel.engine.shutdown()
            await daniel.applyEdit({
                op: 'update',
                collection: 'tracks',
                docId: `${S}-t04`,
                patch: { title: 'queued' },
                expectedUpdatedAt: (await daniel.db.tracks.get(`${S}-t04`))!.updatedAt,
            })
            await db.collection('tracks').doc(`${S}-t04`).delete()
            await sleep(800) // listener delivers 'removed' — skipped (pending row)
            await daniel.engine.start()
            await settled(daniel)
            // Daniel drags t07 to the second slot; t04 is still in his list.
            await dragRow(daniel, S, `${S}-t07`, `${S}-t01`)
            await settled(daniel)
            await sleep(500)
            report('a2', {
                server: summarize(await serverRows(S)),
                danielDexie: summarize(await daniel.rows(S)),
                danielOutbox: (await daniel.outbox()).map((r) => `${r.docId.slice(-3)}:${r.op}:${r.status}:${r.lastError?.slice(0, 50) ?? ''}`),
                danielStates: daniel.states.map((s) => s.state).join(' '),
                store: daniel.store.getState().state,
                danielOutcomes: await outcomes(daniel),
            })
        }, HOOK_MS)
        afterAll(async () => {
            await daniel?.shutdown()
            await david?.shutdown()
        })

        it('mechanism: remote-doc-missing is terminal, the row stays in Dexie, its slot becomes a server gap', async () => {
            const box = await daniel.outbox()
            expect(box.find((r) => r.docId === `${S}-t04` && r.status === 'failed')?.lastError).toMatch(/isn't on the server/)
            const o = await outcomes(daniel)
            expect(o['engine-drain:remote-doc-missing']).toBe(1)
            expect(o['snapshot-listener:guard-skipped-pending']).toBeGreaterThan(0)
            expect((await daniel.rows(S)).map((r) => r.id)).toContain(`${S}-t04`)
            const orders = (await serverRows(S)).map((r) => r.order)
            expect(orders).not.toContain(5) // t04's slot in Daniel's renumber
        })

        it.fails('wanted: the editor drops a row the server removed and renumbers contiguously', async () => {
            expect((await daniel.rows(S)).map((r) => r.id)).not.toContain(`${S}-t04`)
            expect(isPermutation((await serverRows(S)).map((r) => r.order))).toBe(true)
        })
    })
})

// ─────────────────────────────────────────────────────────────────────────
describe('(e) both authors reorder at once: lost updates and duplicate orders', () => {
    const S = 'reproE'
    let daniel: Device
    let david: Device
    beforeAll(async () => {
        ;({ daniel, david } = await devicePair(S, 10))
        // Daniel drags t08 → slot 1 (writes t08, t01..t07); his engine is busy.
        daniel.engine.shutdown()
        await dragRow(daniel, S, `${S}-t08`, `${S}-t01`)
        // David drags t02 → slot 6 (writes t03..t06, t02); his drains first.
        await dragRow(david, S, `${S}-t02`, `${S}-t06`)
        await waitFor(async () => (await david.outbox()).length === 0)
        await daniel.engine.start()
        await settled(daniel)
        await sleep(800)
        report('e', {
            server: summarize(await serverRows(S)),
            danielDexie: summarize(await daniel.rows(S)),
            davidDexie: summarize(await david.rows(S)),
            danielOutbox: (await daniel.outbox()).map((r) => `${r.docId.slice(-3)}:${r.status}:${r.lastError?.slice(0, 60)}`),
            danielStates: daniel.states.map((s) => s.state).join(' '),
            danielOutcomes: await outcomes(daniel),
        })
    }, HOOK_MS)
    afterAll(async () => {
        await daniel?.shutdown()
        await david?.shutdown()
    })

    it('mechanism: per-row version-mismatch fails the overlapping rows; the rest of each drag lands', async () => {
        const srv = await serverRows(S)
        const orders = srv.map((r) => r.order)
        expect(isPermutation(orders)).toBe(false)
        expect(new Set(orders).size).toBeLessThan(orders.length) // a duplicate order
        const failed = (await daniel.outbox()).filter((r) => r.status === 'failed')
        expect(failed.map((r) => r.docId.slice(-3)).sort()).toEqual(['t02', 't03', 't04', 't05', 't06'])
        expect(failed.every((r) => /^expected updatedAt=\d+, remote=\d+$/.test(r.lastError ?? ''))).toBe(true)
        // Half of Daniel's move landed (t08 is at 1), half did not.
        expect(srv.find((r) => r.id === `${S}-t08`)!.order).toBe(1)
        // His screen shows his own intended order, not the server's.
        expect(summarize(await daniel.rows(S))).not.toBe(summarize(srv))
    })

    it.fails('wanted: the server ends on one coherent order 0..n-1 that both screens show', async () => {
        const srv = await serverRows(S)
        expect(isPermutation(srv.map((r) => r.order))).toBe(true)
        expect(summarize(await daniel.rows(S))).toBe(summarize(srv))
    })
})

describe('(e/MCP) an MCP insert lands while the editor\'s add+drag is in flight', () => {
    const S = 'reproM'
    let daniel: Device
    let david: Device
    beforeAll(async () => {
        ;({ daniel, david } = await devicePair(S, 10))
        await addRowAtEnd(daniel, S, `${S}-new`, 'Daniel new')
        await waitFor(async () => (await daniel.outbox()).length === 0)
        daniel.engine.shutdown()
        await dragRow(daniel, S, `${S}-new`, `${S}-t05`)
        // David, through Claude: add_track at position 3 (renumbers every row).
        await addTrack(await adminDb(), { setlistId: S, type: 'song', title: 'MCP row', position: 3 })
        await daniel.engine.start()
        await settled(daniel)
        await sleep(800)
        report('mcp', {
            server: summarize(await serverRows(S)),
            danielDexie: summarize(await daniel.rows(S)),
            danielOutbox: (await daniel.outbox()).map((r) => `${r.docId.slice(-3)}:${r.status}`),
            danielStates: daniel.states.map((s) => s.state).join(' '),
            store: daniel.store.getState().state,
            danielOutcomes: await outcomes(daniel),
        })
    }, HOOK_MS)
    afterAll(async () => {
        await daniel?.shutdown()
        await david?.shutdown()
    })

    it('mechanism: every editor renumber of a row MCP touched fails version-mismatch; server keeps MCP order plus the survivors', async () => {
        const failed = (await daniel.outbox()).filter((r) => r.status === 'failed')
        expect(failed.length).toBeGreaterThan(0)
        expect(failed.every((r) => /^expected updatedAt=\d+, remote=\d+$/.test(r.lastError ?? ''))).toBe(true)
    })

    it.fails('wanted: the editor\'s move and the MCP insert both survive on one contiguous order', async () => {
        const srv = await serverRows(S)
        expect(isPermutation(srv.map((r) => r.order))).toBe(true)
        expect(summarize(await daniel.rows(S))).toBe(summarize(srv))
        expect((await daniel.outbox()).length).toBe(0)
    })
})

// ─────────────────────────────────────────────────────────────────────────
describe('(b) "saving" never clears', () => {
    const S = 'reproB'
    let daniel: Device
    let david: Device
    let stateAtEnd: string
    let stateLater: string
    beforeAll(async () => {
        ;({ daniel, david } = await devicePair(S, 10))
        daniel.engine.shutdown()
        await dragRow(daniel, S, `${S}-t08`, `${S}-t01`)
        await dragRow(david, S, `${S}-t02`, `${S}-t06`)
        await waitFor(async () => (await david.outbox()).length === 0)
        await daniel.engine.start()
        await settled(daniel)
        await sleep(500)
        stateAtEnd = daniel.store.getState().state
        await sleep(3000)
        stateLater = daniel.store.getState().state
        report('b', {
            stateAtEnd,
            stateLater,
            queued: daniel.store.getState().queued,
            transitions: daniel.states.map((s) => `${s.state}/${s.queued}`).join(' '),
            outbox: (await daniel.outbox()).map((r) => `${r.docId.slice(-3)}:${r.status}`),
        })
    }, HOOK_MS)
    afterAll(async () => {
        await daniel?.shutdown()
        await david?.shutdown()
    })

    it('mechanism: a pump after a conflict re-enters saving (DRAIN_STARTED) and nothing ever dispatches DRAIN_OK while failed rows remain', async () => {
        const box = await daniel.outbox()
        expect(box.length).toBeGreaterThan(0)
        expect(box.every((r) => r.status === 'failed')).toBe(true)
        expect(daniel.states.some((s) => s.state === 'conflict')).toBe(true)
        expect(stateAtEnd).toBe('saving')
        expect(stateLater).toBe('saving')
    })

    it.fails('wanted: with nothing in flight the indicator shows the conflict, not "saving"', () => {
        expect(stateLater).not.toBe('saving')
    })
})

// ─────────────────────────────────────────────────────────────────────────
describe('(d) receivers see intermediate orders (jumping)', () => {
    const S = 'reproD'
    let daniel: Device
    let david: Device
    let frames: string[] = []
    beforeAll(async () => {
        ;({ daniel, david } = await devicePair(S, 10))
        await sleep(300)
        daniel.seenOrders.length = 0
        // David drags the last row to the top: 10 single-row writes.
        await dragRow(david, S, `${S}-t09`, `${S}-t00`)
        await waitFor(async () => (await david.outbox()).length === 0, 15_000)
        await sleep(1500)
        frames = daniel.seenOrders.slice()
        report('d', {
            frames: frames.length,
            withDuplicateOrders: frames.filter((f) => hasDupOrder(f)).length,
            sample: frames.slice(0, 4).map((f) => f.replace(new RegExp(`${S}-`, 'g'), '')),
            danielOutcomes: await outcomes(daniel),
        })
    }, HOOK_MS)
    afterAll(async () => {
        await daniel?.shutdown()
        await david?.shutdown()
    })

    function hasDupOrder(frame: string): boolean {
        const orders = frame.split(',').map((p) => p.split(':')[1])
        return new Set(orders).size < orders.length
    }

    it('mechanism: one drag reaches the receiver as several snapshots, some with two rows on one order', () => {
        expect(frames.length).toBeGreaterThan(2)
        expect(frames.some(hasDupOrder)).toBe(true)
    })

    it.fails('wanted: the receiver goes straight from the old order to the new one', () => {
        expect(frames.length).toBeLessThanOrEqual(2)
    })
})
