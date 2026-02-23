/**
 * PATCH /api/tasks/update
 *
 * Auth: Admin, Band Leader, or the specific Assignee.
 * Logic:
 * 1. Validate payload and permissions
 * 2. Update task fields
 * 3. Log completion time
 * 4. If shifting to 'completed', fire completion email back to assigner.
 */

import { NextRequest, NextResponse } from 'next/server'
import { withAuth } from '@/lib/api-auth'
import { initAdmin, getFirestore } from '@/lib/firebase-admin'
import { FieldValue } from 'firebase-admin/firestore'
import { sendTaskCompletionEmail } from '@/lib/email'
import { logger } from '@/lib/logger'
import { SetlistTask } from '@/types/models'

export async function PATCH(request: NextRequest) {
    try {
        const auth = await withAuth(request)
        if (auth instanceof NextResponse) return auth

        const { taskId, updates } = await request.json()

        if (!taskId || !updates || Object.keys(updates).length === 0) {
            return NextResponse.json({ error: 'Missing taskId or updates' }, { status: 400 })
        }

        initAdmin()
        const db = getFirestore()
        const taskRef = db.collection('tasks').doc(taskId)
        const doc = await taskRef.get()

        if (!doc.exists) {
            return NextResponse.json({ error: 'Task not found' }, { status: 404 })
        }

        const taskData = doc.data() as SetlistTask

        // Validation Rules:
        // Admins/Leaders can update anything.
        // Standard users can ONLY update if they are the assignee.
        const isAdminOrLeader = auth.isAdmin || auth.isBandLeader
        const isAssignee = taskData.assigneeId === auth.uid

        if (!isAdminOrLeader && !isAssignee) {
            return NextResponse.json({ error: 'Unauthorized to edit this task' }, { status: 403 })
        }

        // Standard users cannot alter core metadata, only status
        const safeUpdates: any = {}

        if (isAdminOrLeader) {
            if (updates.title !== undefined) safeUpdates.title = updates.title
            if (updates.description !== undefined) safeUpdates.description = updates.description
            if (updates.assigneeId !== undefined) safeUpdates.assigneeId = updates.assigneeId
            if (updates.assigneeName !== undefined) safeUpdates.assigneeName = updates.assigneeName
            if (updates.assigneeEmail !== undefined) safeUpdates.assigneeEmail = updates.assigneeEmail
        }

        if (updates.status !== undefined) {
            safeUpdates.status = updates.status
            if (updates.status === 'completed' && taskData.status !== 'completed') {
                safeUpdates.completedAt = FieldValue.serverTimestamp()
            } else if (updates.status === 'todo') {
                safeUpdates.completedAt = null
            }
        }

        if (Object.keys(safeUpdates).length === 0) {
            return NextResponse.json({ success: true, message: 'No safe updates applied' })
        }

        await taskRef.update(safeUpdates)

        // Email Automation for Completion (only if it shifted from todo -> completed)
        if (safeUpdates.status === 'completed' && taskData.status === 'todo') {
            // Retrieve assigner's email to send it back to them
            const assignerDoc = await db.collection('users').doc(taskData.createdBy).get()
            if (assignerDoc.exists && assignerDoc.data()?.email) {
                const origin = request.headers.get('origin') || request.headers.get('referer')?.replace(/\/[^/]*$/, '') || 'https://centralreform.live'
                const taskUrl = `${origin}/perform/setlist/${taskData.setlistId}`

                sendTaskCompletionEmail({
                    to: assignerDoc.data()!.email,
                    assignerName: taskData.createdByName,
                    assigneeName: taskData.assigneeName,
                    setlistName: taskData.setlistName,
                    taskTitle: safeUpdates.title || taskData.title,
                    taskUrl
                }).catch(err => {
                    logger.warn('[Tasks] Failed to send completion email natives', err)
                })
            }
        }

        return NextResponse.json({ success: true })
    } catch (err) {
        logger.error('[Tasks] Error updating task:', err)
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
    }
}
