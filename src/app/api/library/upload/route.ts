import { NextResponse } from "next/server"
import { revalidatePath } from "next/cache"
import { createApiHandler } from "@/lib/api-wrapper"
import { initAdmin, getFirestore } from "@/lib/firebase-admin"
import { uploadToStorage } from "@/lib/firebase-storage"
import { checkRateLimit } from "@/lib/rate-limit"
import { logger } from "@/lib/logger"
import crypto from "crypto"
import { levenshteinDistance } from "@/lib/string-utils"
import { processMuseScoreFile } from "@/lib/musescore-converter"

// Max file size: 25MB
const MAX_FILE_SIZE = 25 * 1024 * 1024

const ALLOWED_TYPES: Record<string, string> = {
    'application/pdf': '.pdf',
    'application/xml': '.xml',
    'text/xml': '.xml',
    'application/vnd.recordare.musicxml+xml': '.musicxml',
    'application/vnd.recordare.musicxml': '.musicxml',
    'application/x-musescore': '.mscz',
    'application/x-musescore+xml': '.mscx',
    'text/plain': '.txt',
}

/**
 * POST /api/library/upload
 *
 * Upload a file directly to the library.
 * Accepts multipart/form-data with:
 *   - file: The PDF or MusicXML file
 *   - title: (optional) Display name; defaults to filename without extension
 *   - key: (optional) Musical key
 *   - bpm: (optional) Tempo
 *   - tags: (optional) Comma-separated tags
 *
 * Requires canUpload flag on user profile.
 */
export const POST = createApiHandler(
    async (ctx) => {
        // Rate limit: 10 uploads/min
        const limited = await checkRateLimit(ctx.req, 'upload')
        if (limited) return limited

        // Check canUpload flag on user profile
        if (!initAdmin()) {
            return NextResponse.json(
                { error: "Server not ready", code: "FIREBASE_NOT_INITIALIZED" },
                { status: 500 },
            )
        }
        const db = getFirestore()

        const userDoc = await db.collection('users').doc(ctx.auth.uid).get()
        const isPrivilegedRole = ctx.auth.isAdmin || ctx.auth.isBandLeader || ctx.auth.isMusician
        
        if (!isPrivilegedRole && (!userDoc.exists || !userDoc.data()?.canUpload)) {
            return NextResponse.json(
                { error: "Upload permission required. Ask an admin to enable uploads for your account." },
                { status: 403 }
            )
        }

        const formData = await ctx.req.formData()
        const file = formData.get('file') as File | null

        if (!file) {
            return NextResponse.json({ error: "No file provided" }, { status: 400 })
        }

        // Validate file type
        const mimeType = file.type || 'application/octet-stream'
        if (!ALLOWED_TYPES[mimeType] && !file.name.match(/\.(pdf|xml|musicxml|mxl|mscz|mscx|txt)$/i)) {
            return NextResponse.json(
                { error: "Only PDF, MusicXML, MuseScore, and Text files are supported" },
                { status: 400 }
            )
        }

        // Validate file size
        if (file.size > MAX_FILE_SIZE) {
            return NextResponse.json(
                { error: `File too large. Maximum size is ${MAX_FILE_SIZE / 1024 / 1024}MB` },
                { status: 400 }
            )
        }

        // Read file buffer
        let buffer = Buffer.from(await file.arrayBuffer())

        // Generate a unique ID (prefixed to distinguish from Drive files)
        const fileId = `upload-${crypto.randomUUID()}`

        // Detect MuseScore files by extension
        const msExt = file.name.match(/\.(mscz|mscx)$/i)?.[1]?.toLowerCase() as 'mscz' | 'mscx' | undefined
        let originalStorageUrl: string | undefined
        let sourceFormat: string | undefined

        if (msExt) {
            logger.info(`[Upload] Converting ${file.name} from ${msExt} to MusicXML`)
            try {
                const { musicXml, originalContent } = await processMuseScoreFile(buffer, msExt)

                // Store the original MuseScore file for archival
                const originalPath = `library/originals/${fileId}.${msExt}`
                await uploadToStorage(`originals/${fileId}.${msExt}`, originalContent, 'application/octet-stream')
                originalStorageUrl = originalPath
                sourceFormat = msExt

                // Replace buffer with converted MusicXML
                buffer = Buffer.from(musicXml, 'utf-8')
            } catch (err) {
                const message = err instanceof Error ? err.message : 'Unknown error'
                return NextResponse.json(
                    { error: `Failed to convert MuseScore file: ${message}` },
                    { status: 422 }
                )
            }
        }

        // Extract metadata from form
        const rawTitle = formData.get('title') as string | null
        const title = rawTitle?.trim() || file.name.replace(/\.[^/.]+$/, '')
        const key = (formData.get('key') as string | null)?.trim() || undefined
        const bpmRaw = formData.get('bpm') ? Number(formData.get('bpm')) : undefined
        const bpm = bpmRaw != null && !isNaN(bpmRaw) && bpmRaw > 0 ? bpmRaw : undefined
        const tagsRaw = (formData.get('tags') as string | null)?.trim()
        const tags = tagsRaw ? tagsRaw.split(',').map(t => t.trim()).filter(Boolean) : []
        const collection = (formData.get('collection') as string | null)?.trim() || 'crc'

        // Determine content type for storage
        // MuseScore files are already converted to MusicXML at this point
        const contentType = msExt ? 'application/xml'
            : mimeType.includes('pdf') ? 'application/pdf'
                : (mimeType.includes('xml') || /\.(xml|musicxml|mxl)$/i.test(file.name)) ? 'application/xml'
                    : mimeType

        // 1. Duplicate Prevention Check -- query by nameLower prefix to avoid scanning all docs
        const nameLower = title.toLowerCase()
        const exactMatch = await db.collection('library_index')
            .where('nameLower', '==', nameLower)
            .limit(5)
            .get()

        const activeExactMatch = exactMatch.docs.find(d => d.data().status === 'active')
        if (activeExactMatch) {
            const existingName = activeExactMatch.data().name
            return NextResponse.json({ error: `A chart with the same name ("${existingName}") already exists.` }, { status: 409 })
        }

        // Fuzzy check: query a narrow prefix range instead of loading all titles
        const prefix = nameLower.replace(/[^a-z0-9]/g, '').slice(0, 6)
        if (prefix.length >= 3) {
            const prefixEnd = prefix.slice(0, -1) + String.fromCharCode(prefix.charCodeAt(prefix.length - 1) + 1)
            const similarSnap = await db.collection('library_index')
                .where('nameLower', '>=', prefix)
                .where('nameLower', '<', prefixEnd)
                .select('name', 'status')
                .limit(20)
                .get()

            const normalizedNewTitle = nameLower.replace(/[^a-z0-9]/g, '')
            for (const doc of similarSnap.docs) {
                if (doc.data().status !== 'active') continue;
                
                const existingName = doc.data().name as string
                const normalizedExisting = existingName.toLowerCase().replace(/[^a-z0-9]/g, '')
                const distance = levenshteinDistance(normalizedNewTitle, normalizedExisting)
                const maxLength = Math.max(normalizedNewTitle.length, normalizedExisting.length)
                const similarity = 1 - (distance / maxLength)

                if (similarity > 0.85) {
                    return NextResponse.json({ error: `A chart with a similar name ("${existingName}") already exists in the library.` }, { status: 409 })
                }
            }
        }

        // 2. Upload to Firebase Storage
        logger.info(`[Upload] Uploading ${file.name} (${(file.size / 1024).toFixed(1)}KB) as ${fileId}`)
        await uploadToStorage(fileId, buffer, contentType)

        const indexEntry = {
            name: title,
            originalName: file.name,
            mimeType: contentType,
            fileSize: file.size,
            source: 'upload' as const,
            uploadedBy: ctx.auth.uid,
            uploadedByEmail: ctx.auth.email || 'unknown',
            uploadedAt: new Date().toISOString(),
            modifiedTime: new Date().toISOString(),
            // Optional musical metadata
            ...(key && { key }),
            ...(bpm && { bpm }),
            ...(tags.length > 0 && { tags }),
            collection,
            // Storage reference
            storageUrl: `library/${fileId}${contentType.includes('pdf') ? '.pdf' : contentType.includes('text') ? '.txt' : '.xml'}`,
            // MuseScore-specific fields
            ...(originalStorageUrl && { originalStorageUrl }),
            ...(sourceFormat && { sourceFormat }),
            // Status
            status: 'active',
        }

        await db.collection('library_index').doc(fileId).set(indexEntry)

        // Seed the 'songs' collection so the offline Setlist picker can find it immediately.
        // v60-09-01: stamp status:'active' so the picker's archive-filter (status !== 'archived')
        // treats new uploads as active without relying on the missing-status backward-compat fallback.
        await db.collection('songs').doc(fileId).set({
            title,
            normalizedTitle: title.toLowerCase(),
            status: 'active',
            updatedAt: Date.now()
        }, { merge: true })

        logger.info(`[Upload] ${title} uploaded successfully as ${fileId}`)

        // Purge CDN and Next.js data caches so the next library fetch sees the upload
        revalidatePath('/api/library/list')
        revalidatePath('/(main)/library', 'page')

        return NextResponse.json({
            success: true,
            fileId,
            title,
            message: `"${title}" uploaded to library`
        }, { status: 201 })
    }
)
