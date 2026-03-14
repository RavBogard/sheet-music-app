import { NextResponse } from "next/server"
import { revalidatePath } from "next/cache"
import { createApiHandler } from "@/lib/api-wrapper"
import { initAdmin, getFirestore } from "@/lib/firebase-admin"
import { uploadToStorage } from "@/lib/firebase-storage"
import { checkRateLimit } from "@/lib/rate-limit"
import { logger } from "@/lib/logger"
import crypto from "crypto"
import { levenshteinDistance } from "@/lib/string-utils"

// Max file size: 25MB
const MAX_FILE_SIZE = 25 * 1024 * 1024

const ALLOWED_TYPES: Record<string, string> = {
    'application/pdf': '.pdf',
    'application/xml': '.xml',
    'text/xml': '.xml',
    'application/vnd.recordare.musicxml+xml': '.musicxml',
    'application/vnd.recordare.musicxml': '.musicxml',
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
        initAdmin()
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
        if (!ALLOWED_TYPES[mimeType] && !file.name.match(/\.(pdf|xml|musicxml|mxl)$/i)) {
            return NextResponse.json(
                { error: "Only PDF and MusicXML files are supported" },
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
        const buffer = Buffer.from(await file.arrayBuffer())

        // Generate a unique ID (prefixed to distinguish from Drive files)
        const fileId = `upload-${crypto.randomUUID()}`

        // Extract metadata from form
        const rawTitle = formData.get('title') as string | null
        const title = rawTitle?.trim() || file.name.replace(/\.[^/.]+$/, '')
        const key = (formData.get('key') as string | null)?.trim() || undefined
        const bpmRaw = formData.get('bpm') ? Number(formData.get('bpm')) : undefined
        const bpm = bpmRaw != null && !isNaN(bpmRaw) && bpmRaw > 0 ? bpmRaw : undefined
        const tagsRaw = (formData.get('tags') as string | null)?.trim()
        const tags = tagsRaw ? tagsRaw.split(',').map(t => t.trim()).filter(Boolean) : []

        // Determine content type for storage
        const contentType = mimeType.includes('pdf') ? 'application/pdf'
            : mimeType.includes('xml') ? 'application/xml'
                : mimeType

        // 1. Duplicate Prevention Check -- query by nameLower prefix to avoid scanning all docs
        const nameLower = title.toLowerCase()
        const exactMatch = await db.collection('library_index')
            .where('status', '==', 'active')
            .where('nameLower', '==', nameLower)
            .limit(1)
            .get()

        if (!exactMatch.empty) {
            const existingName = exactMatch.docs[0].data().name
            return NextResponse.json({ error: `A chart with the same name ("${existingName}") already exists.` }, { status: 409 })
        }

        // Fuzzy check: query a narrow prefix range instead of loading all titles
        const prefix = nameLower.replace(/[^a-z0-9]/g, '').slice(0, 6)
        if (prefix.length >= 3) {
            const prefixEnd = prefix.slice(0, -1) + String.fromCharCode(prefix.charCodeAt(prefix.length - 1) + 1)
            const similarSnap = await db.collection('library_index')
                .where('status', '==', 'active')
                .where('nameLower', '>=', prefix)
                .where('nameLower', '<', prefixEnd)
                .select('name')
                .limit(20)
                .get()

            const normalizedNewTitle = nameLower.replace(/[^a-z0-9]/g, '')
            for (const doc of similarSnap.docs) {
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
            // Storage reference
            storageUrl: `library/${fileId}${contentType.includes('pdf') ? '.pdf' : '.xml'}`,
            // Status
            status: 'active',
        }

        await db.collection('library_index').doc(fileId).set(indexEntry)

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
