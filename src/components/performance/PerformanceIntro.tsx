"use client"

import { useState, useEffect } from "react"
import { ArrowLeft, ArrowRight, ArrowDown, Hand } from "lucide-react"
import { Button } from "@/components/ui/button"
import { DirectionalIcon } from "@/components/i18n/DirectionalIcon"
import { useI18n } from "@/i18n/client"

const STORAGE_KEY = "cr-perform-intro-seen"

export function PerformanceIntro({ onDismiss }: { onDismiss: () => void }) {
    const { t, isRtl } = useI18n()
    // Phase 7 ruling: song-to-song navigation follows the reading direction,
    // so on a right-to-left page the forward swipe is a swipe right. The
    // arrows mirror with the page (DirectionalIcon) and the gesture names swap.
    return (
        <div
            className="fixed inset-0 z-splash bg-black/80 backdrop-blur-sm flex items-center justify-center p-6"
            onClick={onDismiss}
        >
            <div className="max-w-xs space-y-6 text-center" onClick={e => e.stopPropagation()}>
                <h2 className="text-xl font-bold text-white">{t("perform.intro.title")}</h2>

                <div className="space-y-4">
                    <div className="flex items-center gap-4 text-zinc-300">
                        <div className="w-10 h-10 rounded-full bg-brand/15 flex items-center justify-center shrink-0">
                            <DirectionalIcon icon={ArrowLeft} className="w-5 h-5" />
                        </div>
                        <div className="text-start text-sm">
                            <span className="font-medium text-white">
                                {isRtl ? t("perform.intro.swipeRight") : t("perform.intro.swipeLeft")}
                            </span>{" "}
                            {t("perform.intro.forNextSong")}
                        </div>
                    </div>

                    <div className="flex items-center gap-4 text-zinc-300">
                        <div className="w-10 h-10 rounded-full bg-brand/15 flex items-center justify-center shrink-0">
                            <DirectionalIcon icon={ArrowRight} className="w-5 h-5" />
                        </div>
                        <div className="text-start text-sm">
                            <span className="font-medium text-white">
                                {isRtl ? t("perform.intro.swipeLeft") : t("perform.intro.swipeRight")}
                            </span>{" "}
                            {t("perform.intro.forPreviousSong")}
                        </div>
                    </div>

                    <div className="flex items-center gap-4 text-zinc-300">
                        <div className="w-10 h-10 rounded-full bg-brand/15 flex items-center justify-center shrink-0">
                            <Hand className="w-5 h-5" />
                        </div>
                        <div className="text-start text-sm">
                            <span className="font-medium text-white">{t("perform.intro.tapCenter")}</span>{" "}
                            {t("perform.intro.toToggleToolbar")}
                        </div>
                    </div>

                    <div className="flex items-center gap-4 text-zinc-300">
                        <div className="w-10 h-10 rounded-full bg-brand/15 flex items-center justify-center shrink-0">
                            <ArrowDown className="w-5 h-5" />
                        </div>
                        <div className="text-start text-sm">
                            <span className="font-medium text-white">{t("perform.intro.pullDown")}</span>{" "}
                            {t("perform.intro.toExit")}
                        </div>
                    </div>
                </div>

                <Button
                    variant="brand"
                    onClick={onDismiss}
                    className="w-full py-3 rounded-xl"
                >
                    {t("perform.intro.gotIt")}
                </Button>
            </div>
        </div>
    )
}

/**
 * Hook to manage one-time intro display.
 * Returns [showIntro, dismissIntro].
 */
export function usePerformanceIntro(): [boolean, () => void] {
    const [show, setShow] = useState(false)

    useEffect(() => {
        try {
            if (!localStorage.getItem(STORAGE_KEY)) {
                setShow(true)
            }
        } catch { /* SSR or no localStorage */ }
    }, [])

    const dismiss = () => {
        setShow(false)
        try { localStorage.setItem(STORAGE_KEY, "1") } catch { /* noop */ }
    }

    return [show, dismiss]
}
