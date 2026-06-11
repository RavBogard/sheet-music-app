import { NextResponse } from "next/server"
import { getFirestore } from "firebase-admin/firestore"
import { createApiHandler } from "@/lib/api-wrapper"
import { checkRateLimit } from "@/lib/rate-limit"
import { z } from "zod"

interface ChordPosition {
    text: string
    originalText: string
    x: number
    y: number
    w?: number | null
    h?: number | null
    pxHeight?: number | null
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
export const GET = createApiHandler(
    async (ctx) => {
        const limited = await checkRateLimit(ctx.req, 'api')
        if (limited) return limited

        const fileId = ctx.req.nextUrl.searchParams.get("fileId")
        const page = ctx.req.nextUrl.searchParams.get("page")
        const meta = ctx.req.nextUrl.searchParams.get("meta")

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
                lastUsedKey: data?.lastUsedKey || undefined,
                lastUsedTransposition: data?.lastUsedTransposition ?? undefined,
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
    },
    // v11.3-01-02 (BUG-4 / D-Q2): anon may read cached chord positions in Perform
    // transpose. Read-only, idempotent, err-public. Keeps the `api` rate-limit.
    { requireAuth: false }
)

const postSchema = z.object({
    fileId: z.string().min(1),
    page: z.number(),
    chords: z.array(z.any()),
    scanMethod: z.string().optional(),
    cacheVersion: z.number().optional(),
    aiValidated: z.boolean().optional(),
})

/**
 * POST /api/library/chord-cache
 * Save scanned chord positions for a file page
 */
export const POST = createApiHandler(
    async (ctx) => {
        const limited = await checkRateLimit(ctx.req, 'api')
        if (limited) return limited

        const { fileId, page, chords, scanMethod, cacheVersion, aiValidated } = ctx.body!

        const db = getFirestore()

        const cacheData: PageChordData = {
            chords: chords.map((c: ChordPosition) => {
                // Firestore rejects undefined values, so fallback optional fields to null
                return {
                    text: c.text || c.originalText || '',
                    originalText: c.originalText || c.text || '',
                    x: c.x, y: c.y,
                    w: c.w ?? null,
                    h: c.h ?? null,
                    pxHeight: c.pxHeight ?? null,
                    source: c.source || 'textLayer',
                }
            }),
            scannedAt: new Date().toISOString(),
            scanMethod: scanMethod as PageChordData['scanMethod'] || 'textLayer',
            aiValidated: aiValidated || false,
            cacheVersion: cacheVersion || 1
        }

        await db.collection("library_index").doc(fileId)
            .collection("chordData").doc(`page_${page}`)
            .set(cacheData, { merge: true })

        return NextResponse.json({ success: true, chordsCount: cacheData.chords.length })
    },
    // v11.3-01-02 (BUG-4 / D-Q2): anon may PERSIST scan results so the next visitor
    // gets a cache hit and no re-scan — the cost-control half of "rate-limit anon
    // AI-scan". Benign derived chord-position data keyed by fileId; `chordsVerified`
    // stays leader-gated (PATCH) and the row is overwritable by re-scan. `api` rate-limit kept.
    { schema: postSchema, requireAuth: false }
)

const patchSchema = z.object({
    fileId: z.string().min(1),
    nativeKey: z.string().optional(),
    nativeKeySource: z.string().optional(),
    chordsVerified: z.boolean().optional(),
    chordsVerifiedBy: z.string().nullable().optional(),
    lastUsedKey: z.string().optional(),
    lastUsedTransposition: z.number().optional(),
})

/**
 * PATCH /api/library/chord-cache
 * Update library-level metadata (native key, verification)
 */
export const PATCH = createApiHandler(
    async (ctx) => {
        const { fileId, nativeKey, nativeKeySource, chordsVerified, chordsVerifiedBy, lastUsedKey, lastUsedTransposition } = ctx.body!

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
        if (lastUsedKey !== undefined) {
            updates.lastUsedKey = lastUsedKey
            updates.lastUsedTransposition = lastUsedTransposition ?? 0
        }

        if (Object.keys(updates).length > 0) {
            await db.collection("library_index").doc(fileId).set(updates, { merge: true })
        }

        return NextResponse.json({ success: true })
    },
    { role: 'musician', schema: patchSchema }
)

/**
 * DELETE /api/library/chord-cache?fileId=xxx
 */
export const DELETE = createApiHandler(
    async (ctx) => {
        const fileId = ctx.req.nextUrl.searchParams.get("fileId")
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
    },
    { role: 'band_leader' }
)
