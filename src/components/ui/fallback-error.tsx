"use client"

import { FallbackProps } from "react-error-boundary"
import { AlertTriangle, RefreshCcw } from "lucide-react"
import { Button } from "@/components/ui/button"

interface FallbackErrorProps extends FallbackProps {
    title?: string
    compact?: boolean
}

export function FallbackError({ error, resetErrorBoundary, title = "Something went wrong", compact = false }: FallbackErrorProps) {
    if (compact) {
        return (
            <div className="flex items-center justify-between p-3 bg-destructive/10 border border-destructive/20 rounded-md">
                <div className="flex items-center gap-2 text-destructive">
                    <AlertTriangle className="h-4 w-4 shrink-0" />
                    <span className="text-sm font-medium">{title}</span>
                </div>
                <Button size="sm" variant="ghost" onClick={resetErrorBoundary} className="h-7 px-2 text-xs">
                    <RefreshCcw className="h-3 w-3 mr-1" /> Retry
                </Button>
            </div>
        )
    }

    return (
        <div className="flex flex-col items-center justify-center p-6 text-center bg-zinc-950/50 border border-zinc-800/50 rounded-lg backdrop-blur-sm min-h-[150px]">
            <AlertTriangle className="h-8 w-8 text-destructive mb-3 opacity-80" />
            <h3 className="font-semibold text-zinc-200">{title}</h3>
            <p className="text-sm text-zinc-500 mt-1 max-w-sm">
                {(error as Error).message || "An unexpected rendering error occurred."}
            </p>
            <Button size="sm" variant="secondary" onClick={resetErrorBoundary} className="mt-4 gap-2">
                <RefreshCcw className="h-3.5 w-3.5" />
                Try Again
            </Button>
        </div>
    )
}
