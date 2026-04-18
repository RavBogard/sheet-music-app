import { NextResponse } from "next/server"
import { getFirestore } from "@/lib/firebase-admin"
import { logger } from "@/lib/logger"
import { createApiHandler } from "@/lib/api-wrapper"
import { checkRateLimit } from "@/lib/rate-limit"
import { chunkBatchUpdate } from "@/lib/firestore-batch"
import { z } from "zod"

// v4.4 DL-010: self-update route with denormalization fan-out across
// scheduling_assignments so the copies of musicianName/Phone/assignedByName
// stay in sync with users/{uid}.
const profileUpdateSchema = z.object({
    displayName: z.string().min(1).max(100).optional(),
    phone: z.string().max(30).nullable().optional(),
}).refine(v => v.displayName !== undefined || v.phone !== undefined, {
    message: "At least one of displayName or phone must be provided",
})

export const POST = createApiHandler(
    async (ctx) => {
        const limited = await checkRateLimit(ctx.req, 'api')
        if (limited) return limited

        const { displayName, phone } = ctx.body!
        const phoneKeyPresent = Object.prototype.hasOwnProperty.call(ctx.body as object, 'phone')

        const db = getFirestore()
        const { FieldValue } = await import('firebase-admin/firestore')

        const uid = ctx.auth.uid
        const userRef = db.collection('users').doc(uid)
        const userSnap = await userRef.get()
        const existing = userSnap.data()

        // No-op short-circuit: if every incoming field already matches the doc, skip the write + fan-out.
        const nameUnchanged = displayName === undefined || (existing?.displayName === displayName)
        const existingPhone = existing?.musicianProfile?.phone ?? null
        const incomingPhone = phone ?? null
        const phoneUnchanged = !phoneKeyPresent || existingPhone === incomingPhone
        if (nameUnchanged && phoneUnchanged) {
            return NextResponse.json({ success: true, updated: { assignments: 0, assigner: 0 } })
        }

        // 1. Source-of-truth write on users/{uid}.
        const userUpdate: Record<string, unknown> = {}
        if (displayName !== undefined && existing?.displayName !== displayName) {
            userUpdate.displayName = displayName
        }
        if (phoneKeyPresent && existingPhone !== incomingPhone) {
            userUpdate['musicianProfile.phone'] = phone === null ? FieldValue.delete() : phone
        }
        if (Object.keys(userUpdate).length > 0) {
            await userRef.update(userUpdate)
        }

        // 2. Fan-out.
        const assignmentsCol = db.collection('scheduling_assignments')
        const nameChanged = displayName !== undefined && existing?.displayName !== displayName
        const phoneChanged = phoneKeyPresent && existingPhone !== incomingPhone

        // Build per-target update payloads.
        const musicianPayload: Record<string, unknown> = {}
        if (nameChanged) musicianPayload.musicianName = displayName
        if (phoneChanged) musicianPayload.musicianPhone = phone === null ? FieldValue.delete() : phone

        const assignerPayload: Record<string, unknown> = {}
        if (nameChanged) assignerPayload.assignedByName = displayName

        let musicianUpdated = 0
        let assignerUpdated = 0
        const errors: string[] = []

        if (Object.keys(musicianPayload).length > 0) {
            const snap = await assignmentsCol.where('musicianUid', '==', uid).get()
            if (!snap.empty) {
                const refs = snap.docs.map(d => d.ref)
                const result = await chunkBatchUpdate(db, refs, musicianPayload)
                musicianUpdated = result.updated
                for (const err of result.errors) errors.push(`musician fan-out: ${err.message}`)
            }
        }

        if (Object.keys(assignerPayload).length > 0) {
            const snap = await assignmentsCol.where('assignedBy', '==', uid).get()
            if (!snap.empty) {
                const refs = snap.docs.map(d => d.ref)
                const result = await chunkBatchUpdate(db, refs, assignerPayload)
                assignerUpdated = result.updated
                for (const err of result.errors) errors.push(`assigner fan-out: ${err.message}`)
            }
        }

        logger.info(`[Profile] rename fan-out uid=${uid} musician=${musicianUpdated} assigner=${assignerUpdated}`)

        return NextResponse.json({
            success: true,
            updated: { assignments: musicianUpdated, assigner: assignerUpdated },
            errors: errors.length > 0 ? errors : undefined,
        })
    },
    { role: 'musician', schema: profileUpdateSchema }
)
