"use client"

import { useRef, useState, useEffect, useCallback } from "react"
import { cn } from "@/lib/utils"

interface ScrollFadeProps {
    children: React.ReactNode
    className?: string
    scrollClassName?: string
    snap?: boolean
}

export function ScrollFade({ children, className, scrollClassName, snap }: ScrollFadeProps) {
    const scrollRef = useRef<HTMLDivElement>(null)
    const [canScrollLeft, setCanScrollLeft] = useState(false)
    const [canScrollRight, setCanScrollRight] = useState(false)

    const updateScrollState = useCallback(() => {
        const el = scrollRef.current
        if (!el) return
        setCanScrollLeft(el.scrollLeft > 0)
        setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 1)
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
                className={cn("overflow-x-auto", snap && "snap-x snap-mandatory", scrollClassName)}
            >
                {children}
            </div>

            {canScrollLeft && (
                <div className="absolute left-0 top-0 bottom-0 w-6 pointer-events-none bg-gradient-to-r from-background to-transparent z-10" />
            )}
            {canScrollRight && (
                <div className="absolute right-0 top-0 bottom-0 w-6 pointer-events-none bg-gradient-to-l from-background to-transparent z-10" />
            )}
        </div>
    )
}
