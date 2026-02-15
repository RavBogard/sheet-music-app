import { NextRequest, NextResponse } from "next/server"
import { initAdmin, getFirestore, verifyIdToken } from "@/lib/firebase-admin"

export async function POST(req: NextRequest) {
    const authHeader = req.headers.get("Authorization")
    if (!authHeader?.startsWith("Bearer ")) {
        return NextResponse.json({ error: "Missing token" }, { status: 401 })
    }
    const decoded = await verifyIdToken(authHeader.split(" ")[1])
    if (!decoded) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    initAdmin()
    const db = getFirestore()
    const snapshot = await db.collection('library_index').get()
    
    const BATCH = 450
    const docs = snapshot.docs
    for (let i = 0; i < docs.length; i += BATCH) {
        const batch = db.batch()
        docs.slice(i, i + BATCH).forEach(doc => {
            batch.update(doc.ref, { storageUrl: null, storageCopiedAt: null })
        })
        await batch.commit()
    }

    return NextResponse.json({ success: true, cleared: docs.length })
}
