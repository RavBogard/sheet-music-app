import { NextRequest, NextResponse } from "next/server"
import { getFirestore } from "firebase-admin/firestore"
import { withAuth } from "@/lib/api-auth"
import { checkRateLimit } from "@/lib/rate-limit"
import { logger } from "@/lib/logger"

interface ChordPosition {
    text: string
    originalText: string
    x: number
    y: number
    w?: number
    h?: number
    pxHeight?: number
    source?: 'textLayer' | 'ai' | 'user'
}

interface PageChordData {
    chords: ChordPosition[]
    scannedAt: string
    scanMethod: 'textLayer' | 'textLayer+ai' | 'ai'
    aiValidated?: boolean
    cacheVersion?: number
}

/**
 * GET /api/library/chord-cache?fileId=xxx&page=0
 * GET /api/library/chord-cache?fileId=xxx&meta=true
 */
export async function GET(req: NextRequest) {
    try {
        const auth = await withAuth(req)
        if (auth instanceof NextResponse) return auth

        const limited = await checkRateLimit(req, 'api')
        if (limited) return limited

        const fileId = req.nextUrl.searchParams.get("fileId")
        const page = req.nextUrl.searchParams.get("page")
        const meta = req.nextUrl.searchParams.get("meta")

        if (!fileId) {
            return NextResponse.json({ error: "Missing fileId" }, { status: 400 })
        }

        const db = getFirestore()

        // Meta mode: return library-level metadata
        if (meta === 'true') {
            const doc = await db.collection("library_index").doc(fileId).get()
            if (!doc.exists) return NextResponse.json({})
            const data = doc.data()
            return NextResponse.json({
                nativeKey: data?.nativeKey || undefined,
                nativeKeySource: data?.nativeKeySource || undefined,
                chordsVerified: data?.chordsVerified || false,
                chordsVerifiedBy: data?.chordsVerifiedBy || undefined,
            })
        }

        if (page !== null && page !== undefined) {
            const doc = await db
                .collection("library_index").doc(fileId)
                .collection("chordData").doc(`page_${page}`)
                .get()

            if (!doc.exists) return NextResponse.json({ cached: false })
            return NextResponse.json({ cached: true, data: doc.data() as PageChordData })
        } else {
            const snapshot = await db
                .collection("library_index").doc(fileId)
                .collection("chordData").get()

            const pages: Record<string, PageChordData> = {}
            snapshot.forEach(doc => { pages[doc.id] = doc.data() as PageChordData })
            return NextResponse.json({ cached: Object.keys(pages).length > 0, pages })
        }
    } catch (error: unknown) {
        if (error instanceof NextResponse) return error
        logger.error("[Chord Cache GET] Error:", error)
        return NextResponse.json({ error: "Failed to load chord cache" }, { status: 500 })
    }
}

/**
 * POST /api/library/chord-cache
 * Save scanned chord positions for a file page
 */
export async function POST(req: NextRequest) {
    try {
        const auth = await withAuth(req)
        if (auth instanceof NextResponse) return auth

        const limited = await checkRateLimit(req, 'api')
        if (limited) return limited

        const body = await req.json()
        const { fileId, page, chords, scanMethod, cacheVersion, aiValidated } = body

        if (!fileId || page === undefined || page === null || !Array.isArray(chords)) {
            return NextResponse.json({ error: "Missing required fields" }, { status: 400 })
        }

        const db = getFirestore()

        const cacheData: PageChordData = {
            chords: chords.map((c: ChordPosition) => ({
                text: c.text || c.originalText || '',
                originalText: c.originalText || c.text,
                x: c.x, y: c.y, w: c.w, h: c.h,
                pxHeight: c.pxHeight,
                source: c.source || 'textLayer',
            })),
            scannedAt: new Date().toISOString(),
            scanMethod: scanMethod || 'textLayer',
            aiValidated: aiValidated || false,
            cacheVersion: cacheVersion || 1
        }

        await db.collection("library_index").doc(fileId)
            .collection("chordData").doc(`page_${page}`)
            .set(cacheData, { merge: true })

        return NextResponse.json({ success: true, chordsCount: cacheData.chords.length })
    } catch (error: unknown) {
        if (error instanceof NextResponse) return error
        logger.error("[Chord Cache POST] Error:", error)
        return NextResponse.json({ error: "Failed to save chord cache" }, { status: 500 })
    }
}

/**
 * PATCH /api/library/chord-cache
 * Update library-level metadata (native key, verification)
 */
export async function PATCH(req: NextRequest) {
    try {
        const auth = await withAuth(req)
        if (auth instanceof NextResponse) return auth

        const body = await req.json()
        const { fileId, nativeKey, nativeKeySource, chordsVerified, chordsVerifiedBy } = body

        if (!fileId) {
            return NextResponse.json({ error: "Missing fileId" }, { status: 400 })
        }

        const db = getFirestore()
        const updates: Record<string, unknown> = {}

        if (nativeKey !== undefined) {
            updates.nativeKey = nativeKey
            updates.nativeKeySource = nativeKeySource || 'auto'
        }
        if (chordsVerified !== undefined) {
            updates.chordsVerified = chordsVerified
            updates.chordsVerifiedBy = chordsVerifiedBy || null
        }

        if (Object.keys(updates).length > 0) {
            await db.collection("library_index").doc(fileId).set(updates, { merge: true })
        }

        return NextResponse.json({ success: true })
    } catch (error: unknown) {
        if (error instanceof NextResponse) return error
        logger.error("[Chord Cache PATCH] Error:", error)
        return NextResponse.json({ error: "Failed to update metadata" }, { status: 500 })
    }
}

/**
 * DELETE /api/library/chord-cache?fileId=xxx
 */
export async function DELETE(req: NextRequest) {
    try {
        const auth = await withAuth(req)
        if (auth instanceof NextResponse) return auth

        const fileId = req.nextUrl.searchParams.get("fileId")
        if (!fileId) {
            return NextResponse.json({ error: "Missing fileId" }, { status: 400 })
        }

        const db = getFirestore()
        const snapshot = await db
            .collection("library_index").doc(fileId)
            .collection("chordData").get()

        const batch = db.batch()
        snapshot.forEach(doc => { batch.delete(doc.ref) })
        await batch.commit()

        // Clear verification
        await db.collection("library_index").doc(fileId).set(
            { chordsVerified: false, chordsVerifiedBy: null }, { merge: true }
        )

        return NextResponse.json({ success: true, pagesDeleted: snapshot.size })
    } catch (error: unknown) {
        if (error instanceof NextResponse) return error
        logger.error("[Chord Cache DELETE] Error:", error)
        return NextResponse.json({ error: "Failed to clear chord cache" }, { status: 500 })
    }
}
