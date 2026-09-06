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

/** 10 MiB is ample for the reviewed pilot and bounds origin/CDN abuse. */
export const MAX_PUBLIC_READER_CHART_BYTES = 10 * 1024 * 1024

/**
 * Deployment kill switch. It is intentionally default-off; the exact
 * crosswalk still has to carry `publicReaderStatus: "approved"` when on.
 */
export function publicReaderChartsEnabled(): boolean {
    return process.env.READER_PUBLIC_CHARTS_ENABLED === "true"
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
): ReaderMusicCrosswalk | null {
    if (
        row.status !== "reviewed" ||
        row.publicReaderStatus !== "approved" ||
        row.orgId !== definition.orgId ||
        row.momentId !== definition.unitId ||
        row.pieceId !== definition.pieceId
    ) {
        return null
    }
    return {
        orgId: definition.orgId,
        momentId: definition.unitId,
        pieceId: definition.pieceId,
        status: "reviewed",
    }
}

export function isSafePublicReaderChart(
    contentType: string | null | undefined,
    bytes: Uint8Array,
    definition: PublicReaderChartDefinition,
): boolean {
    const normalized = contentType?.split(";", 1)[0]?.trim().toLowerCase()
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
