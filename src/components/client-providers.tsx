"use client"

import { ReactNode, useEffect } from "react"
import { AuthProvider } from "@/lib/auth-context"
import { CongregationProvider } from "@/lib/congregation-context"

export function ClientProviders({ children }: { children: ReactNode }) {
    // Ensure new deploys reach the client:
    // 1. Eagerly check for SW updates (don't wait for next navigation)
    // 2. When a new SW takes control, reload to load the new JS bundles
    //    (the old SW may have served a cached HTML page with stale bundle refs)
    useEffect(() => {
        if (!('serviceWorker' in navigator)) return

        // Reload once when a new SW takes control of this page
        let reloading = false
        navigator.serviceWorker.addEventListener('controllerchange', () => {
            if (!reloading) {
                reloading = true
                window.location.reload()
            }
        })

        // Trigger update check
        navigator.serviceWorker.getRegistration().then(reg => {
            reg?.update()
        })
    }, [])

    return (
        <AuthProvider>
            <CongregationProvider>
                {children}
            </CongregationProvider>
        </AuthProvider>
    )
}
