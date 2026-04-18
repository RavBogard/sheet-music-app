"use client"

import { useState, useCallback, useRef } from "react"
import { useAuth } from "@/lib/auth-context"

interface ContentMatch {
    page: number
    context: string
}

interface ContentSearchResult {
    fileId: string
    fileName: string
    matches: ContentMatch[]
}

/**
 * Hook for searching within song content (chord data, lyrics, sections).
 * Calls the /api/library/search-content endpoint.
 */
export function useContentSearch() {
    const { user } = useAuth()
    const [results, setResults] = useState<ContentSearchResult[]>([])
    const [searching, setSearching] = useState(false)
    const [query, setQuery] = useState("")
    const abortRef = useRef<AbortController | null>(null)

    const search = useCallback(async (term: string) => {
        setQuery(term)

        if (!term || term.length < 2 || !user) {
            setResults([])
            return
        }

        // Cancel previous request
        abortRef.current?.abort()
        const controller = new AbortController()
        abortRef.current = controller

        setSearching(true)
        try {
            const token = await user.getIdToken()
            const res = await fetch(`/api/library/search-content?q=${encodeURIComponent(term)}`, {
                headers: { Authorization: `Bearer ${token}` },
                signal: controller.signal,
            })

            if (res.ok) {
                const data = await res.json()
                setResults(data.results || [])
            } else {
                setResults([])
            }
        } catch (err) {
            if ((err as Error).name !== 'AbortError') {
                setResults([])
            }
        } finally {
            setSearching(false)
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [user?.uid])

    const clear = useCallback(() => {
        setResults([])
        setQuery("")
    }, [])

    return { results, searching, query, search, clear }
}
