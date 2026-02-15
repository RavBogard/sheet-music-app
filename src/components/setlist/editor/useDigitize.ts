import { useState, useCallback } from "react"
import { useAuth } from "@/lib/auth-context"
import { toast } from "sonner"
import { SetlistTrack } from "@/types/models"

interface UseDigitizeOptions {
    track: SetlistTrack
    onUpdate: (id: string, data: Partial<SetlistTrack>) => void
    onDuplicate?: (trackId: string, overrides?: Partial<SetlistTrack>) => void
}

/**
 * Handles AI digitization (OMR) of a PDF track into MusicXML.
 * Calls /api/ai/omr then /api/library/save-generated, and either
 * duplicates or updates the track with the result.
 */
export function useDigitize({ track, onUpdate, onDuplicate }: UseDigitizeOptions) {
    const { isAdmin, user } = useAuth()
    const [digitizing, setDigitizing] = useState(false)

    const handleDigitize = useCallback(async () => {
        if (!track.fileId) return

        try {
            setDigitizing(true)
            toast.info(`Digitizing "${track.fileName}"... This may take ~5 mins`)

            const token = await user?.getIdToken()

            // 1. Generate XML via OMR
            const omrRes = await fetch('/api/ai/omr', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ fileId: track.fileId })
            })

            if (!omrRes.ok) {
                if (omrRes.status === 504) {
                    throw new Error("The AI took too long to respond.")
                }
                const text = await omrRes.text()
                let errorMsg = "Digitization failed"
                try {
                    const json = JSON.parse(text)
                    if (json.error) errorMsg = json.error
                } catch {
                    errorMsg = `Server Error (${omrRes.status}): ${text.substring(0, 50)}...`
                }
                throw new Error(errorMsg)
            }

            const omrData = await omrRes.json()

            // 2. Save XML to App Library (Firestore)
            toast.info("Saving to Digital Library...")
            const saveRes = await fetch('/api/library/save-generated', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    sourceFileId: track.fileId,
                    xmlContent: omrData.xml,
                    title: track.title,
                    originalName: track.fileName || track.title
                })
            })

            if (!saveRes.ok) {
                const saveError = await saveRes.json()
                throw new Error(saveError.error || "Failed to save XML")
            }

            const saveData = await saveRes.json()

            // 3. Create duplicate track for the digital version
            if (onDuplicate) {
                onDuplicate(track.id, {
                    fileId: saveData.id,
                    fileName: `${track.title} (Digital).musicxml`,
                    title: `${track.title} (Digital Version)`
                })
                toast.success("Digitized! New digital version added to setlist.")
            } else {
                onUpdate(track.id, {
                    fileId: saveData.id,
                    fileName: `${track.title} (AI)`
                })
                toast.success("Digitized & Linked!")
            }

        } catch (e: unknown) {
            console.error("Digitize Error:", e)
            toast.error(e instanceof Error ? e.message : "Digitize failed")
        } finally {
            setDigitizing(false)
        }
    }, [track, user, onUpdate, onDuplicate])

    return { isAdmin, digitizing, handleDigitize }
}
