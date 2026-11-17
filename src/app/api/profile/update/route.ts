import { NextResponse } from "next/server"
import { getFirestore } from "@/lib/firebase-admin"
import { createApiHandler } from "@/lib/api-wrapper"
import { checkRateLimit } from "@/lib/rate-limit"
import { z } from "zod"

// Self-update route: the caller's displayName and musician phone on users/{uid}.
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

        // No-op short-circuit: if every incoming field already matches the doc, skip the write.
        const nameUnchanged = displayName === undefined || (existing?.displayName === displayName)
        const existingPhone = existing?.musicianProfile?.phone ?? null
        const incomingPhone = phone ?? null
        const phoneUnchanged = !phoneKeyPresent || existingPhone === incomingPhone
        if (nameUnchanged && phoneUnchanged) {
            return NextResponse.json({ success: true })
        }

        // Source-of-truth write on users/{uid}.
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

        return NextResponse.json({ success: true })
    },
    { role: 'musician', schema: profileUpdateSchema }
)
