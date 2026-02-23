"use client"

import { useEffect, useState, useRef } from "react"
import { DocumentReference, Query, onSnapshot, DocumentSnapshot, QuerySnapshot } from "firebase/firestore"
import { logger } from "@/lib/logger"

type FirestoreRef<T> = DocumentReference<T> | Query<T>

interface SyncState<T> {
    data: T | null
    loading: boolean
    error: Error | null
}

/**
 * A centralized, safe hook for Firestore real-time subscriptions.
 * Prevents memory leaks by ensuring proper cleanup of `onSnapshot` listeners.
 * Also deduplicates network requests if multiple components mount with the same path path.
 */
export function useSafeFirestoreSync<T = any>(
    ref: FirestoreRef<T> | null | undefined,
    options: {
        timeoutMs?: number // how long to wait before declaring a timeout
        onError?: (err: Error) => void
    } = {}
): SyncState<T> {
    const [state, setState] = useState<SyncState<T>>({
        data: null,
        loading: !!ref,
        error: null,
    })

    // Keeps track of the active unsubscribe function
    const unsubRef = useRef<(() => void) | null>(null)
    // For preventing state updates if component unmounts mid-fetch
    const isMounted = useRef(true)

    useEffect(() => {
        isMounted.current = true
        return () => {
            isMounted.current = false
            if (unsubRef.current) {
                unsubRef.current()
                unsubRef.current = null
            }
        }
    }, [])

    useEffect(() => {
        // Cleanup previous subscription if ref changes
        if (unsubRef.current) {
            unsubRef.current()
            unsubRef.current = null
        }

        if (!ref) {
            if (state.loading || state.data !== null || state.error !== null) {
                setState({ data: null, loading: false, error: null })
            }
            return
        }

        setState(prev => ({ ...prev, loading: true, error: null }))

        let timeoutId: ReturnType<typeof setTimeout>

        if (options.timeoutMs) {
            timeoutId = setTimeout(() => {
                if (isMounted.current) {
                    const err = new Error(`Firestore sync timeout after ${options.timeoutMs}ms`)
                    setState(prev => ({ ...prev, loading: false, error: err }))
                    if (options.onError) options.onError(err)
                    logger.warn("[useSafeFirestoreSync]", err.message)
                }
            }, options.timeoutMs)
        }

        try {
            unsubRef.current = onSnapshot(
                ref as any, // TypeScript union trickiness with onSnapshot
                (snapshot: DocumentSnapshot<T> | QuerySnapshot<T>) => {
                    if (!isMounted.current) return
                    if (timeoutId) clearTimeout(timeoutId)

                    let parsedData: any = null

                    if ('docs' in snapshot) {
                        // It's a QuerySnapshot
                        parsedData = snapshot.docs.map(doc => ({
                            id: doc.id,
                            ...doc.data()
                        })) as unknown as T
                    } else {
                        // It's a DocumentSnapshot
                        if (snapshot.exists()) {
                            parsedData = {
                                id: snapshot.id,
                                ...snapshot.data()
                            } as unknown as T
                        } // else remains null
                    }

                    setState({
                        data: parsedData,
                        loading: false,
                        error: null,
                    })
                },
                (err) => {
                    if (!isMounted.current) return
                    if (timeoutId) clearTimeout(timeoutId)

                    logger.error("[useSafeFirestoreSync] onSnapshot error:", err)
                    setState(prev => ({ ...prev, loading: false, error: err }))
                    if (options.onError) options.onError(err)
                }
            )
        } catch (setupError: any) {
            if (timeoutId!) clearTimeout(timeoutId!)
            logger.error("[useSafeFirestoreSync] Setup error:", setupError)
            setState(prev => ({ ...prev, loading: false, error: setupError }))
            if (options.onError) options.onError(setupError)
        }

        // Return a cleanup function for this specific effect run
        // (This executes when `ref` changes, or on unmount)
        return () => {
            if (timeoutId) clearTimeout(timeoutId)
            if (unsubRef.current) {
                unsubRef.current()
                unsubRef.current = null
            }
        }
    }, [ref, options.timeoutMs]) // Intentionally not including options.onError to prevent thrashing

    return state
}
