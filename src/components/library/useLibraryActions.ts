import { useState } from "react"
import { apiFetch } from "@/lib/api-client"
import { toast } from "sonner"
import { DriveFile } from "@/types/models"
import { logger } from "@/lib/logger"
import { useT } from "@/i18n/client"

interface UseLibraryActionsOptions {
    loadLibrary: () => void
    getCleanName: (name: string) => string
}

export function useLibraryActions({ loadLibrary, getCleanName }: UseLibraryActionsOptions) {
    const t = useT()
    const [digitizing, setDigitizing] = useState<string | null>(null)

    const handleDigitize = async (file: DriveFile) => {
        try {
            setDigitizing(file.id)
            toast.info(t("library.actions.digitizingToast", { name: file.name }))

            const omrRes = await apiFetch('/api/ai/omr', {
                method: 'POST',
                body: JSON.stringify({ fileId: file.id })
            })

            if (!omrRes.ok) {
                if (omrRes.status === 504) throw new Error(t("library.actions.digitizeTimeout"))
                const text = await omrRes.text()
                let errorMsg = t("library.actions.digitizationFailed")
                try { const json = JSON.parse(text); if (json.error) errorMsg = json.error }
                catch { errorMsg = t("library.actions.serverError", { status: omrRes.status, detail: text.substring(0, 50) }) }
                throw new Error(errorMsg)
            }

            const omrData = await omrRes.json()
            toast.info(t("library.actions.savingMusicXml"))

            const saveRes = await apiFetch('/api/drive/save', {
                method: 'POST',
                body: JSON.stringify({ sourceFileId: file.id, xmlContent: omrData.xml })
            })

            if (!saveRes.ok) {
                const saveError = await saveRes.json()
                throw new Error(saveError.error || t("library.actions.saveXmlFailed"))
            }

            toast.success(t("library.actions.savedMusicXml"))
            loadLibrary()
        } catch (e: unknown) {
            logger.error("Digitize Error:", e)
            toast.error(e instanceof Error ? e.message : t("library.actions.digitizeFailed"))
        } finally {
            setDigitizing(null)
        }
    }

    const handleArchive = (file: DriveFile) => {
        if (confirm(t("library.actions.archiveConfirm", { name: getCleanName(file.name) }))) {
            toast.promise(
                apiFetch(`/api/library/archive`, {
                    method: 'PATCH',
                    body: JSON.stringify({ fileId: file.id, archive: true })
                }).then(res => {
                    if (!res.ok) throw new Error(t("library.actions.archiveFailed"))
                    loadLibrary()
                }),
                {
                    loading: t("library.actions.archiving"),
                    success: t("library.actions.archived"),
                    error: t("library.actions.archiveFailed")
                }
            )
        }
    }

    const handleRename = (file: DriveFile) => {
        const currentName = file.displayName || getCleanName(file.name)
        const newName = prompt(t("library.actions.renamePrompt"), currentName)
        if (newName && newName.trim() && newName.trim() !== currentName) {
            toast.promise(
                apiFetch('/api/library/rename', {
                    method: 'PATCH',
                    body: JSON.stringify({ fileId: file.id, displayName: newName.trim() })
                }).then(res => {
                    if (!res.ok) throw new Error(t("library.actions.renameFailed"))
                    loadLibrary()
                }),
                {
                    loading: t("library.actions.renaming"),
                    success: t("library.actions.renamed"),
                    error: t("library.actions.renameFailed")
                }
            )
        }
    }

    return { digitizing, handleDigitize, handleArchive, handleRename }
}
