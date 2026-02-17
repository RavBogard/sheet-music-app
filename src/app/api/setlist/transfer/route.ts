import { NextResponse } from "next/server"
import { getAuth, getFirestore } from "@/lib/firebase-admin"
import { withAuth } from "@/lib/api-auth"
import { transferSetlistSchema } from "@/lib/validations"
import { logger } from "@/lib/logger"

export async function POST(request: Request) {
    try {
        const auth = await withAuth(request, 'admin')
        if (auth instanceof NextResponse) return auth

        // Parse Body
        const body = await request.json()
        const validationResult = transferSetlistSchema.safeParse(body)

        if (!validationResult.success) {
            return new NextResponse(JSON.stringify({
                error: "Validation failed",
                details: validationResult.error.format()
            }), { status: 400 })
        }

        const { setlistId, newOwnerEmail } = validationResult.data
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

    } catch (error: unknown) {
        if (error instanceof NextResponse) return error
        logger.error("Transfer Error:", error)
        return new NextResponse(`Error: ${(error instanceof Error ? error.message : "Unknown error")}`, { status: 500 })
    }
}
