import * as React from "react"
import { cn } from "@/lib/utils"
import { GlassSurface, type GlassSurfaceProps } from "./glass-surface"

export type GlassCardProps = GlassSurfaceProps

/**
 * GlassCard — GlassSurface + sensible padding + rounded corners.
 * Pass `className="p-0"` to opt out of padding (useful when wrapping a
 * DenseList that owns its own edge insets).
 */
export const GlassCard = React.forwardRef<HTMLDivElement, GlassCardProps>(
  function GlassCard({ className, ...rest }, ref) {
    return <GlassSurface ref={ref} className={cn("p-5", className)} {...rest} />
  }
)
