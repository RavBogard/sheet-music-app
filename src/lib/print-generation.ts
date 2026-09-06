import { apiFetch } from "@/lib/api-client"
import { SetlistTrack } from "@/types/models"

export interface PrintTrackPayload {
    title: string
    key: string
    tune: string
    notes: string
    leadMusician: string
    fileId?: string
    /** v70-01-01 Task 3: forwarded to print-pipeline for image-skip detection. */
    fileName?: string
    /** v70-01-01 Task 3: forwarded to print-pipeline for image-skip detection. */
    mimeType?: string
    transposition: number
    preferFlats: boolean
    capoFret: number
    omitPdf: boolean
    type?: string
    performer?: string
    estimatedMinutes?: number
    description?: string
    /** Phase 4: printed page in the service's prayer book. The musician's
     *  packet needs this for the same reason the rabbi's sheet does. */
    liturgyRef?: { book: string; unitId?: string; folio: number }
    honors?: Array<{ name: string; note?: string }>
}

export interface GeneratePrintPayload {
    title: string
    date: string
    musicianName?: string
    eventName?: string
    rabbi?: string
    /** Phase 4: display title of the prayer book the cover's folio column
     *  indexes (already resolved from the setlist's `book` slug via
     *  `bookTitle()` in @/lib/books/titles). Forwarded verbatim to
     *  PrintRequest.bookTitle by the passthrough POST /api/setlist/print
     *  schema. Omitted → the cover names no book. */
    bookTitle?: string
    coverOnly: boolean
    /**
     * print-this-chart (PDFOverlay desktop print action): render the
     * track(s) WITHOUT the multi-page cover table. Forwarded verbatim to
     * PrintRequest.omitCover by the passthrough POST /api/setlist/print
     * schema. Omitted (every existing caller) → the cover renders exactly as
     * before.
     */
    omitCover?: boolean
    tracks: PrintTrackPayload[]
    allowOmissions?: boolean
}

export interface OmittedPrintChart {
    title: string
    fileId?: string
    reason: string
}

export class PrintChartsOmittedError extends Error {
    readonly omittedCharts: OmittedPrintChart[]

    constructor(omittedCharts: OmittedPrintChart[]) {
        super('Some charts could not be included in the packet.')
        this.name = 'PrintChartsOmittedError'
        this.omittedCharts = omittedCharts
    }
}

export async function generatePdfBlob(payload: GeneratePrintPayload): Promise<Blob> {
    const response = await apiFetch('/api/setlist/print', {
        method: 'POST',
        body: JSON.stringify(payload)
    })

    if (!response.ok) {
        let errorMsg = 'Failed to generate PDF'
        try {
            const err = await response.json()
            if (err.code === 'PRINT_CHARTS_OMITTED' && Array.isArray(err.details?.omittedCharts)) {
                throw new PrintChartsOmittedError(err.details.omittedCharts)
            }
            errorMsg = err.error || errorMsg
        } catch (error) {
            if (error instanceof PrintChartsOmittedError) throw error
            errorMsg = `Server error (${response.status})`
        }
        throw new Error(errorMsg)
    }

    return response.blob()
}

export async function generateZipBlob(
    files: { name: string; blob: Blob }[],
    onProgress?: (completed: number, total: number) => void
): Promise<Blob> {
    const JSZip = (await import("jszip")).default
    const zip = new JSZip()

    let completed = 0
    const total = files.length

    for (const file of files) {
        zip.file(file.name, file.blob)
        completed++
        if (onProgress) onProgress(completed, total)
    }

    return zip.generateAsync({ type: 'blob' })
}

export function downloadBlob(blob: Blob, filename: string) {
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
}
