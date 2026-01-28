import { AlertTriangle, RefreshCcw, LucideIcon } from "lucide-react"
import { Button } from "@/components/ui/button"

interface ErrorStateProps {
    title?: string
    description?: string
    retryLabel?: string
    onRetry?: () => void
    icon?: LucideIcon
    className?: string
}

export function ErrorState({
    title = "Something went wrong",
    description = "We couldn't load this content. Please try again.",
    retryLabel = "Try Again",
    onRetry,
    icon: Icon = AlertTriangle,
    className = ""
}: ErrorStateProps) {
    return (
        <div className={`flex flex-col items-center justify-center p-8 text-center space-y-4 ${className}`}>
            <div className="bg-red-500/10 p-4 rounded-full">
                <Icon className="h-8 w-8 text-red-500" />
            </div>
            <div className="space-y-2 max-w-sm">
                <h3 className="text-lg font-semibold text-zinc-200">{title}</h3>
                <p className="text-sm text-zinc-400">{description}</p>
            </div>
            {onRetry && (
                <Button
                    onClick={onRetry}
                    variant="outline"
                    className="gap-2 border-red-500/20 hover:bg-red-500/10 hover:text-red-400 text-red-500"
                >
                    <RefreshCcw className="h-4 w-4" />
                    {retryLabel}
                </Button>
            )}
        </div>
    )
}
