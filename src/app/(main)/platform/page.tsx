import { TenantsList } from "@/components/platform/TenantsList"
import { requirePlatformOwner } from "./gate"

export default async function PlatformPage() {
    await requirePlatformOwner()
    return <TenantsList />
}
