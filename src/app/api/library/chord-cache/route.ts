import { NextRequest, NextResponse } from "next/server"
import { getAuth } from "firebase-admin/auth"
import { getFirestore } from "firebase-admin/firestore"
import { initAdmin } from "@/lib/firebase-admin"

initAdmin()

interface ChordPosition {
    text: string
    originalText: string
    x: number
    y: number
    w?: number
    h?: number
    pxHeight?: number
}

interface PageChordData {
    chords: ChordPosition[]
    scannedAt: string
    scanMethod: 'textLayer' | 'geminiOCR'
}

/**
 * GET /api/library/chord-cache?fileId=xxx&page=0
 * Load cached chord positions for a file page
 */
export async function GET(req: NextRequest) {
    try {
        const authHeader = req.headers.get("Authorization")
        if (!authHeader?.startsWith("Bearer ")) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
        }
        const token = authHeader.split("Bearer ")[1]
        await getAuth().verifyIdToken(token)

        const fileId = req.nextUrl.searchParams.get("fileId")
        const page = req.nextUrl.searchParams.get("page")

        if (!fileId) {
            return NextResponse.json({ error: "Missing fileId" }, { status: 400 })
        }

        const db = getFirestore()

        if (page !== null && page !== undefined) {
            // Get specific page
            const doc = await db
                .collection("library_index")
                .doc(fileId)
                .collection("chordData")
                .doc(`page_${page}`)
                .get()

            if (!doc.exists) {
                return NextResponse.json({ cached: false })
            }

            return NextResponse.json({
                cached: true,
                data: doc.data() as PageChordData
            })
        } else {
            // Get all pages for this file
            const snapshot = await db
                .collection("library_index")
                .doc(fileId)
                .collection("chordData")
                .get()

            const pages: Record<string, PageChordData> = {}
            snapshot.forEach(doc => {
                pages[doc.id] = doc.data() as PageChordData
            })

            return NextResponse.json({
                cached: Object.keys(pages).length > 0,
                pages
            })
        }
    } catch (error: unknown) {
        console.error("[Chord Cache GET] Error:", error)
        return NextResponse.json({ error: "Failed to load chord cache" }, { status: 500 })
    }
}

/**
 * POST /api/library/chord-cache
 * Save scanned chord positions for a file page
 * Body: { fileId, page, chords, scanMethod }
 */
export async function POST(req: NextRequest) {
    try {
        const authHeader = req.headers.get("Authorization")
        if (!authHeader?.startsWith("Bearer ")) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
        }
        const token = authHeader.split("Bearer ")[1]
        await getAuth().verifyIdToken(token)

        const body = await req.json()
        const { fileId, page, chords, scanMethod } = body

        if (!fileId || page === undefined || page === null || !Array.isArray(chords)) {
            return NextResponse.json({ error: "Missing required fields" }, { status: 400 })
        }

        const db = getFirestore()

        const cacheData: PageChordData = {
            chords: chords.map((c: { text: string; x: number; y: number; originalText?: string; pxHeight?: number; h?: number; w?: number }) => ({
                text: c.text || c.originalText,
                originalText: c.originalText || c.text,
                x: c.x,
                y: c.y,
                w: c.w,
                h: c.h,
                pxHeight: c.pxHeight
            })),
            scannedAt: new Date().toISOString(),
            scanMethod: scanMethod || 'textLayer'
        }

        await db
            .collection("library_index")
            .doc(fileId)
            .collection("chordData")
            .doc(`page_${page}`)
            .set(cacheData, { merge: true })

        return NextResponse.json({ success: true, chordsCount: cacheData.chords.length })
    } catch (error: unknown) {
        console.error("[Chord Cache POST] Error:", error)
        return NextResponse.json({ error: "Failed to save chord cache" }, { status: 500 })
    }
}

/**
 * DELETE /api/library/chord-cache?fileId=xxx
 * Clear cached chord data (e.g., when file is updated)
 */
export async function DELETE(req: NextRequest) {
    try {
        const authHeader = req.headers.get("Authorization")
        if (!authHeader?.startsWith("Bearer ")) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
        }
        const token = authHeader.split("Bearer ")[1]
        const decoded = await getAuth().verifyIdToken(token)

        const fileId = req.nextUrl.searchParams.get("fileId")
        if (!fileId) {
            return NextResponse.json({ error: "Missing fileId" }, { status: 400 })
        }

        const db = getFirestore()

        // Delete all page chord data for this file
        const snapshot = await db
            .collection("library_index")
            .doc(fileId)
            .collection("chordData")
            .get()

        const batch = db.batch()
        snapshot.forEach(doc => {
            batch.delete(doc.ref)
        })
        await batch.commit()

        return NextResponse.json({ success: true, pagesDeleted: snapshot.size })
    } catch (error: unknown) {
        console.error("[Chord Cache DELETE] Error:", error)
        return NextResponse.json({ error: "Failed to clear chord cache" }, { status: 500 })
    }
}
