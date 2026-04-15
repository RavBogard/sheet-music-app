"use client"

import { useCallback, useState, ReactNode } from "react"
import { ChevronDown } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

interface CollapsibleSectionProps {
    icon: ReactNode
    title: string
    badge?: ReactNode
    action?: ReactNode
    defaultOpen?: boolean
    /**
     * When provided, the section's open/closed state is persisted to
     * localStorage under `crc.collapse.<storageKey>` so it survives
     * page navigations. Omit for in-memory (non-persistent) behavior.
     */
    storageKey?: string
    children: ReactNode
}

const STORAGE_PREFIX = "crc.collapse."

export function CollapsibleSection({
    icon,
    title,
    badge,
    action,
    defaultOpen = false,
    storageKey,
    children,
}: CollapsibleSectionProps) {
    const [isOpen, setIsOpenState] = useState<boolean>(() => {
        if (!storageKey) return defaultOpen
        if (typeof window === "undefined") return defaultOpen
        try {
            const raw = window.localStorage.getItem(STORAGE_PREFIX + storageKey)
            if (raw === "1") return true
            if (raw === "0") return false
        } catch {
            // localStorage may throw in private mode / restricted contexts;
            // fall back to defaultOpen.
        }
        return defaultOpen
    })

    const setIsOpen = useCallback((next: boolean) => {
        setIsOpenState(next)
        if (storageKey && typeof window !== "undefined") {
            try {
                window.localStorage.setItem(STORAGE_PREFIX + storageKey, next ? "1" : "0")
            } catch {
                // ignore — persistence is a nice-to-have, not load-bearing.
            }
        }
    }, [storageKey])

    return (
        <section className="space-y-4">
            <Button
                variant="ghost"
                onClick={() => setIsOpen(!isOpen)}
                className="w-full h-auto min-h-11 px-0 hover:bg-transparent group active:scale-100"
            >
                <div className="flex items-center gap-2 flex-1 min-w-0">
                    {icon}
                    <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                        {title}
                    </h2>
                    {badge}
                    <ChevronDown
                        className={cn(
                            "w-5 h-5 text-muted-foreground/50 transition-transform duration-200",
                            isOpen && "rotate-180"
                        )}
                    />
                </div>
                {/* Prevent action button from toggling collapse */}
                {action && (
                    <div onClick={(e) => e.stopPropagation()}>
                        {action}
                    </div>
                )}
            </Button>

            <div
                className={cn(
                    "transition-all duration-200 overflow-hidden",
                    isOpen ? "max-h-[5000px] opacity-100" : "max-h-0 opacity-0"
                )}
            >
                {children}
            </div>
        </section>
    )
}
