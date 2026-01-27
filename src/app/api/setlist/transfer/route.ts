import { NextResponse } from "next/server"
import { initAdmin, getAuth, getFirestore } from "@/lib/firebase-admin"
import { version } from "os"

export async function POST(request: Request) {
    try {
        const authHeader = request.headers.get("Authorization")
        const token = authHeader?.split("Bearer ")[1]

        if (!token) {
            return new NextResponse("Unauthorized", { status: 401 })
        }

        // Parse Body
        const { setlistId, newOwnerEmail } = await request.json()
        if (!setlistId || !newOwnerEmail) {
            return new NextResponse("Missing required fields", { status: 400 })
        }

        initAdmin()
        const auth = getAuth()
        const db = getFirestore()

        // 1. Verify Caller
        const decodedToken = await auth.verifyIdToken(token)
        const callerUid = decodedToken.uid

        // 2. Get Setlist
        const setlistRef = db.collection('setlists').doc(setlistId)
        const setlistSnap = await setlistRef.get()

        if (!setlistSnap.exists) {
            return new NextResponse("Setlist not found", { status: 404 })
        }

        const setlistData = setlistSnap.data()

        // 3. Verify Ownership (Only Owner or Admin can transfer)
        const isOwner = setlistData?.ownerId === callerUid
        const isAdmin = decodedToken.role === 'admin'

        if (!isOwner && !isAdmin) {
            return new NextResponse("Forbidden: You do not own this setlist", { status: 403 })
        }

        // 4. Find Target User
        let targetUser
        try {
            targetUser = await auth.getUserByEmail(newOwnerEmail)
        } catch (e: any) {
            if (e.code === 'auth/user-not-found') {
                return new NextResponse(`User with email ${newOwnerEmail} not found. They must sign up first.`, { status: 404 })
            }
            throw e
        }

        // 5. Update Setlist
        await setlistRef.update({
            ownerId: targetUser.uid,
            ownerName: targetUser.displayName || targetUser.email || "Unknown User",
            isPublic: false, // Default to private when transferring? Maybe safer.
            transferredAt: new Date().toISOString(),
            previousOwnerId: callerUid
        })

        return NextResponse.json({
            success: true,
            message: `Transferred "${setlistData?.name}" to ${targetUser.email}`
        })

    } catch (error: any) {
        console.error("Transfer Error:", error)
        return new NextResponse(`Error: ${error.message}`, { status: 500 })
    }
}
