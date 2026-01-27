"use client"

import { useRouter } from "next/navigation"
import { ChevronLeft, GitCommit, Calendar, Tag } from "lucide-react"
import { Button } from "@/components/ui/button"
import buildInfo from "@/build-info.json"

export default function ChangelogPage() {
    const router = useRouter()

    return (
        <div className="min-h-screen bg-zinc-950 text-white p-6">
            <div className="max-w-2xl mx-auto space-y-8">
                {/* Header */}
                <div className="flex items-center gap-4">
                    <Button size="icon" variant="ghost" className="h-10 w-10 -ml-2" onClick={() => router.back()}>
                        <ChevronLeft className="h-6 w-6" />
                    </Button>
                    <div>
                        <h1 className="text-3xl font-bold">Changelog</h1>
                        <p className="text-zinc-500">Version History & Updates</p>
                    </div>
                </div>

                {/* Current Version Card */}
                <div className="bg-zinc-900 rounded-xl p-6 border border-zinc-800">
                    <div className="flex items-center gap-2 mb-4">
                        <Tag className="h-5 w-5 text-blue-400" />
                        <span className="font-mono text-sm text-blue-400 bg-blue-400/10 px-2 py-1 rounded">
                            {buildInfo.version}
                        </span>
                    </div>
                    <div className="flex items-center gap-2 text-zinc-400 text-sm">
                        <Calendar className="h-4 w-4" />
                        <span>Built on {buildInfo.buildDate}</span>
                    </div>
                </div>

                {/* Recent Commits */}
                <div className="space-y-4">
                    <h2 className="text-xl font-semibold flex items-center gap-2">
                        <GitCommit className="h-5 w-5 text-zinc-500" />
                        Recent Changes
                    </h2>
                    <div className="space-y-4">
                        {buildInfo.changelog.map((log, i) => {
                            // "hash - message (time)"
                            // Let's try to parse it specifically if we want, but displaying raw is fine for now
                            const parts = log.match(/^([a-f0-9]+) - (.*) \((.*)\)$/)
                            if (parts) {
                                return (
                                    <div key={i} className="flex gap-4 p-4 rounded-lg bg-zinc-900/50 border border-zinc-800/50">
                                        <div className="font-mono text-xs text-zinc-500 pt-1 shrink-0">
                                            {parts[1]}
                                        </div>
                                        <div className="flex-1">
                                            <p className="text-zinc-200 text-sm leading-relaxed">{parts[2]}</p>
                                            <p className="text-xs text-zinc-600 mt-1">{parts[3]}</p>
                                        </div>
                                    </div>
                                )
                            }
                            // Fallback
                            return (
                                <div key={i} className="p-4 rounded-lg bg-zinc-900/50 border border-zinc-800/50 text-sm text-zinc-300">
                                    {log}
                                </div>
                            )
                        })}
                    </div>
                </div>
            </div>
        </div>
    )
}
