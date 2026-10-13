"use client"

import Link from "next/link"
import { Button } from "@/components/ui/button"
import { useT } from "@/i18n/client"

export default function SetlistEditorError({
    _error,
    reset,
}: {
    _error: Error & { digest?: string }
    reset: () => void
}) {
    const t = useT()
    return (
        <div className="h-[100dvh] flex flex-col items-center justify-center gap-4 px-6 text-center">
            <div className="text-4xl">😬</div>
            <h2 className="text-xl font-semibold">{t("setlist.editorErrorTitle")}</h2>
            <p className="text-muted-foreground max-w-sm">
                {t("setlist.editorErrorBody")}
            </p>
            <div className="flex gap-3">
                <Button asChild variant="outline">
                    <Link href="/setlists">{t("setlist.backToDashboard")}</Link>
                </Button>
                <Button onClick={reset}>
                    {t("setlist.tryAgain")}
                </Button>
            </div>
        </div>
    )
}
