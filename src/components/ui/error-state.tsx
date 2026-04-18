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
            <div className="bg-destructive/10 p-4 rounded-full">
                <Icon className="h-8 w-8 text-destructive" />
            </div>
            <div className="space-y-2 max-w-sm">
                <h3 className="text-lg font-semibold text-foreground">{title}</h3>
                <p className="text-sm text-muted-foreground">{description}</p>
            </div>
            {onRetry && (
                <Button
                    onClick={onRetry}
                    variant="outline"
                    className="gap-2 border-destructive/20 hover:bg-destructive/10 hover:text-destructive text-destructive"
                >
                    <RefreshCcw className="h-4 w-4" />
                    {retryLabel}
                </Button>
            )}
        </div>
    )
}
