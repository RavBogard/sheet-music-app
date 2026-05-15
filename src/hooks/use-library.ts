import { useQuery, useQueryClient } from "@tanstack/react-query"
import { auth, db } from "@/lib/firebase"
import { doc, onSnapshot } from "firebase/firestore"
import { DriveFile } from "@/types/models"
import { useEffect } from "react"
import { useLibraryStore } from "@/lib/library-store"
import { useAuth } from "@/lib/auth-context"
import { listenForCacheInvalidation } from "@/lib/library-cache"

/**
 * Fetches the library files from the API.
 * 
 * If force=true, bypasses the browser cache.
 */
async function fetchLibrary(force = false, collection = 'all'): Promise<{ files: DriveFile[], lastModified: string }> {
    const user = auth?.currentUser
    const headers: HeadersInit = {}
    if (user) {
        const token = await user.getIdToken()
        headers['Authorization'] = `Bearer ${token}`
    }

    const endpoint = `/api/library/list?all=true&collection=${collection}${force ? `&t=${Date.now()}` : '&v=2'}`
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
export function useLibrary(force = false, collection = 'all') {
    const { user } = useAuth()

    const queryInfo = useQuery({
        // Increment the cache key version (v2) to force an immediate bust of the
        // old empty 'all' cache for all clients.
        queryKey: ['library', 'v2', collection, force, !!user],
        queryFn: () => fetchLibrary(force, collection),
        staleTime: 1000 * 60 * 60 * 24, // Consider data fresh for 24 hours (sync handles updates)
        enabled: !!user, // Wait for auth to initialize reactively
    })

    const { data } = queryInfo
    const hydrate = useLibraryStore(s => s.hydrate)
    const queryClient = useQueryClient()

    // Keep the ephemeral Zustand store in sync for quick synchronous filtering
    useEffect(() => {
        if (data?.files) {
            hydrate(data.files)
        }
    }, [data?.files, hydrate])

    // v45-07: subscribe to cross-tab library invalidation. When another tab
    // uploads a file, it broadcasts on the `library-cache` channel; we invalidate
    // our react-query cache so the next render refetches.
    useEffect(() => {
        return listenForCacheInvalidation(() => {
            queryClient.invalidateQueries({ queryKey: ['library'] })
        })
    }, [queryClient])

    // 2026-05-15 — subscribe to the server-side library_signals/latest doc.
    // processChartUpload and deleteChart bump this doc on every successful
    // write, so MCP-driven uploads (which never touch the in-tab
    // BroadcastChannel) surface in the library list within snapshot latency
    // (~1s). The first snapshot fires immediately on subscribe — skip it so
    // we don't refetch on every mount; only act on subsequent updates.
    useEffect(() => {
        if (!user || !db) return
        let firstSnapshot = true
        const unsub = onSnapshot(doc(db, "library_signals", "latest"), () => {
            if (firstSnapshot) {
                firstSnapshot = false
                return
            }
            queryClient.invalidateQueries({ queryKey: ['library'] })
        })
        return unsub
    }, [user, queryClient])

    return queryInfo
}
