/**
 * DELETE /api/tasks/delete
 *
 * Auth: Admin or Band Leader
 * Logic:
 * 1. Hard deletes a task from the global tasks collection.
 */

import { NextRequest, NextResponse } from 'next/server'
import { withAuth } from '@/lib/api-auth'
import { initAdmin, getFirestore } from '@/lib/firebase-admin'
import { logger } from '@/lib/logger'

export async function DELETE(request: NextRequest) {
    try {
        const auth = await withAuth(request)
        if (auth instanceof NextResponse) return auth

        if (!auth.isAdmin && !auth.isBandLeader) {
            return NextResponse.json({ error: 'Unauthorized to delete tasks' }, { status: 403 })
        }

        const url = new URL(request.url)
        const taskId = url.searchParams.get('id')

        if (!taskId) {
            return NextResponse.json({ error: 'Missing taskId' }, { status: 400 })
        }

        initAdmin()
        const db = getFirestore()

        await db.collection('tasks').doc(taskId).delete()

        return NextResponse.json({ success: true })
    } catch (err) {
        logger.error('[Tasks] Error deleting task:', err)
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
    }
}
