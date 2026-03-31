import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest'
import { makeReq } from '@/__tests__/api-test-helpers'
import { firebaseAdminMock, mockAuth, mockDoc, mockFirestore, mockUpdate, mockWhere } from '@/__tests__/mock-firebase-admin'

vi.mock('@/lib/firebase-admin', () => firebaseAdminMock)
vi.mock('@/lib/rate-limit', () => ({ checkRateLimit: vi.fn(() => null) }))
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }))

// Mock email/sms sending
vi.mock('@/lib/email-scheduling', () => ({ sendSchedulingEmail: vi.fn(() => Promise.resolve({ ok: true })) }))
vi.mock('@/lib/sms', () => ({ sendSchedulingAssignmentSMS: vi.fn(() => Promise.resolve({ ok: true })) }))

describe('POST /api/scheduling/assign', () => {
    let POST: (req: import('next/server').NextRequest) => Promise<Response>

    beforeAll(async () => {
        const mod = await import('@/app/api/scheduling/assign/route')
        POST = mod.POST
    })

    beforeEach(() => {
        vi.clearAllMocks()
        
        // Setup initial setlist doc mock inside the API route
        mockDoc.exists = true
        mockDoc.data = () => ({
            ownerId: 'leader-123',
            isPublic: false,
            name: 'Test Setlist',
            tracks: [],
            musicians: [
                { uid: 'musician-1', name: 'Alice', email: 'alice@test.com' }
            ],
            assignedUids: ['musician-1']
        })
    })

    it('injects assignedUids array when appending new musicians to a setlist', async () => {
        mockAuth('band_leader')

        const res = await POST(makeReq('/api/scheduling/assign', {
            method: 'POST',
            token: 'valid-token',
            body: {
                setlistId: 'setlist-123',
                setlistName: 'Test Setlist',
                musicians: [
                    { uid: 'musician-2', name: 'Bob', email: 'bob@test.com' }
                ]
            },
        }))

        expect(res.status).toBe(200)

        // The setlist musicians sync calls mockUpdate with the merged musicians + assignedUids
        const setlistUpdateCall = mockUpdate.mock.calls.find(
            (args: unknown[]) => {
                const data = args[0] as Record<string, unknown> | undefined
                return data && 'assignedUids' in data && 'musicians' in data
            }
        )
        expect(setlistUpdateCall).toBeDefined()
        const updateData = setlistUpdateCall![0] as Record<string, unknown>

        expect(updateData.assignedUids).toEqual(['musician-1', 'musician-2'])
        expect(updateData.musicians).toHaveLength(2)
        expect((updateData.musicians as Array<{ uid: string }>)[1].uid).toBe('musician-2')
    })
})
