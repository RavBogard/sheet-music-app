export default function MonitorLoading() {
    return (
        <div className="w-full max-w-[1080px] mx-auto px-4 md:px-6 pt-5 sm:pt-6 pb-10 animate-pulse">
            <div className="flex items-center justify-between mb-6">
                <div className="h-8 w-32 bg-muted rounded-lg" />
                <div className="h-4 w-24 bg-muted rounded-lg" />
            </div>

            {/* Master fader skeleton */}
            <div className="bg-card border border-border rounded-lg p-4 mb-4">
                <div className="flex items-center gap-3">
                    <div className="h-5 w-20 bg-muted rounded" />
                    <div className="flex-1 h-6 bg-muted rounded-full" />
                    <div className="h-4 w-10 bg-muted rounded" />
                </div>
            </div>

            {/* Channel fader skeletons */}
            <div className="bg-card border border-border rounded-lg p-4 space-y-3">
                <div className="h-4 w-16 bg-muted rounded" />
                {[1, 2, 3, 4, 5].map(i => (
                    <div key={i} className="flex items-center gap-3">
                        <div className="h-4 w-4 bg-muted rounded" />
                        <div className="h-4 w-24 bg-muted rounded" />
                        <div className="flex-1 h-6 bg-muted rounded-full" />
                        <div className="h-4 w-10 bg-muted rounded" />
                    </div>
                ))}
            </div>
        </div>
    )
}
