export default function SettingsLoading() {
    return (
        <div className="max-w-2xl mx-auto px-4 sm:px-6 py-6 animate-pulse">
            {/* Back button + title */}
            <div className="flex items-center gap-3 mb-8">
                <div className="h-8 w-8 bg-muted rounded-lg" />
                <div className="h-7 bg-muted rounded-lg w-24" />
            </div>

            {/* Profile section */}
            <div className="rounded-2xl border border-border bg-card p-6 mb-6">
                <div className="flex items-center gap-4 mb-4">
                    <div className="h-12 w-12 rounded-full bg-muted" />
                    <div className="space-y-2">
                        <div className="h-5 bg-muted rounded w-36" />
                        <div className="h-3 bg-muted rounded w-48" />
                    </div>
                </div>
            </div>

            {/* Musician profile section */}
            <div className="rounded-2xl border border-border bg-card p-6 mb-6">
                <div className="h-5 bg-muted rounded w-40 mb-4" />
                <div className="space-y-3">
                    <div className="h-10 bg-muted rounded-lg w-full" />
                    <div className="h-10 bg-muted rounded-lg w-full" />
                    <div className="h-8 bg-muted rounded-lg w-48" />
                </div>
            </div>

            {/* Admin cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {Array.from({ length: 4 }).map((_, i) => (
                    <div key={i} className="rounded-2xl border border-border bg-card p-5">
                        <div className="h-10 w-10 bg-muted rounded-xl mb-3" />
                        <div className="h-5 bg-muted rounded w-32 mb-2" />
                        <div className="h-3 bg-muted rounded w-48 mb-4" />
                        <div className="h-10 bg-muted rounded-xl w-full" />
                    </div>
                ))}
            </div>
        </div>
    )
}
