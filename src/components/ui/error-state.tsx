"use client"

import { AlertTriangle, RefreshCcw, LucideIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useT } from "@/i18n/client"

interface ErrorStateProps {
    title?: string
    description?: string
    retryLabel?: string
    onRetry?: () => void
    icon?: LucideIcon
    className?: string
}

export function ErrorState({
    title,
    description,
    retryLabel,
    onRetry,
    icon: Icon = AlertTriangle,
    className = ""
}: ErrorStateProps) {
    const t = useT()
    return (
        <div className={`flex flex-col items-center justify-center p-8 text-center space-y-4 ${className}`}>
            <div className="bg-destructive/10 p-4 rounded-full">
                <Icon className="h-8 w-8 text-destructive" />
            </div>
            <div className="space-y-2 max-w-sm">
                <h3 className="text-lg font-semibold text-foreground">{title ?? t("ui.somethingWentWrong")}</h3>
                <p className="text-sm text-muted-foreground">{description ?? t("ui.couldNotLoad")}</p>
            </div>
            {onRetry && (
                <Button
                    onClick={onRetry}
                    variant="outline"
                    className="gap-2 border-destructive/20 hover:bg-destructive/10 hover:text-destructive text-destructive"
                >
                    <RefreshCcw className="h-4 w-4" />
                    {retryLabel ?? t("ui.tryAgain")}
                </Button>
            )}
        </div>
    )
}
