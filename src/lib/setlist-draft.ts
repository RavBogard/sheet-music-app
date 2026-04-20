/**
 * localStorage-backed unsaved-edit draft for the setlist editor.
 *
 * v45-emergency: recover in-progress edits from tab crash, auth hiccup, power
 * cycle, or anything else that kills the React state between a user's
 * keystroke and a successful server write. Strictly a stopgap until v45-02
 * ships the full IndexedDB journal + v45-03 sync engine.
 *
 * Contract:
 *  - saveDraft is debounced by the caller (~500ms).
 *  - loadDraft returns null on corruption or if draft is older than 7 days.
 *  - clearDraft runs after a successful save.
 *  - All writes are wrapped in try/catch — localStorage throws on quota
 *    exceeded or private-mode Safari. Never propagate.
 */
import type { SetlistTrack, SetlistMusician } from "@/types/models"
import { logger } from "@/lib/logger"

const KEY_PREFIX = "setlist-draft:"
const MAX_DRAFT_AGE_MS = 7 * 24 * 60 * 60 * 1000

export interface SetlistDraft {
    setlistId: string | null
    savedAt: number
    data: {
        name: string
        tracks: SetlistTrack[]
        eventDate: string | null
        rabbi: string
        serviceNotes: string
        musicians: SetlistMusician[]
    }
}

function key(setlistId: string | null | undefined): string {
    return `${KEY_PREFIX}${setlistId ?? "new"}`
}

export function saveDraft(draft: SetlistDraft): void {
    if (typeof window === "undefined") return
    try {
        localStorage.setItem(key(draft.setlistId), JSON.stringify(draft))
    } catch (err) {
        // Quota exceeded / private-mode Safari / other — non-fatal.
        logger.warn("[draft] save failed:", err)
    }
}

export function loadDraft(setlistId: string | null | undefined): SetlistDraft | null {
    if (typeof window === "undefined") return null
    try {
        const raw = localStorage.getItem(key(setlistId))
        if (!raw) return null
        const parsed = JSON.parse(raw) as SetlistDraft
        if (!parsed || typeof parsed !== "object" || typeof parsed.savedAt !== "number") return null
        if (Date.now() - parsed.savedAt > MAX_DRAFT_AGE_MS) {
            localStorage.removeItem(key(setlistId))
            return null
        }
        return parsed
    } catch (err) {
        logger.warn("[draft] load failed:", err)
        return null
    }
}

export function clearDraft(setlistId: string | null | undefined): void {
    if (typeof window === "undefined") return
    try {
        localStorage.removeItem(key(setlistId))
    } catch {
        // best-effort
    }
}
