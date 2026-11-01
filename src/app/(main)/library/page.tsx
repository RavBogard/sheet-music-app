import { headers } from "next/headers"
import { getServerUser } from "@/lib/server-auth"
import { getServerLibrary } from "@/lib/server-library"
import { coerceOrgId } from "@/lib/org/registry"
import { SongChartsLibrary } from "@/components/library/SongChartsLibrary"
import { getT } from "@/i18n/server"

export default async function LibraryPage() {
    const user = await getServerUser()
    const t = await getT()

    if (!user) {
        return (
            <div className="flex flex-col items-center justify-center h-[calc(100dvh-80px)] text-center p-6">
                <h2 className="text-xl font-semibold mb-3 text-foreground">{t("library.page.restrictedTitle")}</h2>
                <p className="text-muted-foreground mb-6 max-w-md text-sm">{t("library.page.restrictedBody")}</p>
            </div>
        )
    }

    if (!user.isMember) {
        return (
            <div className="flex flex-col items-center justify-center h-[calc(100dvh-80px)] text-center p-6">
                <h2 className="text-xl font-semibold mb-3 text-caution">{t("library.page.pendingTitle")}</h2>
                <p className="text-muted-foreground mb-6 max-w-md text-sm">
                    {t("library.page.pendingBody")}
                </p>
                <div className="px-4 py-2 bg-muted rounded-lg border border-border text-sm font-mono text-muted-foreground">
                    {t("library.page.uid", { uid: user.uid.slice(0, 8) })}
                </div>
            </div>
        )
    }

    // v11.1-03: host-isolate the library to the landing-page org (display-only;
    // direct chart access is never gated). CRC pool is 100% crc-stamped → no-op
    // for centralreform.live.
    const orgId = coerceOrgId((await headers()).get("x-org-id"))
    const { files } = await getServerLibrary(orgId)

    return <SongChartsLibrary initialLibrary={files as any} org={orgId} />
}
