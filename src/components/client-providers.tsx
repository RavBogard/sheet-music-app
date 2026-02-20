"use client"

import { ReactNode, useEffect } from "react"
import { AuthProvider } from "@/lib/auth-context"
import { useCongregationStore } from "@/lib/congregation-store"

export function ClientProviders({ children }: { children: ReactNode }) {
    // We intentionally removed the aggressive SW controllerchange reload 
    // to prevent infinite reloading loops and mid-performance refreshes.

    useEffect(() => {
        const unsub = useCongregationStore.getState().init()
        return unsub
    }, [])

    return (
        <AuthProvider>
            {children}
        </AuthProvider>
    )
}
