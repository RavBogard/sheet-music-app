export default function Loading() {
    return (
        <div className="w-full max-w-[1080px] mx-auto px-4 md:px-6 pt-5 sm:pt-6 pb-10 animate-pulse">
            {/* Page title skeleton */}
            <div className="h-8 bg-muted rounded-lg w-48 mb-6" />

            {/* Content cards skeleton */}
            <div className="space-y-4">
                {Array.from({ length: 4 }).map((_, i) => (
                    <div key={i} className="rounded-lg border border-border bg-card p-4">
                        <div className="flex items-center gap-4">
                            <div className="h-10 w-10 rounded-full bg-muted shrink-0" />
                            <div className="flex-1 space-y-2">
                                <div className="h-4 bg-muted rounded w-3/4" />
                                <div className="h-3 bg-muted rounded w-1/2" />
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    )
}
