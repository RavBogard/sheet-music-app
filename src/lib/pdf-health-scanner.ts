import type { DriveFile } from '@/types/models'
import { parseFileId } from '@/lib/utils'

export interface ScanResult {
    fileId: string
    fileName: string
    status: 'healthy' | 'corrupt' | 'fetch-error'
    error?: string
    pages?: number
}

export interface ScanProgress {
    current: number
    total: number
    fileName: string
}

/**
 * Scans library PDF files for health by attempting to load each via pdfjs.
 * Processes files sequentially to avoid overwhelming the server.
 */
export async function scanLibraryHealth(
    files: DriveFile[],
    onProgress?: (progress: ScanProgress) => void
): Promise<ScanResult[]> {
    // Filter to PDF files only
    const pdfFiles = files.filter(f =>
        f.mimeType === 'application/pdf' || f.name?.toLowerCase().endsWith('.pdf')
    )

    const results: ScanResult[] = []

    for (let i = 0; i < pdfFiles.length; i++) {
        const file = pdfFiles[i]
        onProgress?.({ current: i + 1, total: pdfFiles.length, fileName: file.name })

        // Pace requests to stay within app-level rate limit (60 req/min).
        // 1100ms delay = ~54 req/min, safely under the limit.
        if (i > 0) await new Promise(r => setTimeout(r, 1100))

        const result = await scanSingleFile(file)
        results.push(result)
    }

    return results
}

async function scanSingleFile(file: DriveFile): Promise<ScanResult> {
    const { apiUrl } = parseFileId(file.id)

    try {
        const res = await fetch(apiUrl)

        if (!res.ok) {
            return {
                fileId: file.id,
                fileName: file.name,
                status: 'fetch-error',
                error: `HTTP ${res.status}`
            }
        }

        const contentType = res.headers.get('content-type') || ''
        if (contentType.includes('text/html') || contentType.includes('application/json')) {
            return {
                fileId: file.id,
                fileName: file.name,
                status: 'fetch-error',
                error: `Unexpected content type: ${contentType}`
            }
        }

        const arrayBuffer = await res.arrayBuffer()

        if (arrayBuffer.byteLength < 100) {
            return {
                fileId: file.id,
                fileName: file.name,
                status: 'corrupt',
                error: `File too small (${arrayBuffer.byteLength} bytes)`
            }
        }

        // Dynamically import pdfjs to avoid SSR issues (DOMMatrix not available in Node)
        const { pdfjs } = await import('react-pdf')

        // Disable worker for scanner — runs pdfjs in main thread.
        // Scanner only validates PDFs (page count), not renders them,
        // so worker overhead is unnecessary and avoids worker URL issues.
        pdfjs.GlobalWorkerOptions.workerSrc = ""

        const loadingTask = pdfjs.getDocument({ data: new Uint8Array(arrayBuffer) })
        const pdf = await loadingTask.promise
        const pages = pdf.numPages
        pdf.destroy()

        return {
            fileId: file.id,
            fileName: file.name,
            status: 'healthy',
            pages
        }
    } catch (err) {
        return {
            fileId: file.id,
            fileName: file.name,
            status: 'corrupt',
            error: err instanceof Error ? err.message : String(err)
        }
    }
}
