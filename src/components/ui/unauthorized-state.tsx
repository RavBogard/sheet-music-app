"use client"

import { ShieldAlert, ArrowLeft } from "lucide-react"
import { Button } from "@/components/ui/button"
import Link from "next/link"
import { DirectionalIcon } from "@/components/i18n/DirectionalIcon"
import { useT } from "@/i18n/client"

interface UnauthorizedStateProps {
    title?: string
    description?: string
    actionLabel?: string
    actionHref?: string
}

// Phase 7: a client component (for useT); server pages render it with string props.
export function UnauthorizedState({
    title,
    description,
    actionLabel,
    actionHref = "/setlists"
}: UnauthorizedStateProps) {
    const t = useT()
    return (
        <div className="flex flex-col items-center justify-center min-h-[50vh] px-4 text-center">
            <div className="h-20 w-20 bg-destructive/10 text-destructive rounded-full flex items-center justify-center mb-6 ring-8 ring-destructive/5">
                <ShieldAlert className="h-10 w-10" />
            </div>
            
            <h2 className="text-2xl md:text-3xl font-bold tracking-tight mb-2 text-foreground">
                {title ?? t("ui.accessRestricted")}
            </h2>
            
            <p className="text-muted-foreground max-w-md mb-8">
                {description ?? t("ui.noPermission")}
            </p>
            
            <Button asChild variant="default" className="gap-2">
                <Link href={actionHref}>
                    <DirectionalIcon icon={ArrowLeft} className="h-4 w-4" />
                    {actionLabel ?? t("ui.returnToDashboard")}
                </Link>
            </Button>
        </div>
    )
}
