"use client"

import { useT } from "@/i18n/client"

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
    const t = useT()
    return (
        <div className="bg-muted rounded-lg p-3 text-sm space-y-1">
            <div className="flex justify-between">
                <span className="text-muted-foreground">{t("setlistPrint.statSongs")}</span>
                <span className="font-medium">{totalTracks}</span>
            </div>
            {coverOnly ? (
                <div className="flex justify-between">
                    <span className="text-muted-foreground">{t("setlistPrint.statOutput")}</span>
                    <span className="font-medium text-brand">{t("setlistPrint.statOutputCoverOnly")}</span>
                </div>
            ) : (
                <>
                    <div className="flex justify-between">
                        <span className="text-muted-foreground">{t("setlistPrint.statPdfsIncluded")}</span>
                        <span className="font-medium text-success">{linkedPdfCount}</span>
                    </div>
                    {showTranspositions && activeTranspositions > 0 && (
                        <div className="flex justify-between">
                            <span className="text-muted-foreground">{t("setlistPrint.statTransposed")}</span>
                            <span className="font-medium text-brand">{activeTranspositions}</span>
                        </div>
                    )}
                    {linkedPdfCount < totalTracks && (
                        <p className="text-xs text-caution mt-1">
                            {t("setlistPrint.songsWithoutPdfs", { count: totalTracks - linkedPdfCount })}
                        </p>
                    )}
                </>
            )}
        </div>
    )
}
