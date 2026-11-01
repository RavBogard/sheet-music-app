import { notFound } from "next/navigation"
import { requestOrg } from "@/lib/org/request-org"
import { DEFAULT_ORG_ID } from "@/lib/org/registry"

/**
 * /help is CRC's: the guides describe CRC's iPads, studio PC and sound desk.
 * Every other tenant (Brothers Lazaroff included) gets a 404, the way
 * /monitor does. The routes are public (src/proxy.ts); nothing secret is in them.
 */
export default async function HelpLayout({ children }: { children: React.ReactNode }) {
    const { orgId } = await requestOrg()
    if (orgId !== DEFAULT_ORG_ID) notFound()
    return <>{children}</>
}
