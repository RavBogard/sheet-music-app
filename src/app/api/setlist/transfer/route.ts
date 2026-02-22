import { NextResponse } from "next/server"
import { getAuth, getFirestore } from "@/lib/firebase-admin"
import { checkRateLimit } from "@/lib/rate-limit"
import { transferSetlistSchema } from "@/lib/validations"
import { logger } from "@/lib/logger"
import { createApiHandler } from "@/lib/api-wrapper"

export const POST = createApiHandler(
    async ({ req, auth, body }) => {
        const limited = await checkRateLimit(req, 'api')
        if (limited) return limited

        const { setlistId, newOwnerEmail } = body
        const db = getFirestore()

        // Get Setlist
        const setlistRef = db.collection('setlists').doc(setlistId)
        const setlistSnap = await setlistRef.get()

        if (!setlistSnap.exists) {
            return new NextResponse("Setlist not found", { status: 404 })
        }

        // Find Target User
        let targetUser
        try {
            targetUser = await getAuth().getUserByEmail(newOwnerEmail)
        } catch (e: unknown) {
            if (e instanceof Error && 'code' in e && (e as { code: string }).code === 'auth/user-not-found') {
                return new NextResponse(`User with email ${newOwnerEmail} not found. They must sign up first.`, { status: 404 })
            }
            throw e
        }

        const setlistData = setlistSnap.data()

        // Update Setlist
        await setlistRef.update({
            ownerId: targetUser.uid,
            ownerName: targetUser.displayName || targetUser.email || "Unknown User",
            isPublic: false,
            transferredAt: new Date().toISOString(),
            previousOwnerId: auth.uid
        })

        return NextResponse.json({
            success: true,
            message: `Transferred "${setlistData?.name}" to ${targetUser.email}`
        })
    },
    { role: 'admin', schema: transferSetlistSchema }
)
