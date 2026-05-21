"use client"

import { Button } from "@/components/ui/button"
import { useRouter } from "next/navigation"
import { useEffect } from "react"
import { captureException } from "@/lib/error-reporting"

export default function PerformError({
    error,
    reset,
}: {
    error: Error & { digest?: string }
    reset: () => void
}) {
    const router = useRouter()

    // PGR-11: surface the band's hot-route chart-render crashes to Sentry.
    // Previously the prop was `_error` (discarded) so an iPad failure
    // mid-service never reached Daniel. Mirrors the client ErrorBoundary.
    useEffect(() => {
        captureException(error, {
            source: "client",
            location: "perform/error",
            extra: { digest: error.digest },
        })
    }, [error])

    return (
        <div className="h-[100dvh] flex flex-col items-center justify-center gap-4 px-6 text-center bg-background text-foreground">
            <div className="text-4xl">🎵</div>
            <h2 className="text-xl font-semibold">Chart failed to load</h2>
            <p className="text-muted-foreground max-w-sm">
                There was a problem rendering this chart. Try reloading, or skip to the next one.
            </p>
            <div className="flex gap-3">
                <Button variant="outline" onClick={() => router.back()} className="border-border bg-transparent text-foreground hover:bg-muted">
                    Go Back
                </Button>
                <Button onClick={reset} className="bg-foreground text-background hover:bg-secondary">
                    Retry
                </Button>
            </div>
        </div>
    )
}
