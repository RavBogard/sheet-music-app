import { initAdmin, getFirestore } from "@/lib/firebase-admin"
import { checkUserRateLimit } from "@/lib/rate-limit"
import { fetchFileById } from "@/lib/file-fetcher"
import { logger } from "@/lib/logger"

/**
 * MCP chart-download tool — return one chart's bytes (base64) + mimeType so
 * Claude Desktop can save or print it. Wraps the same `fetchFileById` path
 * the in-app file proxy / print pipeline use; Firebase Storage primary,
 * Google Drive fallback for legacy entries (`hasBrowserFetchMetadata`
 * heuristic intentionally allows public-read per Daniel's chart-access
 * policy — chart bytes are not security-sensitive).
 *
 * Auth model: any authenticated MCP token-holder may download. Per the
 * chart-access policy ([[feedback_chart_access_policy]] in auto-memory),
 * charts are intentionally accessible — there's no role gate beyond
 * "authenticated MCP request".
 *
 * Rate limit: `api` tier (60/min). Trusted leaders (admin / band_leader)
 * bypass — David Lazaroff bulk-downloading for a gig packet shouldn't get
 * 429'd. See [[feedback_admin_rate_limit_bypass]].
 */

type ToolError = { error: string }

/** Hard cap on raw bytes returned. ~20 MB ≈ ~27 MB base64 — well above any
 *  realistic single chart, but bounded so a runaway scan doesn't blow the
 *  MCP response budget. Caller gets a clear error suggesting they fetch a
 *  smaller version. */
export const DOWNLOAD_CHART_MAX_BYTES = 20 * 1024 * 1024

export interface DownloadChartArgs {
    fileId: string
}

export interface DownloadChartResult {
    ok: true
    fileId: string
    title: string
    fileName: string | null
    mimeType: string
    contentBase64: string
    sizeBytes: number
    source: "firebase-storage" | "google-drive-fallback"
}

async function readLeaderRole(
    db: FirebaseFirestore.Firestore,
    uid: string,
): Promise<"admin" | "band_leader" | "other"> {
    const snap = await db.collection("users").doc(uid).get()
    const role = snap.exists ? (snap.data()?.role as string | undefined) : undefined
    if (role === "admin") return "admin"
    if (role === "band_leader") return "band_leader"
    return "other"
}

export async function downloadChart(
    uid: string,
    args: DownloadChartArgs,
): Promise<DownloadChartResult | ToolError> {
    if (!args.fileId?.trim()) return { error: "fileId is required" }

    initAdmin()
    const db = getFirestore()

    const role = await readLeaderRole(db, uid)
    const bypass = role === "admin" || role === "band_leader"

    const limited = await checkUserRateLimit(uid, "api", { bypass })
    if (limited) return { error: limited.error }

    const indexRef = db.collection("library_index").doc(args.fileId)
    const indexSnap = await indexRef.get()
    if (!indexSnap.exists) return { error: "Chart not found" }
    const indexData = indexSnap.data() as Record<string, unknown>

    const title =
        (typeof indexData.name === "string" && indexData.name) ||
        (typeof indexData.title === "string" && indexData.title) ||
        args.fileId
    const indexMimeHint =
        typeof indexData.mimeType === "string" ? indexData.mimeType : undefined
    const indexFileName =
        typeof indexData.fileName === "string" ? indexData.fileName : null

    let fetched
    try {
        fetched = await fetchFileById(args.fileId, indexMimeHint)
    } catch (err) {
        logger.warn("[mcp] download_chart fetch threw", {
            fileId: args.fileId,
            err: err instanceof Error ? err.message : err,
        })
        return { error: "Failed to fetch chart bytes" }
    }
    if (!fetched) {
        return {
            error:
                "Chart file not found in Storage or Drive — the library entry exists but the underlying bytes are missing",
        }
    }

    if (fetched.buffer.byteLength > DOWNLOAD_CHART_MAX_BYTES) {
        return {
            error:
                `Chart is ${fetched.buffer.byteLength} bytes — exceeds the ` +
                `${DOWNLOAD_CHART_MAX_BYTES}-byte download cap. Ask an admin to ` +
                `re-upload a compressed version, or fetch the original from the library URL directly.`,
        }
    }

    logger.info("[mcp] chart downloaded", {
        fileId: args.fileId,
        size: fetched.buffer.byteLength,
        source: fetched.source,
    })

    return {
        ok: true,
        fileId: args.fileId,
        title,
        fileName: indexFileName,
        mimeType: fetched.contentType,
        contentBase64: fetched.buffer.toString("base64"),
        sizeBytes: fetched.buffer.byteLength,
        source: fetched.source,
    }
}
