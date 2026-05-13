import { NextResponse } from "next/server"
import { createApiHandler } from "@/lib/api-wrapper"
import { initAdmin, getFirestore } from "@/lib/firebase-admin"
import { FieldValue } from 'firebase-admin/firestore'
import { uploadToStorage } from "@/lib/firebase-storage"
import { checkRateLimit } from "@/lib/rate-limit"
import { logger } from "@/lib/logger"
import crypto from "crypto"
import { z } from "zod"

interface ParsedItem {
    type: 'header' | 'song'
    title?: string
    key?: string
    chartUrl?: string
    performer?: string
    referenceLink?: string
    chartError?: string
    libraryMatchId?: string
    libraryMatchName?: string
}

export const maxDuration = 60 // Allow up to 60s for Vercel downloads

const schema = z.object({
    items: z.array(z.any()).min(1),
    name: z.string().optional(),
})

export const POST = createApiHandler(
    async (ctx) => {
        const limited = await checkRateLimit(ctx.req, 'upload')
        if (limited) return limited

        const items: ParsedItem[] = ctx.body!.items || []
        const setName = ctx.body!.name || "Imported Setlist"

        if (!initAdmin()) {
            return NextResponse.json(
                { error: "Server not ready", code: "FIREBASE_NOT_INITIALIZED" },
                { status: 500 },
            )
        }
        const db = getFirestore()
        const resolvedTracks = []
        let trackCounter = 0

        for (const item of items) {
            if (item.type === 'header') {
                resolvedTracks.push({
                    id: crypto.randomUUID(),
                    type: 'header',
                    title: item.title || "Section",
                })
                continue
            }

            if (item.type === 'song') {
                trackCounter++
                const trackId = crypto.randomUUID()
                const trackPayload: Record<string, unknown> = {
                    id: trackId,
                    type: 'song',
                    title: item.title || `Song ${trackCounter}`,
                }

                if (item.key) trackPayload.key = item.key
                if (item.performer) trackPayload.leadMusician = item.performer
                if (item.referenceLink) trackPayload.referenceLink = item.referenceLink

                // If user mapped it to an existing library item
                if (item.libraryMatchId) {
                    trackPayload.fileId = item.libraryMatchId
                    trackPayload.fileName = item.libraryMatchName || item.title
                }
                // Or if it's a new public file that needs to be downloaded
                else if (item.chartUrl && !item.chartError) {
                    const driveRegex = /\/d\/([a-zA-Z0-9-_]+)/
                    const match = item.chartUrl.match(driveRegex)

                    if (match && match[1]) {
                        const fileId = match[1]
                        const downloadUrl = `https://drive.google.com/uc?export=download&id=${fileId}`

                        try {
                            const driveRes = await fetch(downloadUrl)
                            const contentType = driveRes.headers.get('content-type') || ''
                            if (driveRes.ok && contentType.startsWith('application/pdf')) {
                                const buffer = Buffer.from(await driveRes.arrayBuffer())
                                const newLibraryId = `upload-${crypto.randomUUID()}`

                                // Clean up title collisions
                                const finalTitle = item.performer ? `${item.title} (${item.performer})` : item.title || "Unknown Title"

                                // Upload to our unified firebase storage
                                await uploadToStorage(newLibraryId, buffer, 'application/pdf')

                                // Create index record
                                const indexEntry = {
                                    name: finalTitle,
                                    originalName: `${finalTitle}.pdf`,
                                    mimeType: 'application/pdf',
                                    fileSize: buffer.length,
                                    source: 'upload' as const,
                                    uploadedBy: ctx.auth.uid,
                                    uploadedByEmail: ctx.auth.email || 'unknown',
                                    uploadedAt: new Date().toISOString(),
                                    modifiedTime: new Date().toISOString(),
                                    storageUrl: `library/${newLibraryId}.pdf`,
                                    status: 'active',
                                }
                                await db.collection('library_index').doc(newLibraryId).set(indexEntry)

                                // Attach to the setlist track
                                trackPayload.fileId = newLibraryId
                                trackPayload.fileName = finalTitle
                            } else {
                                logger.warn(`[Setlist Importer] Failed to download Drive file ${fileId}. Status: ${driveRes.status}`)
                            }
                        } catch (err) {
                            logger.error(`[Setlist Importer] Drive download threw error for ${fileId}`, err)
                        }
                    }
                }

                resolvedTracks.push(trackPayload)
            }
        }

        // v60-07-04: Build the parent setlist doc WITHOUT embedded tracks.
        // Top-level tracks/{id} rows are seeded via batch after the parent
        // write. FieldValue.serverTimestamp() produces a proper Firestore
        // Timestamp so the first editor edit round-trips cleanly through
        // the v60-07-03 expectedUpdatedAt precondition (vs the prior
        // ISO-string gap noted in RESEARCH/audit-writes.md W7).
        const setlistId = crypto.randomUUID()
        const setlistPayload = {
            id: setlistId,
            name: setName,
            date: FieldValue.serverTimestamp(),
            eventDate: FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp(),
            trackCount: resolvedTracks.length,
            hydrated: true,
            ownerId: ctx.auth.uid,
            ownerName: ctx.auth.email || "Unknown",
        }

        await db.collection('setlists').doc(setlistId).set(setlistPayload)

        // v60-07-04: Seed top-level tracks/{id} via Admin SDK batch.
        // Server-side equivalent of v60-07-02's client-side seedTopLevelTracks
        // (engine-path applyEdit fanout); on the server, we use a batched
        // write because applyEdit is client-only. Sequential after the parent
        // set() so partial failures leave a recoverable state (parent exists
        // with hydrated:true + trackCount; reader fallback handles the gap
        // until a retry or backfill seeds the rows).
        if (resolvedTracks.length > 0) {
            const batch = db.batch()
            for (let i = 0; i < resolvedTracks.length; i++) {
                const t = resolvedTracks[i]
                const trackRef = db.collection('tracks').doc(t.id as string)
                batch.set(trackRef, {
                    ...t,
                    setlistId,
                    order: i,
                    type: t.type ?? 'song',
                })
            }
            await batch.commit()
        }

        logger.info(`[Setlist Importer] Importer generated setlist ${setlistId} with ${resolvedTracks.length} top-level tracks.`)

        return NextResponse.json({
            success: true,
            setlistId,
            message: "Import executed successfully."
        }, { status: 201 })
    },
    { role: 'band_leader', schema }
)
