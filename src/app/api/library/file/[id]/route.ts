import { NextResponse } from "next/server"
import { initAdmin, getFirestore } from "@/lib/firebase-admin"
import { createApiHandler } from "@/lib/api-wrapper"
import { checkRateLimit } from "@/lib/rate-limit"

/**
 * LEGACY route — serves `db-*` ids by reading xmlContent from the
 * `digitized_charts/` Firestore collection.
 *
 * Originally paired with /api/library/save-generated, which has since been
 * removed (the ScraperModal flow unified onto /api/library/upload, so all
 * new scraped charts land in library_index + songs with `upload-*` ids).
 * This route is kept ONLY to serve any historical setlist tracks whose
 * `fileId` still starts with `db-` — the SetlistDrawer (`SetlistDrawer.tsx
 * :: fileId?.startsWith('db-')`) routes such tracks here for rendering.
 *
 * Safe to delete once a production audit confirms no live setlist tracks
 * reference a `db-*` fileId.
 */
export const GET = createApiHandler(
    async (ctx) => {
        // Rate limit
        const limited = await checkRateLimit(ctx.req, 'api')
        if (limited) return limited

        const id = ctx.params?.id

        if (!id || !id.startsWith('db-')) {
            return NextResponse.json({ error: "Invalid ID format" }, { status: 400 })
        }

        if (!initAdmin()) {
            return NextResponse.json(
                { error: "Server not ready", code: "FIREBASE_NOT_INITIALIZED" },
                { status: 500 },
            )
        }
        const db = getFirestore()

        // Strip prefix
        const docId = id.replace('db-', '')

        const docSnap = await db.collection("digitized_charts").doc(docId).get()

        if (!docSnap.exists) {
            return NextResponse.json({ error: "File not found" }, { status: 404 })
        }

        const data = docSnap.data()
        const xmlContent = data?.xmlContent

        if (!xmlContent) {
            return NextResponse.json({ error: "No content in file" }, { status: 404 })
        }

        // Return as XML file
        return new NextResponse(xmlContent, {
            headers: {
                'Content-Type': 'application/vnd.recordare.musicxml+xml',
                'Content-Disposition': `inline; filename="${data.title}.musicxml"`
            }
        })
    }
)
