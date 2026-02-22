"use client"

import { ReactNode, useEffect, useState } from "react"
import { AuthProvider } from "@/lib/auth-context"
import { useCongregationStore } from "@/lib/congregation-store"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"

export function ClientProviders({ children }: { children: ReactNode }) {
    // We intentionally removed the aggressive SW controllerchange reload 
    // to prevent infinite reloading loops and mid-performance refreshes.

    const [queryClient] = useState(() => new QueryClient({
        defaultOptions: {
            queries: {
                staleTime: 1000 * 60 * 5, // Data is fresh for 5 minutes
                refetchOnWindowFocus: false, // Don't refetch on window focus
                retry: 1, // Let Queries fail fast after 1 retry
            }
        }
    }))

    useEffect(() => {
        const unsub = useCongregationStore.getState().init()
        return unsub
    }, [])

    return (
        <QueryClientProvider client={queryClient}>
            <AuthProvider>
                {children}
            </AuthProvider>
        </QueryClientProvider>
    )
}
