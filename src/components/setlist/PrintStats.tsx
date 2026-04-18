"use client"

interface PrintStatsProps {
    totalTracks: number
    linkedPdfCount: number
    activeTranspositions: number
    showTranspositions: boolean
    coverOnly?: boolean
}

export function PrintStats({
    totalTracks, linkedPdfCount, activeTranspositions, showTranspositions, coverOnly,
}: PrintStatsProps) {
    return (
        <div className="bg-muted rounded-lg p-3 text-sm space-y-1">
            <div className="flex justify-between">
                <span className="text-muted-foreground">Songs</span>
                <span className="font-medium">{totalTracks}</span>
            </div>
            {coverOnly ? (
                <div className="flex justify-between">
                    <span className="text-muted-foreground">Output</span>
                    <span className="font-medium text-blue-600 dark:text-blue-400">1 page (song list only)</span>
                </div>
            ) : (
                <>
                    <div className="flex justify-between">
                        <span className="text-muted-foreground">PDFs included</span>
                        <span className="font-medium text-green-600 dark:text-green-400">{linkedPdfCount}</span>
                    </div>
                    {showTranspositions && activeTranspositions > 0 && (
                        <div className="flex justify-between">
                            <span className="text-muted-foreground">Transposed</span>
                            <span className="font-medium text-violet-500">{activeTranspositions}</span>
                        </div>
                    )}
                    {linkedPdfCount < totalTracks && (
                        <p className="text-xs text-yellow-600 dark:text-yellow-400 mt-1">
                            {totalTracks - linkedPdfCount} song(s) without PDFs won&apos;t be included.
                        </p>
                    )}
                </>
            )}
        </div>
    )
}
