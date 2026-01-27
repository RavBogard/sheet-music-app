"use client"

import Link from "next/link"
import buildInfo from "@/build-info.json"

export function Footer() {
    return (
        <footer className="py-6 border-t border-zinc-800 mt-auto bg-zinc-950 text-center text-sm text-zinc-500">
            <div className="flex flex-col items-center gap-2">
                <p>
                    A project of <a href="https://danielbogard.com" target="_blank" rel="noopener noreferrer" className="text-zinc-400 hover:text-white transition-colors underline decoration-zinc-700 underline-offset-4">Rabbi Daniel Bogard</a>
                </p>
                <div className="flex items-center gap-2 text-xs text-zinc-600">
                    <span title={`Commit: ${buildInfo.commit}`}>v{buildInfo.version}</span>
                    <span>•</span>
                    <Link href="/changelog" className="hover:text-zinc-400 transition-colors">
                        Changelog
                    </Link>
                </div>
            </div>
        </footer>
    )
}
