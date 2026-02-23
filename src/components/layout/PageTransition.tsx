"use client"

import { usePathname } from "next/navigation"
import { useEffect, useRef, useCallback } from "react"

/**
 * Lightweight page transition wrapper.
 * Re-triggers a CSS fade-in animation on route changes by toggling
 * the animation class — does NOT remount children (preserves state,
 * Firestore listeners, etc.).
 */
export function PageTransition({ children }: { children: React.ReactNode }) {
    const pathname = usePathname()
    const prevPath = useRef(pathname)
    const divRef = useRef<HTMLDivElement>(null)

    const triggerAnimation = useCallback(() => {
        const el = divRef.current
        if (!el) return
        // Remove then re-add the class to restart the CSS animation
        el.classList.remove("page-transition")
        // Force reflow so the browser registers the removal
        void el.offsetHeight
        el.classList.add("page-transition")
    }, [])

    useEffect(() => {
        if (prevPath.current !== pathname) {
            prevPath.current = pathname
            triggerAnimation()
        }
    }, [pathname, triggerAnimation])

    return (
        <div ref={divRef} className="page-transition">
            {children}
        </div>
    )
}
