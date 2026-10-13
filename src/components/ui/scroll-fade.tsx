"use client"

import { useRef, useState, useEffect, useCallback } from "react"
import { cn } from "@/lib/utils"
import { useI18n } from "@/i18n/client"

interface ScrollFadeProps {
    children: React.ReactNode
    className?: string
    scrollClassName?: string
    snap?: boolean
}

export function ScrollFade({ children, className, scrollClassName, snap }: ScrollFadeProps) {
    const scrollRef = useRef<HTMLDivElement>(null)
    const { isRtl } = useI18n()
    // Logical edges: on an rtl page scrollLeft runs 0 → negative, so measure
    // the distance from the start edge with Math.abs (identical in ltr).
    const [canScrollStart, setCanScrollStart] = useState(false)
    const [canScrollEnd, setCanScrollEnd] = useState(false)

    const updateScrollState = useCallback(() => {
        const el = scrollRef.current
        if (!el) return
        const fromStart = Math.abs(el.scrollLeft)
        setCanScrollStart(fromStart > 0)
        setCanScrollEnd(fromStart + el.clientWidth < el.scrollWidth - 1)
    }, [])

    useEffect(() => {
        const el = scrollRef.current
        if (!el) return

        updateScrollState()

        el.addEventListener("scroll", updateScrollState, { passive: true })

        const observer = new ResizeObserver(updateScrollState)
        observer.observe(el)

        return () => {
            el.removeEventListener("scroll", updateScrollState)
            observer.disconnect()
        }
    }, [updateScrollState])

    return (
        <div className={cn("relative", className)}>
            <div
                ref={scrollRef}
                className={cn("overflow-x-auto", snap && "snap-x snap-proximity", scrollClassName)}
            >
                {children}
            </div>

            {canScrollStart && (
                <div className={cn("absolute start-0 top-0 bottom-0 w-6 pointer-events-none from-background to-transparent z-10", isRtl ? "bg-gradient-to-l" : "bg-gradient-to-r")} />
            )}
            {canScrollEnd && (
                <div className={cn("absolute end-0 top-0 bottom-0 w-6 pointer-events-none from-background to-transparent z-10", isRtl ? "bg-gradient-to-r" : "bg-gradient-to-l")} />
            )}
        </div>
    )
}
