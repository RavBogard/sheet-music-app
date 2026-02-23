"use client"

import { AppNavigation } from "@/components/nav/AppNavigation"

/**
 * Setlist perform routes get the main app navigation bar,
 * unlike chart/PDF perform routes which stay minimal for stage use.
 */
export default function SetlistPerformLayout({
    children,
}: {
    children: React.ReactNode
}) {
    return (
        <>
            <AppNavigation />
            {children}
        </>
    )
}
