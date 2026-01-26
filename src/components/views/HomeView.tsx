"use client"

import { Button } from "@/components/ui/button"
import { Music2, Loader2, FileMusic, ListMusic, Headphones, PlayCircle } from "lucide-react"

interface HomeViewProps {
    driveFiles: any[]
    loadingFiles: boolean
    onSync: () => void
    onChangeView: (view: any) => void
    fileUrl: string | null
    onResume: () => void
}

export function HomeView({ driveFiles, loadingFiles, onSync, onChangeView, fileUrl, onResume }: HomeViewProps) {
    return (
        <div className="h-screen flex flex-col bg-zinc-950 text-white p-6 gap-6">
            <header className="flex justify-between items-center">
                <div className="flex items-center gap-3">
                    <div className="bg-primary h-10 w-10 rounded-full flex items-center justify-center">
                        <Music2 className="text-black h-6 w-6" />
                    </div>
                    <h1 className="text-2xl font-bold">CRC Music Books</h1>
                </div>
                <Button variant="outline" size="lg" onClick={onSync}>
                    {loadingFiles ? <Loader2 className="animate-spin mr-2" /> : null} Sync Drive
                </Button>
            </header>

            <div className="flex-1 grid grid-cols-1 md:grid-cols-3 gap-6">
                {/* Song Charts */}
                <button
                    onClick={() => onChangeView('song_charts')}
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
                    onClick={() => onChangeView('setlist_dashboard')}
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
                    onClick={() => onChangeView('audio')}
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
                <Button size="lg" className="h-20 text-xl" onClick={onResume}>
                    Resume Performance <PlayCircle className="ml-2 h-6 w-6" />
                </Button>
            )}
        </div>
    )
}
