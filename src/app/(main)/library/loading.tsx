export default function LibraryLoading() {
    return (
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 animate-pulse">
            {/* Search bar skeleton */}
            <div className="h-10 bg-muted rounded-lg w-full max-w-md mb-6" />

            {/* Breadcrumb skeleton */}
            <div className="flex gap-2 mb-4">
                <div className="h-5 bg-muted rounded w-16" />
                <div className="h-5 bg-muted rounded w-4" />
                <div className="h-5 bg-muted rounded w-24" />
            </div>

            {/* File grid skeleton */}
            <div className="grid gap-2">
                {Array.from({ length: 12 }).map((_, i) => (
                    <div key={i} className="rounded-lg border border-border bg-card p-3 flex items-center gap-3">
                        <div className="h-8 w-8 rounded bg-muted shrink-0" />
                        <div className="h-4 bg-muted rounded flex-1 max-w-xs" />
                        <div className="h-3 bg-muted rounded w-16 ml-auto" />
                    </div>
                ))}
            </div>
        </div>
    )
}
