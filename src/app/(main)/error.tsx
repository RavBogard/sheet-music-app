"use client"

import { Button } from "@/components/ui/button"

export default function MainError({
    error,
    reset,
}: {
    error: Error & { digest?: string }
    reset: () => void
}) {
    return (
        <div className="min-h-[50vh] flex flex-col items-center justify-center gap-4 px-6 text-center">
            <div className="text-4xl">⚠️</div>
            <h2 className="text-xl font-semibold">Something went wrong</h2>
            <p className="text-muted-foreground max-w-sm">
                This page failed to load. Please try again.
            </p>
            <Button onClick={reset}>
                Retry
            </Button>
        </div>
    )
}
