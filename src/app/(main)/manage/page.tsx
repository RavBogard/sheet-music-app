import { getServerUser } from "@/lib/server-auth"
import { redirect } from "next/navigation"
import ManageClient from "./ManageClient"

export default async function ManagePage({
    searchParams,
}: {
    searchParams: Promise<{ notice?: string }>
}) {
    const user = await getServerUser()

    if (!user || !user.isBandLeader) {
        redirect("/setlists")
    }

    const { notice } = await searchParams

    return <ManageClient serverIsAdmin={user.isAdmin} adminOnlyNotice={notice === "admin-only"} />
}
