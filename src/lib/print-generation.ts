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
}

export interface GeneratePrintPayload {
    title: string
    date: string
    musicianName?: string
    eventName?: string
    rabbi?: string
    coverOnly: boolean
    tracks: PrintTrackPayload[]
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
            errorMsg = err.error || errorMsg
        } catch {
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
