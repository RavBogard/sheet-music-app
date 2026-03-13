import { getServerUser } from "@/lib/server-auth"
import { redirect } from "next/navigation"
import ManageClient from "./ManageClient"

export default async function ManagePage() {
    const user = await getServerUser()

    if (!user || !user.isBandLeader) {
        redirect("/setlists")
    }

    return <ManageClient serverIsAdmin={user.isAdmin} />
}
