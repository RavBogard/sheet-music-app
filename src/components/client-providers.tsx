"use client"

import { ReactNode } from "react"
import { AuthProvider } from "@/lib/auth-context"
import { CongregationProvider } from "@/lib/congregation-context"

export function ClientProviders({ children }: { children: ReactNode }) {
    return (
        <AuthProvider>
            <CongregationProvider>
                {children}
            </CongregationProvider>
        </AuthProvider>
    )
}
