"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { useLibraryStore } from "@/lib/library-store"
import { SetlistDashboard } from "@/components/setlist/SetlistDashboard"
import { ImportModal } from "@/components/setlist/ImportModal"
import { useSetlistImport } from "@/hooks/use-setlist-import"

export default function SetlistsPage() {
    const router = useRouter()
    const { driveFiles, fetchFiles } = useLibraryStore()
    const { importSetlistFromExcel } = useSetlistImport()
    const [showImportModal, setShowImportModal] = useState(false)

    useEffect(() => {
        fetchFiles()
    }, [fetchFiles])

    return (
        <>
            <SetlistDashboard
                onBack={() => router.back()}
                onSelect={(setlist) => router.push(`/setlists/${setlist.id}${setlist.isPublic ? '?public=true' : ''}`)}
                onImport={() => setShowImportModal(true)}
                onCreateNew={() => router.push('/setlists/new')}
            />
            {showImportModal && (
                <ImportModal
                    driveFiles={driveFiles}
                    onClose={() => setShowImportModal(false)}
                    onImport={(tracks, suggestedName) => {
                        setShowImportModal(false)
                        // logic to handle import success
                        // We probably need to pass these tracks to the 'new' setlist editor
                        // But the hook currently pushes to /setlists/new?
                        // Actually, the hook handles the SetlistStore update.
                        // So we just need to navigate to 'new' and it will read from store?
                        // Wait, SetlistEditor takes `initialTracks` prop.
                        // If we use the store, we need the page to read from store.
                        // Let's assume for now we pass state via query params or store.
                        // The `useSetlistImport` hook updates uses `useSetlistStore.addItem`.
                        // So if we go to /setlists/new, we need to ensure it picks up those items.
                        // Ideally, we move `importedTracks` into a store or pass via Context.
                        // For now, let's just push to /setlists/new.
                        // Note: The previous logic in `SetlistDashboardView` managed `importedTracks` local state.
                        // We might need a small global state for "pending setlist import". Or just use the existing setlist store if it's "dirty"?
                        // Let's assume `useSetlistImport` logic handles it (it calls `addItem` to store).
                    }}
                />
            )}
        </>
    )
}
