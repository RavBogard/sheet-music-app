import { NextRequest, NextResponse } from "next/server"
import { initAdmin, getFirestore, verifyIdToken } from "@/lib/firebase-admin"
import { logger } from "@/lib/logger"

/** POST: Reset migration markers so all files get re-migrated */
export async function POST(req: NextRequest) {
    try {
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
                batch.update(doc.ref, {
                    storageUrl: null,
                    storageCopiedAt: null,
                    storageFailed: null,
                    storageFailedAt: null,
                    storageError: null,
                })
            })
            await batch.commit()
        }

        return NextResponse.json({ success: true, cleared: docs.length })
    } catch (error) {
        logger.error("[migrate-storage/reset POST]:", error)
        return NextResponse.json({ error: "Internal Server Error", message: String(error) }, { status: 500 })
    }
}

/** DELETE: Clear all chord caches so improved scanner takes effect */
export async function DELETE(req: NextRequest) {
    try {
        const authHeader = req.headers.get("Authorization")
        if (!authHeader?.startsWith("Bearer ")) {
            return NextResponse.json({ error: "Missing token" }, { status: 401 })
        }
        const decoded = await verifyIdToken(authHeader.split(" ")[1])
        if (!decoded) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

        initAdmin()
        const db = getFirestore()

        const libraryDocs = await db.collection('library_index').get()
        let cleared = 0

        for (const libDoc of libraryDocs.docs) {
            const chordDocs = await libDoc.ref.collection('chordData').get()
            if (chordDocs.empty) continue

            const BATCH = 450
            for (let i = 0; i < chordDocs.docs.length; i += BATCH) {
                const batch = db.batch()
                chordDocs.docs.slice(i, i + BATCH).forEach(doc => {
                    batch.delete(doc.ref)
                })
                await batch.commit()
                cleared += Math.min(BATCH, chordDocs.docs.length - i)
            }
        }

        return NextResponse.json({ success: true, cleared })
    } catch (error) {
        logger.error("[migrate-storage/reset DELETE]:", error)
        return NextResponse.json({ error: "Internal Server Error", message: String(error) }, { status: 500 })
    }
}
