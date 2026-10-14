// @vitest-environment node
/**
 * P9 — independent adversarial pass over firestore.rules + storage.rules.
 *
 * Written without reading any existing rules test, on purpose: the point is to
 * re-derive the attack surface from the rules text rather than inherit the
 * assumptions the existing suites encode.
 *
 * Every `assertFails` below is the assertion that SHOULD hold for a
 * multi-tenant system. Where one of them fails, that is a finding, not a bad
 * test — the test stays, asserting the behaviour we want.
 *
 * Tenants: A = crc, B = brotherslazaroff, N = navatehila.
 */
import { readFileSync } from 'fs'
import { resolve } from 'path'
import {
    assertFails,
    assertSucceeds,
    initializeTestEnvironment,
    type RulesTestEnvironment,
} from '@firebase/rules-unit-testing'
import {
    collection,
    deleteDoc,
    doc,
    getDoc,
    getDocs,
    limit as qLimit,
    query,
    setDoc,
    updateDoc,
    where,
} from 'firebase/firestore'
import { getMetadata, ref, uploadBytes } from 'firebase/storage'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const A = 'crc'
const B = 'brotherslazaroff'
const N = 'navatehila'

let env: RulesTestEnvironment

// ── personas ──────────────────────────────────────────────────────────────
const p = {
    po: { uid: 'u-po', token: { po: true } },
    aAd: { uid: 'u-aAd', token: { m: { [A]: 'ad' } } },
    aBl: { uid: 'u-aBl', token: { m: { [A]: 'bl' } } },
    aMu: { uid: 'u-aMu', token: { m: { [A]: 'mu' } } },
    aMe: { uid: 'u-aMe', token: { m: { [A]: 'me' } } },
    aPe: { uid: 'u-aPe', token: { m: { [A]: 'pe' } } },
    bAd: { uid: 'u-bAd', token: { m: { [B]: 'ad' } } },
    nAd: { uid: 'u-nAd', token: { m: { [N]: 'ad' } } },
    nMe: { uid: 'u-nMe', token: { m: { [N]: 'me' } } },
    claimless: { uid: 'u-claimless', token: {} },
    legacyAdminA: { uid: 'u-legacyA', token: { role: 'admin' } },
    legacyAdminN: { uid: 'u-legacyN', token: { role: 'admin', orgIds: [N] } },
    legacyMemberA: { uid: 'u-legacyMe', token: { role: 'member', orgIds: [A] } },
    // Firebase uids are server-minted, but nothing in the rules escapes the uid
    // before interpolating it into a regex. A uid of `.*` is the probe.
    regexUid: { uid: '.*', token: { m: { [A]: 'me' } } },
}
type Persona = { uid: string; token: Record<string, unknown> }

const fs_ = (who: Persona) => env.authenticatedContext(who.uid, who.token).firestore()
const st_ = (who: Persona) => env.authenticatedContext(who.uid, who.token).storage()
const fsAnon = () => env.unauthenticatedContext().firestore()
const stAnon = () => env.unauthenticatedContext().storage()

beforeAll(async () => {
    const root = resolve(__dirname, '../../..')
    env = await initializeTestEnvironment({
        // A demo- id of its own, like every other rules suite: the Storage
        // emulator holds one rules set and one bucket per project, and two
        // Storage suites sharing a bucket race on clearStorage().
        projectId: 'demo-p9-adversarial',
        firestore: {
            rules: readFileSync(resolve(root, 'firestore.rules'), 'utf8'),
            host: '127.0.0.1',
            port: 8080,
        },
        storage: {
            rules: readFileSync(resolve(root, 'storage.rules'), 'utf8'),
            host: '127.0.0.1',
            port: 9199,
        },
    })

    await env.clearFirestore()

    await env.withSecurityRulesDisabled(async (ctx) => {
        const db = ctx.firestore()
        const set = (path: string, data: Record<string, unknown>) =>
            setDoc(doc(db, path), data)

        // setlists + subcollections
        await set(`setlists/sl-crc`, { orgId: A, ownerId: p.aBl.uid, name: 'CRC Shabbat' })
        await set(`setlists/sl-nava`, { orgId: N, ownerId: p.nAd.uid, name: 'Nava service' })
        await set(`setlists/sl-bl`, { orgId: B, ownerId: p.bAd.uid, name: 'BL gig' })
        await set(`setlists/sl-nava/history/h1`, { orgId: N, at: 1, by: p.nAd.uid })
        await set(`setlists/sl-nava/emailEvents/e1`, { to: 'nava@example.org' })
        await set(`setlists/sl-nava/performance/overrides`, {
            rows: { r1: 'x' },
            eventDay: '2026-10-13',
            rev: 1,
            updatedAt: 1,
            updatedBy: p.nAd.uid,
        })
        await set(`setlists/sl-nava/performedDeviations/d1`, {
            rowId: 'r1', kind: 'swap', at: 1, by: p.nAd.uid, eventDay: '2026-10-13', rev: 1,
        })

        // tracks
        await set(`tracks/tr-crc`, { setlistId: 'sl-crc', orgId: A, title: 'CRC row' })
        await set(`tracks/tr-nava`, { setlistId: 'sl-nava', orgId: N, title: 'Nava row', notes: 'private' })
        await set(`tracks/tr-nava-unstamped`, { setlistId: 'sl-nava', title: 'Nava unstamped' })

        // catalogue
        await set(`songs/song-crc`, { orgId: A, title: 'CRC song', visibleToOrgs: [A] })
        await set(`songs/song-nava`, { orgId: N, title: 'Nava song', visibleToOrgs: [N] })
        await set(`songs/song-nava-unstamped`, { title: 'Nava song, unstamped' })
        await set(`songs/song-shared`, { orgId: B, title: 'Shared', visibleToOrgs: [B, A] })
        await set(`library_index/li-nava`, { orgId: N, name: 'Nava chart', visibleToOrgs: [N] })
        await set(`library_index/li-nava-unstamped`, { name: 'Nava chart, unstamped' })
        // Seeded the way every writer now writes it: no fileId, no uid.
        await set(`library_signals/latest`, { at: 'now', op: 'upload' })
        await set(`recordings/rec-nava`, { orgId: N, songId: 's1' })
        await set(`recordings/rec-unstamped`, { songId: 's1' })
        await set(`songUsage/su-nava`, { orgId: N, count: 3 })
        await set(`songUsage/su-nava/events/ev1`, { at: 1 })

        // authoring
        await set(`contacts/ct-nava`, { orgId: N, name: 'Nava contact', email: 'x@y.z' })
        await set(`templates/${N}__key1`, { orgId: N, name: 'Nava template' })
        await set(`templates/legacyNavaKey`, { orgId: N, name: 'Nava template, bare id' })
        await set(`templates/legacyNavaKey2`, { orgId: N, name: 'Nava template, bare id 2' })
        await set(`templates/${A}__key1`, { orgId: A, name: 'CRC template' })
        await set(`setlistTemplates/st-nava`, { orgId: N, name: 'N' })
        await set(`bond_flags/bf-nava`, { orgId: N })
        await set(`proposal_stages/ps-nava`, { orgId: N })
        await set(`tasks/task-nava`, { orgId: N, assigneeId: 'u-nSomeone' })
        await set(`live_sessions/ls-nava`, { orgId: N, broadcasterId: p.nAd.uid })
        await set(`publicSetlists/ps-nava`, { orgId: N, name: 'Nava' })

        // scheduling
        await set(`scheduling_assignments/sa-nava`, { orgId: N, musicianUid: 'u-nMusician' })
        await set(`musician_availability/ma-nava`, { orgId: N, musicianUid: 'u-nMusician' })
        await set(`scheduling_history/sh-nava`, { orgId: N })
        await set(`auditLogs/al-nava`, { orgId: N, timestamp: 1 })

        // platform / collections / memberships
        await set(`collections/col-nava`, { ownerOrgId: N, sharedWith: [], assignedTo: [], name: 'Nava core' })
        await set(`collections/col-shared`, { ownerOrgId: B, sharedWith: [A], assignedTo: [], name: 'Shared' })
        await set(`memberships/${N}__u-nVictim`, { tenantId: N, uid: 'u-nVictim', role: 'ad' })
        await set(`memberships/${A}__${p.aBl.uid}`, { tenantId: A, uid: p.aBl.uid, role: 'bl' })
        await set(`invites/i1`, { tenantId: N, tokenHash: 'deadbeef' })
        await set(`platform/owners`, { uids: [p.po.uid] })
        await set(`platformAudit/pa1`, { at: 1 })
        await set(`orgs/${N}`, { name: 'Nava Tehila' })
        await set(`mcpTokens/t1`, { hash: 'x' })
        await set(`backups/b1`, { at: 1 })
        await set(`aiSpend/s1`, { usd: 1 })

        // config / system / mixer
        await set(`config/congregation`, { name: 'CRC' })
        await set(`config/congregation__${N}`, { name: 'Nava Tehila' })
        await set(`config/defaults`, { shabbat: 'sl-crc' })
        await set(`config/defaults__${N}`, { shabbat: 'sl-nava' })
        await set(`config/monitor`, { bridge: 'x' })
        await set(`system/globalAlert`, { text: '' })
        await set(`monitor-live/state`, { buses: [] })
        await set(`monitor-live/commands/acks/ack1`, { uid: p.aMu.uid })

        // users
        await set(`users/u-nVictim`, { uid: 'u-nVictim', email: 'victim@nava.org', role: 'admin' })

        // Storage
        const s = ctx.storage()
        const bytes = new Uint8Array([1, 2, 3, 4])
        await uploadBytes(ref(s, 'library/p9-crc.pdf'), bytes, { customMetadata: { orgId: A } })
        await uploadBytes(ref(s, 'library/p9-nava.pdf'), bytes, { customMetadata: { orgId: N } })
        await uploadBytes(ref(s, 'library/p9-legacy.pdf'), bytes)
        await uploadBytes(ref(s, 'library/p9-empty-org.pdf'), bytes, { customMetadata: { orgId: '' } })
        await uploadBytes(ref(s, 'library/p9-shared.pdf'), bytes, {
            customMetadata: { orgId: B, visibleTo: `${B},${A}` },
        })
        await uploadBytes(ref(s, 'private/secret.pdf'), bytes, { customMetadata: { orgId: N } })
    })
}, 120_000)

afterAll(async () => {
    if (env) await env.cleanup()
})

// ───────────────────────────────────────────────────────────────────────────
describe('positive controls (these MUST pass or the suite proves nothing)', () => {
    it('crc band_leader lists its own setlists', async () => {
        await assertSucceeds(
            getDocs(query(collection(fs_(p.aBl), 'setlists'), where('orgId', '==', A))),
        )
    })
    it('crc member lists its own songs', async () => {
        await assertSucceeds(
            getDocs(query(collection(fs_(p.aMe), 'songs'), where('orgId', '==', A))),
        )
    })
    it('crc member reads a song deliberately shared via visibleToOrgs', async () => {
        await assertSucceeds(getDoc(doc(fs_(p.aMe), 'songs/song-shared')))
    })
    it('crc member reads a Storage chart deliberately shared via visibleTo', async () => {
        await assertSucceeds(getMetadata(ref(st_(p.aMe), 'library/p9-shared.pdf')))
    })
    it('platform owner may list users', async () => {
        await assertSucceeds(getDocs(collection(fs_(p.po), 'users')))
    })
})

// ───────────────────────────────────────────────────────────────────────────
describe('tracks — the content of every tenant\'s setlists', () => {
    it('a navatehila admin cannot dump every tenant\'s tracks unfiltered', async () => {
        await assertFails(getDocs(collection(fs_(p.nAd), 'tracks')))
    })
    it('a crc member cannot dump every tenant\'s tracks unfiltered', async () => {
        await assertFails(getDocs(collection(fs_(p.aMe), 'tracks')))
    })
    it('a claimless signed-in user cannot dump every tenant\'s tracks', async () => {
        await assertFails(getDocs(collection(fs_(p.claimless), 'tracks')))
    })
    it('a crc pending user cannot dump every tenant\'s tracks', async () => {
        await assertFails(getDocs(collection(fs_(p.aPe), 'tracks')))
    })
    it('a crc admin cannot list the tracks of a navatehila setlist', async () => {
        await assertFails(
            getDocs(query(collection(fs_(p.aAd), 'tracks'), where('setlistId', '==', 'sl-nava'))),
        )
    })
    // Decided the other way, and deliberately: R-0919-audit-2 says a single
    // get on a setlist or a track stays public, because an anonymous /perform
    // link carries a setlist id and a musician who cannot open the chart they
    // are playing is a service-block. What that ruling did NOT grant is the
    // enumeration above, which is why list is now tenant-scoped.
    it('a signed-out client may still read ONE track by id (R-0919-audit-2)', async () => {
        await assertSucceeds(getDoc(doc(fsAnon(), 'tracks/tr-nava')))
    })
    it('a crc band_leader cannot delete a navatehila track', async () => {
        await assertFails(deleteDoc(doc(fs_(p.aBl), 'tracks/tr-nava')))
    })
    it('a crc band_leader cannot delete an UNSTAMPED navatehila track', async () => {
        await assertFails(deleteDoc(doc(fs_(p.aBl), 'tracks/tr-nava-unstamped')))
    })
    it('a crc band_leader cannot create a track on a navatehila setlist', async () => {
        await assertFails(
            setDoc(doc(fs_(p.aBl), 'tracks/evil-1'), { setlistId: 'sl-nava', orgId: N, title: 'x' }),
        )
    })
    it('a crc band_leader cannot create an unstamped track on a navatehila setlist', async () => {
        await assertFails(
            setDoc(doc(fs_(p.aBl), 'tracks/evil-2'), { setlistId: 'sl-nava', title: 'x' }),
        )
    })
    it('a crc band_leader cannot re-parent a crc track onto a navatehila setlist', async () => {
        await assertFails(
            updateDoc(doc(fs_(p.aBl), 'tracks/tr-crc'), { setlistId: 'sl-nava' }),
        )
    })
})

// ───────────────────────────────────────────────────────────────────────────
describe('setlists', () => {
    it('a navatehila member cannot list setlists unfiltered', async () => {
        await assertFails(getDocs(collection(fs_(p.nMe), 'setlists')))
    })
    it('a navatehila member cannot list crc setlists', async () => {
        await assertFails(
            getDocs(query(collection(fs_(p.nMe), 'setlists'), where('orgId', '==', A))),
        )
    })
    it('a claimless signed-in user cannot list setlists', async () => {
        await assertFails(getDocs(collection(fs_(p.claimless), 'setlists')))
    })
    it('a crc member cannot create a setlist stamped navatehila', async () => {
        await assertFails(
            setDoc(doc(fs_(p.aMe), 'setlists/evil-sl'), { orgId: N, ownerId: p.aMe.uid, name: 'x' }),
        )
    })
    it('a crc band_leader cannot update a navatehila setlist', async () => {
        await assertFails(updateDoc(doc(fs_(p.aBl), 'setlists/sl-nava'), { name: 'pwned' }))
    })
    it('a crc admin cannot delete a navatehila setlist', async () => {
        await assertFails(deleteDoc(doc(fs_(p.aAd), 'setlists/sl-nava')))
    })
    it('a crc admin cannot read navatehila setlist history', async () => {
        await assertFails(getDocs(collection(fs_(p.aAd), 'setlists/sl-nava/history')))
    })
    it('a crc admin cannot read navatehila setlist emailEvents', async () => {
        await assertFails(getDocs(collection(fs_(p.aAd), 'setlists/sl-nava/emailEvents')))
    })
    it('a crc band_leader cannot write a navatehila setlist history entry', async () => {
        await assertFails(
            setDoc(doc(fs_(p.aBl), 'setlists/sl-nava/history/evil'), { at: 1, by: p.aBl.uid }),
        )
    })
    it('a crc band_leader cannot read navatehila performedDeviations', async () => {
        await assertFails(getDocs(collection(fs_(p.aBl), 'setlists/sl-nava/performedDeviations')))
    })
    it('a navatehila admin cannot read a crc setlist\'s performance overrides', async () => {
        await assertFails(getDoc(doc(fs_(p.nAd), 'setlists/sl-crc/performance/overrides')))
    })
    it('a claimless signed-in user cannot read a navatehila setlist\'s overrides', async () => {
        await assertFails(getDoc(doc(fs_(p.claimless), 'setlists/sl-nava/performance/overrides')))
    })
    it('a crc band_leader cannot write a navatehila setlist\'s overrides', async () => {
        await assertFails(
            updateDoc(doc(fs_(p.aBl), 'setlists/sl-nava/performance/overrides'), {
                rows: {}, eventDay: '2026-10-14', rev: 2, updatedAt: 2, updatedBy: p.aBl.uid,
            }),
        )
    })
})

// ───────────────────────────────────────────────────────────────────────────
describe('catalogue — songs, library_index, recordings, songUsage', () => {
    it('crc member cannot list songs unfiltered', async () => {
        await assertFails(getDocs(collection(fs_(p.aMe), 'songs')))
    })
    it('crc member cannot list navatehila songs', async () => {
        await assertFails(
            getDocs(query(collection(fs_(p.aMe), 'songs'), where('orgId', '==', N))),
        )
    })
    it('crc member cannot claim navatehila visibility on a shared-chart query', async () => {
        await assertFails(
            getDocs(query(collection(fs_(p.aMe), 'songs'),
                where('visibleToOrgs', 'array-contains', N))),
        )
    })
    it('crc member cannot get a navatehila song', async () => {
        await assertFails(getDoc(doc(fs_(p.aMe), 'songs/song-nava')))
    })
    // An unstamped row reads as crc on purpose (`docOrg()`): the standing
    // rule is to err public rather than risk gating a musician out of
    // something they need. Destroying one on that guess is a different
    // matter, and no longer allowed — see the delete cases below.
    // Production carries no unstamped rows in any collection.
    it('crc member may still GET an unstamped song (err-public default)', async () => {
        await assertSucceeds(getDoc(doc(fs_(p.aMe), 'songs/song-nava-unstamped')))
    })
    it('crc band_leader cannot update a navatehila song', async () => {
        await assertFails(updateDoc(doc(fs_(p.aBl), 'songs/song-nava'), { title: 'pwned' }))
    })
    it('crc band_leader cannot delete a navatehila song', async () => {
        await assertFails(deleteDoc(doc(fs_(p.aBl), 'songs/song-nava')))
    })
    it('crc band_leader cannot delete an UNSTAMPED song', async () => {
        await assertFails(deleteDoc(doc(fs_(p.aBl), 'songs/song-nava-unstamped')))
    })
    it('crc member cannot get a navatehila library_index row', async () => {
        await assertFails(getDoc(doc(fs_(p.aMe), 'library_index/li-nava')))
    })
    it('crc member may still GET an unstamped library_index row (err-public default)', async () => {
        await assertSucceeds(getDoc(doc(fs_(p.aMe), 'library_index/li-nava-unstamped')))
    })
    it('crc member cannot list library_index unfiltered', async () => {
        await assertFails(getDocs(collection(fs_(p.aMe), 'library_index')))
    })
    it('crc member cannot get a navatehila recording', async () => {
        await assertFails(getDoc(doc(fs_(p.aMe), 'recordings/rec-nava')))
    })
    it('crc member may still GET an unstamped recording (err-public default)', async () => {
        await assertSucceeds(getDoc(doc(fs_(p.aMe), 'recordings/rec-unstamped')))
    })
    it('crc member cannot get navatehila songUsage', async () => {
        await assertFails(getDoc(doc(fs_(p.aMe), 'songUsage/su-nava')))
    })
    it('crc member cannot read navatehila songUsage events', async () => {
        await assertFails(getDocs(collection(fs_(p.aMe), 'songUsage/su-nava/events')))
    })
    // The singleton stays readable — it is how an open library tab knows to
    // refetch, and the listeners only look at `at`. What it carried was the
    // problem: the last fileId touched in ANY tenant and the uid that touched
    // it. Every writer now writes `{at, op}` and nothing else, so reading it
    // across tenants reveals that something changed somewhere, and no more.
    it('the global library_signals broadcast carries no tenant data', async () => {
        const snap = await assertSucceeds(getDoc(doc(fs_(p.nMe), 'library_signals/latest')))
        const data = (snap as { data(): Record<string, unknown> | undefined }).data() ?? {}
        expect(Object.keys(data).sort()).toEqual(['at', 'op'])
    })
})

// ───────────────────────────────────────────────────────────────────────────
describe('templates — tenant derived from the document id', () => {
    it('crc member cannot get a navatehila template', async () => {
        await assertFails(getDoc(doc(fs_(p.aMe), `templates/${N}__key1`)))
    })
    it('crc member cannot list templates unfiltered', async () => {
        await assertFails(getDocs(collection(fs_(p.aMe), 'templates')))
    })
    it('crc band_leader cannot create a navatehila-prefixed template', async () => {
        await assertFails(
            setDoc(doc(fs_(p.aBl), `templates/${N}__evil`), { orgId: N, name: 'x' }),
        )
    })
    it('crc band_leader cannot DELETE a navatehila template that has a bare document id', async () => {
        // templates delete reads templateOrgOfId(templateId) only; the stored
        // orgId ('navatehila') is never consulted.
        await assertFails(deleteDoc(doc(fs_(p.aBl), 'templates/legacyNavaKey')))
    })
    it('crc band_leader cannot OVERWRITE a navatehila template that has a bare document id', async () => {
        await assertFails(
            setDoc(doc(fs_(p.aBl), 'templates/legacyNavaKey2'), { orgId: A, name: 'stolen' }),
        )
    })
    it('crc band_leader cannot delete a navatehila setlistTemplate', async () => {
        await assertFails(deleteDoc(doc(fs_(p.aBl), 'setlistTemplates/st-nava')))
    })
    it('crc band_leader cannot list setlistTemplates unfiltered', async () => {
        await assertFails(getDocs(collection(fs_(p.aBl), 'setlistTemplates')))
    })
})

// ───────────────────────────────────────────────────────────────────────────
describe('authoring + scheduling collections', () => {
    const cases: Array<[string, string]> = [
        ['contacts', 'contacts/ct-nava'],
        ['bond_flags', 'bond_flags/bf-nava'],
        ['proposal_stages', 'proposal_stages/ps-nava'],
        ['tasks', 'tasks/task-nava'],
        ['live_sessions', 'live_sessions/ls-nava'],
        ['scheduling_assignments', 'scheduling_assignments/sa-nava'],
        ['musician_availability', 'musician_availability/ma-nava'],
        ['scheduling_history', 'scheduling_history/sh-nava'],
        ['auditLogs', 'auditLogs/al-nava'],
    ]
    for (const [name, path] of cases) {
        it(`crc admin cannot get the navatehila ${name} row`, async () => {
            await assertFails(getDoc(doc(fs_(p.aAd), path)))
        })
        it(`crc admin cannot list ${name} unfiltered`, async () => {
            await assertFails(getDocs(query(collection(fs_(p.aAd), name), qLimit(50))))
        })
        it(`crc admin cannot list ${name} filtered to navatehila`, async () => {
            await assertFails(
                getDocs(query(collection(fs_(p.aAd), name), where('orgId', '==', N))),
            )
        })
    }
    it('crc musician cannot create a live_session stamped navatehila', async () => {
        await assertFails(
            setDoc(doc(fs_(p.aMu), 'live_sessions/evil'), { orgId: N, broadcasterId: p.aMu.uid }),
        )
    })
    it('crc member cannot create availability stamped navatehila', async () => {
        await assertFails(
            setDoc(doc(fs_(p.aMe), 'musician_availability/evil'), {
                orgId: N, musicianUid: p.aMe.uid,
            }),
        )
    })
    it('crc band_leader cannot delete a navatehila contact', async () => {
        await assertFails(deleteDoc(doc(fs_(p.aBl), 'contacts/ct-nava')))
    })
})

// ───────────────────────────────────────────────────────────────────────────
describe('memberships, users, collections, platform', () => {
    it('crc admin cannot list navatehila memberships', async () => {
        await assertFails(
            getDocs(query(collection(fs_(p.aAd), 'memberships'), where('tenantId', '==', N))),
        )
    })
    it('crc admin cannot list memberships unfiltered', async () => {
        await assertFails(getDocs(collection(fs_(p.aAd), 'memberships')))
    })
    it('crc admin cannot get a navatehila membership', async () => {
        await assertFails(getDoc(doc(fs_(p.aAd), `memberships/${N}__u-nVictim`)))
    })
    it('a uid that is a regex metacharacter cannot read another tenant\'s membership', async () => {
        await assertFails(getDoc(doc(fs_(p.regexUid), `memberships/${N}__u-nVictim`)))
    })
    it('crc admin cannot read another user\'s profile', async () => {
        await assertFails(getDoc(doc(fs_(p.aAd), 'users/u-nVictim')))
    })
    it('crc admin cannot list users', async () => {
        await assertFails(getDocs(collection(fs_(p.aAd), 'users')))
    })
    it('a user cannot self-create with a foreign orgIds claim-shaped field', async () => {
        await assertFails(
            setDoc(doc(fs_(p.claimless), `users/${p.claimless.uid}`), {
                uid: p.claimless.uid, role: 'pending', orgIds: [N],
            }),
        )
    })
    it('crc member cannot list collections unfiltered', async () => {
        await assertFails(getDocs(collection(fs_(p.aMe), 'collections')))
    })
    it('crc member cannot list navatehila-owned collections', async () => {
        await assertFails(
            getDocs(query(collection(fs_(p.aMe), 'collections'), where('ownerOrgId', '==', N))),
        )
    })
    it('crc member cannot get an unshared navatehila collection', async () => {
        await assertFails(getDoc(doc(fs_(p.aMe), 'collections/col-nava')))
    })
    // get admits a pending member and list does not. Left as it is: the
    // err-public rule says the fix for an inconsistency like this is to widen
    // the narrow side, not to narrow the wide one, and `seenOrgs()` excluding
    // pending is load-bearing elsewhere. Recorded rather than changed.
    it('crc pending user may get a collection shared with crc, though list refuses it', async () => {
        await assertSucceeds(getDoc(doc(fs_(p.aPe), 'collections/col-shared')))
    })
    it('crc admin cannot read invites', async () => {
        await assertFails(getDoc(doc(fs_(p.aAd), 'invites/i1')))
    })
    it('crc admin cannot read platform docs', async () => {
        await assertFails(getDoc(doc(fs_(p.aAd), 'platform/owners')))
    })
    it('crc admin cannot read platformAudit', async () => {
        await assertFails(getDoc(doc(fs_(p.aAd), 'platformAudit/pa1')))
    })
    it('crc admin cannot read mcpTokens', async () => {
        await assertFails(getDoc(doc(fs_(p.aAd), 'mcpTokens/t1')))
    })
    it('crc admin cannot read backups or aiSpend', async () => {
        await assertFails(getDoc(doc(fs_(p.aAd), 'backups/b1')))
        await assertFails(getDoc(doc(fs_(p.aAd), 'aiSpend/s1')))
    })
    it('crc admin cannot write a membership', async () => {
        await assertFails(
            setDoc(doc(fs_(p.aAd), `memberships/${A}__evil`), { tenantId: A, uid: 'x', role: 'ad' }),
        )
    })
})

// ───────────────────────────────────────────────────────────────────────────
describe('config — tenant parsed out of the document id', () => {
    it('crc admin cannot write navatehila branding', async () => {
        await assertFails(setDoc(doc(fs_(p.aAd), `config/congregation__${N}`), { name: 'pwned' }))
    })
    it('crc admin cannot write navatehila defaults', async () => {
        await assertFails(setDoc(doc(fs_(p.aAd), `config/defaults__${N}`), { shabbat: 'sl-crc' }))
    })
    it('crc band_leader cannot write navatehila featured', async () => {
        await assertFails(setDoc(doc(fs_(p.aBl), `config/featured__${N}`), { x: 1 }))
    })
    it('navatehila admin cannot read crc defaults', async () => {
        await assertFails(getDoc(doc(fs_(p.nAd), 'config/defaults')))
    })
    it('navatehila admin cannot write the crc mixer config', async () => {
        await assertFails(setDoc(doc(fs_(p.nAd), 'config/monitor'), { bridge: 'pwned' }))
    })
    it('navatehila admin cannot read the crc mixer state', async () => {
        await assertFails(getDoc(doc(fs_(p.nAd), 'monitor-live/state')))
    })
    it('navatehila admin cannot queue a crc mixer command', async () => {
        await assertFails(
            setDoc(doc(fs_(p.nAd), 'monitor-live/commands/pending/c1'), {
                type: 'set_bus_master', uid: p.nAd.uid, createdAt: 1, busIndex: 0, value: 0.5,
            }),
        )
    })
    it('a crc admin cannot reach a navatehila doc via a non-matching config id shape', async () => {
        await assertFails(setDoc(doc(fs_(p.aAd), `config/defaults__${N}__x`), { x: 1 }))
    })
    it('a crc admin cannot write config/admins (retired)', async () => {
        await assertFails(setDoc(doc(fs_(p.aAd), 'config/admins'), { uids: [p.aAd.uid] }))
    })
})

// ───────────────────────────────────────────────────────────────────────────
describe('legacy / claimless tokens', () => {
    it('a legacy admin (role=admin, no orgIds => crc) cannot list navatehila songs', async () => {
        await assertFails(
            getDocs(query(collection(fs_(p.legacyAdminA), 'songs'), where('orgId', '==', N))),
        )
    })
    it('a legacy admin (crc) cannot read a navatehila chart in Storage', async () => {
        await assertFails(getMetadata(ref(st_(p.legacyAdminA), 'library/p9-nava.pdf')))
    })
    it('a legacy admin (crc) cannot delete a navatehila setlist', async () => {
        await assertFails(deleteDoc(doc(fs_(p.legacyAdminA), 'setlists/sl-nava')))
    })
    it('a legacy navatehila admin cannot read crc config/defaults', async () => {
        await assertFails(getDoc(doc(fs_(p.legacyAdminN), 'config/defaults')))
    })
    it('a legacy navatehila admin cannot read a crc chart in Storage', async () => {
        await assertFails(getMetadata(ref(st_(p.legacyAdminN), 'library/p9-crc.pdf')))
    })
    it('a legacy crc member cannot read a navatehila song', async () => {
        await assertFails(getDoc(doc(fs_(p.legacyMemberA), 'songs/song-nava')))
    })
    it('a claimless signed-in user cannot read any tenant song', async () => {
        await assertFails(getDoc(doc(fs_(p.claimless), 'songs/song-crc')))
        await assertFails(getDoc(doc(fs_(p.claimless), 'songs/song-nava')))
    })
    it('a claimless signed-in user cannot read any chart in Storage', async () => {
        await assertFails(getMetadata(ref(st_(p.claimless), 'library/p9-crc.pdf')))
    })
})

// ───────────────────────────────────────────────────────────────────────────
describe('Storage', () => {
    it('crc member cannot read a navatehila chart', async () => {
        await assertFails(getMetadata(ref(st_(p.aMe), 'library/p9-nava.pdf')))
    })
    it('navatehila member cannot read a crc chart', async () => {
        await assertFails(getMetadata(ref(st_(p.nMe), 'library/p9-crc.pdf')))
    })
    it('a signed-out client cannot read a chart', async () => {
        await assertFails(getMetadata(ref(stAnon(), 'library/p9-crc.pdf')))
    })
    // Missing metadata still means crc: objects older than the stamping have
    // none, and refusing them would take charts away from the people they
    // belong to. An orgId that is present but EMPTY is a different thing and
    // is now refused — that is the shape a `?? ''` bug produces.
    it('crc member may still read an object whose orgId metadata is MISSING (legacy)', async () => {
        await assertSucceeds(getMetadata(ref(st_(p.aMe), 'library/p9-legacy.pdf')))
    })
    it('crc member cannot read an object whose orgId metadata is EMPTY', async () => {
        await assertFails(getMetadata(ref(st_(p.aMe), 'library/p9-empty-org.pdf')))
    })
    it('navatehila member cannot read a chart shared only with crc', async () => {
        await assertFails(getMetadata(ref(st_(p.nMe), 'library/p9-shared.pdf')))
    })
    it('crc pending user cannot read a crc chart', async () => {
        await assertFails(getMetadata(ref(st_(p.aPe), 'library/p9-crc.pdf')))
    })
    it('crc admin cannot write into library/', async () => {
        await assertFails(
            uploadBytes(ref(st_(p.aAd), 'library/evil.pdf'), new Uint8Array([9]), {
                customMetadata: { orgId: A },
            }),
        )
    })
    it('crc admin cannot overwrite a navatehila chart', async () => {
        await assertFails(
            uploadBytes(ref(st_(p.aAd), 'library/p9-nava.pdf'), new Uint8Array([9])),
        )
    })
    it('crc admin cannot read outside library/', async () => {
        await assertFails(getMetadata(ref(st_(p.aAd), 'private/secret.pdf')))
    })
    it('platform owner-less persona cannot read outside library/ either', async () => {
        await assertFails(getMetadata(ref(st_(p.nAd), 'private/secret.pdf')))
    })
})

// ───────────────────────────────────────────────────────────────────────────
describe('deny-all fallback + unlisted paths', () => {
    it('an unlisted collection is denied', async () => {
        await assertFails(getDoc(doc(fs_(p.aAd), 'secretStuff/x')))
        await assertFails(setDoc(doc(fs_(p.aAd), 'secretStuff/x'), { a: 1 }))
    })
    it('an unlisted setlist subcollection is denied', async () => {
        await assertFails(getDocs(collection(fs_(p.aAd), 'setlists/sl-nava/somethingNew')))
    })
    it('a navatehila admin cannot list publicSetlists', async () => {
        await assertFails(getDocs(collection(fs_(p.nAd), 'publicSetlists')))
    })
    it('a navatehila admin cannot write system/globalAlert', async () => {
        await assertFails(setDoc(doc(fs_(p.nAd), 'system/globalAlert'), { text: 'pwned' }))
    })
})
