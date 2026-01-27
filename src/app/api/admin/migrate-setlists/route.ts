import { NextResponse } from "next/server"
import { initAdmin, getFirestore } from "@/lib/firebase-admin"

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url)
    const secret = searchParams.get('secret')

    // Security Check
    const envSecret = process.env.ADMIN_BOOTSTRAP_SECRET
    if (!envSecret || secret !== envSecret) {
        return new NextResponse("Unauthorized", { status: 403 })
    }

    try {
        initAdmin()
        const db = getFirestore()
        const batch = db.batch()
        let count = 0
        const log: string[] = []

        // 1. Migrate Private Setlists
        const usersSnap = await db.collection('users').get()

        for (const userDoc of usersSnap.docs) {
            const setlistsSnap = await db.collection(`users/${userDoc.id}/setlists`).get()

            for (const doc of setlistsSnap.docs) {
                const data = doc.data()
                const newRef = db.collection('setlists').doc(doc.id)

                batch.set(newRef, {
                    ...data,
                    ownerId: userDoc.id,
                    isPublic: false,
                    migratedAt: new Date().toISOString(),
                    originalPath: `users/${userDoc.id}/setlists/${doc.id}`
                }, { merge: true })

                count++
                log.push(`Migrated private: ${doc.id} (${data.name})`)
            }
        }

        // 2. Migrate Public Setlists
        const publicSnap = await db.collection('publicSetlists').get()
        for (const doc of publicSnap.docs) {
            const data = doc.data()
            const newRef = db.collection('setlists').doc(doc.id)

            batch.set(newRef, {
                ...data,
                // ownerId already exists in public setlists usually
                isPublic: true,
                migratedAt: new Date().toISOString(),
                originalPath: `publicSetlists/${doc.id}`
            }, { merge: true })

            count++
            log.push(`Migrated public: ${doc.id} (${data.name})`)
        }

        // Commit all writes
        if (count > 0) {
            await batch.commit()
            return NextResponse.json({ success: true, count, log })
        } else {
            return NextResponse.json({ success: true, count: 0, message: "No documents found to migrate" })
        }

    } catch (error: any) {
        console.error("Migration Error:", error)
        return new NextResponse(`Error: ${error.message}`, { status: 500 })
    }
}
