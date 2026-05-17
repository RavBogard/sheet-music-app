import * as React from "react"
import { cn } from "@/lib/utils"

export type GlassSurfaceProps = React.HTMLAttributes<HTMLDivElement> & {
  as?: "div" | "section" | "article" | "aside" | "header" | "footer" | "nav"
}

/**
 * GlassSurface — v2 base surface primitive.
 * Wraps content in the glass-v2 utility (backdrop-blur 24px + saturate(140%)
 * + deep shadow + 1px tinted border). Use directly when you need a glass
 * panel without card padding; otherwise prefer GlassCard.
 */
export const GlassSurface = React.forwardRef<HTMLDivElement, GlassSurfaceProps>(
  function GlassSurface({ as = "div", className, ...rest }, ref) {
    const Tag = as as "div"
    return <Tag ref={ref} className={cn("glass-v2", className)} {...rest} />
  }
)
