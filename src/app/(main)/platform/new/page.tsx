import { NewTenantForm } from "@/components/platform/NewTenantForm"
import { requirePlatformOwner } from "../gate"

export default async function NewTenantPage() {
    await requirePlatformOwner()
    return <NewTenantForm />
}
