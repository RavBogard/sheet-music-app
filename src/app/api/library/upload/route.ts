import { NextRequest, NextResponse } from "next/server"
import { revalidatePath } from "next/cache"
import { withAuth } from "@/lib/api-auth"
import { initAdmin, getFirestore } from "@/lib/firebase-admin"
import { uploadToStorage } from "@/lib/firebase-storage"
import { checkRateLimit } from "@/lib/rate-limit"
import { logger } from "@/lib/logger"
import crypto from "crypto"

// Max file size: 25MB
const MAX_FILE_SIZE = 25 * 1024 * 1024

function levenshteinDistance(a: string, b: string): number {
    if (a.length === 0) return b.length;
    if (b.length === 0) return a.length;

    const matrix = [];
    let i, j;
    for (i = 0; i <= b.length; i++) matrix[i] = [i];
    for (j = 0; j <= a.length; j++) matrix[0][j] = j;

    for (i = 1; i <= b.length; i++) {
        for (j = 1; j <= a.length; j++) {
            if (b.charAt(i - 1) === a.charAt(j - 1)) {
                matrix[i][j] = matrix[i - 1][j - 1];
            } else {
                matrix[i][j] = Math.min(
                    matrix[i - 1][j - 1] + 1, // substitution
                    Math.min(matrix[i][j - 1] + 1, // insertion
                        matrix[i - 1][j] + 1) // deletion
                );
            }
        }
    }
    return matrix[b.length][a.length];
}

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
 * Requires 'band_leader' role or above.
 */
export async function POST(req: NextRequest) {
    try {
        // Rate limit: 10 uploads/min
        const limited = await checkRateLimit(req, 'upload')
        if (limited) return limited

        // Auth check: leaders and admins can upload
        const auth = await withAuth(req, 'band_leader')
        if (auth instanceof NextResponse) return auth

        const formData = await req.formData()
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
        const bpm = formData.get('bpm') ? Number(formData.get('bpm')) : undefined
        const tagsRaw = (formData.get('tags') as string | null)?.trim()
        const tags = tagsRaw ? tagsRaw.split(',').map(t => t.trim()).filter(Boolean) : []

        // Determine content type for storage
        const contentType = mimeType.includes('pdf') ? 'application/pdf'
            : mimeType.includes('xml') ? 'application/xml'
                : mimeType

        initAdmin()
        const db = getFirestore()

        // 1. Duplicate Prevention Check
        const librarySnapshot = await db.collection('library_index').where('status', '==', 'active').select('name').get();
        const existingTitles = librarySnapshot.docs.map((doc: any) => doc.data().name as string);
        const normalizedNewTitle = title.toLowerCase().replace(/[^a-z0-9]/g, '');

        for (const existing of existingTitles) {
            const normalizedExisting = existing.toLowerCase().replace(/[^a-z0-9]/g, '');
            if (normalizedNewTitle.length < 3 || normalizedExisting.length < 3) {
                if (normalizedNewTitle === normalizedExisting) {
                    return NextResponse.json({ error: `A chart with a very similar name ("${existing}") already exists.` }, { status: 409 });
                }
                continue;
            }

            const distance = levenshteinDistance(normalizedNewTitle, normalizedExisting);
            const maxLength = Math.max(normalizedNewTitle.length, normalizedExisting.length);
            const similarity = 1 - (distance / maxLength);

            if (similarity > 0.85) {
                return NextResponse.json({ error: `A chart with a similar name ("${existing}") already exists in the library.` }, { status: 409 });
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
            uploadedBy: auth.uid,
            uploadedByEmail: auth.email || 'unknown',
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

        logger.info(`[Upload] ✅ ${title} uploaded successfully as ${fileId}`)

        // Purge CDN and Next.js data caches so the next library fetch sees the upload
        revalidatePath('/api/library/list')
        revalidatePath('/(main)/library', 'page')

        return NextResponse.json({
            success: true,
            fileId,
            title,
            message: `"${title}" uploaded to library`
        })

    } catch (error: unknown) {
        logger.error("[Upload] Error:", error)
        return NextResponse.json(
            { error: error instanceof Error ? error.message : "Upload failed" },
            { status: 500 }
        )
    }
}
