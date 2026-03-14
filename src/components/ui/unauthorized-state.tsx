import { ShieldAlert, ArrowLeft } from "lucide-react"
import { Button } from "@/components/ui/button"
import Link from "next/link"

interface UnauthorizedStateProps {
    title?: string
    description?: string
    actionLabel?: string
    actionHref?: string
}

export function UnauthorizedState({
    title = "Access Restricted",
    description = "You don't have permission to view this page.",
    actionLabel = "Return to Dashboard",
    actionHref = "/setlists"
}: UnauthorizedStateProps) {
    return (
        <div className="flex flex-col items-center justify-center min-h-[50vh] px-4 text-center">
            <div className="h-20 w-20 bg-destructive/10 text-destructive rounded-full flex items-center justify-center mb-6 ring-8 ring-destructive/5">
                <ShieldAlert className="h-10 w-10" />
            </div>
            
            <h2 className="text-2xl md:text-3xl font-bold tracking-tight mb-2 text-foreground">
                {title}
            </h2>
            
            <p className="text-muted-foreground max-w-md mb-8">
                {description}
            </p>
            
            <Button asChild variant="default" className="gap-2">
                <Link href={actionHref}>
                    <ArrowLeft className="h-4 w-4" />
                    {actionLabel}
                </Link>
            </Button>
        </div>
    )
}
