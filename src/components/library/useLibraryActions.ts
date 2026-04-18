import { useState } from "react"
import { apiFetch } from "@/lib/api-client"
import { toast } from "sonner"
import { DriveFile } from "@/types/models"
import { logger } from "@/lib/logger"

interface UseLibraryActionsOptions {
    loadLibrary: () => void
    getCleanName: (name: string) => string
}

export function useLibraryActions({ loadLibrary, getCleanName }: UseLibraryActionsOptions) {
    const [digitizing, setDigitizing] = useState<string | null>(null)

    const handleDigitize = async (file: DriveFile) => {
        try {
            setDigitizing(file.id)
            toast.info(`Digitizing "${file.name}"... This may take ~20s`)

            const omrRes = await apiFetch('/api/ai/omr', {
                method: 'POST',
                body: JSON.stringify({ fileId: file.id })
            })

            if (!omrRes.ok) {
                if (omrRes.status === 504) throw new Error("The AI took too long. The file might be too complex or large.")
                const text = await omrRes.text()
                let errorMsg = "Digitization failed"
                try { const json = JSON.parse(text); if (json.error) errorMsg = json.error }
                catch { errorMsg = `Server Error (${omrRes.status}): ${text.substring(0, 50)}...` }
                throw new Error(errorMsg)
            }

            const omrData = await omrRes.json()
            toast.info("Saving MusicXML...")

            const saveRes = await apiFetch('/api/drive/save', {
                method: 'POST',
                body: JSON.stringify({ sourceFileId: file.id, xmlContent: omrData.xml })
            })

            if (!saveRes.ok) {
                const saveError = await saveRes.json()
                throw new Error(saveError.error || "Failed to save XML")
            }

            toast.success("Saved! The MusicXML file is now in the library.")
            loadLibrary()
        } catch (e: unknown) {
            logger.error("Digitize Error:", e)
            toast.error(e instanceof Error ? e.message : "Digitize failed")
        } finally {
            setDigitizing(null)
        }
    }

    const handleArchive = (file: DriveFile) => {
        if (confirm(`Are you sure you want to archive "${getCleanName(file.name)}"? It will be hidden from the main library.`)) {
            toast.promise(
                apiFetch(`/api/library/archive`, {
                    method: 'PATCH',
                    body: JSON.stringify({ fileId: file.id, archive: true })
                }).then(res => {
                    if (!res.ok) throw new Error("Failed to archive chart")
                    loadLibrary()
                }),
                {
                    loading: 'Archiving chart...',
                    success: 'Chart archived successfully',
                    error: 'Failed to archive chart'
                }
            )
        }
    }

    const handleRename = (file: DriveFile) => {
        const currentName = file.displayName || getCleanName(file.name)
        const newName = prompt("Rename chart:", currentName)
        if (newName && newName.trim() && newName.trim() !== currentName) {
            toast.promise(
                apiFetch('/api/library/rename', {
                    method: 'PATCH',
                    body: JSON.stringify({ fileId: file.id, displayName: newName.trim() })
                }).then(res => {
                    if (!res.ok) throw new Error("Failed to rename chart")
                    loadLibrary()
                }),
                {
                    loading: 'Renaming...',
                    success: 'Chart renamed',
                    error: 'Failed to rename chart'
                }
            )
        }
    }

    return { digitizing, handleDigitize, handleArchive, handleRename }
}
