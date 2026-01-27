"use client"

import { useEffect } from 'react'
import { useMusicStore, FileType } from '@/lib/store'

const STORAGE_KEY = 'sheet-music-last-session'

interface SessionData {
    fileUrl: string | null
    fileType: FileType
}

export function useLastOpened() {
    const { fileUrl, fileType, setFile } = useMusicStore()

    // 1. Save on change
    useEffect(() => {
        if (fileUrl && fileType) {
            const data: SessionData = { fileUrl, fileType }
            localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
        }
    }, [fileUrl, fileType])

    // 2. Load on mount (exposed as a function to be called by a component)
    const restoreSession = () => {
        try {
            const raw = localStorage.getItem(STORAGE_KEY)
            if (!raw) return false
            const data = JSON.parse(raw) as SessionData
            if (data.fileUrl) {
                setFile(data.fileUrl, data.fileType)
                return true
            }
        } catch (e) {
            console.error("Failed to restore session", e)
        }
        return false
    }

    return { restoreSession }
}
