"use client"

import { Button } from "@/components/ui/button"
import { useRouter } from "next/navigation"

export default function PerformError({
    _error,
    reset,
}: {
    _error: Error & { digest?: string }
    reset: () => void
}) {
    const router = useRouter()

    return (
        <div className="h-[100dvh] flex flex-col items-center justify-center gap-4 px-6 text-center bg-black text-white">
            <div className="text-4xl">🎵</div>
            <h2 className="text-xl font-semibold">Chart failed to load</h2>
            <p className="text-gray-400 max-w-sm">
                There was a problem rendering this chart. Try reloading, or skip to the next one.
            </p>
            <div className="flex gap-3">
                <Button variant="outline" onClick={() => router.back()} className="border-gray-600 text-white hover:bg-gray-800">
                    Go Back
                </Button>
                <Button onClick={reset} className="bg-white text-black hover:bg-gray-200">
                    Retry
                </Button>
            </div>
        </div>
    )
}
