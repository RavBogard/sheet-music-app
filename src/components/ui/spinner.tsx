import { Loader2 } from "lucide-react"
import { cn } from "@/lib/utils"

interface SpinnerProps extends React.SVGProps<SVGSVGElement> {
    size?: "sm" | "default" | "lg" | "xl"
}

export function Spinner({ className, size = "default", ...props }: SpinnerProps) {
    const sizeClasses = {
        sm: "w-3 h-3",
        default: "w-4 h-4",
        lg: "w-6 h-6",
        xl: "w-8 h-8",
    }

    return (
        <Loader2
            className={cn("animate-spin text-muted-foreground", sizeClasses[size], className)}
            {...props}
        />
    )
}
