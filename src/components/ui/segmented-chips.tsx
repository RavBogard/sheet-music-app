"use client"

import type { ReactNode } from "react"
import { cn } from "@/lib/utils"

/**
 * The one filter control (web refresh, consistency pass): a wrapping row of
 * 44px chips. Used for the rabbi chips on Setlists, the collection tabs on
 * Library, and Manage's section tabs and role filter. The row wraps rather
 * than scrolling, so there is never a scrollbar or scroll arrows.
 *
 * Plain chips are toggle buttons (`aria-pressed`). Where a chip row drives
 * tab panels (Manage), Radix Tabs keeps its tab semantics and takes these
 * same classes through `SEGMENTED_GROUP_CLASS` and `SEGMENTED_CHIP_CLASS`;
 * both key off `data-state="active" | "inactive"`, which Radix sets too.
 */
export const SEGMENTED_GROUP_CLASS = "flex w-full flex-wrap items-center gap-2"

export const SEGMENTED_CHIP_CLASS = cn(
    "tnum touch-hit inline-flex shrink-0 items-center gap-1.5 h-8 rounded-md border px-3 text-[13px] font-semibold whitespace-nowrap cursor-pointer transition-colors",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
    "data-[state=active]:bg-accent data-[state=active]:text-foreground data-[state=active]:border-brand",
    "data-[state=inactive]:bg-card data-[state=inactive]:text-muted-foreground data-[state=inactive]:border-border data-[state=inactive]:hover:text-foreground",
    "[&_svg]:size-4 [&_svg]:shrink-0",
)

export interface SegmentedChipOption<T extends string> {
    value: T
    label: ReactNode
    icon?: ReactNode
    testId?: string
    ariaLabel?: string
}

export function SegmentedChips<T extends string>({
    options,
    value,
    onChange,
    ariaLabel,
    className,
    testId,
}: {
    options: SegmentedChipOption<T>[]
    value: T
    onChange: (value: T) => void
    ariaLabel: string
    className?: string
    testId?: string
}) {
    return (
        <div role="group" aria-label={ariaLabel} data-testid={testId} className={cn(SEGMENTED_GROUP_CLASS, className)}>
            {options.map((opt) => {
                const active = opt.value === value
                return (
                    <button
                        key={opt.value}
                        type="button"
                        aria-pressed={active}
                        aria-label={opt.ariaLabel}
                        data-state={active ? "active" : "inactive"}
                        data-testid={opt.testId}
                        onClick={() => onChange(opt.value)}
                        className={SEGMENTED_CHIP_CLASS}
                    >
                        {opt.icon}
                        {opt.label}
                    </button>
                )
            })}
        </div>
    )
}
