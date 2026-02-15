export default function Loading() {
    return (
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 animate-pulse">
            {/* Page title skeleton */}
            <div className="h-8 bg-muted rounded-lg w-48 mb-6" />

            {/* Content cards skeleton */}
            <div className="space-y-4">
                {Array.from({ length: 4 }).map((_, i) => (
                    <div key={i} className="rounded-xl border border-border bg-card p-4">
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
