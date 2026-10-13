import { useState, useCallback, Dispatch, SetStateAction } from "react"
import { SetlistTrack } from "@/types/models"
import { toast } from "sonner"
import { useT } from "@/i18n/client"

interface UseBatchSelectionParams {
    tracks: SetlistTrack[]
    addToHistory: (tracks: SetlistTrack[]) => void
    setTracks: Dispatch<SetStateAction<SetlistTrack[]>>
    undo: () => void
}

export function useBatchSelection({ tracks, addToHistory, setTracks, undo }: UseBatchSelectionParams) {
    const t = useT()
    const [selectMode, setSelectMode] = useState(false)
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

    const toggleSelectId = useCallback((id: string) => {
        setSelectedIds(prev => {
            const next = new Set(prev)
            if (next.has(id)) next.delete(id)
            else next.add(id)
            return next
        })
    }, [])

    const handleBatchDelete = useCallback(() => {
        if (selectedIds.size === 0) return
        addToHistory(tracks)
        setTracks(prev => prev.filter(tr => !selectedIds.has(tr.id)))
        toast(t("hooks.itemsDeleted", { count: selectedIds.size }), {
            action: { label: t("hooks.undo"), onClick: () => undo() },
            duration: 5000,
        })
        setSelectedIds(new Set())
    }, [selectedIds, tracks, addToHistory, setTracks, undo, t])

    const handleBatchDuplicate = useCallback(() => {
        if (selectedIds.size === 0) return
        addToHistory(tracks)
        const newTracks = [...tracks]
        const selectedArr = tracks.filter(t => selectedIds.has(t.id))
        const lastSelectedIdx = tracks.findIndex(t => t.id === selectedArr[selectedArr.length - 1]?.id)
        const duplicates = selectedArr.map(t => ({
            ...t,
            id: crypto.randomUUID(),
        }))
        newTracks.splice(lastSelectedIdx + 1, 0, ...duplicates)
        setTracks(newTracks)
        toast(t("hooks.itemsDuplicated", { count: selectedIds.size }))
        setSelectedIds(new Set())
    }, [selectedIds, tracks, addToHistory, setTracks, t])

    const exitSelectMode = useCallback(() => {
        setSelectMode(false)
        setSelectedIds(new Set())
    }, [])

    return {
        selectMode,
        setSelectMode,
        selectedIds,
        setSelectedIds,
        toggleSelectId,
        handleBatchDelete,
        handleBatchDuplicate,
        exitSelectMode,
    }
}
