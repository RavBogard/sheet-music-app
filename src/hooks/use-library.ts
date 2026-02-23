import { useQuery } from "@tanstack/react-query"
import { auth } from "@/lib/firebase"
import { DriveFile } from "@/types/models"
import { useEffect } from "react"
import { useLibraryStore } from "@/lib/library-store"

/**
 * Fetches the library files from the API.
 * 
 * If force=true, bypasses the browser cache.
 */
async function fetchLibrary(force = false): Promise<{ files: DriveFile[], lastModified: string }> {
    const user = auth.currentUser
    const headers: HeadersInit = {}
    if (user) {
        const token = await user.getIdToken()
        headers['Authorization'] = `Bearer ${token}`
    }

    const endpoint = '/api/library/list?all=true'
    const options: RequestInit = { headers }
    if (force) {
        options.cache = 'no-store'
    }

    const res = await fetch(endpoint, options)
    if (!res.ok) throw new Error("Failed to load library")

    return res.json()
}

/**
 * React Query hook for fetching and caching the main library catalog.
 * 
 * React Query natively handles the caching, invalidation, and background
 * refetching, completely replacing the bespoke IDB caching layer.
 */
export function useLibrary(force = false) {
    const queryInfo = useQuery({
        queryKey: ['library', force, !!auth.currentUser],
        queryFn: () => fetchLibrary(force),
        staleTime: 1000 * 60 * 60 * 24, // Consider data fresh for 24 hours (sync handles updates)
        enabled: !!auth.currentUser, // Wait for auth to initialize
    })

    const { data } = queryInfo
    const hydrate = useLibraryStore(s => s.hydrate)

    // Keep the ephemeral Zustand store in sync for quick synchronous filtering
    useEffect(() => {
        if (data?.files) {
            hydrate(data.files)
        }
    }, [data?.files, hydrate])

    return queryInfo
}
