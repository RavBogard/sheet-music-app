/**
 * v4.4 Phase 1 — Data-layer atomicity regression suite.
 *
 * Locks down the invariants from DL-001, DL-002, DL-003, DL-012, DL-013, DL-014:
 *  - Each scheduling handler mutates the assignment doc AND the parent setlist's
 *    musicians[] / assignedUids[] inside a SINGLE runTransaction.
 *  - The assign handler rebuilds the denormalized musicians[] from the
 *    canonical scheduling_assignments snapshot read inside the same tx
 *    (not from the request payload), preserving uid-less guest entries.
 *  - Re-invite after decline/cancel creates a fresh assignment.
 *  - Unassign rejects transitions from terminal states.
 *
 * The tests use ref-tagged doc mocks so `transaction.get(ref)` can route to
 * either the assignment, setlist, or active-assignments query snapshot.
 */
import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest'
import { makeReq } from '@/__tests__/api-test-helpers'

// ── Ref-tagged mock refs ──

const ASSIGNMENT_REF = (id = 'new-assignment') => ({ __kind: 'assignment' as const, id })
const SETLIST_REF = { __kind: 'setlist' as const }
const ACTIVE_QUERY = { __kind: 'activeQuery' as const }

// ── Per-test configurable state ──

type AssignmentDocLike = { exists: boolean; data: () => Record<string, unknown> | undefined }
type SetlistDocLike = { exists: boolean; data: () => Record<string, unknown> | undefined }
type ActiveDoc = { id: string; data: () => Record<string, unknown> }

let assignmentDoc: AssignmentDocLike = { exists: false, data: () => undefined }
let setlistDoc: SetlistDocLike = { exists: false, data: () => undefined }
let activeAssignments: ActiveDoc[] = []
let assignedDocIdCounter = 0

const mockAssignmentUpdate = vi.fn()
const mockSetlistUpdate = vi.fn()
const mockAssignmentSet = vi.fn()
const mockNotifAdd = vi.fn()
const mockUserGet = vi.fn()

// Track tx-local writes so tests can assert "this commit wrote both docs"
// within the SAME transaction.
let currentTxWrites: Array<{ kind: string; data: Record<string, unknown> }> = []
const txCommitLog: Array<Array<{ kind: string; data: Record<string, unknown> }>> = []

const mockFirestoreLocal = {
    collection: vi.fn((name: string) => {
        if (name === 'scheduling_assignments') {
            return {
                doc: vi.fn((id?: string) => {
                    const ref = ASSIGNMENT_REF(id ?? `generated-${++assignedDocIdCounter}`)
                    return Object.assign(ref, {
                        id: ref.id,
                        get: vi.fn(async () => assignmentDoc),
                        update: vi.fn((data: Record<string, unknown>) => mockAssignmentUpdate(ref, data)),
                    })
                }),
                where: vi.fn(() => ({
                    where: vi.fn(() => ACTIVE_QUERY),
                })),
            }
        }
        if (name === 'setlists') {
            return {
                doc: vi.fn(() => Object.assign({ ...SETLIST_REF }, {
                    get: vi.fn(async () => setlistDoc),
                })),
            }
        }
        if (name === 'users') {
            return {
                doc: vi.fn(() => ({
                    get: mockUserGet,
                    collection: vi.fn(() => ({
                        add: mockNotifAdd,
                    })),
                })),
            }
        }
        return { doc: vi.fn(() => ({ get: vi.fn(async () => ({ exists: false })) })) }
    }),
    runTransaction: vi.fn(async (fn: (t: unknown) => Promise<unknown>) => {
        currentTxWrites = []
        const transaction = {
            get: vi.fn(async (ref: { __kind: string }) => {
                if (ref.__kind === 'assignment') return assignmentDoc
                if (ref.__kind === 'setlist') return setlistDoc
                if (ref.__kind === 'activeQuery') {
                    return { docs: activeAssignments, empty: activeAssignments.length === 0 }
                }
                return { exists: false }
            }),
            update: vi.fn((ref: { __kind: string }, data: Record<string, unknown>) => {
                currentTxWrites.push({ kind: ref.__kind, data })
                if (ref.__kind === 'assignment') mockAssignmentUpdate(ref, data)
                if (ref.__kind === 'setlist') mockSetlistUpdate(ref, data)
            }),
            set: vi.fn((ref: { __kind: string }, data: Record<string, unknown>) => {
                currentTxWrites.push({ kind: `${ref.__kind}-set`, data })
                mockAssignmentSet(ref, data)
            }),
        }
        const result = await fn(transaction)
        txCommitLog.push([...currentTxWrites])
        return result
    }),
}

vi.mock('@/lib/firebase-admin', () => ({
    initAdmin: vi.fn().mockReturnValue(true),
    getFirestore: vi.fn(() => mockFirestoreLocal),
    verifyIdToken: vi.fn(),
}))

vi.mock('firebase-admin/firestore', () => ({
    FieldValue: {
        serverTimestamp: vi.fn(() => 'SERVER_TIMESTAMP'),
        arrayUnion: vi.fn((...args: unknown[]) => ({ _arrayUnion: args })),
    },
}))

vi.mock('@/lib/rate-limit', () => ({ checkRateLimit: vi.fn(() => null) }))
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }))
vi.mock('@/lib/email-scheduling', () => ({ sendSchedulingEmail: vi.fn(async () => ({ ok: true })) }))
vi.mock('@/lib/sms', () => ({
    sendSchedulingAssignmentSMS: vi.fn(async () => ({ ok: true })),
    sendSchedulingCancellationSMS: vi.fn(async () => ({ ok: true })),
}))
vi.mock('@/lib/push-send', () => ({ sendPushToUsers: vi.fn(async () => ({})) }))
vi.mock('@/lib/new-song-detector', () => ({ detectNewSongs: vi.fn(async () => []) }))
vi.mock('@/lib/constants', () => ({ BASE_URL: 'http://localhost:3000' }))
vi.mock('@/lib/firestore-helpers', () => ({ formatEventDate: vi.fn(() => '2026-03-15') }))

// ── Imports after mocks ──

import { verifyIdToken } from '@/lib/firebase-admin'
import type { NextRequest } from 'next/server'

function mockAuth(role: string, uid: string) {
    vi.mocked(verifyIdToken).mockResolvedValue({
        uid,
        email: `${uid}@example.com`,
        role,
        isAdmin: role === 'admin',
        isBandLeader: role === 'band_leader' || role === 'admin',
        isMusician: ['musician', 'band_leader', 'admin'].includes(role),
        isMember: true,
    } as never)
}

function resetState() {
    vi.clearAllMocks()
    mockUserGet.mockResolvedValue({
        exists: true,
        data: () => ({ musicianProfile: { notificationPreferences: {} }, displayName: 'Test User' }),
    })
    assignmentDoc = { exists: false, data: () => undefined }
    setlistDoc = { exists: false, data: () => undefined }
    activeAssignments = []
    currentTxWrites = []
    txCommitLog.length = 0
    assignedDocIdCounter = 0
}

// ── Handler imports (bound after mocks are installed) ──

let assignPOST: (req: NextRequest) => Promise<Response>
let respondPOST: (req: NextRequest) => Promise<Response>
let unassignPOST: (req: NextRequest) => Promise<Response>

beforeAll(async () => {
    assignPOST = (await import('@/app/api/scheduling/assign/route')).POST
    respondPOST = (await import('@/app/api/scheduling/respond/route')).POST
    unassignPOST = (await import('@/app/api/scheduling/unassign/route')).POST
})

describe('v4.4 Phase 1 — scheduling atomicity', () => {
    beforeEach(() => { resetState() })

    // AC-3, AC-7 ───────────────────────────────────────────────
    it('unassign_atomic_single_tx: assignment + setlist writes land in ONE transaction', async () => {
        mockAuth('band_leader', 'leader-1')
        assignmentDoc = {
            exists: true,
            data: () => ({
                status: 'confirmed',
                musicianUid: 'musician-1',
                musicianEmail: 'm1@example.com',
                setlistName: 'Shabbat',
                setlistId: 'sl-1',
            }),
        }
        setlistDoc = {
            exists: true,
            data: () => ({ musicians: [{ uid: 'musician-1' }, { uid: 'musician-2' }] }),
        }

        const res = await unassignPOST(makeReq('/api/scheduling/unassign', {
            method: 'POST', token: 'v', body: { assignmentId: 'a1' },
        }))

        expect(res.status).toBe(200)
        expect(txCommitLog).toHaveLength(1)
        const tx = txCommitLog[0]
        const kinds = tx.map(w => w.kind)
        expect(kinds).toContain('assignment')
        expect(kinds).toContain('setlist')
        const setlistWrite = tx.find(w => w.kind === 'setlist')!.data
        expect(setlistWrite.musicians).toEqual([{ uid: 'musician-2' }])
        expect(setlistWrite.assignedUids).toEqual(['musician-2'])
    })

    // AC-6 ─────────────────────────────────────────────────────
    it('unassign_rejects_terminal_transition: declined assignment cannot be cancelled', async () => {
        mockAuth('band_leader', 'leader-1')
        assignmentDoc = {
            exists: true,
            data: () => ({
                status: 'declined',
                musicianUid: 'musician-1',
                setlistId: 'sl-1',
                declineReason: 'out of town',
            }),
        }
        setlistDoc = { exists: true, data: () => ({ musicians: [] }) }

        const res = await unassignPOST(makeReq('/api/scheduling/unassign', {
            method: 'POST', token: 'v', body: { assignmentId: 'a1' },
        }))
        const json = await res.json()

        expect(res.status).toBe(400)
        expect(json.currentStatus).toBe('declined')
        // No writes happened — txCommitLog has an empty tx (the tx threw).
        expect(mockAssignmentUpdate).not.toHaveBeenCalled()
        expect(mockSetlistUpdate).not.toHaveBeenCalled()
    })

    // AC-2, AC-7 ───────────────────────────────────────────────
    it('decline_atomic_single_tx: respond(decline) writes both docs atomically', async () => {
        mockAuth('musician', 'musician-1')
        assignmentDoc = {
            exists: true,
            data: () => ({
                status: 'pending',
                musicianUid: 'musician-1',
                setlistId: 'sl-1',
                assignedBy: 'leader-1',
                musicianName: 'Alice',
                setlistName: 'Shabbat',
            }),
        }
        setlistDoc = {
            exists: true,
            data: () => ({ musicians: [{ uid: 'musician-1' }, { uid: 'musician-2' }] }),
        }

        const res = await respondPOST(makeReq('/api/scheduling/respond', {
            method: 'POST', token: 'v', body: { assignmentId: 'a1', action: 'decline', declineReason: 'travel' },
        }))

        expect(res.status).toBe(200)
        expect(txCommitLog).toHaveLength(1)
        const kinds = txCommitLog[0].map(w => w.kind)
        expect(kinds).toContain('assignment')
        expect(kinds).toContain('setlist')
        const setlistWrite = txCommitLog[0].find(w => w.kind === 'setlist')!.data
        expect(setlistWrite.musicians).toEqual([{ uid: 'musician-2' }])
        expect(setlistWrite.assignedUids).toEqual(['musician-2'])
        const assignmentWrite = txCommitLog[0].find(w => w.kind === 'assignment')!.data
        expect(assignmentWrite.status).toBe('declined')
        expect(assignmentWrite.declineReason).toBe('travel')
    })

    // AC-2 complement ──────────────────────────────────────────
    it('accept_does_not_touch_setlist: respond(accept) leaves setlist.musicians untouched', async () => {
        mockAuth('musician', 'musician-1')
        assignmentDoc = {
            exists: true,
            data: () => ({
                status: 'pending',
                musicianUid: 'musician-1',
                setlistId: 'sl-1',
                assignedBy: 'leader-1',
            }),
        }
        setlistDoc = {
            exists: true,
            data: () => ({ musicians: [{ uid: 'musician-1' }] }),
        }

        const res = await respondPOST(makeReq('/api/scheduling/respond', {
            method: 'POST', token: 'v', body: { assignmentId: 'a1', action: 'accept' },
        }))

        expect(res.status).toBe(200)
        expect(mockSetlistUpdate).not.toHaveBeenCalled()
        const tx = txCommitLog[0]
        const assignmentWrite = tx.find(w => w.kind === 'assignment')!.data
        expect(assignmentWrite.status).toBe('confirmed')
    })

    // AC-1 ─────────────────────────────────────────────────────
    it('assign_adds_musicians_and_rebuilds_denorm_from_canonical_source', async () => {
        mockAuth('band_leader', 'leader-1')
        activeAssignments = [{
            id: 'ax',
            data: () => ({
                musicianUid: 'A',
                musicianName: 'Alice',
                musicianEmail: 'a@example.com',
                instrument: 'piano', // canonical instrument from existing assignment
                status: 'confirmed',
            }),
        }]
        setlistDoc = {
            exists: true,
            data: () => ({ musicians: [{ uid: 'A', name: 'Alice', email: 'a@example.com', instrument: 'piano' }] }),
        }

        const res = await assignPOST(makeReq('/api/scheduling/assign', {
            method: 'POST', token: 'v',
            body: {
                setlistId: 'sl-1',
                setlistName: 'Shabbat',
                eventDate: '2026-03-15',
                // Payload claims Alice plays guitar — but canonical source says piano.
                musicians: [
                    { uid: 'A', name: 'Alice', email: 'a@example.com', instrument: 'guitar', schedulingTier: 'regular' as const },
                    { uid: 'B', name: 'Bob', email: 'b@example.com', instrument: 'drums', schedulingTier: 'regular' as const },
                ],
            },
        }))
        const json = await res.json()

        expect(res.status).toBe(200)
        expect(json.assigned).toBe(1) // only B created; A skipped as already_active
        // Exactly one tx.set call (for B)
        expect(mockAssignmentSet).toHaveBeenCalledTimes(1)

        // Setlist rebuild uses canonical Alice (piano) from activeAssignments,
        // not payload Alice (guitar).
        const lastSetlistWrite = txCommitLog.at(-1)!.find(w => w.kind === 'setlist')!.data
        const musicians = lastSetlistWrite.musicians as Array<{ uid: string; name: string; instrument: string | null }>
        const alice = musicians.find(m => m.uid === 'A')!
        const bob = musicians.find(m => m.uid === 'B')!
        expect(alice.instrument).toBe('piano')
        expect(bob.instrument).toBe('drums')
        expect(lastSetlistWrite.assignedUids).toEqual(expect.arrayContaining(['A', 'B']))
    })

    // AC-5 ─────────────────────────────────────────────────────
    it('assign_allows_reinvite_after_decline: terminal docs do not block new assignment', async () => {
        mockAuth('band_leader', 'leader-1')
        // A previously declined — NOT in activeAssignments (query filters status in pending/confirmed).
        activeAssignments = []
        setlistDoc = { exists: true, data: () => ({ musicians: [] }) }

        const res = await assignPOST(makeReq('/api/scheduling/assign', {
            method: 'POST', token: 'v',
            body: {
                setlistId: 'sl-1',
                setlistName: 'Shabbat',
                eventDate: '2026-03-15',
                musicians: [{ uid: 'A', name: 'Alice', email: 'a@example.com', schedulingTier: 'regular' as const }],
            },
        }))
        const json = await res.json()

        expect(res.status).toBe(200)
        expect(json.assigned).toBe(1)
        expect(mockAssignmentSet).toHaveBeenCalledTimes(1)
        const setData = (mockAssignmentSet.mock.calls[0] as unknown[])[1] as Record<string, unknown>
        expect(setData.status).toBe('pending')
        expect(setData.musicianUid).toBe('A')
    })

    // AC-5 complement ──────────────────────────────────────────
    it('assign_skips_already_active_with_error: response.errors surfaces the skip', async () => {
        mockAuth('band_leader', 'leader-1')
        activeAssignments = [{
            id: 'ax',
            data: () => ({ musicianUid: 'A', musicianName: 'Alice', status: 'pending' }),
        }]
        setlistDoc = { exists: true, data: () => ({ musicians: [{ uid: 'A' }] }) }

        const res = await assignPOST(makeReq('/api/scheduling/assign', {
            method: 'POST', token: 'v',
            body: {
                setlistId: 'sl-1',
                setlistName: 'Shabbat',
                musicians: [{ uid: 'A', name: 'Alice', email: 'a@example.com', schedulingTier: 'regular' as const }],
            },
        }))
        const json = await res.json()

        expect(json.assigned).toBe(0)
        expect(mockAssignmentSet).not.toHaveBeenCalled()
        expect(json.errors?.[0]).toMatch(/already has an active assignment/i)
    })

    // AC-4 (invariant form) ────────────────────────────────────
    it('concurrent_assign_decline_consistent_final_state: replay yields invariant denorm', async () => {
        // We can't truly interleave two transactions in this mock, but the
        // transaction-retry contract guarantees each tx sees the latest commit
        // on retry. Model that by running them SERIALLY, with the second tx's
        // pre-state equal to the first's post-state.

        // Step 1: assign M2 to a setlist that already has M1 confirmed.
        mockAuth('band_leader', 'leader-1')
        activeAssignments = [{
            id: 'aM1',
            data: () => ({ musicianUid: 'M1', musicianName: 'M1', musicianEmail: 'm1@example.com', instrument: null, status: 'confirmed' }),
        }]
        setlistDoc = {
            exists: true,
            data: () => ({ musicians: [{ uid: 'M1', name: 'M1', email: 'm1@example.com', instrument: null }] }),
        }
        await assignPOST(makeReq('/api/scheduling/assign', {
            method: 'POST', token: 'v',
            body: {
                setlistId: 'sl-1', setlistName: 'S',
                musicians: [{ uid: 'M2', name: 'M2', email: 'm2@example.com', schedulingTier: 'regular' as const }],
            },
        }))
        // After step 1 the tx wrote musicians=[M1, M2]. Model the post-state:
        const afterAssign = txCommitLog.at(-1)!.find(w => w.kind === 'setlist')!.data
            .musicians as Array<{ uid: string }>
        expect(afterAssign.map(m => m.uid).sort()).toEqual(['M1', 'M2'])

        // Step 2: M1 declines. The respond tx sees the post-assign state.
        resetState()
        mockAuth('musician', 'M1')
        assignmentDoc = {
            exists: true,
            data: () => ({
                status: 'pending',
                musicianUid: 'M1',
                setlistId: 'sl-1',
                assignedBy: 'leader-1',
            }),
        }
        setlistDoc = {
            exists: true,
            data: () => ({ musicians: [{ uid: 'M1' }, { uid: 'M2' }] }),
        }
        await respondPOST(makeReq('/api/scheduling/respond', {
            method: 'POST', token: 'v', body: { assignmentId: 'aM1', action: 'decline' },
        }))
        const afterDecline = txCommitLog.at(-1)!.find(w => w.kind === 'setlist')!.data
            .musicians as Array<{ uid: string }>
        expect(afterDecline.map(m => m.uid)).toEqual(['M2'])
    })

    // AC-4 variant ─────────────────────────────────────────────
    it('concurrent_unassigns_do_not_clobber: serial replay drops both', async () => {
        mockAuth('band_leader', 'leader-1')

        // First unassign of M1.
        assignmentDoc = {
            exists: true,
            data: () => ({ status: 'confirmed', musicianUid: 'M1', setlistId: 'sl-1' }),
        }
        setlistDoc = { exists: true, data: () => ({ musicians: [{ uid: 'M1' }, { uid: 'M2' }] }) }
        await unassignPOST(makeReq('/api/scheduling/unassign', {
            method: 'POST', token: 'v', body: { assignmentId: 'aM1' },
        }))
        const postFirst = txCommitLog.at(-1)!.find(w => w.kind === 'setlist')!.data
            .musicians as Array<{ uid: string }>
        expect(postFirst.map(m => m.uid)).toEqual(['M2'])

        // Second unassign of M2 — sees post-first state (tx retry semantics).
        resetState()
        mockAuth('band_leader', 'leader-1')
        assignmentDoc = {
            exists: true,
            data: () => ({ status: 'confirmed', musicianUid: 'M2', setlistId: 'sl-1' }),
        }
        setlistDoc = { exists: true, data: () => ({ musicians: [{ uid: 'M2' }] }) }
        await unassignPOST(makeReq('/api/scheduling/unassign', {
            method: 'POST', token: 'v', body: { assignmentId: 'aM2' },
        }))
        const postSecond = txCommitLog.at(-1)!.find(w => w.kind === 'setlist')!.data
            .musicians as Array<{ uid: string }>
        expect(postSecond).toEqual([])
    })

    // AC-1 edge: guest preservation ────────────────────────────
    it('assign_preserves_guest_entries: uid-less musicians survive the rebuild', async () => {
        mockAuth('band_leader', 'leader-1')
        activeAssignments = []
        setlistDoc = {
            exists: true,
            data: () => ({
                musicians: [
                    { name: 'Guest Star', email: 'guest@example.com' }, // no uid — library guest
                    { uid: 'existing', name: 'Existing', email: 'existing@example.com' },
                ],
            }),
        }

        await assignPOST(makeReq('/api/scheduling/assign', {
            method: 'POST', token: 'v',
            body: {
                setlistId: 'sl-1', setlistName: 'S',
                musicians: [{ uid: 'new', name: 'New', email: 'new@example.com', schedulingTier: 'regular' as const }],
            },
        }))

        const lastSetlistWrite = txCommitLog.at(-1)!.find(w => w.kind === 'setlist')!.data
        const musicians = lastSetlistWrite.musicians as Array<{ uid?: string; name: string }>
        // The canonical rebuild clears 'existing' because the activeAssignments
        // query is empty (nothing in pending/confirmed), then appends guests.
        // The new musician ('new') is added from the incoming payload.
        // Guest Star (uid-less) must survive verbatim.
        expect(musicians.some(m => !m.uid && m.name === 'Guest Star')).toBe(true)
        expect(musicians.some(m => m.uid === 'new')).toBe(true)
        expect((lastSetlistWrite.assignedUids as string[])).toEqual(['new'])
    })
})
