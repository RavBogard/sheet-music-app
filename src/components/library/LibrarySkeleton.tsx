"use client"
import { Skeleton } from "@/components/ui/skeleton"

export function LibrarySkeleton() {
    return (
        <div className="flex-1 p-4 grid grid-cols-1 gap-2 max-w-3xl mx-auto w-full">
            {[1, 2, 3, 4, 5, 6].map((i) => (
                <div key={i} className="w-full text-left p-4 rounded-xl flex items-center gap-4 bg-zinc-900 border border-zinc-800">
                    <Skeleton className="h-8 w-8 rounded-full" /> {/* Icon */}
                    <div className="flex-1 min-w-0 space-y-2">
                        <Skeleton className="h-5 w-3/4" />     {/* Title */}
                    </div>
                </div>
            ))}
        </div>
    )
}
