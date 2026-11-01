"use client"

import { useEffect } from "react"
import { Button } from "@/components/ui/button"
import { logger } from "@/lib/logger"
import { useT } from "@/i18n/client"

export default function MainError({
    error,
    reset,
}: {
    error: Error & { digest?: string }
    reset: () => void
}) {
    const t = useT()
    useEffect(() => {
        logger.error("[MainError] Caught:", error)
    }, [error])

    return (
        <div className="min-h-[50vh] flex flex-col items-center justify-center gap-4 px-6 text-center">
            <div className="text-4xl">⚠️</div>
            <h2 className="text-xl font-semibold">{t("dashboard.errorTitle")}</h2>
            <p className="text-muted-foreground max-w-sm">
                {t("dashboard.errorBody")}
            </p>
            {error?.message && (
                <pre className="text-xs text-destructive bg-destructive/5 border border-destructive/20 rounded-lg p-3 max-w-md overflow-auto text-start">
                    {error.message}
                </pre>
            )}
            <div className="flex items-center gap-3">
                <Button onClick={reset} variant="default">
                    {t("dashboard.errorRetry")}
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
                    {t("dashboard.errorHardReset")}
                </Button>
            </div>
        </div>
    )
}
