import { useState } from 'react'
import * as XLSX from 'xlsx'
import { useLibraryStore } from '@/lib/library-store'
import { DriveFile } from '@/types/models'
import { useSetlistStore } from '@/lib/setlist-store'
import { levenshtein } from '@/lib/utils'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner' // Added import

export function useSetlistImport() {
    const { allFiles } = useLibraryStore()
    const { addItem, clear: clearSetlist } = useSetlistStore()
    const [importing, setImporting] = useState(false)
    const router = useRouter()

    const importSetlistFromExcel = async (file: DriveFile) => {
        // Removed blocking confirm. Assumes UI handled it.
        // if (!confirm(`Import Setlist "${file.name}"? This will replace your current list.`)) return

        setImporting(true)
        try {
            const res = await fetch(`/api/drive/file/${file.id}`)
            if (!res.ok) throw new Error("Download failed")
            const blob = await res.blob()
            const workbook = XLSX.read(await blob.arrayBuffer(), { type: 'array' })
            const data = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]])

            clearSetlist()

            // Heuristic Matching Logic
            data.forEach((row: any) => {
                const rawName = row['Song'] || row['Name'] || Object.values(row)[0]
                if (!rawName) return

                const cleanTarget = String(rawName).toLowerCase().trim()

                let bestMatch: DriveFile | undefined = undefined
                let bestScore = 0

                for (const df of allFiles) {
                    if (df.mimeType.includes('folder') || df.mimeType.includes('spreadsheet')) continue
                    const rawFileName = df.name.toLowerCase().replace(/\.(pdf|musicxml|xml|mxl|xlsx)/, '')
                    const cleanFileName = rawFileName.replace(/[^a-z0-9]/g, ' ').trim()
                    const cleanTargetAlpha = cleanTarget.replace(/[^a-z0-9]/g, ' ').trim()

                    if (cleanFileName === cleanTargetAlpha) {
                        if (bestScore < 100) { bestScore = 100; bestMatch = df; }
                        continue
                    }
                    if (cleanFileName.startsWith(cleanTargetAlpha)) {
                        if (bestScore < 90) { bestScore = 90; bestMatch = df; }
                        continue
                    }

                    // Fuzzy Match
                    const targetTokens = cleanTargetAlpha.split(' ').filter(t => t.length > 0)
                    const fileTokens = cleanFileName.split(' ').filter(t => t.length > 0)
                    let matchedTokenCount = 0
                    targetTokens.forEach(tToken => {
                        const found = fileTokens.some(fToken => {
                            if (fToken === tToken) return true
                            if (Math.abs(fToken.length - tToken.length) > 2) return false
                            return levenshtein(fToken, tToken) <= 1
                        })
                        if (found) matchedTokenCount++
                    })

                    const matchRatio = matchedTokenCount / targetTokens.length
                    if (matchRatio === 1) {
                        const score = 80
                        if (score > bestScore) { bestScore = score; bestMatch = df; }
                    } else if (matchRatio >= 0.66) {
                        const score = 60
                        if (score > bestScore) { bestScore = score; bestMatch = df; }
                    }
                }

                if (rawName) {
                    addItem({
                        fileId: bestMatch ? bestMatch.id : `missing-${Math.random()}`,
                        name: String(rawName),
                        type: bestMatch && bestMatch.mimeType.includes('xml') ? 'musicxml' : 'pdf',
                        url: bestMatch ? `/api/drive/file/${bestMatch.id}` : undefined,
                        transposition: Number(row['Key'] || 0) || 0
                    })
                }
            })

            // Navigate to setlist editor
            // Since we are clearing the setlist store, we are essentially "editing new"
            // We'll redirect to the dashboard or editor
            router.push('/setlists/new') // Or wherever the dashboard logic points

        } catch (e) {
            console.error(e)
            toast.error("Failed to parse setlist")
        } finally {
            setImporting(false)
        }
    }

    return { importSetlistFromExcel, importing }
}
