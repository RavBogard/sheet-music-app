"use client"

import { useEffect } from "react"
import { Button } from "@/components/ui/button"
import { logger } from "@/lib/logger"

export default function MainError({
    error,
    reset,
}: {
    error: Error & { digest?: string }
    reset: () => void
}) {
    useEffect(() => {
        logger.error("[MainError] Caught:", error)
    }, [error])

    return (
        <div className="min-h-[50vh] flex flex-col items-center justify-center gap-4 px-6 text-center">
            <div className="text-4xl">⚠️</div>
            <h2 className="text-xl font-semibold">Something went wrong</h2>
            <p className="text-muted-foreground max-w-sm">
                This page failed to load. Please try again.
            </p>
            {error?.message && (
                <pre className="text-xs text-red-400/80 bg-red-500/5 border border-red-500/20 rounded-lg p-3 max-w-md overflow-auto text-left">
                    {error.message}
                </pre>
            )}
            <div className="flex items-center gap-3">
                <Button onClick={reset} variant="default">
                    Retry
                </Button>
                <Button 
                    variant="outline" 
                    onClick={() => { 
                        if (typeof window !== 'undefined') {
                            localStorage.clear()
                            window.location.href = '/'
                        }
                    }}
                >
                    Hard Reset
                </Button>
            </div>
        </div>
    )
}
