"use client"

import type { ComponentPropsWithoutRef } from "react"
import { useI18n } from "@/i18n/client"

/**
 * Phase 7 rule: chart content keeps its own direction.
 *
 * A chord chart is left-to-right music: chord symbols sit over syllables by
 * column, systems run left to right, and a PDF/MusicXML/image page has its own
 * layout. On a right-to-left page none of that may flip. Every chart renderer
 * marks its content box `dir="ltr"` — but only when the page is rtl, so an
 * English tenant's DOM is exactly what it was.
 *
 * Applied (phase 7 infra) at: PDFViewer (the [data-pdf-scroll] scroller),
 * TextScoreViewer (the monospace chord/lyric block), SmartScoreViewer (the
 * OSMD container), ImageScoreViewer (the [data-image-scroll] scroller).
 * New chart surfaces use <ChartContent> or spread useChartContentDir().
 *
 * Note: Tailwind's `rtl:` variant matches `[dir="rtl"] *`, i.e. it still fires
 * INSIDE a dir="ltr" chart box. Do not use `rtl:` utilities inside chart
 * content; logical utilities (ms-/ps-/text-start) follow the box's own dir.
 */
export function useChartContentDir(): { dir?: "ltr" } {
    const { isRtl } = useI18n()
    return isRtl ? { dir: "ltr" } : {}
}

export function ChartContent(props: ComponentPropsWithoutRef<"div">) {
    const dirProps = useChartContentDir()
    return <div {...props} {...dirProps} />
}
