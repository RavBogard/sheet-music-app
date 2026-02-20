"use client"

import Link from "next/link"
import { Button } from "@/components/ui/button"

export default function SetlistEditorError({
    _error,
    reset,
}: {
    _error: Error & { digest?: string }
    reset: () => void
}) {
    return (
        <div className="h-[100dvh] flex flex-col items-center justify-center gap-4 px-6 text-center">
            <div className="text-4xl">😬</div>
            <h2 className="text-xl font-semibold">Something went wrong</h2>
            <p className="text-muted-foreground max-w-sm">
                The setlist editor ran into a problem. Your data has been auto-saved — nothing is lost.
            </p>
            <div className="flex gap-3">
                <Button asChild variant="outline">
                    <Link href="/setlists">Back to Dashboard</Link>
                </Button>
                <Button onClick={reset}>
                    Try Again
                </Button>
            </div>
        </div>
    )
}
