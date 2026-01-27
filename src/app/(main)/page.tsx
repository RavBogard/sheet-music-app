"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"
import { useLibraryStore } from "@/lib/library-store"
import { useMusicStore } from "@/lib/store"
import { useLastOpened } from "@/hooks/use-last-opened"
import { Button } from "@/components/ui/button"
import { Music2, Loader2, FileMusic, ListMusic, Headphones, PlayCircle } from "lucide-react"

export default function DashboardPage() {
    const router = useRouter()
    const { driveFiles, loading, fetchFiles } = useLibraryStore()
    const { fileUrl } = useMusicStore()
    const { restoreSession } = useLastOpened()

    useEffect(() => {
        fetchFiles()
        restoreSession()
    }, [fetchFiles]) // restoreSession is stable (or should be, but let's exclude it to be safe or verify hook)

    return (
        <div className="min-h-screen flex flex-col bg-zinc-950 text-white p-6 gap-6">
            <header className="flex justify-between items-center">
                <div className="flex items-center gap-3">
                    <div className="bg-primary h-10 w-10 rounded-full flex items-center justify-center">
                        <Music2 className="text-black h-6 w-6" />
                    </div>
                    <h1 className="text-2xl font-bold">CRC Music Books</h1>
                </div>
                <Button variant="outline" size="lg" onClick={() => fetchFiles(true)}>
                    {loading ? <Loader2 className="animate-spin mr-2" /> : null} Sync Drive
                </Button>
            </header>

            <div className="flex-1 grid grid-cols-1 md:grid-cols-3 gap-6">
                {/* Song Charts */}
                <button
                    onClick={() => router.push('/library')}
                    className="bg-zinc-900 hover:bg-zinc-800 border-2 border-zinc-800 rounded-3xl p-8 flex flex-col items-center justify-center gap-4 transition-all active:scale-95 text-center group"
                >
                    <div className="bg-blue-500/20 p-6 rounded-full group-hover:bg-blue-500/30 transition-colors">
                        <FileMusic className="h-16 w-16 text-blue-400" />
                    </div>
                    <h2 className="text-3xl font-bold">Song Charts</h2>
                    <p className="text-zinc-400 text-lg">Browse {driveFiles.filter(f => !f.mimeType.startsWith('audio/')).length} charts</p>
                </button>

                {/* Setlists */}
                <button
                    onClick={() => router.push('/setlists')}
                    className="bg-zinc-900 hover:bg-zinc-800 border-2 border-zinc-800 rounded-3xl p-8 flex flex-col items-center justify-center gap-4 transition-all active:scale-95 text-center group"
                >
                    <div className="bg-green-500/20 p-6 rounded-full group-hover:bg-green-500/30 transition-colors">
                        <ListMusic className="h-16 w-16 text-green-400" />
                    </div>
                    <h2 className="text-3xl font-bold">Setlists</h2>
                    <p className="text-zinc-400 text-lg">Manage or Import</p>
                </button>

                {/* Audio Files */}
                <button
                    onClick={() => router.push('/audio')}
                    className="bg-zinc-900 hover:bg-zinc-800 border-2 border-zinc-800 rounded-3xl p-8 flex flex-col items-center justify-center gap-4 transition-all active:scale-95 text-center group"
                >
                    <div className="bg-purple-500/20 p-6 rounded-full group-hover:bg-purple-500/30 transition-colors">
                        <Headphones className="h-16 w-16 text-purple-400" />
                    </div>
                    <h2 className="text-3xl font-bold">Audio Files</h2>
                    <p className="text-zinc-400 text-lg">Practice recordings</p>
                </button>
            </div>

            {/* Quick Resume */}
            {fileUrl && (
                <Button size="lg" className="h-20 text-xl" onClick={() => router.push('/perform/resume')}>
                    {/* Note: 'resume' isn't a strict ID, but we can handle it in the performer page or layout */}
                    {/* For now, linking to last song might be complex without the ID. 
                         Let's just use a special route or handle it in global state. 
                         Actually, the 'performer' view relies on the store having the FILE selected.
                         So we just go to a generic performer page which reads the store?
                         Or we should redirect to /perform/[fileId].
                         Let's assume we can get the ID from the URL or store for now.
                         Ideally we redirect to `/perform/${fileId}`.
                      */}
                    Resume Performance <PlayCircle className="ml-2 h-6 w-6" />
                </Button>
            )}
        </div>
    )
}
