import { LucideIcon } from "lucide-react"
import { Button } from "@/components/ui/button"

interface EmptyStateProps {
    icon: LucideIcon
    title: string
    description: string
    actionLabel?: string
    onAction?: () => void
    className?: string
}

export function EmptyState({ icon: Icon, title, description, actionLabel, onAction, className = "" }: EmptyStateProps) {
    return (
        <div className={`flex flex-col items-center justify-center text-center p-8 border-2 border-dashed border-zinc-800 rounded-xl bg-zinc-900/50 ${className}`}>
            <div className="bg-zinc-800 p-4 rounded-full mb-4">
                <Icon className="h-8 w-8 text-zinc-400" />
            </div>
            <h3 className="text-xl font-bold text-white mb-2">{title}</h3>
            <p className="text-zinc-500 max-w-sm mb-6">{description}</p>
            {actionLabel && onAction && (
                <Button onClick={onAction}>
                    {actionLabel}
                </Button>
            )}
        </div>
    )
}
