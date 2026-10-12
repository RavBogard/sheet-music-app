import { ActivityLog } from "@/components/platform/ActivityLog"
import { requirePlatformOwner } from "../gate"

export default async function PlatformActivityPage() {
    await requirePlatformOwner()
    return <ActivityLog />
}
