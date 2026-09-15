import type { ReaderMusicCrosswalk } from "@/lib/reader-music"

/**
 * Public reader-chart publication is deliberately code-reviewed and finite.
 * A Firestore flag alone can never publish another chart: adding a prayer or
 * arrangement requires a code change to this table as well as an exact
 * crosswalk approval.
 */
export interface PublicReaderChartDefinition {
    unitId: string
    pieceId: string
    orgId: "crc"
    kind: "pdf"
    contentType: "application/pdf"
}

/**
 * Immutable bytes approved for one public-reader crosswalk.
 *
 * This object is intentionally nested under `publicReaderManifest` on the
 * existing crosswalk document.  That makes the rollout additive for private
 * reader-music users while old `publicReaderStatus: "approved"` rows fail
 * closed until an operator records the exact reviewed object.
 */
export interface PublicReaderChartManifest {
    version: 1
    songId: string
    fileId: string
    storagePath: string
    generation: string
    sha256: string
    sizeBytes: number
    contentType: "application/pdf"
}

export interface ApprovedPublicReaderCrosswalk extends ReaderMusicCrosswalk {
    publicReaderManifest: PublicReaderChartManifest
}

export const MODEH_ANI_PUBLIC_READER_CHART = Object.freeze({
    unitId: "awakening.modeh-ani@legacy-shabbat-morning",
    pieceId: "modeh-ani.halpert",
    orgId: "crc",
    kind: "pdf",
    contentType: "application/pdf",
} satisfies PublicReaderChartDefinition)

const PUBLIC_READER_CHARTS = new Map<string, PublicReaderChartDefinition>([
    [MODEH_ANI_PUBLIC_READER_CHART.unitId, MODEH_ANI_PUBLIC_READER_CHART],
])

/**
 * Vercel's non-streaming response limit is 4.5 MB.  Keep a full 512 KiB of
 * headroom for platform framing and reject from object metadata before a byte
 * stream is opened.
 */
export const MAX_PUBLIC_READER_CHART_BYTES = 4 * 1024 * 1024

/**
 * Deployment kill switch. It is intentionally default-off; the exact
 * crosswalk still has to carry `publicReaderStatus: "approved"` when on.
 *
 * TRIMMED, on evidence. The production variable currently reads `"false\r\n"`
 * — a trailing CRLF was baked into the value when it was set on 2026-09-07.
 * It is false either way today, so nothing is public. But an untrimmed compare
 * means the day someone deliberately turns this ON the same way, the value
 * arrives as `"true\r\n"`, the switch silently stays OFF, and the person who
 * flipped it has no signal at all. A switch that cannot be trusted to obey is
 * worse than a strict one: only the exact word `true` enables, whitespace
 * around it does not change what was meant.
 */
export function publicReaderChartsEnabled(): boolean {
    return (process.env.READER_PUBLIC_CHARTS_ENABLED ?? "").trim() === "true"
}

export function publicReaderChartDefinition(
    unitId: string,
): PublicReaderChartDefinition | null {
    if (!publicReaderChartsEnabled()) return null
    return PUBLIC_READER_CHARTS.get(unitId) ?? null
}

/**
 * Turn an untrusted Firestore row into the reviewed selection contract.
 * No fuzzy title, file id, or default-tenant behavior is accepted here.
 */
export function approvedPublicReaderCrosswalk(
    row: Record<string, unknown>,
    definition: PublicReaderChartDefinition,
): ApprovedPublicReaderCrosswalk | null {
    if (
        row.status !== "reviewed" ||
        row.publicReaderStatus !== "approved" ||
        row.orgId !== definition.orgId ||
        row.momentId !== definition.unitId ||
        row.pieceId !== definition.pieceId
    ) {
        return null
    }

    const manifest = publicReaderManifest(row.publicReaderManifest, definition)
    if (!manifest) return null
    return {
        orgId: definition.orgId,
        momentId: definition.unitId,
        pieceId: definition.pieceId,
        status: "reviewed",
        publicReaderManifest: manifest,
    }
}

function exactId(value: unknown): string | null {
    if (typeof value !== "string" || value !== value.trim() || !value) return null
    // IDs are data keys, never paths.  Keeping them single-segment also makes
    // the storage-path/file-id binding below unambiguous.
    return /^[A-Za-z0-9_-]+$/.test(value) ? value : null
}

export function normalizeReaderMusicMime(value: unknown): string | null {
    if (typeof value !== "string") return null
    const normalized = value.split(";", 1)[0]?.trim().toLowerCase()
    return normalized || null
}

function publicReaderManifest(
    value: unknown,
    definition: PublicReaderChartDefinition,
): PublicReaderChartManifest | null {
    if (!value || typeof value !== "object" || Array.isArray(value)) return null
    const row = value as Record<string, unknown>
    if (Object.keys(row).some((key) => ![
        "version",
        "songId",
        "fileId",
        "storagePath",
        "generation",
        "sha256",
        "sizeBytes",
        "contentType",
    ].includes(key))) return null

    const songId = exactId(row.songId)
    const fileId = exactId(row.fileId)
    const generation =
        typeof row.generation === "string" && /^[1-9][0-9]*$/.test(row.generation)
            ? row.generation
            : null
    const sha256 =
        typeof row.sha256 === "string" && /^[a-f0-9]{64}$/i.test(row.sha256)
            ? row.sha256.toLowerCase()
            : null
    const sizeBytes = row.sizeBytes
    const contentType = normalizeReaderMusicMime(row.contentType)
    if (
        row.version !== 1 ||
        !songId ||
        !fileId ||
        !generation ||
        !sha256 ||
        typeof sizeBytes !== "number" ||
        !Number.isSafeInteger(sizeBytes) ||
        sizeBytes <= 0 ||
        sizeBytes > MAX_PUBLIC_READER_CHART_BYTES ||
        contentType !== definition.contentType
    ) return null

    const allowedPaths = new Set([
        `library/${fileId}`,
        `library/${fileId}.pdf`,
    ])
    if (typeof row.storagePath !== "string" || !allowedPaths.has(row.storagePath)) {
        return null
    }
    return {
        version: 1,
        songId,
        fileId,
        storagePath: row.storagePath,
        generation,
        sha256,
        sizeBytes,
        contentType: definition.contentType,
    }
}

export function isSafePublicReaderChart(
    contentType: string | null | undefined,
    bytes: Uint8Array,
    definition: PublicReaderChartDefinition,
): boolean {
    const normalized = normalizeReaderMusicMime(contentType)
    if (normalized !== definition.contentType) return false
    if (bytes.byteLength === 0 || bytes.byteLength > MAX_PUBLIC_READER_CHART_BYTES) {
        return false
    }

    // The sole approved pilot is a PDF. Check the bytes, not only mutable
    // Storage metadata, before giving the response a browser-renderable MIME.
    return (
        bytes.byteLength >= 5 &&
        bytes[0] === 0x25 &&
        bytes[1] === 0x50 &&
        bytes[2] === 0x44 &&
        bytes[3] === 0x46 &&
        bytes[4] === 0x2d
    )
}
