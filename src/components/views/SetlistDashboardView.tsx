"use client"

import { useState } from "react"
import { SetlistDashboard } from "@/components/setlist/SetlistDashboard"
import { ImportModal } from "@/components/setlist/ImportModal"
import { SetlistTrack, Setlist } from "@/lib/setlist-firebase"

interface SetlistDashboardViewProps {
    driveFiles: any[]
    onBack: () => void
    onEditSetlist: (setlist: Setlist) => void
    onCreateNew: () => void
    onImportSuccess: (tracks: SetlistTrack[], name: string) => void
}

export function SetlistDashboardView({
    driveFiles,
    onBack,
    onEditSetlist,
    onCreateNew,
    onImportSuccess
}: SetlistDashboardViewProps) {
    const [showImportModal, setShowImportModal] = useState(false)

    return (
        <>
            <SetlistDashboard
                onBack={onBack}
                onSelect={(setlist) => onEditSetlist(setlist)}
                onImport={() => setShowImportModal(true)}
                onCreateNew={onCreateNew}
            />
            {showImportModal && (
                <ImportModal
                    driveFiles={driveFiles}
                    onClose={() => setShowImportModal(false)}
                    onImport={(tracks, suggestedName) => {
                        setShowImportModal(false)
                        onImportSuccess(tracks, suggestedName)
                    }}
                />
            )}
        </>
    )
}
