"use client"

import { useState, ReactNode } from "react"
import { ChevronDown } from "lucide-react"
import { cn } from "@/lib/utils"

interface CollapsibleSectionProps {
    icon: ReactNode
    title: string
    badge?: ReactNode
    action?: ReactNode
    defaultOpen?: boolean
    children: ReactNode
}

export function CollapsibleSection({
    icon,
    title,
    badge,
    action,
    defaultOpen = false,
    children,
}: CollapsibleSectionProps) {
    const [isOpen, setIsOpen] = useState(defaultOpen)

    return (
        <section className="space-y-4">
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="w-full flex items-center gap-3 group cursor-pointer min-h-11"
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
            </button>

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
