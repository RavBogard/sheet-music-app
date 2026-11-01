"use client"

import { loadSentryBrowser } from "@/lib/sentry-lazy"
import { useEffect } from "react"
import { useT } from "@/i18n/client"

export default function GlobalError({
    error,
    reset,
}: {
    error: Error & { digest?: string }
    reset: () => void
}) {
    // Renders outside the root layout's providers (its own <html>): useT()
    // falls back to English here, which is acceptable for this last resort.
    const t = useT()
    useEffect(() => {
        // Perf audit P2-6: the trimmed client, loaded (and started) on demand.
        void loadSentryBrowser()?.then((s) => s.captureException(error)).catch(() => {})
    }, [error])

    return (
        <html>
            <body>
                <div style={{ padding: "2rem", textAlign: "center" }}>
                    <h2>{t("shell.somethingWentWrong")}</h2>
                    <button onClick={() => reset()} style={{ marginTop: "1rem", padding: "0.5rem 1rem" }}>
                        {t("shell.tryAgain")}
                    </button>
                </div>
            </body>
        </html>
    )
}
