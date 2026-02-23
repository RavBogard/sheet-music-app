"use client"

import { usePathname } from "next/navigation"
import { useEffect, useRef, useState } from "react"

/**
 * Lightweight CSS-only page transition.
 * Fades in + subtle translateY on each route change.
 * No dependencies — uses native CSS animations.
 */
export function PageTransition({ children }: { children: React.ReactNode }) {
    const pathname = usePathname()
    const [animKey, setAnimKey] = useState(0)
    const prevPath = useRef(pathname)

    useEffect(() => {
        if (prevPath.current !== pathname) {
            prevPath.current = pathname
            setAnimKey((k) => k + 1)
        }
    }, [pathname])

    return (
        <div
            key={animKey}
            className="page-transition"
        >
            {children}
        </div>
    )
}
