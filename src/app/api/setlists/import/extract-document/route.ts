import { NextResponse } from "next/server"

import { createApiHandler } from "@/lib/api-wrapper"
import { checkRateLimit } from "@/lib/rate-limit"
import {
    detectDocumentFormat,
    extractDocumentText,
} from "@/lib/setlist-import/extract-document"

// PDF text extraction can be slow on larger documents — matches import/parse.
export const maxDuration = 60

// Max document size: 25MB (matches the library / recordings upload caps).
const MAX_FILE_SIZE = 25 * 1024 * 1024

/**
 * POST /api/setlists/import/extract-document
 *
 * Extracts raw text from an uploaded .docx / .pdf / .txt document. Foundation
 * slice for v7.0 doc-driven setlist creation — this route ONLY extracts text
 * and returns it; the setlist gets created later in the v70-05 → v70-07
 * pipeline. Sibling of /api/setlists/import/parse + /execute.
 *
 * Accepts multipart/form-data with a single `file` field. band_leader only —
 * the whole doc-import pipeline is a band-leader feature (consistent with
 * commit-document + execute); it drives billed server-side parsing.
 */
export const POST = createApiHandler(async (ctx) => {
    const limited = await checkRateLimit(ctx.req, 'upload')
    if (limited) return limited

    const formData = await ctx.req.formData()
    const file = formData.get('file') as File | null

    if (!file) {
        return NextResponse.json({ error: "No file provided" }, { status: 400 })
    }
    if (file.size > MAX_FILE_SIZE) {
        return NextResponse.json(
            {
                error: `File too large. Maximum size is ${MAX_FILE_SIZE / 1024 / 1024}MB`,
            },
            { status: 400 },
        )
    }

    // Reject unsupported types BEFORE buffering the file / invoking mammoth/pdfjs.
    if (!detectDocumentFormat(file.name, file.type)) {
        return NextResponse.json(
            { error: "Only .docx, .pdf, and .txt documents are supported." },
            { status: 400 },
        )
    }

    const buffer = Buffer.from(await file.arrayBuffer())
    const result = await extractDocumentText(buffer, {
        fileName: file.name,
        mimeType: file.type,
    })

    if (!result.ok) {
        // unsupported_format / empty → 400 (client error); extraction_failed →
        // 422 (the file was a supported type but could not be read).
        const status = result.reason === 'extraction_failed' ? 422 : 400
        return NextResponse.json({ error: result.message }, { status })
    }

    return NextResponse.json({
        success: true,
        text: result.text,
        format: result.format,
        fileName: file.name,
        charCount: result.charCount,
    })
}, { role: 'band_leader' })
