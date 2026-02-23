import { LucideIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { ReactNode } from "react"
import { cn } from "@/lib/utils"

interface EmptyStateProps {
    icon?: LucideIcon
    illustration?: ReactNode
    title: string
    description: string
    actionLabel?: string
    onAction?: () => void
    className?: string
}

export function EmptyState({ icon: Icon, illustration, title, description, actionLabel, onAction, className }: EmptyStateProps) {
    return (
        <div className={cn(
            "flex flex-col items-center justify-center text-center p-10 rounded-2xl",
            "bg-card/50 border border-border/50",
            className
        )}>
            {illustration ? (
                <div className="mb-5 opacity-80">{illustration}</div>
            ) : Icon ? (
                <div className="bg-muted/60 p-4 rounded-2xl mb-5">
                    <Icon className="h-8 w-8 text-muted-foreground" />
                </div>
            ) : null}
            <h3 className="text-lg font-semibold text-foreground mb-1.5 font-display">{title}</h3>
            <p className="text-sm text-muted-foreground max-w-xs leading-relaxed mb-6">{description}</p>
            {actionLabel && onAction && (
                <Button onClick={onAction} className="rounded-xl">
                    {actionLabel}
                </Button>
            )}
        </div>
    )
}
