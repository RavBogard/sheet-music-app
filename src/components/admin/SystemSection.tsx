"use client"

import { CollapsibleSection } from "@/components/admin/CollapsibleSection"
import buildInfo from "@/build-info.json"
import { Wrench, Tag, GitCommit, RefreshCw } from "lucide-react"
import { useState } from "react"
import { useAuth } from "@/lib/auth-context"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"

export function SystemSection() {
    const { user } = useAuth()
    const [migrating, setMigrating] = useState(false)
    const [migrationResult, setMigrationResult] = useState<{ migrated: number; unchanged: number; details: Array<{ name: string; oldRole: string; newRole: string; soundEngineer?: boolean }> } | null>(null)

    const runRoleMigration = async () => {
        if (!user) return
        setMigrating(true)
        try {
            const token = await user.getIdToken()
            const res = await fetch("/api/admin/migrate-roles", {
                method: "POST",
                headers: { Authorization: `Bearer ${token}` },
            })
            const data = await res.json()
            if (!res.ok) throw new Error(data.error || "Migration failed")
            setMigrationResult(data)
            toast.success(`Migrated ${data.migrated} users`)
        } catch (e) {
            toast.error(e instanceof Error ? e.message : "Migration failed")
        } finally {
            setMigrating(false)
        }
    }

    return (
        <CollapsibleSection
            icon={<Wrench className="w-4 h-4 text-muted-foreground" />}
            title="System"
        >
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

                {/* Role Migration — one-time */}
                <div className="border-t border-border pt-4 space-y-2">
                    <h3 className="text-sm font-semibold flex items-center gap-2">
                        <RefreshCw className="w-3 h-3 text-amber-500" /> Role Migration
                    </h3>
                    <p className="text-xs text-muted-foreground">
                        Migrates old roles: leader → band_leader, member → musician. Safe to run multiple times.
                    </p>
                    <Button
                        size="sm"
                        variant="outline"
                        onClick={runRoleMigration}
                        disabled={migrating}
                        className="text-xs"
                    >
                        {migrating ? "Migrating…" : "Run Role Migration"}
                    </Button>
                    {migrationResult && (
                        <div className="text-xs space-y-1 bg-muted/50 rounded-lg p-3 border border-border">
                            <p className="font-medium">Migrated {migrationResult.migrated}, unchanged {migrationResult.unchanged}</p>
                            {migrationResult.details.map((d, i) => (
                                <p key={i} className="text-muted-foreground">
                                    {d.name}: {d.oldRole} → {d.newRole}{d.soundEngineer ? ' + 🎧' : ''}
                                </p>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </CollapsibleSection>
    )
}
