"use client"

import { ReactNode, useEffect } from "react"
import { AuthProvider } from "@/lib/auth-context"
import { CongregationProvider } from "@/lib/congregation-context"

export function ClientProviders({ children }: { children: ReactNode }) {
    // Suppress benign AbortErrors from flooding the console.
    // These come from: React effect cleanup aborting in-flight fetches,
    // Firestore SDK transport retries, and navigation-triggered teardowns.
    // They are harmless but alarm users who open the console.
    useEffect(() => {
        // Suppress console.error calls with AbortError
        const originalError = console.error
        console.error = (...args: unknown[]) => {
            const first = args[0]
            const msg = typeof first === 'string' ? first : ''
            if (
                msg.includes('AbortError') ||
                msg.includes('aborted a request') ||
                (first instanceof DOMException && first.name === 'AbortError')
            ) return
            originalError.apply(console, args)
        }

        // Catch unhandled AbortError promise rejections
        const handleRejection = (e: PromiseRejectionEvent) => {
            if (e.reason?.name === 'AbortError' || e.reason?.message?.includes('aborted')) {
                e.preventDefault()
            }
        }
        window.addEventListener('unhandledrejection', handleRejection)

        return () => {
            console.error = originalError
            window.removeEventListener('unhandledrejection', handleRejection)
        }
    }, [])

    return (
        <AuthProvider>
            <CongregationProvider>
                {children}
            </CongregationProvider>
        </AuthProvider>
    )
}
