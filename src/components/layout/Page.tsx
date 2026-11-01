import type { ReactNode } from "react"
import { cn } from "@/lib/utils"

/**
 * The one page container (web refresh, consistency pass). Every list page
 * (dashboard, Setlists, Library, Manage, Settings, Monitor, Perform) sits in
 * the same centred 1080px column with the DESIGN.md gutters (16px, 24px from
 * md), so no page is left-aligned while its neighbours are centred.
 */
export const PAGE_WIDTH_CLASS = "w-full max-w-[1080px] mx-auto px-4 md:px-6"

export function PageContainer({
    children,
    className,
    ...rest
}: { children: ReactNode; className?: string } & React.HTMLAttributes<HTMLDivElement>) {
    return (
        <div className={cn(PAGE_WIDTH_CLASS, "pt-3 sm:pt-4 pb-10", className)} {...rest}>
            {children}
        </div>
    )
}

/**
 * The one page head row (Option B, 2026-11-01): the title at 1rem/800, ONE
 * small meta line under it, the actions on the right. No tall area. The
 * actions share the title's row on a phone (Daniel 2026-11-01: too much
 * space above the content); the title and meta line truncate first, and
 * the actions wrap under only when they cannot fit beside 8rem of title.
 */
export function PageHeader({
    title,
    subtitle,
    actions,
    leading,
    titleAs: Title = "h1",
    className,
    titleClassName,
}: {
    title: ReactNode
    subtitle?: ReactNode
    actions?: ReactNode
    /** An element before the title (a back button on detail pages). */
    leading?: ReactNode
    titleAs?: "h1" | "h2"
    className?: string
    titleClassName?: string
}) {
    return (
        <div className={cn("flex flex-wrap items-center justify-between gap-x-4 gap-y-2", className)}>
            <div className="flex min-w-0 flex-[1_1_8rem] items-center gap-2">
                {leading}
                <div className="min-w-0">
                    <Title className={cn("truncate text-base font-extrabold leading-tight text-foreground", titleClassName)}>
                        {title}
                    </Title>
                    {subtitle ? (
                        <p className="tnum truncate text-xs font-medium text-muted-foreground">{subtitle}</p>
                    ) : null}
                </div>
            </div>
            {actions ? <div className="flex max-w-full min-w-0 flex-wrap items-center gap-2">{actions}</div> : null}
        </div>
    )
}

/** The uppercase list-group heading ("Upcoming", "Account"). */
export const GROUP_HEADING_CLASS = "text-xs font-bold uppercase tracking-[0.08em] text-muted-foreground px-1"

/** A Paper list group on the hairline grid: no card per row. */
export const LIST_GROUP_CLASS = "flex flex-col divide-y divide-rule border border-rule rounded-lg overflow-hidden bg-card"

/** A plain Paper card (Settings sections, the dashboard onboarding card). */
export const CARD_CLASS = "rounded-lg border border-rule bg-card"
