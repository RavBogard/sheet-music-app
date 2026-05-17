import * as React from "react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

export type V2ButtonProps = React.ComponentProps<typeof Button> & {
  /** Use the v2 amber accent instead of the v1 indigo brand. */
  accent?: boolean
}

/**
 * V2Button — thin wrapper around shadcn/ui Button.
 * - `accent` prop swaps the brand fill for the v2 amber accent.
 * - All other props pass through unchanged. v1 Button stays the source of
 *   truth for variant/size/disabled/loading.
 */
export function V2Button({ accent, className, ...rest }: V2ButtonProps) {
  return (
    <Button
      className={cn(
        accent && "bg-amber-500 text-amber-950 hover:bg-amber-400 focus-visible:ring-amber-400/50",
        className
      )}
      {...rest}
    />
  )
}
