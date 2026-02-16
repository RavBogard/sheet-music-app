export default function SetlistsLoading() {
    return (
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 animate-pulse">
            {/* Header area */}
            <div className="flex items-center justify-between mb-6">
                <div className="h-8 bg-muted rounded-lg w-32" />
                <div className="h-10 bg-muted rounded-lg w-32" />
            </div>

            {/* Tabs skeleton */}
            <div className="flex gap-4 mb-6">
                <div className="h-8 bg-muted rounded-lg w-24" />
                <div className="h-8 bg-muted rounded-lg w-24" />
                <div className="h-8 bg-muted rounded-lg w-24" />
            </div>

            {/* Setlist cards */}
            <div className="grid gap-3">
                {Array.from({ length: 6 }).map((_, i) => (
                    <div key={i} className="rounded-xl border border-border bg-card p-4">
                        <div className="flex items-center justify-between">
                            <div className="space-y-2 flex-1">
                                <div className="h-5 bg-muted rounded w-48" />
                                <div className="flex gap-3">
                                    <div className="h-3 bg-muted rounded w-24" />
                                    <div className="h-3 bg-muted rounded w-16" />
                                </div>
                            </div>
                            <div className="h-8 w-8 bg-muted rounded-lg shrink-0" />
                        </div>
                    </div>
                ))}
            </div>
        </div>
    )
}
