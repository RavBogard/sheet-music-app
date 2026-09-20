"use client"
import { Skeleton } from "@/components/ui/skeleton"
import { ROW_ESTIMATE_PX, ROW_GAP_PX, SKELETON_ROW_COUNT } from "./row-metrics"

/**
 * The library's loading state.
 *
 * Every row here is exactly `ROW_ESTIMATE_PX` tall — the same height the
 * virtualizer seeds real rows with — because this is what those rows replace.
 * It used to draw `p-6` cards about 90px tall against 64px real rows, so the
 * whole list moved the instant the store hydrated. See `row-metrics.ts`.
 *
 * The container is `max-w-3xl mx-auto` to match the real list's wrapper, so
 * the horizontal position does not move either.
 */
export function LibrarySkeleton() {
    return (
        <div className="flex-1 max-w-3xl mx-auto w-full pb-10">
            {Array.from({ length: SKELETON_ROW_COUNT }, (_, i) => (
                <div
                    key={i}
                    style={{
                        height: `${ROW_ESTIMATE_PX - ROW_GAP_PX}px`,
                        marginBottom: `${ROW_GAP_PX}px`,
                    }}
                    className="w-full flex items-center gap-3 px-3 rounded-xl bg-card border border-brand/10"
                >
                    <Skeleton className="h-8 w-8 shrink-0 rounded-lg" />
                    <div className="flex-1 min-w-0 space-y-1.5">
                        <Skeleton className="h-4 w-1/3" />
                        <Skeleton className="h-3 w-1/5" />
                    </div>
                </div>
            ))}
        </div>
    )
}
