import * as React from "react"
import { cn } from "@/lib/utils"
import { cva, type VariantProps } from "class-variance-authority"

const inputVariants = cva(
    "flex h-10 w-full rounded-md border text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-brand/30 disabled:cursor-not-allowed disabled:opacity-50 transition-colors duration-200",
    {
        variants: {
            variant: {
                default: "border-border bg-muted px-3 py-2 text-foreground",
                setlist: "bg-muted/50 border-0 px-3 py-2 text-foreground",
            }
        },
        defaultVariants: {
            variant: "default"
        }
    }
)

export interface InputProps
    extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "size">,
    VariantProps<typeof inputVariants> { }

/**
 * WCAG 3.3.2 / 1.3.1 — every form control needs a programmatically associated
 * label. Placeholder text is NOT a label: screen readers only announce it as a
 * hint, and once the user types, the visual cue is gone too. The cycle-3.5
 * cowork sweep flagged 6 placeholder-as-label inputs across /library +
 * /manage/library-review; the dev-mode warning below catches new ones.
 *
 * An input is considered labeled if any of these are present:
 *   - aria-label / aria-labelledby
 *   - title attribute
 *   - id paired with a <label htmlFor={id}> elsewhere in the tree (we trust
 *     this without verifying — too expensive to walk parents)
 *
 * Without id we can't prove a wrapping <label> exists. The convention in this
 * repo is to add aria-label directly on the Input, so the warning fires when
 * none of the above are set AND no id is provided.
 */
const Input = React.forwardRef<HTMLInputElement, InputProps>(
    ({ className, variant, type, ...props }, ref) => {
        if (
            process.env.NODE_ENV !== "production" &&
            props.placeholder &&
            !props["aria-label"] &&
            !props["aria-labelledby"] &&
            !props.title &&
            !props.id
        ) {
            console.warn(
                "[Input] input has a placeholder but no accessible name. Add `aria-label`, " +
                    "`aria-labelledby`, `title`, OR wrap with a <label htmlFor> matching `id`. " +
                    "Placeholder is NOT a label (WCAG 3.3.2 — see .coord/inbox/cycle35-a11y-sweep.md P2-014). " +
                    `placeholder=${JSON.stringify(props.placeholder)}`,
            )
        }
        return (
            <input
                type={type}
                className={cn(inputVariants({ variant }), className)}
                ref={ref}
                {...props}
            />
        )
    }
)
Input.displayName = "Input"

export { Input, inputVariants }
