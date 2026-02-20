import { getServerUser } from "@/lib/server-auth"
import { getServerLibrary } from "@/lib/server-library"
import { SongChartsLibrary } from "@/components/library/SongChartsLibrary"

export default async function LibraryPage() {
    const user = await getServerUser()

    if (!user) {
        return (
            <div className="flex flex-col items-center justify-center h-[calc(100vh-80px)] text-center p-6">
                <h2 className="text-xl font-semibold mb-3 text-foreground">Restricted Access</h2>
                <p className="text-muted-foreground mb-6 max-w-md text-sm">The full song library is available only to signed-in users.</p>
            </div>
        )
    }

    if (!user.isMember) {
        return (
            <div className="flex flex-col items-center justify-center h-[calc(100vh-80px)] text-center p-6">
                <h2 className="text-xl font-semibold mb-3 text-yellow-600 dark:text-yellow-500">Account Pending</h2>
                <p className="text-muted-foreground mb-6 max-w-md text-sm">
                    Your account is being verified. You can view public setlists while you wait.
                </p>
                <div className="px-4 py-2 bg-muted rounded-lg border border-border text-sm font-mono text-muted-foreground">
                    UID: {user.uid.slice(0, 8)}...
                </div>
            </div>
        )
    }

    const { files } = await getServerLibrary()

    return <SongChartsLibrary initialLibrary={files as any} />
}
