import "server-only"
import { notFound } from "next/navigation"
import { getServerUser, type ServerUser } from "@/lib/server-auth"

/**
 * Multi-tenant phase 4: /platform is the platform owner's alone. Checked on
 * the server for every page (not only the layout, which can render alongside
 * a page). Anyone else, signed in or not, gets a plain 404: the console's
 * existence is not advertised.
 */
export async function requirePlatformOwner(): Promise<ServerUser> {
    const user = await getServerUser()
    if (!user?.po) notFound()
    return user
}
