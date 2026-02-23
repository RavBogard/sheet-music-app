/**
 * POST /api/tasks/create
 *
 * Auth: Admin or Band Leader
 * Logic:
 * 1. Validate payload (belongs to a setlist, has an assignee)
 * 2. Create the task doc in the top-level 'tasks' collection
 * 3. Trigger assignment email (fire-and-forget)
 */

import { NextRequest, NextResponse } from 'next/server'
import { withAuth } from '@/lib/api-auth'
import { initAdmin, getFirestore } from '@/lib/firebase-admin'
import { FieldValue, Timestamp } from 'firebase-admin/firestore'
import { sendTaskAssignmentEmail } from '@/lib/email'
import { logger } from '@/lib/logger'

export async function POST(request: NextRequest) {
    try {
        const auth = await withAuth(request)
        if (auth instanceof NextResponse) return auth

        if (!auth.isAdmin && !auth.isBandLeader) {
            return NextResponse.json({ error: 'Unauthorized to create tasks' }, { status: 403 })
        }

        const body = await request.json()
        const { setlistId, setlistName, eventDate, title, description, assigneeId, assigneeName, assigneeEmail, notifiedEmails } = body

        if (!setlistId || !title || !assigneeId || !assigneeName || !assigneeEmail) {
            return NextResponse.json({ error: 'Missing required task fields' }, { status: 400 })
        }

        initAdmin()
        const db = getFirestore()

        // Let Firestore generate the ID
        const taskRef = db.collection('tasks').doc()

        // Using Firestore Date or null for the sorting field
        const eDate = eventDate ? new Date(eventDate) : null

        const taskData = {
            id: taskRef.id,
            setlistId,
            setlistName,
            eventDate: eDate ? Timestamp.fromDate(eDate) : null,
            title,
            description: description || '',
            status: 'todo',
            assigneeId,
            assigneeName,
            assigneeEmail,
            createdBy: auth.uid,
            createdByName: auth.email?.split('@')[0] || 'Admin',
            createdAt: FieldValue.serverTimestamp(),
            completedAt: null,
            notifiedEmails: Array.isArray(notifiedEmails) ? notifiedEmails : []
        }

        await taskRef.set(taskData)

        // Fire-and-forget assignment email
        const origin = request.headers.get('origin') || request.headers.get('referer')?.replace(/\/[^/]*$/, '') || 'https://centralreform.live'
        const taskUrl = `${origin}/perform/setlist/${setlistId}`

        sendTaskAssignmentEmail({
            to: assigneeEmail,
            cc: taskData.notifiedEmails,
            recipientName: assigneeName,
            assignerName: taskData.createdByName,
            setlistName,
            taskTitle: title,
            taskDescription: description,
            taskUrl
        }).catch(err => {
            logger.warn('[Tasks] Failed to send assignment email natively. The task was still created.', err)
        })

        return NextResponse.json({ success: true, taskId: taskRef.id })
    } catch (err) {
        logger.error('[Tasks] Error creating task:', err)
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
    }
}
