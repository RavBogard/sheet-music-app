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
        <div className={cn("flex flex-col items-center justify-center text-center p-8 border-2 border-dashed border-border rounded-xl bg-muted", className)}>
            {illustration ? (
                <div className="mb-4">{illustration}</div>
            ) : Icon ? (
                <div className="bg-muted p-4 rounded-full mb-4">
                    <Icon className="h-8 w-8 text-muted-foreground" />
                </div>
            ) : null}
            <h3 className="text-xl font-bold text-foreground mb-2">{title}</h3>
            <p className="text-muted-foreground max-w-sm mb-6">{description}</p>
            {actionLabel && onAction && (
                <Button onClick={onAction}>
                    {actionLabel}
                </Button>
            )}
        </div>
    )
}
