"use client"

import type { ComponentType, SVGProps } from "react"
import { useI18n } from "@/i18n/client"
import { cn } from "@/lib/utils"

/**
 * Phase 7: icons that point along the reading direction (back/forward arrows,
 * chevrons for next/previous, "open in panel" arrows) mirror on a
 * right-to-left page. Icons that depict a physical thing (play triangle,
 * clock, music note, refresh, download) do NOT flip.
 *
 *   <DirectionalIcon icon={ChevronRight} className="w-4 h-4" />
 *
 * The mirror class is added only when the page is rtl, so an English tenant's
 * markup is unchanged. (A CSS-only alternative is the `rtl:-scale-x-100`
 * utility; it adds the class to every tenant's DOM, so prefer this component.)
 */
export type IconComponent = ComponentType<SVGProps<SVGSVGElement> & { className?: string }>

export function useMirrorClass(): string | undefined {
    const { isRtl } = useI18n()
    return isRtl ? "-scale-x-100" : undefined
}

export function DirectionalIcon({
    icon: Icon,
    className,
    ...props
}: { icon: IconComponent; className?: string } & SVGProps<SVGSVGElement>) {
    const mirror = useMirrorClass()
    return <Icon {...props} className={mirror ? cn(className, mirror) : className} />
}
