import * as React from "react"
import { cn } from "@/lib/utils"
import { cva, type VariantProps } from "class-variance-authority"

const textareaVariants = cva(
    "flex min-h-[80px] w-full rounded-md border text-sm ring-offset-zinc-950 placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50 disabled:cursor-not-allowed disabled:opacity-50 text-foreground",
    {
        variants: {
            variant: {
                default: "border-border bg-card px-3 py-2",
                setlist: "bg-muted/50 border-0 px-3 py-2",
            }
        },
        defaultVariants: {
            variant: "default"
        }
    }
)

export interface TextareaProps
    extends React.TextareaHTMLAttributes<HTMLTextAreaElement>,
    VariantProps<typeof textareaVariants> { }

const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
    ({ className, variant, ...props }, ref) => {
        return (
            <textarea
                className={cn(textareaVariants({ variant }), className)}
                ref={ref}
                {...props}
            />
        )
    }
)
Textarea.displayName = "Textarea"

export { Textarea, textareaVariants }
