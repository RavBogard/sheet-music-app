/**
 * POST /api/tasks/create
 *
 * Auth: Admin or Band Leader
 * Logic:
 * 1. Validate payload (belongs to a setlist, has an assignee)
 * 2. Create the task doc in the top-level 'tasks' collection
 * 3. Send assignment email (awaited — Vercel kills runtime after response)
 */

import { NextRequest, NextResponse } from 'next/server'
import { withAuth } from '@/lib/api-auth'
import { initAdmin, getFirestore } from '@/lib/firebase-admin'
import { FieldValue, Timestamp } from 'firebase-admin/firestore'
import { sendTaskAssignmentEmail } from '@/lib/email'
import { logger } from '@/lib/logger'

/** Basic email format check — not exhaustive but catches junk input */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

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

        // Validate email formats before passing to the email service
        if (!EMAIL_RE.test(assigneeEmail)) {
            return NextResponse.json({ error: 'Invalid assignee email format' }, { status: 400 })
        }
        const validatedCc = Array.isArray(notifiedEmails)
            ? notifiedEmails.filter((e: unknown) => typeof e === 'string' && EMAIL_RE.test(e))
            : []

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
            notifiedEmails: validatedCc
        }

        await taskRef.set(taskData)

        // Send assignment email (must await — Vercel kills the runtime after response)
        const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://centralreform.live'
        const taskUrl = `${baseUrl}/perform/setlist/${setlistId}?tasks=1`

        const emailResult = await sendTaskAssignmentEmail({
            to: assigneeEmail,
            cc: taskData.notifiedEmails,
            recipientName: assigneeName,
            assignerName: taskData.createdByName,
            setlistName,
            taskTitle: title,
            taskDescription: description,
            taskUrl
        }).catch(err => {
            logger.warn('[Tasks] Failed to send assignment email. The task was still created.', err)
            return { ok: false, reason: String(err) }
        })

        logger.info(`[Tasks] Task ${taskRef.id} created. Email: ${emailResult?.ok ? 'sent' : emailResult?.reason || 'failed'}`)

        return NextResponse.json({ success: true, taskId: taskRef.id })
    } catch (err) {
        logger.error('[Tasks] Error creating task:', err)
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
    }
}
