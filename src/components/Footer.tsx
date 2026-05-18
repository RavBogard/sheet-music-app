"use client"

import Link from "next/link"
import buildInfo from "@/build-info.json"
import { V2BetaOptInLink } from "@/components/v2/v2-beta-toggle"

export function Footer() {
    return (
        <footer className="py-6 border-t border-border mt-auto bg-background text-center text-sm text-muted-foreground">
            <div className="flex flex-col items-center gap-2">
                <p>
                    A project of <a href="https://danielbogard.com" target="_blank" rel="noopener noreferrer" className="text-foreground/70 hover:text-foreground transition-colors underline decoration-border underline-offset-4">Rabbi Daniel Bogard</a>
                </p>
                <div className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                    <span title={`Commit: ${buildInfo.commit}`}>v{buildInfo.version}</span>
                    <span aria-hidden="true">•</span>
                    <Link href="/changelog" className="hover:text-foreground transition-colors">
                        Changelog
                    </Link>
                    <span aria-hidden="true">•</span>
                    <Link href="/privacy" className="hover:text-foreground transition-colors">
                        Privacy
                    </Link>
                    <span aria-hidden="true">•</span>
                    <Link href="/terms" className="hover:text-foreground transition-colors">
                        Terms
                    </Link>
                    <span aria-hidden="true">•</span>
                    <Link href="/accessibility" className="hover:text-foreground transition-colors">
                        Accessibility
                    </Link>
                </div>
                <V2BetaOptInLink className="mt-1" />
            </div>
        </footer>
    )
}
