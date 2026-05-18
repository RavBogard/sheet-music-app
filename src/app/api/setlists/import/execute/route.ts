import { NextResponse } from "next/server"
import { createApiHandler } from "@/lib/api-wrapper"
import { initAdmin, getFirestore } from "@/lib/firebase-admin"
import { uploadToStorage } from "@/lib/firebase-storage"
import { checkRateLimit } from "@/lib/rate-limit"
import { createSetlistServerSide } from "@/lib/setlist-write"
import { normalizeChartTitle } from "@/lib/library/normalize-chart-title"
import { logger } from "@/lib/logger"
import crypto from "crypto"
import { z } from "zod"

export const maxDuration = 60 // Allow up to 60s for Vercel downloads

// The import/parse route emits `null` for a header item's non-title fields, so
// optional fields are `.nullish()` (v70-08-02 — replaces the prior
// z.array(z.any()) escape hatch). Unknown keys (e.g. parse's `similarityScore`)
// are stripped by z.object's default behavior — execute does not read them.
const ParsedItemSchema = z.object({
    type: z.enum(['header', 'song']),
    title: z.string().nullish(),
    key: z.string().nullish(),
    chartUrl: z.string().nullish(),
    performer: z.string().nullish(),
    referenceLink: z.string().nullish(),
    chartError: z.string().nullish(),
    libraryMatchId: z.string().nullish(),
    libraryMatchName: z.string().nullish(),
})

type ParsedItem = z.infer<typeof ParsedItemSchema>

const schema = z.object({
    items: z.array(ParsedItemSchema).min(1),
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
                                // C4-007: route raw composed title through the canonical
                                // `normalizeChartTitle` helper so this legacy setlist-
                                // importer write stays in lockstep with processChartUpload's
                                // dedupe contract (no leading/trailing/NBSP-runs leaking
                                // into `library_index.name`).
                                const composedTitle = item.performer ? `${item.title} (${item.performer})` : item.title || "Unknown Title"
                                const finalTitle = normalizeChartTitle(composedTitle) || "Unknown Title"

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

        // v70-07-01: the parent-setlist-doc build + top-level tracks/{id} seed
        // is now the shared server-side write path (src/lib/setlist-write.ts) —
        // one write path consumed by this route, v70-07's doc-import commit,
        // and the MCP write tools. `eventDate: new Date()` preserves this
        // route's prior behavior of defaulting eventDate at import time (CSV
        // import carries no service date); the module itself does not default.
        const { setlistId } = await createSetlistServerSide({
            name: setName,
            ownerId: ctx.auth.uid,
            ownerName: ctx.auth.email || "Unknown",
            eventDate: new Date(),
            tracks: resolvedTracks.map((t) => {
                // resolvedTracks is a union (header obj | song Record) — read
                // through a Record view for the optional song fields.
                const rec = t as Record<string, unknown>
                return {
                    type: (rec.type as 'song' | 'header') ?? 'song',
                    title: (rec.title as string) ?? 'Untitled',
                    key: rec.key as string | undefined,
                    leadMusician: rec.leadMusician as string | undefined,
                    referenceLink: rec.referenceLink as string | undefined,
                    fileId: rec.fileId as string | undefined,
                    fileName: rec.fileName as string | undefined,
                }
            }),
        })

        logger.info(`[Setlist Importer] Importer generated setlist ${setlistId} with ${resolvedTracks.length} top-level tracks.`)

        return NextResponse.json({
            success: true,
            setlistId,
            message: "Import executed successfully."
        }, { status: 201 })
    },
    { role: 'band_leader', schema }
)
