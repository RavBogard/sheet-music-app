"use client"

import { ReactNode } from "react"
import { AuthProvider } from "@/lib/auth-context"
import { CongregationProvider } from "@/lib/congregation-context"

export function ClientProviders({ children }: { children: ReactNode }) {
    // We intentionally removed the aggressive SW controllerchange reload 
    // to prevent infinite reloading loops and mid-performance refreshes.

    return (
        <AuthProvider>
            <CongregationProvider>
                {children}
            </CongregationProvider>
        </AuthProvider>
    )
}
