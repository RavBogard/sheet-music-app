"use client"

import { useState, useEffect, useMemo } from "react"
import { collection, query, orderBy, limit } from "firebase/firestore"
import { db } from "@/lib/firebase"
import { Shield, ArrowRight, Loader2 } from "lucide-react"
import { useSafeFirestoreSync } from "@/hooks/use-safe-firestore-sync"

interface AuditLog {
    id: string
    action: string
    targetUserId: string
    newRole: string
    previousRole: string
    actorUid: string
    actorEmail: string
    timestamp: any
}

export function AccessAuditLog() {
    const [logs, setLogs] = useState<AuditLog[]>([])
    const [loading, setLoading] = useState(true)

    const q = useMemo(() => query(
        collection(db, "auditLogs"),
        orderBy("timestamp", "desc"),
        limit(20) // Only show the last 20 actions
    ), [])

    const { data: rawLogs, loading: isLogsLoading, error: logsError } = useSafeFirestoreSync<any[]>(q as any)

    useEffect(() => {
        if (isLogsLoading) return

        if (logsError) {
            console.error("Audit log error:", logsError)
            setLoading(false)
            return
        }

        if (rawLogs) {
            const data = (rawLogs as any[]).map((doc: any) => ({ ...doc } as AuditLog))
            setLogs(data)
        }
        setLoading(false)
    }, [rawLogs, isLogsLoading, logsError])

    if (loading) return (
        <div className="flex justify-center p-8"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
    )

    return (
        <div className="bg-card border border-border rounded-xl p-5 space-y-4">
            {logs.length === 0 ? (
                <p className="text-sm text-muted-foreground p-4 text-center bg-muted/20 rounded-lg">No audit records found.</p>
            ) : (
                <div className="space-y-3">
                    {logs.map(log => {
                        const isPromotion = getRoleWeight(log.newRole) > getRoleWeight(log.previousRole)

                        return (
                            <div key={log.id} className="flex gap-4 p-3 rounded-lg bg-muted/10 border border-border/50 text-sm">
                                <div className="mt-0.5 shrink-0">
                                    <Shield className={`w-4 h-4 ${isPromotion ? 'text-emerald-500' : 'text-amber-500'}`} />
                                </div>
                                <div className="flex-1 space-y-1">
                                    <p className="text-foreground">
                                        <span className="font-semibold">{log.actorEmail.split('@')[0]}</span> changed role for user <code className="text-xs bg-muted px-1 py-0.5 rounded">{log.targetUserId.slice(-6)}</code>
                                    </p>
                                    <div className="flex items-center gap-2 text-xs font-mono text-muted-foreground">
                                        <span className="line-through opacity-70">{log.previousRole}</span>
                                        <ArrowRight className="w-3 h-3" />
                                        <span className={`font-medium ${isPromotion ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'}`}>
                                            {log.newRole}
                                        </span>
                                    </div>
                                    <p className="text-[10px] text-muted-foreground/60 uppercase">
                                        {log.timestamp?.toDate ? log.timestamp.toDate().toLocaleString() : 'Just now'}
                                    </p>
                                </div>
                            </div>
                        )
                    })}
                </div>
            )}
        </div>
    )
}

function getRoleWeight(role: string): number {
    const w: Record<string, number> = { admin: 4, band_leader: 3, leader: 3, musician: 2, member: 1, pending: 0 }
    return w[role] ?? -1
}
