import { notFound } from "next/navigation"
import { OrgIdSchema } from "@/lib/org/config-schema"
import { TenantPage } from "@/components/platform/TenantPage"
import { requirePlatformOwner } from "../../gate"

export default async function PlatformTenantPage({ params }: { params: Promise<{ orgId: string }> }) {
    await requirePlatformOwner()
    const { orgId } = await params
    const id = decodeURIComponent(orgId)
    if (!OrgIdSchema.safeParse(id).success) notFound()
    return <TenantPage orgId={id} />
}
