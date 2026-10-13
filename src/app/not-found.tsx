import Link from "next/link"
import { getT } from "@/i18n/server"

export default async function NotFound() {
    const t = await getT()
    return (
        <div className="flex flex-col items-center justify-center min-h-screen bg-background text-foreground px-4">
            <div className="text-center space-y-4 max-w-md">
                <div className="text-6xl font-bold text-muted-foreground/30">404</div>
                <h1 className="text-2xl font-semibold">{t("shell.notFoundTitle")}</h1>
                <p className="text-muted-foreground">
                    {t("shell.notFoundBody")}
                </p>
                <Link
                    href="/"
                    className="inline-flex items-center justify-center rounded-lg bg-primary text-primary-foreground px-6 py-2.5 text-sm font-medium hover:bg-primary/90 transition-colors"
                >
                    {t("shell.backToHome")}
                </Link>
            </div>
        </div>
    )
}
