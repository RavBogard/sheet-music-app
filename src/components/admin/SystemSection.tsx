"use client"

import { CollapsibleSection } from "@/components/admin/CollapsibleSection"
import buildInfo from "@/build-info.json"
import { Wrench, Tag, GitCommit } from "lucide-react"
import { useAuth } from "@/lib/auth-context"
import { GlobalAlertCard } from "./system/GlobalAlertCard"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"

export function SystemSection() {
    const { user } = useAuth()

    return (
        <CollapsibleSection
            icon={<Wrench className="w-4 h-4 text-muted-foreground" />}
            title="System"
        >
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <GlobalAlertCard />
                <div className="bg-card border border-border rounded-xl p-5 space-y-4">
                    <div className="flex items-center gap-3">
                        <Tag className="h-4 w-4 text-blue-400" />
                        <span className="font-mono text-sm text-blue-400 bg-blue-400/10 px-2 py-0.5 rounded">v{buildInfo.version}</span>
                        <span className="text-xs text-muted-foreground">Built {buildInfo.buildDate} · {buildInfo.commit?.slice(0, 7)}</span>
                    </div>
                    <div className="space-y-2">
                        <h3 className="text-sm font-semibold flex items-center gap-2">
                            <GitCommit className="w-3 h-3 text-muted-foreground" /> Recent Changes
                        </h3>
                        <div className="space-y-1 max-h-48 overflow-y-auto">
                            {(buildInfo.changelog as string[]).map((log, i) => {
                                const parts = log.match(/^([^ ]+) - (.*)$/)
                                return (
                                    <div key={i} className="text-xs text-muted-foreground py-1 border-b border-border/50 last:border-0">
                                        {parts ? (<><span className="font-mono text-muted-foreground/60">{parts[1]}</span> <span className="text-foreground/80">{parts[2]}</span></>) : log}
                                    </div>
                                )
                            })}
                        </div>
                    </div>

                </div>
            </div>
        </CollapsibleSection>
    )
}
