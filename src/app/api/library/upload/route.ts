// v70-08-04 guard: this route ingests file bytes through the heavy server-
// only library-upload pipeline (heic-convert, musescore-converter). Route
// handlers are already server-only, but the explicit boundary is preserved
// here for defense-in-depth — `library-upload.ts` carries the same guard
// where the heavy deps now actually live after Wave 3's refactor.
import 'server-only'
import { NextResponse } from "next/server"
import { revalidatePath } from "next/cache"
import { createApiHandler } from "@/lib/api-wrapper"
import { initAdmin, getFirestore } from "@/lib/firebase-admin"
import { checkRateLimit } from "@/lib/rate-limit"
import {
    processChartUpload,
    type LibraryCollection,
} from "@/lib/library-upload"

/**
 * POST /api/library/upload
 *
 * Direct file upload to the library. Accepts multipart/form-data with:
 *   - file: PDF / MusicXML / MuseScore / image / HEIC / text
 *   - title (optional)
 *   - key / bpm / tags (optional)
 *   - collection: 'core' | 'supplemental' | 'uploads' (defaults to 'uploads')
 *
 * Requires canUpload flag on user profile OR an admin / band leader /
 * musician role. The HTTP-specific work (formData parsing, role check,
 * revalidatePath) lives here; the actual upload pipeline (conversion,
 * dedup, Storage + library_index + songs writes) is in @/lib/library-upload
 * so the MCP upload_chart tool can share the same codepath.
 */
export const POST = createApiHandler(async (ctx) => {
    const limited = await checkRateLimit(ctx.req, "upload")
    if (limited) return limited

    if (!initAdmin()) {
        return NextResponse.json(
            { error: "Server not ready", code: "FIREBASE_NOT_INITIALIZED" },
            { status: 500 },
        )
    }
    const db = getFirestore()

    const userDoc = await db.collection("users").doc(ctx.auth.uid).get()
    const isPrivilegedRole =
        ctx.auth.isAdmin || ctx.auth.isBandLeader || ctx.auth.isMusician
    if (
        !isPrivilegedRole &&
        (!userDoc.exists || !userDoc.data()?.canUpload)
    ) {
        return NextResponse.json(
            {
                error: "Upload permission required. Ask an admin to enable uploads for your account.",
            },
            { status: 403 },
        )
    }

    const formData = await ctx.req.formData()
    const file = formData.get("file") as File | null
    if (!file) {
        return NextResponse.json({ error: "No file provided" }, { status: 400 })
    }

    const rawTitle = formData.get("title") as string | null
    const keyRaw = (formData.get("key") as string | null)?.trim()
    const bpmRaw = formData.get("bpm") ? Number(formData.get("bpm")) : undefined
    const bpm =
        bpmRaw != null && !isNaN(bpmRaw) && bpmRaw > 0 ? bpmRaw : undefined
    const tagsRaw = (formData.get("tags") as string | null)?.trim()
    const tags = tagsRaw
        ? tagsRaw.split(",").map((t) => t.trim()).filter(Boolean)
        : []
    const collection =
        (formData.get("collection") as string | null)?.trim() || undefined

    const buffer = Buffer.from(await file.arrayBuffer())

    const result = await processChartUpload({
        buffer,
        originalFileName: file.name,
        mimeType: file.type || "application/octet-stream",
        title: rawTitle ?? undefined,
        collection: collection as LibraryCollection | undefined,
        key: keyRaw || undefined,
        bpm,
        tags,
        uploaderUid: ctx.auth.uid,
        uploaderEmail: ctx.auth.email,
    })

    if (!result.ok) {
        return NextResponse.json({ error: result.error }, { status: result.status })
    }

    revalidatePath("/api/library/list")
    revalidatePath("/(main)/library", "page")

    return NextResponse.json(
        {
            success: true,
            fileId: result.fileId,
            title: result.title,
            message: `"${result.title}" uploaded to library`,
        },
        { status: 201 },
    )
})
