import 'fake-indexeddb/auto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { doc, setDoc } from 'firebase/firestore'

import { addTrack } from '@/lib/mcp/server-tracks-write'

import {
    addRowAtEnd,
    adminDb,
    type Device,
    dragRow,
    editField,
    isPermutation,
    makeDevice,
    seedMembers,
    seedSetlist,
    seq,
    serverRows,
    sleep,
    summarize,
    waitFor,
} from './two-author-harness'

/**
 * 2026-11-03 setlist-sync incident, the five reported classes, on the PR 3
 * path (docs/planning/2026-11-03-setlist-sync-structural/C-repro.md has the
 * old mechanisms). Before PR 3 each `wanted` test here was an `it.fails`;
 * they now pass with the browser editor on the ops endpoint:
 *   - Dexie holds server state only (listener full sets + /ops answers);
 *   - every edit is an intent, one user action = one batch, one transaction;
 *   - a drag is ONE move, so receivers see one snapshot;
 *   - conflicts are a per-setlist refused list, never a pinned "saving".
 *
 * Personas: Daniel = platform owner + crc admin, the browser editor. David =
 * crc band_leader, the phone. MCP = the Admin-SDK server writer.
 *
 * "At the same time" is modelled deterministically: one device's transport is
 * paused (its request is in flight), the other author's write lands, then the
 * paused request completes.
 */

const DANIEL = { uid: 'u-daniel', claims: { po: true, m: { crc: 'ad' } } }
const DAVID = { uid: 'u-david', claims: { m: { crc: 'bl' } } }
const HOOK_MS = 90_000

async function devicePair(S: string, n: number) {
    await seedSetlist(S, n)
    const daniel = await makeDevice('daniel', DANIEL.uid, DANIEL.claims)
    const david = await makeDevice('david', DAVID.uid, DAVID.claims)
    for (const d of [daniel, david]) {
        await d.boot()
        d.startListener(S)
    }
    // Both caches hold the server's set before anyone edits.
    await waitFor(async () => (await daniel.cache(S)).length === n && (await david.cache(S)).length === n)
    return { daniel, david }
}

/** Both devices' views equal the server, the server is 0..n-1, nothing queued. */
async function converged(S: string, devices: Device[]): Promise<boolean> {
    return waitFor(async () => {
        const srv = summarize(await serverRows(S))
        for (const d of devices) {
            if ((await d.intents(S)).some((i) => i.status !== 'refused')) return false
            if (summarize(await d.view(S)) !== srv) return false
        }
        return true
    }, 10_000)
}

beforeAll(async () => {
    expect(process.env.FIRESTORE_EMULATOR_HOST).toBeTruthy()
    const db = await adminDb()
    await db.collection('platform').doc('owners').set({ uids: [DANIEL.uid] })
    await seedMembers([
        { uid: DANIEL.uid, org: 'crc', role: 'admin' },
        { uid: DAVID.uid, org: 'crc', role: 'band_leader' },
    ])
}, HOOK_MS)

// ─────────────────────────────────────────────────────────────────────────
describe("(c) a second device shows the other author's edits", () => {
    const S = 'reproC'
    let daniel: Device
    let david: Device
    beforeAll(async () => {
        ;({ daniel, david } = await devicePair(S, 6))
    }, HOOK_MS)
    afterAll(async () => {
        await daniel?.shutdown()
        await david?.shutdown()
    })

    it("David's band-leader listener is live: he sees Daniel's retitle", async () => {
        await editField(daniel, S, `${S}-t01`, { title: 'Edited by Daniel' })
        await daniel.idle()
        expect(await waitFor(async () => (await david.cache(S)).find((r) => r.id === `${S}-t01`)?.title === 'Edited by Daniel')).toBe(true)
        expect(david.listenerWarnings).toEqual([])
    })

    it("after both authors drag, and after David reloads, both screens equal the server", async () => {
        await dragRow(daniel, S, `${S}-t04`, `${S}-t00`)
        await daniel.idle()
        await waitFor(async () => seq(await david.view(S)) === seq(await serverRows(S)))
        await dragRow(david, S, `${S}-t05`, `${S}-t00`)
        await david.idle()
        expect(await converged(S, [daniel, david])).toBe(true)
        // Reload: a fresh listener's first set replaces the cache.
        david.stopListener()
        david.startListener(S)
        expect(await converged(S, [daniel, david])).toBe(true)
    })
})

// ─────────────────────────────────────────────────────────────────────────
describe('(a) rows created in the editor reach the server, with their neighbours', () => {
    describe('a1: Duplicate of a row whose BPM was just cleared', () => {
        const S = 'reproA1'
        let daniel: Device
        let david: Device
        beforeAll(async () => {
            ;({ daniel, david } = await devicePair(S, 8))
            // The cell commits `{ bpm: undefined }`; it goes out as a clear.
            await editField(daniel, S, `${S}-t02`, { bpm: undefined })
            await daniel.actions.duplicateRow(S, await daniel.view(S), `${S}-t02`)
            await daniel.idle()
        }, HOOK_MS)
        afterAll(async () => {
            await daniel?.shutdown()
            await david?.shutdown()
        })

        it('the duplicate lands right after its source, orders stay contiguous, and nothing undefined was sent', async () => {
            const srv = await serverRows(S)
            expect(srv).toHaveLength(9)
            expect(isPermutation(srv.map((r) => r.order))).toBe(true)
            const i = srv.findIndex((r) => r.id === `${S}-t02`)
            const dup = srv[i + 1]
            expect(dup.id).not.toMatch(/-t\d\d$/)
            expect(dup.title).toBe('Song 2')
            expect(dup).not.toHaveProperty('bpm')
            expect(srv[i]).not.toHaveProperty('bpm')
            // An explicit field list: no stamps, no undefined.
            const insert = daniel.sent.flatMap((b) => b.ops).find((o) => o.kind === 'insert') as { row: Record<string, unknown> }
            expect(insert.row).not.toHaveProperty('version')
            expect(insert.row).not.toHaveProperty('updatedAt')
            expect(Object.values(insert.row)).not.toContain(undefined)
            expect(await converged(S, [daniel, david])).toBe(true)
        })
    })

    describe('a2: a row removed on the server while an edit to it is in flight', () => {
        const S = 'reproA2'
        let daniel: Device
        let david: Device
        beforeAll(async () => {
            ;({ daniel, david } = await devicePair(S, 8))
            daniel.pause()
            await editField(daniel, S, `${S}-t04`, { title: 'queued' })
            // Another writer removes t04 (the shape of MCP remove_track).
            await (await adminDb()).collection('tracks').doc(`${S}-t04`).delete()
            daniel.resume()
            await daniel.idle()
            await waitFor(async () => !(await daniel.cache(S)).some((r) => r.id === `${S}-t04`))
            await dragRow(daniel, S, `${S}-t07`, `${S}-t01`)
            await daniel.idle()
        }, HOOK_MS)
        afterAll(async () => {
            await daniel?.shutdown()
            await david?.shutdown()
        })

        it('the edit is refused (row gone), the row leaves the editor, and the drag renumbers contiguously', async () => {
            const refused = (await daniel.intents(S)).filter((i) => i.status === 'refused')
            expect(refused.map((i) => i.refusal?.reason)).toEqual(['row-gone'])
            expect((await daniel.view(S)).map((r) => r.id)).not.toContain(`${S}-t04`)
            const srv = await serverRows(S)
            expect(isPermutation(srv.map((r) => r.order))).toBe(true)
            expect(srv[1].id).toBe(`${S}-t07`)
            expect(await converged(S, [daniel, david])).toBe(true)
        })
    })
})

// ─────────────────────────────────────────────────────────────────────────
describe('(e) both authors reorder at once', () => {
    const S = 'reproE'
    let daniel: Device
    let david: Device
    beforeAll(async () => {
        ;({ daniel, david } = await devicePair(S, 10))
        daniel.pause()
        await dragRow(daniel, S, `${S}-t08`, `${S}-t01`) // t08 → slot 1, in flight
        await dragRow(david, S, `${S}-t02`, `${S}-t06`) // t02 → slot 6, lands first
        await david.idle()
        daniel.resume()
        await daniel.idle()
    }, HOOK_MS)
    afterAll(async () => {
        await daniel?.shutdown()
        await david?.shutdown()
    })

    it('the server ends on one coherent order 0..n-1 holding both moves, and both screens show it', async () => {
        const srv = await serverRows(S)
        expect(isPermutation(srv.map((r) => r.order))).toBe(true)
        const ids = srv.map((r) => r.id.replace(/^.*-/, ''))
        expect(ids[1]).toBe('t08') // Daniel's move, rebased on its anchors
        expect(ids.indexOf('t02')).toBeGreaterThan(ids.indexOf('t06')) // David's move survives
        expect(await converged(S, [daniel, david])).toBe(true)
    })
})

describe("(e/MCP) an MCP insert lands while the editor's add + drag is in flight", () => {
    const S = 'reproM'
    let daniel: Device
    let david: Device
    let newId: string
    beforeAll(async () => {
        ;({ daniel, david } = await devicePair(S, 10))
        newId = await addRowAtEnd(daniel, S, 'Daniel new')
        await daniel.idle()
        await waitFor(async () => (await daniel.cache(S)).some((r) => r.id === newId))
        daniel.pause()
        await dragRow(daniel, S, newId, `${S}-t05`)
        await addTrack(await adminDb(), { setlistId: S, type: 'song', title: 'MCP row', position: 3 })
        daniel.resume()
        await daniel.idle()
    }, HOOK_MS)
    afterAll(async () => {
        await daniel?.shutdown()
        await david?.shutdown()
    })

    it("the editor's move and the MCP insert both survive on one contiguous order; nothing is left queued", async () => {
        const srv = await serverRows(S)
        expect(srv).toHaveLength(12)
        expect(isPermutation(srv.map((r) => r.order))).toBe(true)
        expect(srv.some((r) => r.title === 'MCP row')).toBe(true)
        const ids = srv.map((r) => r.id)
        expect(ids.indexOf(newId)).toBe(ids.indexOf(`${S}-t04`) + 1) // where Daniel dropped it
        expect(await daniel.intents(S)).toEqual([])
        expect(await converged(S, [daniel, david])).toBe(true)
    })
})

// ─────────────────────────────────────────────────────────────────────────
describe('(b) the save indicator never pins "saving"', () => {
    const S = 'reproB'
    let daniel: Device
    let david: Device
    beforeAll(async () => {
        ;({ daniel, david } = await devicePair(S, 4))
        daniel.pause()
        await editField(daniel, S, `${S}-t01`, { title: 'Daniel title' })
        await editField(david, S, `${S}-t01`, { title: 'David title' })
        await david.idle()
        daniel.resume()
        await daniel.idle()
    }, HOOK_MS)
    afterAll(async () => {
        await daniel?.shutdown()
        await david?.shutdown()
    })

    it('with nothing in flight it shows the refused change, and still does seconds later', async () => {
        const f = await daniel.freshness(S)
        expect(f.state).toBe('refused')
        expect(f.saving).toBe(0)
        expect(f.refused.map((r) => [r.reason, r.field])).toEqual([['field', 'title']])
        await sleep(3000)
        expect((await daniel.freshness(S)).state).toBe('refused')
        // David's value stands; Daniel's screen shows it (the refused edit no longer masks it).
        expect((await serverRows(S))[1].title).toBe('David title')
        expect(await waitFor(async () => (await daniel.view(S))[1].title === 'David title')).toBe(true)
    })

    it('"Try again" sends it over the other value; then the indicator is current', async () => {
        const [refused] = (await daniel.intents(S)).filter((i) => i.status === 'refused')
        await daniel.runtime.getOpsClient().retry(refused.localId!)
        await daniel.idle()
        expect((await serverRows(S))[1].title).toBe('Daniel title')
        expect((await daniel.freshness(S)).state).toBe('current')
    })
})

// ─────────────────────────────────────────────────────────────────────────
describe('(d) receivers go straight from the old order to the new one', () => {
    const S = 'reproD'
    let daniel: Device
    let david: Device
    let frames: string[] = []
    let snapshots = 0
    beforeAll(async () => {
        ;({ daniel, david } = await devicePair(S, 10))
        await sleep(300)
        daniel.seenOrders.length = 0
        // Count the tracks snapshots Daniel's device receives for the drag.
        const { onSnapshot, query, collection, where } = await import('firebase/firestore')
        const unsub = onSnapshot(
            query(collection(daniel.fs, 'tracks'), where('orgId', '==', 'crc'), where('setlistId', '==', S)),
            (snap) => {
                if (!snap.metadata.fromCache && snap.docChanges().length > 0) snapshots++
            },
        )
        await sleep(500)
        snapshots = 0
        // David drags the last row to the top: ONE move op.
        await dragRow(david, S, `${S}-t09`, `${S}-t00`)
        await david.idle()
        await sleep(1500)
        unsub()
        frames = daniel.seenOrders.slice()
    }, HOOK_MS)
    afterAll(async () => {
        await daniel?.shutdown()
        await david?.shutdown()
    })

    it('a reorder reaches the second client as ONE snapshot', () => {
        expect(snapshots).toBe(1)
    })

    it("the receiver's screen goes straight from the old order to the new one", () => {
        expect(frames.length).toBeLessThanOrEqual(2)
        expect(frames[frames.length - 1]?.split(',')[0]).toBe(`${S}-t09`)
    })
})

// ─────────────────────────────────────────────────────────────────────────
describe('PR 3 migration: the old outbox converts to intents on first load', () => {
    const S = 'reproMig'
    let daniel: Device
    let t04Stamp = 0
    let oldTabWrite = ''
    beforeAll(async () => {
        await seedSetlist(S, 5)
        // t03 is gone from the server, but Daniel's old tab queued an edit to it.
        await (await adminDb()).collection('tracks').doc(`${S}-t03`).delete()
        daniel = await makeDevice('daniel', DANIEL.uid, DANIEL.claims)
        const now = Date.now()
        const t04Snap = await (await adminDb()).collection('tracks').doc(`${S}-t04`).get()
        t04Stamp = (t04Snap.get('updatedAt') as { toMillis: () => number }).toMillis()
        // The old tab's listener had delivered `gone` once (its edit log says so).
        await daniel.db.edit_log.add({ ts: now - 60_000, source: 'snapshot-listener', collection: 'tracks', docId: `${S}-gone`, outcome: 'applied' })
        // An old tab's direct write is refused by the rules now; it would sit
        // in that tab's outbox as a failed row, which is what the rows below are.
        oldTabWrite = await setDoc(doc(daniel.fs, 'tracks', `${S}-oldtab`), { setlistId: S, orgId: 'crc', title: 'x', order: 9 })
            .then(() => 'written')
            .catch((e: { code?: string }) => e.code ?? 'error')
        // The old cache: his failed duplicate sits after t01; t03 is still shown.
        await daniel.db.tracks.bulkPut([
            ...[0, 1, 2, 3, 4].map((i) => ({ id: `${S}-t0${i}`, setlistId: S, order: i < 2 ? i : i + 1, title: `Song ${i}`, updatedAt: 1 })),
            { id: `${S}-dup`, setlistId: S, order: 2, title: 'Song 1', updatedAt: 1 },
        ])
        await daniel.db.outbox.bulkAdd([
            // A create that dead-lettered on `{bpm: undefined}`.
            { status: 'failed', scheduledFor: now, op: 'set', collection: 'tracks', docId: `${S}-dup`, attempts: 5, createdAt: now,
              payload: { id: `${S}-dup`, setlistId: S, order: 2, title: 'Song 1', type: 'song', bpm: undefined, version: 1, updatedAt: 1 } },
            // An edit to a row the server has since removed.
            { status: 'pending', scheduledFor: now, op: 'update', collection: 'tracks', docId: `${S}-t03`, attempts: 0, createdAt: now,
              payload: { key: 'G' }, expectedUpdatedAt: 1 },
            // An old tab re-`set` a row the server still has, from the copy it
            // had at t04's current stamp: it becomes an edit, never dropped.
            { status: 'failed', scheduledFor: now, op: 'set', collection: 'tracks', docId: `${S}-t04`, attempts: 5, createdAt: now,
              payload: { id: `${S}-t04`, setlistId: S, order: 5, title: 'Song 4 (old tab)', type: 'song', updatedAt: t04Stamp } },
            // A create of a row the old listener had seen on the server, removed since.
            { status: 'pending', scheduledFor: now, op: 'set', collection: 'tracks', docId: `${S}-gone`, attempts: 0, createdAt: now,
              payload: { id: `${S}-gone`, setlistId: S, order: 6, title: 'Removed elsewhere', type: 'song' } },
            // A songs row stays in the outbox.
            { status: 'pending', scheduledFor: now, op: 'update', collection: 'songs', docId: 'song-x', attempts: 0, createdAt: now,
              payload: { defaults: { key: 'G' } } },
        ] as never)
        await daniel.db.tombstones.put({ collection: 'tracks', docId: `${S}-zz`, deletedAt: now })
        await daniel.boot()
        await daniel.idle()
        daniel.startListener(S)
    }, HOOK_MS)
    afterAll(async () => {
        await daniel?.shutdown()
    })

    it('the failed create lands where the old cache had it', async () => {
        const srv = await serverRows(S)
        expect(srv.map((r) => r.id.replace(/^.*-/, ''))).toEqual(['t00', 't01', 'dup', 't02', 't04'])
        expect(isPermutation(srv.map((r) => r.order))).toBe(true)
        expect(srv[2]).not.toHaveProperty('bpm')
    })

    it('the edit to the server-deleted row, and a create of a row removed since, land in the refused list (Discard only); nothing is resurrected', async () => {
        const f = await daniel.freshness(S)
        expect(f.refused.map((r) => [r.reason, r.canRetry])).toEqual([
            ['row-gone', false],
            ['row-gone', false],
        ])
        expect((await serverRows(S)).map((r) => r.id)).not.toContain(`${S}-gone`)
    })

    it("an old tab's re-set of a row the server still has becomes an edit of it (never dropped)", async () => {
        const t04 = (await serverRows(S)).find((r) => r.id === `${S}-t04`)!
        expect(t04.title).toBe('Song 4 (old tab)')
    })

    it("the rules refuse an old tab's direct write now (it would be a failed outbox row, converted as above)", () => {
        expect(oldTabWrite).toBe('permission-denied')
    })

    it('the converted outbox rows and the tracks tombstones are gone; other collections keep theirs', async () => {
        const left = await daniel.db.outbox.toArray()
        expect(left.map((r) => r.collection)).toEqual(['songs'])
        expect(await daniel.db.tombstones.count()).toBe(0)
    })

    it('the ghost row t03 is pruned from the editor by the first live set', async () => {
        expect(await waitFor(async () => !(await daniel.view(S)).some((r) => r.id === `${S}-t03`))).toBe(true)
        expect(seq(await daniel.view(S))).toBe(seq(await serverRows(S)))
    })
})
