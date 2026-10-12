import type { Metadata } from "next"
import { UnauthorizedState } from "@/components/ui/unauthorized-state"
import { requestOrg } from "@/lib/org/request-org"
import { orgString } from "@/lib/org/strings"

// Multi-tenant phase 1: tenant title (BL frozen to the CRC text).
export async function generateMetadata(): Promise<Metadata> {
    return { title: orgString((await requestOrg()).orgId, "page.unauthorizedTitle") }
}

export default function UnauthorizedPage() {
    return (
        <div className="flex flex-col items-center justify-center min-h-[calc(100vh-4rem)] p-4 text-center">
            <UnauthorizedState />
        </div>
    )
}
