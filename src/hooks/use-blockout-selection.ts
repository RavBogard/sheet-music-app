import { useState, useCallback } from "react"
import { useAuth } from "@/lib/auth-context"
import { createBlockout } from "@/lib/scheduling-firebase"
import { toast } from "sonner"

export interface BlockoutSelectionState {
    selecting: boolean
    selectionStart: string | null
    selectionEnd: string | null
    reason: string
    saving: boolean
}

export interface UseBlockoutSelectionReturn extends BlockoutSelectionState {
    /** Is a given 'YYYY-MM-DD' inside the current drag selection? */
    isInSelection: (dateKey: string) => boolean
    /** Called when a day cell is clicked in availability mode */
    handleDayClick: (dateKey: string) => void
    /** Called on mouse-enter while selecting */
    handleDayHover: (dateKey: string) => void
    /** Confirm blockout creation */
    handleCreateBlockout: () => Promise<void>
    /** Cancel the selection */
    cancelSelection: () => void
    /** Bound setter for the reason input */
    setReason: (v: string) => void
    /** Formatted range string for the current selection */
    selectionLabel: string | null
}

function todayKey(): string {
    return new Date().toISOString().split('T')[0]
}

function formatRange(start: string, end: string): string {
    const s = new Date(start + 'T12:00:00')
    const e = new Date(end + 'T12:00:00')
    const opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' }
    if (start === end) return s.toLocaleDateString('en-US', opts)
    return `${s.toLocaleDateString('en-US', opts)} – ${e.toLocaleDateString('en-US', opts)}`
}

/**
 * Extracted blockout selection state machine.
 * Used by UnifiedCalendar in availability mode.
 *
 * @param isBlockedDate  predicate — is a given date-key already blocked?
 */
export function useBlockoutSelection(
    isBlockedDate: (dateKey: string) => boolean,
): UseBlockoutSelectionReturn {
    const { user } = useAuth()

    const [selecting, setSelecting] = useState(false)
    const [selectionStart, setSelectionStart] = useState<string | null>(null)
    const [selectionEnd, setSelectionEnd] = useState<string | null>(null)
    const [reason, setReason] = useState("")
    const [saving, setSaving] = useState(false)

    const isInSelection = useCallback((dateKey: string): boolean => {
        if (!selectionStart) return false
        const end = selectionEnd || selectionStart
        const min = selectionStart < end ? selectionStart : end
        const max = selectionStart > end ? selectionStart : end
        return dateKey >= min && dateKey <= max
    }, [selectionStart, selectionEnd])

    const handleDayClick = useCallback((dateKey: string) => {
        if (dateKey < todayKey()) return
        if (isBlockedDate(dateKey)) return

        if (!selecting) {
            setSelecting(true)
            setSelectionStart(dateKey)
            setSelectionEnd(dateKey)
        } else {
            setSelectionEnd(dateKey)
        }
    }, [selecting, isBlockedDate])

    const handleDayHover = useCallback((dateKey: string) => {
        if (selecting && selectionStart) {
            setSelectionEnd(dateKey)
        }
    }, [selecting, selectionStart])

    const cancelSelection = useCallback(() => {
        setSelecting(false)
        setSelectionStart(null)
        setSelectionEnd(null)
        setReason("")
    }, [])

    const handleCreateBlockout = useCallback(async () => {
        if (!user || !selectionStart) return
        const end = selectionEnd || selectionStart
        const start = selectionStart < end ? selectionStart : end
        const finalEnd = selectionStart > end ? selectionStart : end

        setSaving(true)
        try {
            await createBlockout(user.uid, start, finalEnd, reason || undefined)
            toast.success('Blockout dates saved')
            cancelSelection()
        } catch {
            toast.error('Failed to save blockout dates')
        } finally {
            setSaving(false)
        }
    }, [user, selectionStart, selectionEnd, reason, cancelSelection])

    const selectionLabel = selectionStart
        ? formatRange(
            selectionStart < (selectionEnd || selectionStart) ? selectionStart : (selectionEnd || selectionStart),
            selectionStart > (selectionEnd || selectionStart) ? selectionStart : (selectionEnd || selectionStart),
        )
        : null

    return {
        selecting,
        selectionStart,
        selectionEnd,
        reason,
        saving,
        isInSelection,
        handleDayClick,
        handleDayHover,
        handleCreateBlockout,
        cancelSelection,
        setReason,
        selectionLabel,
    }
}
